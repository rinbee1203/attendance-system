const crypto = require("crypto");
const https  = require("https");
const User   = require("../models/User");

const sendEmail = ({ to, subject, html }) => new Promise((resolve, reject) => {
  const body = JSON.stringify({ from: "AttendQR <onboarding@resend.dev>", to, subject, html });
  const req  = https.request({
    hostname: "api.resend.com", path: "/emails", method: "POST",
    headers: { "Authorization": `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
  }, (res) => {
    let data = "";
    res.on("data", c => data += c);
    res.on("end", () => { try { const p = JSON.parse(data); res.statusCode < 300 ? resolve(p) : reject(new Error(p?.message || `Resend ${res.statusCode}`)); } catch(e) { reject(e); } });
  });
  req.on("error", reject); req.write(body); req.end();
});

const getClientIP = (req) => {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) { const ips = fwd.split(",").map(s => s.trim()); const pub = ips.find(ip => !ip.startsWith("10.") && !ip.startsWith("192.168.") && !ip.startsWith("127.") && !ip.match(/^172\.(1[6-9]|2\d|3[01])\./)); if (pub) return pub; }
  return req.headers["x-real-ip"] || req.socket?.remoteAddress || "Unknown";
};

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();
const hashOTP     = (otp) => crypto.createHash("sha256").update(otp).digest("hex");

const otpEmailHtml = (name, otp, subject) => `
<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#F7F7F5;border-radius:16px;">
  <div style="background:#1A1A17;border-radius:10px;padding:10px 16px;display:inline-block;margin-bottom:24px;"><span style="color:#fff;font-weight:700;">AttendQR</span></div>
  <h2 style="color:#1A1A17;margin:0 0 8px;">${subject}</h2>
  <p style="color:#555;margin:0 0 20px;">Hi <strong>${name}</strong>, your verification code is:</p>
  <div style="font-size:2.4rem;font-weight:800;letter-spacing:0.35em;color:#2563EB;text-align:center;padding:20px;background:#DBEAFE;border-radius:12px;margin:0 0 20px;">${otp}</div>
  <p style="color:#888;font-size:0.8rem;">This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
</div>`;

const alertEmailHtml = (name, ip, browser, os, time) => `
<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#F7F7F5;border-radius:16px;">
  <div style="background:#1A1A17;border-radius:10px;padding:10px 16px;display:inline-block;margin-bottom:24px;"><span style="color:#fff;font-weight:700;">AttendQR</span></div>
  <h2 style="color:#DC2626;margin:0 0 8px;">⚠ New Login Detected</h2>
  <p style="color:#555;margin:0 0 20px;">Hi <strong>${name}</strong>, a new login to your account was just detected:</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
    <tr><td style="padding:8px 12px;background:#F3F4F6;font-weight:600;border-radius:4px 0 0 4px;">Time</td><td style="padding:8px 12px;background:#F3F4F6;">${time}</td></tr>
    <tr><td style="padding:8px 12px;font-weight:600;">IP Address</td><td style="padding:8px 12px;font-family:monospace;">${ip}</td></tr>
    <tr><td style="padding:8px 12px;background:#F3F4F6;font-weight:600;border-radius:4px 0 0 4px;">Browser</td><td style="padding:8px 12px;background:#F3F4F6;">${browser}</td></tr>
    <tr><td style="padding:8px 12px;font-weight:600;">Device/OS</td><td style="padding:8px 12px;">${os}</td></tr>
  </table>
  <p style="color:#555;font-size:0.85rem;">If this was you, no action is needed. If you did not log in, change your password immediately and enable 2FA.</p>
</div>`;

// ── Email verification ────────────────────────────────────────────────────────
const sendVerificationEmail = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    if (user.isVerified) return res.json({ success: true, message: "Email is already verified." });
    const token = crypto.randomBytes(32).toString("hex");
    const hash  = crypto.createHash("sha256").update(token).digest("hex");
    user.verifyEmailToken   = hash;
    user.verifyEmailExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save({ validateBeforeSave: false });
    const verifyUrl = `${process.env.CLIENT_URL || "http://localhost:3000"}/verify-email?token=${token}`;
    await sendEmail({ to: user.email, subject: "Verify your AttendQR email address",
      html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#F7F7F5;border-radius:16px;">
        <h2 style="color:#1A1A17;">Verify your email</h2>
        <p>Hi <strong>${user.name}</strong>, click below to verify your AttendQR account.</p>
        <a href="${verifyUrl}" style="display:inline-block;background:#1A1A17;color:#fff;text-decoration:none;padding:13px 28px;border-radius:9px;font-weight:600;">Verify Email Address</a>
        <p style="color:#888;font-size:0.8rem;margin-top:20px;">This link expires in 24 hours.</p></div>` });
    res.json({ success: true, message: "Verification email sent!" });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to send verification email." }); }
};

const verifyEmail = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: "Token is required." });
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({ verifyEmailToken: hash, verifyEmailExpires: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ success: false, message: "Link invalid or expired." });
    user.isVerified = true; user.verifyEmailToken = undefined; user.verifyEmailExpires = undefined;
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, message: "Email verified successfully!" });
  } catch (err) { res.status(500).json({ success: false, message: "Verification failed." }); }
};

const getLoginHistory = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("loginHistory");
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    res.json({ success: true, history: [...(user.loginHistory || [])].reverse().slice(0, 20) });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to fetch login history." }); }
};

// ── 2FA ──────────────────────────────────────────────────────────────────────
const enable2FA = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    if (user.twoFAEnabled) return res.json({ success: true, message: "2FA is already enabled." });
    const otp = generateOTP();
    user.twoFASecret  = hashOTP(otp);
    user.twoFAExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save({ validateBeforeSave: false });
    await sendEmail({ to: user.email, subject: "AttendQR — Enable Two-Factor Authentication",
      html: otpEmailHtml(user.name, otp, "Enable Two-Factor Authentication") });
    res.json({ success: true, message: "Verification code sent to your email." });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to initiate 2FA setup." }); }
};

const confirm2FA = async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ success: false, message: "OTP required." });
    const user = await User.findById(req.user._id).select("+twoFASecret");
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    if (!user.twoFASecret || !user.twoFAExpires || user.twoFAExpires < Date.now())
      return res.status(400).json({ success: false, message: "OTP expired. Request a new one." });
    if (hashOTP(otp) !== user.twoFASecret)
      return res.status(401).json({ success: false, message: "Invalid OTP." });
    user.twoFAEnabled = true; user.twoFASecret = undefined; user.twoFAExpires = undefined;
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, message: "Two-factor authentication enabled." });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to confirm 2FA." }); }
};

const disable2FA = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    user.twoFAEnabled = false; user.twoFASecret = undefined; user.twoFAExpires = undefined;
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, message: "Two-factor authentication disabled." });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to disable 2FA." }); }
};

const verify2FA = async (req, res) => {
  try {
    const { otp, tempToken } = req.body;
    if (!otp || !tempToken) return res.status(400).json({ success: false, message: "OTP and token required." });
    const jwt = require("jsonwebtoken");
    const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_change_in_production";
    let decoded;
    try { decoded = jwt.verify(tempToken, JWT_SECRET + "2fa"); }
    catch(e) { return res.status(401).json({ success: false, message: "Session expired. Please log in again." }); }
    const user = await User.findById(decoded.id).select("+twoFASecret");
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    if (!user.twoFASecret || !user.twoFAExpires || user.twoFAExpires < Date.now())
      return res.status(400).json({ success: false, message: "OTP expired. Please log in again." });
    if (hashOTP(otp) !== user.twoFASecret)
      return res.status(401).json({ success: false, message: "Invalid OTP." });
    user.twoFASecret = undefined; user.twoFAExpires = undefined; user.twoFAPending = false;
    await user.save({ validateBeforeSave: false });
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token,
      user: { _id: user._id, name: user.name, email: user.email, role: user.role,
              isVerified: user.isVerified, profilePicture: user.profilePicture,
              grade: user.grade, section: user.section, mustChangePassword: user.mustChangePassword,
              twoFAEnabled: user.twoFAEnabled } });
  } catch (err) { res.status(500).json({ success: false, message: "2FA verification failed." }); }
};

// ── Active Sessions ───────────────────────────────────────────────────────────
const getActiveSessions = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("activeSessions");
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    res.json({ success: true, sessions: (user.activeSessions || []).sort((a,b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt)) });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to fetch sessions." }); }
};

const revokeSession = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    const before = user.activeSessions.length;
    user.activeSessions = user.activeSessions.filter(s => s.sessionId !== req.params.sessionId);
    if (user.activeSessions.length === before)
      return res.status(404).json({ success: false, message: "Session not found." });
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, message: "Session revoked." });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to revoke session." }); }
};

const revokeAllSessions = async (req, res) => {
  try {
    const { currentSessionId } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    user.activeSessions = currentSessionId ? user.activeSessions.filter(s => s.sessionId === currentSessionId) : [];
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, message: "All other sessions revoked." });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to revoke sessions." }); }
};

// ── Real-time IP ──────────────────────────────────────────────────────────────
const getMyIP = (req, res) => {
  res.json({ success: true, ip: getClientIP(req) });
};

// ── Send login alert email (called from authController) ──────────────────────
const sendLoginAlert = async (user, ip, browser, os) => {
  try {
    const time = new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "full", timeStyle: "short" });
    await sendEmail({ to: user.email, subject: "AttendQR — New Login Detected",
      html: alertEmailHtml(user.name, ip, browser, os, time) });
  } catch(e) { console.error("Login alert email failed:", e.message); }
};

module.exports = {
  sendVerificationEmail, verifyEmail, getLoginHistory,
  enable2FA, confirm2FA, disable2FA, verify2FA,
  getActiveSessions, revokeSession, revokeAllSessions,
  getMyIP, sendLoginAlert,
  hashOTP, generateOTP, getClientIP,
};
