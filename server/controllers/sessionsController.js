const crypto = require("crypto");
const QRCode = require("qrcode");
const Session = require("../models/Session");
const Attendance = require("../models/Attendance");

const QR_EXPIRY_SECONDS = parseInt(process.env.QR_EXPIRY_SECONDS) || 60;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

// @desc    Create a new session
// @route   POST /api/sessions
// @access  Teacher only
const createSession = async (req, res) => {
  try {
    const { subject, room, description, expiresAt } = req.body;

    if (!subject) {
      return res.status(400).json({ success: false, message: "Subject is required." });
    }

    // Calculate default 210-day expiry if none provided
    const expiry = expiresAt ? new Date(expiresAt) : new Date(Date.now() + 210 * 24 * 60 * 60 * 1000);

    const session = await Session.create({
      subject,
      teacher: req.user._id,
      room,
      description,
      expiresAt: expiry,   // 210-day expiry — never overwritten by Stop
    });

    res.status(201).json({ success: true, message: "Session created successfully!", session });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to create session." });
  }
};

// @desc    Start session & generate QR
// @route   POST /api/sessions/:id/start
// @access  Teacher only
const startSession = async (req, res) => {
  try {
    const session = await Session.findOne({ _id: req.params.id, teacher: req.user._id });

    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found." });
    }

    // Block start if session has expired
    if (session.expiresAt && new Date() > new Date(session.expiresAt)) {
      return res.status(400).json({ success: false, message: "This session has expired and can no longer be started." });
    }

    const token = crypto.randomBytes(20).toString("hex");
    const qrExpiresAt = new Date(Date.now() + QR_EXPIRY_SECONDS * 1000);

    session.isActive = true;
    session.startTime = session.startTime || new Date();
    session.qrToken = token;
    session.qrExpiresAt = qrExpiresAt;
    await session.save();

    const checkinUrl = `${CLIENT_URL}/checkin?token=${token}`;
    const qrDataUrl = await QRCode.toDataURL(checkinUrl, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: 300,
      color: { dark: "#1a1a2e", light: "#ffffff" },
    });

    res.json({
      success: true,
      message: "Session started! QR code generated.",
      session: { ...session.toJSON(), qrDataUrl, checkinUrl },
      expiresIn: QR_EXPIRY_SECONDS,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to start session." });
  }
};

// @desc    Refresh QR token (rotate every 60 sec)
// @route   POST /api/sessions/:id/refresh-qr
// @access  Teacher only
const refreshQR = async (req, res) => {
  try {
    const session = await Session.findOne({ _id: req.params.id, teacher: req.user._id });

    if (!session || !session.isActive) {
      return res.status(400).json({ success: false, message: "Session is not active." });
    }

    const token = crypto.randomBytes(20).toString("hex");
    const qrExpiresAt = new Date(Date.now() + QR_EXPIRY_SECONDS * 1000);

    session.qrToken = token;
    session.qrExpiresAt = qrExpiresAt;
    await session.save();

    const checkinUrl = `${CLIENT_URL}/checkin?token=${token}`;
    const qrDataUrl = await QRCode.toDataURL(checkinUrl, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: 300,
      color: { dark: "#1a1a2e", light: "#ffffff" },
    });

    res.json({ success: true, session: { ...session.toJSON(), qrDataUrl, checkinUrl }, expiresIn: QR_EXPIRY_SECONDS });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to refresh QR." });
  }
};

// @desc    Stop session
// @route   POST /api/sessions/:id/stop
// @access  Teacher only
const stopSession = async (req, res) => {
  try {
    const session = await Session.findOne({ _id: req.params.id, teacher: req.user._id });

    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found." });
    }

    session.isActive = false;
    session.endTime = new Date();   // actual stop time
    session.qrToken = undefined;
    session.qrExpiresAt = undefined;
    await session.save();

    res.json({ success: true, message: "Session stopped.", session });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to stop session." });
  }
};

// @desc    Get teacher's sessions
// @route   GET /api/sessions
// @access  Teacher only
const getSessions = async (req, res) => {
  try {
    const sessions = await Session.find({ teacher: req.user._id }).sort({ createdAt: -1 });

    // Auto-stop any active sessions that have passed their expiresAt
    const now = new Date();
    await Promise.all(
      sessions
        .filter(s => s.isActive && s.expiresAt && now > new Date(s.expiresAt))
        .map(async (s) => {
          s.isActive = false;
          s.endTime = s.endTime || now;
          s.qrToken = undefined;
          s.qrExpiresAt = undefined;
          await s.save();
        })
    );

    // Re-fetch after auto-stop so list reflects latest state
    const updatedSessions = await Session.find({ teacher: req.user._id }).sort({ createdAt: -1 });

    // Attach attendance count
    const sessionsWithCount = await Promise.all(
      updatedSessions.map(async (s) => {
        const count = await Attendance.countDocuments({ session: s._id });
        return { ...s.toJSON(), attendanceCount: count };
      })
    );

    res.json({ success: true, sessions: sessionsWithCount });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch sessions." });
  }
};

// @desc    Get single session with attendance
// @route   GET /api/sessions/:id
// @access  Teacher only
const getSession = async (req, res) => {
  try {
    const session = await Session.findOne({ _id: req.params.id, teacher: req.user._id });

    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found." });
    }

    const attendance = await Attendance.find({ session: session._id })
      .populate("student", "name email studentId grade section") // ← added grade, section
      .sort({ timestamp: 1 });

    res.json({ success: true, session: session.toJSON(), attendance });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch session." });
  }
};

module.exports = { createSession, startSession, refreshQR, stopSession, getSessions, getSession };
