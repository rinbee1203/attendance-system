const express = require("express");
const router  = express.Router();
const { protect } = require("../middleware/auth");
const {
  sendVerificationEmail, verifyEmail, getLoginHistory,
  enable2FA, confirm2FA, disable2FA, verify2FA,
  getActiveSessions, revokeSession, revokeAllSessions,
  getMyIP,
} = require("../controllers/securityController");

// Email verification
router.post("/send-verification", protect, sendVerificationEmail);
router.post("/verify-email",      verifyEmail);

// Login history
router.get("/login-history",      protect, getLoginHistory);

// 2FA
router.post("/2fa/enable",        protect, enable2FA);
router.post("/2fa/confirm",       protect, confirm2FA);
router.post("/2fa/disable",       protect, disable2FA);
router.post("/2fa/verify",        verify2FA); // public — uses tempToken

// Active sessions / device management
router.get("/sessions",           protect, getActiveSessions);
router.delete("/sessions/all",    protect, revokeAllSessions);
router.delete("/sessions/:sessionId", protect, revokeSession);

// Real-time IP
router.get("/my-ip",              protect, getMyIP);

module.exports = router;
