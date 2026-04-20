const mongoose = require("mongoose");

const academicYearSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true }, // e.g. "2025-2026"
  startDate:   { type: Date, required: true },
  endDate:     { type: Date, required: true },
  isActive:    { type: Boolean, default: false }, // only one active at a time
  semester:    { type: String, enum: ["1st", "2nd", "Full Year", "Summer"], default: "Full Year" },
  archivedAt:  { type: Date, default: null },
  // Grade promotion config
  gradeMap: [{
    fromGrade: { type: String }, // e.g. "Grade 11"
    toGrade:   { type: String }, // e.g. "Grade 12" or "Graduated"
  }],
  promotedAt: { type: Date, default: null },
  // Summary stored after promotion is run
  promotionSummary: [{
    fromGrade:  { type: String },
    toGrade:    { type: String },
    count:      { type: Number },
    graduated:  { type: Boolean, default: false },
  }],
  promotedCount:   { type: Number, default: 0 },
  graduatedCount:  { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model("AcademicYear", academicYearSchema);
