const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const { register, login, getMe, updateProfile, forgotPassword, resetPassword } = require("../controllers/authController");

// Public routes
router.post("/register", register);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// Protected routes
router.get("/me", protect, getMe);
router.patch("/profile", protect, updateProfile);

module.exports = router;
