const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const { register, login, getMe, updateProfile } = require("../controllers/authController");

router.post("/register", register);
router.post("/login", login);
router.get("/me", protect, getMe);
router.patch("/profile", protect, updateProfile); // teachers & students

module.exports = router;
