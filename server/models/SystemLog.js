const mongoose = require("mongoose");

const systemLogSchema = new mongoose.Schema({
  admin:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  adminName:  { type: String },
  action:     { type: String, required: true }, // e.g. "DELETE_USER", "VERIFY_USER"
  target:     { type: String }, // e.g. user name or session subject
  targetId:   { type: String },
  targetType: { type: String }, // "user", "session", "announcement"
  details:    { type: String }, // extra context
  ip:         { type: String },
}, { timestamps: true });

module.exports = mongoose.model("SystemLog", systemLogSchema);
