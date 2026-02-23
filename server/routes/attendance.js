const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../middleware/auth");
const { checkIn, getMyAttendance, verifyToken } = require("../controllers/attendanceController");

router.use(protect);

// Student routes
router.post("/checkin", restrictTo("student"), checkIn);
router.get("/my", restrictTo("student"), getMyAttendance);
router.get("/verify/:token", restrictTo("student"), verifyToken);

module.exports = router;
