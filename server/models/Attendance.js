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
    markedAbsentBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    absentReason:   { type: String, default: null },
    autoMarked:     { type: Boolean, default: false },
    overriddenBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    overriddenAt:   { type: Date, default: null },
    // Graduation snapshot — preserved after student account is deleted
    studentNameSnapshot:    { type: String, default: null },
    studentGradeSnapshot:   { type: String, default: null },
    studentSectionSnapshot: { type: String, default: null },
    graduatedAt:            { type: Date, default: null },
    graduatedYear:          { type: String, default: null },
  },
  { timestamps: true }
);

// One record per student per session per day
attendanceSchema.index({ student: 1, session: 1, attendanceDate: 1 }, { unique: true });

module.exports = mongoose.model("Attendance", attendanceSchema);
