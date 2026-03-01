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

    // Determine status (late if 15+ min after start)
    let status = "present";
    if (session.startTime) {
      const minutesSinceStart = (Date.now() - new Date(session.startTime).getTime()) / 60000;
      if (minutesSinceStart > 15) status = "late";
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

module.exports = { checkIn, getMyAttendance, verifyToken };
