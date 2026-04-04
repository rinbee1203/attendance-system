// ── @desc  One-time admin setup (only works if no admin exists yet) ──────────
// ── @route POST /api/admin/setup
// ── @access Public (but locked once admin exists)
const setupAdmin = async (req, res) => {
  try {
    const existing = await User.findOne({ role: "admin" });
    if (existing) return res.status(403).json({ success: false, message: "Admin already exists." });
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ success: false, message: "Name, email and password required." });
    const admin = await User.create({ name, email, password, role: "admin", isVerified: true });
    res.json({ success: true, message: `Admin account created for ${admin.email}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const User    = require("../models/User");
const Session = require("../models/Session");
const Attendance = require("../models/Attendance");

// ── @desc  Get dashboard stats ──────────────────────────────────────────────
// ── @route GET /api/admin/stats
const getStats = async (req, res) => {
  try {
    const [totalStudents, totalTeachers, verifiedStudents, totalSessions, activeSessions, totalAttendance] = await Promise.all([
      User.countDocuments({ role: "student" }),
      User.countDocuments({ role: "teacher" }),
      User.countDocuments({ role: "student", isVerified: true }),
      Session.countDocuments(),
      Session.countDocuments({ isActive: true }),
      Attendance.countDocuments(),
    ]);
    res.json({ success: true, stats: {
      totalStudents, totalTeachers, verifiedStudents,
      unverifiedStudents: totalStudents - verifiedStudents,
      totalSessions, activeSessions, totalAttendance,
    }});
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch stats." });
  }
};

// ── @desc  Get all users (students + teachers) ──────────────────────────────
// ── @route GET /api/admin/users
const getUsers = async (req, res) => {
  try {
    const { role, verified, search, page = 1, limit = 50 } = req.query;
    const query = { role: { $ne: "admin" } };
    if (role)   query.role = role;
    if (verified !== undefined) query.isVerified = verified === "true";
    if (search) {
      query.$or = [
        { name:      { $regex: search, $options: "i" } },
        { email:     { $regex: search, $options: "i" } },
        { studentId: { $regex: search, $options: "i" } },
        { grade:     { $regex: search, $options: "i" } },
        { section:   { $regex: search, $options: "i" } },
      ];
    }
    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .select("-password -loginHistory -verifyEmailToken -resetPasswordToken")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    res.json({ success: true, users, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch users." });
  }
};

// ── @desc  Get single user detail ───────────────────────────────────────────
// ── @route GET /api/admin/users/:id
const getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select("-password -verifyEmailToken -resetPasswordToken");
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    // Get attendance count for students
    let attendanceCount = 0;
    if (user.role === "student") {
      attendanceCount = await Attendance.countDocuments({ student: user._id });
    }
    let sessionCount = 0;
    if (user.role === "teacher") {
      sessionCount = await Session.countDocuments({ teacher: user._id });
    }
    res.json({ success: true, user, attendanceCount, sessionCount });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch user." });
  }
};

// ── @desc  Delete a user ────────────────────────────────────────────────────
// ── @route DELETE /api/admin/users/:id
const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    if (user.role === "admin") return res.status(403).json({ success: false, message: "Cannot delete admin accounts." });
    // Delete related attendance records for students
    if (user.role === "student") {
      await Attendance.deleteMany({ student: user._id });
    }
    await user.deleteOne();
    res.json({ success: true, message: `${user.name}'s account has been deleted.` });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to delete user." });
  }
};

// ── @desc  Manually verify a user ──────────────────────────────────────────
// ── @route PATCH /api/admin/users/:id/verify
const verifyUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    user.isVerified         = true;
    user.verifyEmailToken   = undefined;
    user.verifyEmailExpires = undefined;
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, message: `${user.name} has been verified.` });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to verify user." });
  }
};

// ── @desc  Unverify a user ──────────────────────────────────────────────────
// ── @route PATCH /api/admin/users/:id/unverify
const unverifyUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    user.isVerified = false;
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, message: `${user.name} has been unverified.` });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to unverify user." });
  }
};

// ── @desc  Get all sessions (all teachers) ──────────────────────────────────
// ── @route GET /api/admin/sessions
const getSessions = async (req, res) => {
  try {
    const { active, search, page = 1, limit = 30 } = req.query;
    const query = {};
    if (active !== undefined) query.isActive = active === "true";
    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await Session.countDocuments(query);
    let sessions = await Session.find(query)
      .populate("teacher", "name email profilePicture")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    if (search) {
      const s = search.toLowerCase();
      sessions = sessions.filter(sess =>
        sess.subject?.toLowerCase().includes(s) ||
        sess.teacher?.name?.toLowerCase().includes(s) ||
        sess.room?.toLowerCase().includes(s)
      );
    }
    // Attach attendance count to each session
    const sessionIds = sessions.map(s => s._id);
    const counts = await Attendance.aggregate([
      { $match: { session: { $in: sessionIds } } },
      { $group: { _id: "$session", count: { $sum: 1 } } }
    ]);
    const countMap = {};
    counts.forEach(c => { countMap[c._id.toString()] = c.count; });
    const result = sessions.map(s => ({
      ...s.toJSON(),
      attendanceCount: countMap[s._id.toString()] || 0,
    }));
    res.json({ success: true, sessions: result, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch sessions." });
  }
};

// ── @desc  Force-stop an active session ─────────────────────────────────────
// ── @route PATCH /api/admin/sessions/:id/stop
const stopSession = async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) return res.status(404).json({ success: false, message: "Session not found." });
    session.isActive  = false;
    session.endTime   = new Date();
    session.qrToken   = undefined;
    session.qrExpiresAt = undefined;
    await session.save();
    res.json({ success: true, message: "Session has been stopped." });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to stop session." });
  }
};

// ── @desc  Delete a session ──────────────────────────────────────────────────
// ── @route DELETE /api/admin/sessions/:id
const deleteSession = async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) return res.status(404).json({ success: false, message: "Session not found." });
    await Attendance.deleteMany({ session: session._id });
    await session.deleteOne();
    res.json({ success: true, message: "Session and its attendance records deleted." });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to delete session." });
  }
};


// ── @desc  Reset a user's password ──────────────────────────────────────────
// ── @route PATCH /api/admin/users/:id/password
const resetUserPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6)
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters." });
    const user = await User.findById(req.params.id).select("+password");
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    if (user.role === "admin") return res.status(403).json({ success: false, message: "Cannot change admin password this way." });
    user.password = newPassword; // pre-save hook will hash it
    await user.save();
    res.json({ success: true, message: "Password updated successfully." });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to update password." });
  }
};


// ── @desc  Get all pending device requests ──────────────────────────────────
// ── @route GET /api/admin/device-requests
const getDeviceRequests = async (req, res) => {
  try {
    const users = await User.find({
      role: "student",
      "pendingDevices.0": { $exists: true },
    }).select("name email grade section pendingDevices trustedDevice");
    const requests = [];
    users.forEach(u => {
      (u.pendingDevices || []).forEach(d => {
        requests.push({
          userId: u._id,
          userName: u.name,
          userEmail: u.email,
          grade: u.grade,
          section: u.section,
          trustedDevice: u.trustedDevice,
          ...d.toObject(),
        });
      });
    });
    requests.sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
    res.json({ success: true, requests });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch device requests." });
  }
};

// ── @desc  Approve a pending device request ──────────────────────────────────
// ── @route PATCH /api/admin/device-requests/:userId/approve
const approveDevice = async (req, res) => {
  try {
    const { fingerprint } = req.body;
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    const pending = (user.pendingDevices || []).find(d => d.fingerprint === fingerprint);
    if (!pending) return res.status(404).json({ success: false, message: "Pending device not found." });
    // Replace trusted device with the approved one
    user.trustedDevice = {
      fingerprint: pending.fingerprint,
      browser: pending.browser,
      os: pending.os,
      registeredAt: new Date(),
      label: pending.label || "Approved Device",
    };
    // Remove from pending
    user.pendingDevices = user.pendingDevices.filter(d => d.fingerprint !== fingerprint);
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, message: `New device approved for ${user.name}.` });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to approve device." });
  }
};

// ── @desc  Reject a pending device request ───────────────────────────────────
// ── @route DELETE /api/admin/device-requests/:userId/reject
const rejectDevice = async (req, res) => {
  try {
    const { fingerprint } = req.body;
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    user.pendingDevices = (user.pendingDevices || []).filter(d => d.fingerprint !== fingerprint);
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, message: `Device request rejected.` });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to reject device." });
  }
};

// ── @desc  Reset trusted device (unlock all devices for a user) ──────────────
// ── @route PATCH /api/admin/users/:id/reset-device
const resetTrustedDevice = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    user.trustedDevice = undefined;
    user.pendingDevices = [];
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, message: `Device policy reset for ${user.name}. Next login registers a new trusted device.` });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to reset device." });
  }
};

// ── @desc  Toggle device policy on/off for a user ───────────────────────────
// ── @route PATCH /api/admin/users/:id/toggle-device-policy
const toggleDevicePolicy = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    user.devicePolicyEnabled = !user.devicePolicyEnabled;
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, message: `Device policy ${user.devicePolicyEnabled ? "enabled" : "disabled"} for ${user.name}.`, enabled: user.devicePolicyEnabled });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to toggle device policy." });
  }
};

module.exports = { setupAdmin, getDeviceRequests, approveDevice, rejectDevice, resetTrustedDevice, toggleDevicePolicy, resetUserPassword, getStats, getUsers, getUser, deleteUser, verifyUser, unverifyUser, getSessions, stopSession, deleteSession };
