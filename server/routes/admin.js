const express = require("express");
const router  = express.Router();
const { protect, restrictTo } = require("../middleware/auth");
const {
  setupAdmin, getAnalytics, getRiskPrediction, getAnomalies,
  getStats, getActivityOverview, getSystemLogs,
  getUsers, getUser, deleteUser, verifyUser, unverifyUser, resetUserPassword,
  bulkVerifyUsers, bulkDeleteUsers, exportUsersExcel,
  sendEmailBlast,
  getAnnouncements, createAnnouncement, deleteAnnouncement, markAnnouncementRead,
  globalSearch,
  getSessions, stopSession, deleteSession,
  getDeviceRequests, approveDevice, rejectDevice, resetTrustedDevice, toggleDevicePolicy,
} = require("../controllers/adminController");

// One-time setup — public
router.post("/setup", setupAdmin);

// Announcements — public read (students/teachers need to see them)
router.get("/announcements",           protect, getAnnouncements);
router.post("/announcements/:id/read", protect, markAnnouncementRead);

// All routes below require admin role
router.use(protect);
router.use(restrictTo("admin"));

// Dashboard
router.get("/stats",              getStats);
// AI/ML endpoints (zero cost — pure JS computation)
router.get("/analytics",          getAnalytics);
router.get("/risk",               getRiskPrediction);
router.get("/anomalies",          getAnomalies);
router.get("/activity",           getActivityOverview);
router.get("/logs",               getSystemLogs);
router.get("/search",             globalSearch);

// Users
router.get("/users",              getUsers);
router.get("/users/:id",          getUser);
router.delete("/users/:id",       deleteUser);
router.patch("/users/:id/verify",             verifyUser);
router.patch("/users/:id/unverify",           unverifyUser);
router.patch("/users/:id/password",           resetUserPassword);
router.patch("/users/:id/reset-device",       resetTrustedDevice);
router.patch("/users/:id/toggle-device-policy", toggleDevicePolicy);

// Bulk actions
router.post("/users/bulk-verify",   bulkVerifyUsers);
router.post("/users/bulk-delete",   bulkDeleteUsers);
router.get("/users/export",         exportUsersExcel);

// Email blast
router.post("/email-blast",        sendEmailBlast);

// Announcements (admin CRUD)
router.post("/announcements",      createAnnouncement);
router.delete("/announcements/:id", deleteAnnouncement);

// Sessions
router.get("/sessions",                       getSessions);
router.patch("/sessions/:id/stop",            stopSession);
router.delete("/sessions/:id",                deleteSession);

// Device management
router.get("/device-requests",                          getDeviceRequests);
router.patch("/device-requests/:userId/approve",        approveDevice);
router.delete("/device-requests/:userId/reject",        rejectDevice);

module.exports = router;
