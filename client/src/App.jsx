import { useState, useEffect, useCallback, createContext, useContext, useRef } from "react";

// ─── API CONFIG ────────────────────────────────────────────────────────────────
const API_BASE = "https://attendance-system-api-wc0k.onrender.com/api";

const api = {
  async request(endpoint, options = {}) {
    const token = localStorage.getItem("token");
    const config = {
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...options,
    };
    const res = await fetch(`${API_BASE}${endpoint}`, config);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Request failed");
    return data;
  },
  post: (url, body) => api.request(url, { method: "POST", body: JSON.stringify(body) }),
  patch: (url, body) => api.request(url, { method: "PATCH", body: JSON.stringify(body) }),
  get: (url) => api.request(url, { method: "GET" }),
};

// ─── AUTH CONTEXT ──────────────────────────────────────────────────────────────
const AuthContext = createContext(null);
const useAuth = () => useContext(AuthContext);

function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const u = localStorage.getItem("user");
    return u ? JSON.parse(u) : null;
  });
  const [loading, setLoading] = useState(false);

  const login = async (email, password) => {
    setLoading(true);
    try {
      const data = await api.post("/auth/login", { email, password });
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      setUser(data.user);
      return data;
    } finally { setLoading(false); }
  };

  const register = async (payload) => {
    setLoading(true);
    try {
      const data = await api.post("/auth/register", payload);
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      setUser(data.user);
      return data;
    } finally { setLoading(false); }
  };

  const updateUser = (updatedUser) => {
    const fresh = { ...updatedUser };
    localStorage.setItem("user", JSON.stringify(fresh));
    setUser(fresh);
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, login, register, logout, loading, updateUser }}>{children}</AuthContext.Provider>;
}

// ─── EXCEL EXPORT UTILITY ─────────────────────────────────────────────────────

// ── Shared helpers ──
const BOM = "\uFEFF";
const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const csvRow = (arr) => arr.map(esc).join(",");
const download = (content, filename) => {
  const blob = new Blob([BOM + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};
const safe = (s) => (s || "file").replace(/[^a-z0-9]/gi, "_").toLowerCase();
const todayStr = () => new Date().toISOString().split("T")[0];

// ── STUDENT exports ──

// Student: export by subject (one subject's full history)
function exportStudentBySubject(records, subjectName, studentName) {
  const title = [
    [`Attendance Report — ${subjectName}`],
    [`Student: ${studentName}`],
    [`Exported: ${new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}`],
    [`Total Records: ${records.length}`],
    [],
  ];
  const headers = ["#", "Subject", "Room", "Teacher", "Status", "Date", "Time"];
  const rows = records.map((a, i) => {
    const ts = new Date(a.timestamp);
    return [i+1, a.session?.subject||"N/A", a.session?.room||"N/A", a.session?.teacher?.name||"N/A",
      a.status === "present" ? "Present" : "Late",
      ts.toLocaleDateString("en-PH", { year:"numeric", month:"long", day:"numeric", timeZone:"Asia/Manila" }),
      ts.toLocaleTimeString("en-PH", { hour:"2-digit", minute:"2-digit", second:"2-digit", timeZone:"Asia/Manila" })];
  });
  const csv = [...title.map(r => r.map(esc).join(",")), csvRow(headers), ...rows.map(csvRow)].join("\n");
  download(csv, `${safe(studentName)}_${safe(subjectName)}_${todayStr()}.csv`);
}

// Student: export by month (one month's records across all subjects)
function exportStudentByMonth(records, monthLabel, studentName) {
  const title = [
    [`Attendance Report — ${monthLabel}`],
    [`Student: ${studentName}`],
    [`Exported: ${new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}`],
    [`Total Records: ${records.length}`],
    [],
  ];
  const headers = ["#", "Subject", "Room", "Teacher", "Status", "Date", "Time"];
  const rows = records.map((a, i) => {
    const ts = new Date(a.timestamp);
    return [i+1, a.session?.subject||"N/A", a.session?.room||"N/A", a.session?.teacher?.name||"N/A",
      a.status === "present" ? "Present" : "Late",
      ts.toLocaleDateString("en-PH", { year:"numeric", month:"long", day:"numeric", timeZone:"Asia/Manila" }),
      ts.toLocaleTimeString("en-PH", { hour:"2-digit", minute:"2-digit", second:"2-digit", timeZone:"Asia/Manila" })];
  });
  const csv = [...title.map(r => r.map(esc).join(",")), csvRow(headers), ...rows.map(csvRow)].join("\n");
  download(csv, `${safe(studentName)}_${safe(monthLabel)}_${todayStr()}.csv`);
}

// ── TEACHER exports ──

// Teacher: export by specific day
function exportTeacherByDay(records, dayLabel, session) {
  const title = [
    [`Daily Attendance Report — ${dayLabel}`],
    [`Session: ${session?.subject||"N/A"}`, `Room: ${session?.room||"N/A"}`],
    [`Exported: ${new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}`],
    [`Total Records: ${records.length}`],
    [],
  ];
  const headers = ["#", "Student Name", "Student ID", "Grade", "Section", "Status", "Time"];
  const rows = records.map((a, i) => {
    const ts = new Date(a.timestamp);
    return [i+1, a.student?.name||"N/A", a.student?.studentId||"N/A",
      a.student?.grade||"N/A", a.student?.section||"N/A",
      a.status === "present" ? "Present" : "Late",
      ts.toLocaleTimeString("en-PH", { hour:"2-digit", minute:"2-digit", second:"2-digit", timeZone:"Asia/Manila" })];
  });
  const csv = [...title.map(r => r.map(esc).join(",")), csvRow(headers), ...rows.map(csvRow)].join("\n");
  download(csv, `${safe(session?.subject)}_${safe(dayLabel)}_daily.csv`);
}

// Teacher: export by month
function exportTeacherByMonth(records, monthLabel, session) {
  const title = [
    [`Monthly Attendance Report — ${monthLabel}`],
    [`Session: ${session?.subject||"N/A"}`, `Room: ${session?.room||"N/A"}`],
    [`Exported: ${new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}`],
    [`Total Records: ${records.length}`],
    [],
  ];
  const headers = ["#", "Student Name", "Student ID", "Grade", "Section", "Status", "Date", "Time"];
  const rows = records.map((a, i) => {
    const ts = new Date(a.timestamp);
    return [i+1, a.student?.name||"N/A", a.student?.studentId||"N/A",
      a.student?.grade||"N/A", a.student?.section||"N/A",
      a.status === "present" ? "Present" : "Late",
      ts.toLocaleDateString("en-PH", { year:"numeric", month:"long", day:"numeric", timeZone:"Asia/Manila" }),
      ts.toLocaleTimeString("en-PH", { hour:"2-digit", minute:"2-digit", second:"2-digit", timeZone:"Asia/Manila" })];
  });
  const csv = [...title.map(r => r.map(esc).join(",")), csvRow(headers), ...rows.map(csvRow)].join("\n");
  download(csv, `${safe(session?.subject)}_${safe(monthLabel)}_monthly.csv`);
}

// Teacher: export full session (all time)
function exportSessionFull(records, session) {
  const countByStudent = records.reduce((acc, a) => {
    const key = a.student?._id || a.student?.studentId || "?";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const title = [
    [`Full Session Attendance — ${session?.subject||"N/A"}`],
    [`Room: ${session?.room||"N/A"}`, `Created: ${session?.createdAt ? new Date(session.createdAt).toLocaleDateString("en-PH", {year:"numeric",month:"long",day:"numeric"}) : "N/A"}`],
    [`Exported: ${new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}`],
    [`Total Records: ${records.length}`],
    [],
  ];
  const headers = ["#", "Student Name", "Student ID", "Grade", "Section", "Sessions Attended", "Status", "Date", "Time"];
  const rows = records.map((a, i) => {
    const ts = new Date(a.timestamp);
    const key = a.student?._id || a.student?.studentId || "?";
    return [i+1, a.student?.name||"N/A", a.student?.studentId||"N/A",
      a.student?.grade||"N/A", a.student?.section||"N/A",
      countByStudent[key]||1,
      a.status === "present" ? "Present" : "Late",
      ts.toLocaleDateString("en-PH", { year:"numeric", month:"long", day:"numeric", timeZone:"Asia/Manila" }),
      ts.toLocaleTimeString("en-PH", { hour:"2-digit", minute:"2-digit", second:"2-digit", timeZone:"Asia/Manila" })];
  });
  const csv = [...title.map(r => r.map(esc).join(",")), csvRow(headers), ...rows.map(csvRow)].join("\n");
  download(csv, `${safe(session?.subject)}_full_session_${todayStr()}.csv`);
}

// Legacy wrappers (still used in some places)
function exportToExcel(attendance, sessionInfo) { exportSessionFull(attendance, sessionInfo); }
function exportStudentHistoryToExcel(attendance, studentName) {
  const month = new Date().toLocaleDateString("en-PH", { year:"numeric", month:"long" });
  exportStudentByMonth(attendance, month, studentName);
}
// ─── DATE HELPERS ─────────────────────────────────────────────────────────────
const PH = { timeZone: "Asia/Manila" };

function formatDate(date) {
  return new Date(date).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric", ...PH });
}
function formatDateTime(date) {
  return new Date(date).toLocaleString("en-PH", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", ...PH,
  });
}
function formatTime(date) {
  return new Date(date).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", ...PH });
}
function getDefaultEndDate() {
  const d = new Date();
  d.setDate(d.getDate() + 210);
  return d.toISOString().slice(0, 16);
}

// ─── STYLES ────────────────────────────────────────────────────────────────────
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Instrument+Serif:ital@0;1&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #04040e;
    --surface: #0a0a1a;
    --surface2: #101024;
    --surface3: #17172e;
    --surface4: #1e1e3a;
    --border: rgba(120,100,255,0.1);
    --border2: rgba(120,100,255,0.2);
    --accent: #7c6fff;
    --accent-light: #a098ff;
    --accent-glow: rgba(124,111,255,0.35);
    --accent2: #ff6b8a;
    --accent2-glow: rgba(255,107,138,0.25);
    --green: #00e5a0;
    --green-dim: rgba(0,229,160,0.1);
    --yellow: #ffd166;
    --yellow-dim: rgba(255,209,102,0.1);
    --blue: #60b4ff;
    --red: #ff6b8a;
    --text: #eeeef8;
    --text-dim: #9494b8;
    --muted: #52527a;
    --radius: 16px;
    --radius-sm: 10px;
    --radius-xs: 6px;
    --font-heading: 'Plus Jakarta Sans', sans-serif;
    --font-body: 'Plus Jakarta Sans', sans-serif;
    --font-serif: 'Instrument Serif', serif;
    --shadow-sm: 0 2px 12px rgba(0,0,0,0.4);
    --shadow-md: 0 8px 30px rgba(0,0,0,0.5);
    --shadow-lg: 0 24px 64px rgba(0,0,0,0.6);
    --shadow-accent: 0 8px 32px rgba(124,111,255,0.28);
    --shadow-accent2: 0 8px 32px rgba(255,107,138,0.2);
    --nav-h: 66px;
  }

  html { scroll-behavior: smooth; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-body);
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
    background-image:
      radial-gradient(ellipse 80% 40% at 50% -10%, rgba(124,111,255,0.12) 0%, transparent 60%),
      radial-gradient(ellipse 40% 30% at 85% 80%, rgba(255,107,138,0.06) 0%, transparent 50%);
    background-attachment: fixed;
  }

  /* ── Layout ── */
  .app { min-height: 100vh; display: flex; flex-direction: column; }
  .container { max-width: 1160px; margin: 0 auto; padding: 0 28px; width: 100%; }
  .main { flex: 1; padding: 40px 0 72px; }

  /* ── Nav ── */
  .nav {
    height: var(--nav-h);
    border-bottom: 1px solid var(--border);
    position: sticky; top: 0;
    background: rgba(4,4,14,0.88);
    backdrop-filter: blur(28px);
    -webkit-backdrop-filter: blur(28px);
    z-index: 100;
  }
  .nav-inner { display: flex; align-items: center; justify-content: space-between; height: 100%; }
  .nav-brand { font-family: var(--font-heading); font-size: 1.15rem; font-weight: 800; color: var(--text); display: flex; align-items: center; gap: 11px; letter-spacing: -0.02em; }
  .nav-logo-wrap { width: 36px; height: 36px; border-radius: 10px; background: linear-gradient(135deg, var(--accent) 0%, var(--accent2) 100%); display: flex; align-items: center; justify-content: center; box-shadow: var(--shadow-accent); flex-shrink: 0; }
  .nav-actions { display: flex; align-items: center; gap: 10px; }

  /* User pill */
  .user-pill { display: flex; align-items: center; gap: 9px; background: var(--surface2); border: 1px solid var(--border); padding: 5px 14px 5px 5px; border-radius: 40px; transition: border-color 0.2s; }
  .user-pill:hover { border-color: var(--border2); }
  .user-avatar { width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg, var(--accent), var(--accent2)); display: flex; align-items: center; justify-content: center; font-size: 0.72rem; font-weight: 800; color: #fff; flex-shrink: 0; }
  .user-avatar-img { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
  .user-name { font-size: 0.82rem; font-weight: 700; color: var(--text); line-height: 1.2; }
  .user-role { font-size: 0.7rem; color: var(--muted); text-transform: capitalize; line-height: 1.2; }
  .nav-settings-btn { display: flex; align-items: center; gap: 6px; background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 7px 13px; font-size: 0.8rem; font-weight: 600; color: var(--text-dim); cursor: pointer; font-family: var(--font-body); transition: all 0.18s; }
  .nav-settings-btn:hover { color: var(--text); border-color: var(--border2); background: var(--surface3); }
  .nav-signout { background: none; border: none; color: var(--muted); font-family: var(--font-body); font-size: 0.8rem; font-weight: 600; cursor: pointer; padding: 7px 10px; border-radius: var(--radius-xs); transition: color 0.18s; }
  .nav-signout:hover { color: var(--red); }

  /* ── Buttons ── */
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 18px; border-radius: var(--radius-sm); font-family: var(--font-body); font-size: 0.875rem; font-weight: 600; cursor: pointer; border: none; transition: all 0.18s ease; text-decoration: none; white-space: nowrap; letter-spacing: -0.01em; }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; pointer-events: none; }
  .btn-primary { background: var(--accent); color: #fff; box-shadow: 0 0 0 0 var(--accent-glow); }
  .btn-primary:hover { background: var(--accent-light); box-shadow: var(--shadow-accent); transform: translateY(-1px); }
  .btn-primary:active { transform: translateY(0); }
  .btn-danger { background: rgba(255,107,138,0.1); color: var(--red); border: 1px solid rgba(255,107,138,0.2); }
  .btn-danger:hover { background: rgba(255,107,138,0.18); border-color: rgba(255,107,138,0.35); }
  .btn-ghost { background: var(--surface2); color: var(--text-dim); border: 1px solid var(--border); }
  .btn-ghost:hover { color: var(--text); border-color: var(--border2); background: var(--surface3); }
  .btn-green { background: rgba(0,229,160,0.1); color: var(--green); border: 1px solid rgba(0,229,160,0.22); }
  .btn-green:hover { background: rgba(0,229,160,0.18); border-color: rgba(0,229,160,0.38); }
  .btn-excel { background: rgba(74,222,128,0.08); color: #4ade80; border: 1px solid rgba(74,222,128,0.2); }
  .btn-excel:hover { background: rgba(74,222,128,0.15); }
  .btn-sm { padding: 6px 12px; font-size: 0.78rem; border-radius: 8px; }
  .btn-lg { padding: 13px 28px; font-size: 0.95rem; border-radius: 12px; letter-spacing: -0.01em; }
  .btn-icon { width: 36px; height: 36px; padding: 0; border-radius: 9px; }

  /* ── Forms ── */
  .form-group { margin-bottom: 18px; }
  .form-label { display: block; font-size: 0.72rem; font-weight: 700; color: var(--muted); margin-bottom: 7px; text-transform: uppercase; letter-spacing: 0.08em; }
  .form-input {
    width: 100%; background: var(--surface2); border: 1.5px solid var(--border);
    border-radius: var(--radius-sm); padding: 11px 14px; color: var(--text);
    font-family: var(--font-body); font-size: 0.9rem; transition: all 0.18s; outline: none;
  }
  .form-input:focus { border-color: var(--accent); background: var(--surface3); box-shadow: 0 0 0 3px rgba(124,111,255,0.1); }
  .form-input::placeholder { color: var(--muted); }
  .form-select { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2352527a' d='M6 8L1 3h10z'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 13px center; padding-right: 38px; cursor: pointer; }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .form-hint { font-size: 0.73rem; color: var(--muted); margin-top: 5px; }

  /* ── Alert ── */
  .alert { padding: 11px 14px; border-radius: var(--radius-sm); font-size: 0.85rem; margin-bottom: 16px; display: flex; align-items: center; gap: 9px; font-weight: 500; }
  .alert-error { background: rgba(255,107,138,0.07); border: 1px solid rgba(255,107,138,0.18); color: #ff8fa3; }
  .alert-success { background: rgba(0,229,160,0.07); border: 1px solid rgba(0,229,160,0.18); color: var(--green); }

  /* ── Auth page ── */
  .auth-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; position: relative; overflow: hidden; }
  .auth-bg-orb { position: absolute; border-radius: 50%; filter: blur(80px); pointer-events: none; }
  .auth-bg-orb-1 { width: 500px; height: 500px; background: rgba(124,111,255,0.12); top: -100px; left: 50%; transform: translateX(-50%); }
  .auth-bg-orb-2 { width: 300px; height: 300px; background: rgba(255,107,138,0.08); bottom: 0; right: -100px; }
  .auth-dots { position: absolute; inset: 0; background-image: radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px); background-size: 28px 28px; pointer-events: none; mask-image: radial-gradient(ellipse 70% 70% at center, black 0%, transparent 100%); }
  .auth-card { width: 100%; max-width: 450px; position: relative; z-index: 1; background: var(--surface); border: 1px solid var(--border2); border-radius: 22px; padding: 36px 32px; box-shadow: var(--shadow-lg), 0 0 0 1px rgba(124,111,255,0.04); }
  .auth-header { text-align: center; margin-bottom: 30px; }
  .auth-logo-wrap { width: 64px; height: 64px; background: linear-gradient(135deg, var(--accent), var(--accent2)); border-radius: 20px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 20px; box-shadow: 0 16px 48px var(--accent-glow); }
  .auth-title { font-family: var(--font-heading); font-size: 1.85rem; font-weight: 800; margin-bottom: 7px; letter-spacing: -0.03em; }
  .auth-sub { color: var(--text-dim); font-size: 0.875rem; }
  .auth-switch { text-align: center; margin-top: 20px; font-size: 0.84rem; color: var(--muted); }
  .auth-switch a { color: var(--accent-light); cursor: pointer; font-weight: 600; }
  .auth-switch a:hover { text-decoration: underline; }
  .role-tabs { display: flex; background: var(--surface2); border-radius: var(--radius-sm); padding: 4px; margin-bottom: 22px; gap: 4px; border: 1px solid var(--border); }
  .role-tab { flex: 1; padding: 9px; text-align: center; border-radius: 8px; cursor: pointer; font-size: 0.84rem; font-weight: 600; transition: all 0.18s; color: var(--muted); }
  .role-tab.active { background: var(--accent); color: #fff; box-shadow: var(--shadow-accent); }

  /* ── Cards ── */
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; }

  /* ── Page headers ── */
  .page-header { margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 16px; }
  .page-title { font-family: var(--font-heading); font-size: 2rem; font-weight: 800; margin-bottom: 4px; line-height: 1.15; letter-spacing: -0.03em; }
  .page-sub { color: var(--text-dim); font-size: 0.875rem; font-weight: 400; }

  /* ── Stats ── */
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; margin-bottom: 30px; }
  .stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px 22px; position: relative; overflow: hidden; transition: border-color 0.2s; }
  .stat-card:hover { border-color: var(--border2); }
  .stat-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: var(--stat-color, var(--accent)); }
  .stat-card::after { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 60px; background: linear-gradient(180deg, rgba(var(--stat-color-raw, 124,111,255),0.04) 0%, transparent 100%); pointer-events: none; }
  .stat-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); margin-bottom: 12px; font-weight: 700; }
  .stat-value { font-family: var(--font-heading); font-size: 2.2rem; font-weight: 800; line-height: 1; color: var(--stat-color, var(--text)); letter-spacing: -0.03em; }
  .stat-sub { font-size: 0.73rem; color: var(--muted); margin-top: 5px; }

  /* ── Section headers ── */
  .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 10px; }
  .section-title { font-family: var(--font-heading); font-size: 1rem; font-weight: 700; display: flex; align-items: center; gap: 8px; letter-spacing: -0.01em; }

  /* ── Session cards ── */
  .sessions-grid { display: grid; gap: 10px; }
  .session-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px 20px; display: flex; align-items: center; gap: 16px; transition: all 0.2s; }
  .session-card:hover { border-color: rgba(124,111,255,0.22); background: var(--surface2); transform: translateY(-1px); box-shadow: var(--shadow-sm); }
  .session-icon { width: 46px; height: 46px; border-radius: 13px; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0; }
  .session-icon.active { background: rgba(0,229,160,0.1); border: 1px solid rgba(0,229,160,0.22); }
  .session-icon.inactive { background: var(--surface2); border: 1px solid var(--border); }
  .session-icon.expired-icon { background: rgba(255,107,138,0.08); border: 1px solid rgba(255,107,138,0.18); }
  .session-info { flex: 1; min-width: 0; }
  .session-subject { font-family: var(--font-heading); font-weight: 700; font-size: 0.97rem; margin-bottom: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: -0.01em; }
  .session-meta { font-size: 0.77rem; color: var(--text-dim); display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  .session-actions { display: flex; gap: 8px; flex-shrink: 0; flex-wrap: wrap; }

  /* ── Badges ── */
  .badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; border-radius: 20px; font-size: 0.71rem; font-weight: 700; letter-spacing: 0.02em; }
  .badge-active { background: rgba(0,229,160,0.1); color: var(--green); border: 1px solid rgba(0,229,160,0.2); }
  .badge-present { background: rgba(0,229,160,0.1); color: var(--green); border: 1px solid rgba(0,229,160,0.2); }
  .badge-late { background: rgba(255,209,102,0.1); color: var(--yellow); border: 1px solid rgba(255,209,102,0.2); }
  .badge-inactive { background: var(--surface2); color: var(--muted); border: 1px solid var(--border); }

  /* ── Session end label ── */
  .session-enddate { font-size: 0.71rem; font-weight: 600; color: var(--muted); background: var(--surface2); border: 1px solid var(--border); border-radius: 20px; padding: 2px 8px; }
  .session-enddate.soon { color: var(--yellow); background: var(--yellow-dim); border-color: rgba(255,209,102,0.2); }
  .session-enddate.expired { color: var(--red); }

  /* ── Modal ── */
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; animation: fadeIn 0.18s ease; }
  .modal { background: var(--surface); border: 1px solid var(--border2); border-radius: 20px; padding: 28px; width: 100%; max-width: 520px; box-shadow: var(--shadow-lg); animation: slideUp 0.22s cubic-bezier(0.34,1.56,0.64,1); }
  .modal-header { margin-bottom: 22px; }
  .modal-top-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .modal-title { font-family: var(--font-heading); font-size: 1.2rem; font-weight: 800; margin-bottom: 3px; letter-spacing: -0.02em; }
  .modal-sub { font-size: 0.82rem; color: var(--text-dim); }
  .modal-actions { display: flex; gap: 10px; margin-top: 22px; }

  /* ── QR styles ── */
  .qr-wrapper { background: #ffffff; border-radius: 16px; padding: 16px; text-align: center; margin: 18px 0; box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
  .qr-wrapper img { max-width: 220px; width: 100%; border-radius: 6px; }
  .countdown { text-align: center; margin: 14px 0; }
  .countdown-ring { display: inline-flex; align-items: center; gap: 14px; background: var(--surface2); border: 1px solid var(--border); border-radius: 40px; padding: 10px 20px; }
  .countdown-num { font-family: var(--font-heading); font-size: 1.4rem; font-weight: 800; min-width: 32px; text-align: center; }
  .countdown-label { font-size: 0.73rem; color: var(--muted); line-height: 1.4; text-align: left; }

  /* ── Spinner ── */
  .spinner { border: 2.5px solid rgba(255,255,255,0.12); border-top-color: #fff; border-radius: 50%; animation: spin 0.65s linear infinite; display: inline-block; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
  @keyframes slideUp { from { opacity: 0; transform: translateY(20px) scale(0.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
  @keyframes pulseGlow { 0%,100% { box-shadow: 0 0 0 0 var(--accent-glow); } 50% { box-shadow: 0 0 0 8px transparent; } }

  /* ── Table ── */
  .table-wrapper { border-radius: var(--radius); overflow: hidden; border: 1px solid var(--border); }
  table { width: 100%; border-collapse: collapse; }
  thead { background: var(--surface2); }
  th { padding: 10px 14px; text-align: left; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); white-space: nowrap; }
  td { padding: 11px 14px; border-top: 1px solid var(--border); font-size: 0.84rem; color: var(--text-dim); vertical-align: middle; }
  tr:hover td { background: var(--surface2); }
  .td-name { display: flex; align-items: center; font-weight: 600; color: var(--text); }
  .avatar { width: 28px; height: 28px; border-radius: 8px; background: linear-gradient(135deg, var(--accent), var(--accent2)); display: inline-flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 800; color: #fff; margin-right: 10px; flex-shrink: 0; }
  .avatar-img { width: 28px; height: 28px; border-radius: 8px; object-fit: cover; margin-right: 10px; flex-shrink: 0; }

  /* ── History (student) ── */
  .history-list { display: flex; flex-direction: column; gap: 8px; }
  .history-item { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 18px; display: grid; grid-template-columns: auto 1fr auto; gap: 14px; align-items: center; transition: all 0.18s; }
  .history-item:hover { border-color: var(--border2); transform: translateX(2px); }
  .history-icon { width: 40px; height: 40px; border-radius: 11px; display: flex; align-items: center; justify-content: center; font-size: 1rem; background: var(--surface2); border: 1px solid var(--border); flex-shrink: 0; }
  .history-main { min-width: 0; }
  .history-subject { font-weight: 700; font-size: 0.9rem; color: var(--text); margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .history-meta { font-size: 0.76rem; color: var(--muted); }
  .history-side { text-align: right; flex-shrink: 0; }
  .history-filters { display: flex; gap: 6px; flex-wrap: wrap; }
  .filter-chip { padding: 5px 12px; border-radius: 20px; font-size: 0.78rem; font-weight: 600; cursor: pointer; background: var(--surface2); border: 1px solid var(--border); color: var(--text-dim); transition: all 0.15s; }
  .filter-chip.active { background: var(--accent); border-color: var(--accent); color: #fff; box-shadow: 0 2px 8px var(--accent-glow); }
  .filter-chip:not(.active):hover { border-color: var(--border2); color: var(--text); }

  /* ── Detail view ── */
  .detail-header { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 26px; }
  .detail-info { flex: 1; }
  .detail-title { font-family: var(--font-heading); font-size: 1.5rem; font-weight: 800; margin-bottom: 7px; letter-spacing: -0.02em; }
  .detail-meta { display: flex; flex-wrap: wrap; gap: 10px; font-size: 0.8rem; color: var(--text-dim); }
  .detail-meta span { display: inline-flex; align-items: center; gap: 5px; background: var(--surface2); border: 1px solid var(--border); border-radius: 20px; padding: 3px 10px; }
  .export-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

  /* ── Check-in page ── */
  .checkin-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .checkin-card { width: 100%; max-width: 420px; background: var(--surface); border: 1px solid var(--border2); border-radius: 22px; padding: 36px 28px; text-align: center; box-shadow: var(--shadow-lg); }
  .checkin-icon { width: 72px; height: 72px; border-radius: 20px; display: inline-flex; align-items: center; justify-content: center; font-size: 2rem; margin-bottom: 20px; }
  .checkin-icon.success { background: rgba(0,229,160,0.12); border: 1px solid rgba(0,229,160,0.25); }
  .checkin-icon.error { background: rgba(255,107,138,0.12); border: 1px solid rgba(255,107,138,0.25); }
  .checkin-icon.loading { background: var(--surface2); border: 1px solid var(--border); animation: pulseGlow 2s ease infinite; }
  .checkin-title { font-family: var(--font-heading); font-size: 1.5rem; font-weight: 800; margin-bottom: 10px; letter-spacing: -0.02em; }
  .checkin-sub { color: var(--text-dim); font-size: 0.88rem; }

  /* ── Empty state ── */
  .empty { text-align: center; padding: 60px 20px; }
  .empty-icon { font-size: 2.8rem; margin-bottom: 14px; opacity: 0.5; }
  .empty-text { color: var(--muted); font-size: 0.9rem; }

  /* ── Loading ── */
  .loading-page { display: flex; align-items: center; justify-content: center; padding: 60px 0; }

  /* ── Settings / Profile ── */
  .settings-page { max-width: 580px; margin: 0 auto; }
  .settings-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 26px 28px; margin-bottom: 16px; }
  .settings-card-title { font-family: var(--font-heading); font-size: 0.95rem; font-weight: 800; margin-bottom: 4px; letter-spacing: -0.01em; }
  .settings-card-sub { font-size: 0.8rem; color: var(--muted); margin-bottom: 22px; }
  .profile-avatar-lg { width: 68px; height: 68px; border-radius: 20px; background: linear-gradient(135deg, var(--accent), var(--accent2)); display: flex; align-items: center; justify-content: center; font-size: 1.7rem; font-weight: 800; color: #fff; margin-bottom: 20px; box-shadow: var(--shadow-accent); }
  .profile-info-row { display: flex; align-items: center; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--border); }
  .profile-info-row:last-child { border-bottom: none; }
  .profile-info-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); font-weight: 700; width: 90px; flex-shrink: 0; }
  .profile-info-value { font-size: 0.88rem; color: var(--text); font-weight: 500; }
  .divider-label { display: flex; align-items: center; gap: 10px; margin: 18px 0; }
  .divider-label span { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 700; white-space: nowrap; }
  .divider-label::before, .divider-label::after { content: ""; flex: 1; height: 1px; background: var(--border); }
  .age-display { display: inline-flex; align-items: center; gap: 8px; background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 14px; font-size: 0.88rem; color: var(--text-dim); margin-top: 8px; }
  .age-value { font-family: var(--font-heading); font-size: 1.5rem; font-weight: 800; color: var(--accent); }

  /* ── Avatar upload ── */
  .avatar-upload-circle { width: 84px; height: 84px; border-radius: 50%; background: linear-gradient(135deg, var(--accent), var(--accent2)); display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: 800; color: #fff; box-shadow: var(--shadow-accent); position: relative; overflow: hidden; border: 3px solid var(--border2); transition: all 0.2s; cursor: pointer; flex-shrink: 0; }
  .avatar-upload-circle:hover { border-color: var(--accent); transform: scale(1.04); }
  .avatar-upload-circle img { width: 100%; height: 100%; object-fit: cover; }
  .avatar-upload-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; font-size: 1.3rem; }
  .avatar-upload-circle:hover .avatar-upload-overlay { opacity: 1; }
  .avatar-upload-hint { font-size: 0.76rem; color: var(--muted); margin-top: 4px; }
  .avatar-img { width: 28px; height: 28px; border-radius: 8px; object-fit: cover; margin-right: 10px; flex-shrink: 0; }

  /* ── Accordion ── */
  .accordion-month { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; transition: border-color 0.2s; }
  .accordion-month:hover { border-color: var(--border2); }
  .accordion-month-header { display: flex; align-items: center; justify-content: space-between; padding: 13px 18px; background: var(--surface2); cursor: pointer; user-select: none; transition: background 0.15s; }
  .accordion-month-header:hover { background: var(--surface3); }
  .accordion-day { border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden; transition: border-color 0.15s; }
  .accordion-day:hover { border-color: var(--border2); }
  .accordion-day-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: var(--surface2); cursor: pointer; user-select: none; }
  .accordion-day-header:hover { background: var(--surface3); }
  .accordion-chevron { color: var(--muted); font-size: 0.75rem; transition: transform 0.22s cubic-bezier(0.4,0,0.2,1); display: inline-block; }
  .accordion-chevron.open { transform: rotate(180deg); }

  /* ── Profile popup (nav) ── */
  .profile-popup-wrap { position: relative; }
  .profile-pill-btn { display: flex; align-items: center; gap: 9px; background: var(--surface2); border: 1px solid var(--border); padding: 5px 12px 5px 5px; border-radius: 40px; cursor: pointer; transition: all 0.18s; font-family: var(--font-body); }
  .profile-pill-btn:hover { border-color: var(--border2); background: var(--surface3); }
  .profile-popup { position: absolute; top: calc(100% + 10px); right: 0; width: 280px; background: var(--surface); border: 1px solid var(--border2); border-radius: 18px; box-shadow: var(--shadow-lg); z-index: 200; overflow: hidden; animation: slideUp 0.18s cubic-bezier(0.34,1.56,0.64,1); }
  .profile-popup-head { padding: 20px 18px 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 13px; }
  .profile-popup-avatar { width: 48px; height: 48px; border-radius: 14px; background: linear-gradient(135deg, var(--accent), var(--accent2)); display: flex; align-items: center; justify-content: center; font-size: 1.2rem; font-weight: 800; color: #fff; flex-shrink: 0; overflow: hidden; box-shadow: var(--shadow-accent); }
  .profile-popup-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .profile-popup-name { font-weight: 800; font-size: 0.95rem; color: var(--text); margin-bottom: 2px; letter-spacing: -0.01em; }
  .profile-popup-email { font-size: 0.75rem; color: var(--muted); }
  .profile-popup-role { display: inline-flex; align-items: center; margin-top: 5px; background: var(--surface2); border: 1px solid var(--border); border-radius: 20px; padding: 2px 9px; font-size: 0.7rem; font-weight: 700; color: var(--text-dim); text-transform: capitalize; }
  .profile-popup-rows { padding: 10px 0; }
  .profile-popup-row { display: flex; align-items: center; justify-content: space-between; padding: 7px 18px; font-size: 0.82rem; }
  .profile-popup-row-label { color: var(--muted); font-weight: 600; font-size: 0.73rem; text-transform: uppercase; letter-spacing: 0.06em; }
  .profile-popup-row-val { color: var(--text); font-weight: 600; }
  .profile-popup-actions { padding: 10px 14px 14px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 6px; }
  .profile-popup-btn { width: 100%; padding: 9px 14px; background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius-sm); font-family: var(--font-body); font-size: 0.83rem; font-weight: 600; color: var(--text-dim); cursor: pointer; text-align: left; transition: all 0.15s; display: flex; align-items: center; gap: 9px; }
  .profile-popup-btn:hover { background: var(--surface3); color: var(--text); border-color: var(--border2); }
  .profile-popup-btn.danger { color: var(--red); }
  .profile-popup-btn.danger:hover { background: rgba(255,107,138,0.08); border-color: rgba(255,107,138,0.2); }

  /* ── Student info modal (teacher view) ── */
  .student-modal-avatar { width: 72px; height: 72px; border-radius: 20px; background: linear-gradient(135deg, var(--accent), var(--accent2)); display: flex; align-items: center; justify-content: center; font-size: 1.8rem; font-weight: 800; color: #fff; margin: 0 auto 18px; overflow: hidden; box-shadow: var(--shadow-accent); }
  .student-modal-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .student-modal-name { font-family: var(--font-heading); font-size: 1.3rem; font-weight: 800; text-align: center; margin-bottom: 4px; letter-spacing: -0.02em; }
  .student-modal-sub { text-align: center; font-size: 0.82rem; color: var(--muted); margin-bottom: 20px; }
  .student-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 16px; }
  .student-info-tile { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px 14px; }
  .student-info-tile-label { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 700; margin-bottom: 5px; }
  .student-info-tile-val { font-size: 0.9rem; font-weight: 700; color: var(--text); }
  .student-info-tile-val.accent { color: var(--accent); font-family: var(--font-heading); font-size: 1.2rem; }

  /* ── Responsive ── */
  @media (max-width: 640px) {
    .container { padding: 0 16px; }
    .main { padding: 24px 0 56px; }
    .nav-inner { height: auto; padding: 10px 0; flex-wrap: wrap; gap: 8px; }
    .nav-brand { font-size: 1rem; }
    .nav-actions { gap: 6px; flex-wrap: wrap; }
    .nav-settings-btn { padding: 6px 10px; font-size: 0.75rem; }
    .user-pill { padding: 4px 10px 4px 5px; }
    .user-name { font-size: 0.78rem; }
    .user-role { font-size: 0.68rem; }
    .page-title { font-size: 1.55rem; }
    .page-header { flex-direction: column; align-items: flex-start; gap: 12px; }
    .stats-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
    .stat-value { font-size: 1.8rem; }
    .session-card { flex-wrap: wrap; gap: 10px; padding: 14px 16px; }
    .session-actions { width: 100%; justify-content: flex-start; flex-wrap: wrap; gap: 6px; }
    .form-row { grid-template-columns: 1fr; }
    .modal { padding: 22px 18px; border-radius: 18px; }
    .modal-actions { flex-direction: column; }
    .modal-actions .btn { width: 100%; }
    .history-item { grid-template-columns: auto 1fr; }
    .history-side { display: none; }
    .detail-meta { gap: 6px; }
    .detail-title { font-size: 1.25rem; }
    .section-header { flex-direction: column; align-items: flex-start; gap: 10px; }
    .export-bar { width: 100%; flex-wrap: wrap; }
    .history-filters { flex-wrap: wrap; }
    .settings-card { padding: 20px 16px; }
    .settings-page { max-width: 100%; }
    .avatar-upload-circle { width: 68px; height: 68px; font-size: 1.6rem; }
    .profile-info-row { flex-direction: column; align-items: flex-start; gap: 3px; }
    .profile-info-label { width: auto; }
    .auth-card { padding: 28px 20px; border-radius: 18px; }
    .auth-title { font-size: 1.6rem; }
    table { font-size: 0.77rem; }
    th, td { padding: 8px 10px; }
    .avatar { width: 24px; height: 24px; border-radius: 6px; margin-right: 7px; }
  }
  @media (max-width: 400px) {
    .session-actions .btn { font-size: 0.72rem; padding: 5px 9px; }
    .nav-actions { gap: 5px; }
    .stats-grid { grid-template-columns: 1fr 1fr; }
  }
`;

// ─── COMPONENTS ───────────────────────────────────────────────────────────────
function Logo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="36" height="36" rx="10" fill="url(#lg)"/>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7c6fff"/>
          <stop offset="1" stopColor="#ff6b8a"/>
        </linearGradient>
      </defs>
      <rect x="9" y="10" width="11" height="2.5" rx="1.25" fill="white" fillOpacity="0.9"/>
      <rect x="9" y="16.75" width="18" height="2.5" rx="1.25" fill="white" fillOpacity="0.9"/>
      <rect x="9" y="23.5" width="14" height="2.5" rx="1.25" fill="white" fillOpacity="0.9"/>
      <circle cx="24.5" cy="11.25" r="4" fill="white" fillOpacity="0.2" stroke="white" strokeOpacity="0.8" strokeWidth="1.5"/>
      <path d="M22.5 11.25l1.3 1.3 2.2-2.2" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function Spinner({ size = 18 }) {
  return <div className="spinner" style={{ width: size, height: size }} />;
}

function Alert({ type = "error", message }) {
  if (!message) return null;
  const icon = type === "error" ? "⚠" : "✓";
  return <div className={`alert alert-${type}`}><span>{icon}</span>{message}</div>;
}

function Nav({ onSettings }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // Close popup when clicking outside
  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const calcAge = (bd) => {
    if (!bd) return null;
    const today = new Date(), birth = new Date(bd);
    let age = today.getFullYear() - birth.getFullYear();
    if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
    return age;
  };

  return (
    <nav className="nav">
      <div className="container nav-inner">
        <div className="nav-brand">
          <div className="nav-logo-wrap"><Logo size={22} /></div>
          AttendQR
        </div>
        <div className="nav-actions">
          {user && (
            <div className="profile-popup-wrap" ref={wrapRef}>
              <button className="profile-pill-btn" onClick={() => setOpen(o => !o)}>
                <div className="user-avatar" style={{ width: 30, height: 30, borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}>
                  {user.profilePicture
                    ? <img key={user.profilePicture.slice(-10)} src={user.profilePicture} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    : <span style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.72rem", fontWeight: 800 }}>{user.name?.[0]?.toUpperCase()}</span>
                  }
                </div>
                <div style={{ textAlign: "left" }}>
                  <div className="user-name">{user.name}</div>
                  <div className="user-role">{user.role}</div>
                </div>
                <span style={{ color: "var(--muted)", fontSize: "0.65rem", marginLeft: 2 }}>▾</span>
              </button>

              {open && (
                <div className="profile-popup">
                  {/* Header */}
                  <div className="profile-popup-head">
                    <div className="profile-popup-avatar">
                      {user.profilePicture
                        ? <img src={user.profilePicture} alt="avatar" />
                        : user.name?.[0]?.toUpperCase()
                      }
                    </div>
                    <div>
                      <div className="profile-popup-name">{user.name}</div>
                      <div className="profile-popup-email">{user.email}</div>
                      <div className="profile-popup-role">{user.role}</div>
                    </div>
                  </div>

                  {/* Info rows */}
                  <div className="profile-popup-rows">
                    {user.studentId && (
                      <div className="profile-popup-row">
                        <span className="profile-popup-row-label">Student ID</span>
                        <span className="profile-popup-row-val">{user.studentId}</span>
                      </div>
                    )}
                    {user.grade && (
                      <div className="profile-popup-row">
                        <span className="profile-popup-row-label">Grade</span>
                        <span className="profile-popup-row-val">{user.grade}</span>
                      </div>
                    )}
                    {user.section && (
                      <div className="profile-popup-row">
                        <span className="profile-popup-row-label">Section</span>
                        <span className="profile-popup-row-val">{user.section}</span>
                      </div>
                    )}
                    {user.birthdate && (
                      <div className="profile-popup-row">
                        <span className="profile-popup-row-label">Age</span>
                        <span className="profile-popup-row-val">{calcAge(user.birthdate)} yrs old</span>
                      </div>
                    )}
                    {user.school && (
                      <div className="profile-popup-row">
                        <span className="profile-popup-row-label">School</span>
                        <span className="profile-popup-row-val" style={{maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.school}</span>
                      </div>
                    )}
                    {user.subjectsTaught && (
                      <div className="profile-popup-row">
                        <span className="profile-popup-row-label">Subjects</span>
                        <span className="profile-popup-row-val" style={{maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.subjectsTaught}</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="profile-popup-actions">
                    <button className="profile-popup-btn" onClick={() => { setOpen(false); onSettings(); }}>
                      <span>{user.role === "teacher" ? "⚙" : "✏️"}</span>
                      {user.role === "teacher" ? "Settings" : "Edit Profile"}
                    </button>
                    <button className="profile-popup-btn danger" onClick={() => { setOpen(false); logout(); }}>
                      <span>→</span> Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

// ─── FORGOT PASSWORD ──────────────────────────────────────────────────────────
function ForgotPasswordPage({ onBack }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setMsg(null);
    try {
      const data = await api.post("/auth/forgot-password", { email });
      if (data.success) {
        setMsg({ type: "success", text: "Reset link sent! Check your email inbox (and spam folder)." });
      } else {
        setMsg({ type: "error", text: data.message || "Something went wrong. Please try again." });
      }
    } catch (err) {
      // Show the exact backend error message (e.g. "This email address is not registered.")
      setMsg({ type: "error", text: err.message || "Something went wrong. Please try again." });
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-bg-orb auth-bg-orb-1" />
      <div className="auth-bg-orb auth-bg-orb-2" />
      <div className="auth-dots" />
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo-wrap"><Logo size={36} /></div>
          <h1 className="auth-title">Forgot password?</h1>
          <p className="auth-sub">Enter your registered email and we'll send you a reset link</p>
        </div>
        {msg && <Alert type={msg.type} message={msg.text} />}
        {msg?.type !== "success" && (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@school.edu" required />
            </div>
            <button type="submit" className="btn btn-primary btn-lg" style={{ width:"100%" }} disabled={loading}>
              {loading ? <Spinner /> : "Send Reset Link"}
            </button>
          </form>
        )}
        <div className="auth-switch">
          <a onClick={onBack}>← Back to Sign In</a>
        </div>
      </div>
    </div>
  );
}

function ResetPasswordPage({ token }) {
  const [form, setForm] = useState({ newPassword: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.newPassword !== form.confirmPassword)
      return setMsg({ type: "error", text: "Passwords do not match." });
    if (form.newPassword.length < 6)
      return setMsg({ type: "error", text: "Password must be at least 6 characters." });
    setLoading(true); setMsg(null);
    try {
      await api.post("/auth/reset-password", { token, newPassword: form.newPassword });
      setDone(true);
    } catch (err) {
      setMsg({ type: "error", text: err.message });
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-bg-orb auth-bg-orb-1" />
      <div className="auth-bg-orb auth-bg-orb-2" />
      <div className="auth-dots" />
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo-wrap"><Logo size={36} /></div>
          <h1 className="auth-title">{done ? "Password reset!" : "Set new password"}</h1>
          <p className="auth-sub">{done ? "Your password has been updated successfully." : "Choose a strong password (min. 6 characters)"}</p>
        </div>
        {done ? (
          <div style={{ textAlign:"center", marginTop:8 }}>
            <div style={{ fontSize:"3rem", marginBottom:16 }}>✅</div>
            <a href="/" className="btn btn-primary btn-lg" style={{ display:"inline-block" }}>Go to Sign In</a>
          </div>
        ) : (
          <>
            {msg && <Alert type={msg.type} message={msg.text} />}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <input className="form-input" type="password" value={form.newPassword} onChange={e => setForm(f=>({...f,newPassword:e.target.value}))} placeholder="Min. 6 characters" required />
              </div>
              <div className="form-group">
                <label className="form-label">Confirm New Password</label>
                <input className="form-input" type="password" value={form.confirmPassword} onChange={e => setForm(f=>({...f,confirmPassword:e.target.value}))} placeholder="Repeat new password" required />
              </div>
              <button type="submit" className="btn btn-primary btn-lg" style={{ width:"100%" }} disabled={loading}>
                {loading ? <Spinner /> : "Reset Password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
function AuthPage({ onSuccess }) {
  const [mode, setMode] = useState("login");
  const [role, setRole] = useState("student");
  const [form, setForm] = useState({ name: "", email: "", password: "", studentId: "", grade: "", section: "" });
  const [error, setError] = useState("");
  const { login, register, loading } = useAuth();

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const [successMsg, setSuccessMsg] = useState("");
  const [resetToken, setResetToken] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get("token") || "";
  });

  // If URL has ?token=... go straight to reset mode
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setSuccessMsg("");
    try {
      if (mode === "login") { await login(form.email, form.password); onSuccess(); }
      else if (mode === "register") { await register({ ...form, role }); onSuccess(); }
      else if (mode === "forgot") {
        const data = await api.post("/auth/forgot-password", { email: form.email });
        setSuccessMsg(data.message);
      } else if (mode === "reset") {
        if (newPassword !== confirmNewPassword) return setError("Passwords do not match.");
        const data = await api.post("/auth/reset-password", { token: resetToken, password: newPassword });
        setSuccessMsg(data.message);
        setTimeout(() => { setMode("login"); setSuccessMsg(""); }, 2500);
      }
    } catch (err) { setError(err.message); }
  };

  // Auto-switch to reset mode if URL has ?token=
  useEffect(() => {
    if (resetToken) setMode("reset");
  }, [resetToken]);

  const modeConfig = {
    login:    { title: "Welcome back",       sub: "Sign in to your AttendQR account" },
    register: { title: "Get started",        sub: "Create your free account today" },
    forgot:   { title: "Forgot password?",   sub: "Enter your email and we'll send a reset link" },
    reset:    { title: "Set new password",   sub: "Choose a strong password of at least 6 characters" },
  };

  return (
    <div className="auth-page">
      <div className="auth-bg-orb auth-bg-orb-1" />
      <div className="auth-bg-orb auth-bg-orb-2" />
      <div className="auth-dots" />
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo-wrap"><Logo size={36} /></div>
          <h1 className="auth-title">{modeConfig[mode]?.title}</h1>
          <p className="auth-sub">{modeConfig[mode]?.sub}</p>
        </div>

        {mode === "register" && (
          <div className="role-tabs">
            {["student", "teacher"].map((r) => (
              <div key={r} className={`role-tab ${role === r ? "active" : ""}`} onClick={() => setRole(r)}>
                {r === "student" ? "Student" : "Teacher"}
              </div>
            ))}
          </div>
        )}

        {successMsg && <Alert type="success" message={successMsg} />}
        <Alert message={error} />

        <form onSubmit={handleSubmit}>
          {/* ── FORGOT PASSWORD ── */}
          {mode === "forgot" && (
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input className="form-input" type="email" name="email" value={form.email} onChange={handleChange} placeholder="you@school.edu" required />
            </div>
          )}

          {/* ── RESET PASSWORD ── */}
          {mode === "reset" && (
            <>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <input className="form-input" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min. 6 characters" required />
              </div>
              <div className="form-group">
                <label className="form-label">Confirm New Password</label>
                <input className="form-input" type="password" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} placeholder="Repeat new password" required />
              </div>
            </>
          )}

          {/* ── LOGIN / REGISTER ── */}
          {(mode === "login" || mode === "register") && (
            <>
              {mode === "register" && (
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input className="form-input" name="name" value={form.name} onChange={handleChange} placeholder="Juan dela Cruz" required />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input className="form-input" type="email" name="email" value={form.email} onChange={handleChange} placeholder="you@school.edu" required />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input className="form-input" type="password" name="password" value={form.password} onChange={handleChange} placeholder="Min. 6 characters" required />
              </div>
              {mode === "register" && role === "student" && (
                <>
                  <div className="form-group">
                    <label className="form-label">Student ID</label>
                    <input className="form-input" name="studentId" value={form.studentId} onChange={handleChange} placeholder="e.g. 2021-12345" required />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Grade</label>
                      <input className="form-input" name="grade" value={form.grade} onChange={handleChange} placeholder="e.g. Grade 11" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Section</label>
                      <input className="form-input" name="section" value={form.section} onChange={handleChange} placeholder="e.g. Section A" />
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          <button type="submit" className="btn btn-primary btn-lg" style={{ width: "100%" }} disabled={loading}>
            {loading ? <Spinner /> : mode === "login" ? "Sign In" : mode === "register" ? "Create Account" : mode === "forgot" ? "Send Reset Link" : "Reset Password"}
          </button>

          {mode === "login" && (
            <div style={{ textAlign:"center", marginTop:12 }}>
              <span style={{ fontSize:"0.82rem", color:"var(--muted)", cursor:"pointer", transition:"color 0.15s" }}
                onClick={() => { setMode("forgot"); setError(""); setSuccessMsg(""); }}
                onMouseEnter={e=>e.currentTarget.style.color="var(--accent-light)"}
                onMouseLeave={e=>e.currentTarget.style.color="var(--muted)"}>
                Forgot your password?
              </span>
            </div>
          )}
        </form>

        <div className="auth-switch">
          {mode === "login" && <>Don't have an account? <a onClick={() => { setMode("register"); setError(""); setSuccessMsg(""); }}>Sign up</a></>}
          {mode === "register" && <>Already have an account? <a onClick={() => { setMode("login"); setError(""); setSuccessMsg(""); }}>Sign in</a></>}
          {(mode === "forgot" || mode === "reset") && <>Remember your password? <a onClick={() => { setMode("login"); setError(""); setSuccessMsg(""); }}>Sign in</a></>}
        </div>
      </div>
    </div>
  );
}

// ─── CREATE SESSION MODAL ─────────────────────────────────────────────────────
function CreateSessionModal({ onClose, onCreated }) {
  const defaultEnd = getDefaultEndDate();
  const [form, setForm] = useState({ subject: "", room: "", description: "", expiresAt: defaultEnd });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api.post("/sessions", form);
      onCreated(data.session);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-top-row">
            <div>
              <h2 className="modal-title">New Session</h2>
              <p className="modal-sub">Set up a class attendance session</p>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ flexShrink: 0 }}>✕</button>
          </div>
        </div>
        <Alert message={error} />
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Subject *</label>
            <input className="form-input" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="e.g. Computer Science 101" required />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Room</label>
              <input className="form-input" value={form.room} onChange={(e) => setForm((f) => ({ ...f, room: e.target.value }))} placeholder="e.g. Room 201" />
            </div>
            <div className="form-group">
              <label className="form-label">End Date / Time</label>
              <input className="form-input" type="datetime-local" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} />
              <p className="form-hint">Default: 210 days from now</p>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <input className="form-input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional notes about this session" />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
              {loading ? <Spinner /> : "Create Session"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── QR MODAL ─────────────────────────────────────────────────────────────────
function QRModal({ session, onClose, onRefresh, onStop }) {
  const [countdown, setCountdown] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    if (!session.qrExpiresAt) return;
    const tick = () => {
      const secs = Math.max(0, Math.round((new Date(session.qrExpiresAt) - Date.now()) / 1000));
      setCountdown(secs);
      if (secs === 0) handleRefresh();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session.qrExpiresAt]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  };

  const handleStop = async () => {
    setStopping(true);
    try { await onStop(); onClose(); } finally { setStopping(false); }
  };

  const isUrgent = countdown <= 10;
  const progressPct = Math.round((countdown / 60) * 100);

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <div className="modal-top-row">
            <div>
              <h2 className="modal-title">{session.subject}</h2>
              <p className="modal-sub">{session.room ? `📍 ${session.room}` : "No room specified"} · Active since {formatTime(session.startTime)}</p>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
          </div>
        </div>

        {session.qrDataUrl ? (
          <div className="qr-wrapper">
            <img src={session.qrDataUrl} alt="QR Code" />
          </div>
        ) : (
          <div className="loading-page"><Spinner size={32} /></div>
        )}

        <div className="countdown">
          <div className="countdown-ring">
            <div className="countdown-num" style={{ color: isUrgent ? "var(--accent2)" : "var(--green)" }}>
              {String(countdown).padStart(2, "0")}
            </div>
            <div className="countdown-label">seconds until<br />QR refreshes</div>
            <div style={{ width: 36, height: 36, position: "relative" }}>
              <svg width="36" height="36" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="18" cy="18" r="14" fill="none" stroke="var(--border2)" strokeWidth="2.5" />
                <circle cx="18" cy="18" r="14" fill="none"
                  stroke={isUrgent ? "var(--accent2)" : "var(--green)"}
                  strokeWidth="2.5"
                  strokeDasharray={`${2 * Math.PI * 14}`}
                  strokeDashoffset={`${2 * Math.PI * 14 * (1 - progressPct / 100)}`}
                  strokeLinecap="round"
                  style={{ transition: "stroke-dashoffset 0.5s, stroke 0.3s" }}
                />
              </svg>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? <Spinner /> : "🔄 Refresh"}
          </button>
          <button className="btn btn-danger" onClick={handleStop} disabled={stopping} style={{ flex: 1 }}>
            {stopping ? <Spinner /> : "⏹ Stop Session"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SESSION END DATE LABEL ───────────────────────────────────────────────────
function SessionEndLabel({ expiresAt }) {
  if (!expiresAt) return null;
  const end = new Date(expiresAt);
  const now = new Date();
  const diffDays = Math.ceil((end - now) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(255,101,132,0.12)", color: "#ff8fa3", border: "1px solid rgba(255,101,132,0.3)", borderRadius: 20, padding: "2px 10px", fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.02em" }}>
        🔒 Expired
      </span>
    );
  }
  if (diffDays <= 14) return <span className="session-enddate soon">⚠ Expires in {diffDays}d</span>;
  return <span className="session-enddate">📅 Until {formatDate(end)}</span>;
}

function isExpired(session) {
  return session.expiresAt && new Date() > new Date(session.expiresAt);
}

// ─── STUDENT INFO MODAL ──────────────────────────────────────────────────────
function StudentInfoModal({ student, onClose }) {
  if (!student) return null;

  const calcAge = (bd) => {
    if (!bd) return null;
    const today = new Date(), birth = new Date(bd);
    let age = today.getFullYear() - birth.getFullYear();
    if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
    return age;
  };

  const age = calcAge(student.birthdate);

  const tiles = [
    { label: "Student ID", val: student.studentId || "—" },
    { label: "Grade", val: student.grade || "—" },
    { label: "Section", val: student.section || "—" },
    { label: "Email", val: student.email || "—" },
    ...(age !== null ? [{ label: "Age", val: `${age} yrs old`, accent: true }] : []),
    ...(student.birthdate ? [{ label: "Birthdate", val: new Date(student.birthdate).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) }] : []),
  ];

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 400 }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="student-modal-avatar">
          {student.profilePicture
            ? <img src={student.profilePicture} alt="avatar" />
            : student.name?.[0]?.toUpperCase()
          }
        </div>
        <div className="student-modal-name">{student.name}</div>
        <div className="student-modal-sub">{student.email}</div>
        <div className="student-info-grid">
          {tiles.map((t) => (
            <div key={t.label} className="student-info-tile">
              <div className="student-info-tile-label">{t.label}</div>
              <div className={`student-info-tile-val${t.accent ? " accent" : ""}`}>{t.val}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── ATTENDANCE ACCORDION (Month → Day → Table) ───────────────────────────────
function AttendanceAccordion({ records, onStudentClick }) {
  const grouped = records.reduce((acc, a) => {
    const ts = new Date(a.timestamp);
    const mKey = ts.toLocaleDateString("en-PH", { year:"numeric", month:"long", timeZone:"Asia/Manila" });
    const dKey = ts.toLocaleDateString("en-PH", { year:"numeric", month:"long", day:"numeric", timeZone:"Asia/Manila" });
    if (!acc[mKey]) acc[mKey] = {};
    if (!acc[mKey][dKey]) acc[mKey][dKey] = [];
    acc[mKey][dKey].push(a);
    return acc;
  }, {});

  // Sort months and days by actual date (newest first)
  const months = Object.keys(grouped).sort((a, b) => {
    return new Date(b) - new Date(a);
  });
  Object.keys(grouped).forEach(m => {
    grouped[m] = Object.fromEntries(
      Object.entries(grouped[m]).sort((a, b) => new Date(b[0]) - new Date(a[0]))
    );
  });

  // Default: open the most recent month and most recent day
  const latestMonth = months[0] || null;
  const latestDay   = latestMonth ? Object.keys(grouped[latestMonth])[0] : null;

  const [openMonth, setOpenMonth] = useState(latestMonth);
  const [openDays, setOpenDays]   = useState(latestDay ? { [latestDay]: true } : {});

  const toggleMonth = (month) => setOpenMonth((prev) => prev === month ? null : month);
  const toggleDay   = (day)   => setOpenDays((prev) => ({ ...prev, [day]: !prev[day] }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {months.map((month) => {
        const days = Object.keys(grouped[month]);
        const monthTotal = days.reduce((sum, d) => sum + grouped[month][d].length, 0);
        const isMonthOpen = openMonth === month;

        return (
          <div key={month} className="accordion-month">
            <div className="accordion-month-header" onClick={() => toggleMonth(month)}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: "1rem" }}>📆</span>
                <span style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "0.95rem" }}>{month}</span>
                <span style={{ background: "var(--surface3)", border: "1px solid var(--border)", borderRadius: 20, padding: "2px 10px", fontSize: "0.73rem", fontWeight: 600, color: "var(--text-dim)" }}>
                  {days.length}d · {monthTotal} records
                </span>
              </div>
              <span className={`accordion-chevron ${isMonthOpen ? "open" : ""}`}>▼</span>
            </div>

            {isMonthOpen && (
              <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8, background: "var(--surface)" }}>
                {days.map((day) => {
                  const dayRecords = grouped[month][day];
                  const isDayOpen  = !!openDays[day];
                  const presentN   = dayRecords.filter(r => r.status === "present").length;
                  const lateN      = dayRecords.filter(r => r.status === "late").length;

                  return (
                    <div key={day} className="accordion-day">
                      <div className="accordion-day-header" onClick={() => toggleDay(day)}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: "0.82rem" }}>📅</span>
                          <span style={{ fontWeight: 700, fontSize: "0.86rem", color: "var(--text)" }}>{day}</span>
                          <span style={{ fontSize: "0.73rem", color: "var(--muted)" }}>{dayRecords.length} student{dayRecords.length !== 1 ? "s" : ""}</span>
                          {presentN > 0 && <span className="badge badge-present">✓ {presentN}</span>}
                          {lateN   > 0 && <span className="badge badge-late">⏰ {lateN}</span>}
                        </div>
                        <span className={`accordion-chevron ${isDayOpen ? "open" : ""}`}>▼</span>
                      </div>

                      {isDayOpen && (
                        <div className="table-wrapper" style={{ borderRadius: 0, border: "none", borderTop: "1px solid var(--border)" }}>
                          <table>
                            <thead>
                              <tr>
                                <th>#</th>
                                <th>Student Name</th>
                                <th>Student ID</th>
                                <th>Grade</th>
                                <th>Section</th>
                                <th>Status</th>
                                <th>Time</th>
                              </tr>
                            </thead>
                            <tbody>
                              {dayRecords.map((a, i) => {
                                const ts = new Date(a.timestamp);
                                return (
                                  <tr key={a._id}>
                                    <td style={{ color: "var(--muted)", fontSize: "0.78rem" }}>{i + 1}</td>
                                    <td className="td-name" onClick={() => onStudentClick && onStudentClick(a.student)} style={{ cursor: onStudentClick ? "pointer" : "default" }}>
                                      {a.student?.profilePicture
                                        ? <img src={a.student.profilePicture} alt="" className="avatar-img" />
                                        : <span className="avatar">{a.student?.name?.[0]?.toUpperCase()}</span>
                                      }
                                      <span style={{ borderBottom: onStudentClick ? "1px dashed var(--border2)" : "none" }}>{a.student?.name}</span>
                                    </td>
                                    <td>{a.student?.studentId || "—"}</td>
                                    <td>{a.student?.grade || <span style={{ color: "var(--muted)" }}>—</span>}</td>
                                    <td>{a.student?.section || <span style={{ color: "var(--muted)" }}>—</span>}</td>
                                    <td><span className={`badge badge-${a.status}`}>{a.status === "present" ? "✓ Present" : "⏰ Late"}</span></td>
                                    <td>{ts.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Manila" })}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── TEACHER DASHBOARD ────────────────────────────────────────────────────────
function TeacherDashboard() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [activeQR, setActiveQR] = useState(null);
  const [viewSession, setViewSession] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedStudent, setSelectedStudent] = useState(null);

  const fetchSessions = useCallback(async () => {
    try {
      const data = await api.get("/sessions");
      setSessions(data.sessions);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const handleStart = async (sessionId) => {
    try {
      const data = await api.post(`/sessions/${sessionId}/start`, {});
      setSessions((prev) => prev.map((s) => s._id === sessionId ? { ...s, isActive: true } : s));
      setActiveQR(data.session);
    } catch (err) { alert(err.message); }
  };

  const handleRefreshQR = async () => {
    if (!activeQR) return;
    const data = await api.post(`/sessions/${activeQR._id}/refresh-qr`, {});
    setActiveQR(data.session);
  };

  const handleStop = async () => {
    if (!activeQR) return;
    await api.post(`/sessions/${activeQR._id}/stop`, {});
    setSessions((prev) => prev.map((s) => s._id === activeQR._id ? { ...s, isActive: false } : s));
    setActiveQR(null);
    fetchSessions();
  };

  const handleDelete = async (sessionId, sessionSubject) => {
    const session = sessions.find((s) => s._id === sessionId);
    const count = session?.attendanceCount || 0;
    const confirmMsg = count > 0
      ? `Delete "${sessionSubject}"?\n\nThis will also delete ${count} attendance record${count !== 1 ? "s" : ""}.\n\nThis cannot be undone.`
      : `Delete "${sessionSubject}"?\n\nThis cannot be undone.`;
    if (!window.confirm(confirmMsg)) return;
    try {
      // If session is still active, stop it first
      if (session?.isActive) {
        await api.post(`/sessions/${sessionId}/stop`, {});
        if (activeQR?._id === sessionId) setActiveQR(null);
      }
      await api.request(`/sessions/${sessionId}`, { method: "DELETE" });
      setSessions((prev) => prev.filter((s) => s._id !== sessionId));
    } catch (err) { alert(err.message); }
  };

  const viewDetails = async (session) => {
    setViewSession(session);
    setLoadingAttendance(true);
    setFilterStatus("all");
    try {
      const data = await api.get(`/sessions/${session._id}`);
      setAttendance(data.attendance);
    } catch (err) { console.error(err); }
    finally { setLoadingAttendance(false); }
  };

  const filteredAttendance = filterStatus === "all"
    ? attendance
    : attendance.filter((a) => a.status === filterStatus);

  const activeSessions = sessions.filter((s) => s.isActive);
  const totalAttendance = sessions.reduce((acc, s) => acc + (s.attendanceCount || 0), 0);
  const presentCount = attendance.filter((a) => a.status === "present").length;
  const lateCount = attendance.filter((a) => a.status === "late").length;

  return (
    <div className="main">
      <div className="container">
        {viewSession ? (
          <>
            {/* ── DETAIL VIEW ── */}
            <div className="detail-header">
              <button className="btn btn-ghost btn-sm detail-back" onClick={() => setViewSession(null)}>← Back</button>
              <div className="detail-info">
                <div className="detail-title">{viewSession.subject}</div>
                <div className="detail-meta">
                  {viewSession.room && <span>📍 {viewSession.room}</span>}
                  <span>📅 Created {formatDate(viewSession.createdAt)}</span>
                  {viewSession.startTime && <span>▶ Started {formatDateTime(viewSession.startTime)}</span>}
                  {viewSession.endTime && <span>⏹ Stopped {formatDateTime(viewSession.endTime)}</span>}
                  {viewSession.expiresAt && <span>⏳ Expires {formatDate(viewSession.expiresAt)}</span>}
                </div>
              </div>
            </div>

            {/* Stats for this session */}
            {!loadingAttendance && attendance.length > 0 && (
              <div className="stats-grid" style={{ marginBottom: 20 }}>
                <div className="stat-card" style={{ "--stat-color": "var(--accent)" }}>
                  <div className="stat-label">Total</div>
                  <div className="stat-value">{attendance.length}</div>
                </div>
                <div className="stat-card" style={{ "--stat-color": "var(--green)" }}>
                  <div className="stat-label">Present</div>
                  <div className="stat-value">{presentCount}</div>
                </div>
                <div className="stat-card" style={{ "--stat-color": "var(--yellow)" }}>
                  <div className="stat-label">Late</div>
                  <div className="stat-value">{lateCount}</div>
                </div>
                <div className="stat-card" style={{ "--stat-color": "var(--blue)" }}>
                  <div className="stat-label">Rate</div>
                  <div className="stat-value">{Math.round((presentCount / attendance.length) * 100)}%</div>
                  <div className="stat-sub">on-time</div>
                </div>
              </div>
            )}

            <div className="section-header">
              <div className="section-title">👥 Attendance Records</div>
              <div className="export-bar">
                {attendance.length > 0 && (
                  <>
                    <div className="history-filters" style={{ margin: 0 }}>
                      {["all", "present", "late"].map((f) => (
                        <span key={f} className={`filter-chip ${filterStatus === f ? "active" : ""}`} onClick={() => setFilterStatus(f)}>
                          {f === "all" ? "All" : f === "present" ? "✓ Present" : "⏰ Late"}
                          {f === "all" ? ` (${attendance.length})` : f === "present" ? ` (${presentCount})` : ` (${lateCount})`}
                        </span>
                      ))}
                    </div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      <button className="btn btn-excel btn-sm" onClick={() => exportSessionFull(filteredAttendance, viewSession)} title="Export all records for this session">⬇ Full</button>
                      <button className="btn btn-excel btn-sm" onClick={() => {
                        // export each month separately
                        const byMo = filteredAttendance.reduce((acc, a) => { const k = new Date(a.timestamp).toLocaleDateString("en-PH",{year:"numeric",month:"long",timeZone:"Asia/Manila"}); if(!acc[k]) acc[k]=[]; acc[k].push(a); return acc; }, {});
                        Object.entries(byMo).forEach(([mo, recs]) => exportSessionByMonth(recs, viewSession, mo));
                      }} title="Export one file per month">⬇ Monthly</button>
                      <button className="btn btn-excel btn-sm" onClick={() => {
                        // export each day separately
                        const byD = filteredAttendance.reduce((acc, a) => { const k = new Date(a.timestamp).toLocaleDateString("en-PH",{year:"numeric",month:"long",day:"numeric",timeZone:"Asia/Manila"}); if(!acc[k]) acc[k]=[]; acc[k].push(a); return acc; }, {});
                        Object.entries(byD).forEach(([d, recs]) => exportSessionByDay(recs, viewSession, d));
                      }} title="Export one file per day">⬇ Daily</button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {selectedStudent && <StudentInfoModal student={selectedStudent} onClose={() => setSelectedStudent(null)} />}

            {loadingAttendance ? (
              <div className="loading-page"><Spinner size={28} /></div>
            ) : filteredAttendance.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">📭</div>
                <div className="empty-text">{attendance.length === 0 ? "No attendance records for this session yet." : "No records match this filter."}</div>
              </div>
            ) : (
              <AttendanceAccordion records={filteredAttendance} onStudentClick={setSelectedStudent} />
            )}
          </>
        ) : (
          <>
            {/* ── SESSION LIST VIEW ── */}
            <div className="page-header">
              <div className="page-title-block">
                <h1 className="page-title">Teacher Dashboard</h1>
                <p className="page-sub">Manage your class attendance sessions</p>
              </div>
              <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Session</button>
            </div>

            <div className="stats-grid">
              <div className="stat-card" style={{ "--stat-color": "var(--accent)" }}>
                <div className="stat-label">Total Sessions</div>
                <div className="stat-value">{sessions.length}</div>
              </div>
              <div className="stat-card" style={{ "--stat-color": "var(--green)" }}>
                <div className="stat-label">Active Now</div>
                <div className="stat-value">{activeSessions.length}</div>
              </div>
              <div className="stat-card" style={{ "--stat-color": "var(--yellow)" }}>
                <div className="stat-label">Total Check-ins</div>
                <div className="stat-value">{totalAttendance}</div>
              </div>
            </div>

            <div className="section-header">
              <div className="section-title">📚 Sessions</div>
            </div>

            {loading ? (
              <div className="loading-page"><Spinner size={28} /></div>
            ) : sessions.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">📋</div>
                <div className="empty-text">No sessions yet.<br />Create your first session to get started.</div>
              </div>
            ) : (
              <div className="sessions-grid">
                {sessions.map((session) => (
                  <div key={session._id} className="session-card">
                    <div className={`session-icon ${session.isActive ? "active" : isExpired(session) ? "expired-icon" : "inactive"}`}>
                      {session.isActive ? "🟢" : isExpired(session) ? "🔒" : "📚"}
                    </div>
                    <div className="session-info">
                      <div className="session-subject">{session.subject}</div>
                      <div className="session-meta">
                        {session.room && <span>📍 {session.room}</span>}
                        <span>👥 {session.attendanceCount || 0} attended</span>
                        <span>📅 {formatDate(session.createdAt)}</span>
                        {session.startTime && <span>▶ {formatDateTime(session.startTime)}</span>}
                        {session.isActive && <span className="badge badge-active">● Live</span>}
                        <SessionEndLabel expiresAt={session.expiresAt} />
                      </div>
                    </div>
                    <div className="session-actions">
                      {isExpired(session) ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(255,101,132,0.08)", color: "#ff8fa3", border: "1px solid rgba(255,101,132,0.2)", borderRadius: "var(--radius-sm)", padding: "6px 12px", fontSize: "0.8rem", fontWeight: 600 }}>
                          🔒 Expired
                        </span>
                      ) : session.isActive ? (
                        <button className="btn btn-green btn-sm" onClick={() => handleStart(session._id)}>📱 Show QR</button>
                      ) : (
                        <button className="btn btn-primary btn-sm" onClick={() => handleStart(session._id)}>▶ Start</button>
                      )}
                      <button className="btn btn-ghost btn-sm" onClick={() => viewDetails(session)}>View List</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(session._id, session.subject)} title="Delete session and all attendance records">🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {showCreate && (
        <CreateSessionModal
          onClose={() => setShowCreate(false)}
          onCreated={(s) => { setSessions((prev) => [s, ...prev]); }}
        />
      )}

      {activeQR && (
        <QRModal
          session={activeQR}
          onClose={() => setActiveQR(null)}
          onRefresh={handleRefreshQR}
          onStop={handleStop}
        />
      )}
    </div>
  );
}

// ─── STUDENT CHECK-IN ─────────────────────────────────────────────────────────
function CheckInPage({ token }) {
  const [sessionInfo, setSessionInfo] = useState(null);
  const [status, setStatus] = useState("verifying");
  const [message, setMessage] = useState("");
  const { user } = useAuth();

  useEffect(() => {
    const verify = async () => {
      try {
        const data = await api.get(`/attendance/verify/${token}`);
        setSessionInfo(data.session);
        setStatus(data.alreadyAttended ? "already" : "ready");
      } catch (err) { setStatus("error"); setMessage(err.message); }
    };
    if (token) verify();
    else { setStatus("error"); setMessage("No QR token provided."); }
  }, [token]);

  const handleCheckIn = async () => {
    setStatus("loading");
    try {
      const data = await api.post("/attendance/checkin", { token });
      setMessage(data.message);
      setStatus("success");
    } catch (err) { setMessage(err.message); setStatus("error"); }
  };

  return (
    <div className="checkin-page">
      <div className="checkin-card">
        {status === "verifying" && (
          <div className="card" style={{ textAlign: "center" }}>
            <div className="loading-page"><Spinner size={28} /></div>
            <p style={{ color: "var(--muted)", marginTop: 8, fontSize: "0.88rem" }}>Verifying QR code…</p>
          </div>
        )}
        {status === "ready" && sessionInfo && (
          <div className="card">
            <span className="checkin-icon">📋</span>
            <h2 className="checkin-title">{sessionInfo.subject}</h2>
            <p className="checkin-sub">Confirm your attendance below</p>
            {sessionInfo.room && <div className="checkin-info-row">📍 {sessionInfo.room}</div>}
            {sessionInfo.teacher && <div className="checkin-info-row">👨‍🏫 {sessionInfo.teacher}</div>}
            <div className="checkin-info-row" style={{ marginBottom: 24 }}>📅 {formatDateTime(new Date())}</div>
            <p style={{ color: "var(--text-dim)", marginBottom: 22, fontSize: "0.88rem" }}>
              Hi <b style={{ color: "var(--text)" }}>{user?.name}</b> — tap below to mark attendance.
            </p>
            <button className="btn btn-green btn-lg" style={{ width: "100%" }} onClick={handleCheckIn}>
              ✓ Mark Attendance
            </button>
          </div>
        )}
        {status === "loading" && (
          <div className="card" style={{ textAlign: "center" }}>
            <div className="loading-page"><Spinner size={28} /></div>
          </div>
        )}
        {status === "success" && (
          <div className="success-card">
            <span className="checkin-icon">✅</span>
            <h2 className="checkin-title" style={{ color: "var(--green)" }}>Attendance Marked!</h2>
            <p style={{ color: "var(--text-dim)" }}>{message}</p>
            <p style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: 8 }}>{formatDateTime(new Date())}</p>
            <button
              className="btn btn-ghost btn-lg"
              style={{ width: "100%", marginTop: 20 }}
              onClick={() => window.location.href = "/"}
            >
              ✕ Close
            </button>
          </div>
        )}
        {status === "already" && (
          <div className="already-card">
            <span className="checkin-icon">🔄</span>
            <h2 className="checkin-title" style={{ color: "var(--blue)" }}>Already Marked</h2>
            <p style={{ color: "var(--text-dim)" }}>You've already marked attendance for this session.</p>
          </div>
        )}
        {status === "error" && (
          <div className="error-card">
            <span className="checkin-icon">❌</span>
            <h2 className="checkin-title" style={{ color: "var(--accent2)" }}>Check-in Failed</h2>
            <p style={{ color: "var(--text-dim)" }}>{message}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── STUDENT DASHBOARD ────────────────────────────────────────────────────────
function StudentDashboard() {
  const { user } = useAuth();
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  // "subject" | "date" — top-level grouping mode
  const [groupMode, setGroupMode] = useState("subject");
  // accordion open state
  const [openSubjects, setOpenSubjects] = useState({});
  const [openMonths, setOpenMonths]   = useState({});
  const [openDays, setOpenDays]       = useState({});

  useEffect(() => {
    api.get("/attendance/my")
      .then(d => { setAttendance(d.attendance); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const present = attendance.filter(a => a.status === "present").length;
  const late    = attendance.filter(a => a.status === "late").length;
  const rate    = attendance.length > 0 ? Math.round((present / attendance.length) * 100) : 0;

  const filtered = attendance.filter(a => {
    const matchStatus = filterStatus === "all" || a.status === filterStatus;
    const matchSearch = !searchQuery || a.session?.subject?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchStatus && matchSearch;
  });

  // ── Group by SUBJECT → month → day ──────────────────────────────────────────
  const bySubject = filtered.reduce((acc, a) => {
    const subj = a.session?.subject || "Unknown Subject";
    const mo   = new Date(a.timestamp).toLocaleDateString("en-PH",{year:"numeric",month:"long",timeZone:"Asia/Manila"});
    const day  = new Date(a.timestamp).toLocaleDateString("en-PH",{year:"numeric",month:"long",day:"numeric",timeZone:"Asia/Manila"});  // uses dayKey helper
    if (!acc[subj]) acc[subj] = {};
    if (!acc[subj][mo]) acc[subj][mo] = {};
    if (!acc[subj][mo][day]) acc[subj][mo][day] = [];
    acc[subj][mo][day].push(a);
    return acc;
  }, {});

  // ── Group by MONTH → day ─────────────────────────────────────────────────────
  const byMonth = filtered.reduce((acc, a) => {
    const mo  = new Date(a.timestamp).toLocaleDateString("en-PH",{year:"numeric",month:"long",timeZone:"Asia/Manila"});
    const day = new Date(a.timestamp).toLocaleDateString("en-PH",{year:"numeric",month:"long",day:"numeric",timeZone:"Asia/Manila"});
    if (!acc[mo]) acc[mo] = {};
    if (!acc[mo][day]) acc[mo][day] = [];
    acc[mo][day].push(a);
    return acc;
  }, {});

  const sortedMonths = Object.keys(byMonth).sort((a,b) => new Date(b) - new Date(a));
  const sortedSubjects = Object.keys(bySubject).sort();

  const toggleSubj  = k => setOpenSubjects(p => ({ ...p, [k]: !p[k] }));
  const toggleMonth = k => setOpenMonths(p => ({ ...p, [k]: !p[k] }));
  const toggleDay   = k => setOpenDays(p => ({ ...p, [k]: !p[k] }));

  // Flatten a subject→month→day tree into flat array
  const flattenSubj = (subjData) => Object.values(subjData).flatMap(mo => Object.values(mo).flat());

  return (
    <div className="main">
      <div className="container">
        <div className="page-header">
          <div className="page-title-block">
            <h1 className="page-title">My Attendance</h1>
            <p className="page-sub">Track your class attendance history</p>
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-card" style={{ "--stat-color": "var(--accent)" }}>
            <div className="stat-label">Total</div>
            <div className="stat-value">{attendance.length}</div>
          </div>
          <div className="stat-card" style={{ "--stat-color": "var(--green)" }}>
            <div className="stat-label">On Time</div>
            <div className="stat-value">{present}</div>
          </div>
          <div className="stat-card" style={{ "--stat-color": "var(--yellow)" }}>
            <div className="stat-label">Late</div>
            <div className="stat-value">{late}</div>
          </div>
          <div className="stat-card" style={{ "--stat-color": "var(--blue)" }}>
            <div className="stat-label">Rate</div>
            <div className="stat-value">{rate}%</div>
            <div className="stat-sub">on-time</div>
          </div>
        </div>

        {/* Controls row */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          {/* Status filters */}
          <div className="history-filters">
            {["all","present","late"].map(f => (
              <span key={f} className={`filter-chip ${filterStatus===f?"active":""}`} onClick={() => setFilterStatus(f)}>
                {f==="all"?`All (${attendance.length})`:f==="present"?`✓ Present (${present})`:`⏰ Late (${late})`}
              </span>
            ))}
          </div>
          {/* Group mode toggle */}
          <div style={{ display:"flex", background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:"var(--radius-sm)", padding:3, gap:3 }}>
            {[["subject","📚 By Subject"],["date","📅 By Date"]].map(([m,label]) => (
              <button key={m} onClick={() => setGroupMode(m)} style={{ padding:"5px 13px", borderRadius:7, border:"none", background: groupMode===m ? "var(--accent)" : "transparent", color: groupMode===m ? "#fff" : "var(--text-dim)", fontFamily:"var(--font-body)", fontSize:"0.78rem", fontWeight:700, cursor:"pointer", transition:"all 0.15s" }}>
                {label}
              </button>
            ))}
          </div>
          {/* Search */}
          <input className="form-input" style={{ maxWidth:200, padding:"7px 12px", fontSize:"0.82rem" }} placeholder="Search subject…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>

        {loading ? (
          <div className="loading-page"><Spinner size={28} /></div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">{attendance.length===0?"📭":"🔍"}</div>
            <div className="empty-text">{attendance.length===0?"No attendance records yet.\nScan a QR code to get started!":"No records match your filters."}</div>
          </div>
        ) : groupMode === "subject" ? (
          /* ── BY SUBJECT view ── */
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {sortedSubjects.map(subj => {
              const subjRecords = flattenSubj(bySubject[subj]);
              const isOpen = !!openSubjects[subj];
              const pCount = subjRecords.filter(r=>r.status==="present").length;
              const lCount = subjRecords.filter(r=>r.status==="late").length;
              const months = Object.keys(bySubject[subj]).sort((a,b) => new Date(b)-new Date(a));

              return (
                <div key={subj} className="accordion-month">
                  {/* Subject header */}
                  <div className="accordion-month-header" onClick={() => toggleSubj(subj)}>
                    <div style={{ display:"flex", alignItems:"center", gap:10, flex:1, minWidth:0 }}>
                      <span style={{ fontSize:"1.1rem" }}>📚</span>
                      <span style={{ fontFamily:"var(--font-heading)", fontWeight:700, fontSize:"0.95rem", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{subj}</span>
                      <span style={{ background:"var(--surface3)", border:"1px solid var(--border)", borderRadius:20, padding:"2px 10px", fontSize:"0.72rem", fontWeight:600, color:"var(--text-dim)", flexShrink:0 }}>
                        {subjRecords.length} record{subjRecords.length!==1?"s":""}
                      </span>
                      {pCount>0 && <span className="badge badge-present" style={{flexShrink:0}}>✓ {pCount}</span>}
                      {lCount>0 && <span className="badge badge-late" style={{flexShrink:0}}>⏰ {lCount}</span>}
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
                      <button className="btn btn-excel btn-sm" onClick={e => { e.stopPropagation(); exportStudentBySubject(subjRecords, subj, user?.name); }} title="Export this subject">⬇ CSV</button>
                      <span className={`accordion-chevron ${isOpen?"open":""}`}>▼</span>
                    </div>
                  </div>

                  {/* Months inside subject */}
                  {isOpen && (
                    <div style={{ padding:"10px 14px", display:"flex", flexDirection:"column", gap:8, background:"var(--surface)" }}>
                      {months.map(mo => {
                        const moKey = `${subj}__${mo}`;
                        const isMoOpen = !!openMonths[moKey];
                        const days = Object.keys(bySubject[subj][mo]).sort((a,b) => new Date(b)-new Date(a));
                        const moRecords = days.flatMap(d => bySubject[subj][mo][d]);

                        return (
                          <div key={mo} className="accordion-day">
                            <div className="accordion-day-header" onClick={() => toggleMonth(moKey)}>
                              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                                <span style={{ fontSize:"0.85rem" }}>📆</span>
                                <span style={{ fontWeight:700, fontSize:"0.86rem" }}>{mo}</span>
                                <span style={{ fontSize:"0.73rem", color:"var(--muted)" }}>{moRecords.length} records</span>
                              </div>
                              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                                <button className="btn btn-excel btn-sm" onClick={e => { e.stopPropagation(); exportStudentByMonth(moRecords, mo, user?.name); }} title="Export this month">⬇ CSV</button>
                                <span className={`accordion-chevron ${isMoOpen?"open":""}`}>▼</span>
                              </div>
                            </div>
                            {isMoOpen && (
                              <div style={{ padding:"8px 10px", display:"flex", flexDirection:"column", gap:6, background:"var(--surface)" }}>
                                {days.map(day => {
                                  const dayKey2 = `${subj}__${mo}__${day}`;
                                  const isDayOpen = !!openDays[dayKey2];
                                  const dayRecs = bySubject[subj][mo][day];
                                  return (
                                    <div key={day} style={{ border:"1px solid var(--border)", borderRadius:"var(--radius-xs)", overflow:"hidden" }}>
                                      <div onClick={() => toggleDay(dayKey2)} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 12px", background:"var(--surface2)", cursor:"pointer" }}
                                        onMouseEnter={e=>e.currentTarget.style.background="var(--surface3)"}
                                        onMouseLeave={e=>e.currentTarget.style.background="var(--surface2)"}>
                                        <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                                          <span style={{ fontSize:"0.78rem" }}>📅</span>
                                          <span style={{ fontWeight:700, fontSize:"0.82rem" }}>{day}</span>
                                          <span style={{ fontSize:"0.71rem", color:"var(--muted)" }}>{dayRecs.length} record{dayRecs.length!==1?"s":""}</span>
                                        </div>
                                        <span className={`accordion-chevron ${isDayOpen?"open":""}`}>▼</span>
                                      </div>
                                      {isDayOpen && (
                                        <div style={{ padding:"8px 12px", display:"flex", flexDirection:"column", gap:6 }}>
                                          {dayRecs.map(a => (
                                            <StudentHistoryRow key={a._id} record={a} />
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* ── BY DATE view ── */
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {sortedMonths.map(mo => {
              const isMoOpen = !!openMonths[mo];
              const days = Object.keys(byMonth[mo]).sort((a,b) => new Date(b)-new Date(a));
              const moRecords = days.flatMap(d => byMonth[mo][d]);

              return (
                <div key={mo} className="accordion-month">
                  <div className="accordion-month-header" onClick={() => toggleMonth(mo)}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <span style={{ fontSize:"1rem" }}>📆</span>
                      <span style={{ fontFamily:"var(--font-heading)", fontWeight:700, fontSize:"0.95rem" }}>{mo}</span>
                      <span style={{ background:"var(--surface3)", border:"1px solid var(--border)", borderRadius:20, padding:"2px 10px", fontSize:"0.72rem", fontWeight:600, color:"var(--text-dim)" }}>
                        {moRecords.length} records
                      </span>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <button className="btn btn-excel btn-sm" onClick={e => { e.stopPropagation(); exportStudentByMonth(moRecords, mo, user?.name); }} title="Export this month">⬇ CSV</button>
                      <span className={`accordion-chevron ${isMoOpen?"open":""}`}>▼</span>
                    </div>
                  </div>

                  {isMoOpen && (
                    <div style={{ padding:"10px 14px", display:"flex", flexDirection:"column", gap:8, background:"var(--surface)" }}>
                      {days.map(day => {
                        const dayKey2 = `${mo}__${day}`;
                        const isDayOpen = !!openDays[dayKey2];
                        const dayRecs = byMonth[mo][day];
                        return (
                          <div key={day} className="accordion-day">
                            <div className="accordion-day-header" onClick={() => toggleDay(dayKey2)}>
                              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                                <span style={{ fontSize:"0.82rem" }}>📅</span>
                                <span style={{ fontWeight:700, fontSize:"0.86rem" }}>{day}</span>
                                <span style={{ fontSize:"0.73rem", color:"var(--muted)" }}>{dayRecs.length} record{dayRecs.length!==1?"s":""}</span>
                              </div>
                              <span className={`accordion-chevron ${isDayOpen?"open":""}`}>▼</span>
                            </div>
                            {isDayOpen && (
                              <div style={{ padding:"8px 12px", display:"flex", flexDirection:"column", gap:6, background:"var(--surface)" }}>
                                {dayRecs.map(a => (
                                  <StudentHistoryRow key={a._id} record={a} />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StudentHistoryRow({ record: a }) {
  const ts = new Date(a.timestamp);
  return (
    <div style={{ display:"flex", alignItems:"center", gap:12, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:"var(--radius-sm)", padding:"10px 14px" }}>
      <div style={{ width:36, height:36, borderRadius:10, background:"var(--surface3)", border:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1rem", flexShrink:0 }}>📋</div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontWeight:700, fontSize:"0.88rem", color:"var(--text)", marginBottom:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.session?.subject || "Unknown"}</div>
        <div style={{ fontSize:"0.74rem", color:"var(--muted)", display:"flex", gap:8, flexWrap:"wrap" }}>
          {a.session?.room && <span>📍 {a.session.room}</span>}
          {a.session?.teacher?.name && <span>👨‍🏫 {a.session.teacher.name}</span>}
        </div>
      </div>
      <div style={{ textAlign:"right", flexShrink:0 }}>
        <span className={`badge badge-${a.status}`} style={{ display:"inline-flex", marginBottom:4 }}>{a.status==="present"?"✓ Present":"⏰ Late"}</span>
        <div style={{ fontSize:"0.73rem", color:"var(--muted)" }}>{ts.toLocaleTimeString("en-PH",{hour:"2-digit",minute:"2-digit",...PH})}</div>
      </div>
    </div>
  );
}

// ─── TEACHER SETTINGS ────────────────────────────────────────────────────────
// ─── AVATAR UPLOAD COMPONENT ──────────────────────────────────────────────────
function AvatarUpload({ current, name, onChange }) {
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 300;
        const scale = Math.min(MAX / img.width, MAX / img.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        onChange(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 18 }}>
      <div className="avatar-upload-circle" onClick={() => fileRef.current?.click()}>
        {current
          ? <img src={current} alt="avatar" style={{ width:"100%", height:"100%", objectFit:"cover", borderRadius:"50%" }} />
          : <span>{name?.[0]?.toUpperCase() || "?"}</span>
        }
        <div className="avatar-upload-overlay">📷</div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={handleFile} />
      </div>
      <div>
        <div style={{ fontWeight:700, fontSize:"0.88rem", marginBottom:4 }}>
          {current ? "Photo uploaded" : "No photo yet"}
        </div>
        <div className="avatar-upload-hint">Click to upload · Max 300×300 · JPEG</div>
        {current && (
          <button className="btn btn-ghost btn-sm" style={{ marginTop:8 }} onClick={() => onChange(null)}>Remove photo</button>
        )}
      </div>
    </div>
  );
}

function TeacherSettings({ onBack }) {
  const { user, updateUser } = useAuth();

  const [avatar, setAvatar] = useState(user?.profilePicture || null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState(null);
  const avatarChanged = avatar !== (user?.profilePicture || null);

  const [infoForm, setInfoForm] = useState({
    name:           user?.name || "",
    birthdate:      user?.birthdate ? new Date(user.birthdate).toISOString().split("T")[0] : "",
    phoneNumber:    user?.phoneNumber || "",
    school:         user?.school || "",
    department:     user?.department || "",
    subjectsTaught: user?.subjectsTaught || "",
    yearsTeaching:  user?.yearsTeaching || "",
  });
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoMsg, setInfoMsg]   = useState(null);

  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);

  const calcAge = (bd) => {
    if (!bd) return null;
    const today = new Date(), birth = new Date(bd);
    let age = today.getFullYear() - birth.getFullYear();
    if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
    return age >= 0 ? age : null;
  };
  const age = calcAge(infoForm.birthdate);

  const handleAvatarSave = async () => {
    setAvatarLoading(true); setAvatarMsg(null);
    try {
      const data = await api.patch("/auth/profile", { profilePicture: avatar });
      updateUser({ ...data.user, profilePicture: avatar });
      setAvatarMsg({ type: "success", text: "Profile picture updated!" });
    } catch (err) { setAvatarMsg({ type: "error", text: err.message }); }
    finally { setAvatarLoading(false); }
  };

  const handleInfoSave = async (e) => {
    e.preventDefault(); setInfoLoading(true); setInfoMsg(null);
    try {
      const data = await api.patch("/auth/profile", {
        name:           infoForm.name.trim(),
        birthdate:      infoForm.birthdate || null,
        phoneNumber:    infoForm.phoneNumber,
        school:         infoForm.school,
        department:     infoForm.department,
        subjectsTaught: infoForm.subjectsTaught,
        yearsTeaching:  infoForm.yearsTeaching ? Number(infoForm.yearsTeaching) : null,
      });
      updateUser({ ...data.user, profilePicture: avatar });
      setInfoMsg({ type: "success", text: "Profile updated!" });
    } catch (err) { setInfoMsg({ type: "error", text: err.message }); }
    finally { setInfoLoading(false); }
  };

  const handlePasswordSave = async (e) => {
    e.preventDefault(); setPwMsg(null);
    if (pwForm.newPassword !== pwForm.confirmPassword)
      return setPwMsg({ type: "error", text: "Passwords do not match." });
    if (pwForm.newPassword.length < 6)
      return setPwMsg({ type: "error", text: "Password must be at least 6 characters." });
    setPwLoading(true);
    try {
      await api.patch("/auth/profile", { currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword });
      setPwMsg({ type: "success", text: "Password changed!" });
      setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) { setPwMsg({ type: "error", text: err.message }); }
    finally { setPwLoading(false); }
  };

  const inf = (k, v) => setInfoForm(f => ({ ...f, [k]: v }));

  return (
    <div className="main">
      <div className="container">
        <div className="page-header">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back</button>
            <div>
              <h1 className="page-title">Settings</h1>
              <p className="page-sub">Manage your profile and account</p>
            </div>
          </div>
        </div>

        <div className="settings-page">

          {/* ── Profile Picture ── */}
          <div className="settings-card">
            <div className="settings-card-title">Profile Picture</div>
            <div className="settings-card-sub">Shown in the nav and to your students</div>
            {avatarMsg && <Alert type={avatarMsg.type} message={avatarMsg.text} />}
            <AvatarUpload current={avatar} name={user?.name} onChange={setAvatar} />
            <button className="btn btn-primary" onClick={handleAvatarSave} disabled={avatarLoading || !avatarChanged}>
              {avatarLoading ? <Spinner /> : "Save Picture"}
            </button>
          </div>

          {/* ── Account Info (read-only) ── */}
          <div className="settings-card">
            <div className="settings-card-title">Account Info</div>
            <div className="settings-card-sub">Email and role cannot be changed</div>
            <div className="profile-info-row">
              <span className="profile-info-label">Email</span>
              <span className="profile-info-value">{user?.email || "—"}</span>
            </div>
            <div className="profile-info-row">
              <span className="profile-info-label">Role</span>
              <span className="profile-info-value" style={{ textTransform: "capitalize" }}>Teacher</span>
            </div>
            {user?.school && (
              <div className="profile-info-row">
                <span className="profile-info-label">School</span>
                <span className="profile-info-value">{user.school}</span>
              </div>
            )}
            {user?.department && (
              <div className="profile-info-row">
                <span className="profile-info-label">Department</span>
                <span className="profile-info-value">{user.department}</span>
              </div>
            )}
            {user?.subjectsTaught && (
              <div className="profile-info-row">
                <span className="profile-info-label">Subjects</span>
                <span className="profile-info-value">{user.subjectsTaught}</span>
              </div>
            )}
            {user?.yearsTeaching && (
              <div className="profile-info-row">
                <span className="profile-info-label">Experience</span>
                <span className="profile-info-value">{user.yearsTeaching} yr{user.yearsTeaching !== 1 ? "s" : ""} teaching</span>
              </div>
            )}
            {calcAge(user?.birthdate) !== null && (
              <div className="profile-info-row">
                <span className="profile-info-label">Age</span>
                <span className="profile-info-value">
                  <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "1.1rem", color: "var(--accent)" }}>{calcAge(user?.birthdate)}</span> yrs old
                </span>
              </div>
            )}
          </div>

          {/* ── Edit Profile ── */}
          <div className="settings-card">
            <div className="settings-card-title">Edit Profile</div>
            <div className="settings-card-sub">Update your personal and professional information</div>
            {infoMsg && <Alert type={infoMsg.type} message={infoMsg.text} />}
            <form onSubmit={handleInfoSave}>

              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input className="form-input" value={infoForm.name} onChange={e => inf("name", e.target.value)} placeholder="Your full name" required />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Birthdate</label>
                  <input className="form-input" type="date" value={infoForm.birthdate} onChange={e => inf("birthdate", e.target.value)} max={new Date().toISOString().split("T")[0]} />
                  {age !== null && (
                    <div className="age-display">
                      <span className="age-value">{age}</span>
                      <span>years old</span>
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Phone Number</label>
                  <input className="form-input" value={infoForm.phoneNumber} onChange={e => inf("phoneNumber", e.target.value)} placeholder="e.g. 09XX-XXX-XXXX" />
                </div>
              </div>

              <div className="divider-label"><span>Professional Info</span></div>

              <div className="form-group">
                <label className="form-label">School / Institution</label>
                <input className="form-input" value={infoForm.school} onChange={e => inf("school", e.target.value)} placeholder="e.g. De La Salle University" />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Department</label>
                  <input className="form-input" value={infoForm.department} onChange={e => inf("department", e.target.value)} placeholder="e.g. Computer Science" />
                </div>
                <div className="form-group">
                  <label className="form-label">Years Teaching</label>
                  <input className="form-input" type="number" min="0" max="60" value={infoForm.yearsTeaching} onChange={e => inf("yearsTeaching", e.target.value)} placeholder="e.g. 5" />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Subjects Taught</label>
                <input className="form-input" value={infoForm.subjectsTaught} onChange={e => inf("subjectsTaught", e.target.value)} placeholder="e.g. Math, Physics, Computer Science" />
              </div>

              <button type="submit" className="btn btn-primary" disabled={infoLoading}>
                {infoLoading ? <Spinner /> : "Save Changes"}
              </button>
            </form>
          </div>

          {/* ── Change Password ── */}
          <div className="settings-card">
            <div className="settings-card-title">Change Password</div>
            <div className="settings-card-sub">Choose a strong password with at least 6 characters</div>
            {pwMsg && <Alert type={pwMsg.type} message={pwMsg.text} />}
            <form onSubmit={handlePasswordSave}>
              <div className="form-group">
                <label className="form-label">Current Password</label>
                <input className="form-input" type="password" value={pwForm.currentPassword} onChange={e => setPwForm(f => ({ ...f, currentPassword: e.target.value }))} placeholder="Enter current password" required />
              </div>
              <div className="divider-label"><span>New Password</span></div>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <input className="form-input" type="password" value={pwForm.newPassword} onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))} placeholder="Min. 6 characters" required />
              </div>
              <div className="form-group">
                <label className="form-label">Confirm New Password</label>
                <input className="form-input" type="password" value={pwForm.confirmPassword} onChange={e => setPwForm(f => ({ ...f, confirmPassword: e.target.value }))} placeholder="Repeat new password" required />
              </div>
              <button type="submit" className="btn btn-primary" disabled={pwLoading}>
                {pwLoading ? <Spinner /> : "Change Password"}
              </button>
            </form>
          </div>

        </div>
      </div>
    </div>
  );
}


// ─── STUDENT SETTINGS ────────────────────────────────────────────────────────
function StudentSettings({ onBack }) {
  const { user, updateUser } = useAuth();

  const [avatar, setAvatar] = useState(user?.profilePicture || null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState(null);

  const [infoForm, setInfoForm] = useState({
    name: user?.name || "",
    grade: user?.grade || "",
    section: user?.section || "",
    birthdate: user?.birthdate ? new Date(user.birthdate).toISOString().split("T")[0] : "",
  });

  const calcAge = (bd) => {
    if (!bd) return null;
    const today = new Date();
    const birth = new Date(bd);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  };
  const age = calcAge(infoForm.birthdate);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoMsg, setInfoMsg] = useState(null);

  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);

  const handleAvatarSave = async () => {
    setAvatarLoading(true); setAvatarMsg(null);
    try {
      const data = await api.patch("/auth/profile", { profilePicture: avatar });
      // Merge profilePicture directly into user so nav updates instantly
      updateUser({ ...data.user, profilePicture: avatar });
      setAvatarMsg({ type: "success", text: "Profile picture updated!" });
    } catch (err) { setAvatarMsg({ type: "error", text: err.message }); }
    finally { setAvatarLoading(false); }
  };

  const handleInfoSave = async (e) => {
    e.preventDefault(); setInfoLoading(true); setInfoMsg(null);
    try {
      const data = await api.patch("/auth/profile", { name: infoForm.name.trim(), grade: infoForm.grade, section: infoForm.section, birthdate: infoForm.birthdate || null });
      updateUser(data.user);
      setInfoMsg({ type: "success", text: "Profile updated successfully!" });
    } catch (err) { setInfoMsg({ type: "error", text: err.message }); }
    finally { setInfoLoading(false); }
  };

  const handlePasswordSave = async (e) => {
    e.preventDefault(); setPwMsg(null);
    if (pwForm.newPassword !== pwForm.confirmPassword)
      return setPwMsg({ type: "error", text: "New passwords do not match." });
    if (pwForm.newPassword.length < 6)
      return setPwMsg({ type: "error", text: "New password must be at least 6 characters." });
    setPwLoading(true);
    try {
      await api.patch("/auth/profile", { currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword });
      setPwMsg({ type: "success", text: "Password changed successfully!" });
      setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) { setPwMsg({ type: "error", text: err.message }); }
    finally { setPwLoading(false); }
  };

  const avatarChanged = avatar !== (user?.profilePicture || null);

  return (
    <div className="main">
      <div className="container">
        <div className="page-header">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back</button>
            <div className="page-title-block">
              <h1 className="page-title">My Profile</h1>
              <p className="page-sub">Edit your personal information</p>
            </div>
          </div>
        </div>

        <div className="settings-page">
          {/* Profile Picture */}
          <div className="settings-card">
            <div className="settings-card-title">🖼 Profile Picture</div>
            <div className="settings-card-sub">Your photo shown to teachers in attendance records</div>
            {avatarMsg && <Alert type={avatarMsg.type} message={avatarMsg.text} />}
            <AvatarUpload current={avatar} name={user?.name} onChange={setAvatar} />
            <button className="btn btn-primary" onClick={handleAvatarSave} disabled={avatarLoading || !avatarChanged}>
              {avatarLoading ? <Spinner /> : "Save Picture"}
            </button>
          </div>

          {/* Account Info */}
          <div className="settings-card">
            <div className="settings-card-title">👤 Account Info</div>
            <div className="settings-card-sub">Your student details — email and ID cannot be changed</div>
            <div className="profile-info-row">
              <span className="profile-info-label">Email</span>
              <span className="profile-info-value">{user?.email}</span>
            </div>
            <div className="profile-info-row">
              <span className="profile-info-label">Student ID</span>
              <span className="profile-info-value">{user?.studentId || "—"}</span>
            </div>
            {user?.grade && <div className="profile-info-row"><span className="profile-info-label">Grade</span><span className="profile-info-value">{user.grade}</span></div>}
            {user?.section && <div className="profile-info-row"><span className="profile-info-label">Section</span><span className="profile-info-value">{user.section}</span></div>}
            {user?.birthdate && (() => { const bd = new Date(user.birthdate); const today = new Date(); let a = today.getFullYear() - bd.getFullYear(); if (today.getMonth() < bd.getMonth() || (today.getMonth() === bd.getMonth() && today.getDate() < bd.getDate())) a--; return (<div className="profile-info-row"><span className="profile-info-label">Age</span><span className="profile-info-value"><span style={{fontFamily:"var(--font-heading)",fontWeight:800,fontSize:"1.1rem",color:"var(--accent)"}}>{a}</span> yrs old</span></div>); })()}
          </div>

          {/* Edit Name, Grade, Section, Birthdate */}
          <div className="settings-card">
            <div className="settings-card-title">✏️ Edit Profile</div>
            <div className="settings-card-sub">Update your personal information</div>
            {infoMsg && <Alert type={infoMsg.type} message={infoMsg.text} />}
            <form onSubmit={handleInfoSave}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input className="form-input" value={infoForm.name} onChange={(e) => setInfoForm(f => ({ ...f, name: e.target.value }))} placeholder="Your full name" required />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Grade</label>
                  <input className="form-input" value={infoForm.grade} onChange={(e) => setInfoForm(f => ({ ...f, grade: e.target.value }))} placeholder="e.g. Grade 11" />
                </div>
                <div className="form-group">
                  <label className="form-label">Section</label>
                  <input className="form-input" value={infoForm.section} onChange={(e) => setInfoForm(f => ({ ...f, section: e.target.value }))} placeholder="e.g. Rizal" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Birthdate</label>
                <input className="form-input" type="date" value={infoForm.birthdate} onChange={(e) => setInfoForm(f => ({ ...f, birthdate: e.target.value }))} max={new Date().toISOString().split("T")[0]} />
                {age !== null && (
                  <div className="age-display">
                    <span className="age-value">{age}</span>
                    <span>years old</span>
                  </div>
                )}
              </div>
              <button type="submit" className="btn btn-primary" disabled={infoLoading}>
                {infoLoading ? <Spinner /> : "Save Changes"}
              </button>
            </form>
          </div>

          {/* Change Password */}
          <div className="settings-card">
            <div className="settings-card-title">🔐 Change Password</div>
            <div className="settings-card-sub">Choose a strong password with at least 6 characters</div>
            {pwMsg && <Alert type={pwMsg.type} message={pwMsg.text} />}
            <form onSubmit={handlePasswordSave}>
              <div className="form-group">
                <label className="form-label">Current Password</label>
                <input className="form-input" type="password" value={pwForm.currentPassword} onChange={(e) => setPwForm(f => ({ ...f, currentPassword: e.target.value }))} placeholder="Enter current password" required />
              </div>
              <div className="divider-label"><span>New Password</span></div>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <input className="form-input" type="password" value={pwForm.newPassword} onChange={(e) => setPwForm(f => ({ ...f, newPassword: e.target.value }))} placeholder="Min. 6 characters" required />
              </div>
              <div className="form-group">
                <label className="form-label">Confirm New Password</label>
                <input className="form-input" type="password" value={pwForm.confirmPassword} onChange={(e) => setPwForm(f => ({ ...f, confirmPassword: e.target.value }))} placeholder="Repeat new password" required />
              </div>
              <button type="submit" className="btn btn-primary" disabled={pwLoading}>
                {pwLoading ? <Spinner /> : "Change Password"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ROUTER ───────────────────────────────────────────────────────────────────
function App() {
  const { user } = useAuth();
  const [page, setPage] = useState("home");
  const [qrToken, setQrToken] = useState(null);

  const [resetToken, setResetToken] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const path = window.location.pathname;
    if (path === "/reset-password" && token) {
      setResetToken(token);
      setPage("reset-password");
    } else if (token) {
      setQrToken(token);
      setPage("checkin");
    }
  }, []);

  const handleAuthSuccess = () => setPage("home");

  if (page === "reset-password" && resetToken) return <ResetPasswordPage token={resetToken} />;
  if (!user) return <AuthPage onSuccess={handleAuthSuccess} />;

  return (
    <div className="app">
      <Nav onSettings={() => setPage("settings")} />
      {page === "checkin" && qrToken ? (
        <CheckInPage token={qrToken} />
      ) : page === "settings" && user.role === "teacher" ? (
        <TeacherSettings onBack={() => setPage("home")} />
      ) : page === "settings" && user.role === "student" ? (
        <StudentSettings onBack={() => setPage("home")} />
      ) : user.role === "teacher" ? (
        <TeacherDashboard />
      ) : (
        <StudentDashboard />
      )}
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function Root() {
  return (
    <>
      <style>{styles}</style>
      <AuthProvider>
        <App />
      </AuthProvider>
    </>
  );
}
