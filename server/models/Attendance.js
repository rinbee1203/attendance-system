const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    student:        { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    session:        { type: mongoose.Schema.Types.ObjectId, ref: "Session", required: true },
    timestamp:      { type: Date, default: Date.now },
    status:         { type: String, enum: ["present", "late", "absent", "excused"], default: "present" },
    ipAddress:      { type: String },
    attendanceDate: { type: String }, // YYYY-MM-DD Manila timezone
    // Absence tracking
    markedAbsentBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, // teacher/admin who marked
    absentReason:   { type: String, default: null },   // optional reason
    autoMarked:     { type: Boolean, default: false },  // true = auto-marked when session ended
    overriddenBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, // teacher who overrode
    overriddenAt:   { type: Date, default: null },
  },
  { timestamps: true }
);

// One record per student per session per day
attendanceSchema.index({ student: 1, session: 1, attendanceDate: 1 }, { unique: true });

module.exports = mongoose.model("Attendance", attendanceSchema);
