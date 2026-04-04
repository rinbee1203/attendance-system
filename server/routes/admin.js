const express = require("express");
const router  = express.Router();
const { protect, restrictTo } = require("../middleware/auth");
const {
  setupAdmin, resetUserPassword, getStats, getUsers, getUser, deleteUser, verifyUser, unverifyUser,
  getSessions, stopSession, deleteSession,
  getDeviceRequests, approveDevice, rejectDevice, resetTrustedDevice, toggleDevicePolicy,
} = require("../controllers/adminController");

// One-time public setup (locked once admin exists)
router.post("/setup", setupAdmin);

// All admin routes require login + admin role
router.use(protect);
router.use(restrictTo("admin"));

router.get("/stats",                   getStats);
router.get("/users",                   getUsers);
router.get("/users/:id",               getUser);
router.delete("/users/:id",            deleteUser);
router.patch("/users/:id/verify",      verifyUser);
router.patch("/users/:id/unverify",    unverifyUser);
router.patch("/users/:id/password",    resetUserPassword);
router.get("/sessions",                getSessions);
router.patch("/sessions/:id/stop",     stopSession);
router.delete("/sessions/:id",         deleteSession);

// Device management
router.get("/device-requests",                          getDeviceRequests);
router.patch("/device-requests/:userId/approve",        approveDevice);
router.delete("/device-requests/:userId/reject",        rejectDevice);
router.patch("/users/:id/reset-device",                 resetTrustedDevice);
router.patch("/users/:id/toggle-device-policy",         toggleDevicePolicy);

module.exports = router;
