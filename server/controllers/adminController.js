const User         = require("../models/User");
const Session      = require("../models/Session");
const Attendance   = require("../models/Attendance");
const Announcement = require("../models/Announcement");
const SystemLog    = require("../models/SystemLog");
const crypto       = require("crypto");
const https        = require("https");

// ── Email helper ─────────────────────────────────────────────────────────────
const sendEmail = ({ to, subject, html }) => new Promise((resolve, reject) => {
  const body = JSON.stringify({ from: "AttendQR <onboarding@resend.dev>", to, subject, html });
  const req  = https.request({
    hostname: "api.resend.com", path: "/emails", method: "POST",
    headers: { "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
  }, (res) => {
    let data = "";
    res.on("data", c => data += c);
    res.on("end", () => { try { const p = JSON.parse(data); res.statusCode < 300 ? resolve(p) : reject(new Error(p?.message)); } catch(e) { reject(e); } });
  });
  req.on("error", reject); req.write(body); req.end();
});

// ── Log admin action ─────────────────────────────────────────────────────────
const logAction = async (req, action, target, targetId, targetType, details = "") => {
  try {
    await SystemLog.create({
      admin: req.user._id, adminName: req.user.name,
      action, target, targetId, targetType, details,
      ip: req.headers["x-forwarded-for"]?.split(",")[0] || req.socket?.remoteAddress,
    });
  } catch(e) { console.error("Log error:", e.message); }
};

// ── Setup admin (one-time) ───────────────────────────────────────────────────
const setupAdmin = async (req, res) => {
  try {
    const existing = await User.findOne({ role: "admin" });
    if (existing) return res.status(403).json({ success: false, message: "Admin already exists." });
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ success: false, message: "Name, email and password required." });
    const admin = await User.create({ name, email, password, role: "admin", isVerified: true });
    res.json({ success: true, message: `Admin account created for ${admin.email}` });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── Stats ────────────────────────────────────────────────────────────────────
const getStats = async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
    const weekStart  = new Date(now); weekStart.setDate(now.getDate() - 7);
    const monthStart = new Date(now); monthStart.setDate(1); monthStart.setHours(0,0,0,0);

    const [
      totalStudents, totalTeachers, verifiedStudents,
      totalSessions, activeSessions, totalAttendance,
      newUsersToday, newUsersWeek, newUsersMonth,
      attendanceToday, attendanceWeek,
      loginsToday, loginsWeek,
    ] = await Promise.all([
      User.countDocuments({ role: "student" }),
      User.countDocuments({ role: "teacher" }),
      User.countDocuments({ role: "student", isVerified: true }),
      Session.countDocuments(),
      Session.countDocuments({ isActive: true }),
      Attendance.countDocuments(),
      User.countDocuments({ createdAt: { $gte: todayStart } }),
      User.countDocuments({ createdAt: { $gte: weekStart } }),
      User.countDocuments({ createdAt: { $gte: monthStart } }),
      Attendance.countDocuments({ createdAt: { $gte: todayStart } }),
      Attendance.countDocuments({ createdAt: { $gte: weekStart } }),
      // Count users who logged in today/this week via loginHistory
      User.countDocuments({ "loginHistory": { $elemMatch: { at: { $gte: todayStart }, success: true } } }),
      User.countDocuments({ "loginHistory": { $elemMatch: { at: { $gte: weekStart }, success: true } } }),
    ]);

    // Attendance trend: last 7 days
    const trend = await Attendance.aggregate([
      { $match: { createdAt: { $gte: weekStart } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Manila" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    // User growth: last 7 days
    const userGrowth = await User.aggregate([
      { $match: { createdAt: { $gte: weekStart }, role: { $ne: "admin" } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Manila" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    res.json({ success: true, stats: {
      totalStudents, totalTeachers, verifiedStudents,
      unverifiedStudents: totalStudents - verifiedStudents,
      totalSessions, activeSessions, totalAttendance,
      newUsersToday, newUsersWeek, newUsersMonth,
      attendanceToday, attendanceWeek,
      loginsToday, loginsWeek,
      trend, userGrowth,
    }});
  } catch (err) { res.status(500).json({ success: false, message: "Failed to fetch stats." }); }
};

// ── Activity overview ────────────────────────────────────────────────────────
const getActivityOverview = async (req, res) => {
  try {
    const { period = "today" } = req.query;
    const now = new Date();
    let since = new Date();
    if (period === "today") { since.setHours(0,0,0,0); }
    else if (period === "week") { since.setDate(now.getDate() - 7); }
    else if (period === "month") { since.setDate(1); since.setHours(0,0,0,0); }

    const users = await User.find({
      role: { $ne: "admin" },
      "loginHistory": { $elemMatch: { at: { $gte: since } } },
    }).select("name email role grade section loginHistory profilePicture");

    const activity = users.map(u => {
      const recentLogins = (u.loginHistory || [])
        .filter(h => new Date(h.at) >= since)
        .sort((a, b) => new Date(b.at) - new Date(a.at));
      return {
        _id: u._id, name: u.name, email: u.email, role: u.role,
        grade: u.grade, section: u.section, profilePicture: u.profilePicture,
        lastLogin: recentLogins[0]?.at,
        loginCount: recentLogins.length,
        lastIP: recentLogins[0]?.ip,
        lastBrowser: recentLogins[0]?.browser,
      };
    }).sort((a, b) => new Date(b.lastLogin) - new Date(a.lastLogin));

    res.json({ success: true, activity, period, since });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to fetch activity." }); }
};

// ── System logs ──────────────────────────────────────────────────────────────
const getSystemLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, action } = req.query;
    const query = action ? { action } : {};
    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await SystemLog.countDocuments(query);
    const logs  = await SystemLog.find(query)
      .sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
    res.json({ success: true, logs, total, page: parseInt(page) });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to fetch logs." }); }
};

// ── Users ────────────────────────────────────────────────────────────────────
const getUsers = async (req, res) => {
  try {
    const { role, verified, search, page = 1, limit = 50 } = req.query;
    const query = { role: { $ne: "admin" } };
    if (role) query.role = role;
    if (verified !== undefined) query.isVerified = verified === "true";
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { studentId: { $regex: search, $options: "i" } },
        { grade: { $regex: search, $options: "i" } },
        { section: { $regex: search, $options: "i" } },
      ];
    }
    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .select("-password -loginHistory -verifyEmailToken -resetPasswordToken -twoFASecret")
      .sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
    res.json({ success: true, users, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to fetch users." }); }
};

const getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select("-password -verifyEmailToken -resetPasswordToken -twoFASecret");
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    let attendanceCount = 0, sessionCount = 0;
    if (user.role === "student") attendanceCount = await Attendance.countDocuments({ student: user._id });
    if (user.role === "teacher") sessionCount = await Session.countDocuments({ teacher: user._id });
    res.json({ success: true, user, attendanceCount, sessionCount });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to fetch user." }); }
};

const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    if (user.role === "admin") return res.status(403).json({ success: false, message: "Cannot delete admin." });
    if (user.role === "student") await Attendance.deleteMany({ student: user._id });
    await logAction(req, "DELETE_USER", user.name, user._id.toString(), "user", `Role: ${user.role}`);
    await user.deleteOne();
    res.json({ success: true, message: `${user.name}'s account deleted.` });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to delete user." }); }
};

const verifyUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    user.isVerified = true; user.verifyEmailToken = undefined; user.verifyEmailExpires = undefined;
    await user.save({ validateBeforeSave: false });
    await logAction(req, "VERIFY_USER", user.name, user._id.toString(), "user");
    res.json({ success: true, message: `${user.name} verified.` });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to verify user." }); }
};

const unverifyUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    user.isVerified = false;
    await user.save({ validateBeforeSave: false });
    await logAction(req, "UNVERIFY_USER", user.name, user._id.toString(), "user");
    res.json({ success: true, message: `${user.name} unverified.` });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to unverify user." }); }
};

const resetUserPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ success: false, message: "Min. 6 characters." });
    const user = await User.findById(req.params.id).select("+password");
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    if (user.role === "admin") return res.status(403).json({ success: false, message: "Cannot change admin password this way." });
    user.password = newPassword;
    await user.save();
    await logAction(req, "RESET_PASSWORD", user.name, user._id.toString(), "user");
    res.json({ success: true, message: "Password updated." });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to update password." }); }
};

// ── Bulk actions ─────────────────────────────────────────────────────────────
const bulkVerifyUsers = async (req, res) => {
  try {
    const { ids } = req.body; // array of user IDs, or "all"
    let query = { role: "student", isVerified: false };
    if (ids && ids !== "all") query = { _id: { $in: ids } };
    const result = await User.updateMany(query, { $set: { isVerified: true, verifyEmailToken: null, verifyEmailExpires: null } });
    await logAction(req, "BULK_VERIFY", `${result.modifiedCount} users`, null, "user");
    res.json({ success: true, message: `${result.modifiedCount} users verified.`, count: result.modifiedCount });
  } catch (err) { res.status(500).json({ success: false, message: "Bulk verify failed." }); }
};

const bulkDeleteUsers = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !ids.length) return res.status(400).json({ success: false, message: "No IDs provided." });
    const users = await User.find({ _id: { $in: ids }, role: { $ne: "admin" } });
    const studentIds = users.filter(u => u.role === "student").map(u => u._id);
    await Attendance.deleteMany({ student: { $in: studentIds } });
    await User.deleteMany({ _id: { $in: ids }, role: { $ne: "admin" } });
    await logAction(req, "BULK_DELETE", `${users.length} users`, null, "user");
    res.json({ success: true, message: `${users.length} accounts deleted.`, count: users.length });
  } catch (err) { res.status(500).json({ success: false, message: "Bulk delete failed." }); }
};

const exportUsersExcel = async (req, res) => {
  try {
    const { role } = req.query;
    const query = { role: { $ne: "admin" } };
    if (role) query.role = role;
    const users = await User.find(query)
      .select("name email role studentId grade section isVerified createdAt school department")
      .sort({ createdAt: -1 });
    // Return as JSON — frontend builds XLSX
    await logAction(req, "EXPORT_USERS", `${users.length} users`, null, "user", `Role filter: ${role || "all"}`);
    res.json({ success: true, users });
  } catch (err) { res.status(500).json({ success: false, message: "Export failed." }); }
};

// ── Email blast ───────────────────────────────────────────────────────────────
const sendEmailBlast = async (req, res) => {
  try {
    const { subject, message, targetRole = "all" } = req.body;
    if (!subject || !message) return res.status(400).json({ success: false, message: "Subject and message required." });
    const query = { isVerified: true };
    if (targetRole !== "all") query.role = targetRole;
    else query.role = { $ne: "admin" };
    const users = await User.find(query).select("email name");
    if (!users.length) return res.status(400).json({ success: false, message: "No verified users found." });

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#F7F7F5;border-radius:16px;">
        <div style="background:#1A1A17;border-radius:10px;padding:10px 16px;display:inline-block;margin-bottom:24px;">
          <span style="color:#fff;font-weight:700;">AttendQR</span>
        </div>
        <h2 style="color:#1A1A17;margin:0 0 16px;">${subject}</h2>
        <div style="color:#374151;font-size:0.95rem;line-height:1.7;white-space:pre-wrap;">${message}</div>
        <hr style="border:none;border-top:1px solid #E3E3DC;margin:24px 0;">
        <p style="color:#aaa;font-size:0.75rem;">AttendQR · This message was sent by your school administrator.</p>
      </div>`;

    // Send in batches of 10 to avoid rate limits
    let sent = 0;
    for (let i = 0; i < users.length; i += 10) {
      const batch = users.slice(i, i + 10);
      await Promise.allSettled(batch.map(u => sendEmail({ to: u.email, subject, html })));
      sent += batch.length;
    }

    await logAction(req, "EMAIL_BLAST", `${sent} recipients`, null, "user", `Subject: ${subject} | Target: ${targetRole}`);
    res.json({ success: true, message: `Email sent to ${sent} users.`, sent });
  } catch (err) { res.status(500).json({ success: false, message: "Email blast failed." }); }
};

// ── Announcements ─────────────────────────────────────────────────────────────
const getAnnouncements = async (req, res) => {
  try {
    const { role } = req.query;
    const query = {
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    };
    if (role && role !== "admin") {
      query.targetRole = { $in: [role, "all"] };
    }
    const announcements = await Announcement.find(query)
      .populate("author", "name")
      .sort({ pinned: -1, createdAt: -1 })
      .limit(50);
    res.json({ success: true, announcements });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to fetch announcements." }); }
};

const createAnnouncement = async (req, res) => {
  try {
    const { title, message, type, targetRole, expiresAt, pinned } = req.body;
    if (!title || !message) return res.status(400).json({ success: false, message: "Title and message required." });
    const ann = await Announcement.create({
      title, message, type: type || "info",
      targetRole: targetRole || "all",
      author: req.user._id,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      pinned: pinned || false,
    });
    await logAction(req, "CREATE_ANNOUNCEMENT", title, ann._id.toString(), "announcement", `Target: ${targetRole || "all"}`);
    res.status(201).json({ success: true, message: "Announcement created.", announcement: ann });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to create announcement." }); }
};

const deleteAnnouncement = async (req, res) => {
  try {
    const ann = await Announcement.findById(req.params.id);
    if (!ann) return res.status(404).json({ success: false, message: "Announcement not found." });
    await logAction(req, "DELETE_ANNOUNCEMENT", ann.title, ann._id.toString(), "announcement");
    await ann.deleteOne();
    res.json({ success: true, message: "Announcement deleted." });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to delete announcement." }); }
};

const markAnnouncementRead = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { readAnnouncements: req.params.id }
    });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to mark read." }); }
};

// ── Global search ─────────────────────────────────────────────────────────────
const globalSearch = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ success: true, users: [], sessions: [] });
    const [users, sessions] = await Promise.all([
      User.find({
        role: { $ne: "admin" },
        $or: [
          { name: { $regex: q, $options: "i" } },
          { email: { $regex: q, $options: "i" } },
          { studentId: { $regex: q, $options: "i" } },
          { grade: { $regex: q, $options: "i" } },
          { section: { $regex: q, $options: "i" } },
        ],
      }).select("name email role studentId grade section isVerified profilePicture").limit(8),
      Session.find({
        $or: [
          { subject: { $regex: q, $options: "i" } },
          { room: { $regex: q, $options: "i" } },
        ],
      }).populate("teacher", "name").limit(5),
    ]);
    res.json({ success: true, users, sessions });
  } catch (err) { res.status(500).json({ success: false, message: "Search failed." }); }
};

// ── Sessions ─────────────────────────────────────────────────────────────────
const getSessions = async (req, res) => {
  try {
    const { active, search, page = 1, limit = 30 } = req.query;
    const query = {};
    if (active !== undefined) query.isActive = active === "true";
    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await Session.countDocuments(query);
    let sessions = await Session.find(query)
      .populate("teacher", "name email profilePicture")
      .sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
    if (search) {
      const s = search.toLowerCase();
      sessions = sessions.filter(sess =>
        sess.subject?.toLowerCase().includes(s) ||
        sess.teacher?.name?.toLowerCase().includes(s) ||
        sess.room?.toLowerCase().includes(s)
      );
    }
    const sessionIds = sessions.map(s => s._id);
    const counts = await Attendance.aggregate([
      { $match: { session: { $in: sessionIds } } },
      { $group: { _id: "$session", count: { $sum: 1 } } }
    ]);
    const countMap = {};
    counts.forEach(c => { countMap[c._id.toString()] = c.count; });
    const result = sessions.map(s => ({ ...s.toJSON(), attendanceCount: countMap[s._id.toString()] || 0 }));
    res.json({ success: true, sessions: result, total, page: parseInt(page) });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to fetch sessions." }); }
};

const stopSession = async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) return res.status(404).json({ success: false, message: "Session not found." });
    session.isActive = false; session.endTime = new Date();
    session.qrToken = undefined; session.qrExpiresAt = undefined;
    await session.save();
    await logAction(req, "STOP_SESSION", session.subject, session._id.toString(), "session");
    res.json({ success: true, message: "Session stopped." });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to stop session." }); }
};

const deleteSession = async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) return res.status(404).json({ success: false, message: "Session not found." });
    await Attendance.deleteMany({ session: session._id });
    await logAction(req, "DELETE_SESSION", session.subject, session._id.toString(), "session");
    await session.deleteOne();
    res.json({ success: true, message: "Session deleted." });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to delete session." }); }
};

// ── Device management ─────────────────────────────────────────────────────────
const getDeviceRequests = async (req, res) => {
  try {
    const users = await User.find({ role: "student", "pendingDevices.0": { $exists: true } })
      .select("name email grade section pendingDevices trustedDevice");
    const requests = [];
    users.forEach(u => {
      (u.pendingDevices || []).forEach(d => {
        requests.push({ userId: u._id, userName: u.name, userEmail: u.email,
          grade: u.grade, section: u.section, trustedDevice: u.trustedDevice, ...d.toObject() });
      });
    });
    requests.sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
    res.json({ success: true, requests });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to fetch device requests." }); }
};

const approveDevice = async (req, res) => {
  try {
    const { fingerprint } = req.body;
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    const pending = (user.pendingDevices || []).find(d => d.fingerprint === fingerprint);
    if (!pending) return res.status(404).json({ success: false, message: "Pending device not found." });
    user.trustedDevice = { fingerprint: pending.fingerprint, browser: pending.browser,
      os: pending.os, registeredAt: new Date(), label: pending.label || "Approved Device" };
    user.pendingDevices = user.pendingDevices.filter(d => d.fingerprint !== fingerprint);
    await user.save({ validateBeforeSave: false });
    await logAction(req, "APPROVE_DEVICE", user.name, user._id.toString(), "user");
    res.json({ success: true, message: `Device approved for ${user.name}.` });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to approve device." }); }
};

const rejectDevice = async (req, res) => {
  try {
    const { fingerprint } = req.body;
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    user.pendingDevices = (user.pendingDevices || []).filter(d => d.fingerprint !== fingerprint);
    await user.save({ validateBeforeSave: false });
    await logAction(req, "REJECT_DEVICE", user.name, user._id.toString(), "user");
    res.json({ success: true, message: "Device request rejected." });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to reject device." }); }
};

const resetTrustedDevice = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    user.trustedDevice = undefined; user.pendingDevices = [];
    await user.save({ validateBeforeSave: false });
    await logAction(req, "RESET_DEVICE", user.name, user._id.toString(), "user");
    res.json({ success: true, message: `Device reset for ${user.name}.` });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to reset device." }); }
};

const toggleDevicePolicy = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    user.devicePolicyEnabled = !user.devicePolicyEnabled;
    await user.save({ validateBeforeSave: false });
    await logAction(req, "TOGGLE_DEVICE_POLICY", user.name, user._id.toString(), "user", `Enabled: ${user.devicePolicyEnabled}`);
    res.json({ success: true, message: `Device policy ${user.devicePolicyEnabled ? "enabled" : "disabled"}.`, enabled: user.devicePolicyEnabled });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to toggle device policy." }); }
};


// ── @desc  Full analytics data for dashboard ─────────────────────────────────
// ── @route GET /api/admin/analytics
const getAnalytics = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const since = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

    // Attendance trend by day
    const dailyTrend = await Attendance.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Manila" } },
        total:   { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ["$status","present"] }, 1, 0] } },
        late:    { $sum: { $cond: [{ $eq: ["$status","late"] }, 1, 0] } },
      }},
      { $sort: { _id: 1 } },
    ]);

    // By day of week (0=Sun, 1=Mon...)
    const byDayOfWeek = await Attendance.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: {
        _id: { $dayOfWeek: { date: "$createdAt", timezone: "Asia/Manila" } },
        total:   { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ["$status","present"] }, 1, 0] } },
        late:    { $sum: { $cond: [{ $eq: ["$status","late"] }, 1, 0] } },
      }},
      { $sort: { _id: 1 } },
    ]);

    // By subject (top 10)
    const bySubject = await Attendance.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $lookup: { from: "sessions", localField: "session", foreignField: "_id", as: "sess" } },
      { $unwind: "$sess" },
      { $group: {
        _id: "$sess.subject",
        total:   { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ["$status","present"] }, 1, 0] } },
        late:    { $sum: { $cond: [{ $eq: ["$status","late"] }, 1, 0] } },
      }},
      { $sort: { total: -1 } },
      { $limit: 10 },
    ]);

    // By hour of day
    const byHour = await Attendance.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: {
        _id: { $hour: { date: "$createdAt", timezone: "Asia/Manila" } },
        total: { $sum: 1 },
      }},
      { $sort: { _id: 1 } },
    ]);

    // Overall rates
    const totalCount   = await Attendance.countDocuments({ createdAt: { $gte: since } });
    const presentCount = await Attendance.countDocuments({ createdAt: { $gte: since }, status: "present" });
    const lateCount    = await Attendance.countDocuments({ createdAt: { $gte: since }, status: "late" });

    res.json({ success: true, analytics: {
      dailyTrend, byDayOfWeek, bySubject, byHour,
      totals: { total: totalCount, present: presentCount, late: lateCount,
        presentRate: totalCount ? Math.round(presentCount/totalCount*100) : 0,
        lateRate:    totalCount ? Math.round(lateCount/totalCount*100) : 0,
      },
      days: parseInt(days),
    }});
  } catch (err) { res.status(500).json({ success: false, message: "Analytics failed." }); }
};

// ── @desc  Risk prediction — students at risk of failing due to absences ─────
// ── @route GET /api/admin/risk
const getRiskPrediction = async (req, res) => {
  try {
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const since7  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000);

    // Get all students
    const students = await User.find({ role: "student", isVerified: true })
      .select("name email grade section profilePicture studentId");

    // Get attendance for last 30 days per student
    const attendanceData = await Attendance.aggregate([
      { $match: { createdAt: { $gte: since30 } } },
      { $group: {
        _id: "$student",
        total:   { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ["$status","present"] }, 1, 0] } },
        late:    { $sum: { $cond: [{ $eq: ["$status","late"] }, 1, 0] } },
        lastSeen:{ $max: "$createdAt" },
        dates:   { $addToSet: "$attendanceDate" },
      }},
    ]);

    // Get total sessions in last 30 days (denominator)
    const totalSessions = await Session.countDocuments({ createdAt: { $gte: since30 } });

    const attMap = {};
    attendanceData.forEach(a => { attMap[a._id.toString()] = a; });

    const predictions = students.map(student => {
      const att = attMap[student._id.toString()];
      const attended  = att?.total || 0;
      const present   = att?.present || 0;
      const late      = att?.late || 0;
      const missed    = Math.max(0, totalSessions - attended);
      const rate      = totalSessions > 0 ? attended / totalSessions : 0;
      const lastSeen  = att?.lastSeen || null;
      const daysSinceLastSeen = lastSeen
        ? Math.floor((Date.now() - new Date(lastSeen)) / 86400000) : 999;

      // Risk scoring algorithm (0-100)
      let score = 0;
      // Absence rate contributes up to 50 points
      score += Math.round((1 - rate) * 50);
      // Days since last seen (up to 25 points)
      score += Math.min(25, Math.round(daysSinceLastSeen * 2.5));
      // Late ratio contributes up to 15 points
      const lateRate = attended > 0 ? late / attended : 0;
      score += Math.round(lateRate * 15);
      // Never attended = max risk
      if (attended === 0 && totalSessions > 0) score = 100;

      score = Math.min(100, score);

      const level = score >= 70 ? "high" : score >= 40 ? "medium" : "low";

      return {
        _id: student._id,
        name: student.name,
        email: student.email,
        grade: student.grade,
        section: student.section,
        profilePicture: student.profilePicture,
        studentId: student.studentId,
        attended, present, late, missed,
        totalSessions,
        attendanceRate: Math.round(rate * 100),
        daysSinceLastSeen,
        lastSeen,
        riskScore: score,
        riskLevel: level,
      };
    });

    // Sort by risk score descending
    predictions.sort((a, b) => b.riskScore - a.riskScore);

    res.json({ success: true, predictions, totalSessions, generatedAt: new Date() });
  } catch (err) { res.status(500).json({ success: false, message: "Risk prediction failed." }); }
};

// ── @desc  Anomaly detection — suspicious check-in patterns ──────────────────
// ── @route GET /api/admin/anomalies
const getAnomalies = async (req, res) => {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const anomalies = [];

    // 1. Same IP used by multiple different students in same session
    const ipGroups = await Attendance.aggregate([
      { $match: { createdAt: { $gte: since }, ipAddress: { $ne: null } } },
      { $group: {
        _id: { session: "$session", ip: "$ipAddress" },
        students: { $addToSet: "$student" },
        count: { $sum: 1 },
        timestamps: { $push: "$createdAt" },
      }},
      { $match: { count: { $gt: 1 } } },
      { $lookup: { from: "sessions", localField: "_id.session", foreignField: "_id", as: "session" } },
      { $unwind: "$session" },
    ]);

    for (const g of ipGroups) {
      const studentDocs = await User.find({ _id: { $in: g.students } }).select("name email grade section");
      anomalies.push({
        type: "SHARED_IP",
        severity: g.count >= 5 ? "high" : "medium",
        title: "Multiple students from same IP",
        description: `${g.count} students checked into "${g.session.subject}" from IP ${g._id.ip}`,
        session: g.session.subject,
        ip: g._id.ip,
        students: studentDocs.map(s => ({ name: s.name, email: s.email })),
        count: g.count,
        detectedAt: g.timestamps[0],
      });
    }

    // 2. Rapid check-ins — many students in a very short time (< 10 seconds apart)
    const rapidGroups = await Attendance.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $sort: { session: 1, createdAt: 1 } },
      { $group: {
        _id: "$session",
        checkins: { $push: { student: "$student", time: "$createdAt", ip: "$ipAddress" } },
        count: { $sum: 1 },
      }},
      { $match: { count: { $gt: 3 } } },
    ]);

    for (const g of rapidGroups) {
      const times = g.checkins.map(c => new Date(c.time).getTime()).sort((a,b)=>a-b);
      let burstCount = 0;
      for (let i = 1; i < times.length; i++) {
        if (times[i] - times[i-1] < 5000) burstCount++;
      }
      if (burstCount >= 3) {
        const sessionDoc = await Session.findById(g._id).select("subject");
        anomalies.push({
          type: "RAPID_CHECKINS",
          severity: burstCount >= 5 ? "high" : "medium",
          title: "Suspiciously rapid check-ins",
          description: `${burstCount} check-ins within 5 seconds in "${sessionDoc?.subject || 'Unknown'}"`,
          session: sessionDoc?.subject,
          count: burstCount,
          detectedAt: new Date(times[0]),
        });
      }
    }

    // 3. Off-hours check-ins (before 5am or after 10pm Philippine time)
    const offHours = await Attendance.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $addFields: { hourPH: { $hour: { date: "$createdAt", timezone: "Asia/Manila" } } } },
      { $match: { $or: [{ hourPH: { $lt: 5 } }, { hourPH: { $gte: 22 } }] } },
      { $lookup: { from: "users", localField: "student", foreignField: "_id", as: "student" } },
      { $unwind: "$student" },
      { $lookup: { from: "sessions", localField: "session", foreignField: "_id", as: "session" } },
      { $unwind: "$session" },
      { $limit: 20 },
    ]);

    for (const r of offHours) {
      anomalies.push({
        type: "OFF_HOURS",
        severity: "low",
        title: "Off-hours check-in",
        description: `${r.student.name} checked into "${r.session.subject}" at unusual hour`,
        student: r.student.name,
        session: r.session.subject,
        detectedAt: r.createdAt,
      });
    }

    // 4. Students who attended way more sessions than peers (potential QR sharing)
    const sessionCounts = await Attendance.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: "$student", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    if (sessionCounts.length > 3) {
      const avg = sessionCounts.reduce((s,c) => s + c.count, 0) / sessionCounts.length;
      const std = Math.sqrt(sessionCounts.reduce((s,c) => s + Math.pow(c.count-avg,2), 0) / sessionCounts.length);
      const outliers = sessionCounts.filter(c => c.count > avg + 2.5 * std);
      for (const o of outliers) {
        const student = await User.findById(o._id).select("name email grade section");
        if (student) {
          anomalies.push({
            type: "STATISTICAL_OUTLIER",
            severity: "medium",
            title: "Unusually high attendance count",
            description: `${student.name} has ${o.count} check-ins vs average of ${Math.round(avg)} — possible QR sharing`,
            student: student.name,
            count: o.count,
            average: Math.round(avg),
            detectedAt: new Date(),
          });
        }
      }
    }

    anomalies.sort((a, b) => {
      const sev = { high:0, medium:1, low:2 };
      return sev[a.severity] - sev[b.severity];
    });

    res.json({ success: true, anomalies, scannedFrom: since, generatedAt: new Date() });
  } catch (err) { res.status(500).json({ success: false, message: "Anomaly detection failed." }); }
};

module.exports = {
  setupAdmin, getAnalytics, getRiskPrediction, getAnomalies, getStats, getActivityOverview, getSystemLogs,
  getUsers, getUser, deleteUser, verifyUser, unverifyUser, resetUserPassword,
  bulkVerifyUsers, bulkDeleteUsers, exportUsersExcel,
  sendEmailBlast,
  getAnnouncements, createAnnouncement, deleteAnnouncement, markAnnouncementRead,
  globalSearch,
  getSessions, stopSession, deleteSession,
  getDeviceRequests, approveDevice, rejectDevice, resetTrustedDevice, toggleDevicePolicy,
};
