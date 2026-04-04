# AttendQR — Smart QR Attendance System

A full-stack web application for managing classroom attendance via QR codes. Teachers generate live, rotating QR codes that students scan with their phone camera or the built-in browser scanner. Attendance is recorded instantly with Present or Late status, enforced by grade/section filters, and streamed to the teacher in real time.

**Live:** [shs-attendqr.vercel.app](https://shs-attendqr.vercel.app)  
**API:** [attendance-system-api-wc0k.onrender.com](https://attendance-system-api-wc0k.onrender.com)  
**Repo:** [github.com/rinbee1203/attendance-system](https://github.com/rinbee1203/attendance-system)

---

## Tech Stack

| Layer | Technology | Hosting |
|-------|-----------|---------|
| Frontend | React 18 (JSX, single-file) | Vercel |
| Backend | Node.js + Express | Render (free tier) |
| Database | MongoDB Atlas (Mongoose) | Atlas Cloud |
| Email | Resend API | resend.com |
| QR Generation | qrcode (npm) | — |
| QR Scanning | jsQR (CDN, preloaded) | unpkg.com |
| Exports | SheetJS (CDN) | cdnjs |
| Real-time | Server-Sent Events (SSE) | built-in |

---

## Project Structure

```
attendance-system/
├── client/
│   ├── public/
│   │   ├── index.html          # Preloads jsQR script
│   │   └── favicon.svg
│   ├── src/
│   │   └── App.jsx             # Entire frontend (~5,600 lines)
│   └── vercel.json             # CSP headers for CDN scripts
└── server/
    ├── controllers/
    │   ├── adminController.js
    │   ├── attendanceController.js
    │   ├── authController.js
    │   ├── securityController.js
    │   └── sessionsController.js
    ├── middleware/
    │   └── auth.js             # protect + restrictTo + query token for SSE
    ├── models/
    │   ├── Attendance.js
    │   ├── Session.js
    │   └── User.js
    ├── routes/
    │   ├── admin.js
    │   ├── auth.js
    │   ├── attendance.js       # includes SSE stream route
    │   ├── security.js
    │   └── sessions.js
    └── server.js               # SSE client registry (sseClients Map)
```

---

## Features

### Student
- **Built-in QR Scanner** — camera modal with jsQR frame scanning, flip camera, flashlight toggle
- **QR Check-In** — scan → instant Present/Late based on grace period
- **Attendance Dashboard** — stats cards, By Subject / By Date accordion views
- **Filter & Search** — All/Present/Late filter, subject search
- **XLSX Exports** — styled Excel by subject or by month
- **Profile Settings** — name, ID, grade, section, birthdate, profile picture
- **Security Settings** — 2FA, active sessions, trusted device, real-time IP (30s poll)

### Teacher
- **Session Management** — create, start, stop, edit, delete
- **Scheduled Dates** — set planned start/end date shown on session cards as chips
- **Live QR Code** — 60-second rotating token with countdown
- **Late Threshold** — configurable grace period using `activatedAt`
- **Grade/Section Filter** — restrict scanning to specific students
- **⚡ Real-time Attendance** — students appear instantly via SSE on scan
- **Attendance List** — Present/Late chips, student profile modal on click
- **XLSX Exports** — full list, by day, by month — ZIP download

### Admin
- **Stats Dashboard** — counts via parallel `Promise.all` queries
- **Students / Teachers Tabs** — search, filter, view, verify, delete, reset password
- **Sessions Tab** — all teachers' sessions, force-stop, delete
- **📱 Device Requests Tab** — approve/reject/reset student device change requests
- **User Detail Modal** — full profile + password reset + verify/delete

---

## Security Features

### Two-Factor Authentication (2FA)
OTP hashed with SHA-256, stored with 10-min expiry. Login issues `tempToken` (signed `JWT_SECRET+'2fa'`), frontend shows OTP screen, backend verifies hash → issues real JWT.

### One-Device Policy
On register, browser fingerprint (UA + screen + timezone + hardware) hashed and stored as `trustedDevice`. Every login sends `x-device-fingerprint` header — mismatch blocks login and queues a `pendingDevices` request for admin review.

### Login Alert Emails
Every successful login sends email with time, IP, browser, device via Resend. Async — never blocks response.

### Suspicious Login Detection
Flags login when IP differs from `lastKnownIP` and user has 3+ prior logins. Shows blue informational banner.

### Idle Timeout
`useIdleTimeout()` — 30 minutes of inactivity triggers auto-logout. Monitors mouse/keyboard/scroll/touch.

### Real-time IP Detection
`GET /api/security/my-ip` reads `x-forwarded-for` (skips private ranges). Polled every 30s in Security Settings.

### Rate Limiting
5 failed logins → 15-minute lockout. Every attempt logged to `loginHistory`.

### Password Strength Checker
Scores 0–5 (length, uppercase, digits, special chars). Live colored bar on all password forms.

### Email Verification
32-byte token, SHA-256 hashed, 24-hour expiry. Hash in DB, raw token in URL only.

### Force Password Change
Admin sets `mustChangePassword: true` → yellow banner in user's Settings.

### Active Session Management
All logged-in devices in Security Settings. Revoke individual or all other sessions.

### Login History
Last 20 events: IP, browser, OS, device, success/fail, suspicious flag. Auto-refreshes every 30s.

---

## Database Models

### Session (updated)
```
subject, teacher (ref), room, description
isActive, startTime, endTime, activatedAt
qrToken, qrExpiresAt, lateAfterMinutes
scheduledStart   ← planned start date/time (shown on session card)
scheduledEnd     ← planned end date/time (shown on session card)
allowedGrades [], allowedSections []
expiresAt (210-day hard limit)
```

### User (security fields)
```
trustedDevice { fingerprint (SHA-256), browser, os, registeredAt, label }
pendingDevices [{ fingerprint, browser, os, ip, requestedAt, reason }]
devicePolicyEnabled (default: true)
twoFAEnabled, twoFASecret (SHA-256 select:false), twoFAExpires
activeSessions [{ sessionId, ip, browser, os, device, lastSeenAt }]
mustChangePassword, lastKnownIP
failedLoginAttempts, lockUntil
loginHistory [{ ip, browser, os, device, at, success, suspicious }]
```

---

## API Reference

### Auth `/api/auth`
```
POST   /register              Public    Register + store device fingerprint
POST   /login                 Public    Login with device policy + 2FA + rate limit
POST   /forgot-password       Public    Send reset email
POST   /reset-password        Public    Reset via token
POST   /request-device        Public    Submit device change request
GET    /me                    Private   Current user
PATCH  /profile               Private   Update profile
PATCH  /change-password       Private   Change password
```

### Sessions `/api/sessions`
```
GET    /                      Teacher   All sessions
POST   /                      Teacher   Create (scheduledStart/End supported)
GET    /:id                   Teacher   Session + attendance
PATCH  /:id                   Teacher   Edit
DELETE /:id                   Teacher   Delete + cascade
POST   /:id/start             Teacher   Start + generate QR
POST   /:id/refresh-qr        Teacher   Rotate token
POST   /:id/stop              Teacher   Stop
```

### Attendance `/api/attendance`
```
POST   /checkin               Student   Mark + SSE broadcast to teachers
GET    /verify/:token         Student   Validate QR token
GET    /my                    Student   Own history
GET    /stream/:sessionId     Teacher   SSE real-time stream
```

### Security `/api/security`
```
POST   /send-verification     Private   Send verify email
POST   /verify-email          Public    Verify via token
GET    /login-history         Private   Last 20 events
POST   /2fa/enable            Private   Send OTP to enable
POST   /2fa/confirm           Private   Confirm OTP
POST   /2fa/disable           Private   Disable 2FA
POST   /2fa/verify            Public    Verify OTP (tempToken)
GET    /sessions              Private   Active sessions
DELETE /sessions/all          Private   Revoke all others
DELETE /sessions/:id          Private   Revoke one
GET    /my-ip                 Private   Real-time IP
```

### Admin `/api/admin`
```
POST   /setup                           One-time admin creation (locks after use)
GET    /stats                 Admin     Dashboard counts
GET    /users                 Admin     List users
GET    /users/:id             Admin     User detail
DELETE /users/:id             Admin     Delete
PATCH  /users/:id/verify      Admin     Verify email
PATCH  /users/:id/unverify    Admin     Revoke verification
PATCH  /users/:id/password    Admin     Reset password
PATCH  /users/:id/reset-device         Admin     Reset trusted device
PATCH  /users/:id/toggle-device-policy Admin     Enable/disable device policy
GET    /device-requests       Admin     Pending device requests
PATCH  /device-requests/:userId/approve Admin    Approve device
DELETE /device-requests/:userId/reject  Admin    Reject request
GET    /sessions              Admin     All sessions
PATCH  /sessions/:id/stop     Admin     Force-stop
DELETE /sessions/:id          Admin     Delete + cascade
```

---

## Environment Variables

### Backend (Render)
```env
MONGO_URI=mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/attendance_system?appName=Cluster0
JWT_SECRET=your_long_random_secret_string_here
NODE_ENV=production
CLIENT_URL=https://shs-attendqr.vercel.app
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
PORT=5000
```

### Frontend (Vercel)
```env
VITE_API_URL=https://attendance-system-api-wc0k.onrender.com/api
```

---

## Deployment

### MongoDB Atlas
1. Create cluster → **Network Access** → Add `0.0.0.0/0`
2. **Database Access** → create user with read/write
3. Connection string format: `...mongodb.net/attendance_system?appName=...`

### Render (Backend)
- Root Directory: `server`
- Build: `npm install`
- Start: `node server.js`
- Add all env vars → Save → auto-deploy

### Vercel (Frontend)
- Root Directory: `client`
- Add `VITE_API_URL` → Deploy (Vite auto-detected)

### Create Admin (once)
```js
fetch("https://attendance-system-api-wc0k.onrender.com/api/admin/setup", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name:"Admin", email:"admin@school.com", password:"yourpassword" })
}).then(r=>r.json()).then(console.log)
```

### Keep Render Awake
Ping every 14 min via [cron-job.org](https://cron-job.org):
```
GET https://attendance-system-api-wc0k.onrender.com/api/health
```

---

## Known Limitations
- Render free tier sleeps after inactivity — cron-job.org keepalive required
- Profile pictures in Base64 increase MongoDB document size — consider Cloudinary for production
- Device fingerprint is browser-based; clearing browser data or switching browsers on same device may trigger policy
- SSE reconnects automatically when teacher re-opens attendance list
- Second admin must be created directly in MongoDB Atlas
