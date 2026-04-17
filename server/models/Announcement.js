const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema({
  title:     { type: String, required: true, trim: true },
  message:   { type: String, required: true, trim: true },
  type:      { type: String, enum: ["info", "warning", "urgent", "success"], default: "info" },
  targetRole:{ type: String, enum: ["all", "student", "teacher"], default: "all" },
  author:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  expiresAt: { type: Date, default: null }, // null = never expires
  pinned:    { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model("Announcement", announcementSchema);
