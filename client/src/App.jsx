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

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, login, register, logout, loading }}>{children}</AuthContext.Provider>;
}

// ─── EXCEL EXPORT UTILITY ─────────────────────────────────────────────────────
function exportToExcel(attendance, sessionInfo) {
  const bom = "\uFEFF";

  // Title / metadata rows at top of sheet
  const titleRows = [
    [`"Attendance Report"`],
    [`"Session:", "${sessionInfo?.subject || "N/A"}"`],
    [`"Room:", "${sessionInfo?.room || "N/A"}"`],
    [`"Date Exported:", "${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}"`],
    [`"Total Records:", "${attendance.length}"`],
    [`""`], // blank spacer
  ];

  const headers = ["No.", "Student Name", "Student ID", "Grade", "Section", "Sessions Attended", "Status", "Date", "Time"];

  // Count per-student attendance appearances in this list
  const countByStudent = attendance.reduce((acc, a) => {
    const key = a.student?._id || a.student?.studentId || a.student?.name || "?";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const rows = attendance.map((a, i) => {
    const ts = new Date(a.timestamp);
    const key = a.student?._id || a.student?.studentId || a.student?.name || "?";
    return [
      i + 1,
      a.student?.name || "N/A",
      a.student?.studentId || "N/A",
      a.student?.grade || "N/A",
      a.student?.section || "N/A",
      countByStudent[key] || 1,
      a.status === "present" ? "Present" : "Late",
      ts.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      ts.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    ];
  });

  // Title rows are already quoted strings, data rows need escaping
  const titleCsv = titleRows.map((row) => row.join(",")).join("\n");
  const headerCsv = headers.map((h) => `"${h}"`).join(",");
  const dataCsv = rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const csvContent = [titleCsv, headerCsv, dataCsv].join("\n");

  const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeName = (sessionInfo?.subject || "attendance").replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const dateStr = new Date().toISOString().split("T")[0];
  link.href = url;
  link.download = `${safeName}_attendance_${dateStr}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function exportStudentHistoryToExcel(attendance, studentName) {
  const bom = "\uFEFF";
  const headers = ["Subject", "Room", "Teacher", "Status", "Date", "Time"];
  const rows = attendance.map((a) => {
    const ts = new Date(a.timestamp);
    return [
      a.session?.subject || "N/A",
      a.session?.room || "N/A",
      a.session?.teacher?.name || "N/A",
      a.status === "present" ? "Present" : "Late",
      ts.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      ts.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    ];
  });

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeName = (studentName || "student").replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const dateStr = new Date().toISOString().split("T")[0];
  link.href = url;
  link.download = `${safeName}_attendance_history_${dateStr}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ─── DATE HELPERS ─────────────────────────────────────────────────────────────
function formatDate(date) {
  return new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
function formatDateTime(date) {
  return new Date(date).toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
function formatTime(date) {
  return new Date(date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}
function getDefaultEndDate() {
  const d = new Date();
  d.setDate(d.getDate() + 210);
  return d.toISOString().slice(0, 16);
}

// ─── STYLES ────────────────────────────────────────────────────────────────────
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #070710;
    --surface: #0f0f1c;
    --surface2: #16162a;
    --surface3: #1e1e35;
    --border: rgba(255,255,255,0.07);
    --border2: rgba(255,255,255,0.12);
    --accent: #6c63ff;
    --accent-light: #8b84ff;
    --accent2: #ff6584;
    --green: #00d68f;
    --green-dim: rgba(0,214,143,0.1);
    --yellow: #ffba08;
    --yellow-dim: rgba(255,186,8,0.1);
    --blue: #4dabf7;
    --text: #e8e8f2;
    --text-dim: #a0a0c0;
    --muted: #5c5c80;
    --radius: 14px;
    --radius-sm: 8px;
    --font-heading: 'Syne', sans-serif;
    --font-body: 'DM Sans', sans-serif;
    --shadow-sm: 0 2px 8px rgba(0,0,0,0.3);
    --shadow-md: 0 8px 24px rgba(0,0,0,0.4);
    --shadow-lg: 0 20px 60px rgba(0,0,0,0.5);
    --shadow-accent: 0 8px 32px rgba(108,99,255,0.3);
  }

  html { scroll-behavior: smooth; }
  body { background: var(--bg); color: var(--text); font-family: var(--font-body); min-height: 100vh; -webkit-font-smoothing: antialiased; }

  /* Layout */
  .app { min-height: 100vh; display: flex; flex-direction: column; }
  .container { max-width: 1140px; margin: 0 auto; padding: 0 28px; width: 100%; }

  /* Nav */
  .nav {
    padding: 0;
    border-bottom: 1px solid var(--border);
    position: sticky; top: 0;
    background: rgba(7,7,16,0.92);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    z-index: 100;
  }
  .nav-inner { display: flex; align-items: center; justify-content: space-between; height: 64px; }
  .nav-brand { font-family: var(--font-heading); font-size: 1.25rem; font-weight: 800; color: var(--text); display: flex; align-items: center; gap: 10px; text-decoration: none; }
  .nav-logo { background: linear-gradient(135deg, var(--accent) 0%, var(--accent2) 100%); width: 32px; height: 32px; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.9rem; box-shadow: var(--shadow-accent); flex-shrink: 0; }
  .nav-actions { display: flex; align-items: center; gap: 12px; }
  .user-pill { display: flex; align-items: center; gap: 8px; background: var(--surface2); border: 1px solid var(--border); padding: 6px 14px 6px 8px; border-radius: 40px; }
  .user-avatar { width: 26px; height: 26px; border-radius: 50%; background: linear-gradient(135deg, var(--accent), var(--accent2)); display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 700; color: #fff; flex-shrink: 0; }
  .user-name { font-size: 0.82rem; font-weight: 600; color: var(--text); }
  .user-role { font-size: 0.75rem; color: var(--muted); }

  /* Buttons */
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 18px; border-radius: var(--radius-sm); font-family: var(--font-body); font-size: 0.875rem; font-weight: 500; cursor: pointer; border: none; transition: all 0.18s ease; text-decoration: none; white-space: nowrap; }
  .btn:disabled { opacity: 0.45; cursor: not-allowed; pointer-events: none; }
  .btn-primary { background: var(--accent); color: #fff; box-shadow: 0 0 0 0 rgba(108,99,255,0); }
  .btn-primary:hover { background: var(--accent-light); box-shadow: var(--shadow-accent); transform: translateY(-1px); }
  .btn-danger { background: rgba(255,101,132,0.12); color: #ff8fa3; border: 1px solid rgba(255,101,132,0.25); }
  .btn-danger:hover { background: rgba(255,101,132,0.2); border-color: rgba(255,101,132,0.4); }
  .btn-ghost { background: var(--surface2); color: var(--text-dim); border: 1px solid var(--border); }
  .btn-ghost:hover { color: var(--text); border-color: var(--border2); background: var(--surface3); }
  .btn-green { background: rgba(0,214,143,0.1); color: var(--green); border: 1px solid rgba(0,214,143,0.25); }
  .btn-green:hover { background: rgba(0,214,143,0.18); border-color: rgba(0,214,143,0.4); }
  .btn-excel { background: rgba(21,128,61,0.12); color: #4ade80; border: 1px solid rgba(21,128,61,0.3); }
  .btn-excel:hover { background: rgba(21,128,61,0.2); border-color: rgba(21,128,61,0.5); }
  .btn-sm { padding: 6px 12px; font-size: 0.8rem; border-radius: 7px; }
  .btn-lg { padding: 13px 26px; font-size: 0.95rem; border-radius: 10px; }

  /* Cards */
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; }

  /* Forms */
  .form-group { margin-bottom: 16px; }
  .form-label { display: block; font-size: 0.75rem; font-weight: 600; color: var(--muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.06em; }
  .form-input { width: 100%; background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 13px; color: var(--text); font-family: var(--font-body); font-size: 0.9rem; transition: all 0.18s; outline: none; }
  .form-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(108,99,255,0.12); }
  .form-input::placeholder { color: var(--muted); }
  .form-select { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%235c5c80' d='M6 8L1 3h10z'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; padding-right: 36px; cursor: pointer; }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .form-hint { font-size: 0.75rem; color: var(--muted); margin-top: 4px; }

  /* Alert */
  .alert { padding: 11px 14px; border-radius: var(--radius-sm); font-size: 0.86rem; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
  .alert-error { background: rgba(255,101,132,0.08); border: 1px solid rgba(255,101,132,0.2); color: #ff8fa3; }
  .alert-success { background: rgba(0,214,143,0.08); border: 1px solid rgba(0,214,143,0.2); color: var(--green); }

  /* Auth */
  .auth-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; position: relative; overflow: hidden; }
  .auth-bg { position: absolute; inset: 0; background: radial-gradient(ellipse 70% 50% at 50% 0%, rgba(108,99,255,0.15) 0%, transparent 70%); pointer-events: none; }
  .auth-grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px); background-size: 60px 60px; pointer-events: none; mask-image: radial-gradient(ellipse at center, black 0%, transparent 70%); }
  .auth-card { width: 100%; max-width: 440px; position: relative; z-index: 1; }
  .auth-header { text-align: center; margin-bottom: 32px; }
  .auth-logo { width: 60px; height: 60px; background: linear-gradient(135deg, var(--accent), var(--accent2)); border-radius: 18px; display: inline-flex; align-items: center; justify-content: center; font-size: 1.8rem; margin-bottom: 18px; box-shadow: 0 16px 40px rgba(108,99,255,0.4); }
  .auth-title { font-family: var(--font-heading); font-size: 1.9rem; font-weight: 800; margin-bottom: 6px; }
  .auth-sub { color: var(--text-dim); font-size: 0.88rem; }
  .auth-switch { text-align: center; margin-top: 18px; font-size: 0.85rem; color: var(--muted); }
  .auth-switch a { color: var(--accent-light); cursor: pointer; font-weight: 500; }
  .auth-switch a:hover { text-decoration: underline; }
  .role-tabs { display: flex; background: var(--surface2); border-radius: var(--radius-sm); padding: 3px; margin-bottom: 22px; gap: 3px; }
  .role-tab { flex: 1; padding: 8px; text-align: center; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 500; transition: all 0.18s; color: var(--muted); }
  .role-tab.active { background: var(--surface3); color: var(--text); box-shadow: var(--shadow-sm); }

  /* Dashboard layout */
  .main { flex: 1; padding: 36px 0 60px; }
  .page-header { margin-bottom: 28px; display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 16px; }
  .page-title { font-family: var(--font-heading); font-size: 1.9rem; font-weight: 800; margin-bottom: 4px; line-height: 1.2; }
  .page-sub { color: var(--text-dim); font-size: 0.88rem; }
  .page-title-block { }

  /* Stats */
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; margin-bottom: 28px; }
  .stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px 20px; position: relative; overflow: hidden; }
  .stat-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: var(--stat-color, var(--accent)); opacity: 0.6; }
  .stat-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); margin-bottom: 10px; font-weight: 600; }
  .stat-value { font-family: var(--font-heading); font-size: 2rem; font-weight: 800; line-height: 1; color: var(--stat-color, var(--text)); }
  .stat-sub { font-size: 0.75rem; color: var(--muted); margin-top: 5px; }

  /* Section header */
  .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 10px; }
  .section-title { font-family: var(--font-heading); font-size: 1rem; font-weight: 700; display: flex; align-items: center; gap: 8px; }

  /* Sessions grid */
  .sessions-grid { display: grid; gap: 12px; }
  .session-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px 20px; display: flex; align-items: center; gap: 16px; transition: all 0.2s; cursor: default; }
  .session-card:hover { border-color: rgba(108,99,255,0.2); background: var(--surface2); }
  .session-icon { width: 44px; height: 44px; border-radius: 11px; display: flex; align-items: center; justify-content: center; font-size: 1.15rem; flex-shrink: 0; }
  .session-icon.active { background: rgba(0,214,143,0.1); border: 1px solid rgba(0,214,143,0.2); }
  .session-icon.inactive { background: var(--surface2); border: 1px solid var(--border); }
  .session-info { flex: 1; min-width: 0; }
  .session-subject { font-family: var(--font-heading); font-weight: 700; font-size: 1rem; margin-bottom: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .session-meta { font-size: 0.78rem; color: var(--text-dim); display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  .session-actions { display: flex; gap: 8px; flex-shrink: 0; flex-wrap: wrap; }

  /* Badges */
  .badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 9px; border-radius: 20px; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.02em; }
  .badge-active { background: rgba(0,214,143,0.1); color: var(--green); border: 1px solid rgba(0,214,143,0.2); }
  .badge-inactive { background: var(--surface2); color: var(--muted); border: 1px solid var(--border); }
  .badge-present { background: rgba(0,214,143,0.1); color: var(--green); border: 1px solid rgba(0,214,143,0.2); }
  .badge-late { background: rgba(255,186,8,0.1); color: var(--yellow); border: 1px solid rgba(255,186,8,0.2); }

  /* QR Modal */
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.75); display: flex; align-items: center; justify-content: center; z-index: 200; padding: 24px; backdrop-filter: blur(6px); animation: fadeIn 0.15s ease; }
  .modal { background: var(--surface); border: 1px solid var(--border2); border-radius: 20px; padding: 28px; max-width: 480px; width: 100%; animation: slideUp 0.2s ease; max-height: 90vh; overflow-y: auto; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
  .modal-header { margin-bottom: 20px; }
  .modal-title { font-family: var(--font-heading); font-size: 1.35rem; font-weight: 800; margin-bottom: 3px; }
  .modal-sub { color: var(--text-dim); font-size: 0.83rem; }
  .modal-top-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
  .qr-wrapper { background: #fff; border-radius: 14px; padding: 18px; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; width: fit-content; }
  .qr-wrapper img { display: block; width: 210px; height: 210px; }
  .countdown { text-align: center; margin-bottom: 18px; }
  .countdown-ring { display: inline-flex; align-items: center; gap: 10px; background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 8px 18px; }
  .countdown-num { font-family: var(--font-heading); font-size: 1.5rem; font-weight: 800; min-width: 36px; text-align: center; transition: color 0.3s; }
  .countdown-label { color: var(--muted); font-size: 0.8rem; line-height: 1.3; }
  .modal-actions { display: flex; gap: 8px; }

  /* Attendance detail view */
  .detail-header { display: flex; align-items: center; gap: 14px; margin-bottom: 24px; flex-wrap: wrap; }
  .detail-back { flex-shrink: 0; }
  .detail-info { flex: 1; min-width: 0; }
  .detail-title { font-family: var(--font-heading); font-size: 1.5rem; font-weight: 800; margin-bottom: 3px; }
  .detail-meta { font-size: 0.82rem; color: var(--text-dim); display: flex; gap: 14px; flex-wrap: wrap; }

  /* Table */
  .table-wrapper { overflow-x: auto; border-radius: var(--radius); border: 1px solid var(--border); }
  table { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
  thead { position: sticky; top: 0; z-index: 1; }
  th { background: var(--surface2); padding: 11px 16px; text-align: left; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); font-weight: 700; white-space: nowrap; }
  td { padding: 11px 16px; border-top: 1px solid var(--border); vertical-align: middle; color: var(--text-dim); }
  td.td-name { color: var(--text); font-weight: 500; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: rgba(255,255,255,0.015); }
  .avatar { width: 30px; height: 30px; border-radius: 8px; background: linear-gradient(135deg, var(--accent), var(--accent2)); display: inline-flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700; color: #fff; margin-right: 9px; vertical-align: middle; flex-shrink: 0; }

  /* Student checkin */
  .checkin-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .checkin-card { max-width: 420px; width: 100%; text-align: center; }
  .checkin-icon { font-size: 3.5rem; margin-bottom: 16px; display: block; }
  .checkin-title { font-family: var(--font-heading); font-size: 1.55rem; font-weight: 800; margin-bottom: 7px; }
  .checkin-sub { color: var(--text-dim); margin-bottom: 24px; font-size: 0.9rem; }
  .checkin-info-row { display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 0.83rem; color: var(--muted); margin-bottom: 7px; }
  .success-card { background: rgba(0,214,143,0.06); border: 1px solid rgba(0,214,143,0.18); border-radius: var(--radius); padding: 28px; }
  .error-card { background: rgba(255,101,132,0.06); border: 1px solid rgba(255,101,132,0.18); border-radius: var(--radius); padding: 28px; }
  .already-card { background: rgba(77,171,247,0.06); border: 1px solid rgba(77,171,247,0.18); border-radius: var(--radius); padding: 28px; }

  /* Student history */
  .history-filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 18px; align-items: center; }
  .filter-chip { padding: 5px 13px; border-radius: 20px; font-size: 0.78rem; font-weight: 600; cursor: pointer; transition: all 0.15s; background: var(--surface2); color: var(--muted); border: 1px solid var(--border); }
  .filter-chip.active { background: rgba(108,99,255,0.15); color: var(--accent-light); border-color: rgba(108,99,255,0.3); }
  .history-list { display: grid; gap: 10px; }
  .history-item { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 18px; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 14px; transition: all 0.18s; }
  .history-item:hover { border-color: rgba(255,255,255,0.1); }
  .history-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
  .history-dot.present { background: var(--green); box-shadow: 0 0 6px var(--green); }
  .history-dot.late { background: var(--yellow); box-shadow: 0 0 6px var(--yellow); }
  .history-body { min-width: 0; }
  .history-subject { font-weight: 600; margin-bottom: 3px; font-size: 0.92rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .history-meta { font-size: 0.76rem; color: var(--muted); display: flex; gap: 10px; flex-wrap: wrap; }
  .history-date { font-size: 0.76rem; text-align: right; }
  .history-date-main { color: var(--text-dim); font-weight: 500; white-space: nowrap; }
  .history-date-time { color: var(--muted); font-size: 0.72rem; margin-top: 2px; }
  .history-side { text-align: right; }

  /* Empty state */
  .empty { text-align: center; padding: 56px 24px; color: var(--muted); }
  .empty-icon { font-size: 2.5rem; margin-bottom: 14px; opacity: 0.35; }
  .empty-text { font-size: 0.9rem; line-height: 1.6; }

  /* Loader */
  .spinner { width: 18px; height: 18px; border: 2px solid rgba(255,255,255,0.15); border-top-color: currentColor; border-radius: 50%; animation: spin 0.65s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .loading-page { display: flex; align-items: center; justify-content: center; min-height: 180px; }
  .loading-page .spinner { width: 28px; height: 28px; border-width: 2.5px; color: var(--accent); }

  /* Divider */
  .divider { height: 1px; background: var(--border); margin: 20px 0; }

  /* Session end date */
  .session-enddate { font-size: 0.75rem; color: var(--muted); display: flex; align-items: center; gap: 4px; }
  .session-enddate.soon { color: var(--yellow); }
  .session-enddate.expired { color: var(--accent2); }

  /* Excel export area */
  .export-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .export-info { font-size: 0.8rem; color: var(--muted); }

  /* Date tag in table */
  .date-cell { display: flex; flex-direction: column; gap: 1px; }
  .date-cell-date { color: var(--text-dim); }
  .date-cell-time { font-size: 0.72rem; color: var(--muted); }

  /* Responsive */
  @media (max-width: 640px) {
    .form-row { grid-template-columns: 1fr; }
    .session-card { flex-wrap: wrap; }
    .session-actions { width: 100%; }
    .stats-grid { grid-template-columns: 1fr 1fr; }
    .page-title { font-size: 1.55rem; }
    .modal { padding: 20px 18px; }
    .history-item { grid-template-columns: auto 1fr; }
    .history-side { display: none; }
    .detail-meta { gap: 8px; }
    .container { padding: 0 18px; }
  }
`;

// ─── COMPONENTS ───────────────────────────────────────────────────────────────
function Spinner({ size = 18 }) {
  return <div className="spinner" style={{ width: size, height: size }} />;
}

function Alert({ type = "error", message }) {
  if (!message) return null;
  const icon = type === "error" ? "⚠" : "✓";
  return <div className={`alert alert-${type}`}><span>{icon}</span>{message}</div>;
}

function Nav() {
  const { user, logout } = useAuth();
  return (
    <nav className="nav">
      <div className="container nav-inner">
        <div className="nav-brand">
          <div className="nav-logo">📋</div>
          AttendQR
        </div>
        <div className="nav-actions">
          {user && (
            <>
              <div className="user-pill">
                <div className="user-avatar">{user.name?.[0]?.toUpperCase()}</div>
                <div>
                  <div className="user-name">{user.name}</div>
                  <div className="user-role">{user.role}</div>
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button>
            </>
          )}
        </div>
      </div>
    </nav>
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      if (mode === "login") await login(form.email, form.password);
      else await register({ ...form, role });
      onSuccess();
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="auth-page">
      <div className="auth-bg" />
      <div className="auth-grid" />
      <div className="auth-card card">
        <div className="auth-header">
          <div className="auth-logo">📋</div>
          <h1 className="auth-title">{mode === "login" ? "Welcome back" : "Get started"}</h1>
          <p className="auth-sub">{mode === "login" ? "Sign in to your AttendQR account" : "Create your free account today"}</p>
        </div>

        {mode === "register" && (
          <div className="role-tabs">
            {["student", "teacher"].map((r) => (
              <div key={r} className={`role-tab ${role === r ? "active" : ""}`} onClick={() => setRole(r)}>
                {r === "student" ? "👨‍🎓 Student" : "👨‍🏫 Teacher"}
              </div>
            ))}
          </div>
        )}

        <Alert message={error} />

        <form onSubmit={handleSubmit}>
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
          <button type="submit" className="btn btn-primary btn-lg" style={{ width: "100%" }} disabled={loading}>
            {loading ? <Spinner /> : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <div className="auth-switch">
          {mode === "login" ? (
            <>Don't have an account? <a onClick={() => setMode("register")}>Sign up</a></>
          ) : (
            <>Already have an account? <a onClick={() => setMode("login")}>Sign in</a></>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── CREATE SESSION MODAL ─────────────────────────────────────────────────────
function CreateSessionModal({ onClose, onCreated }) {
  const defaultEnd = getDefaultEndDate();
  const [form, setForm] = useState({ subject: "", room: "", description: "", endTime: defaultEnd });
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
              <input className="form-input" type="datetime-local" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} />
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
              <h2 className="modal-title">📋 {session.subject}</h2>
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
function SessionEndLabel({ endTime }) {
  if (!endTime) return null;
  const end = new Date(endTime);
  const now = new Date();
  const diffDays = Math.ceil((end - now) / (1000 * 60 * 60 * 24));

  let cls = "session-enddate";
  let text = "";
  if (diffDays < 0) { cls += " expired"; text = "Expired"; }
  else if (diffDays <= 14) { cls += " soon"; text = `Expires in ${diffDays}d`; }
  else { text = `Until ${formatDate(end)}`; }

  return <span className={cls}>📅 {text}</span>;
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
                  {viewSession.endTime && <span>⏹ Ended {formatDateTime(viewSession.endTime)}</span>}
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
                    <button
                      className="btn btn-excel btn-sm"
                      onClick={() => exportToExcel(filteredAttendance, viewSession)}
                    >
                      ⬇ Export Excel
                    </button>
                  </>
                )}
              </div>
            </div>

            {loadingAttendance ? (
              <div className="loading-page"><Spinner size={28} /></div>
            ) : filteredAttendance.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">📭</div>
                <div className="empty-text">{attendance.length === 0 ? "No attendance records for this session yet." : "No records match this filter."}</div>
              </div>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Student Name</th>
                      <th>Student ID</th>
                      <th>Grade</th>
                      <th>Section</th>
                      <th>Sessions Attended</th>
                      <th>Status</th>
                      <th>Date</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const countByStudent = filteredAttendance.reduce((acc, a) => {
                        const key = a.student?._id || a.student?.studentId || a.student?.name || "?";
                        acc[key] = (acc[key] || 0) + 1;
                        return acc;
                      }, {});
                      return filteredAttendance.map((a, i) => {
                        const ts = new Date(a.timestamp);
                        const key = a.student?._id || a.student?.studentId || a.student?.name || "?";
                        return (
                          <tr key={a._id}>
                            <td style={{ color: "var(--muted)", fontSize: "0.78rem" }}>{i + 1}</td>
                            <td className="td-name">
                              <span className="avatar">{a.student?.name?.[0]?.toUpperCase()}</span>
                              {a.student?.name}
                            </td>
                            <td>{a.student?.studentId || "—"}</td>
                            <td>{a.student?.grade || <span style={{ color: "var(--muted)" }}>—</span>}</td>
                            <td>{a.student?.section || <span style={{ color: "var(--muted)" }}>—</span>}</td>
                            <td style={{ textAlign: "center" }}>
                              <span style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 20, padding: "2px 10px", fontSize: "0.78rem", fontWeight: 600 }}>
                                {countByStudent[key] || 1}
                              </span>
                            </td>
                            <td><span className={`badge badge-${a.status}`}>{a.status === "present" ? "✓ Present" : "⏰ Late"}</span></td>
                            <td>{ts.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                            <td>{ts.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
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
                    <div className={`session-icon ${session.isActive ? "active" : "inactive"}`}>
                      {session.isActive ? "🟢" : "📚"}
                    </div>
                    <div className="session-info">
                      <div className="session-subject">{session.subject}</div>
                      <div className="session-meta">
                        {session.room && <span>📍 {session.room}</span>}
                        <span>👥 {session.attendanceCount || 0} attended</span>
                        <span>📅 {formatDate(session.createdAt)}</span>
                        {session.startTime && <span>▶ {formatDateTime(session.startTime)}</span>}
                        {session.isActive && <span className="badge badge-active">● Live</span>}
                        <SessionEndLabel endTime={session.endTime} />
                      </div>
                    </div>
                    <div className="session-actions">
                      {session.isActive ? (
                        <button className="btn btn-green btn-sm" onClick={() => handleStart(session._id)}>📱 Show QR</button>
                      ) : (
                        <button className="btn btn-primary btn-sm" onClick={() => handleStart(session._id)}>▶ Start</button>
                      )}
                      <button className="btn btn-ghost btn-sm" onClick={() => viewDetails(session)}>View List</button>
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

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await api.get("/attendance/my");
        setAttendance(data.attendance);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    fetchData();
  }, []);

  const present = attendance.filter((a) => a.status === "present").length;
  const late = attendance.filter((a) => a.status === "late").length;
  const rate = attendance.length > 0 ? Math.round((present / attendance.length) * 100) : 0;

  const filtered = attendance.filter((a) => {
    const matchStatus = filterStatus === "all" || a.status === filterStatus;
    const matchSearch = !searchQuery || a.session?.subject?.toLowerCase().includes(searchQuery.toLowerCase()) || a.session?.room?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchStatus && matchSearch;
  });

  // Group by month for display
  const grouped = filtered.reduce((acc, a) => {
    const month = new Date(a.timestamp).toLocaleString("en-US", { month: "long", year: "numeric" });
    if (!acc[month]) acc[month] = [];
    acc[month].push(a);
    return acc;
  }, {});

  return (
    <div className="main">
      <div className="container">
        <div className="page-header">
          <div className="page-title-block">
            <h1 className="page-title">My Attendance</h1>
            <p className="page-sub">Track your class attendance history</p>
          </div>
          {attendance.length > 0 && (
            <button className="btn btn-excel btn-sm" onClick={() => exportStudentHistoryToExcel(filtered, user?.name)}>
              ⬇ Export to Excel
            </button>
          )}
        </div>

        <div className="stats-grid">
          <div className="stat-card" style={{ "--stat-color": "var(--accent)" }}>
            <div className="stat-label">Total Sessions</div>
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
            <div className="stat-label">Attendance Rate</div>
            <div className="stat-value">{rate}%</div>
            <div className="stat-sub">on-time ratio</div>
          </div>
        </div>

        <div className="section-header">
          <div className="section-title">📅 History</div>
          <div className="export-info">{filtered.length} record{filtered.length !== 1 ? "s" : ""}</div>
        </div>

        {/* Filters & Search */}
        <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
          <div className="history-filters" style={{ margin: 0, flex: 1, minWidth: 200 }}>
            {["all", "present", "late"].map((f) => (
              <span key={f} className={`filter-chip ${filterStatus === f ? "active" : ""}`} onClick={() => setFilterStatus(f)}>
                {f === "all" ? `All (${attendance.length})` : f === "present" ? `✓ Present (${present})` : `⏰ Late (${late})`}
              </span>
            ))}
          </div>
          <input
            className="form-input"
            style={{ maxWidth: 220, padding: "7px 12px", fontSize: "0.82rem" }}
            placeholder="Search subject…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="loading-page"><Spinner size={28} /></div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">{attendance.length === 0 ? "📭" : "🔍"}</div>
            <div className="empty-text">
              {attendance.length === 0
                ? "No attendance records yet.\nScan a QR code to mark your attendance!"
                : "No records match your filters."}
            </div>
          </div>
        ) : (
          Object.entries(grouped).map(([month, records]) => (
            <div key={month} style={{ marginBottom: 24 }}>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                <span>{month}</span>
                <span style={{ background: "var(--surface2)", borderRadius: 20, padding: "1px 8px", fontWeight: 600 }}>{records.length}</span>
              </div>
              <div className="history-list">
                {records.map((a) => {
                  const ts = new Date(a.timestamp);
                  return (
                    <div key={a._id} className="history-item">
                      <div className={`history-dot ${a.status}`} />
                      <div className="history-body">
                        <div className="history-subject">{a.session?.subject || "Unknown Subject"}</div>
                        <div className="history-meta">
                          {a.session?.room && <span>📍 {a.session.room}</span>}
                          {a.session?.teacher?.name && <span>👨‍🏫 {a.session.teacher.name}</span>}
                        </div>
                      </div>
                      <div className="history-side">
                        <div style={{ textAlign: "right" }}>
                          <span className={`badge badge-${a.status}`} style={{ marginBottom: 6, display: "inline-flex" }}>
                            {a.status === "present" ? "✓ Present" : "⏰ Late"}
                          </span>
                          <div className="history-date">
                            <div className="history-date-main">{ts.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                            <div className="history-date-time">{ts.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── ROUTER ───────────────────────────────────────────────────────────────────
function App() {
  const { user } = useAuth();
  const [page, setPage] = useState("home");
  const [qrToken, setQrToken] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (token) { setQrToken(token); setPage("checkin"); }
  }, []);

  const handleAuthSuccess = () => setPage("home");

  if (!user) return <AuthPage onSuccess={handleAuthSuccess} />;

  return (
    <div className="app">
      <Nav />
      {page === "checkin" && qrToken ? (
        <CheckInPage token={qrToken} />
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
