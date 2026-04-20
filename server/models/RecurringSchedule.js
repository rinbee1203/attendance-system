const mongoose = require("mongoose");

const recurringScheduleSchema = new mongoose.Schema({
  teacher:         { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  subject:         { type: String, required: true, trim: true },
  room:            { type: String, trim: true },
  description:     { type: String, trim: true },
  // Days: 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat
  daysOfWeek:      { type: [Number], required: true },
  startTime:       { type: String, required: true }, // "08:00" 24h format
  durationMinutes: { type: Number, default: 60 },
  lateAfterMinutes:{ type: Number, default: 15 },
  allowedGrades:   { type: [String], default: [] },
  allowedSections: { type: [String], default: [] },
  academicYear:    { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear" },
  isActive:        { type: Boolean, default: true },
  // Track which dates already had sessions auto-created
  createdDates:    { type: [String], default: [] }, // ["2025-08-04","2025-08-06"]
  absenceLimit:    { type: Number, default: 3 },
  absenceLimitEnabled: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model("RecurringSchedule", recurringScheduleSchema);
