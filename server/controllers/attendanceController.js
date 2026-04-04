const Session = require("../models/Session");
const Attendance = require("../models/Attendance");

// @desc    Check in via QR token
// @route   POST /api/attendance/checkin
// @access  Student only
const checkIn = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, message: "QR token is required." });
    }

    // Find and validate session
    const session = await Session.findOne({ qrToken: token });

    if (!session) {
      return res.status(400).json({ success: false, message: "Invalid QR code. Please scan again." });
    }

    if (!session.isActive) {
      return res.status(400).json({ success: false, message: "This session is no longer active." });
    }

    if (new Date() > session.qrExpiresAt) {
      return res.status(400).json({ success: false, message: "QR code has expired. Ask your teacher to refresh it." });
    }

    // Check for duplicate attendance — only block if already checked in TODAY (Manila time)
    const nowC = new Date();
    const manilaOffsetC = 8 * 60;
    const manilaTimeC = new Date(nowC.getTime() + manilaOffsetC * 60 * 1000);
    const todayStrC = manilaTimeC.toISOString().split("T")[0]; // YYYY-MM-DD

    const existing = await Attendance.findOne({
      student: req.user._id,
      session: session._id,
      attendanceDate: todayStrC,
    });
    if (existing) {
      return res.status(400).json({ success: false, message: "You have already marked attendance for today's session." });
    }

    // ── Grade / Section filter ────────────────────────────────────────────────
    const student = req.user;
    if (session.allowedGrades && session.allowedGrades.length > 0) {
      const sg = (student.grade || "").trim().toLowerCase();
      const allowed = session.allowedGrades.map(g => g.trim().toLowerCase());
      if (!allowed.includes(sg)) {
        return res.status(403).json({
          success: false,
          message: `This session is restricted to: ${session.allowedGrades.join(", ")}. Your grade (${student.grade || "not set"}) is not allowed.`,
          restricted: true,
        });
      }
    }
    if (session.allowedSections && session.allowedSections.length > 0) {
      const ss = (student.section || "").trim().toLowerCase();
      const allowed = session.allowedSections.map(s => s.trim().toLowerCase());
      if (!allowed.includes(ss)) {
        return res.status(403).json({
          success: false,
          message: `This session is restricted to: ${session.allowedSections.join(", ")}. Your section (${student.section || "not set"}) is not allowed.`,
          restricted: true,
        });
      }
    }

    // Determine status — use activatedAt (when teacher pressed Start THIS session)
    // Falls back to startTime if activatedAt not set (backward compat)
    let status = "present";
    const refTime = session.activatedAt || session.startTime;
    if (refTime) {
      const minutesSinceActivated = (Date.now() - new Date(refTime).getTime()) / 60000;
      const threshold = typeof session.lateAfterMinutes === "number" ? session.lateAfterMinutes : 15;
      if (minutesSinceActivated > threshold) {
        status = "late";
      }
    }

    // Store date string in Manila timezone (UTC+8) for the unique index
    const now = new Date();
    const manilaOffset = 8 * 60; // UTC+8 in minutes
    const manilaTime = new Date(now.getTime() + manilaOffset * 60 * 1000);
    const manilaDate = manilaTime.toISOString().split("T")[0]; // YYYY-MM-DD

    console.log("attendanceDate being saved:", manilaDate);

    const attendance = await Attendance.create({
      student: req.user._id,
      session: session._id,
      status,
      ipAddress: req.ip,
      attendanceDate: manilaDate,
    });

    await attendance.populate("session", "subject room");
    await attendance.populate("student", "name email studentId grade section profilePicture");

    // ── Broadcast real-time update via SSE to all teachers watching this session ──
    const sseClients = req.app.locals.sseClients;
    const sessionKey = session._id.toString();
    if (sseClients && sseClients.has(sessionKey)) {
      const payload = JSON.stringify({
        type: "new_attendance",
        attendance: {
          _id: attendance._id,
          status,
          timestamp: attendance.timestamp,
          attendanceDate: attendance.attendanceDate,
          student: {
            _id: req.user._id,
            name: req.user.name,
            email: req.user.email,
            studentId: req.user.studentId,
            grade: req.user.grade,
            section: req.user.section,
            profilePicture: req.user.profilePicture,
          },
        },
      });
      for (const res_ of sseClients.get(sessionKey)) {
        try { res_.write(`data: ${payload}

`); } catch(e) {}
      }
    }

    res.status(201).json({
      success: true,
      message: `✅ Attendance marked as ${status}!`,
      attendance: {
        ...attendance.toJSON(),
        studentName: req.user.name,
        subject: attendance.session.subject,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: "You have already marked attendance for today's session." });
    }
    res.status(500).json({ success: false, message: "Failed to mark attendance." });
  }
};

// @desc    Get student's attendance history
// @route   GET /api/attendance/my
// @access  Student only
const getMyAttendance = async (req, res) => {
  try {
    const attendance = await Attendance.find({ student: req.user._id })
      .populate({
        path: "session",
        select: "subject room startTime teacher",
        populate: { path: "teacher", select: "name" },
      })
      .sort({ timestamp: -1 });

    res.json({ success: true, attendance });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch attendance history." });
  }
};

// @desc    Verify QR token (before showing checkin form)
// @route   GET /api/attendance/verify/:token
// @access  Student only
const verifyToken = async (req, res) => {
  try {
    const session = await Session.findOne({ qrToken: req.params.token }).populate("teacher", "name");

    if (!session || !session.isActive || new Date() > session.qrExpiresAt) {
      return res.status(400).json({ success: false, message: "Invalid or expired QR code." });
    }

    // Check if already attended TODAY (Manila time) for this session
    const nowV = new Date();
    const manilaOffsetV = 8 * 60;
    const manilaTimeV = new Date(nowV.getTime() + manilaOffsetV * 60 * 1000);
    const todayDateStr = manilaTimeV.toISOString().split("T")[0]; // YYYY-MM-DD

    const existing = await Attendance.findOne({
      student: req.user._id,
      session: session._id,
      attendanceDate: todayDateStr,
    });

    res.json({
      success: true,
      session: { id: session._id, subject: session.subject, room: session.room, teacher: session.teacher?.name },
      alreadyAttended: !!existing,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to verify token." });
  }
};


// @desc    SSE stream — teacher subscribes to real-time attendance for a session
// @route   GET /api/attendance/stream/:sessionId
// @access  Teacher only
const streamAttendance = async (req, res) => {
  const { sessionId } = req.params;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable Nginx buffering
  res.flushHeaders();

  // Register this connection
  const sseClients = req.app.locals.sseClients;
  if (!sseClients.has(sessionId)) sseClients.set(sessionId, new Set());
  sseClients.get(sessionId).add(res);

  // Send initial heartbeat
  res.write(`data: ${JSON.stringify({ type: "connected", sessionId })}

`);

  // Keepalive ping every 25 seconds (prevents proxy timeouts)
  const ping = setInterval(() => {
    try { res.write(`: ping

`); } catch(e) {}
  }, 25000);

  // Cleanup on disconnect
  req.on("close", () => {
    clearInterval(ping);
    if (sseClients.has(sessionId)) {
      sseClients.get(sessionId).delete(res);
      if (sseClients.get(sessionId).size === 0) sseClients.delete(sessionId);
    }
  });
};

module.exports = { checkIn, getMyAttendance, verifyToken, streamAttendance };
