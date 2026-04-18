const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../middleware/auth");
const { createSession, startSession, refreshQR, stopSession, getSessions, getSession, deleteSession, updateSession, getStudentsForRoster } = require("../controllers/sessionsController");

// All routes require authentication and teacher role
router.use(protect, restrictTo("teacher"));

router.get("/", getSessions);
router.post("/", createSession);
router.get("/students", getStudentsForRoster); // For roster builder
router.get("/:id", getSession);
router.post("/:id/start", startSession);
router.post("/:id/refresh-qr", refreshQR);
router.post("/:id/stop", stopSession);

router.patch("/:id", updateSession);
router.delete("/:id", deleteSession);

module.exports = router;
