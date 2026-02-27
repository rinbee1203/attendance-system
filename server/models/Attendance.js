const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    session: { type: mongoose.Schema.Types.ObjectId, ref: "Session", required: true },
    timestamp: { type: Date, default: Date.now },
    status: { type: String, enum: ["present", "late"], default: "present" },
    ipAddress: { type: String },
    // Store just the date (YYYY-MM-DD) in Manila timezone for daily duplicate checking
    attendanceDate: { type: String },
  },
  { timestamps: true }
);

// Allow multiple records per session — but only one per student per session per day
attendanceSchema.index({ student: 1, session: 1, attendanceDate: 1 }, { unique: true });

module.exports = mongoose.model("Attendance", attendanceSchema);
