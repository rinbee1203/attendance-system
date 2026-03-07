const crypto = require("crypto");
const https  = require("https");
const User   = require("../models/User");

// ── Resend email helper (same as authController) ─────────────────────────────
const sendEmail = ({ to, subject, html }) => new Promise((resolve, reject) => {
  const body = JSON.stringify({ from: "AttendQR <onboarding@resend.dev>", to, subject, html });
  const req  = https.request({
    hostname: "api.resend.com", path: "/emails", method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
  }, (res) => {
    let data = "";
    res.on("data", c => data += c);
    res.on("end", () => {
      try {
        const p = JSON.parse(data);
        res.statusCode < 300 ? resolve(p) : reject(new Error(p?.message || `Resend ${res.statusCode}`));
      } catch(e) { reject(e); }
    });
  });
  req.on("error", reject);
  req.write(body); req.end();
});

// ── @desc  Send verification email ─────────────────────────────────────────
// ── @route POST /api/security/send-verification
// ── @access Private
const sendVerificationEmail = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    if (user.isVerified) return res.json({ success: true, message: "Email is already verified." });

    const token   = crypto.randomBytes(32).toString("hex");
    const hash    = crypto.createHash("sha256").update(token).digest("hex");
    user.verifyEmailToken   = hash;
    user.verifyEmailExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
    await user.save({ validateBeforeSave: false });

    const CLIENT_URL  = process.env.CLIENT_URL || "http://localhost:3000";
    const verifyUrl   = `${CLIENT_URL}/verify-email?token=${token}`;

    await sendEmail({
      to: user.email,
      subject: "Verify your AttendQR email address",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#F7F7F5;border-radius:16px;">
          <div style="background:#1A1A17;border-radius:10px;padding:10px 16px;display:inline-block;margin-bottom:24px;">
            <span style="color:#fff;font-weight:700;font-size:1rem;">AttendQR</span>
          </div>
          <h2 style="color:#1A1A17;margin:0 0 8px;font-size:1.4rem;">Verify your email</h2>
          <p style="color:#555;margin:0 0 24px;font-size:0.9rem;">Hi <strong>${user.name}</strong>, click the button below to verify your email address and activate your account.</p>
          <a href="${verifyUrl}" style="display:inline-block;background:#1A1A17;color:#fff;text-decoration:none;padding:13px 28px;border-radius:9px;font-weight:600;font-size:0.95rem;margin-bottom:20px;">Verify Email Address</a>
          <p style="color:#888;font-size:0.8rem;margin:0;">This link expires in <strong>24 hours</strong>. If you didn't create an account, you can safely ignore this email.</p>
          <hr style="border:none;border-top:1px solid #E3E3DC;margin:20px 0;">
          <p style="color:#aaa;font-size:0.75rem;margin:0;">AttendQR · QR-based Attendance System</p>
        </div>
      `,
    });

    res.json({ success: true, message: "Verification email sent! Please check your inbox." });
  } catch (err) {
    console.error("Send verification error:", err);
    res.status(500).json({ success: false, message: "Failed to send verification email." });
  }
};

// ── @desc  Verify email via token ───────────────────────────────────────────
// ── @route POST /api/security/verify-email
// ── @access Public
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: "Token is required." });

    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      verifyEmailToken:   hash,
      verifyEmailExpires: { $gt: Date.now() },
    });

    if (!user) return res.status(400).json({ success: false, message: "Verification link is invalid or has expired." });

    user.isVerified         = true;
    user.verifyEmailToken   = undefined;
    user.verifyEmailExpires = undefined;
    await user.save({ validateBeforeSave: false });

    res.json({ success: true, message: "Email verified successfully! You can now sign in." });
  } catch (err) {
    res.status(500).json({ success: false, message: "Verification failed. Please try again." });
  }
};

// ── @desc  Get login history ────────────────────────────────────────────────
// ── @route GET /api/security/login-history
// ── @access Private
const getLoginHistory = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("loginHistory");
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    // Return newest first
    const history = [...(user.loginHistory || [])].reverse().slice(0, 20);
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch login history." });
  }
};

module.exports = { sendVerificationEmail, verifyEmail, getLoginHistory };
