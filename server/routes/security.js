const express = require("express");
const router  = express.Router();
const { protect } = require("../middleware/auth");
const { sendVerificationEmail, verifyEmail, getLoginHistory } = require("../controllers/securityController");

router.post("/send-verification", protect, sendVerificationEmail);
router.post("/verify-email",      verifyEmail); // public — token in body
router.get("/login-history",      protect, getLoginHistory);

module.exports = router;
