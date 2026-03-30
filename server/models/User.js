const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "Name is required"], trim: true },
    email: { type: String, required: [true, "Email is required"], unique: true, lowercase: true, trim: true },
    password: { type: String, required: [true, "Password is required"], minlength: 6, select: false },
    role: { type: String, enum: ["student", "teacher", "admin"], default: "student" },
    studentId: { type: String, trim: true, sparse: true },

    // Student classification fields
    grade: { type: String, trim: true },    // e.g. "Grade 11", "Year 2", "11"
    section: { type: String, trim: true },  // e.g. "Section A", "Rizal", "BSCS-2A"

    // Profile picture stored as Base64 string
    profilePicture: { type: String, default: null },

    // Student personal info
    birthdate: { type: Date, default: null },

    // Email verification
    isVerified: { type: Boolean, default: false },
    verifyEmailToken: { type: String, default: null },
    verifyEmailExpires: { type: Date, default: null },

    // Password reset
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },

    // Login activity log (last 20 entries)
    loginHistory: [{
      ip:             { type: String },
      userAgent:      { type: String },
      browser:        { type: String },
      browserVersion: { type: String },
      os:             { type: String },
      device:         { type: String },
      at:             { type: Date, default: Date.now },
      success:        { type: Boolean, default: true },
    }],

    // Rate limiting — failed login tracking
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil:           { type: Date, default: null },

    // 2FA via email OTP
    twoFAEnabled:   { type: Boolean, default: false },
    twoFASecret:    { type: String, default: null, select: false }, // hashed OTP
    twoFAExpires:   { type: Date,   default: null },
    twoFAPending:   { type: Boolean, default: false }, // waiting for OTP after login

    // Active sessions (device management)
    activeSessions: [{
      sessionId:  { type: String },  // random UUID
      ip:         { type: String },
      browser:    { type: String },
      os:         { type: String },
      device:     { type: String },
      createdAt:  { type: Date, default: Date.now },
      lastSeenAt: { type: Date, default: Date.now },
    }],

    // Security flags
    mustChangePassword: { type: Boolean, default: false }, // force change on next login
    passwordChangedAt:  { type: Date, default: null },
    lastKnownIP:        { type: String, default: null },   // for suspicious login detection

    // Teacher professional info
    school:        { type: String, trim: true },
    department:    { type: String, trim: true },
    subjectsTaught:{ type: String, trim: true },
    yearsTeaching: { type: Number, default: null },
    phoneNumber:   { type: String, trim: true },

    // Teacher profile fields
    school: { type: String, trim: true, default: null },      // school/institution name
    subjectsTaught: { type: String, trim: true, default: null }, // e.g. "Math, Science"
    department: { type: String, trim: true, default: null },  // e.g. "STEM Department"
    yearsTeaching: { type: Number, default: null },           // years of experience
    phoneNumber: { type: String, trim: true, default: null },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
