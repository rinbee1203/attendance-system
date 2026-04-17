const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../middleware/auth");
const {
  checkIn, getMyAttendance, verifyToken, streamAttendance,
  markAbsences, overrideAttendance, getAbsenceSummary, updateRoster,
} = require("../controllers/attendanceController");

router.use(protect);

// Student routes
router.post("/checkin",            restrictTo("student"), checkIn);
router.get("/my",                  restrictTo("student"), getMyAttendance);
router.get("/verify/:token",       restrictTo("student"), verifyToken);

// Teacher routes
router.get("/stream/:sessionId",   restrictTo("teacher"), streamAttendance);
router.post("/mark-absences/:sessionId", restrictTo("teacher"), markAbsences);
router.patch("/:id/override",      restrictTo("teacher"), overrideAttendance);
router.get("/absence-summary/:sessionId", restrictTo("teacher"), getAbsenceSummary);
router.patch("/roster/:sessionId", restrictTo("teacher"), updateRoster);

module.exports = router;
