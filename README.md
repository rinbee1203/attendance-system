# AttendQR — Smart QR Attendance System

> A full-stack web application for digital classroom attendance management using QR codes, real-time streaming, AI-powered analytics, and enterprise-grade security — deployed at **zero recurring cost**.

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Features by Role](#features-by-role)
5. [Security Architecture](#security-architecture)
6. [AI & Analytics](#ai--analytics)
7. [Database Models](#database-models)
8. [API Reference](#api-reference)
9. [Environment Variables](#environment-variables)
10. [Deployment Guide](#deployment-guide)
11. [Development Notes](#development-notes)
12. [Known Limitations](#known-limitations)

---

## Overview

AttendQR replaces paper-based and manual roll-call attendance with a secure, contactless QR-code system. Teachers generate **60-second rotating QR codes** that students scan using the built-in browser camera — no app installation required. The system records check-ins with Present/Late status in real time, streams updates to the teacher's screen via SSE, and provides AI-powered analytics, absence tracking, and a comprehensive admin panel — all running on free-tier infrastructure.

### Key Differentiators

| Feature | AttendQR | Traditional |
|---------|----------|-------------|
| Check-in time | < 20 seconds | 5–10 minutes |
| Proxy prevention | Multi-layer (device + AI) | None |
| Real-time updates | SSE push | Manual refresh |
| Analytics | AI risk + anomaly detection | None |
| Cost | Zero recurring | Paper + admin time |
| Security | 12-layer security suite | None |

---

## Tech Stack

| Layer | Technology | Hosting | Purpose |
|-------|-----------|---------|---------|
| Frontend | React 18 (JSX, ~7,000 lines) | Vercel | UI, routing, state management |
| Backend | Node.js 22 + Express | Render (free) | REST API, business logic, SSE |
| Database | MongoDB Atlas (Mongoose) | Atlas Cloud (free) | Data persistence |
| Email | Resend API | resend.com (free tier) | Verification, alerts, OTP, blasts |
| QR Generation | qrcode (npm) | — | QR code image generation |
| QR Scanning | jsQR (CDN, preloaded) | unpkg.com | Browser-based QR decoding |
| Excel Exports | SheetJS (CDN) | cdnjs | Styled .xlsx file generation |
| Real-time | Server-Sent Events (SSE) | Built-in | Live attendance streaming |

---

## Project Structure

```
attendance-system/
├── client/
│   ├── public/
│   │   ├── index.html          # Preloads jsQR; CSP meta tags
│   │   └── favicon.svg
│   ├── src/
│   │   └── App.jsx             # Complete frontend (~7,000 lines)
│   └── vercel.json             # CSP headers allowing CDN scripts
└── server/
    ├── controllers/
    │   ├── adminController.js  # Admin panel, AI endpoints, announcements
    │   ├── attendanceController.js  # Check-in, SSE, absence tracking
    │   ├── authController.js   # Auth, device policy, 2FA
    │   ├── securityController.js    # OTP, sessions, IP detection
    │   └── sessionsController.js    # Session lifecycle, roster
    ├── middleware/
    │   └── auth.js             # JWT protect + restrictTo + SSE query token
    ├── models/
    │   ├── Announcement.js     # Admin announcements with targeting
    │   ├── Attendance.js       # Check-ins with absent/excused status
    │   ├── Session.js          # Sessions with roster + absence limit
    │   ├── SystemLog.js        # Admin action audit trail
    │   └── User.js             # Users with security + device fields
    ├── routes/
    │   ├── admin.js            # Admin routes including AI endpoints
    │   ├── auth.js             # Auth + device request routes
    │   ├── attendance.js       # Check-in + SSE stream + absence routes
    │   ├── security.js         # 2FA, sessions, IP, login history
    │   └── sessions.js         # Session CRUD + roster students
    └── server.js               # Express app + SSE client registry
```

---

## Features by Role

### 🎓 Student

| Feature | Description |
|---------|-------------|
| **Built-in QR Scanner** | Camera modal powered by jsQR — scan, flip camera, torch toggle. No app needed |
| **QR Check-In** | Scan → Present/Late based on teacher's grace period. Email verification required |
| **Attendance Dashboard** | Stats (Total, On Time, Late, Absent, Rate%, Streak🔥) with By Subject and By Date views |
| **Personal Attendance Graph** | Toggle bar chart showing 8-week trend (present/late/absent stacked) |
| **Attendance Streak** | Consecutive days present. Badges: 📅 default → ⭐ 7 days → 🔥 14 days |
| **My Subjects** | Per-subject attendance rate with progress bar and teacher name |
| **Absence Warning** | Red banner when student has ≥ 3 absences in any subject |
| **Notification Bell** | In-app alerts for admin announcements with unread count badge |
| **Filter & Search** | All/Present/Late/Absent/Excused filter, subject search |
| **XLSX Exports** | Styled Excel by subject or by month with color-coded status rows |
| **Profile Settings** | Name, student ID, grade, section, birthdate, profile picture (Base64) |
| **Security Settings** | 2FA, trusted device view, active sessions, real-time IP (30s poll) |

### 🧑‍🏫 Teacher

| Feature | Description |
|---------|-------------|
| **Session Management** | Create, start, stop, edit, delete sessions with full history |
| **Scheduled Dates** | Set planned start/end date shown as chips on session cards |
| **Live QR Code** | 60-second rotating token with animated countdown timer |
| **Session Timer** | ⏱ Elapsed time chip on active session cards, updates every second |
| **Live Attendance Counter** | 🔴 Real-time check-in count updates on session card without refresh |
| **Late Threshold** | Configurable grace period (5/10/15/20/30 min) using `activatedAt` |
| **Grade/Section Filter** | Restrict QR scanning to specific grades and sections |
| **⚡ Real-time Attendance** | SSE push — students appear on the list instantly when they scan |
| **Per-session Summary** | On-time rate % shown on ended session cards |
| **Class Roster Manager** | 📋 Add students manually + batch CSV import (email or student ID column) |
| **Roster Quick View** | Enrolled count chip with % of roster checked in while live |
| **Absence Tracker** | 📊 Per-student cumulative absent/excused/present/late across all sessions of a subject |
| **Auto-mark Absent** | When session stops, all rostered students who didn't scan → automatically marked absent |
| **Attendance Override** | Correct any student's status (present/late/absent/excused) with reason note |
| **Absence Limit** | Set max absences per subject; AT RISK badge triggers when exceeded |
| **One-click Export** | 📥 Export session attendance to Excel directly from session card |
| **ZIP Export** | Multi-select sessions → download all as ZIP |
| **Student Profile Modal** | Click any student in attendance list to see full profile |
| **Edit Sessions** | Change subject, room, grace period, filter, scheduled dates after creation |

### 🛡 Admin

| Feature | Description |
|---------|-------------|
| **Stats Dashboard** | Total students, teachers, sessions (live count), attendance records, daily/weekly trends |
| **📊 Overview Tab** | Login activity — who logged in today/this week/month with IP and browser |
| **👥 Students Tab** | Search, filter verified/unverified, view, verify, delete, reset password |
| **🧑‍🏫 Teachers Tab** | Same controls for teacher accounts |
| **📋 Sessions Tab** | All sessions across all teachers; force-stop or delete any |
| **📱 Device Requests Tab** | Approve/reject/reset student device change requests with full device info |
| **📢 Announcements Tab** | Create announcements (Info/Warning/Urgent/Success), pin, target by role, set expiry |
| **✉️ Email Blast Tab** | Send email to all/students/teachers — batched to respect rate limits |
| **🤖 AI Insights Tab** | Analytics, risk prediction, anomaly detection (see AI section below) |
| **🗒 Logs Tab** | System audit log — every admin action with name, target, IP, timestamp |
| **🔍 Global Search** | Single search bar finds users and sessions simultaneously |
| **Bulk Actions** | ☑ Select multiple students → bulk verify, bulk delete, export Excel |
| **User Detail Modal** | Full profile, password reset form, verify/unverify, delete |
| **Admin Settings** | Change own password |

---

## Security Architecture

AttendQR implements a **12-layer security suite** — all zero cost.

### 1. Two-Factor Authentication (2FA)
SHA-256 hashed 6-digit OTP, 10-minute expiry. Login with 2FA enabled issues a `tempToken` (signed `JWT_SECRET+'2fa'`). Frontend shows OTP screen; backend verifies hash → issues real 7-day JWT.

### 2. One-Device Policy
On registration, browser fingerprint (UA + screen resolution + timezone + hardware) is SHA-256 hashed and stored as `trustedDevice`. Every login sends `x-device-fingerprint` header — mismatch blocks login, saves to `pendingDevices`, and admin reviews in Device Requests tab.

```
Student logs in on new device
  → fingerprint mismatch
  → blocked + reason prompt shown
  → request queued in pendingDevices
  → admin approves → new device becomes trusted
```

### 3. Login Alert Emails
Every successful login → async email via Resend with timestamp (Philippine time), IP, browser, device. Never delays the login response.

### 4. Suspicious Login Detection
Flags login when IP differs from `lastKnownIP` and user has 3+ prior logins. Shows blue informational banner — not a block, just awareness.

### 5. Idle Timeout
`useIdleTimeout()` — monitors mousemove, keydown, click, scroll, touchstart. Auto-logout after **30 minutes** of inactivity. Cleans up interval on unmount.

### 6. Real-time IP Detection
`GET /api/security/my-ip` reads `x-forwarded-for` (skips private IP ranges). Polled every **30 seconds** in Security Settings with `setInterval` + cleanup.

### 7. Rate Limiting
5 consecutive failed logins → **15-minute lockout**. Stored in `failedLoginAttempts` + `lockUntil`. Every attempt logged to `loginHistory` with IP and browser.

### 8. Password Strength Checker
Scores 0–5 (length ≥8, ≥12, uppercase, digits, special chars). Live animated colored bar on all password forms.

### 9. Email Verification
32-byte random token, SHA-256 hashed in DB, raw token in URL only. 24-hour expiry. **Required before scanning QR** — unverified students are blocked at check-in.

### 10. Force Password Change
Admin sets `mustChangePassword: true` → yellow banner in user's Settings. Blocks access until changed.

### 11. Active Session Management
All logged-in devices visible in Security Settings. Revoke individual sessions or all others at once. Max 5 sessions stored per user.

### 12. Login History
Last 20 login events: IP, browser, OS, device type, success/fail flag, suspicious flag. Auto-refreshes every 30 seconds in Security Settings.

---

## AI & Analytics

All AI features run **zero cost** — pure JavaScript on the existing Render instance with MongoDB aggregation.

### 📈 Attendance Analytics (`GET /api/admin/analytics?days=30`)
- **Daily trend** — check-ins per day, stacked present/late/absent
- **Day-of-week heatmap** — blue intensity shows best/worst attendance days
- **Subject breakdown** — horizontal bars with on-time rate per subject
- **Hourly distribution** — when students check in most frequently
- Configurable window: 7 / 14 / 30 / 60 days

### ⚠️ Risk Prediction (`GET /api/admin/risk`)
Pure JavaScript scoring engine — no external ML:
```
Risk Score (0–100):
  Absence rate     → up to 50 points
  Days since seen  → up to 25 points  
  Late ratio       → up to 15 points
  Never attended   → 100 points

Risk Levels:
  🔴 High    (70–100) — Likely to fail
  🟡 Medium  (40–69)  — Needs attention
  🟢 Low     (0–39)   — Attendance is fine
```

### 🔍 Anomaly Detection (`GET /api/admin/anomalies`)
4 detection types using MongoDB aggregation:

| Type | Description | Severity |
|------|-------------|----------|
| `SHARED_IP` | Multiple students checking in from same IP in same session | High |
| `RAPID_CHECKINS` | 3+ check-ins within 5 seconds (QR screenshot sharing) | High/Medium |
| `OFF_HOURS` | Check-ins before 5am or after 10pm Philippine time | Low |
| `STATISTICAL_OUTLIER` | Student with 2.5σ above average check-in count | Medium |

---

## Database Models

### User
```
name, email, password (bcrypt 12 rounds), role (student|teacher|admin)
studentId, grade, section, birthdate, profilePicture (Base64)
school, department, subjectsTaught, yearsTeaching, phoneNumber

// Email
isVerified, verifyEmailToken (SHA-256), verifyEmailExpires (24h)

// Password reset
resetPasswordToken (SHA-256), resetPasswordExpires (1h)

// Login tracking (last 20)
loginHistory [{ ip, browser, browserVersion, os, device, at, success, suspicious }]

// Rate limiting
failedLoginAttempts, lockUntil

// 2FA
twoFAEnabled, twoFASecret (SHA-256, select:false), twoFAExpires, twoFAPending

// One-device policy
trustedDevice { fingerprint (SHA-256), browser, os, registeredAt, label }
pendingDevices [{ fingerprint, browser, os, ip, requestedAt, label, reason }]
devicePolicyEnabled (default: true)

// Security flags
mustChangePassword, passwordChangedAt, lastKnownIP

// Active sessions (max 5)
activeSessions [{ sessionId, ip, browser, os, device, createdAt, lastSeenAt }]

// Notifications
readAnnouncements [String]  // array of announcement IDs
```

### Session
```
subject, teacher (ref), room, description
isActive, startTime, endTime
activatedAt       ← resets every Start press; used for late detection
qrToken (unique sparse), qrExpiresAt (60s)
lateAfterMinutes (default 15)
scheduledStart, scheduledEnd   ← planned dates shown as chips
allowedGrades [], allowedSections []
roster [{ ref: User }]         ← enrolled students for absence tracking
absenceLimit (default 3), absenceLimitEnabled (default false)
expiresAt (default 210 days)

Virtuals: isExpired, isQrValid
```

### Attendance
```
student (ref), session (ref)
timestamp, status (present|late|absent|excused)
ipAddress, attendanceDate (YYYY-MM-DD Manila timezone)
markedAbsentBy (ref), autoMarked (bool)
overriddenBy (ref), overriddenAt, absentReason

Unique index: (student, session, attendanceDate)
```

### Announcement
```
title, message, type (info|warning|urgent|success)
targetRole (all|student|teacher), author (ref)
expiresAt (null = never), pinned (bool)
```

### SystemLog
```
admin (ref), adminName, action (e.g. DELETE_USER, VERIFY_USER)
target, targetId, targetType, details, ip
```

---

## API Reference

### Auth — `/api/auth`
```
POST   /register              Public      Register + store device fingerprint
POST   /login                 Public      Login with device policy + 2FA + rate limit
POST   /forgot-password       Public      Send reset email (SHA-256 token)
POST   /reset-password        Public      Reset via token
POST   /request-device        Public      Submit device change request from blocked screen
GET    /me                    Private     Current user
PATCH  /profile               Private     Update profile fields
PATCH  /change-password       Private     Change password (current required)
```

### Sessions — `/api/sessions`
```
GET    /                      Teacher     All sessions with attendance counts
POST   /                      Teacher     Create (scheduledStart/End, roster, absenceLimit)
GET    /students              Teacher     Get students for roster builder
GET    /:id                   Teacher     Session + full attendance list
PATCH  /:id                   Teacher     Edit session fields
DELETE /:id                   Teacher     Delete + cascade all attendance
POST   /:id/start             Teacher     Start + generate QR + set activatedAt
POST   /:id/refresh-qr        Teacher     Rotate token (every 60s)
POST   /:id/stop              Teacher     Stop + auto-mark absences from roster
```

### Attendance — `/api/attendance`
```
POST   /checkin               Student     Mark + SSE broadcast to teachers
GET    /verify/:token         Student     Validate QR token before check-in
GET    /my                    Student     Own attendance history
GET    /stream/:sessionId     Teacher     SSE real-time stream (token via ?token=)
POST   /mark-absences/:id     Teacher     Manually trigger absent marking
PATCH  /:id/override          Teacher     Override status (present/late/absent/excused)
GET    /absence-summary/:id   Teacher     Cumulative per-subject absence summary
PATCH  /roster/:id            Teacher     Update class roster (add/remove/replace)
```

### Security — `/api/security`
```
POST   /send-verification     Private     Send email verification link
POST   /verify-email          Public      Verify via token
GET    /login-history         Private     Last 20 login events
POST   /2fa/enable            Private     Send OTP to enable 2FA
POST   /2fa/confirm           Private     Confirm OTP → activate 2FA
POST   /2fa/disable           Private     Disable 2FA
POST   /2fa/verify            Public      Verify OTP during login (uses tempToken)
GET    /sessions              Private     All active sessions / devices
DELETE /sessions/all          Private     Revoke all other sessions
DELETE /sessions/:id          Private     Revoke specific session
GET    /my-ip                 Private     Real-time IP detection
```

### Admin — `/api/admin`
```
POST   /setup                 Public(once)  Create first admin — locks permanently

GET    /stats                 Admin       Dashboard counts + trend data
GET    /analytics             Admin       Full attendance analytics (daily/weekly/subject/hour)
GET    /risk                  Admin       AI risk prediction scores for all students
GET    /anomalies             Admin       Suspicious pattern detection (last 7 days)
GET    /activity              Admin       Login activity by period (today/week/month)
GET    /logs                  Admin       System audit logs (paginated)
GET    /search                Admin       Global search: users + sessions

GET    /users                 Admin       List users (filter role/verified/search/page)
GET    /users/:id             Admin       User detail with attendance/session counts
DELETE /users/:id             Admin       Delete user + cascade records
PATCH  /users/:id/verify      Admin       Manually verify email
PATCH  /users/:id/unverify    Admin       Revoke verification
PATCH  /users/:id/password    Admin       Reset password
PATCH  /users/:id/reset-device Admin      Reset trusted device (next login registers freely)
PATCH  /users/:id/toggle-device-policy Admin Enable/disable device policy per user

POST   /bulk-verify-users     Admin       Bulk verify selected students
POST   /bulk-delete-users     Admin       Bulk delete selected users
GET    /export-users          Admin       Export all users as JSON (frontend builds XLSX)

POST   /email-blast           Admin       Send email to all/students/teachers (batched)

GET    /announcements         Any(auth)   Get active announcements for role
POST   /announcements         Admin       Create announcement
DELETE /announcements/:id     Admin       Delete announcement
POST   /announcements/:id/read Private   Mark announcement as read

GET    /sessions              Admin       All sessions across all teachers
PATCH  /sessions/:id/stop     Admin       Force-stop session
DELETE /sessions/:id          Admin       Delete session + cascade

GET    /device-requests       Admin       All pending device change requests
PATCH  /device-requests/:id/approve Admin Approve → replace trusted device
DELETE /device-requests/:id/reject   Admin Reject request
```

---

## Environment Variables

### Backend — Render
```env
MONGO_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/attendance_system?appName=Cluster0
JWT_SECRET=your_minimum_32_character_random_secret_here
NODE_ENV=production
CLIENT_URL=https://shs-attendqr.vercel.app
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
PORT=5000
```

### Frontend — Vercel
```env
REACT_APP_API_URL=https://attendance-system-api-wc0k.onrender.com/api
```

> **Note:** The API URL is hardcoded in `App.jsx` line 4. The env var is a reference; update the hardcoded value if your Render URL changes.

---

## Deployment Guide

### 1. MongoDB Atlas
1. Create free cluster at [cloud.mongodb.com](https://cloud.mongodb.com)
2. **Network Access** → Add IP `0.0.0.0/0` (required — Render uses dynamic IPs)
3. **Database Access** → Create user with `readWrite` on `attendance_system`
4. Copy connection string; add `/attendance_system` before `?appName=...`

### 2. Render (Backend)
1. Connect GitHub repo → New Web Service
2. **Root Directory:** `server`
3. **Runtime:** Node
4. **Build Command:** `npm install`
5. **Start Command:** `node server.js`
6. Add all environment variables
7. Deploy → wait for `✅ MongoDB connected` + `🚀 Server running`

### 3. Vercel (Frontend)
1. Import repo → configure project
2. **Root Directory:** `client`
3. **Framework Preset:** Create React App
4. **Build Command:** `npm run build`
5. **Output Directory:** `build`
6. Add `REACT_APP_API_URL` environment variable
7. Deploy

### 4. Create Admin Account (one time only)
```js
// Run in browser console or Postman after first deploy
fetch("https://attendance-system-api-wc0k.onrender.com/api/admin/setup", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "Administrator",
    email: "admin@yourschool.edu",
    password: "YourSecurePassword123!"
  })
}).then(r => r.json()).then(console.log)
// This endpoint PERMANENTLY LOCKS after first admin is created
```

### 5. Keep Render Awake (Free Tier)
Free Render instances sleep after 15 minutes of inactivity. Use [cron-job.org](https://cron-job.org) (free):
- **URL:** `https://attendance-system-api-wc0k.onrender.com/api/health`
- **Schedule:** Every 14 minutes
- This prevents the 30–60 second cold start delay

---

## Development Notes

### How QR Rotation Works
```
Teacher presses Start
  → crypto.randomBytes(20).toString('hex') = 40-char token
  → qrExpiresAt = now + 60 seconds
  → activatedAt = now (late detection reference)
  → QRCode.toDataURL() generates Base64 PNG
  → Frontend auto-refreshes via POST /refresh-qr every 55 seconds
  → Old token immediately invalid on next refresh
```

### How Real-time Attendance Works (SSE)
```
Teacher opens session detail
  → EventSource('/api/attendance/stream/:sessionId?token=JWT')
  → Server registers connection in sseClients Map
  → 25s keepalive pings prevent proxy timeout

Student scans QR
  → POST /api/attendance/checkin
  → Record saved to MongoDB
  → Server iterates sseClients.get(sessionId)
  → Writes JSON event to all connected teacher browsers
  → React prepends new record — no refresh needed
```

### How Device Policy Works
```
Register: fingerprint = hash(UA + screen + timezone + hardware)
           → stored as trustedDevice.fingerprint (SHA-256)

Login:    x-device-fingerprint header sent
           → hash compared to trustedDevice.fingerprint
           → match: proceed
           → mismatch: save to pendingDevices, return 403 deviceBlocked
           → Frontend shows DeviceBlockedScreen with reason form
           → Admin approves in Device Requests tab
```

### How Absence Auto-Marking Works
```
Teacher clicks Stop
  → session.roster iterated
  → Attendance.find({ session, attendanceDate }) → checkedInIds set
  → roster.filter(id => !checkedInIds.has(id)) → absent list
  → Attendance.create({ status: "absent", autoMarked: true }) for each
  → Response includes autoMarked count
```

---

## Known Limitations

| Limitation | Workaround |
|-----------|------------|
| Render free tier sleeps after 15 min | Set up cron-job.org keepalive ping every 14 min |
| Profile pictures stored as Base64 in MongoDB | Acceptable for low-volume; migrate to Cloudinary for production scale |
| Device fingerprint is browser-based | Clearing browser data or switching browsers triggers policy; admin can reset |
| SSE disconnects when teacher navigates away | Re-opening session detail view reconnects automatically |
| Second admin needs direct MongoDB Atlas access | Use Atlas UI to set `role: "admin"` on an existing user |
| `REACT_APP_API_URL` env var not used at runtime | API URL is hardcoded in App.jsx line 4; update there if URL changes |
| Render free tier has 512MB RAM | Sufficient for current load; upgrade plan for high concurrency |

---

## License

This project was developed for academic research purposes at Vedasto R. Santiago High School. For usage inquiries, contact the developer.

---

*AttendQR · shs-attendqr.vercel.app · github.com/rinbee1203/attendance-system*
