const mongoose = require("mongoose");

const academicYearSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true }, // e.g. "2025-2026"
  startDate:   { type: Date, required: true },
  endDate:     { type: Date, required: true },
  isActive:    { type: Boolean, default: false }, // only one active at a time
  semester:    { type: String, enum: ["1st", "2nd", "Summer"], default: "1st" },
  archivedAt:  { type: Date, default: null },
  // Grade promotion config
  gradeMap: [{
    fromGrade:  { type: String }, // e.g. "Grade 11"
    toGrade:    { type: String }, // e.g. "Grade 12"
  }],
  promotedAt:  { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model("AcademicYear", academicYearSchema);
