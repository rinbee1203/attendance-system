const express = require("express");
const router  = express.Router();
const { protect, restrictTo } = require("../middleware/auth");
const {
  getAcademicYears, createAcademicYear, setActiveYear, archiveYear,
  promoteStudents, previewPromotion,
  autoEnsureAcademicYear, updateYearEndDate,
  getSectionLeaderboard, getAttendanceForecast,
  getRecurringSchedules, createRecurringSchedule, updateRecurringSchedule,
  deleteRecurringSchedule, generateDailySessions,
} = require("../controllers/academicController");

// Academic years — admin only
router.post("/years/auto-ensure",           protect, restrictTo("admin"), autoEnsureAcademicYear);
router.patch("/years/:id/end-date",         protect, restrictTo("admin"), updateYearEndDate);
router.get("/years",                    protect, restrictTo("admin"), getAcademicYears);
router.post("/years",                   protect, restrictTo("admin"), createAcademicYear);
router.patch("/years/:id/activate",     protect, restrictTo("admin"), setActiveYear);
router.patch("/years/:id/archive",      protect, restrictTo("admin"), archiveYear);
router.get("/years/:id/preview-promote",protect, restrictTo("admin"), previewPromotion);
router.post("/years/:id/promote",       protect, restrictTo("admin"), promoteStudents);

// Leaderboard — any authenticated user
router.get("/leaderboard",              protect, getSectionLeaderboard);

// Forecast — teacher
router.get("/forecast",                 protect, restrictTo("teacher"), getAttendanceForecast);

// Recurring schedules — teacher
router.get("/schedules",                protect, restrictTo("teacher"), getRecurringSchedules);
router.post("/schedules",               protect, restrictTo("teacher"), createRecurringSchedule);
router.patch("/schedules/:id",          protect, restrictTo("teacher"), updateRecurringSchedule);
router.delete("/schedules/:id",         protect, restrictTo("teacher"), deleteRecurringSchedule);
router.post("/generate-sessions",       protect, restrictTo("teacher","admin"), generateDailySessions);

module.exports = router;
