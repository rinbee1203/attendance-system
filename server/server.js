const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();

// ── SSE client registry for real-time attendance ──────────────────────────
// Map: sessionId -> Set of response objects (teacher browser connections)
const sseClients = new Map();
app.locals.sseClients = sseClients;

// Middleware
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/sessions", require("./routes/sessions"));
app.use("/api/attendance", require("./routes/attendance"));
app.use("/api/security",   require("./routes/security"));
app.use("/api/admin",      require("./routes/admin"));

// Health check
app.get("/api/health", (req, res) => res.json({ status: "OK", message: "Server is running" }));

// Connect DB & Start Server
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/attendance_system";

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });

module.exports = app;
