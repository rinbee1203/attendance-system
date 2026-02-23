# 📋 AttendQR — Smart QR Attendance System

A production-ready, school-grade attendance system using QR codes. Built with Node.js, Express, MongoDB, and React.

---

## 🚀 Quick Start

### Prerequisites
- Node.js v18+
- MongoDB (local or [MongoDB Atlas](https://cloud.mongodb.com) — free tier)
- npm

### 1. Clone & Install
```bash
git clone <your-repo>
cd attendance-system

# Install all dependencies (server + client)
npm install
npm run install:all
```

### 2. Configure Environment
```bash
cd server
cp .env.example .env
```

Edit `server/.env`:
```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/attendance_system
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:3000
QR_EXPIRY_SECONDS=60
```

### 3. Run Development Servers
```bash
# From root directory — runs both backend + frontend
npm run dev
```

- **Backend API**: `http://localhost:5000`
- **Frontend**: `http://localhost:3000`

---

## 🏗 Project Structure

```
attendance-system/
├── server/                     # Node.js + Express Backend
│   ├── models/
│   │   ├── User.js            # Student & Teacher model
│   │   ├── Session.js         # Class session model
│   │   └── Attendance.js      # Attendance record model
│   ├── controllers/
│   │   ├── authController.js  # Register, login, JWT
│   │   ├── sessionsController.js  # QR generation, session management
│   │   └── attendanceController.js  # Check-in logic
│   ├── routes/
│   │   ├── auth.js
│   │   ├── sessions.js
│   │   └── attendance.js
│   ├── middleware/
│   │   └── auth.js            # JWT verification, role guards
│   ├── server.js              # Entry point
│   ├── .env.example
│   └── package.json
│
├── client/                     # React Frontend (PWA)
│   ├── public/
│   │   ├── index.html
│   │   └── manifest.json      # PWA config
│   ├── src/
│   │   ├── App.jsx            # All pages + components
│   │   └── index.js
│   └── package.json
│
├── package.json               # Root scripts (concurrently)
└── README.md
```

---

## 🔐 Security Features

| Feature | Detail |
|---|---|
| **JWT Auth** | All routes protected with signed tokens |
| **Password Hashing** | bcrypt with salt rounds = 12 |
| **Rotating QR Tokens** | Crypto-random tokens, expire in 60 seconds |
| **Duplicate Prevention** | Unique DB index on (student, session) |
| **Late Detection** | Marks "late" if 15+ min after session start |
| **Role-based Access** | Teachers can't check in, students can't manage sessions |
| **IP Logging** | Records student IP for audit trail |

---

## 📡 API Reference

### Auth
| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Register student/teacher |
| POST | `/api/auth/login` | Public | Login & get JWT |
| GET | `/api/auth/me` | Private | Get current user |

### Sessions (Teacher only)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/sessions` | Get all teacher's sessions |
| POST | `/api/sessions` | Create new session |
| GET | `/api/sessions/:id` | Get session + attendance list |
| POST | `/api/sessions/:id/start` | Start session, generate QR |
| POST | `/api/sessions/:id/refresh-qr` | Rotate QR token |
| POST | `/api/sessions/:id/stop` | End session |

### Attendance (Student only)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/attendance/verify/:token` | Verify QR before check-in |
| POST | `/api/attendance/checkin` | Mark attendance with token |
| GET | `/api/attendance/my` | Get student's attendance history |

---

## 📱 How QR Check-in Works

```
1. Teacher clicks "Start Session"
2. Backend generates crypto-random token (expires in 60 sec)
3. QR code is generated from: https://yourdomain.com/checkin?token=<token>
4. Teacher displays QR on screen/projector
5. Students scan with their phone
6. Student's browser opens: /checkin?token=<token>
7. Student logs in (if not already)
8. Backend verifies: token valid? session active? not expired? not duplicate?
9. Attendance record created ✅
10. QR auto-rotates every 60 seconds to prevent screenshot sharing
```

---

## 🌐 Deployment

### Backend → [Render](https://render.com)
1. Create new Web Service
2. Connect your repo → set root directory to `server`
3. Build command: `npm install`
4. Start command: `npm start`
5. Add environment variables from `.env`

### Frontend → [Vercel](https://vercel.com)
1. Import project → set root to `client`
2. Framework: Create React App
3. Set `REACT_APP_API_URL` env variable to your backend URL

### Database → [MongoDB Atlas](https://cloud.mongodb.com)
1. Create free M0 cluster
2. Get connection string → set as `MONGO_URI` in backend env

---

## 📅 Development Roadmap

- [x] JWT Authentication (student + teacher)
- [x] Session creation & management
- [x] Rotating QR code generation
- [x] Secure check-in with duplicate prevention
- [x] Late detection (15 min threshold)
- [x] Teacher attendance view
- [x] Student attendance history
- [x] PWA support
- [ ] CSV export for attendance
- [ ] Email notifications
- [ ] GPS/geolocation validation (optional)
- [ ] Admin panel

---

## 🧑‍💻 Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express.js |
| Database | MongoDB + Mongoose |
| Authentication | JWT + bcrypt |
| QR Code | `qrcode` npm package |
| Frontend | React 18 |
| Styling | Custom CSS (no frameworks) |
| PWA | Web App Manifest |
| Dev Tools | nodemon, concurrently |

---

Made with ❤️ for schools
"# AttendQR" 
"# attendance-system" 
