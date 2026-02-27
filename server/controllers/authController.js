const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const https = require("https");
const User = require("../models/User");

// ── Send email via Resend API (uses Node built-in https — no extra package) ──
const sendEmail = ({ to, subject, html }) => new Promise((resolve, reject) => {
  const body = JSON.stringify({
    from: "AttendQR <onboarding@resend.dev>",
    to,
    subject,
    html,
  });
  const req = https.request({
    hostname: "api.resend.com",
    path: "/emails",
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
  }, (res) => {
    let data = "";
    res.on("data", chunk => data += chunk);
    res.on("end", () => {
      try {
        const parsed = JSON.parse(data);
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
        else reject(new Error(parsed?.message || `Email send failed: ${res.statusCode}`));
      } catch(e) { reject(e); }
    });
  });
  req.on("error", reject);
  req.write(body);
  req.end();
});

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
  grade: user.grade,
  section: user.section,
  profilePicture: user.profilePicture || null,
  birthdate: user.birthdate || null,
  school: user.school || null,
  subjectsTaught: user.subjectsTaught || null,
  department: user.department || null,
  yearsTeaching: user.yearsTeaching || null,
  phoneNumber: user.phoneNumber || null,
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
    const { name, currentPassword, newPassword, grade, section, profilePicture, birthdate, school, subjectsTaught, department, yearsTeaching, phoneNumber } = req.body;

    const user = await User.findById(req.user._id).select("+password");
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    // Update name
    if (name && name.trim()) user.name = name.trim();

    // Teacher-only fields
    if (user.role === "teacher") {
      if (school !== undefined) user.school = school;
      if (department !== undefined) user.department = department;
      if (subjectsTaught !== undefined) user.subjectsTaught = subjectsTaught;
      if (yearsTeaching !== undefined) user.yearsTeaching = yearsTeaching ? Number(yearsTeaching) : null;
      if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
    }

    // Student-only fields
    if (user.role === "student") {
      if (grade !== undefined) user.grade = grade;
      if (section !== undefined) user.section = section;
      if (birthdate !== undefined) user.birthdate = birthdate ? new Date(birthdate) : null;
    }
    // Birthdate applies to all roles
    if (user.role === "teacher" && birthdate !== undefined) user.birthdate = birthdate ? new Date(birthdate) : null;
    // Teacher-only fields
    if (user.role === "teacher") {
      if (birthdate !== undefined) user.birthdate = birthdate ? new Date(birthdate) : null;
      if (school !== undefined) user.school = school;
      if (subjectsTaught !== undefined) user.subjectsTaught = subjectsTaught;
      if (department !== undefined) user.department = department;
      if (yearsTeaching !== undefined) user.yearsTeaching = yearsTeaching ? Number(yearsTeaching) : null;
      if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
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

// @desc    Forgot password — send reset email
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Please provide your email address." });

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      return res.status(404).json({ success: false, message: "This email address is not registered. Please check and try again." });
    }

    // Generate reset token
    const token = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken   = crypto.createHash("sha256").update(token).digest("hex");
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";
    const resetUrl = `${CLIENT_URL}/reset-password?token=${token}`;

    await sendEmail({
      to: user.email,
      subject: "Reset your AttendQR password",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f5f5ff;border-radius:16px;">
          <div style="background:linear-gradient(135deg,#7c6fff,#ff6b8a);border-radius:14px;padding:12px 18px;display:inline-block;margin-bottom:24px;">
            <span style="color:#fff;font-weight:800;font-size:1.1rem;">AttendQR</span>
          </div>
          <h2 style="color:#1a1a2e;margin:0 0 8px;font-size:1.4rem;">Reset your password</h2>
          <p style="color:#555;margin:0 0 28px;font-size:0.9rem;">Hi <strong>${user.name}</strong>, we received a request to reset your AttendQR password. Click the button below to set a new one.</p>
          <a href="${resetUrl}" style="display:inline-block;background:#7c6fff;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:1rem;margin-bottom:24px;">Reset Password</a>
          <p style="color:#888;font-size:0.8rem;margin:0;">This link expires in <strong>1 hour</strong>. If you didn't request this, you can safely ignore this email.</p>
          <hr style="border:none;border-top:1px solid #e0e0f0;margin:24px 0;">
          <p style="color:#aaa;font-size:0.75rem;margin:0;">AttendQR · QR-based Attendance System</p>
        </div>
      `,
    });

    res.json({ success: true, message: "If that email is registered, a reset link has been sent." });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ success: false, message: "Failed to send reset email. Please try again." });
  }
};

// @desc    Reset password using token
// @route   POST /api/auth/reset-password
// @access  Public
const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ success: false, message: "Token and new password are required." });
    if (password.length < 6) return res.status(400).json({ success: false, message: "Password must be at least 6 characters." });

    const hashed = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      resetPasswordToken: hashed,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) return res.status(400).json({ success: false, message: "Reset link is invalid or has expired." });

    user.password = password;
    user.resetPasswordToken   = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ success: true, message: "Password reset successfully! You can now sign in." });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error. Please try again." });
  }
};

module.exports = { register, login, getMe, updateProfile, forgotPassword, resetPassword };
