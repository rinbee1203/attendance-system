const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema(
  {
    subject: { type: String, required: [true, "Subject is required"], trim: true },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    qrToken: { type: String, unique: true, sparse: true },
    qrExpiresAt: { type: Date },
    isActive: { type: Boolean, default: false },
    startTime: { type: Date },
    endTime: { type: Date },       // actual time teacher clicked Stop
    expiresAt: { type: Date },     // 210-day expiry set at creation
    room: { type: String, trim: true },
    description: { type: String, trim: true },
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
