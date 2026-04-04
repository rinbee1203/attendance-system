const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../middleware/auth");
const { checkIn, getMyAttendance, verifyToken, streamAttendance } = require("../controllers/attendanceController");

router.use(protect);

// Student routes
router.post("/checkin",            restrictTo("student"), checkIn);
router.get("/my",                  restrictTo("student"), getMyAttendance);
router.get("/verify/:token",       restrictTo("student"), verifyToken);

// Teacher real-time SSE stream — teacher subscribes to live check-ins for a session
router.get("/stream/:sessionId",   restrictTo("teacher"), streamAttendance);

module.exports = router;
