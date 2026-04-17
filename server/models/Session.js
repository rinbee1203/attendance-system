const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema(
  {
    subject: { type: String, required: [true, "Subject is required"], trim: true },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    qrToken: { type: String, unique: true, sparse: true },
    qrExpiresAt: { type: Date },
    isActive: { type: Boolean, default: false },
    startTime: { type: Date },
    endTime: { type: Date },
    room:             { type: String, trim: true },
    description:      { type: String, trim: true },
    activatedAt:      { type: Date, default: null },  // resets every time teacher starts session
    lateAfterMinutes: { type: Number, default: 15 },  // configurable grace period (minutes)
    scheduledStart:   { type: Date, default: null },  // when teacher plans to start (display only)
    scheduledEnd:     { type: Date, default: null },  // when teacher plans to end (display only)
    allowedGrades:   { type: [String], default: [] },
    allowedSections: { type: [String], default: [] },
    // Class roster — enrolled students for this session/subject
    roster: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    // Absence limit — warn when student exceeds this many absences per subject
    absenceLimit:    { type: Number, default: 3 },
    absenceLimitEnabled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Virtual to check if session is expired
sessionSchema.virtual("isExpired").get(function () {
  if (!this.endTime) return false;
  return new Date() > this.endTime;
});

// Virtual to check QR validity
sessionSchema.virtual("isQrValid").get(function () {
  if (!this.qrToken || !this.qrExpiresAt) return false;
  return new Date() < this.qrExpiresAt && this.isActive;
});

sessionSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("Session", sessionSchema);
