const jwt = require("jsonwebtoken");
const User = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_change_in_production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

const generateToken = (id) => jwt.sign({ id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

// Helper — build the user payload returned in responses
const userPayload = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  studentId: user.studentId,
  grade: user.grade,       // ← NEW
  section: user.section,   // ← NEW
});

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
  try {
    const { name, email, password, role, studentId, grade, section } = req.body; // ← added grade, section

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "Email already registered." });
    }

    // Validate studentId for students
    if (role === "student" && !studentId) {
      return res.status(400).json({ success: false, message: "Student ID is required for students." });
    }

    const user = await User.create({
      name,
      email,
      password,
      role: role || "student",
      studentId,
      grade: role === "student" ? grade : undefined,     // ← NEW (only for students)
      section: role === "student" ? section : undefined, // ← NEW (only for students)
    });

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: "Registration successful!",
      token,
      user: userPayload(user),
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join(". ") });
    }
    res.status(500).json({ success: false, message: "Server error. Please try again." });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Please provide email and password." });
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    const token = generateToken(user._id);

    res.json({
      success: true,
      message: "Login successful!",
      token,
      user: userPayload(user), // ← now includes grade & section
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error. Please try again." });
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  res.json({
    success: true,
    user: userPayload(req.user), // ← now includes grade & section
  });
};

// @desc    Update profile (name, password, grade, section, profilePicture)
// @route   PATCH /api/auth/profile
// @access  Private (teacher + student)
const updateProfile = async (req, res) => {
  try {
    const { name, currentPassword, newPassword, grade, section, profilePicture } = req.body;

    const user = await User.findById(req.user._id).select("+password");
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    // Update name
    if (name && name.trim()) user.name = name.trim();

    // Student-only fields
    if (user.role === "student") {
      if (grade !== undefined) user.grade = grade;
      if (section !== undefined) user.section = section;
    }

    // Profile picture (Base64, max ~2MB)
    if (profilePicture !== undefined) {
      if (profilePicture && profilePicture.length > 500 * 1024) {
        return res.status(400).json({ success: false, message: "Image too large after compression. Please use a smaller image." });
      }
      user.profilePicture = profilePicture || null;
    }

    // Password change
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ success: false, message: "Current password is required to set a new password." });
      }
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: "Current password is incorrect." });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ success: false, message: "New password must be at least 6 characters." });
      }
      user.password = newPassword;
    }

    await user.save();

    res.json({
      success: true,
      message: "Profile updated successfully!",
      user: userPayload(user),
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join(". ") });
    }
    res.status(500).json({ success: false, message: "Server error. Please try again." });
  }
};

module.exports = { register, login, getMe, updateProfile };
