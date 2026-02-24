import { useState, useEffect, useCallback, createContext, useContext } from "react";

// ─── API CONFIG ────────────────────────────────────────────────────────────────
const API_BASE = "https://attendance-system-api.onrender.com/api";

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
    } finally {
      setLoading(false);
    }
  };

  const register = async (payload) => {
    setLoading(true);
    try {
      const data = await api.post("/auth/register", payload);
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      setUser(data.user);
      return data;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, login, register, logout, loading }}>{children}</AuthContext.Provider>;
}

// ─── STYLES ────────────────────────────────────────────────────────────────────
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0a0a12;
    --surface: #12121e;
    --surface2: #1a1a2e;
    --border: rgba(255,255,255,0.07);
    --accent: #6c63ff;
    --accent2: #ff6584;
    --green: #00d68f;
    --yellow: #ffba08;
    --text: #e8e8f0;
    --muted: #7c7c9a;
    --radius: 16px;
    --font-heading: 'Syne', sans-serif;
    --font-body: 'DM Sans', sans-serif;
  }

  body { background: var(--bg); color: var(--text); font-family: var(--font-body); min-height: 100vh; }

  /* Layout */
  .app { min-height: 100vh; display: flex; flex-direction: column; }
  .container { max-width: 1100px; margin: 0 auto; padding: 0 24px; width: 100%; }

  /* Nav */
  .nav { padding: 18px 0; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: rgba(10,10,18,0.9); backdrop-filter: blur(20px); z-index: 100; }
  .nav-inner { display: flex; align-items: center; justify-content: space-between; }
  .nav-brand { font-family: var(--font-heading); font-size: 1.3rem; font-weight: 800; color: var(--text); display: flex; align-items: center; gap: 10px; }
  .nav-brand span { background: var(--accent); width: 28px; height: 28px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.85rem; }
  .nav-actions { display: flex; align-items: center; gap: 12px; }
  .user-badge { background: var(--surface2); border: 1px solid var(--border); padding: 6px 14px; border-radius: 20px; font-size: 0.82rem; color: var(--muted); }
  .user-badge b { color: var(--text); }

  /* Buttons */
  .btn { display: inline-flex; align-items: center; gap: 7px; padding: 10px 20px; border-radius: 10px; font-family: var(--font-body); font-size: 0.9rem; font-weight: 500; cursor: pointer; border: none; transition: all 0.2s ease; text-decoration: none; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary { background: var(--accent); color: #fff; }
  .btn-primary:hover:not(:disabled) { background: #7c75ff; transform: translateY(-1px); box-shadow: 0 8px 24px rgba(108,99,255,0.35); }
  .btn-danger { background: rgba(255,101,132,0.15); color: var(--accent2); border: 1px solid rgba(255,101,132,0.3); }
  .btn-danger:hover:not(:disabled) { background: rgba(255,101,132,0.25); }
  .btn-ghost { background: var(--surface2); color: var(--muted); border: 1px solid var(--border); }
  .btn-ghost:hover:not(:disabled) { color: var(--text); border-color: rgba(255,255,255,0.15); }
  .btn-green { background: rgba(0,214,143,0.15); color: var(--green); border: 1px solid rgba(0,214,143,0.3); }
  .btn-green:hover:not(:disabled) { background: rgba(0,214,143,0.25); }
  .btn-sm { padding: 7px 14px; font-size: 0.82rem; border-radius: 8px; }
  .btn-lg { padding: 14px 28px; font-size: 1rem; border-radius: 12px; }

  /* Cards */
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; }
  .card-hover { transition: all 0.25s ease; }
  .card-hover:hover { border-color: rgba(108,99,255,0.3); transform: translateY(-2px); box-shadow: 0 12px 40px rgba(0,0,0,0.4); }

  /* Forms */
  .form-group { margin-bottom: 18px; }
  .form-label { display: block; font-size: 0.82rem; font-weight: 500; color: var(--muted); margin-bottom: 7px; text-transform: uppercase; letter-spacing: 0.05em; }
  .form-input { width: 100%; background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 11px 14px; color: var(--text); font-family: var(--font-body); font-size: 0.92rem; transition: border-color 0.2s; outline: none; }
  .form-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(108,99,255,0.12); }
  .form-input::placeholder { color: var(--muted); }
  .form-select { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%237c7c9a' d='M6 8L1 3h10z'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; padding-right: 36px; cursor: pointer; }
  .form-error { color: var(--accent2); font-size: 0.82rem; margin-top: 4px; }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

  /* Auth page */
  .auth-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; position: relative; overflow: hidden; }
  .auth-bg { position: absolute; inset: 0; background: radial-gradient(ellipse 80% 60% at 50% -20%, rgba(108,99,255,0.18) 0%, transparent 70%); pointer-events: none; }
  .auth-card { width: 100%; max-width: 440px; position: relative; z-index: 1; }
  .auth-header { text-align: center; margin-bottom: 36px; }
  .auth-logo { width: 56px; height: 56px; background: linear-gradient(135deg, var(--accent), #9b8eff); border-radius: 16px; display: inline-flex; align-items: center; justify-content: center; font-size: 1.6rem; margin-bottom: 20px; box-shadow: 0 12px 32px rgba(108,99,255,0.35); }
  .auth-title { font-family: var(--font-heading); font-size: 1.8rem; font-weight: 800; margin-bottom: 8px; }
  .auth-sub { color: var(--muted); font-size: 0.9rem; }
  .auth-divider { text-align: center; margin: 22px 0; position: relative; }
  .auth-divider::before { content: ''; position: absolute; top: 50%; left: 0; right: 0; height: 1px; background: var(--border); }
  .auth-divider span { position: relative; background: var(--surface); padding: 0 12px; color: var(--muted); font-size: 0.82rem; }
  .auth-switch { text-align: center; margin-top: 20px; font-size: 0.88rem; color: var(--muted); }
  .auth-switch a { color: var(--accent); cursor: pointer; font-weight: 500; }
  .auth-switch a:hover { text-decoration: underline; }
  .role-tabs { display: flex; background: var(--surface2); border-radius: 10px; padding: 4px; margin-bottom: 24px; }
  .role-tab { flex: 1; padding: 9px; text-align: center; border-radius: 8px; cursor: pointer; font-size: 0.88rem; font-weight: 500; transition: all 0.2s; color: var(--muted); }
  .role-tab.active { background: var(--surface); color: var(--text); box-shadow: 0 2px 8px rgba(0,0,0,0.3); }

  /* Dashboard */
  .main { flex: 1; padding: 36px 0; }
  .page-header { margin-bottom: 32px; }
  .page-title { font-family: var(--font-heading); font-size: 2rem; font-weight: 800; margin-bottom: 6px; }
  .page-sub { color: var(--muted); font-size: 0.92rem; }

  /* Stats */
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 32px; }
  .stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
  .stat-label { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin-bottom: 10px; }
  .stat-value { font-family: var(--font-heading); font-size: 2.2rem; font-weight: 800; line-height: 1; }
  .stat-accent { color: var(--accent); }
  .stat-green { color: var(--green); }
  .stat-yellow { color: var(--yellow); }

  /* Sessions list */
  .sessions-grid { display: grid; gap: 16px; }
  .session-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; display: flex; align-items: center; gap: 16px; transition: all 0.22s; }
  .session-card:hover { border-color: rgba(108,99,255,0.25); transform: translateY(-1px); }
  .session-icon { width: 46px; height: 46px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; flex-shrink: 0; }
  .session-icon.active { background: rgba(0,214,143,0.12); }
  .session-icon.inactive { background: var(--surface2); }
  .session-info { flex: 1; }
  .session-subject { font-family: var(--font-heading); font-weight: 700; font-size: 1.05rem; margin-bottom: 4px; }
  .session-meta { font-size: 0.8rem; color: var(--muted); display: flex; gap: 12px; flex-wrap: wrap; }
  .session-actions { display: flex; gap: 8px; flex-shrink: 0; flex-wrap: wrap; }
  .badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 500; }
  .badge-active { background: rgba(0,214,143,0.12); color: var(--green); }
  .badge-inactive { background: var(--surface2); color: var(--muted); }
  .badge-late { background: rgba(255,186,8,0.12); color: var(--yellow); }
  .badge-present { background: rgba(0,214,143,0.12); color: var(--green); }

  /* QR Modal */
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 200; padding: 24px; backdrop-filter: blur(4px); animation: fadeIn 0.2s ease; }
  .modal { background: var(--surface); border: 1px solid var(--border); border-radius: 20px; padding: 32px; max-width: 460px; width: 100%; animation: slideUp 0.25s ease; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
  .modal-header { margin-bottom: 24px; }
  .modal-title { font-family: var(--font-heading); font-size: 1.4rem; font-weight: 800; margin-bottom: 4px; }
  .modal-sub { color: var(--muted); font-size: 0.85rem; }
  .qr-wrapper { background: #fff; border-radius: 16px; padding: 20px; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; width: fit-content; }
  .qr-wrapper img { display: block; width: 220px; height: 220px; }
  .countdown { text-align: center; margin-bottom: 20px; }
  .countdown-ring { display: inline-flex; align-items: center; gap: 10px; background: var(--surface2); border: 1px solid var(--border); border-radius: 12px; padding: 10px 20px; }
  .countdown-num { font-family: var(--font-heading); font-size: 1.6rem; font-weight: 800; color: var(--accent); min-width: 40px; text-align: center; }
  .countdown-label { color: var(--muted); font-size: 0.82rem; }
  .modal-actions { display: flex; gap: 10px; }

  /* Attendance table */
  .table-wrapper { overflow-x: auto; border-radius: var(--radius); border: 1px solid var(--border); }
  table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
  th { background: var(--surface2); padding: 12px 16px; text-align: left; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 600; }
  td { padding: 12px 16px; border-top: 1px solid var(--border); vertical-align: middle; }
  tr:hover td { background: rgba(255,255,255,0.02); }
  .avatar { width: 32px; height: 32px; border-radius: 8px; background: linear-gradient(135deg, var(--accent), var(--accent2)); display: inline-flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 700; color: #fff; margin-right: 10px; vertical-align: middle; }

  /* Student checkin page */
  .checkin-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .checkin-card { max-width: 400px; width: 100%; text-align: center; }
  .checkin-icon { font-size: 4rem; margin-bottom: 20px; display: block; }
  .checkin-title { font-family: var(--font-heading); font-size: 1.6rem; font-weight: 800; margin-bottom: 8px; }
  .checkin-sub { color: var(--muted); margin-bottom: 28px; }
  .success-card { background: rgba(0,214,143,0.08); border: 1px solid rgba(0,214,143,0.2); border-radius: 16px; padding: 28px; }
  .error-card { background: rgba(255,101,132,0.08); border: 1px solid rgba(255,101,132,0.2); border-radius: 16px; padding: 28px; }

  /* Alert */
  .alert { padding: 12px 16px; border-radius: 10px; font-size: 0.88rem; margin-bottom: 18px; }
  .alert-error { background: rgba(255,101,132,0.1); border: 1px solid rgba(255,101,132,0.25); color: #ff8fa3; }
  .alert-success { background: rgba(0,214,143,0.1); border: 1px solid rgba(0,214,143,0.25); color: var(--green); }

  /* Student history */
  .history-list { display: grid; gap: 12px; }
  .history-item { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px; display: flex; align-items: center; gap: 14px; }
  .history-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .history-dot.present { background: var(--green); box-shadow: 0 0 8px var(--green); }
  .history-dot.late { background: var(--yellow); box-shadow: 0 0 8px var(--yellow); }
  .history-body { flex: 1; }
  .history-subject { font-weight: 600; margin-bottom: 2px; }
  .history-meta { font-size: 0.78rem; color: var(--muted); }

  /* Empty */
  .empty { text-align: center; padding: 60px 24px; color: var(--muted); }
  .empty-icon { font-size: 3rem; margin-bottom: 16px; opacity: 0.4; }
  .empty-text { font-size: 0.92rem; }

  /* Loader */
  .spinner { width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.2); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .loading-page { display: flex; align-items: center; justify-content: center; min-height: 200px; }

  /* Create session modal form */
  .section-title { font-family: var(--font-heading); font-size: 1.1rem; font-weight: 700; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }

  /* Responsive */
  @media (max-width: 600px) {
    .form-row { grid-template-columns: 1fr; }
    .session-card { flex-direction: column; align-items: flex-start; }
    .session-actions { width: 100%; }
    .stats-grid { grid-template-columns: 1fr 1fr; }
    .page-title { font-size: 1.5rem; }
    .modal { padding: 24px 20px; }
  }
`;

// ─── COMPONENTS ───────────────────────────────────────────────────────────────
function Spinner() { return <div className="spinner" />; }

function Alert({ type = "error", message }) {
  if (!message) return null;
  return <div className={`alert alert-${type}`}>{message}</div>;
}

function Nav() {
  const { user, logout } = useAuth();
  return (
    <nav className="nav">
      <div className="container nav-inner">
        <div className="nav-brand">
          <span>📋</span> AttendQR
        </div>
        <div className="nav-actions">
          {user && (
            <>
              <div className="user-badge">
                <b>{user.name}</b> · {user.role}
              </div>
              <button className="btn btn-ghost btn-sm" onClick={logout}>Logout</button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

// ─── AUTH PAGES ───────────────────────────────────────────────────────────────
function AuthPage({ onSuccess }) {
  const [mode, setMode] = useState("login");
  const [role, setRole] = useState("student");
  const [form, setForm] = useState({ name: "", email: "", password: "", studentId: "" });
  const [error, setError] = useState("");
  const { login, register, loading } = useAuth();

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      if (mode === "login") {
        await login(form.email, form.password);
      } else {
        await register({ ...form, role });
      }
      onSuccess();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-bg" />
      <div className="auth-card card">
        <div className="auth-header">
          <div className="auth-logo">📋</div>
          <h1 className="auth-title">{mode === "login" ? "Welcome back" : "Get started"}</h1>
          <p className="auth-sub">{mode === "login" ? "Sign in to your account" : "Create your free account"}</p>
        </div>

        {mode === "register" && (
          <div className="role-tabs">
            {["student", "teacher"].map((r) => (
              <div key={r} className={`role-tab ${role === r ? "active" : ""}`} onClick={() => setRole(r)}>
                {r === "student" ? "👨‍🎓" : "👨‍🏫"} {r.charAt(0).toUpperCase() + r.slice(1)}
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
            <div className="form-group">
              <label className="form-label">Student ID</label>
              <input className="form-input" name="studentId" value={form.studentId} onChange={handleChange} placeholder="e.g. 2021-12345" required />
            </div>
          )}
          <button type="submit" className="btn btn-primary btn-lg" style={{ width: "100%", justifyContent: "center" }} disabled={loading}>
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
  const [form, setForm] = useState({ subject: "", room: "", description: "" });
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
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title">Create New Session</h2>
          <p className="modal-sub">Set up a class attendance session</p>
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
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <input className="form-input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional notes" />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} disabled={loading}>
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

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h2 className="modal-title">📋 {session.subject}</h2>
              <p className="modal-sub">{session.room || "No room specified"} · Show this QR to students</p>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
          </div>
        </div>

        {session.qrDataUrl ? (
          <div className="qr-wrapper">
            <img src={session.qrDataUrl} alt="QR Code" />
          </div>
        ) : (
          <div className="loading-page"><Spinner /></div>
        )}

        <div className="countdown">
          <div className="countdown-ring">
            <div className="countdown-num" style={{ color: isUrgent ? "var(--accent2)" : "var(--accent)" }}>{countdown}</div>
            <div className="countdown-label">seconds until<br />QR refreshes</div>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? <Spinner /> : "🔄 Refresh Now"}
          </button>
          <button className="btn btn-danger" onClick={handleStop} disabled={stopping} style={{ flex: 1, justifyContent: "center" }}>
            {stopping ? <Spinner /> : "⏹ Stop Session"}
          </button>
        </div>
      </div>
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

  const fetchSessions = useCallback(async () => {
    try {
      const data = await api.get("/sessions");
      setSessions(data.sessions);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const handleStart = async (sessionId) => {
    try {
      const data = await api.post(`/sessions/${sessionId}/start`, {});
      setSessions((prev) => prev.map((s) => (s._id === sessionId ? { ...s, isActive: true } : s)));
      setActiveQR(data.session);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRefreshQR = async () => {
    if (!activeQR) return;
    const data = await api.post(`/sessions/${activeQR._id}/refresh-qr`, {});
    setActiveQR(data.session);
  };

  const handleStop = async () => {
    if (!activeQR) return;
    await api.post(`/sessions/${activeQR._id}/stop`, {});
    setSessions((prev) => prev.map((s) => (s._id === activeQR._id ? { ...s, isActive: false } : s)));
    setActiveQR(null);
    fetchSessions();
  };

  const viewDetails = async (session) => {
    setViewSession(session);
    setLoadingAttendance(true);
    try {
      const data = await api.get(`/sessions/${session._id}`);
      setAttendance(data.attendance);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAttendance(false);
    }
  };

  const activeSessions = sessions.filter((s) => s.isActive);
  const totalAttendance = sessions.reduce((acc, s) => acc + (s.attendanceCount || 0), 0);

  return (
    <div className="main">
      <div className="container">
        <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h1 className="page-title">Teacher Dashboard</h1>
            <p className="page-sub">Manage your class attendance sessions</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Session</button>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Total Sessions</div>
            <div className="stat-value stat-accent">{sessions.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Active Now</div>
            <div className="stat-value stat-green">{activeSessions.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Check-ins</div>
            <div className="stat-value stat-yellow">{totalAttendance}</div>
          </div>
        </div>

        {viewSession ? (
          <div>
            <button className="btn btn-ghost btn-sm" style={{ marginBottom: 20 }} onClick={() => setViewSession(null)}>← Back to Sessions</button>
            <div className="section-title">📋 {viewSession.subject} — Attendance List</div>
            {loadingAttendance ? (
              <div className="loading-page"><Spinner /></div>
            ) : attendance.length === 0 ? (
              <div className="empty"><div className="empty-icon">📭</div><div className="empty-text">No attendance records yet</div></div>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Student ID</th>
                      <th>Status</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendance.map((a) => (
                      <tr key={a._id}>
                        <td>
                          <span className="avatar">{a.student.name[0]}</span>
                          {a.student.name}
                        </td>
                        <td style={{ color: "var(--muted)" }}>{a.student.studentId}</td>
                        <td><span className={`badge badge-${a.status}`}>{a.status === "present" ? "✓ Present" : "⏰ Late"}</span></td>
                        <td style={{ color: "var(--muted)", fontSize: "0.82rem" }}>{new Date(a.timestamp).toLocaleTimeString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : loading ? (
          <div className="loading-page"><Spinner /></div>
        ) : sessions.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">📋</div>
            <div className="empty-text">No sessions yet. Create your first session to get started.</div>
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
                    <span>{new Date(session.createdAt).toLocaleDateString()}</span>
                    {session.isActive && <span className="badge badge-active">● Live</span>}
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

// ─── STUDENT CHECK-IN PAGE ────────────────────────────────────────────────────
function CheckInPage({ token }) {
  const [sessionInfo, setSessionInfo] = useState(null);
  const [status, setStatus] = useState("verifying"); // verifying | ready | loading | success | error | already
  const [message, setMessage] = useState("");
  const { user } = useAuth();

  useEffect(() => {
    const verify = async () => {
      try {
        const data = await api.get(`/attendance/verify/${token}`);
        setSessionInfo(data.session);
        setStatus(data.alreadyAttended ? "already" : "ready");
      } catch (err) {
        setStatus("error");
        setMessage(err.message);
      }
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
    } catch (err) {
      setMessage(err.message);
      setStatus("error");
    }
  };

  return (
    <div className="checkin-page">
      <div className="checkin-card">
        {status === "verifying" && (
          <>
            <div className="loading-page"><Spinner /></div>
            <p style={{ textAlign: "center", color: "var(--muted)", marginTop: 12 }}>Verifying QR code...</p>
          </>
        )}
        {status === "ready" && sessionInfo && (
          <div className="card">
            <span className="checkin-icon">📋</span>
            <h2 className="checkin-title">{sessionInfo.subject}</h2>
            <p className="checkin-sub">
              {sessionInfo.room && `📍 ${sessionInfo.room} · `}
              {sessionInfo.teacher && `👨‍🏫 ${sessionInfo.teacher}`}
            </p>
            <p style={{ color: "var(--muted)", marginBottom: 24, fontSize: "0.9rem" }}>
              Hi <b style={{ color: "var(--text)" }}>{user?.name}</b>! Tap below to mark your attendance.
            </p>
            <button className="btn btn-green btn-lg" style={{ width: "100%", justifyContent: "center" }} onClick={handleCheckIn}>
              ✓ Mark Attendance
            </button>
          </div>
        )}
        {status === "loading" && (
          <div className="loading-page"><Spinner /></div>
        )}
        {status === "success" && (
          <div className="success-card">
            <span className="checkin-icon">✅</span>
            <h2 className="checkin-title" style={{ color: "var(--green)" }}>Attendance Marked!</h2>
            <p style={{ color: "var(--muted)" }}>{message}</p>
          </div>
        )}
        {status === "already" && (
          <div className="success-card">
            <span className="checkin-icon">🔄</span>
            <h2 className="checkin-title">Already Marked</h2>
            <p style={{ color: "var(--muted)" }}>You've already marked attendance for this session.</p>
          </div>
        )}
        {status === "error" && (
          <div className="error-card">
            <span className="checkin-icon">❌</span>
            <h2 className="checkin-title" style={{ color: "var(--accent2)" }}>Check-in Failed</h2>
            <p style={{ color: "var(--muted)" }}>{message}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── STUDENT DASHBOARD ────────────────────────────────────────────────────────
function StudentDashboard() {
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await api.get("/attendance/my");
        setAttendance(data.attendance);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const present = attendance.filter((a) => a.status === "present").length;
  const late = attendance.filter((a) => a.status === "late").length;

  return (
    <div className="main">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">My Attendance</h1>
          <p className="page-sub">Track your class attendance history</p>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Total Sessions</div>
            <div className="stat-value stat-accent">{attendance.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">On Time</div>
            <div className="stat-value stat-green">{present}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Late</div>
            <div className="stat-value stat-yellow">{late}</div>
          </div>
        </div>

        <div className="section-title">📅 Attendance History</div>

        {loading ? (
          <div className="loading-page"><Spinner /></div>
        ) : attendance.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">📭</div>
            <div className="empty-text">No attendance records yet. Scan a QR code to mark your attendance!</div>
          </div>
        ) : (
          <div className="history-list">
            {attendance.map((a) => (
              <div key={a._id} className="history-item">
                <div className={`history-dot ${a.status}`} />
                <div className="history-body">
                  <div className="history-subject">{a.session?.subject || "Unknown Subject"}</div>
                  <div className="history-meta">
                    {a.session?.room && `📍 ${a.session.room} · `}
                    {new Date(a.timestamp).toLocaleString()}
                  </div>
                </div>
                <span className={`badge badge-${a.status}`}>
                  {a.status === "present" ? "✓ Present" : "⏰ Late"}
                </span>
              </div>
            ))}
          </div>
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

  // Parse URL for checkin token
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
