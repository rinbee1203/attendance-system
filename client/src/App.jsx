import { useState, useEffect, useCallback, createContext, useContext, useRef } from "react";

// ─── PWA SERVICE WORKER ──────────────────────────────────────────────────────
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js")
      .then(reg => {
        // Listen for sync messages from SW
        navigator.serviceWorker.addEventListener("message", (e) => {
          if (e.data?.type === "SYNC_OFFLINE_CHECKINS") syncOfflineQueue();
        });
      }).catch(() => {});
  });
}

// Offline check-in queue management
const OFFLINE_QUEUE_KEY = "attendqr-offline-queue";

const getOfflineQueue = () => {
  try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]"); }
  catch { return []; }
};

const addToOfflineQueue = (token, userId) => {
  const queue = getOfflineQueue();
  if (!queue.find(q => q.token === token)) {
    queue.push({ token, userId, queuedAt: new Date().toISOString() });
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  }
};

const syncOfflineQueue = async () => {
  const queue = getOfflineQueue();
  if (!queue.length) return;
  const remaining = [];
  for (const item of queue) {
    try {
      await api.post("/attendance/checkin", { token: item.token });
    } catch(e) {
      if (e.message?.includes("already marked") || e.message?.includes("expired")) {
        // Drop — already processed or too old
      } else {
        remaining.push(item); // Keep for retry
      }
    }
  }
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
  if (queue.length - remaining.length > 0) {
    console.log(`Synced ${queue.length - remaining.length} offline check-ins`);
  }
};

// ─── API CONFIG ────────────────────────────────────────────────────────────────
const API_BASE = "https://attendance-system-api-wc0k.onrender.com/api";

const api = {
  // Supports both:
  //   api.request("/url", { method, body })          — original style
  //   api.request("METHOD", "/url", bodyObj)         — shorthand style
  async request(endpointOrMethod, optionsOrUrl = {}, bodyObj) {
    let endpoint, options;
    if (typeof optionsOrUrl === "string") {
      // shorthand: api.request("PATCH", "/url", { body })
      endpoint = optionsOrUrl;
      options  = {
        method: endpointOrMethod,
        ...(bodyObj !== undefined ? { body: JSON.stringify(bodyObj) } : {}),
      };
    } else {
      endpoint = endpointOrMethod;
      options  = optionsOrUrl;
    }
    const token = localStorage.getItem("token");
    const { headers: optHeaders, ...restOptions } = options;
    const config = {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "x-device-fingerprint": DEVICE_FP,
        ...(optHeaders || {}),
      },
      ...restOptions,
    };
    let res;
    try {
      res = await fetch(`${API_BASE}${endpoint}`, config);
    } catch (networkErr) {
      throw new Error("Cannot reach the server. Check your connection.");
    }
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

// ─── ESC KEY HOOK ────────────────────────────────────────────────────────────
function useEscKey(onClose) {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
}

// ─── AVATAR COLOR HELPER ─────────────────────────────────────────────────────
const AVATAR_COLORS = [
  { bg: "#3B5BDB", text: "#fff" }, // indigo
  { bg: "#0F7B55", text: "#fff" }, // green
  { bg: "#C2410C", text: "#fff" }, // orange
  { bg: "#7C3AED", text: "#fff" }, // violet
  { bg: "#0369A1", text: "#fff" }, // sky
  { bg: "#BE185D", text: "#fff" }, // pink
  { bg: "#B45309", text: "#fff" }, // amber
  { bg: "#0F766E", text: "#fff" }, // teal
  { bg: "#6D28D9", text: "#fff" }, // purple
  { bg: "#1D4ED8", text: "#fff" }, // blue
  { bg: "#15803D", text: "#fff" }, // emerald
  { bg: "#9F1239", text: "#fff" }, // rose
];

function getAvatarColor(name = "") {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// Avatar component — shows profile picture or colored initial
function AvatarCircle({ name = "", picture = null, size = 32, radius = "50%", fontSize = "0.72rem" }) {
  const { bg, text } = getAvatarColor(name);
  const initial = name?.[0]?.toUpperCase() || "?";
  return (
    <div style={{
      width: size, height: size, borderRadius: radius,
      background: picture ? "transparent" : bg,
      color: text, flexShrink: 0, overflow: "hidden",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize, fontWeight: 800, lineHeight: 1,
    }}>
      {picture
        ? <img src={picture} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        : <span>{initial}</span>
      }
    </div>
  );
}

// ─── THEME CONTEXT ────────────────────────────────────────────────────────────
const ThemeContext = createContext({ dark: false, toggle: () => {} });
const useTheme = () => useContext(ThemeContext);

function ThemeProvider({ children }) {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("theme");
    if (saved) return saved === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  const toggle = () => {
    setDark(d => {
      const next = !d;
      localStorage.setItem("theme", next ? "dark" : "light");
      return next;
    });
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <ThemeContext.Provider value={{ dark, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

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
      // If 2FA is required, don't store anything yet — caller handles it
      if (data.requires2FA) return data;
      if (data.token) {
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));
        setUser(data.user);
      }
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
const safe = (s) => (s || "file").replace(/[^a-z0-9]/gi, "_").toLowerCase();
const todayStr = () => new Date().toISOString().split("T")[0];
const PH_OPTS = { timeZone: "Asia/Manila" };

// ── SheetJS XLSX builder ─────────────────────────────────────────────────────
// Dynamically loads SheetJS from CDN, then builds a styled .xlsx attendance sheet
async function loadXLSX() {
  if (window.XLSX) return window.XLSX;
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = () => res(window.XLSX);
    s.onerror = () => rej(new Error("Failed to load XLSX library"));
    document.head.appendChild(s);
  });
}

function xlsxDate(ts) {
  return new Date(ts).toLocaleDateString("en-PH", { year:"numeric", month:"long", day:"numeric", ...PH_OPTS });
}
function xlsxTime(ts) {
  return new Date(ts).toLocaleTimeString("en-PH", { hour:"2-digit", minute:"2-digit", second:"2-digit", ...PH_OPTS });
}

// Core builder — creates a fully styled attendance sheet
async function buildAttendanceXLSX({ title, subtitle, infoRows, headers, rows, filename, summaryRows }) {
  const XLSX = await loadXLSX();

  // ── Assemble all cells as an aoa (array of arrays) ──
  const aoa = [];

  // Row 1: Main title
  aoa.push([title]);
  aoa.push([subtitle || ""]);
  aoa.push([]); // spacer

  // Info block
  infoRows.forEach(r => aoa.push(r));
  aoa.push([]); // spacer

  const headerRowIdx = aoa.length; // 0-based
  aoa.push(headers);

  // Data rows
  rows.forEach(r => aoa.push(r));

  aoa.push([]); // spacer after data

  // Summary block
  if (summaryRows?.length) {
    summaryRows.forEach(r => aoa.push(r));
  }

  // ── Build worksheet ──
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const totalRows = aoa.length;
  const totalCols = headers.length;

  // ── Column widths ──
  const colWidths = headers.map((h, ci) => {
    const maxData = rows.reduce((max, r) => Math.max(max, String(r[ci] ?? "").length), 0);
    return { wch: Math.max(String(h).length, maxData, 8) + 4 };
  });
  ws["!cols"] = colWidths;

  // ── Cell styles via cell objects ──
  const range = XLSX.utils.decode_range(ws["!ref"]);

  // Style helper
  const style = (cell, s) => {
    if (!ws[cell]) ws[cell] = { v: "", t: "s" };
    ws[cell].s = s;
  };

  // Title row — large, bold, dark bg
  const titleCell = XLSX.utils.encode_cell({ r: 0, c: 0 });
  if (ws[titleCell]) {
    ws[titleCell].s = {
      font: { bold: true, sz: 16, color: { rgb: "FFFFFF" }, name: "Arial" },
      fill: { fgColor: { rgb: "1A1A17" }, patternType: "solid" },
      alignment: { horizontal: "left", vertical: "center" },
    };
  }
  // Merge title across all columns
  ws["!merges"] = ws["!merges"] || [];
  ws["!merges"].push({ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } });

  // Subtitle row
  const subCell = XLSX.utils.encode_cell({ r: 1, c: 0 });
  if (ws[subCell]) {
    ws[subCell].s = {
      font: { sz: 11, color: { rgb: "6B6B63" }, name: "Arial" },
      fill: { fgColor: { rgb: "1A1A17" }, patternType: "solid" },
      alignment: { horizontal: "left", vertical: "center" },
    };
  }
  ws["!merges"].push({ s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } });

  // Info rows — subtle styling
  for (let ri = 3; ri < headerRowIdx - 1; ri++) {
    for (let ci = 0; ci < totalCols; ci++) {
      const cell = XLSX.utils.encode_cell({ r: ri, c: ci });
      if (ws[cell]) {
        ws[cell].s = {
          font: { sz: 10, color: { rgb: "3D3D38" }, name: "Arial" },
          fill: { fgColor: { rgb: "F4F4F1" }, patternType: "solid" },
          alignment: { horizontal: ci === 0 ? "left" : "left" },
        };
      }
    }
    ws["!merges"].push({ s: { r: ri, c: 0 }, e: { r: ri, c: totalCols - 1 } });
  }

  // Header row — accent blue background
  for (let ci = 0; ci < totalCols; ci++) {
    const cell = XLSX.utils.encode_cell({ r: headerRowIdx, c: ci });
    if (ws[cell]) {
      ws[cell].s = {
        font: { bold: true, sz: 10, color: { rgb: "FFFFFF" }, name: "Arial" },
        fill: { fgColor: { rgb: "1F6FEB" }, patternType: "solid" },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
          bottom: { style: "medium", color: { rgb: "1558C0" } },
        },
      };
    }
  }

  // Data rows — alternating stripes, status color-coding
  for (let ri = headerRowIdx + 1; ri < headerRowIdx + 1 + rows.length; ri++) {
    const isEven = (ri - headerRowIdx) % 2 === 0;
    const rowBg = isEven ? "F7F7F5" : "FFFFFF";
    for (let ci = 0; ci < totalCols; ci++) {
      const cell = XLSX.utils.encode_cell({ r: ri, c: ci });
      if (!ws[cell]) ws[cell] = { v: "", t: "s" };
      const val = String(ws[cell].v ?? "");

      // Status column color coding
      let fontColor = "1A1A17";
      let cellBg = rowBg;
      if (val === "Present") { fontColor = "0F7B55"; cellBg = isEven ? "E6F5F0" : "F0FAF6"; }
      if (val === "Late")    { fontColor = "B45309"; cellBg = isEven ? "FEF3C7" : "FFFBEB"; }
      if (val === "Absent")  { fontColor = "C0392B"; cellBg = isEven ? "FDECEA" : "FEF2F2"; }

      ws[cell].s = {
        font: { sz: 10, name: "Arial", color: { rgb: fontColor }, bold: (val === "Present" || val === "Late" || val === "Absent") },
        fill: { fgColor: { rgb: cellBg }, patternType: "solid" },
        alignment: { horizontal: ci === 1 ? "left" : "center", vertical: "center" },
        border: {
          bottom: { style: "thin", color: { rgb: "E3E3DC" } },
          right:  { style: "thin", color: { rgb: "E3E3DC" } },
        },
      };
    }
  }

  // Summary rows — bold, indented
  const summaryStart = headerRowIdx + 1 + rows.length + 1;
  for (let ri = summaryStart; ri < totalRows; ri++) {
    const cell = XLSX.utils.encode_cell({ r: ri, c: 0 });
    if (ws[cell]) {
      ws[cell].s = {
        font: { bold: true, sz: 10, color: { rgb: "1A1A17" }, name: "Arial" },
        fill: { fgColor: { rgb: "F4F4F1" }, patternType: "solid" },
      };
    }
    const valCell = XLSX.utils.encode_cell({ r: ri, c: 1 });
    if (ws[valCell]) {
      ws[valCell].s = {
        font: { sz: 10, color: { rgb: "1F6FEB" }, name: "Arial" },
        fill: { fgColor: { rgb: "F4F4F1" }, patternType: "solid" },
        alignment: { horizontal: "center" },
      };
    }
  }

  // Row heights
  ws["!rows"] = [];
  ws["!rows"][0] = { hpt: 32 }; // title
  ws["!rows"][1] = { hpt: 20 }; // subtitle
  ws["!rows"][headerRowIdx] = { hpt: 22 }; // header
  for (let ri = headerRowIdx + 1; ri < headerRowIdx + 1 + rows.length; ri++) {
    ws["!rows"][ri] = { hpt: 18 };
  }

  // ── Build workbook & download ──
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Attendance");
  XLSX.writeFile(wb, filename);
}

// ── Teacher: export by specific day ──────────────────────────────────────────
async function exportTeacherByDay(records, dayLabel, session) {
  const present = records.filter(a => a.status === "present").length;
  const late    = records.filter(a => a.status === "late").length;
  await buildAttendanceXLSX({
    title:    `Attendance Sheet — ${session?.subject || "N/A"}`,
    subtitle: `Daily Report · ${dayLabel}`,
    infoRows: [
      [`Room: ${session?.room || "N/A"}   |   Date: ${dayLabel}   |   Exported: ${new Date().toLocaleDateString("en-PH", { year:"numeric", month:"long", day:"numeric" })}`],
    ],
    headers: ["#", "Student Name", "Student ID", "Grade", "Section", "Status", "Check-in Time"],
    rows: records.map((a, i) => {
      const ts = new Date(a.timestamp);
      return [i+1, a.student?.name||"N/A", a.student?.studentId||"N/A",
        a.student?.grade||"N/A", a.student?.section||"N/A",
        a.status === "present" ? "Present" : "Late",
        xlsxTime(ts)];
    }),
    summaryRows: [
      ["Total Students", records.length],
      ["Present", present],
      ["Late", late],
    ],
    filename: `${safe(session?.subject)}_${safe(dayLabel)}_daily.xlsx`,
  });
}

// ── Teacher: export by month ──────────────────────────────────────────────────
async function exportTeacherByMonth(records, monthLabel, session) {
  const present = records.filter(a => a.status === "present").length;
  const late    = records.filter(a => a.status === "late").length;
  await buildAttendanceXLSX({
    title:    `Attendance Sheet — ${session?.subject || "N/A"}`,
    subtitle: `Monthly Report · ${monthLabel}`,
    infoRows: [
      [`Room: ${session?.room || "N/A"}   |   Period: ${monthLabel}   |   Exported: ${new Date().toLocaleDateString("en-PH", { year:"numeric", month:"long", day:"numeric" })}`],
    ],
    headers: ["#", "Student Name", "Student ID", "Grade", "Section", "Status", "Date", "Check-in Time"],
    rows: records.map((a, i) => {
      const ts = new Date(a.timestamp);
      return [i+1, a.student?.name||"N/A", a.student?.studentId||"N/A",
        a.student?.grade||"N/A", a.student?.section||"N/A",
        a.status === "present" ? "Present" : "Late",
        xlsxDate(ts), xlsxTime(ts)];
    }),
    summaryRows: [
      ["Total Records", records.length],
      ["Present", present],
      ["Late", late],
      ["Attendance Rate", `${records.length ? Math.round((present/records.length)*100) : 0}%`],
    ],
    filename: `${safe(session?.subject)}_${safe(monthLabel)}_monthly.xlsx`,
  });
}

// ── Teacher: export full session ──────────────────────────────────────────────
async function exportSessionFull(records, session) {
  const present = records.filter(a => a.status === "present").length;
  const late    = records.filter(a => a.status === "late").length;
  const uniqueStudents = new Set(records.map(a => a.student?._id || a.student?.studentId)).size;
  await buildAttendanceXLSX({
    title:    `Attendance Sheet — ${session?.subject || "N/A"}`,
    subtitle: `Full Session Report`,
    infoRows: [
      [`Room: ${session?.room || "N/A"}   |   Created: ${session?.createdAt ? xlsxDate(session.createdAt) : "N/A"}   |   Exported: ${new Date().toLocaleDateString("en-PH", { year:"numeric", month:"long", day:"numeric" })}`],
    ],
    headers: ["#", "Student Name", "Student ID", "Grade", "Section", "Status", "Date", "Check-in Time"],
    rows: records.map((a, i) => {
      const ts = new Date(a.timestamp);
      return [i+1, a.student?.name||"N/A", a.student?.studentId||"N/A",
        a.student?.grade||"N/A", a.student?.section||"N/A",
        a.status === "present" ? "Present" : "Late",
        xlsxDate(ts), xlsxTime(ts)];
    }),
    summaryRows: [
      ["Total Records", records.length],
      ["Unique Students", uniqueStudents],
      ["Present", present],
      ["Late", late],
      ["Attendance Rate", `${records.length ? Math.round((present/records.length)*100) : 0}%`],
    ],
    filename: `${safe(session?.subject)}_full_session_${todayStr()}.xlsx`,
  });
}

// ── Student: export by subject ────────────────────────────────────────────────
async function exportStudentBySubject(records, subjectName, studentName) {
  const present = records.filter(a => a.status === "present").length;
  const late    = records.filter(a => a.status === "late").length;
  await buildAttendanceXLSX({
    title:    `Attendance Record — ${studentName}`,
    subtitle: `Subject Report · ${subjectName}`,
    infoRows: [
      [`Student: ${studentName}   |   Subject: ${subjectName}   |   Exported: ${new Date().toLocaleDateString("en-PH", { year:"numeric", month:"long", day:"numeric" })}`],
    ],
    headers: ["#", "Subject", "Room", "Teacher", "Status", "Date", "Check-in Time"],
    rows: records.map((a, i) => {
      const ts = new Date(a.timestamp);
      return [i+1, a.session?.subject||"N/A", a.session?.room||"N/A", a.session?.teacher?.name||"N/A",
        a.status === "present" ? "Present" : "Late",
        xlsxDate(ts), xlsxTime(ts)];
    }),
    summaryRows: [
      ["Total Sessions", records.length],
      ["Present", present],
      ["Late", late],
      ["Attendance Rate", `${records.length ? Math.round((present/records.length)*100) : 0}%`],
    ],
    filename: `${safe(studentName)}_${safe(subjectName)}_${todayStr()}.xlsx`,
  });
}

// ── Student: export by month ──────────────────────────────────────────────────
async function exportStudentByMonth(records, monthLabel, studentName) {
  const present = records.filter(a => a.status === "present").length;
  const late    = records.filter(a => a.status === "late").length;
  await buildAttendanceXLSX({
    title:    `Attendance Record — ${studentName}`,
    subtitle: `Monthly Report · ${monthLabel}`,
    infoRows: [
      [`Student: ${studentName}   |   Period: ${monthLabel}   |   Exported: ${new Date().toLocaleDateString("en-PH", { year:"numeric", month:"long", day:"numeric" })}`],
    ],
    headers: ["#", "Subject", "Room", "Teacher", "Status", "Date", "Check-in Time"],
    rows: records.map((a, i) => {
      const ts = new Date(a.timestamp);
      return [i+1, a.session?.subject||"N/A", a.session?.room||"N/A", a.session?.teacher?.name||"N/A",
        a.status === "present" ? "Present" : "Late",
        xlsxDate(ts), xlsxTime(ts)];
    }),
    summaryRows: [
      ["Total Sessions", records.length],
      ["Present", present],
      ["Late", late],
      ["Attendance Rate", `${records.length ? Math.round((present/records.length)*100) : 0}%`],
    ],
    filename: `${safe(studentName)}_${safe(monthLabel)}_${todayStr()}.xlsx`,
  });
}

// Legacy wrappers
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
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=DM+Mono:wght@400;500&family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,600;1,9..144,300&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  /* ── Global custom scrollbars ── */
  * { scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
  *::-webkit-scrollbar { width: 5px; height: 5px; }
  *::-webkit-scrollbar-track { background: transparent; }
  *::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 99px; }
  *::-webkit-scrollbar-thumb:hover { background: var(--ink3); }
  *::-webkit-scrollbar-corner { background: transparent; }



  :root {
    /* ── Palette ── */
    --bg:        #F7F7F5;
    --bg2:       #EFEFE9;
    --surface:   #FFFFFF;
    --surface2:  #F4F4F1;
    --surface3:  #EBEBE6;
    --border:    #E3E3DC;
    --border2:   #CACAC2;
    --ink:       #1A1A17;
    --ink2:      #3D3D38;
    --ink3:      #6B6B63;
    --muted:     #9B9B91;
    --accent:    #1F6FEB;
    --accent-lt: #EBF2FF;
    --accent-dk: #1558C0;
    --green:     #0F7B55;
    --green-lt:  #E6F5F0;
    --amber:     #B45309;
    --amber-lt:  #FEF3C7;
    --red:       #C0392B;
    --red-lt:    #FDECEA;

    /* ── Typography ── */
    --font-body:    'DM Sans', sans-serif;
    --font-heading: 'Fraunces', serif;
    --font-mono:    'DM Mono', monospace;

    /* ── Spacing & Shape ── */
    --radius:    10px;
    --radius-sm: 7px;
    --radius-xs: 5px;
    --radius-lg: 14px;

    /* ── Shadows ── */
    --shadow-xs: 0 1px 2px rgba(0,0,0,0.05);
    --shadow-sm: 0 1px 3px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.04);
    --shadow-md: 0 4px 6px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.04);
    --shadow-lg: 0 10px 25px rgba(0,0,0,0.08), 0 4px 10px rgba(0,0,0,0.04);
    --shadow-xl: 0 20px 40px rgba(0,0,0,0.10), 0 8px 16px rgba(0,0,0,0.05);
  }

  /* ── Reset & Base ── */
  html { scroll-behavior: smooth; }
  body {
    font-family: var(--font-body);
    background: var(--bg);
    color: var(--ink);
    font-size: 15px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    min-height: 100vh;
  }
  #root { min-height: 100vh; display: flex; flex-direction: column; }

  /* ── Layout ── */
  .container { max-width: 1040px; margin: 0 auto; padding: 0 24px; }
  .main { flex: 1; padding: 36px 0 60px; }

  /* ── Nav ── */
  .nav {
    position: sticky; top: 0; z-index: 100;
    background: rgba(247,247,245,0.88);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-bottom: 1px solid var(--border);
    height: 58px;
  }
  .nav-inner { height: 100%; display: flex; align-items: center; justify-content: space-between; }
  .nav-brand {
    display: flex; align-items: center; gap: 9px;
    font-family: var(--font-heading); font-weight: 600;
    font-size: 1.05rem; color: var(--ink); letter-spacing: -0.02em;
  }
  .nav-logo-wrap {
    width: 32px; height: 32px; border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
  }
  .nav-actions { display: flex; align-items: center; gap: 8px; }

  /* ── Profile popup ── */
  .profile-popup-wrap { position: relative; }
  .profile-pill-btn {
    display: flex; align-items: center; gap: 8px;
    background: var(--surface); border: 1px solid var(--border);
    padding: 5px 10px 5px 5px; border-radius: 40px;
    cursor: pointer; transition: all 0.15s;
    font-family: var(--font-body); box-shadow: var(--shadow-xs);
    max-width: 200px; min-width: 0; overflow: hidden;
  }
  .profile-pill-btn:hover { border-color: var(--border2); box-shadow: var(--shadow-sm); }
  .user-avatar {
    width: 28px; height: 28px; border-radius: 50%;
    background: var(--ink); color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 0.7rem; font-weight: 700; flex-shrink: 0; overflow: hidden;
  }
  .user-name { font-size: 0.82rem; font-weight: 600; color: var(--ink); line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 130px; }
  .user-role { font-size: 0.7rem; color: var(--muted); text-transform: capitalize; line-height: 1; }
  .user-avatar-img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block; }
  .profile-popup {
    position: absolute; top: calc(100% + 8px); right: 0; width: 270px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-lg); box-shadow: var(--shadow-xl);
    z-index: 200; overflow: hidden; animation: fadeIn 0.15s ease;
  }
  .profile-popup-head { padding: 18px 16px 14px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 12px; }
  .profile-popup-avatar {
    width: 44px; height: 44px; border-radius: 10px;
    background: var(--ink); display: flex; align-items: center; justify-content: center;
    font-size: 1.1rem; font-weight: 700; color: #fff; flex-shrink: 0; overflow: hidden;
  }
  .profile-popup-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .profile-popup-name { font-weight: 600; font-size: 0.9rem; color: var(--ink); margin-bottom: 2px; }
  .profile-popup-email { font-size: 0.73rem; color: var(--muted); }
  .profile-popup-role { display: inline-flex; margin-top: 4px; background: var(--surface2); border: 1px solid var(--border); border-radius: 20px; padding: 1px 8px; font-size: 0.68rem; font-weight: 600; color: var(--ink3); text-transform: capitalize; }
  .profile-popup-rows { padding: 8px 0; }
  .profile-popup-row { display: flex; justify-content: space-between; padding: 5px 16px; font-size: 0.8rem; }
  .profile-popup-row-label { color: var(--muted); font-weight: 500; }
  .profile-popup-row-val { color: var(--ink2); font-weight: 600; }
  .profile-popup-actions { padding: 8px 10px 10px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 4px; }
  .profile-popup-btn {
    width: 100%; padding: 8px 10px; background: transparent; border: none;
    border-radius: var(--radius-sm); font-family: var(--font-body); font-size: 0.82rem;
    font-weight: 500; color: var(--ink2); cursor: pointer; text-align: left;
    transition: all 0.12s; display: flex; align-items: center; gap: 8px;
  }
  .profile-popup-btn:hover { background: var(--surface2); color: var(--ink); }
  .profile-popup-btn.danger { color: var(--red); }
  .profile-popup-btn.danger:hover { background: var(--red-lt); }

  /* ── Page header ── */
  .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 28px; flex-wrap: wrap; gap: 14px; }
  .page-title-block {}
  .page-title { font-family: var(--font-heading); font-size: 1.9rem; font-weight: 600; color: var(--ink); letter-spacing: -0.03em; line-height: 1.2; margin-bottom: 4px; font-style: italic; }
  .page-sub { font-size: 0.88rem; color: var(--ink3); font-weight: 400; }

  /* ── Buttons ── */
  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 7px;
    font-family: var(--font-body); font-weight: 500; font-size: 0.875rem;
    border-radius: var(--radius-sm); border: 1px solid transparent;
    cursor: pointer; transition: all 0.14s; text-decoration: none;
    white-space: nowrap; letter-spacing: -0.01em;
  }
  .btn:active { transform: scale(0.98); }
  .btn-primary {
    background: var(--ink); color: #fff; border-color: var(--ink);
    padding: 9px 18px; box-shadow: var(--shadow-sm);
  }
  .btn-primary:hover { background: var(--ink2); border-color: var(--ink2); }
  .btn-ghost {
    background: transparent; color: var(--ink2);
    border-color: var(--border); padding: 9px 18px;
  }
  .btn-ghost:hover { background: var(--surface2); border-color: var(--border2); }
  .btn-green {
    background: var(--green); color: #fff; border-color: var(--green);
    padding: 9px 18px; box-shadow: var(--shadow-sm);
  }
  .btn-green:hover { background: #0a6647; }
  .btn-danger {
    background: var(--red-lt); color: var(--red); border-color: #f5c6c2;
    padding: 9px 18px;
  }
  .btn-danger:hover { background: #fbd5d1; }
  .btn-excel {
    background: var(--green-lt); color: var(--green); border-color: #b7e4d5;
    padding: 7px 14px; font-size: 0.8rem; font-weight: 600;
  }
  .btn-excel:hover { background: #d1ede5; }
  .btn-sm { padding: 6px 12px; font-size: 0.8rem; }
  .btn-lg { padding: 12px 22px; font-size: 0.92rem; }
  .btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }

  /* ── Cards ── */
  .card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-lg); padding: 24px;
    box-shadow: var(--shadow-sm);
  }
  .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
  .section-title { font-family: var(--font-heading); font-weight: 600; font-size: 1.05rem; color: var(--ink); font-style: italic; }
  .export-info { font-size: 0.78rem; color: var(--muted); }

  /* ── Stats grid ── */
  .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 28px; }
  .stat-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-lg); padding: 20px 22px;
    box-shadow: var(--shadow-xs); position: relative; overflow: hidden;
  }
  .stat-card::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
    background: var(--stat-color, var(--accent));
  }
  .stat-label { font-size: 0.72rem; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 10px; }
  .stat-value { font-family: var(--font-heading); font-size: 2rem; font-weight: 600; color: var(--ink); letter-spacing: -0.04em; line-height: 1; }
  .stat-sub { font-size: 0.73rem; color: var(--muted); margin-top: 5px; }

  /* ── Form ── */
  .form-group { margin-bottom: 16px; }
  .form-label { display: block; font-size: 0.75rem; font-weight: 600; color: var(--ink3); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 7px; }
  .form-input {
    width: 100%; padding: 10px 13px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-sm); font-family: var(--font-body);
    font-size: 0.9rem; color: var(--ink);
    transition: all 0.14s; outline: none;
    box-shadow: var(--shadow-xs);
  }
  .form-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(31,111,235,0.1); }
  .form-input::placeholder { color: var(--muted); }
  .form-input:disabled { background: var(--surface2); color: var(--ink3); cursor: not-allowed; }
  .form-hint { font-size: 0.75rem; color: var(--muted); margin-top: 5px; line-height: 1.5; }
  textarea.form-input { resize: vertical; min-height: 90px; }

  /* ── Alert ── */
  .alert {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 12px 14px; border-radius: var(--radius-sm);
    font-size: 0.85rem; font-weight: 500; margin-bottom: 16px; line-height: 1.45;
  }
  .alert-error { background: var(--red-lt); color: var(--red); border: 1px solid #f5c6c2; }
  .alert-success { background: var(--green-lt); color: var(--green); border: 1px solid #a8dcc9; }

  /* ── Spinner ── */
  .spinner {
    border: 2px solid var(--border);
    border-top-color: var(--ink); border-radius: 50%;
    animation: spin 0.7s linear infinite; flex-shrink: 0;
  }

  /* ── Auth page ── */
  .auth-page {
    min-height: 100vh; display: flex; align-items: center; justify-content: center;
    padding: 24px; background: var(--bg);
    background-image: radial-gradient(circle at 20% 20%, rgba(31,111,235,0.04) 0%, transparent 60%),
                      radial-gradient(circle at 80% 80%, rgba(15,123,85,0.03) 0%, transparent 60%);
  }
  .auth-bg-orb { display: none; }
  .auth-dots { display: none; }
  .auth-card {
    width: 100%; max-width: 420px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 18px; padding: 36px 32px;
    box-shadow: var(--shadow-xl);
  }
  .auth-header { text-align: center; margin-bottom: 28px; }
  .auth-logo-wrap {
    width: 52px; height: 52px; border-radius: 13px;
    display: inline-flex; align-items: center; justify-content: center;
    margin-bottom: 18px; overflow: hidden;
  }
  .auth-title { font-family: var(--font-heading); font-size: 1.7rem; font-weight: 600; color: var(--ink); letter-spacing: -0.03em; font-style: italic; margin-bottom: 6px; }
  .auth-sub { font-size: 0.88rem; color: var(--ink3); }
  .auth-tabs { display: flex; background: var(--surface2); border-radius: var(--radius-sm); padding: 3px; gap: 3px; margin-bottom: 22px; }
  .auth-tab { flex: 1; padding: 8px; border-radius: 5px; border: none; background: transparent; font-family: var(--font-body); font-size: 0.85rem; font-weight: 500; color: var(--ink3); cursor: pointer; transition: all 0.14s; }
  .auth-tab.active { background: var(--surface); color: var(--ink); box-shadow: var(--shadow-sm); font-weight: 600; }
  .role-tabs { display: flex; background: var(--surface2); border-radius: var(--radius-sm); padding: 3px; gap: 3px; margin-bottom: 20px; }
  .role-tab { flex: 1; padding: 8px; border-radius: 5px; border: none; background: transparent; font-family: var(--font-body); font-size: 0.85rem; font-weight: 500; color: var(--ink3); cursor: pointer; transition: all 0.14s; }
  .role-tab.active { background: var(--surface); color: var(--ink); box-shadow: var(--shadow-sm); font-weight: 600; }
  .auth-switch { text-align: center; margin-top: 20px; font-size: 0.84rem; color: var(--muted); }
  .auth-switch a { color: var(--accent); font-weight: 600; cursor: pointer; text-decoration: none; }
  .auth-switch a:hover { text-decoration: underline; }

  /* ── Session cards ── */
  .sessions-grid { display: flex; flex-direction: column; gap: 10px; }
  /* ── Detail view header ── */
  .detail-header {
    display: flex; align-items: flex-start; gap: 14px;
    padding: 18px 0 20px; border-bottom: 1px solid var(--border); margin-bottom: 20px;
  }
  .detail-back { flex-shrink: 0; margin-top: 2px; }
  .detail-info { flex: 1; min-width: 0; }
  .detail-title {
    font-family: var(--font-serif); font-size: 1.4rem; font-weight: 700;
    color: var(--ink); letter-spacing: -0.02em; margin-bottom: 8px;
  }
  .detail-meta { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }

  .session-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-lg); padding: 18px 20px;
    display: flex; align-items: center; gap: 16px;
    box-shadow: var(--shadow-xs); transition: all 0.14s;
  }
  .session-card:hover { box-shadow: var(--shadow-md); border-color: var(--border2); }
  .session-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .session-dot.active { background: var(--green); box-shadow: 0 0 0 3px var(--green-lt); }
  .session-dot.inactive { background: var(--muted); }
  .session-dot.expired { background: var(--amber); box-shadow: 0 0 0 3px var(--amber-lt); }
  .session-info { flex: 1; min-width: 0; }
  .session-subject { font-weight: 600; font-size: 0.95rem; color: var(--ink); margin-bottom: 3px; }
  .session-meta { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-top: 7px; }
  .session-meta-chip {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 9px; border-radius: 20px;
    font-size: 0.73rem; font-weight: 500; color: var(--ink3);
    background: var(--surface2); border: 1px solid var(--border);
    white-space: nowrap; line-height: 1.5;
  }
  .session-meta-chip svg { flex-shrink: 0; opacity: 0.7; }
  .session-meta-chip.chip-live { background: var(--green-lt); border-color: var(--green); color: var(--green); font-weight: 700; }
  .session-meta-chip.chip-expired { background: var(--red-lt); border-color: var(--red); color: var(--red); font-weight: 700; }
  .session-meta-chip.chip-accent { background: var(--accent-lt); border-color: var(--accent); color: var(--accent-dk); }
  .session-actions { display: flex; align-items: center; gap: 7px; flex-shrink: 0; }

  /* ── Badge ── */
  .badge {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 3px 9px; border-radius: 20px;
    font-size: 0.72rem; font-weight: 600; letter-spacing: 0.01em;
  }
  .badge-present { background: var(--green-lt); color: var(--green); }
  .badge-late { background: var(--amber-lt); color: var(--amber); }
  .badge-active { background: var(--green-lt); color: var(--green); }
  .badge-inactive { background: var(--surface2); color: var(--muted); border: 1px solid var(--border); }
  .badge-expired { background: var(--amber-lt); color: var(--amber); }

  /* ── Modal ── */
  .modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.65);
    display: flex; align-items: center; justify-content: center;
    z-index: 500; padding: 20px; backdrop-filter: blur(4px);
    animation: fadeIn 0.15s ease;
  }
  .modal-box {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: 0 24px 60px rgba(0,0,0,0.5);
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    animation: fadeIn 0.15s ease;
  }
  .modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 18px 24px 0;
    position: sticky; top: 0;
    background: var(--surface);
    z-index: 1;
    border-bottom: 1px solid var(--border);
    padding-bottom: 14px;
  }
  .modal-title { font-size: 1rem; font-weight: 800; color: var(--ink); margin: 0; }
  .modal-close {
    background: var(--surface2); border: 1px solid var(--border);
    border-radius: 8px; width: 30px; height: 30px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; font-size: 0.8rem; color: var(--ink3);
    flex-shrink: 0;
  }
  .modal-close:hover { background: var(--red-lt); color: var(--red); border-color: var(--red); }
  .modal-body { padding: 20px 24px 24px; }
  .modal {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 18px; padding: 28px; width: 100%; max-width: 500px;
    box-shadow: var(--shadow-xl); animation: slideUp 0.2s cubic-bezier(0.34,1.4,0.64,1);
    max-height: 90vh; overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
  }
  .modal::-webkit-scrollbar { width: 5px; }
  .modal::-webkit-scrollbar-track { background: transparent; border-radius: 99px; }
  .modal::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 99px; }
  .modal::-webkit-scrollbar-thumb:hover { background: var(--ink3); }
  .modal-title { font-family: var(--font-heading); font-size: 1.25rem; font-weight: 600; color: var(--ink); letter-spacing: -0.02em; font-style: italic; margin-bottom: 6px; }
  .modal-sub { font-size: 0.84rem; color: var(--ink3); margin-bottom: 22px; }

  /* ── Table ── */
  .table-wrap { overflow-x: auto; border-radius: var(--radius-lg); border: 1px solid var(--border); box-shadow: var(--shadow-xs); }
  table { width: 100%; border-collapse: collapse; background: var(--surface); }
  thead { background: var(--surface2); }
  th { padding: 11px 14px; font-size: 0.72rem; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.07em; text-align: left; border-bottom: 1px solid var(--border); white-space: nowrap; }
  td { padding: 11px 14px; font-size: 0.84rem; color: var(--ink2); border-bottom: 1px solid var(--border); }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: var(--surface2); }
  .td-name { display: flex; align-items: center; gap: 9px; font-weight: 600; color: var(--ink); }
  .avatar { width: 28px; height: 28px; min-width: 28px; min-height: 28px; border-radius: 7px; background: var(--ink); display: flex; align-items: center; justify-content: center; font-size: 0.68rem; font-weight: 700; color: #fff; flex-shrink: 0; overflow: hidden; position: relative; }
  .avatar-img { width: 100%; height: 100%; object-fit: cover; border-radius: 7px; display: block; position: absolute; top: 0; left: 0; }

  /* ── Accordion ── */
  .accordion-month {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-lg); overflow: hidden;
    box-shadow: var(--shadow-xs); margin-bottom: 8px;
  }
  .accordion-month-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 18px; cursor: pointer; transition: background 0.12s;
    user-select: none;
  }
  .accordion-month-header:hover { background: var(--surface2); }
  .accordion-day {
    background: var(--surface2); border: 1px solid var(--border);
    border-radius: var(--radius-sm); overflow: hidden; margin-bottom: 4px;
  }
  .accordion-day-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 14px; cursor: pointer; transition: background 0.12s;
  }
  .accordion-day-header:hover { background: var(--bg2); }
  .accordion-chevron { font-size: 0.65rem; color: var(--muted); transition: transform 0.2s; display: inline-block; }
  .accordion-chevron.open { transform: rotate(180deg); }

  /* ── Filters ── */
  .history-filters { display: flex; gap: 5px; flex-wrap: wrap; }
  .filter-chip {
    padding: 6px 13px; border-radius: 20px; font-size: 0.78rem; font-weight: 500;
    cursor: pointer; transition: all 0.13s;
    background: var(--surface); border: 1px solid var(--border); color: var(--ink3);
  }
  .filter-chip:hover { border-color: var(--border2); color: var(--ink); }
  .filter-chip.active { background: var(--ink); color: #fff; border-color: var(--ink); }
  .export-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

  /* ── Check-in page ── */
  .checkin-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; background: var(--bg); }
  .checkin-card { width: 100%; max-width: 420px; }
  .checkin-icon { font-size: 2.5rem; display: block; margin-bottom: 16px; }
  .checkin-title { font-family: var(--font-heading); font-size: 1.5rem; font-weight: 600; color: var(--ink); font-style: italic; letter-spacing: -0.02em; margin-bottom: 8px; }
  .checkin-sub { font-size: 0.88rem; color: var(--ink3); margin-bottom: 20px; }
  .checkin-info-row { display: flex; align-items: center; gap: 8px; font-size: 0.84rem; color: var(--ink3); margin-bottom: 8px; }
  .success-card { text-align: center; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 36px 28px; box-shadow: var(--shadow-sm); }
  .already-card { text-align: center; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 36px 28px; box-shadow: var(--shadow-sm); }
  .error-card { text-align: center; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 36px 28px; box-shadow: var(--shadow-sm); }

  /* ── Settings ── */
  .settings-page { max-width: 680px; margin: 0 auto; }
  .settings-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 26px; box-shadow: var(--shadow-xs); margin-bottom: 16px; }
  .settings-card-title { font-family: var(--font-heading); font-weight: 600; font-size: 1.05rem; color: var(--ink); font-style: italic; margin-bottom: 4px; letter-spacing: -0.02em; }
  .settings-card-sub { font-size: 0.82rem; color: var(--muted); margin-bottom: 20px; }
  .profile-info-row { display: flex; align-items: flex-start; gap: 20px; margin-bottom: 24px; }
  .avatar-upload-wrap { flex-shrink: 0; }
  .avatar-upload-circle {
    width: 80px; height: 80px; border-radius: 50%;
    background: var(--surface2); border: 2px solid var(--border);
    display: flex; align-items: center; justify-content: center;
    font-size: 1.8rem; font-weight: 700; color: var(--ink2);
    cursor: pointer; overflow: hidden; transition: all 0.15s;
  }
  .avatar-upload-circle:hover { border-color: var(--accent); }
  .avatar-upload-circle img { width: 100%; height: 100%; object-fit: cover; }
  .avatar-upload-hint { font-size: 0.72rem; color: var(--muted); text-align: center; margin-top: 5px; }

  /* ── Info tiles (student modal) ── */
  .student-modal-avatar { width: 68px; height: 68px; border-radius: 16px; background: var(--ink); display: flex; align-items: center; justify-content: center; font-size: 1.7rem; font-weight: 700; color: #fff; margin: 0 auto 16px; overflow: hidden; }
  .student-modal-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .student-modal-name { font-family: var(--font-heading); font-size: 1.3rem; font-weight: 600; text-align: center; font-style: italic; letter-spacing: -0.02em; margin-bottom: 4px; }
  .student-modal-sub { text-align: center; font-size: 0.82rem; color: var(--muted); margin-bottom: 20px; }
  .student-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
  .student-info-tile { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px 14px; }
  .student-info-tile-label { font-size: 0.67rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 600; margin-bottom: 4px; }
  .student-info-tile-val { font-size: 0.88rem; font-weight: 600; color: var(--ink); }
  .student-info-tile-val.accent { color: var(--accent); font-family: var(--font-heading); font-size: 1.1rem; font-style: italic; }

  /* ── History list ── */
  .history-list { display: flex; flex-direction: column; gap: 8px; }
  .history-item { display: flex; align-items: center; gap: 13px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 14px 16px; transition: box-shadow 0.13s; }
  .history-item:hover { box-shadow: var(--shadow-md); }
  .history-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
  .history-dot.present { background: var(--green); }
  .history-dot.late { background: var(--amber); }
  .history-body { flex: 1; min-width: 0; }
  .history-subject { font-weight: 600; font-size: 0.9rem; color: var(--ink); margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .history-meta { display: flex; gap: 10px; font-size: 0.76rem; color: var(--ink3); flex-wrap: wrap; }
  .history-side { text-align: right; flex-shrink: 0; }
  .history-date { margin-top: 4px; }
  .history-date-main { font-size: 0.78rem; color: var(--ink3); font-weight: 500; }
  .history-date-time { font-size: 0.73rem; color: var(--muted); font-family: var(--font-mono); }

  /* ── Age display ── */
  .age-display { margin-top: 8px; padding: 10px 13px; background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 0.84rem; color: var(--ink3); }
  .age-value { font-weight: 700; color: var(--accent); font-size: 1rem; font-family: var(--font-mono); }

  /* ── QR code ── */
  .qr-container { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 24px; background: var(--surface2); border-radius: var(--radius-lg); border: 1px solid var(--border); }
  .qr-container canvas, .qr-container img { border-radius: 8px; }
  .qr-timer { font-family: var(--font-mono); font-size: 0.85rem; font-weight: 500; color: var(--ink3); background: var(--surface); border: 1px solid var(--border); padding: 5px 14px; border-radius: 20px; }
  .qr-timer.urgent { color: var(--red); border-color: #f5c6c2; background: var(--red-lt); }

  /* ── Empty state ── */
  .empty { text-align: center; padding: 60px 24px; }
  .empty-icon { font-size: 2.5rem; margin-bottom: 14px; opacity: 0.5; }
  .empty-text { font-size: 0.9rem; color: var(--muted); line-height: 1.6; white-space: pre-line; }

  /* ── Loading ── */
  .loading-page { display: flex; align-items: center; justify-content: center; padding: 48px; }

  /* ── Divider ── */
  .divider { border: none; border-top: 1px solid var(--border); margin: 20px 0; }

  /* ── Animations ── */
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.85); } }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slideUp { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }

  /* ── Responsive ── */
  @media (max-width: 640px) {
    /* Layout */
    .container { padding: 0 16px; }
    .main { padding: 20px 0 48px; }

    /* Nav */
    .nav-inner { height: 52px; }
    .nav-brand { font-size: 1rem; gap: 7px; }
    .profile-pill-btn { max-width: 160px; padding: 4px 8px 4px 4px; gap: 6px; }
    .user-name { font-size: 0.78rem; max-width: 100px; }
    .user-role { font-size: 0.65rem; }

    /* Verification banner */
    .email-verify-banner { padding: 10px 16px; font-size: 0.82rem; gap: 8px; }

    /* Stats grid — 2 cols on mobile */
    .stats-grid { grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
    .stat-card { padding: 14px 14px; }
    .stat-value { font-size: 1.6rem; }
    .stat-label { font-size: 0.65rem; }

    /* Page titles */
    .page-title { font-size: 1.4rem; margin-bottom: 4px; }

    /* Session cards */
    .session-card { padding: 14px 14px; gap: 10px; }
    .session-meta { flex-wrap: wrap; gap: 6px; }
    .session-meta-chip { font-size: 0.71rem; padding: 3px 8px; }

    /* Settings */
    .settings-card { padding: 18px 16px; }
    .settings-card-title { font-size: 1rem; }

    /* Auth */
    .auth-card { padding: 24px 18px; }

    /* Modals */
    .modal { padding: 20px 16px; }
    .modal-box { width: 96vw !important; max-width: 96vw !important; }
    .modal-header { padding: 14px 16px 12px; }
    .modal-body { padding: 16px 16px 20px; }

    /* Filters / buttons row */
    .history-filters { flex-wrap: wrap; gap: 6px; }
    .export-bar { width: 100%; flex-wrap: wrap; }

    /* Profile */
    .profile-info-row { flex-direction: column; align-items: flex-start; }
    .student-info-grid { grid-template-columns: 1fr; }

    /* Attendance accordion */
    .attendance-table th,
    .attendance-table td { padding: 8px 10px; font-size: 0.78rem; }

    /* QR modal */
    .qr-container { padding: 16px; }
  }

  @keyframes scanLine {
    0%   { top: 20%; }
    50%  { top: 78%; }
    100% { top: 20%; }
  }
  /* Promote animated elements to GPU layer to avoid main thread INP */
  .btn { will-change: auto; }
  .btn:active { transform: scale(0.97); }

  @media (max-width: 400px) {
    .container { padding: 0 12px; }
    .stats-grid { gap: 8px; }
    .stat-card { padding: 12px 12px; }
    .stat-value { font-size: 1.4rem; }
    .profile-pill-btn { max-width: 140px; }
    .user-name { max-width: 80px; }
  }


  /* ═══════════════════════════════════════════════════
     DARK MODE
  ═══════════════════════════════════════════════════ */
  [data-theme="dark"] {
    --bg:        #0E0E0C;
    --bg2:       #141412;
    --surface:   #1A1A17;
    --surface2:  #222220;
    --surface3:  #2A2A27;
    --border:    #2E2E2B;
    --border2:   #3D3D39;
    --ink:       #F0F0EB;
    --ink2:      #C8C8C2;
    --ink3:      #8A8A82;
    --muted:     #5A5A54;
    --accent:    #4D8EF0;
    --accent-lt: #1A2E4A;
    --accent-dk: #6BA3F5;
    --green:     #34C98A;
    --green-lt:  #0D2B1F;
    --amber:     #F0A030;
    --amber-lt:  #2A1E08;
    --red:       #F05050;
    --red-lt:    #2A1010;
    --shadow-xs: 0 1px 2px rgba(0,0,0,0.3);
    --shadow-sm: 0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3);
    --shadow-md: 0 4px 6px rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.3);
    --shadow-lg: 0 10px 25px rgba(0,0,0,0.5), 0 4px 10px rgba(0,0,0,0.3);
    --shadow-xl: 0 20px 40px rgba(0,0,0,0.6), 0 8px 16px rgba(0,0,0,0.4);
  }

  [data-theme="dark"] body {
    background: var(--bg);
    color: var(--ink);
  }

  [data-theme="dark"] .nav {
    background: rgba(14,14,12,0.88);
    border-bottom-color: var(--border);
  }

  [data-theme="dark"] .nav-brand { color: var(--ink); }

  [data-theme="dark"] .nav-logo-wrap { background: transparent; }

  [data-theme="dark"] .profile-pill-btn {
    background: var(--surface2);
    border-color: var(--border);
  }
  [data-theme="dark"] .profile-pill-btn:hover { border-color: var(--border2); }

  [data-theme="dark"] .profile-popup {
    background: var(--surface);
    border-color: var(--border);
  }
  [data-theme="dark"] .profile-popup-head { border-bottom-color: var(--border); }
  [data-theme="dark"] .profile-popup-actions { border-top-color: var(--border); }
  [data-theme="dark"] .profile-popup-btn:hover { background: var(--surface2); }
  [data-theme="dark"] .profile-popup-btn.danger:hover { background: var(--red-lt); }
  [data-theme="dark"] .profile-popup-role { background: var(--surface3); border-color: var(--border2); }

  [data-theme="dark"] .card { background: var(--surface); border-color: var(--border); }

  [data-theme="dark"] .stat-card { background: var(--surface); border-color: var(--border); }

  [data-theme="dark"] .btn-primary { background: var(--ink); color: var(--bg); border-color: var(--ink); }
  [data-theme="dark"] .btn-primary:hover { background: var(--ink2); border-color: var(--ink2); }
  [data-theme="dark"] .btn-ghost { background: transparent; color: var(--ink2); border-color: var(--border); }
  [data-theme="dark"] .btn-ghost:hover { background: var(--surface2); border-color: var(--border2); }
  [data-theme="dark"] .btn-green { background: #0D5C3A; color: var(--green); border-color: #1A4D33; }
  [data-theme="dark"] .btn-green:hover { background: #0F6B43; }
  [data-theme="dark"] .btn-danger { background: var(--red-lt); color: var(--red); border-color: #4A1A1A; }
  [data-theme="dark"] .btn-danger:hover { background: #351515; }
  [data-theme="dark"] .btn-excel { background: var(--green-lt); color: var(--green); border-color: #1A4D33; }
  [data-theme="dark"] .btn-excel:hover { background: #0F3325; }

  [data-theme="dark"] .form-input {
    background: var(--surface2);
    border-color: var(--border);
    color: var(--ink);
  }
  [data-theme="dark"] .form-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(77,142,240,0.15); }
  [data-theme="dark"] .form-input::placeholder { color: var(--muted); }
  [data-theme="dark"] .form-input:disabled { background: var(--surface3); color: var(--ink3); }

  [data-theme="dark"] .auth-page {
    background: var(--bg);
    background-image: radial-gradient(circle at 20% 20%, rgba(77,142,240,0.06) 0%, transparent 60%),
                      radial-gradient(circle at 80% 80%, rgba(52,201,138,0.04) 0%, transparent 60%);
  }
  [data-theme="dark"] .auth-card { background: var(--surface); border-color: var(--border); }
  [data-theme="dark"] .auth-logo-wrap { background: var(--surface2); border: 1px solid var(--border2); }
  [data-theme="dark"] .auth-tabs { background: var(--surface2); }
  [data-theme="dark"] .auth-tab.active { background: var(--surface3); color: var(--ink); }
  [data-theme="dark"] .role-tabs { background: var(--surface2); }
  [data-theme="dark"] .role-tab.active { background: var(--surface3); color: var(--ink); }

  [data-theme="dark"] .modal-overlay { background: rgba(0,0,0,0.7); }
  [data-theme="dark"] .modal { background: var(--surface); border-color: var(--border); }

  [data-theme="dark"] .table-wrap { border-color: var(--border); }
  [data-theme="dark"] table { background: var(--surface); }
  [data-theme="dark"] thead { background: var(--surface2); }
  [data-theme="dark"] th { border-bottom-color: var(--border); color: var(--muted); }
  [data-theme="dark"] td { border-bottom-color: var(--border); color: var(--ink2); }
  [data-theme="dark"] tr:hover td { background: var(--surface2); }

  [data-theme="dark"] .session-card { background: var(--surface); border-color: var(--border); }
  [data-theme="dark"] .session-card:hover { border-color: var(--border2); }

  [data-theme="dark"] .accordion-month { background: var(--surface); border-color: var(--border); }
  [data-theme="dark"] .accordion-month-header:hover { background: var(--surface2); }
  [data-theme="dark"] .accordion-day { background: var(--surface2); border-color: var(--border); }
  [data-theme="dark"] .accordion-day-header:hover { background: var(--surface3); }

  [data-theme="dark"] .filter-chip { background: var(--surface); border-color: var(--border); color: var(--ink3); }
  [data-theme="dark"] .filter-chip:hover { border-color: var(--border2); color: var(--ink); }
  [data-theme="dark"] .filter-chip.active { background: var(--ink); color: var(--bg); border-color: var(--ink); }

  [data-theme="dark"] .history-item { background: var(--surface); border-color: var(--border); }
  [data-theme="dark"] .history-item:hover { box-shadow: var(--shadow-md); }

  [data-theme="dark"] .settings-card { background: var(--surface); border-color: var(--border); }

  [data-theme="dark"] .student-info-tile { background: var(--surface2); border-color: var(--border); }

  [data-theme="dark"] .avatar { background: var(--surface3); }

  [data-theme="dark"] .badge-inactive { background: var(--surface3); color: var(--ink3); border-color: var(--border2); }

  [data-theme="dark"] .alert-error { background: var(--red-lt); color: var(--red); border-color: #4A1A1A; }
  [data-theme="dark"] .alert-success { background: var(--green-lt); color: var(--green); border-color: #1A4D33; }

  [data-theme="dark"] .spinner { border-color: var(--border2); border-top-color: var(--ink); }

  [data-theme="dark"] .qr-container { background: var(--surface2); border-color: var(--border); }
  [data-theme="dark"] .qr-timer { background: var(--surface); border-color: var(--border); color: var(--ink3); }

  [data-theme="dark"] .age-display { background: var(--surface2); border-color: var(--border); }

  [data-theme="dark"] .avatar-upload-circle { background: var(--surface2); border-color: var(--border); }

  [data-theme="dark"] .page-title { color: var(--ink); }
  [data-theme="dark"] .section-title { color: var(--ink); }
  [data-theme="dark"] .modal-title { color: var(--ink); }
  [data-theme="dark"] .settings-card-title { color: var(--ink); }
  [data-theme="dark"] .auth-title { color: var(--ink); }

  [data-theme="dark"] .divider { border-top-color: var(--border); }

  /* Dark mode transition */
  body, .nav, .card, .modal, .auth-card, .btn, .form-input,
  .session-card, .accordion-month, .settings-card, .history-item,
  .profile-popup, .stat-card, .filter-chip, .badge {
    transition: background 0.2s ease, border-color 0.2s ease, color 0.15s ease;
  }
`;

// ─── COMPONENTS ───────────────────────────────────────────────────────────────
// Logo adapts to light/dark mode automatically
function Logo({ size = 32 }) {
  const { dark } = useTheme();
  // Light mode: deep ink bg with white icon
  // Dark mode: subtle surface bg with bright accent icon
  const bg       = dark ? "#2A2A27" : "#1A1A17";
  const stroke1  = dark ? "#4D8EF0" : "#ffffff";   // primary icon color
  const stroke2  = dark ? "#34C98A" : "#86efac";   // accent checkmark
  const opacity  = dark ? "1" : "0.92";

  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="logoAccent" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={dark ? "#4D8EF0" : "#60a5fa"} />
          <stop offset="100%" stopColor={dark ? "#34C98A" : "#34d399"} />
        </linearGradient>
      </defs>

      {/* Background tile */}
      <rect width="40" height="40" rx="10" fill={bg} />

      {/* Subtle inner glow on dark */}
      {dark && <rect width="40" height="40" rx="10" fill="url(#logoAccent)" fillOpacity="0.07" />}

      {/* Clipboard body */}
      <rect x="10" y="13" width="20" height="19" rx="2.5" stroke={stroke1} strokeOpacity={opacity} strokeWidth="1.6" fill="none"/>

      {/* Clipboard top clip */}
      <rect x="15" y="10" width="10" height="5" rx="2" fill={bg} stroke={stroke1} strokeOpacity={opacity} strokeWidth="1.6"/>
      <rect x="17.5" y="11.5" width="5" height="2" rx="1" fill={stroke1} fillOpacity="0.5"/>

      {/* Text lines */}
      <line x1="14" y1="20" x2="22" y2="20" stroke={stroke1} strokeOpacity="0.5" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="14" y1="24" x2="26" y2="24" stroke={stroke1} strokeOpacity="0.5" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="14" y1="28" x2="20" y2="28" stroke={stroke1} strokeOpacity="0.5" strokeWidth="1.4" strokeLinecap="round"/>

      {/* Checkmark badge — bottom right */}
      <circle cx="28" cy="28" r="6" fill={bg}/>
      <circle cx="28" cy="28" r="5.2" fill="url(#logoAccent)"/>
      <path d="M25.5 28l1.8 1.8 3.2-3.2" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
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
  const { dark, toggle: toggleTheme } = useTheme();
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
          <button onClick={toggleTheme} title={dark ? "Switch to light mode" : "Switch to dark mode"} style={{
            width:34, height:34, borderRadius:"var(--radius-sm)",
            background:"var(--surface2)", border:"1px solid var(--border)",
            display:"flex", alignItems:"center", justifyContent:"center",
            cursor:"pointer", fontSize:"1rem", transition:"all 0.15s",
            flexShrink:0,
          }}>
            {dark ? "☀️" : "🌙"}
          </button>
          {user && (
            <div className="profile-popup-wrap" ref={wrapRef}>
              <button className="profile-pill-btn" onClick={() => setOpen(o => !o)}>
                <AvatarCircle name={user.name} picture={user.profilePicture} size={30} />
                <div style={{ textAlign:"left", minWidth:0, overflow:"hidden", flex:1 }}>
                  <div className="user-name">{user.name}</div>
                  <div className="user-role">{user.role}</div>
                </div>
                <span style={{ color: "var(--muted)", fontSize: "0.65rem", marginLeft: 2 }}>▾</span>
              </button>

              {open && (
                <div className="profile-popup">
                  {/* Header */}
                  <div className="profile-popup-head">
                    <AvatarCircle name={user.name} picture={user.profilePicture} size={44} radius="10px" fontSize="1.1rem" />
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
                      <span>⚙</span>
                      {user.role === "admin" ? "Settings" : user.role === "teacher" ? "Settings" : "Edit Profile"}
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

// ─── VERIFY EMAIL PAGE ────────────────────────────────────────────────────────
function VerifyEmailPage({ token }) {
  const [status, setStatus] = useState("verifying"); // verifying | success | error
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const verify = async () => {
      try {
        await api.post("/security/verify-email", { token });
        setStatus("success");
      } catch(err) {
        setMsg(err.message);
        setStatus("error");
      }
    };
    if (token) verify();
    else { setStatus("error"); setMsg("No verification token provided."); }
  }, [token]);

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign:"center" }}>
        <div className="auth-logo-wrap" style={{ margin:"0 auto 20px" }}><Logo size={36} /></div>
        {status === "verifying" && (
          <>
            <Spinner size={32} style={{ margin:"0 auto 16px" }} />
            <p style={{ color:"var(--ink3)", marginBottom:16 }}>Verifying your email…</p>
            <div style={{ background:"var(--amber-lt)", border:"1px solid #f0d090", borderRadius:"var(--radius-sm)", padding:"11px 13px", fontSize:"0.78rem", color:"var(--amber)", textAlign:"left", lineHeight:1.6 }}>
              <strong>⚠️ Seeing a browser security warning?</strong><br/>
              Click <strong>Advanced</strong> → <strong>Proceed to shs-attendqr.vercel.app</strong> to continue.
            </div>
          </>
        )}
        {status === "success" && (
          <>
            <div style={{ fontSize:"3rem", marginBottom:14 }}>✅</div>
            <h2 className="auth-title">Email Verified!</h2>
            <p style={{ color:"var(--ink3)", marginBottom:22, fontSize:"0.88rem" }}>Your email has been verified successfully. You can now sign in.</p>
            <a href="/" className="btn btn-primary btn-lg" style={{ display:"inline-flex" }}>Go to Sign In</a>
            <p style={{ marginTop:14, fontSize:"0.75rem", color:"var(--muted)" }}>⚠️ If your browser showed a warning before this page, that is normal — click <strong>Advanced → Proceed</strong> to continue.</p>
          </>
        )}
        {status === "error" && (
          <>
            <div style={{ fontSize:"3rem", marginBottom:14 }}>❌</div>
            <h2 className="auth-title" style={{ color:"var(--red)" }}>Verification Failed</h2>
            <p style={{ color:"var(--ink3)", marginBottom:16, fontSize:"0.88rem" }}>{msg || "The link is invalid or has expired."}</p>
            <p style={{ fontSize:"0.78rem", color:"var(--muted)", marginBottom:20, background:"var(--amber-lt)", border:"1px solid #f0d090", borderRadius:"var(--radius-sm)", padding:"10px 12px" }}>
              💡 If your browser showed a <strong>privacy warning</strong> when clicking the link, go back to the email, click the link again, then choose <strong>Advanced → Proceed to site</strong>.
            </p>
            <a href="/" className="btn btn-ghost btn-lg" style={{ display:"inline-flex" }}>← Back to Sign In</a>
          </>
        )}
      </div>
    </div>
  );
}

// ─── EMAIL VERIFICATION BANNER ─────────────────────────────────────────────────
function EmailVerificationBanner() {
  const { user } = useAuth();
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!user || user.isVerified) return null;

  const handleResend = async () => {
    setLoading(true);
    try {
      await api.post("/security/send-verification");
      setSent(true);
    } catch(e) { /* silent */ }
    finally { setLoading(false); }
  };

  return (
    <div style={{ background:"var(--amber-lt)", borderBottom:"1px solid #f0d090", padding:"10px 0" }}>
      <div className="container" style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:9, fontSize:"0.84rem", color:"var(--amber)" }}>
          <span>⚠️</span>
          <span><strong>Please verify your email address</strong> — check your inbox for a verification link.</span>
        </div>
        {!sent
          ? <button className="btn btn-sm" onClick={handleResend} disabled={loading} style={{ background:"var(--amber)", color:"#fff", border:"none", flexShrink:0 }}>
              {loading ? <Spinner size={13} /> : "Resend email"}
            </button>
          : <span style={{ fontSize:"0.82rem", color:"var(--green)", fontWeight:600 }}>✓ Sent! Check your inbox.</span>
        }
      </div>
    </div>
  );
}

// ─── LOGIN HISTORY SECTION ─────────────────────────────────────────────────────
function LoginHistorySection() {
  const [history, setHistory]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [open, setOpen]         = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const data = await api.get("/security/login-history");
      setHistory(data.history || []);
      setLastRefresh(new Date());
    } catch(e) {
      setError(e.message || "Failed to load login history.");
    } finally {
      setLoading(false);
    }
  };

  // Auto-load when opened
  const handleToggle = () => {
    if (!open) { setOpen(true); load(); }
    else setOpen(false);
  };

  // Auto-refresh every 30s while open
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => load(true), 30000);
    return () => clearInterval(id);
  }, [open]);

  const getBrowserIcon = (browser = "") => {
    const b = browser.toLowerCase();
    if (b.includes("chrome"))   return "🟢";
    if (b.includes("firefox"))  return "🦊";
    if (b.includes("safari"))   return "🧭";
    if (b.includes("edge"))     return "🔵";
    if (b.includes("opera"))    return "🔴";
    if (b.includes("brave"))    return "🦁";
    if (b.includes("samsung"))  return "📱";
    if (b.includes("explorer")) return "💀";
    return "🌐";
  };

  const getDeviceIcon = (device = "") => {
    if (device === "mobile")  return "📱";
    if (device === "tablet")  return "📲";
    return "💻";
  };

  const formatRelative = (dt) => {
    const diff = Date.now() - new Date(dt);
    const m = Math.floor(diff / 60000);
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (m < 1)   return "Just now";
    if (m < 60)  return `${m}m ago`;
    if (h < 24)  return `${h}h ago`;
    if (d < 7)   return `${d}d ago`;
    return new Date(dt).toLocaleDateString("en-PH", { month:"short", day:"numeric", year:"numeric", timeZone:"Asia/Manila" });
  };

  const formatTime = (dt) => new Date(dt).toLocaleTimeString("en-PH", {
    hour:"2-digit", minute:"2-digit", second:"2-digit", timeZone:"Asia/Manila",
  });

  const formatFullDate = (dt) => new Date(dt).toLocaleDateString("en-PH", {
    weekday:"short", month:"short", day:"numeric", year:"numeric", timeZone:"Asia/Manila",
  });

  return (
    <div className="settings-card">
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <div className="settings-card-title">Login Activity</div>
          <div className="settings-card-sub" style={{ marginBottom:0 }}>Recent sign-in history for your account</div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {open && (
            <button className="btn btn-ghost btn-sm" onClick={() => load()} disabled={loading} title="Refresh">
              <span style={{ display:"inline-block", animation: loading ? "spin 1s linear infinite" : "none" }}>↻</span>
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={handleToggle}>
            {open ? "Hide" : "View History"}
          </button>
        </div>
      </div>

      {open && (
        <div style={{ marginTop:18 }}>
          {/* Error state */}
          {error && (
            <div style={{ padding:"12px 14px", background:"var(--red-lt)", border:"1px solid var(--red)", borderRadius:"var(--radius-sm)", color:"var(--red)", fontSize:"0.83rem", marginBottom:12, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span>⚠ {error}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => load()} style={{ color:"var(--red)" }}>Retry</button>
            </div>
          )}

          {/* Loading state */}
          {loading ? (
            <div style={{ display:"flex", justifyContent:"center", padding:"28px 0" }}><Spinner size={22} /></div>
          ) : history.length === 0 && !error ? (
            <div style={{ textAlign:"center", padding:"24px 0", color:"var(--muted)" }}>
              <div style={{ fontSize:"2rem", marginBottom:8 }}>🔐</div>
              <div style={{ fontSize:"0.85rem", fontWeight:600, color:"var(--ink3)", marginBottom:4 }}>No login history yet</div>
              <div style={{ fontSize:"0.78rem" }}>Your next login will appear here automatically.</div>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {history.map((h, i) => (
                <div key={i} style={{
                  borderRadius:"var(--radius-sm)",
                  border:`1px solid ${h.success ? "var(--border)" : "#f5c6c2"}`,
                  background: h.success ? "var(--surface2)" : "var(--red-lt)",
                  overflow:"hidden",
                }}>
                  <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px" }}>
                    {/* Status dot */}
                    <div style={{
                      width:8, height:8, borderRadius:"50%", flexShrink:0,
                      background: h.success ? "var(--green)" : "var(--red)",
                      boxShadow: h.success ? "0 0 0 3px var(--green-lt)" : "0 0 0 3px var(--red-lt)",
                    }}/>

                    {/* Icons */}
                    <div style={{ fontSize:"1rem", flexShrink:0, lineHeight:1 }}>
                      {getBrowserIcon(h.browser)}{getDeviceIcon(h.device)}
                    </div>

                    {/* Info */}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                        <span style={{ fontWeight:700, fontSize:"0.87rem", color: h.success ? "var(--ink)" : "var(--red)" }}>
                          {h.success ? "Signed in" : "Failed attempt"}
                        </span>
                        {h.browser && h.browser !== "Unknown" && (
                          <span style={{ fontSize:"0.72rem", background:"var(--surface3)", border:"1px solid var(--border)", borderRadius:20, padding:"1px 8px", color:"var(--ink3)", fontWeight:600 }}>
                            {h.browser}{h.browserVersion ? ` ${h.browserVersion}` : ""}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize:"0.75rem", color:"var(--muted)", marginTop:3, display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
                        {h.os && h.os !== "Unknown" && (
                          <span>🖥 {h.os}</span>
                        )}
                        {h.ip && h.ip !== "Unknown" && (
                          <span style={{ fontFamily:"var(--font-mono)", fontSize:"0.71rem", background:"var(--surface3)", padding:"1px 6px", borderRadius:4 }}>
                            {h.ip}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Timestamp */}
                    <div style={{ textAlign:"right", flexShrink:0 }}>
                      <div style={{ fontSize:"0.78rem", fontWeight:600, color:"var(--ink3)" }}>{formatRelative(h.at)}</div>
                      <div style={{ fontSize:"0.68rem", color:"var(--muted)", marginTop:2 }}>{formatFullDate(h.at)}</div>
                      <div style={{ fontSize:"0.68rem", color:"var(--muted)", fontFamily:"var(--font-mono)" }}>{formatTime(h.at)}</div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Footer */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 4px", borderTop:"1px solid var(--border)", marginTop:4 }}>
                <div style={{ display:"flex", gap:14 }}>
                  <span style={{ fontSize:"0.72rem", color:"var(--muted)", display:"flex", alignItems:"center", gap:5 }}>
                    <span style={{ width:7, height:7, borderRadius:"50%", background:"var(--green)", display:"inline-block" }}/>
                    Signed in
                  </span>
                  <span style={{ fontSize:"0.72rem", color:"var(--muted)", display:"flex", alignItems:"center", gap:5 }}>
                    <span style={{ width:7, height:7, borderRadius:"50%", background:"var(--red)", display:"inline-block" }}/>
                    Failed
                  </span>
                </div>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:2 }}>
                  <span style={{ fontSize:"0.72rem", color:"var(--muted)" }}>{history.length} event{history.length !== 1 ? "s" : ""}</span>
                  {lastRefresh && (
                    <span style={{ fontSize:"0.68rem", color:"var(--muted)" }}>
                      Updated {formatRelative(lastRefresh)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
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
  const [twoFAPendingLocal, setTwoFAPendingLocal] = useState(null);
  const [deviceBlocked, setDeviceBlocked] = useState(false);
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
      if (mode === "login") {
        const result = await login(form.email, form.password);
        if (result?.requires2FA) {
          setTwoFAPendingLocal({ tempToken: result.tempToken });
          return;
        }
        if (result?.deviceBlocked) {
          setDeviceBlocked(true);
          return;
        }
        onSuccess({ suspicious: result?.suspicious, sessionId: result?.sessionId });
        if (result?.user?.mustChangePassword) {
          // Will be shown in settings after redirect
        }
      }
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

  if (deviceBlocked) {
    return <DeviceBlockedScreen email={form.email} onBack={() => setDeviceBlocked(false)} />;
  }

  if (twoFAPendingLocal) {
    return (
      <TwoFAVerifyScreen
        tempToken={twoFAPendingLocal.tempToken}
        onSuccess={(token) => { localStorage.setItem("token", token); window.location.reload(); }}
      />
    );
  }

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

// ─── IDLE TIMEOUT HOOK ────────────────────────────────────────────────────────
function useIdleTimeout(onTimeout, minutes = 30) {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    const ms = minutes * 60 * 1000;
    let timer = setTimeout(onTimeout, ms);
    const reset = () => { clearTimeout(timer); timer = setTimeout(onTimeout, ms); };
    const events = ["mousemove","keydown","click","scroll","touchstart"];
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));
    return () => { clearTimeout(timer); events.forEach(e => window.removeEventListener(e, reset)); };
  }, [user, minutes]);
}

// ─── PASSWORD STRENGTH ────────────────────────────────────────────────────────
function getPasswordStrength(pwd) {
  if (!pwd) return { score: 0, label: "", color: "" };
  let score = 0;
  if (pwd.length >= 8)  score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  if (score <= 1) return { score, label: "Very Weak", color: "var(--red)" };
  if (score === 2) return { score, label: "Weak",      color: "#f97316" };
  if (score === 3) return { score, label: "Fair",      color: "var(--amber)" };
  if (score === 4) return { score, label: "Strong",    color: "#84cc16" };
  return { score, label: "Very Strong", color: "var(--green)" };
}

function PasswordStrengthBar({ password }) {
  const { score, label, color } = getPasswordStrength(password);
  if (!password) return null;
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display:"flex", gap:4, marginBottom:4 }}>
        {[1,2,3,4,5].map(i => (
          <div key={i} style={{ flex:1, height:4, borderRadius:2, background: i <= score ? color : "var(--border)", transition:"background 0.2s" }} />
        ))}
      </div>
      <div style={{ fontSize:"0.72rem", color, fontWeight:600 }}>{label}</div>
    </div>
  );
}

// ─── DEVICE FINGERPRINT ───────────────────────────────────────────────────────
// Generates a stable browser/device fingerprint using available signals
const getDeviceFingerprint = () => {
  const nav = window.navigator;
  const screen = window.screen;
  const components = [
    nav.userAgent,
    nav.language,
    nav.platform,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    nav.hardwareConcurrency || "",
    nav.deviceMemory || "",
    Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    nav.cookieEnabled,
    typeof nav.getBattery !== "undefined",
  ].join("|");
  // Simple hash
  let hash = 0;
  for (let i = 0; i < components.length; i++) {
    const char = components.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36) + components.length.toString(36);
};

// Store fingerprint once per session
const DEVICE_FP = getDeviceFingerprint();

// ─── GRADE / SECTION FILTER WIDGET ───────────────────────────────────────────
function GradeFilterWidget({ allowedGrades, allowedSections, onChange }) {
  const [gradeInput, setGradeInput]     = useState(allowedGrades.join(", "));
  const [sectionInput, setSectionInput] = useState(allowedSections.join(", "));

  // Parse comma-separated input into a clean array
  const parseList = (str) =>
    str.split(",").map(s => s.trim()).filter(Boolean);

  const handleGradeChange = (val) => {
    setGradeInput(val);
    onChange({ allowedGrades: parseList(val), allowedSections });
  };

  const handleSectionChange = (val) => {
    setSectionInput(val);
    onChange({ allowedGrades, allowedSections: parseList(val) });
  };

  const clearAll = () => {
    setGradeInput("");
    setSectionInput("");
    onChange({ allowedGrades: [], allowedSections: [] });
  };

  const isFiltered = allowedGrades.length > 0 || allowedSections.length > 0;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

      {/* Status banner */}
      <div style={{
        padding:"10px 14px", borderRadius:"var(--radius-sm)",
        background: isFiltered ? "var(--accent-lt)" : "var(--surface2)",
        border: `1px solid ${isFiltered ? "var(--accent)" : "var(--border)"}`,
        display:"flex", alignItems:"center", gap:10,
      }}>
        <span style={{ fontSize:"1.1rem" }}>{isFiltered ? "🔒" : "🌐"}</span>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:"0.82rem", fontWeight:700, color: isFiltered ? "var(--accent-dk)" : "var(--ink)" }}>
            {isFiltered ? "Restricted — only matching students can scan" : "Open to all students"}
          </div>
          {isFiltered && (
            <div style={{ fontSize:"0.73rem", color:"var(--accent-dk)", marginTop:2 }}>
              {allowedGrades.length > 0 && <span>Grades: {allowedGrades.join(", ")}</span>}
              {allowedGrades.length > 0 && allowedSections.length > 0 && <span> · </span>}
              {allowedSections.length > 0 && <span>Sections: {allowedSections.join(", ")}</span>}
            </div>
          )}
        </div>
        {isFiltered && (
          <button type="button" onClick={clearAll} style={{ fontSize:"0.72rem", color:"var(--red)", background:"none", border:"none", cursor:"pointer", fontWeight:600, flexShrink:0 }}>
            Clear
          </button>
        )}
      </div>

      {/* Grade input */}
      <div className="form-group" style={{ marginBottom:0 }}>
        <label className="form-label" style={{ marginBottom:5 }}>
          Grade Level
          <span style={{ color:"var(--muted)", fontWeight:400, textTransform:"none", letterSpacing:0 }}> — leave blank for all</span>
        </label>
        <input
          className="form-input"
          placeholder='e.g. Grade 12  or  Grade 11, Grade 12'
          value={gradeInput}
          onChange={e => handleGradeChange(e.target.value)}
        />
        <p className="form-hint">Separate multiple grades with commas. Must match exactly what students entered in their profile.</p>
      </div>

      {/* Section input */}
      <div className="form-group" style={{ marginBottom:0 }}>
        <label className="form-label" style={{ marginBottom:5 }}>
          Section
          <span style={{ color:"var(--muted)", fontWeight:400, textTransform:"none", letterSpacing:0 }}> — leave blank for all</span>
        </label>
        <input
          className="form-input"
          placeholder='e.g. Nickel  or  Nickel, Gold'
          value={sectionInput}
          onChange={e => handleSectionChange(e.target.value)}
        />
        <p className="form-hint">Separate multiple sections with commas. Must match exactly what students entered in their profile.</p>
      </div>
    </div>
  );
}

// ─── EDIT SESSION MODAL ───────────────────────────────────────────────────────
function EditSessionModal({ session, onClose, onSaved }) {
  useEscKey(onClose);
  const toLocalDT = (d) => {
    if (!d) return "";
    const dt = new Date(d);
    const off = dt.getTimezoneOffset();
    return new Date(dt.getTime() - off * 60000).toISOString().slice(0, 16);
  };

  const [form, setForm] = useState({
    subject:          session.subject || "",
    room:             session.room || "",
    description:      session.description || "",
    lateAfterMinutes: session.lateAfterMinutes ?? 15,
    allowedGrades:    session.allowedGrades || [],
    allowedSections:  session.allowedSections || [],
    scheduledStart:   toLocalDT(session.scheduledStart),
    scheduledEnd:     toLocalDT(session.scheduledEnd),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const handleSave = async () => {
    setError(""); setLoading(true);
    try {
      const data = await api.patch(`/sessions/${session._id}`, form);
      onSaved(data.session);
      onClose();
    } catch(err) {
      if (err.message === "Failed to fetch") {
        setError("Cannot reach the server. Please check your connection and try again.");
      } else {
        setError(err.message || "Failed to save changes. Please try again.");
      }
    } finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 460 }}>
        {/* Header */}
        <div style={{ position:"relative", marginBottom:20 }}>
          <button onClick={onClose} style={{ position:"absolute", top:0, right:0, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:"var(--radius-xs)", width:28, height:28, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", fontSize:"0.78rem", color:"var(--ink3)" }}>✕</button>
          <h2 className="modal-title">Edit Session</h2>
          <p className="modal-sub">Update settings for <strong>{session.subject}</strong></p>
        </div>

        <Alert message={error} />

        {/* Subject */}
        <div className="form-group">
          <label className="form-label">Subject</label>
          <input className="form-input" value={form.subject}
            onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
            placeholder="e.g. Computer Science 101" />
        </div>

        {/* Room */}
        <div className="form-group">
          <label className="form-label">Room</label>
          <input className="form-input" value={form.room}
            onChange={e => setForm(f => ({ ...f, room: e.target.value }))}
            placeholder="e.g. Room 201" />
        </div>

        {/* Late threshold */}
        <div className="form-group">
          <label className="form-label">
            Late After&nbsp;
            <span style={{ color:"var(--muted)", fontWeight:400, textTransform:"none", letterSpacing:0 }}>
              (minutes after session starts)
            </span>
          </label>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {[5, 10, 15, 20, 30].map(m => (
              <button key={m} type="button"
                onClick={() => setForm(f => ({ ...f, lateAfterMinutes: m }))}
                style={{
                  padding:"8px 18px", borderRadius:"var(--radius-sm)", cursor:"pointer",
                  fontSize:"0.84rem", fontWeight:600, transition:"all 0.13s", border:"1px solid",
                  borderColor: form.lateAfterMinutes === m ? "var(--accent)" : "var(--border)",
                  background:  form.lateAfterMinutes === m ? "var(--accent-lt)" : "var(--surface2)",
                  color:       form.lateAfterMinutes === m ? "var(--accent-dk)" : "var(--ink3)",
                }}>
                {m} min
              </button>
            ))}
          </div>
          <p className="form-hint" style={{ marginTop:8 }}>
            Students scanning after <strong>{form.lateAfterMinutes} minutes</strong> from Start will be marked&nbsp;
            <span style={{ color:"var(--amber)", fontWeight:700 }}>Late</span>.
          </p>
        </div>

        {/* Student Filter */}
        <div className="form-group">
          <label className="form-label">
            Student Filter
            <span style={{ color:"var(--muted)", fontWeight:400, textTransform:"none", letterSpacing:0 }}> (restrict by grade/section)</span>
          </label>
          <GradeFilterWidget
            allowedGrades={form.allowedGrades}
            allowedSections={form.allowedSections}
            onChange={({ allowedGrades, allowedSections }) => setForm(f => ({ ...f, allowedGrades, allowedSections }))}
          />
        </div>

        {/* Scheduled dates */}
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Scheduled Start</label>
            <input className="form-input" type="datetime-local" value={form.scheduledStart}
              onChange={e => setForm(f => ({ ...f, scheduledStart: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Scheduled End</label>
            <input className="form-input" type="datetime-local" value={form.scheduledEnd}
              onChange={e => setForm(f => ({ ...f, scheduledEnd: e.target.value }))} />
          </div>
        </div>

        {/* Description */}
        <div className="form-group">
          <label className="form-label">Description</label>
          <input className="form-input" value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Optional notes" />
        </div>

        {/* Current grace period indicator */}
        <div style={{ background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:"var(--radius-sm)", padding:"11px 14px", marginBottom:20, display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:"1.1rem" }}>⏱</span>
          <div>
            <div style={{ fontSize:"0.8rem", fontWeight:600, color:"var(--ink)" }}>
              Current grace period: <span style={{ color:"var(--accent)" }}>{session.lateAfterMinutes ?? 15} min</span>
            </div>
            <div style={{ fontSize:"0.73rem", color:"var(--muted)", marginTop:2 }}>
              Changing this only affects future check-ins, not existing records.
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display:"flex", gap:10 }}>
          <button className="btn btn-ghost" style={{ flex:1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex:2 }} onClick={handleSave} disabled={loading}>
            {loading ? <Spinner size={16} /> : "💾 Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CREATE SESSION MODAL ─────────────────────────────────────────────────────
function CreateSessionModal({ onClose, onCreated }) {
  const defaultEnd = getDefaultEndDate();
  const [form, setForm] = useState({ subject: "", room: "", description: "", expiresAt: defaultEnd, lateAfterMinutes: 15, allowedGrades: [], allowedSections: [], scheduledStart: "", scheduledEnd: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEscKey(onClose);

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
        <div style={{ position:"relative", marginBottom:20 }}>
          <button onClick={onClose} style={{ position:"absolute", top:0, right:0, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:"var(--radius-xs)", width:28, height:28, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", fontSize:"0.78rem", color:"var(--ink3)", lineHeight:1 }}>✕</button>
          <h2 className="modal-title">New Session</h2>
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
            <div className="form-group">
              <label className="form-label">Session Expiry</label>
              <input className="form-input" type="datetime-local" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} />
              <p className="form-hint">Default: 210 days from now</p>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Scheduled Start</label>
              <input className="form-input" type="datetime-local" value={form.scheduledStart} onChange={(e) => setForm((f) => ({ ...f, scheduledStart: e.target.value }))} />
              <p className="form-hint">When you plan to start this session</p>
            </div>
            <div className="form-group">
              <label className="form-label">Scheduled End</label>
              <input className="form-input" type="datetime-local" value={form.scheduledEnd} onChange={(e) => setForm((f) => ({ ...f, scheduledEnd: e.target.value }))} />
              <p className="form-hint">When you plan to end this session</p>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Late After <span style={{ color:"var(--muted)", fontWeight:400, textTransform:"none", letterSpacing:0 }}>(minutes after session starts)</span></label>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {[5,10,15,20,30].map(m => (
                <button key={m} type="button" onClick={() => setForm(f => ({ ...f, lateAfterMinutes: m }))}
                  style={{
                    padding:"7px 16px", borderRadius:"var(--radius-sm)", border:"1px solid",
                    fontSize:"0.82rem", fontWeight:600, cursor:"pointer", transition:"all 0.13s",
                    borderColor: form.lateAfterMinutes === m ? "var(--accent)" : "var(--border)",
                    background: form.lateAfterMinutes === m ? "var(--accent-lt)" : "var(--surface2)",
                    color: form.lateAfterMinutes === m ? "var(--accent-dk)" : "var(--ink3)",
                  }}>
                  {m} min
                </button>
              ))}
            </div>
            <p className="form-hint" style={{ marginTop:6 }}>
              Students who scan after <strong>{form.lateAfterMinutes} minutes</strong> from when you press Start will be marked <span style={{ color:"var(--amber)", fontWeight:600 }}>Late</span>.
            </p>
          </div>
          <div className="form-group">
            <label className="form-label">
              Student Filter
              <span style={{ color:"var(--muted)", fontWeight:400, textTransform:"none", letterSpacing:0 }}> (optional — restrict by grade/section)</span>
            </label>
            <GradeFilterWidget
              allowedGrades={form.allowedGrades}
              allowedSections={form.allowedSections}
              onChange={({ allowedGrades, allowedSections }) => setForm(f => ({ ...f, allowedGrades, allowedSections }))}
            />
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

  useEscKey(onClose);

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

  const isUrgent = countdown <= 5;
  const progressPct = Math.round((countdown / 20) * 100);

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "var(--surface)", borderRadius: 18, border: "1px solid var(--border)",
        boxShadow: "var(--shadow-xl)", width: "100%", maxWidth: 400,
        display: "flex", flexDirection: "column",
        maxHeight: "min(92vh, 680px)", overflow: "hidden",
      }}>

        {/* ── Fixed header ── */}
        <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0, position: "relative" }}>
          <button onClick={onClose} style={{
            position: "absolute", top: 14, right: 16,
            background: "var(--surface2)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-xs)", width: 28, height: 28,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", fontSize: "0.78rem", color: "var(--ink3)",
          }}>✕</button>
          <h2 className="modal-title" style={{ paddingRight: 36 }}>{session.subject}</h2>
          <p className="modal-sub">{session.room ? `📍 ${session.room}` : "No room"} · Active since {formatTime(session.startTime)}</p>
        </div>

        {/* ── Scrollable QR area ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          {session.qrDataUrl ? (
            <img src={session.qrDataUrl} alt="QR Code" style={{ width: "100%", maxWidth: 300, borderRadius: 10, display: "block" }} />
          ) : (
            <div className="loading-page"><Spinner size={32} /></div>
          )}

          {/* ── Countdown inline bar ── */}
          <div style={{
            width: "100%", maxWidth: 300,
            background: isUrgent ? "var(--red-lt)" : "var(--green-lt)",
            border: `1px solid ${isUrgent ? "#f5c6c2" : "#b7e4d5"}`,
            borderRadius: "var(--radius-sm)", padding: "10px 16px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div>
              <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>QR refreshes in</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "1.5rem", fontWeight: 700, color: isUrgent ? "var(--red)" : "var(--green)", lineHeight: 1 }}>
                {String(countdown).padStart(2, "0")}s
              </div>
            </div>
            <svg width="44" height="44" style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
              <circle cx="22" cy="22" r="18" fill="none" stroke={isUrgent ? "#f5c6c2" : "#b7e4d5"} strokeWidth="3" />
              <circle cx="22" cy="22" r="18" fill="none"
                stroke={isUrgent ? "var(--red)" : "var(--green)"}
                strokeWidth="3"
                strokeDasharray={`${2 * Math.PI * 18}`}
                strokeDashoffset={`${2 * Math.PI * 18 * (1 - progressPct / 100)}`}
                strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 0.5s, stroke 0.3s" }}
              />
            </svg>
          </div>
        </div>

        {/* ── Fixed footer with action buttons ── */}
        <div style={{
          padding: "14px 20px", borderTop: "1px solid var(--border)",
          display: "flex", gap: 10, flexShrink: 0,
          background: "var(--surface)",
        }}>
          <button className="btn btn-ghost" onClick={handleRefresh} disabled={refreshing} style={{ flex: 1 }}>
            {refreshing ? <Spinner size={15} /> : "🔄 Refresh QR"}
          </button>
          <button className="btn btn-danger" onClick={handleStop} disabled={stopping} style={{ flex: 1 }}>
            {stopping ? <Spinner size={15} /> : "⏹ Stop Session"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SESSION END DATE LABEL ───────────────────────────────────────────────────
function SessionEndLabel({ expiresAt }) {
  if (!expiresAt) return null;
  const end      = new Date(expiresAt);
  const now      = new Date();
  const diffDays = Math.ceil((end - now) / (1000 * 60 * 60 * 24));

  if (diffDays < 0)
    return <span className="session-meta-chip chip-expired">🔒 Expired</span>;

  if (diffDays <= 14)
    return (
      <span className="session-meta-chip" style={{ borderColor:"var(--amber)", color:"var(--amber)", background:"var(--amber-lt)" }}>
        <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"/></svg>
        Expires in {diffDays}d
      </span>
    );

  return (
    <span className="session-meta-chip">
      <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5zM1 4v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4H1z"/></svg>
      Until {end.toLocaleDateString("en-PH", { month:"short", day:"numeric", year:"numeric" })}
    </span>
  );
}

function isExpired(session) {
  return session.expiresAt && new Date() > new Date(session.expiresAt);
}

// ─── STUDENT INFO MODAL ──────────────────────────────────────────────────────
function StudentInfoModal({ student, onClose }) {
  useEscKey(onClose);
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
        <AvatarCircle name={student.name} picture={student.profilePicture} size={68} radius="16px" fontSize="1.7rem" style={{ margin:"0 auto 16px" }} />
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
                                      <div className="avatar" style={{ background: getAvatarColor(a.student?.name || "").bg, borderRadius: 7, flexShrink: 0 }}>
                                        {a.student?.profilePicture
                                          ? <img src={a.student.profilePicture} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", display:"block", borderRadius:7 }} />
                                          : <span style={{ color:"#fff", fontSize:"0.68rem", fontWeight:700 }}>{a.student?.name?.[0]?.toUpperCase()}</span>
                                        }
                                      </div>
                                      <span style={{ borderBottom: onStudentClick ? "1px dashed var(--border2)" : "none" }}>{a.student?.name}</span>
                                    </td>
                                    <td>{a.student?.studentId || "—"}</td>
                                    <td>{a.student?.grade || <span style={{ color: "var(--muted)" }}>—</span>}</td>
                                    <td>{a.student?.section || <span style={{ color: "var(--muted)" }}>—</span>}</td>
                                    <td><span className={`badge badge-${a.status}`}>{a.status === "present" ? "✓ Present" : status === "late" ? "⏰ Late" : status === "absent" ? "❌ Absent" : "📝 Excused"}</span></td>
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

// ─── ZIP HELPER (pure JS, no library needed) ──────────────────────────────────
// Minimal ZIP builder using DEFLATE-store (no compression, maximum compat)
function buildZip(files) {
  // files = [{ name, content }] where content is a string
  const encoder = new TextEncoder();
  const localHeaders = [];
  const centralDir = [];
  let offset = 0;

  const crc32 = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c;
    }
    return (buf) => {
      let crc = 0xffffffff;
      for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
      return (crc ^ 0xffffffff) >>> 0;
    };
  })();

  const u16 = (n) => [n & 0xff, (n >> 8) & 0xff];
  const u32 = (n) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff];

  for (const { name, content } of files) {
    const data = encoder.encode(content);
    const nameBytes = encoder.encode(name);
    const crc = crc32(data);
    const size = data.length;

    const local = new Uint8Array([
      0x50,0x4b,0x03,0x04, // local file header sig
      20,0,                 // version needed
      0,0,                  // general flags
      0,0,                  // compression (store)
      0,0,0,0,              // mod time/date
      ...u32(crc),
      ...u32(size),
      ...u32(size),
      ...u16(nameBytes.length),
      0,0,                  // extra field len
      ...nameBytes,
      ...data,
    ]);
    localHeaders.push(local);

    const central = new Uint8Array([
      0x50,0x4b,0x01,0x02, // central dir sig
      20,0,20,0,           // version made/needed
      0,0,0,0,             // flags, compression
      0,0,0,0,             // mod time/date
      ...u32(crc),
      ...u32(size),
      ...u32(size),
      ...u16(nameBytes.length),
      0,0,0,0,0,0,         // extra, comment, disk, attrs
      0,0,0,0,
      ...u32(offset),
      ...nameBytes,
    ]);
    centralDir.push(central);
    offset += local.length;
  }

  const cdSize = centralDir.reduce((s, b) => s + b.length, 0);
  const eocd = new Uint8Array([
    0x50,0x4b,0x05,0x06,
    0,0,0,0,
    ...u16(files.length), ...u16(files.length),
    ...u32(cdSize),
    ...u32(offset),
    0,0,
  ]);

  const total = localHeaders.reduce((s,b)=>s+b.length,0) + cdSize + eocd.length;
  const zip = new Uint8Array(total);
  let pos = 0;
  for (const b of [...localHeaders, ...centralDir, eocd]) { zip.set(b, pos); pos += b.length; }
  return zip;
}

function downloadZip(files, zipName) {
  const zip = buildZip(files);
  const blob = new Blob([zip], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = zipName; a.click();
  URL.revokeObjectURL(url);
}

// ─── EXPORT PICKER ────────────────────────────────────────────────────────────
function ExportPicker({ attendance, session }) {
  const [mode, setMode] = useState(null); // null | "month" | "day"
  const [checked, setChecked] = useState({}); // { [key]: true/false }
  const [zipping, setZipping] = useState(false);

  const byMonth = attendance.reduce((acc, a) => {
    const k = new Date(a.timestamp).toLocaleDateString("en-PH", { year:"numeric", month:"long", timeZone:"Asia/Manila" });
    if (!acc[k]) acc[k] = []; acc[k].push(a); return acc;
  }, {});

  const byDay = attendance.reduce((acc, a) => {
    const k = new Date(a.timestamp).toLocaleDateString("en-PH", { year:"numeric", month:"long", day:"numeric", timeZone:"Asia/Manila" });
    if (!acc[k]) acc[k] = []; acc[k].push(a); return acc;
  }, {});

  const months = Object.keys(byMonth).sort((a,b) => new Date(b) - new Date(a));
  const days   = Object.keys(byDay).sort((a,b) => new Date(b) - new Date(a));
  const keys   = mode === "month" ? months : days;
  const byKey  = mode === "month" ? byMonth : byDay;

  const selectedKeys = Object.keys(checked).filter(k => checked[k]);
  const allChecked   = keys.length > 0 && keys.every(k => checked[k]);

  const toggleAll = () => {
    if (allChecked) setChecked({});
    else setChecked(Object.fromEntries(keys.map(k => [k, true])));
  };

  const toggleKey = (k) => setChecked(p => ({ ...p, [k]: !p[k] }));

  const openMode = (m) => { setMode(m); setChecked({}); };
  const closeModal = () => { setMode(null); setChecked({}); };

  // Download one or multiple keys as styled XLSX files
  const handleDownload = () => {
    if (selectedKeys.length === 0) return;
    setZipping(true);
    // Defer heavy XLSX work so the UI can show the loading state first
    setTimeout(async () => {
    try {
      // Download each selected key sequentially
      for (const key of selectedKeys) {
        const recs = byKey[key];
        if (mode === "month") {
          await exportTeacherByMonth(recs, key, session);
        } else {
          await exportTeacherByDay(recs, key, session);
        }
        // Small delay between downloads so browser doesn't block them
        if (selectedKeys.length > 1) await new Promise(r => setTimeout(r, 400));
      }
      closeModal();
    } catch(e) {
      console.error("Export error:", e);
    } finally {
      setZipping(false);
    }
    }, 0); // end setTimeout
  };

  return (
    <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
      <button className="btn btn-excel btn-sm" onClick={() => setTimeout(() => exportSessionFull(attendance, session), 0)}>⬇ Full XLSX</button>
      <button className="btn btn-excel btn-sm" onClick={() => openMode("month")}>⬇ Monthly</button>
      <button className="btn btn-excel btn-sm" onClick={() => openMode("day")}>⬇ Daily</button>

      {mode && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal" style={{ maxWidth:380 }}>
            {/* Header */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
              <h3 style={{ fontFamily:"var(--font-heading)", fontWeight:800, fontSize:"1.05rem", margin:0 }}>
                {mode === "month" ? "📅 Select Months" : "📅 Select Days"}
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={closeModal}>✕</button>
            </div>
            <p style={{ fontSize:"0.78rem", color:"var(--muted)", marginBottom:14 }}>
              Check one or more to download. Multiple selections download as a ZIP file.
            </p>

            {/* Select all */}
            <div onClick={toggleAll} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", borderRadius:"var(--radius-sm)", background:"var(--surface3)", border:"1px solid var(--border2)", cursor:"pointer", marginBottom:8 }}>
              <div style={{ width:18, height:18, borderRadius:4, border:"2px solid var(--accent)", background: allChecked ? "var(--accent)" : "transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                {allChecked && <span style={{ color:"#fff", fontSize:"0.7rem", fontWeight:800 }}>✓</span>}
              </div>
              <span style={{ fontSize:"0.82rem", fontWeight:700, color:"var(--text)" }}>Select All</span>
              <span style={{ marginLeft:"auto", fontSize:"0.72rem", color:"var(--muted)" }}>{keys.length} {mode === "month" ? "months" : "days"}</span>
            </div>

            {/* List */}
            <div style={{ display:"flex", flexDirection:"column", gap:5, maxHeight:260, overflowY:"auto", marginBottom:16 }}>
              {keys.map(key => {
                const isChecked = !!checked[key];
                return (
                  <div key={key} onClick={() => toggleKey(key)} style={{
                    display:"flex", alignItems:"center", gap:10, padding:"10px 12px",
                    borderRadius:"var(--radius-sm)", cursor:"pointer",
                    border: isChecked ? "1px solid var(--accent)" : "1px solid var(--border)",
                    background: isChecked ? "rgba(124,111,255,0.1)" : "var(--surface2)",
                    transition:"all 0.12s"
                  }}>
                    <div style={{ width:18, height:18, borderRadius:4, border: `2px solid ${isChecked ? "var(--accent)" : "var(--border2)"}`, background: isChecked ? "var(--accent)" : "transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      {isChecked && <span style={{ color:"#fff", fontSize:"0.7rem", fontWeight:800 }}>✓</span>}
                    </div>
                    <span style={{ fontSize:"0.84rem", fontWeight:600, color: isChecked ? "var(--accent-light)" : "var(--text)", flex:1 }}>{key}</span>
                    <span style={{ fontSize:"0.72rem", color:"var(--muted)", flexShrink:0 }}>{byKey[key].length} records</span>
                  </div>
                );
              })}
              {keys.length === 0 && (
                <p style={{ textAlign:"center", color:"var(--muted)", fontSize:"0.82rem", padding:"20px 0" }}>No records found</p>
              )}
            </div>

            {/* Download button */}
            <button
              className="btn btn-primary btn-lg"
              style={{ width:"100%" }}
              disabled={selectedKeys.length === 0 || zipping}
              onClick={handleDownload}
            >
              {zipping ? <Spinner size={16} /> : selectedKeys.length > 1 ? `⬇ Download ${selectedKeys.length} XLSX files` : selectedKeys.length === 1 ? `⬇ Download ${selectedKeys[0]}` : "Select at least one"}
            </button>
          </div>
        </div>
      )}
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
  const [liveCount, setLiveCount]   = useState(0);
  const sseRef = useRef(null);
  const [rosterSession, setRosterSession]   = useState(null);
  const [absenceSession, setAbsenceSession] = useState(null);
  const [editSession, setEditSession]   = useState(null);
  const [sessionTimers, setSessionTimers] = useState({});
  const [showScheduler, setShowScheduler] = useState(false);
  const [showForecast, setShowForecast]   = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false); // sessionId -> elapsed seconds
  const [liveCounters, setLiveCounters]   = useState({}); // sessionId -> live count
  const timerRef = useRef(null);

  const fetchSessions = useCallback(async () => {
    try {
      const data = await api.get("/sessions");
      setSessions(data.sessions);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // Tick session timers every second for active sessions
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setSessionTimers(prev => {
        const next = { ...prev };
        sessions.forEach(s => {
          if (s.isActive && s.activatedAt) {
            next[s._id] = Math.floor((Date.now() - new Date(s.activatedAt).getTime()) / 1000);
          }
        });
        return next;
      });
      // Update live counters from attendance count
      setLiveCounters(prev => {
        const next = { ...prev };
        sessions.forEach(s => {
          if (s.isActive) next[s._id] = s.attendanceCount || prev[s._id] || 0;
        });
        return next;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [sessions]);

  const formatTimer = (secs) => {
    if (!secs && secs !== 0) return "0:00";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
    return `${m}:${String(s).padStart(2,"0")}`;
  };

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

  const handleQuickExport = async (session) => {
    try {
      const data = await api.get(`/sessions/${session._id}`);
      const rows = (data.attendance || []).map(a => ({
        Name: a.student?.name || "", Email: a.student?.email || "",
        "Student ID": a.student?.studentId || "",
        Grade: a.student?.grade || "", Section: a.student?.section || "",
        Status: a.status, Time: new Date(a.timestamp).toLocaleString("en-PH",{timeZone:"Asia/Manila"}),
      }));
      const loadXLSX = () => new Promise(resolve => {
        if (window.XLSX) { resolve(window.XLSX); return; }
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
        s.onload = () => resolve(window.XLSX);
        document.head.appendChild(s);
      });
      const XLSX = await loadXLSX();
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Attendance");
      XLSX.writeFile(wb, `${session.subject}_${new Date().toISOString().split("T")[0]}.xlsx`);
    } catch(e) { alert(e.message); }
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
    setLiveCount(0);
    // Close any existing SSE connection
    if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
    try {
      const data = await api.get(`/sessions/${session._id}`);
      setAttendance(data.attendance);
      // Open SSE stream if session is active
      if (session.isActive) {
        const token = localStorage.getItem("token");
        const es = new EventSource(
          `${(typeof API_BASE !== "undefined" ? API_BASE : "/api")}/attendance/stream/${session._id}?token=${token}`
        );
        es.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === "new_attendance") {
              setAttendance(prev => {
                // Avoid duplicates
                if (prev.some(a => a._id === msg.attendance._id)) return prev;
                setLiveCount(n => n + 1);
                return [msg.attendance, ...prev];
              });
            }
          } catch(err) {}
        };
        es.onerror = () => { es.close(); };
        sseRef.current = es;
      }
    } catch (err) { console.error(err); }
    finally { setLoadingAttendance(false); }
  };

  // Close SSE when leaving detail view
  const closeDetailView = () => {
    if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
    setViewSession(null);
    setAttendance([]);
    setLiveCount(0);
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
              <button className="btn btn-ghost btn-sm detail-back" onClick={closeDetailView}>← Back</button>
              <div className="detail-info">
                <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                  <div className="detail-title">{viewSession.subject}</div>
                  {viewSession.isActive && (
                    <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 10px", borderRadius:20, background:"var(--green-lt)", border:"1px solid var(--green)", fontSize:"0.75rem", fontWeight:700, color:"var(--green)" }}>
                      <span style={{ width:7, height:7, borderRadius:"50%", background:"var(--green)", display:"inline-block", animation:"pulse 1.5s ease-in-out infinite" }}/>
                      LIVE
                    </span>
                  )}
                  {liveCount > 0 && (
                    <span style={{ padding:"3px 10px", borderRadius:20, background:"var(--accent-lt)", border:"1px solid var(--accent)", fontSize:"0.75rem", fontWeight:700, color:"var(--accent)" }}>
                      +{liveCount} new
                    </span>
                  )}
                </div>
                <div className="detail-meta">
                  {viewSession.room && (
                    <span className="session-meta-chip">
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a5 5 0 0 0-5 5c0 3.5 5 9 5 9s5-5.5 5-9a5 5 0 0 0-5-5zm0 6.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg>
                      {viewSession.room}
                    </span>
                  )}
                  <span className="session-meta-chip">
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5zM1 4v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4H1z"/></svg>
                    Created {formatDate(viewSession.createdAt)}
                  </span>
                  {viewSession.scheduledStart && (
                    <span className="session-meta-chip">
                      📅 Scheduled: {new Date(viewSession.scheduledStart).toLocaleString("en-PH", { month:"short", day:"numeric", year:"numeric", hour:"2-digit", minute:"2-digit", timeZone:"Asia/Manila" })}
                    </span>
                  )}
                  {viewSession.scheduledEnd && (
                    <span className="session-meta-chip">
                      🏁 Ends: {new Date(viewSession.scheduledEnd).toLocaleString("en-PH", { month:"short", day:"numeric", year:"numeric", hour:"2-digit", minute:"2-digit", timeZone:"Asia/Manila" })}
                    </span>
                  )}
                  {viewSession.activatedAt && (
                    <span className="session-meta-chip chip-accent">
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/></svg>
                      Last started {formatDateTime(viewSession.activatedAt)}
                    </span>
                  )}
                  {viewSession.endTime && (
                    <span className="session-meta-chip">
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M5 3.5h6A1.5 1.5 0 0 1 12.5 5v6a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 11V5A1.5 1.5 0 0 1 5 3.5z"/></svg>
                      Stopped {formatDateTime(viewSession.endTime)}
                    </span>
                  )}
                  <span className="session-meta-chip chip-accent">
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/></svg>
                    Late after {viewSession.lateAfterMinutes ?? 15}m
                  </span>
                  {viewSession.isActive && (
                    <span className="session-meta-chip chip-live">
                      <span style={{ width:6, height:6, borderRadius:"50%", background:"var(--green)", display:"inline-block", animation:"pulse 1.4s infinite" }}/>
                      Live now
                    </span>
                  )}
                  {viewSession.expiresAt && <SessionEndLabel expiresAt={viewSession.expiresAt} />}
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
                          {f === "all" ? "All" : f === "present" ? "✓ Present" : status === "late" ? "⏰ Late" : status === "absent" ? "❌ Absent" : "📝 Excused"}
                          {f === "all" ? ` (${attendance.length})` : f === "present" ? ` (${presentCount})` : ` (${lateCount})`}
                        </span>
                      ))}
                    </div>
                    <ExportPicker attendance={filteredAttendance} session={viewSession} />
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
              <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
              <button className="btn btn-ghost btn-sm" onClick={()=>setShowLeaderboard(true)} title="Section leaderboard">🏆 Board</button>
              <button className="btn btn-ghost btn-sm" onClick={()=>setShowForecast(true)} title="Attendance forecast">🔮 Forecast</button>
              <button className="btn btn-ghost btn-sm" onClick={()=>setShowScheduler(true)} title="Recurring schedules">🔁 Schedules</button>
              <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Session</button>
            </div>
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
                        {/* Room */}
                        {session.room && (
                          <span className="session-meta-chip">
                            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a5 5 0 0 0-5 5c0 3.5 5 9 5 9s5-5.5 5-9a5 5 0 0 0-5-5zm0 6.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg>
                            {session.room}
                          </span>
                        )}
                        {/* Attendance count + live counter */}
                        <span className="session-meta-chip" style={session.isActive ? { color:"var(--green)", borderColor:"var(--green)" } : {}}>
                          <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M7 14s-1 0-1-1 1-4 5-4 5 3 5 4-1 1-1 1H7zm4-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/></svg>
                          {session.isActive ? (liveCounters[session._id] ?? session.attendanceCount ?? 0) : (session.attendanceCount || 0)} check-in{session.attendanceCount !== 1 ? "s" : ""}
                          {session.isActive && <span style={{ marginLeft:3, width:6, height:6, borderRadius:"50%", background:"var(--green)", display:"inline-block", animation:"pulse 1.4s infinite" }}/>}
                        </span>
                        {/* Grace period */}
                        <span className="session-meta-chip chip-accent">
                          <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/></svg>
                          Late after {session.lateAfterMinutes ?? 15}m
                        </span>
                        {/* Scheduled date chips */}
                        {session.scheduledStart && (
                          <span className="session-meta-chip" style={{ borderColor:"var(--accent)", color:"var(--accent)" }}>
                            📅 {new Date(session.scheduledStart).toLocaleString("en-PH", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit", timeZone:"Asia/Manila" })}
                          </span>
                        )}
                        {session.scheduledEnd && (
                          <span className="session-meta-chip" style={{ borderColor:"var(--muted)", color:"var(--muted)" }}>
                            🏁 {new Date(session.scheduledEnd).toLocaleString("en-PH", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit", timeZone:"Asia/Manila" })}
                          </span>
                        )}
                        {/* Restriction chip */}
                        {(session.allowedGrades?.length > 0 || session.allowedSections?.length > 0) && (
                          <span className="session-meta-chip" style={{ borderColor:"var(--amber)", color:"var(--amber)", background:"var(--amber-lt)" }}>
                            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a2 2 0 0 1 2 2v4H6V3a2 2 0 0 1 2-2zm3 6V3a3 3 0 0 0-6 0v4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/></svg>
                            Restricted
                          </span>
                        )}
                        {/* Live badge */}
                        {/* Live badge + timer */}
                        {session.isActive && (
                          <span className="session-meta-chip chip-live">
                            <span style={{ width:6, height:6, borderRadius:"50%", background:"var(--green)", display:"inline-block", animation:"pulse 1.4s infinite" }}/>
                            Live
                          </span>
                        )}
                        {session.isActive && sessionTimers[session._id] !== undefined && (
                          <span className="session-meta-chip" style={{ fontFamily:"var(--font-mono)", fontWeight:700, color:"var(--green)", borderColor:"var(--green)" }}>
                            ⏱ {formatTimer(sessionTimers[session._id])}
                          </span>
                        )}
                        {/* Roster quick view */}
                        {session.roster?.length > 0 && (
                          <span className="session-meta-chip" style={{ color:"var(--accent)", borderColor:"var(--accent)" }}>
                            📋 {session.roster.length} enrolled
                            {session.isActive && (liveCounters[session._id] ?? 0) > 0 && (
                              <span style={{ marginLeft:4, color:"var(--muted)" }}>
                                ({Math.round(((liveCounters[session._id]||0)/session.roster.length)*100)}% in)
                              </span>
                            )}
                          </span>
                        )}
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
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditSession(session)} title="Edit session settings" style={{ padding:"6px 10px" }}>✏️</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setRosterSession(session)} title="Manage class roster" style={{ padding:"6px 10px" }}>📋</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setAbsenceSession(session)} title="Absence tracker" style={{ padding:"6px 10px", color:"var(--red)" }}>📊</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleQuickExport(session)} title="Quick export to Excel" style={{ padding:"6px 10px", color:"var(--green)" }}>📥</button>
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

      {showScheduler && (
        <RecurringScheduleModal onClose={()=>setShowScheduler(false)} onSaved={fetchSessions}/>
      )}
      {showForecast && (
        <AttendanceForecastPanel onClose={()=>setShowForecast(false)}/>
      )}
      {showLeaderboard && (
        <SectionLeaderboard onClose={()=>setShowLeaderboard(false)}/>
      )}
      {rosterSession && (
        <RosterManagerModal
          session={rosterSession}
          onClose={() => setRosterSession(null)}
          onSaved={() => { setRosterSession(null); loadSessions(); }}
        />
      )}
      {absenceSession && (
        <AbsenceTrackerModal
          session={absenceSession}
          onClose={() => setAbsenceSession(null)}
        />
      )}
      {editSession && (
        <EditSessionModal
          session={editSession}
          onClose={() => setEditSession(null)}
          onSaved={(updated) => {
            setSessions(prev => prev.map(s => s._id === updated._id ? { ...s, ...updated } : s));
            if (activeQR?._id === updated._id) setActiveQR(a => ({ ...a, ...updated }));
            setEditSession(null);
          }}
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
// ─── RESEND VERIFICATION BUTTON ──────────────────────────────────────────────
function ResendVerificationButton() {
  const [sent, setSent]     = useState(false);
  const [loading, setLoading] = useState(false);

  const handleResend = async () => {
    setLoading(true);
    try {
      await api.request("POST", "/security/send-verification");
      setSent(true);
    } catch(e) {}
    finally { setLoading(false); }
  };

  if (sent) return (
    <div style={{ padding:"10px 16px", background:"var(--green-lt)", borderRadius:"var(--radius-sm)", color:"var(--green)", fontWeight:600, fontSize:"0.85rem" }}>
      ✓ Verification email sent! Check your inbox.
    </div>
  );

  return (
    <button className="btn btn-primary btn-sm" onClick={handleResend} disabled={loading}>
      {loading ? <Spinner size={14}/> : "📧 Resend Verification Email"}
    </button>
  );
}

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
    // Offline mode — queue check-in for later sync
    if (!navigator.onLine) {
      addToOfflineQueue(token, user?._id);
      setMessage("📶 You are offline. Your check-in has been saved and will sync automatically when you reconnect to the internet.");
      setStatus("success");
      return;
    }
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
            {message?.includes("verify your email") || message?.includes("emailUnverified") ? (
              <>
                <span className="checkin-icon">✉️</span>
                <h2 className="checkin-title" style={{ color:"var(--amber)" }}>Email Not Verified</h2>
                <p style={{ color:"var(--text-dim)", fontSize:"0.9rem", lineHeight:1.6, marginBottom:16 }}>
                  You need to verify your email address before you can mark attendance.
                  Please check your inbox for the verification link.
                </p>
                {user && (
                  <div style={{ marginBottom:16, padding:"10px 14px", background:"var(--surface2)", borderRadius:"var(--radius-sm)", fontSize:"0.83rem", color:"var(--ink3)" }}>
                    Verification sent to: <strong>{user.email}</strong>
                  </div>
                )}
                <ResendVerificationButton />
              </>
            ) : message?.includes("restricted") || message?.includes("grade") || message?.includes("section") || message?.includes("Grade") || message?.includes("Section") ? (
              <>
                <span className="checkin-icon">🔒</span>
                <h2 className="checkin-title" style={{ color:"var(--amber)" }}>Access Restricted</h2>
                <p style={{ color:"var(--text-dim)", fontSize:"0.9rem", lineHeight:1.6 }}>{message}</p>
                {user && (
                  <div style={{ marginTop:16, padding:"12px 16px", background:"var(--surface2)", borderRadius:"var(--radius-sm)", border:"1px solid var(--border)", fontSize:"0.82rem", color:"var(--ink3)", textAlign:"left" }}>
                    <div style={{ fontWeight:700, marginBottom:6, color:"var(--ink)" }}>Your profile</div>
                    <div>Grade: <strong>{user.grade || <span style={{ color:"var(--red)" }}>Not set</span>}</strong></div>
                    <div>Section: <strong>{user.section || <span style={{ color:"var(--red)" }}>Not set</span>}</strong></div>
                    {(!user.grade || !user.section) && (
                      <div style={{ marginTop:8, color:"var(--amber)", fontSize:"0.78rem" }}>
                        ⚠ Update your grade and section in Settings so teachers can identify you.
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <span className="checkin-icon">❌</span>
                <h2 className="checkin-title" style={{ color:"var(--accent2)" }}>Check-in Failed</h2>
                <p style={{ color:"var(--text-dim)" }}>{message}</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── STUDENT DASHBOARD ────────────────────────────────────────────────────────
// ─── ROSTER MANAGER MODAL ────────────────────────────────────────────────────
function RosterManagerModal({ session, onClose, onSaved }) {
  const [students, setStudents]   = useState([]);
  const [roster, setRoster]       = useState(new Set((session.roster||[]).map(r=>r._id||r)));
  const [search, setSearch]       = useState("");
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [csvError, setCsvError]   = useState("");
  const [absLimit, setAbsLimit]   = useState(session.absenceLimit||3);
  const [absEnabled, setAbsEnabled] = useState(session.absenceLimitEnabled||false);
  const fileRef = useRef(null);
  useEscKey(onClose);

  useEffect(() => {
    // Try admin endpoint first, fall back to empty list if teacher (403)
    api.get("/admin/users?role=student&limit=500")
      .then(d => setStudents(d.users||[]))
      .catch(()=>{
        // Teachers don't have admin access - try fetching from session attendance history
        api.get("/sessions/students")
          .then(d => setStudents(d.students||[]))
          .catch(()=>{});
      })
      .finally(()=>setLoading(false));
  }, []);

  const toggle = (id) => setRoster(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCsvError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
      const headers = lines[0].toLowerCase().split(",").map(h=>h.trim());
      const emailIdx = headers.indexOf("email");
      const idIdx    = headers.indexOf("student id") !== -1 ? headers.indexOf("student id") : headers.indexOf("studentid");
      if (emailIdx === -1 && idIdx === -1) {
        setCsvError("CSV must have an 'email' or 'student id' column."); return;
      }
      let matched = 0;
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map(c=>c.trim().replace(/^["']|["']$/g,""));
        const email = emailIdx !== -1 ? cols[emailIdx]?.toLowerCase() : null;
        const sid   = idIdx !== -1 ? cols[idIdx] : null;
        const found = students.find(s =>
          (email && s.email === email) ||
          (sid && s.studentId === sid)
        );
        if (found) { setRoster(prev => new Set([...prev, found._id])); matched++; }
      }
      setCsvError(`✓ Matched ${matched} of ${lines.length-1} rows from CSV.`);
    };
    reader.readAsText(file);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.request("PATCH", `/attendance/roster/${session._id}`, {
        replace: Array.from(roster),
      });
      await api.request("PATCH", `/sessions/${session._id}`, {
        absenceLimit: absLimit, absenceLimitEnabled: absEnabled,
      });
      onSaved?.();
      onClose();
    } catch(e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const filtered = students.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase()) ||
    (s.studentId||"").includes(search) ||
    (s.grade||"").toLowerCase().includes(search.toLowerCase()) ||
    (s.section||"").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth:560, width:"96vw" }} onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">📋 Manage Class Roster — {session.subject}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display:"flex", flexDirection:"column", gap:14 }}>

          {/* Absence limit settings */}
          <div style={{ padding:"12px 14px", background:"var(--surface2)", borderRadius:"var(--radius-sm)", border:"1px solid var(--border)", display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
            <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:"0.83rem", cursor:"pointer" }}>
              <input type="checkbox" checked={absEnabled} onChange={e=>setAbsEnabled(e.target.checked)} style={{ accentColor:"var(--accent)" }}/>
              <span style={{ fontWeight:600, color:"var(--ink)" }}>Enable absence limit</span>
            </label>
            {absEnabled && (
              <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:"0.83rem" }}>
                <span style={{ color:"var(--muted)" }}>Warn after</span>
                <input type="number" min={1} max={20} value={absLimit} onChange={e=>setAbsLimit(parseInt(e.target.value)||3)}
                  style={{ width:52, padding:"4px 8px", border:"1px solid var(--border)", borderRadius:6, background:"var(--surface)", color:"var(--ink)", fontSize:"0.85rem", textAlign:"center" }}/>
                <span style={{ color:"var(--muted)" }}>absences</span>
              </div>
            )}
          </div>

          {/* CSV Upload */}
          <div style={{ padding:"12px 14px", background:"var(--accent-lt)", borderRadius:"var(--radius-sm)", border:"1px solid var(--accent)" }}>
            <div style={{ fontWeight:700, fontSize:"0.83rem", color:"var(--accent)", marginBottom:6 }}>📁 Batch Import via CSV</div>
            <div style={{ fontSize:"0.77rem", color:"var(--muted)", marginBottom:8 }}>CSV must have an <code>email</code> or <code>student id</code> column. First row = headers.</div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <button className="btn btn-ghost btn-sm" onClick={()=>fileRef.current?.click()}>📂 Choose CSV File</button>
              <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display:"none" }} onChange={handleCSV}/>
              {csvError && <span style={{ fontSize:"0.78rem", color: csvError.startsWith("✓") ? "var(--green)" : "var(--red)", fontWeight:600 }}>{csvError}</span>}
            </div>
          </div>

          {/* Stats */}
          <div style={{ display:"flex", gap:10 }}>
            <div style={{ flex:1, padding:"10px 14px", background:"var(--surface2)", borderRadius:"var(--radius-sm)", border:"1px solid var(--border)", textAlign:"center" }}>
              <div style={{ fontSize:"1.4rem", fontWeight:800, color:"var(--accent)" }}>{roster.size}</div>
              <div style={{ fontSize:"0.72rem", color:"var(--muted)", fontWeight:700, textTransform:"uppercase" }}>In Roster</div>
            </div>
            <div style={{ flex:1, padding:"10px 14px", background:"var(--surface2)", borderRadius:"var(--radius-sm)", border:"1px solid var(--border)", textAlign:"center" }}>
              <div style={{ fontSize:"1.4rem", fontWeight:800, color:"var(--ink3)" }}>{students.length - roster.size}</div>
              <div style={{ fontSize:"0.72rem", color:"var(--muted)", fontWeight:700, textTransform:"uppercase" }}>Not Enrolled</div>
            </div>
          </div>

          {/* Search */}
          <input className="form-input" placeholder="Search students by name, email, ID, grade..."
            value={search} onChange={e=>setSearch(e.target.value)} style={{ fontSize:"0.85rem" }}/>

          {/* Select/Deselect all filtered */}
          <div style={{ display:"flex", gap:8 }}>
            <button className="btn btn-ghost btn-sm" onClick={()=>filtered.forEach(s=>setRoster(prev=>new Set([...prev,s._id])))}>✓ Select all filtered</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>filtered.forEach(s=>setRoster(prev=>{const n=new Set(prev);n.delete(s._id);return n;}))}>✗ Deselect all filtered</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>setRoster(new Set())} style={{ color:"var(--red)", marginLeft:"auto" }}>Clear all</button>
          </div>

          {/* Student list */}
          {loading ? <div style={{ textAlign:"center", padding:"20px" }}><Spinner size={22}/></div> : (
            <div style={{ maxHeight:280, overflowY:"auto", display:"flex", flexDirection:"column", gap:6 }}>
              {filtered.length === 0 ? (
                <div style={{ textAlign:"center", padding:"20px", color:"var(--muted)", fontSize:"0.85rem" }}>No students found.</div>
              ) : filtered.map(s => {
                const inRoster = roster.has(s._id);
                return (
                  <div key={s._id} onClick={()=>toggle(s._id)} style={{
                    display:"flex", alignItems:"center", gap:10, padding:"8px 12px",
                    borderRadius:"var(--radius-sm)", cursor:"pointer",
                    border:`1px solid ${inRoster ? "var(--accent)" : "var(--border)"}`,
                    background: inRoster ? "var(--accent-lt)" : "var(--surface2)",
                    transition:"all 0.1s",
                  }}>
                    <input type="checkbox" checked={inRoster} onChange={()=>{}} style={{ accentColor:"var(--accent)", pointerEvents:"none" }}/>
                    <AvatarCircle name={s.name} picture={s.profilePicture} size={28} radius={14} fontSize="0.7rem"/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:600, fontSize:"0.85rem", color:"var(--ink)" }}>{s.name}</div>
                      <div style={{ fontSize:"0.72rem", color:"var(--muted)" }}>
                        {s.studentId && <span>{s.studentId} · </span>}
                        {s.grade} {s.section}
                      </div>
                    </div>
                    {inRoster && <span style={{ fontSize:"0.72rem", fontWeight:700, color:"var(--accent)" }}>✓</span>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Save */}
          <div style={{ display:"flex", gap:8, paddingTop:8, borderTop:"1px solid var(--border)" }}>
            <button className="btn btn-primary" style={{ flex:1 }} onClick={handleSave} disabled={saving}>
              {saving ? <Spinner size={16}/> : `💾 Save Roster (${roster.size} students)`}
            </button>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ABSENCE TRACKER MODAL ────────────────────────────────────────────────────
function AbsenceTrackerModal({ session, onClose }) {
  const [summary, setSummary]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [overriding, setOverriding] = useState(null); // { recordId, studentName }
  const [newStatus, setNewStatus]   = useState("present");
  const [reason, setReason]         = useState("");
  const [saveLoading, setSaveLoading] = useState(false);
  const [absenceLimit, setAbsenceLimit] = useState(3);
  const [absEnabled, setAbsEnabled] = useState(false);
  const [filterAbs, setFilterAbs] = useState("all");
  useEscKey(onClose);

  const load = async () => {
    setLoading(true);
    try {
      const d = await api.get(`/attendance/absence-summary/${session._id}`);
      setSummary(d.summary||[]);
      setAbsenceLimit(d.absenceLimit||3);
      setAbsEnabled(d.absenceLimitEnabled||false);
    } catch(e) {}
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleMarkAbsences = async () => {
    try {
      const d = await api.request("POST", `/attendance/mark-absences/${session._id}`);
      alert(d.message);
      load();
    } catch(e) { alert(e.message); }
  };

  const handleOverride = async (recordId) => {
    setSaveLoading(true);
    try {
      await api.request("PATCH", `/attendance/${recordId}/override`, { status: newStatus, reason });
      setOverriding(null); setReason("");
      load();
    } catch(e) { alert(e.message); }
    finally { setSaveLoading(false); }
  };

  const statusColors = { present:"var(--green)", late:"var(--amber)", absent:"var(--red)", excused:"var(--accent)" };
  const statusIcons  = { present:"✅", late:"🕐", absent:"❌", excused:"📝" };

  const filtered = summary.filter(s => {
    if (filterAbs === "at-risk") return absEnabled && s.absent >= absenceLimit;
    if (filterAbs === "absent")  return s.absent > 0;
    return true;
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth:620, width:"96vw" }} onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">📊 Absence Tracker — {session.subject}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display:"flex", flexDirection:"column", gap:14 }}>

          {/* Action bar */}
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <button className="btn btn-primary btn-sm" onClick={handleMarkAbsences} style={{ background:"var(--red)", borderColor:"var(--red)" }}>
              ❌ Auto-Mark Absences Now
            </button>
            <button className="btn btn-ghost btn-sm" onClick={load}>↻ Refresh</button>
            <div style={{ display:"flex", gap:6, marginLeft:"auto" }}>
              {[["all","All"],["absent","Has Absences"],["at-risk","⚠ At Risk"]].map(([v,l]) => (
                <button key={v} className="btn btn-ghost btn-sm" style={{ fontSize:"0.75rem",
                  background: filterAbs===v ? "var(--accent)" : undefined,
                  color: filterAbs===v ? "#fff" : undefined,
                  border: filterAbs===v ? "none" : undefined }}
                  onClick={()=>setFilterAbs(v)}>{l}</button>
              ))}
            </div>
          </div>

          {/* Absence limit info */}
          {absEnabled && (
            <div style={{ padding:"8px 12px", background:"var(--amber-lt)", border:"1px solid var(--amber)", borderRadius:"var(--radius-sm)", fontSize:"0.82rem", color:"var(--amber)", fontWeight:600 }}>
              ⚠ Absence limit is set to {absenceLimit}. Students at or above this limit are flagged at risk.
            </div>
          )}

          {/* Summary table */}
          {loading ? <div style={{ textAlign:"center", padding:"30px" }}><Spinner size={24}/></div>
          : filtered.length === 0 ? (
            <div style={{ textAlign:"center", padding:"30px", color:"var(--muted)" }}>
              {filterAbs === "at-risk" ? "No students are at risk." : filterAbs === "absent" ? "No absences recorded." : "No attendance data yet."}
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {filtered.map(s => {
                const atRisk = absEnabled && s.absent >= absenceLimit;
                const rate = s.total > 0 ? Math.round((s.present+s.late)/s.total*100) : 0;
                return (
                  <div key={s._id} style={{
                    padding:"12px 14px", borderRadius:"var(--radius-sm)",
                    border:`1px solid ${atRisk ? "var(--red)" : "var(--border)"}`,
                    background: atRisk ? "var(--red-lt)" : "var(--surface2)",
                  }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <AvatarCircle name={s.name} picture={s.profilePicture} size={34} radius={17} fontSize="0.8rem"/>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:700, fontSize:"0.87rem", color:"var(--ink)", display:"flex", alignItems:"center", gap:6 }}>
                          {s.name}
                          {atRisk && <span style={{ fontSize:"0.7rem", padding:"1px 7px", borderRadius:20, background:"var(--red)", color:"#fff", fontWeight:700 }}>⚠ AT RISK</span>}
                        </div>
                        <div style={{ fontSize:"0.73rem", color:"var(--muted)", marginTop:2 }}>
                          {s.studentId && <span>{s.studentId} · </span>}{s.grade} {s.section}
                        </div>
                      </div>
                      {/* Status pills */}
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap", justifyContent:"flex-end" }}>
                        {[["present","✅",s.present],["late","🕐",s.late],["absent","❌",s.absent],["excused","📝",s.excused]].map(([st,icon,count]) => count > 0 && (
                          <span key={st} style={{ fontSize:"0.72rem", padding:"2px 8px", borderRadius:20, fontWeight:700,
                            background: st==="absent"?"var(--red-lt)":st==="late"?"var(--amber-lt)":st==="present"?"var(--green-lt)":"var(--accent-lt)",
                            color: st==="absent"?"var(--red)":st==="late"?"var(--amber)":st==="present"?"var(--green)":"var(--accent)" }}>
                            {icon} {count}
                          </span>
                        ))}
                      </div>
                    </div>
                    {/* Attendance rate bar */}
                    <div style={{ marginTop:8, display:"flex", alignItems:"center", gap:8 }}>
                      <div style={{ flex:1, height:5, background:"var(--border)", borderRadius:3, overflow:"hidden" }}>
                        <div style={{ width:`${rate}%`, height:"100%", background: rate>=80?"var(--green)":rate>=60?"var(--amber)":"var(--red)", borderRadius:3 }}/>
                      </div>
                      <span style={{ fontSize:"0.72rem", color:"var(--muted)", minWidth:36, textAlign:"right" }}>{rate}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── QR SCANNER (Built-in camera scanner for students) ───────────────────────
function QRScannerModal({ onClose, onScan }) {
  const videoRef   = useRef(null);
  const canvasRef  = useRef(null);
  const streamRef  = useRef(null);
  const rafRef     = useRef(null);
  const [error, setError]     = useState("");
  const [cameras, setCameras] = useState([]);
  const [cameraIdx, setCameraIdx] = useState(0);
  const [scanning, setScanning]   = useState(false);
  const [torch, setTorch]         = useState(false);
  const [scanned, setScanned]     = useState(false);

  // Load jsQR from CDN dynamically then start camera
  const loadJsQRAndStart = async () => {
    // jsQR is preloaded in index.html — should be available immediately
    if (window.jsQR) { startCamera(); return; }

    // Fallback: try loading dynamically if preload somehow failed
    const SOURCES = [
      "https://unpkg.com/jsqr@1.4.0/dist/jsQR.js",
      "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js",
      "https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js",
    ];

    for (const src of SOURCES) {
      try {
        await new Promise((resolve, reject) => {
          // Remove any previous stale tag for this src
          document.querySelectorAll(`script[src="${src}"]`).forEach(s => s.remove());
          const script = document.createElement("script");
          script.src = src;
          script.onload  = () => resolve();
          script.onerror = () => { script.remove(); reject(); };
          document.head.appendChild(script);
        });
        if (window.jsQR) { startCamera(); return; }
      } catch(e) { /* try next source */ }
    }

    setError("Could not load the QR scanner. Make sure you are online, then tap Try Again.");
  };

  useEffect(() => {
    loadJsQRAndStart();
    return () => stopCamera();
  }, []);

  // Restart when switching cameras
  useEffect(() => {
    if (cameras.length > 0) { stopCamera(); startCamera(); }
  }, [cameraIdx]);

  const stopCamera = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  const startCamera = async () => {
    setError(""); setScanning(false);
    try {
      // Enumerate cameras
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === "videoinput");
      setCameras(videoDevices);

      const constraints = {
        video: {
          deviceId: videoDevices[cameraIdx]?.deviceId
            ? { exact: videoDevices[cameraIdx].deviceId }
            : undefined,
          facingMode: videoDevices.length === 1 ? "environment" : undefined,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", true);
        await videoRef.current.play();
        setScanning(true);
        scanFrame();
      }
    } catch (err) {
      if (err.name === "NotAllowedError") {
        setError("Camera permission denied. Please allow camera access in your browser settings.");
      } else if (err.name === "NotFoundError") {
        setError("No camera found on this device.");
      } else {
        setError("Could not start camera: " + err.message);
      }
    }
  };

  const scanFrame = () => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = window.jsQR && window.jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
    if (code && code.data && !scanned) {
      // Extract token from URL or use raw data
      let token = code.data;
      try {
        const url = new URL(code.data);
        const t = url.searchParams.get("token");
        if (t) token = t;
      } catch(e) {}
      if (token) {
        setScanned(true);
        stopCamera();
        onScan(token);
        return;
      }
    }
    rafRef.current = requestAnimationFrame(scanFrame);
  };

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch }] });
      setTorch(t => !t);
    } catch(e) {}
  };

  const switchCamera = () => {
    setCameraIdx(i => (i + 1) % Math.max(cameras.length, 1));
  };

  useEscKey(onClose);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 420, width: "96vw" }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">📷 Scan QR Code</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: "16px 16px 20px" }}>
          {error ? (
            <div style={{ textAlign:"center", padding:"28px 16px" }}>
              <div style={{ fontSize:"2.5rem", marginBottom:12 }}>📵</div>
              <div style={{ color:"var(--red)", fontWeight:600, fontSize:"0.9rem", marginBottom:16 }}>{error}</div>
              <button className="btn btn-primary btn-sm" onClick={() => { setError(""); loadJsQRAndStart(); }}>Try Again</button>
            </div>
          ) : (
            <>
              {/* Camera viewport */}
              <div style={{ position:"relative", width:"100%", borderRadius:"var(--radius-sm)", overflow:"hidden", background:"#000", aspectRatio:"1/1" }}>
                <video ref={videoRef} style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} playsInline muted />
                <canvas ref={canvasRef} style={{ display:"none" }} />

                {/* Scanning overlay */}
                {scanning && !scanned && (
                  <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", pointerEvents:"none" }}>
                    {/* Corner brackets */}
                    {["topleft","topright","bottomleft","bottomright"].map(pos => (
                      <div key={pos} style={{
                        position:"absolute",
                        width:48, height:48,
                        top: pos.includes("top") ? "20%" : undefined,
                        bottom: pos.includes("bottom") ? "20%" : undefined,
                        left: pos.includes("left") ? "20%" : undefined,
                        right: pos.includes("right") ? "20%" : undefined,
                        borderTop: pos.includes("top") ? "3px solid var(--accent)" : "none",
                        borderBottom: pos.includes("bottom") ? "3px solid var(--accent)" : "none",
                        borderLeft: pos.includes("left") ? "3px solid var(--accent)" : "none",
                        borderRight: pos.includes("right") ? "3px solid var(--accent)" : "none",
                      }}/>
                    ))}
                    {/* Scan line animation */}
                    <div style={{
                      position:"absolute",
                      left:"20%", right:"20%", height:2,
                      background:"var(--accent)",
                      boxShadow:"0 0 8px var(--accent)",
                      animation:"scanLine 2s ease-in-out infinite",
                    }}/>
                  </div>
                )}

                {/* Scanned success overlay */}
                {scanned && (
                  <div style={{ position:"absolute", inset:0, background:"rgba(16,185,129,0.85)", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:8 }}>
                    <div style={{ fontSize:"3rem" }}>✓</div>
                    <div style={{ color:"#fff", fontWeight:700, fontSize:"1rem" }}>QR Code Detected!</div>
                  </div>
                )}

                {/* Loading */}
                {!scanning && !error && !scanned && (
                  <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:10, color:"#fff" }}>
                    <Spinner size={28} />
                    <div style={{ fontSize:"0.85rem" }}>Starting camera…</div>
                  </div>
                )}
              </div>

              {/* Controls */}
              <div style={{ display:"flex", justifyContent:"center", gap:10, marginTop:14 }}>
                {cameras.length > 1 && (
                  <button className="btn btn-ghost btn-sm" onClick={switchCamera} title="Switch camera">
                    🔄 Flip
                  </button>
                )}
                <button className="btn btn-ghost btn-sm" onClick={toggleTorch} title="Toggle flashlight"
                  style={{ color: torch ? "var(--amber)" : undefined }}>
                  {torch ? "🔦 Flash ON" : "🔦 Flash"}
                </button>
              </div>

              <p style={{ textAlign:"center", fontSize:"0.78rem", color:"var(--muted)", marginTop:12 }}>
                Point your camera at the QR code on the teacher's screen
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ANNOUNCEMENT BANNER ─────────────────────────────────────────────────────
function AnnouncementBanner() {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState([]);
  const [dismissed, setDismissed] = useState(() => {
    try { return JSON.parse(localStorage.getItem("dismissedAnn") || "[]"); } catch { return []; }
  });

  useEffect(() => {
    if (!user) return;
    api.get(`/admin/announcements?role=${user.role}`)
      .then(d => setAnnouncements(d.announcements || []))
      .catch(() => {});
  }, [user]);

  const dismiss = (id) => {
    const next = [...dismissed, id];
    setDismissed(next);
    localStorage.setItem("dismissedAnn", JSON.stringify(next));
    api.request("POST", `/admin/announcements/${id}/read`).catch(() => {});
  };

  const visible = announcements.filter(a => !dismissed.includes(a._id));
  if (!visible.length) return null;

  const typeStyles = {
    info:    { bg:"var(--accent-lt)",  border:"var(--accent)", icon:"ℹ️" },
    warning: { bg:"var(--amber-lt)",   border:"var(--amber)",  icon:"⚠️" },
    urgent:  { bg:"var(--red-lt)",     border:"var(--red)",    icon:"🚨" },
    success: { bg:"var(--green-lt)",   border:"var(--green)",  icon:"✅" },
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
      {visible.map(a => {
        const s = typeStyles[a.type] || typeStyles.info;
        return (
          <div key={a._id} style={{ background:s.bg, borderBottom:`2px solid ${s.border}`, padding:"10px 24px", display:"flex", alignItems:"center", gap:12 }}>
            <span style={{ fontSize:"1.1rem", flexShrink:0 }}>{s.icon}</span>
            <div style={{ flex:1 }}>
              <span style={{ fontWeight:700, fontSize:"0.85rem", color:"var(--ink)" }}>{a.title}: </span>
              <span style={{ fontSize:"0.85rem", color:"var(--ink3)" }}>{a.message}</span>
            </div>
            <button onClick={() => dismiss(a._id)} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--muted)", fontSize:"1rem", flexShrink:0 }}>✕</button>
          </div>
        );
      })}
    </div>
  );
}


// ─── OFFLINE INDICATOR ───────────────────────────────────────────────────────
function OfflineIndicator() {
  const [offline, setOffline] = useState(!navigator.onLine);
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline  = () => {
      setOffline(false);
      syncOfflineQueue();
      setQueueCount(0);
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);

    // Check queue count periodically
    const interval = setInterval(() => {
      setQueueCount(getOfflineQueue().length);
    }, 3000);

    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      clearInterval(interval);
    };
  }, []);

  if (!offline && queueCount === 0) return null;

  return (
    <div style={{
      background: offline ? "var(--red)" : "var(--amber)",
      color: "#fff", padding:"8px 24px",
      display:"flex", alignItems:"center", gap:10,
      fontSize:"0.82rem", fontWeight:600,
    }}>
      <span>{offline ? "📶 No internet connection" : "⏳ Syncing offline check-ins..."}</span>
      {queueCount > 0 && (
        <span style={{ padding:"2px 8px", background:"rgba(255,255,255,0.2)", borderRadius:20 }}>
          {queueCount} pending
        </span>
      )}
      {!offline && queueCount > 0 && (
        <button onClick={() => syncOfflineQueue().then(()=>setQueueCount(0))}
          style={{ background:"rgba(255,255,255,0.2)", border:"none", cursor:"pointer", color:"#fff", padding:"3px 10px", borderRadius:20, fontSize:"0.78rem" }}>
          Sync Now
        </button>
      )}
    </div>
  );
}

// ─── SECTION LEADERBOARD ────────────────────────────────────────────────────
// ─── RATE BAR HELPER ──────────────────────────────────────────────────────────
function RateBar({ rate, width = 60 }) {
  const color = rate >= 90 ? "var(--green)" : rate >= 75 ? "var(--amber)" : "var(--red)";
  return (
    <div style={{ width, height: 5, background: "var(--border)", borderRadius: 3, overflow: "hidden", marginTop: 3 }}>
      <div style={{ width: `${rate}%`, height: "100%", background: color, borderRadius: 3 }} />
    </div>
  );
}

// ─── ADMIN LEADERBOARD PANEL (inline in Academic tab) ─────────────────────────
function AdminLeaderboardPanel({ data, loading, onRefresh }) {
  const [tab, setTab]           = useState("section");
  const [perfPeriod, setPerfPeriod] = useState("fullYear");
  const [perfSub, setPerfSub]   = useState(null); // selected month/quarter key
  const [secRankKey, setSecRankKey] = useState(null);
  const [sessionExpand, setSessionExpand] = useState(null);
  const medals = ["🥇", "🥈", "🥉"];

  const TABS = [
    { id: "section",   label: "By Section" },
    { id: "session",   label: "By Session" },
    { id: "perfect",   label: "Perfect Attendance" },
    { id: "student",   label: "Student Rankings" },
  ];

  const rateColor = (r) => r >= 90 ? "var(--green)" : r >= 75 ? "var(--amber)" : "var(--red)";

  // ── Section tab ─────────────────────────────────────────────────────────────
  const SectionTab = () => {
    const lb = data?.leaderboard || [];
    if (!lb.length) return <EmptyState msg="No section data available yet." />;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {lb.map((s, i) => (
          <div key={s.key} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 13px",
            borderRadius: "var(--radius-sm)",
            border: `1px solid ${i === 0 ? "var(--amber)" : i === 1 ? "#A8A8B3" : i === 2 ? "#C2410C55" : "var(--border)"}`,
            background: i === 0 ? "var(--amber-lt)" : i === 1 ? "var(--surface2)" : i === 2 ? "#FFF7ED" : "var(--surface2)",
          }}>
            <div style={{ fontSize: "1.3rem", width: 28, textAlign: "center", flexShrink: 0 }}>{medals[i] || `#${i + 1}`}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--ink)" }}>{s.grade} — {s.section}</div>
              <div style={{ fontSize: "0.71rem", color: "var(--muted)", marginTop: 2 }}>
                {s.students} students · {s.present} present · {s.late} late · {s.absent} absent
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "1.15rem", fontWeight: 800, color: rateColor(s.rate) }}>{s.rate}%</div>
              <RateBar rate={s.rate} width={48} />
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ── Session tab ─────────────────────────────────────────────────────────────
  const SessionTab = () => {
    const sl = data?.sessionLeaderboard || [];
    if (!sl.length) return <EmptyState msg="No session data available yet." />;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sl.map((sub) => {
          const isOpen = sessionExpand === sub.subject;
          return (
            <div key={sub.subject} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
              <div
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--surface2)", cursor: "pointer" }}
                onClick={() => setSessionExpand(isOpen ? null : sub.subject)}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: "0.86rem", color: "var(--ink)" }}>📚 {sub.subject}</div>
                  <div style={{ fontSize: "0.71rem", color: "var(--muted)", marginTop: 2 }}>
                    {sub.totalSessions} sessions · {sub.perfectCount} perfect attendance
                    {sub.bestSection && <> · Best: <strong>{sub.bestSection.grade} {sub.bestSection.section}</strong> ({sub.bestSection.rate}%)</>}
                  </div>
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>{isOpen ? "▲" : "▼"}</div>
              </div>
              {isOpen && (
                <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* Section ranking for this subject */}
                  {sub.sectionRanking.length > 0 && (
                    <div>
                      <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--muted)", letterSpacing: "0.05em", marginBottom: 6 }}>SECTION RANKING</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {sub.sectionRanking.map((sec, i) => (
                          <div key={`${sec.grade}-${sec.section}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: "var(--radius-sm)", background: "var(--surface3,var(--surface))" }}>
                            <div style={{ fontSize: "0.85rem", width: 22, textAlign: "center" }}>{medals[i] || `#${i+1}`}</div>
                            <div style={{ flex: 1, fontSize: "0.8rem", fontWeight: 600, color: "var(--ink)" }}>{sec.grade} — {sec.section}</div>
                            <div style={{ fontSize: "0.71rem", color: "var(--muted)" }}>{sec.students} students</div>
                            <div style={{ fontWeight: 700, fontSize: "0.85rem", color: rateColor(sec.rate) }}>{sec.rate}%</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Perfect attendance students */}
                  {sub.perfectStudents.length > 0 && (
                    <div>
                      <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--muted)", letterSpacing: "0.05em", marginBottom: 6 }}>⭐ PERFECT ATTENDANCE ({sub.perfectStudents.length})</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                        {sub.perfectStudents.map(st => (
                          <div key={st.id} style={{ padding: "3px 9px", borderRadius: 20, background: "var(--green-lt,#DCFCE7)", border: "1px solid var(--green)", fontSize: "0.75rem", color: "var(--ink)", fontWeight: 600 }}>
                            {st.name} <span style={{ color: "var(--muted)", fontWeight: 400 }}>({st.grade} {st.section})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // ── Perfect Attendance tab ───────────────────────────────────────────────────
  const PerfectTab = () => {
    const pa = data?.perfectAttendance;
    if (!pa) return <EmptyState msg="No attendance data yet." />;

    const PERIOD_TABS = [
      { id: "monthly",   label: "Monthly" },
      { id: "quarterly", label: "Quarterly" },
      { id: "fullYear",  label: "Full School Year" },
    ];

    const listForPeriod = () => {
      if (perfPeriod === "fullYear") return pa.fullYear || [];
      if (perfPeriod === "monthly") {
        const entry = (pa.monthly || []).find(m => m.key === perfSub) || pa.monthly?.[pa.monthly.length - 1];
        return entry?.students || [];
      }
      if (perfPeriod === "quarterly") {
        const entry = (pa.quarterly || []).find(q => q.key === perfSub) || pa.quarterly?.find(q => q.students.length > 0);
        return entry?.students || [];
      }
      return [];
    };

    const students = listForPeriod();

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Period type tabs */}
        <div style={{ display: "flex", gap: 6 }}>
          {PERIOD_TABS.map(pt => (
            <button key={pt.id} className="btn btn-ghost btn-sm"
              style={{ fontWeight: perfPeriod === pt.id ? 700 : 400, borderBottom: perfPeriod === pt.id ? "2px solid var(--primary)" : "2px solid transparent", borderRadius: 0, padding: "4px 10px" }}
              onClick={() => { setPerfPeriod(pt.id); setPerfSub(null); }}>
              {pt.label}
            </button>
          ))}
        </div>

        {/* Sub-period selector (monthly / quarterly) */}
        {perfPeriod === "monthly" && (
          <select value={perfSub || pa.monthly?.[pa.monthly.length - 1]?.key || ""} onChange={e => setPerfSub(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface)", fontSize: "0.82rem" }}>
            {(pa.monthly || []).map(m => <option key={m.key} value={m.key}>{m.label} ({m.students.length} perfect)</option>)}
          </select>
        )}
        {perfPeriod === "quarterly" && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(pa.quarterly || []).map(q => (
              <button key={q.key} className="btn btn-ghost btn-sm"
                style={{ fontWeight: (perfSub || pa.quarterly?.find(x => x.students.length > 0)?.key) === q.key ? 700 : 400, borderRadius: "var(--radius-sm)", border: `1px solid ${(perfSub || pa.quarterly?.find(x => x.students.length > 0)?.key) === q.key ? "var(--primary)" : "var(--border)"}` }}
                onClick={() => setPerfSub(q.key)}>
                {q.key} · {q.students.length}
              </button>
            ))}
          </div>
        )}

        {/* Students list */}
        {perfPeriod === "fullYear" && (
          <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: -4 }}>
            Students with zero absences across all recorded sessions
          </div>
        )}
        {students.length === 0
          ? <EmptyState msg="No students with perfect attendance in this period." />
          : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {students.map((st, i) => (
                <div key={st.id} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "9px 13px",
                  borderRadius: "var(--radius-sm)",
                  border: `1px solid ${i === 0 ? "var(--amber)" : i === 1 ? "#A8A8B3" : i === 2 ? "#C2410C55" : "var(--border)"}`,
                  background: i < 3 ? (i === 0 ? "var(--amber-lt)" : i === 1 ? "var(--surface2)" : "#FFF7ED") : "var(--surface2)",
                }}>
                  <div style={{ fontSize: "1.2rem", width: 26, textAlign: "center", flexShrink: 0 }}>{medals[i] || `#${i + 1}`}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: "0.84rem", color: "var(--ink)" }}>{st.name}</div>
                    <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: 1 }}>{st.grade} — {st.section}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "0.72rem", color: "var(--green)", fontWeight: 700 }}>✅ Perfect</div>
                    <div style={{ fontSize: "0.68rem", color: "var(--muted)" }}>{st.present} present · {st.late} late</div>
                  </div>
                </div>
              ))}
            </div>
          )
        }
      </div>
    );
  };

  // ── Student Rankings tab ─────────────────────────────────────────────────────
  const StudentRankTab = () => {
    const sections = data?.sectionStudentRank || [];
    if (!sections.length) return <EmptyState msg="No student data available yet." />;

    const selectedSec = sections.find(s => s.key === secRankKey) || sections[0];

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Section picker */}
        <select value={secRankKey || selectedSec?.key || ""}
          onChange={e => setSecRankKey(e.target.value)}
          style={{ padding: "6px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface)", fontSize: "0.82rem" }}>
          {sections.map(s => <option key={s.key} value={s.key}>{s.grade} — {s.section} ({s.studentCount} students)</option>)}
        </select>

        {/* Table */}
        {selectedSec && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
              <thead>
                <tr style={{ background: "var(--surface3,var(--surface))", borderBottom: "2px solid var(--border)" }}>
                  {["Rank","Student","Present","Late","Absent","Rate","Status"].map(h => (
                    <th key={h} style={{ padding: "7px 10px", textAlign: h === "Student" ? "left" : "center", fontWeight: 700, color: "var(--muted)", fontSize: "0.7rem", letterSpacing: "0.04em" }}>{h.toUpperCase()}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedSec.students.map((st, idx) => {
                  const rc = rateColor(st.attendedRate);
                  const isTop3 = st.rank <= 3;
                  return (
                    <tr key={st.id} style={{ borderBottom: "1px solid var(--border)", background: isTop3 ? (st.rank === 1 ? "var(--amber-lt)" : st.rank === 2 ? "var(--surface2)" : "#FFF7ED") : idx % 2 === 0 ? "var(--surface)" : "var(--surface2)" }}>
                      <td style={{ padding: "7px 10px", textAlign: "center", fontWeight: 700 }}>
                        {st.rank <= 3 ? ["🥇","🥈","🥉"][st.rank - 1] : `#${st.rank}`}
                      </td>
                      <td style={{ padding: "7px 10px", fontWeight: 600, color: "var(--ink)" }}>{st.name}</td>
                      <td style={{ padding: "7px 10px", textAlign: "center", color: "var(--green)", fontWeight: 600 }}>{st.present}</td>
                      <td style={{ padding: "7px 10px", textAlign: "center", color: "var(--amber)" }}>{st.late}</td>
                      <td style={{ padding: "7px 10px", textAlign: "center", color: "var(--red)" }}>{st.absent}</td>
                      <td style={{ padding: "7px 10px", textAlign: "center" }}>
                        <span style={{ fontWeight: 700, color: rc }}>{st.attendedRate}%</span>
                        <RateBar rate={st.attendedRate} width={40} />
                      </td>
                      <td style={{ padding: "7px 10px", textAlign: "center" }}>
                        {st.absent === 0 && st.total > 0
                          ? <span style={{ fontSize: "0.68rem", padding: "2px 7px", borderRadius: 20, background: "var(--green-lt,#DCFCE7)", color: "var(--green)", fontWeight: 700 }}>Perfect</span>
                          : st.attendedRate >= 90
                            ? <span style={{ fontSize: "0.68rem", padding: "2px 7px", borderRadius: 20, background: "var(--amber-lt)", color: "var(--amber)", fontWeight: 700 }}>Excellent</span>
                            : st.attendedRate >= 75
                              ? <span style={{ fontSize: "0.68rem", padding: "2px 7px", borderRadius: 20, background: "var(--surface)", color: "var(--muted)", fontWeight: 600 }}>Good</span>
                              : <span style={{ fontSize: "0.68rem", padding: "2px 7px", borderRadius: 20, background: "#FEE2E2", color: "var(--red)", fontWeight: 700 }}>At Risk</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const EmptyState = ({ msg }) => (
    <div style={{ textAlign: "center", padding: "24px 0", color: "var(--muted)", fontSize: "0.83rem" }}>{msg}</div>
  );

  return (
    <div style={{ background: "var(--surface2)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", padding: "16px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--ink)" }}>🏆 Attendance Leaderboard</div>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={onRefresh}>↻ Refresh</button>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 0, marginBottom: 14, borderBottom: "1px solid var(--border)" }}>
        {TABS.map(t => (
          <button key={t.id}
            style={{ padding: "6px 12px", fontSize: "0.78rem", fontWeight: tab === t.id ? 700 : 400, color: tab === t.id ? "var(--primary)" : "var(--muted)", background: "none", border: "none", borderBottom: tab === t.id ? "2px solid var(--primary)" : "2px solid transparent", cursor: "pointer", marginBottom: -1 }}
            onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {loading
        ? <div style={{ textAlign: "center", padding: "24px" }}><Spinner size={22} /></div>
        : (
          <>
            {tab === "section"  && <SectionTab />}
            {tab === "session"  && <SessionTab />}
            {tab === "perfect"  && <PerfectTab />}
            {tab === "student"  && <StudentRankTab />}
          </>
        )
      }
    </div>
  );
}

// ─── SECTION LEADERBOARD MODAL (teacher quick-view) ──────────────────────────
function SectionLeaderboard({ onClose }) {
  const [lbData, setLbData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEscKey(onClose);

  useEffect(() => {
    api.get("/academic/leaderboard")
      .then(d => setLbData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 600, width: "96vw" }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">🏆 Attendance Leaderboard</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
          {loading
            ? <div style={{ textAlign: "center", padding: "30px" }}><Spinner size={24} /></div>
            : <AdminLeaderboardPanel data={lbData} loading={false} onRefresh={() => {
                setLoading(true);
                api.get("/academic/leaderboard").then(d => setLbData(d)).finally(() => setLoading(false));
              }} />
          }
        </div>
      </div>
    </div>
  );
}

// ─── RECURRING SCHEDULE MODAL ─────────────────────────────────────────────────
function RecurringScheduleModal({ onClose, onSaved }) {
  const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const [form, setForm] = useState({
    subject:"", room:"", daysOfWeek:[], startTime:"07:30",
    durationMinutes:60, lateAfterMinutes:15,
    allowedGrades:"", allowedSections:"",
  });
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState("list"); // list | create
  useEscKey(onClose);

  const loadSchedules = () => {
    api.get("/academic/schedules").then(d => setSchedules(d.schedules||[])).catch(()=>{});
  };

  useEffect(() => { loadSchedules(); }, []);

  const toggleDay = (d) => setForm(f => ({
    ...f, daysOfWeek: f.daysOfWeek.includes(d) ? f.daysOfWeek.filter(x=>x!==d) : [...f.daysOfWeek, d].sort()
  }));

  const handleCreate = async () => {
    if (!form.subject || !form.daysOfWeek.length || !form.startTime)
      return alert("Subject, days, and start time are required.");
    setLoading(true);
    try {
      await api.request("POST", "/academic/schedules", {
        ...form,
        allowedGrades: form.allowedGrades ? form.allowedGrades.split(",").map(s=>s.trim()).filter(Boolean) : [],
        allowedSections: form.allowedSections ? form.allowedSections.split(",").map(s=>s.trim()).filter(Boolean) : [],
      });
      loadSchedules();
      setView("list");
      setForm({ subject:"", room:"", daysOfWeek:[], startTime:"07:30", durationMinutes:60, lateAfterMinutes:15, allowedGrades:"", allowedSections:"" });
      onSaved?.();
    } catch(e) { alert(e.message); }
    finally { setLoading(false); }
  };

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const d = await api.request("POST", "/academic/generate-sessions");
      alert(d.message);
      onSaved?.();
    } catch(e) { alert(e.message); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this recurring schedule?")) return;
    await api.request("DELETE", `/academic/schedules/${id}`);
    loadSchedules();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{maxWidth:560,width:"96vw"}} onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">🔁 Recurring Schedules</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{display:"flex",gap:8}}>
            <button className={`btn btn-sm ${view==="list"?"btn-primary":"btn-ghost"}`} onClick={()=>setView("list")}>My Schedules</button>
            <button className={`btn btn-sm ${view==="create"?"btn-primary":"btn-ghost"}`} onClick={()=>setView("create")}>+ New Schedule</button>
            <button className="btn btn-green btn-sm" style={{marginLeft:"auto"}} onClick={handleGenerate} disabled={loading}>
              {loading?<Spinner size={14}/>:"⚡ Generate Today's Sessions"}
            </button>
          </div>

          {view === "list" ? (
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {schedules.length===0 ? (
                <div style={{textAlign:"center",padding:"30px",color:"var(--muted)"}}>
                  No recurring schedules yet. Create one to auto-generate daily sessions.
                </div>
              ) : schedules.map(s => (
                <div key={s._id} style={{padding:"12px 14px",borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",background:"var(--surface2)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:"0.88rem",color:"var(--ink)"}}>{s.subject}</div>
                      <div style={{fontSize:"0.75rem",color:"var(--muted)",marginTop:2}}>
                        {s.daysOfWeek.map(d=>DAY_NAMES[d]).join(", ")} · {s.startTime} · {s.durationMinutes}min
                        {s.room && ` · ${s.room}`}
                      </div>
                    </div>
                    <button className="btn btn-ghost btn-sm" style={{color:"var(--red)"}} onClick={()=>handleDelete(s._id)}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div className="form-group">
                <label className="form-label">Subject *</label>
                <input className="form-input" value={form.subject} onChange={e=>setForm(f=>({...f,subject:e.target.value}))} placeholder="e.g. Mathematics"/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div className="form-group">
                  <label className="form-label">Room</label>
                  <input className="form-input" value={form.room} onChange={e=>setForm(f=>({...f,room:e.target.value}))} placeholder="Room 101"/>
                </div>
                <div className="form-group">
                  <label className="form-label">Start Time *</label>
                  <input className="form-input" type="time" value={form.startTime} onChange={e=>setForm(f=>({...f,startTime:e.target.value}))}/>
                </div>
                <div className="form-group">
                  <label className="form-label">Duration (min)</label>
                  <input className="form-input" type="number" value={form.durationMinutes} onChange={e=>setForm(f=>({...f,durationMinutes:parseInt(e.target.value)||60}))}/>
                </div>
                <div className="form-group">
                  <label className="form-label">Late After (min)</label>
                  <input className="form-input" type="number" value={form.lateAfterMinutes} onChange={e=>setForm(f=>({...f,lateAfterMinutes:parseInt(e.target.value)||15}))}/>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Days of Week *</label>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {DAY_NAMES.map((d,i) => (
                    <button key={i} type="button" onClick={()=>toggleDay(i)}
                      style={{padding:"6px 12px",borderRadius:"var(--radius-sm)",cursor:"pointer",fontWeight:700,fontSize:"0.82rem",
                        background:form.daysOfWeek.includes(i)?"var(--accent)":"var(--surface2)",
                        color:form.daysOfWeek.includes(i)?"#fff":"var(--muted)",
                        border:form.daysOfWeek.includes(i)?"none":"1px solid var(--border)"}}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div className="form-group">
                  <label className="form-label">Allowed Grades</label>
                  <input className="form-input" placeholder="Grade 11, Grade 12" value={form.allowedGrades} onChange={e=>setForm(f=>({...f,allowedGrades:e.target.value}))}/>
                </div>
                <div className="form-group">
                  <label className="form-label">Allowed Sections</label>
                  <input className="form-input" placeholder="STEM-A, HUMSS-B" value={form.allowedSections} onChange={e=>setForm(f=>({...f,allowedSections:e.target.value}))}/>
                </div>
              </div>
              <button className="btn btn-primary" onClick={handleCreate} disabled={loading}>
                {loading?<Spinner size={16}/>:"Save Recurring Schedule"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ATTENDANCE FORECAST PANEL ────────────────────────────────────────────────
function AttendanceForecastPanel({ onClose }) {
  const [forecast, setForecast] = useState([]);
  const [loading, setLoading] = useState(true);
  useEscKey(onClose);

  useEffect(() => {
    api.get("/academic/forecast")
      .then(d => setForecast(d.forecast||[]))
      .catch(()=>{})
      .finally(()=>setLoading(false));
  }, []);

  // Group by date
  const grouped = forecast.reduce((acc, f) => {
    if (!acc[f.date]) acc[f.date] = [];
    acc[f.date].push(f);
    return acc;
  }, {});

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{maxWidth:560,width:"96vw"}} onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">🔮 Attendance Forecast — Next 7 Days</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{padding:"10px 12px",background:"var(--accent-lt)",borderRadius:"var(--radius-sm)",fontSize:"0.8rem",color:"var(--accent)"}}>
            Predictions based on day-of-week patterns from the last 60 days. Accuracy improves with more session history.
          </div>
          {loading ? <div style={{textAlign:"center",padding:"30px"}}><Spinner size={24}/></div>
          : Object.keys(grouped).length === 0 ? (
            <div style={{textAlign:"center",padding:"30px",color:"var(--muted)"}}>
              Not enough session history to generate forecasts. Run at least 4 weeks of sessions first.
            </div>
          ) : Object.entries(grouped).map(([date, items]) => (
            <div key={date}>
              <div style={{fontWeight:700,fontSize:"0.82rem",color:"var(--muted)",textTransform:"uppercase",marginBottom:6}}>{date}</div>
              {items.map((item,i) => (
                <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",marginBottom:6,
                  borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",background:"var(--surface2)"}}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600,fontSize:"0.85rem",color:"var(--ink)"}}>{item.subject}</div>
                    <div style={{fontSize:"0.74rem",color:"var(--muted)",marginTop:2}}>
                      Historical absent rate: {item.historicalAbsentRate}%
                      {item.rosterSize > 0 && ` · Roster: ${item.rosterSize} students`}
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:"0.88rem",fontWeight:700,color:"var(--green)"}}>~{item.predictedCheckins} expected</div>
                    {item.predictedAbsents !== null && (
                      <div style={{fontSize:"0.74rem",color:"var(--red)"}}>~{item.predictedAbsents} absent</div>
                    )}
                  </div>
                  <div style={{padding:"2px 8px",borderRadius:20,fontSize:"0.7rem",fontWeight:700,
                    background:item.confidence==="medium"?"var(--accent-lt)":"var(--lgray)",
                    color:item.confidence==="medium"?"var(--accent)":"var(--muted)"}}>
                    {item.confidence}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── ACADEMIC YEAR MANAGER ────────────────────────────────────────────────────
function AcademicYearManager({ onClose }) {
  const [years, setYears]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [view, setView]               = useState("list"); // "list"|"create"|"promote"|"batch"
  const [actionLoading, setActionLoading] = useState(false);

  // Active year state
  const [activeYear, setActiveYear]   = useState(null);
  const [autoMsg, setAutoMsg]         = useState("");

  // Edit end date
  const [editEndDate, setEditEndDate] = useState("");
  const [editingEndDate, setEditingEndDate] = useState(false);

  // Promote wizard
  const [promoteTarget, setPromoteTarget] = useState(null);
  const [previewData, setPreviewData]     = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [promoteStep, setPromoteStep]     = useState(1);

  // Batch register
  const [batchRows, setBatchRows]         = useState([]);
  const [batchParsed, setBatchParsed]     = useState([]); // parsed from CSV
  const [batchLoading, setBatchLoading]   = useState(false);
  const [batchResult, setBatchResult]     = useState(null);
  const [batchDefaultPw, setBatchDefaultPw] = useState("AttendQR@2026");
  const [batchSection, setBatchSection]   = useState("");
  const [csvError, setCsvError]           = useState("");
  const batchFileRef = useRef(null);

  // Create form — hidden, only shown if no active year and user wants manual
  const [showCreate, setShowCreate]   = useState(false);
  const [form, setForm]               = useState({
    name: "", startDate: "", endDate: "", semester: "Full Year",
    gradeMap: [
      { fromGrade: "Grade 11", toGrade: "Grade 12"  },
      { fromGrade: "Grade 12", toGrade: "Graduated" },
    ],
  });

  useEscKey(onClose);

  // ── On mount: auto-ensure active year ──
  useEffect(() => {
    autoEnsure();
  }, []);

  const autoEnsure = async () => {
    setLoading(true);
    try {
      const d = await api.request("POST", "/academic/years/auto-ensure", {});
      if (d.created) setAutoMsg(`✨ Academic year ${d.year.name} was automatically created (June 8 start).`);
      else if (d.activated) setAutoMsg(`✅ Academic year ${d.year.name} re-activated.`);
      setActiveYear(d.year);
      setEditEndDate(d.year.endDate ? d.year.endDate.slice(0,10) : "");
      await loadYears();
    } catch(e) {
      await loadYears();
    } finally {
      setLoading(false);
    }
  };

  const loadYears = async () => {
    const d = await api.get("/academic/years");
    const ys = d.years || [];
    setYears(ys);
    const active = ys.find(y => y.isActive);
    if (active) {
      setActiveYear(active);
      setEditEndDate(active.endDate ? active.endDate.slice(0,10) : "");
    }
  };

  const handleSaveEndDate = async () => {
    if (!activeYear || !editEndDate) return;
    setActionLoading(true);
    try {
      const d = await api.request("PATCH", `/academic/years/${activeYear._id}/end-date`, { endDate: editEndDate });
      setActiveYear(d.year);
      setEditingEndDate(false);
      setAutoMsg("✅ End date updated.");
      await loadYears();
    } catch(e) { alert(e.message); }
    finally { setActionLoading(false); }
  };

  const handleActivate = async (id) => {
    setActionLoading(true);
    try {
      const d = await api.request("PATCH", `/academic/years/${id}/activate`);
      alert(d.message); await loadYears();
    } catch(e) { alert(e.message); }
    finally { setActionLoading(false); }
  };

  const handleArchive = async (id) => {
    if (!window.confirm("Archive this year? All sessions will be archived.")) return;
    setActionLoading(true);
    try {
      const d = await api.request("PATCH", `/academic/years/${id}/archive`);
      alert(d.message); await loadYears();
    } catch(e) { alert(e.message); }
    finally { setActionLoading(false); }
  };

  const handleCreate = async () => {
    if (!form.name || !form.startDate || !form.endDate) return alert("All fields required.");
    setActionLoading(true);
    try {
      await api.request("POST", "/academic/years", form);
      await loadYears(); setShowCreate(false);
    } catch(e) { alert(e.message); }
    finally { setActionLoading(false); }
  };

  const openPromoteWizard = async (year) => {
    setPromoteTarget(year);
    setPromoteStep(1);
    setPreviewData(null);
    setPreviewLoading(true);
    setView("promote");
    try {
      const d = await api.get(`/academic/years/${year._id}/preview-promote`);
      setPreviewData(d);
    } catch(e) { alert(e.message); setView("list"); }
    finally { setPreviewLoading(false); }
  };

  const handlePromote = async () => {
    if (!promoteTarget) return;
    setActionLoading(true);
    try {
      const d = await api.request("POST", `/academic/years/${promoteTarget._id}/promote`);
      alert(d.message);
      await loadYears(); setView("list"); setPromoteTarget(null); setPreviewData(null);
    } catch(e) { alert(e.message); }
    finally { setActionLoading(false); }
  };

  // ── Batch CSV Parsing ──
  const handleBatchCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCsvError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { setCsvError("CSV must have a header row and at least one student."); return; }
      const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g,"_"));
      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(",").map(v => v.trim().replace(/^"|"$/g,""));
        if (vals.length < 2 || !vals.join("").trim()) continue;
        const row = {};
        headers.forEach((h,j) => { row[h] = vals[j] || ""; });
        rows.push(row);
      }
      if (rows.length === 0) { setCsvError("No valid rows found."); return; }
      setBatchParsed(rows);
      setCsvError(`✓ ${rows.length} student${rows.length!==1?"s":""} parsed from CSV`);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const downloadTemplate = () => {
    const header = "name,email,student_id,section,strand";
    const sample = [
      "Juan dela Cruz,juan.delacruz@school.edu,2024-0001,Gold,STEM",
      "Maria Santos,maria.santos@school.edu,2024-0002,Silver,HUMSS",
    ];
    const csv = [header, ...sample].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "grade11_batch_template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleBatchRegister = async () => {
    const rows = batchParsed.length > 0 ? batchParsed : batchRows;
    if (rows.length === 0) return alert("No student data to register. Upload a CSV first.");
    if (!window.confirm(`Register ${rows.length} Grade 11 students? They will receive default password: ${batchDefaultPw}`)) return;
    setBatchLoading(true);
    try {
      const d = await api.request("POST", "/admin/batch-register", {
        students: rows.map(r => ({ ...r, section: r.section || batchSection || "" })),
        academicYear: activeYear?.name || "",
        defaultPassword: batchDefaultPw,
      });
      setBatchResult(d);
    } catch(e) { alert(e.message); }
    finally { setBatchLoading(false); }
  };

  // ── Manual row adder ──
  const addManualRow = () => setBatchRows(r => [...r, { name:"", email:"", student_id:"", section: batchSection, strand:"" }]);
  const updateRow = (i, field, val) => setBatchRows(r => { const n=[...r]; n[i]={...n[i],[field]:val}; return n; });
  const removeRow = (i) => setBatchRows(r => r.filter((_,j)=>j!==i));

  const C = {
    green: "var(--green)", amber: "var(--amber)", red: "var(--red)",
    muted: "var(--muted)", ink: "var(--ink)", border: "var(--border)",
    surface: "var(--surface)", surface2: "var(--surface2)",
    radius: "var(--radius-sm)", accent: "var(--accent)",
  };

  const pill = (label, color, bg) => (
    <span style={{ fontSize:"0.7rem", padding:"2px 8px", borderRadius:20, background: bg||color+"22", color, fontWeight:700, border:`1px solid ${color}` }}>{label}</span>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth:620, width:"96vw", maxHeight:"90vh", overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">📅 Academic Year Management</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display:"flex", flexDirection:"column", gap:14 }}>

          {/* Auto-create message */}
          {autoMsg && (
            <div style={{ padding:"10px 14px", borderRadius:C.radius, background:"var(--green-lt)", border:`1px solid ${C.green}`, fontSize:"0.83rem", color:C.ink }}>
              {autoMsg}
            </div>
          )}

          {/* Nav */}
          {view !== "promote" && (
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {[
                ["list",  "📋 School Years"],
                ["batch", "🎓 Register Grade 11"],
              ].map(([v,l]) => (
                <button key={v} className={`btn btn-sm ${view===v?"btn-primary":"btn-ghost"}`} onClick={()=>{ setView(v); setBatchResult(null); }}>
                  {l}
                </button>
              ))}
            </div>
          )}

          {/* ═══════════════ LIST VIEW ═══════════════ */}
          {view === "list" && (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

              {/* Active Year Card */}
              {loading ? <div style={{ textAlign:"center", padding:20 }}><Spinner size={22}/></div>
              : activeYear ? (
                <div style={{ padding:"16px", borderRadius:C.radius, border:`2px solid ${C.green}`, background:"var(--green-lt)" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10, flexWrap:"wrap" }}>
                    <div style={{ fontWeight:800, fontSize:"1rem", color:C.ink }}>{activeYear.name}</div>
                    {pill("● ACTIVE", C.green, C.green+"33")}
                    {activeYear.promotedAt && pill("✓ PROMOTED", C.amber)}
                  </div>

                  {/* Start date — fixed June 8 */}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                    <div>
                      <div style={{ fontSize:"0.72rem", color:C.muted, fontWeight:700, textTransform:"uppercase", marginBottom:3 }}>Start Date</div>
                      <div style={{ fontSize:"0.88rem", fontWeight:600, color:C.ink }}>
                        {new Date(activeYear.startDate).toLocaleDateString("en-PH",{month:"long",day:"numeric",year:"numeric"})}
                      </div>
                      <div style={{ fontSize:"0.72rem", color:C.muted }}>Fixed · June 8</div>
                    </div>
                    <div>
                      <div style={{ fontSize:"0.72rem", color:C.muted, fontWeight:700, textTransform:"uppercase", marginBottom:3 }}>End Date</div>
                      {editingEndDate ? (
                        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                          <input className="form-input" type="date" value={editEndDate}
                            onChange={e=>setEditEndDate(e.target.value)}
                            style={{ fontSize:"0.83rem", padding:"4px 8px" }}/>
                          <button className="btn btn-primary btn-sm" onClick={handleSaveEndDate} disabled={actionLoading}>
                            {actionLoading?<Spinner size={12}/>:"Save"}
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={()=>setEditingEndDate(false)}>✕</button>
                        </div>
                      ) : (
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <div style={{ fontSize:"0.88rem", fontWeight:600, color:C.ink }}>
                            {new Date(activeYear.endDate).toLocaleDateString("en-PH",{month:"long",day:"numeric",year:"numeric"})}
                          </div>
                          {!activeYear.promotedAt && (
                            <button className="btn btn-ghost btn-sm" style={{ fontSize:"0.72rem", padding:"2px 6px" }}
                              onClick={()=>setEditingEndDate(true)}>✏️ Edit</button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Grade map display */}
                  <div style={{ fontSize:"0.72rem", color:C.muted, marginBottom:8, fontWeight:700, textTransform:"uppercase" }}>Grade Promotion Map</div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
                    {(activeYear.gradeMap||[]).map((g,i)=>(
                      <span key={i} style={{ fontSize:"0.77rem", padding:"3px 10px", borderRadius:12,
                        background: g.toGrade.toLowerCase()==="graduated" ? "#fee":"var(--surface)",
                        color: g.toGrade.toLowerCase()==="graduated" ? C.red : C.ink,
                        border:`1px solid ${g.toGrade.toLowerCase()==="graduated" ? C.red : C.border}`,
                        fontWeight:600 }}>
                        {g.fromGrade} → {g.toGrade}
                      </span>
                    ))}
                  </div>

                  {/* Actions */}
                  {!activeYear.promotedAt && (
                    <button
                      className="btn btn-sm"
                      style={{ background:C.amber, color:"#fff", border:"none", cursor:"pointer", padding:"8px 16px", borderRadius:C.radius, fontWeight:700, fontSize:"0.83rem" }}
                      onClick={()=>openPromoteWizard(activeYear)} disabled={actionLoading}>
                      🎓 Promote School Year
                    </button>
                  )}
                  {activeYear.promotedAt && (
                    <div style={{ fontSize:"0.8rem", color:C.green, fontWeight:600 }}>
                      ✓ Promoted on {new Date(activeYear.promotedAt).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})}
                      {activeYear.promotedCount > 0 && ` · ${activeYear.promotedCount} advanced`}
                      {activeYear.graduatedCount > 0 && ` · ${activeYear.graduatedCount} graduated`}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding:"16px", borderRadius:C.radius, border:`1px dashed ${C.border}`, textAlign:"center", color:C.muted, fontSize:"0.85rem" }}>
                  No active academic year. Creating one automatically…
                </div>
              )}

              {/* Past years */}
              {years.filter(y => !y.isActive).length > 0 && (
                <div>
                  <div style={{ fontSize:"0.72rem", color:C.muted, fontWeight:700, textTransform:"uppercase", marginBottom:8 }}>Past Years</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {years.filter(y => !y.isActive).map(y => (
                      <div key={y._id} style={{ padding:"10px 14px", borderRadius:C.radius, border:`1px solid ${C.border}`, background:C.surface2, display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:700, fontSize:"0.85rem", color:C.ink, display:"flex", gap:8, alignItems:"center" }}>
                            {y.name}
                            {y.archivedAt && pill("ARCHIVED","var(--gray)")}
                            {y.promotedAt && pill("PROMOTED", C.amber)}
                          </div>
                          <div style={{ fontSize:"0.72rem", color:C.muted, marginTop:2 }}>
                            {new Date(y.startDate).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})} — {new Date(y.endDate).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})}
                          </div>
                          {y.promotionSummary?.length > 0 && (
                            <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>
                              {y.promotionSummary.map((s,i)=>(
                                <span key={i} style={{ fontSize:"0.7rem", padding:"1px 7px", borderRadius:10,
                                  background: s.graduated ? "#fee" : "var(--green-lt)",
                                  color: s.graduated ? C.red : C.green, fontWeight:600 }}>
                                  {s.fromGrade}→{s.toGrade}: {s.count}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        {!y.archivedAt && (
                          <button className="btn btn-ghost btn-sm" style={{ color:C.muted }} onClick={()=>handleArchive(y._id)} disabled={actionLoading}>📦 Archive</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Manual create toggle */}
              <button className="btn btn-ghost btn-sm" style={{ alignSelf:"flex-start", color:C.muted }}
                onClick={()=>setShowCreate(v=>!v)}>
                {showCreate ? "▲ Hide manual create" : "＋ Manually create a new year"}
              </button>

              {showCreate && (
                <div style={{ display:"flex", flexDirection:"column", gap:10, padding:"14px", borderRadius:C.radius, border:`1px solid ${C.border}`, background:C.surface2 }}>
                  <div style={{ fontWeight:700, fontSize:"0.85rem", color:C.ink }}>Create Academic Year Manually</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                    <div className="form-group" style={{ gridColumn:"1/-1" }}>
                      <label className="form-label">Year Name *</label>
                      <input className="form-input" placeholder="e.g. 2026-2027" value={form.name}
                        onChange={e=>setForm(f=>({...f,name:e.target.value}))}/>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Start Date *</label>
                      <input className="form-input" type="date" value={form.startDate}
                        onChange={e=>setForm(f=>({...f,startDate:e.target.value}))}/>
                    </div>
                    <div className="form-group">
                      <label className="form-label">End Date *</label>
                      <input className="form-input" type="date" value={form.endDate}
                        onChange={e=>setForm(f=>({...f,endDate:e.target.value}))}/>
                    </div>
                  </div>
                  <button className="btn btn-primary" onClick={handleCreate} disabled={actionLoading}>
                    {actionLoading?<Spinner size={16}/>:"Create Year"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════ PROMOTE WIZARD ═══════════════ */}
          {view === "promote" && promoteTarget && (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <button className="btn btn-ghost btn-sm" onClick={()=>{ setView("list"); setPromoteTarget(null); setPreviewData(null); }}>← Back</button>
                <div style={{ fontWeight:700, fontSize:"0.9rem", color:C.ink }}>🎓 Promote School Year — {promoteTarget.name}</div>
              </div>

              <div style={{ display:"flex", gap:0, borderRadius:C.radius, overflow:"hidden", border:`1px solid ${C.border}` }}>
                {[["1","Preview"],["2","Confirm"]].map(([num,label],i)=>(
                  <div key={num} style={{
                    flex:1, padding:"8px 12px", textAlign:"center",
                    background: promoteStep===i+1 ? C.accent : C.surface2,
                    color: promoteStep===i+1 ? "#fff" : C.muted,
                    fontSize:"0.78rem", fontWeight:600,
                    borderRight: i===0 ? `1px solid ${C.border}` : "none",
                  }}>Step {num}: {label}</div>
                ))}
              </div>

              {promoteStep === 1 && (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {previewLoading ? <div style={{ textAlign:"center", padding:24 }}><Spinner size={22}/></div>
                  : previewData ? (
                    <>
                      <div style={{ fontSize:"0.83rem", color:"var(--ink3)" }}>Changes that will happen when you promote:</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                        {previewData.preview.map((p,i)=>(
                          <div key={i} style={{
                            display:"flex", alignItems:"center", gap:10, padding:"10px 14px",
                            borderRadius:C.radius, background: p.isGraduating?"#fff5f5":C.surface,
                            border:`1px solid ${p.isGraduating?C.red:C.border}`,
                          }}>
                            <div style={{ flex:1 }}>
                              <div style={{ fontWeight:700, fontSize:"0.85rem", color:p.isGraduating?C.red:C.ink, display:"flex", alignItems:"center", gap:6 }}>
                                {p.fromGrade} <span style={{ color:C.muted, fontWeight:400 }}>→</span> {p.toGrade}
                                {p.isGraduating && <span style={{ fontSize:"0.7rem", padding:"1px 6px", borderRadius:10, background:C.red, color:"#fff" }}>Accounts Deleted</span>}
                              </div>
                              <div style={{ fontSize:"0.73rem", color:C.muted, marginTop:2 }}>
                                {p.count} student{p.count!==1?"s":""} affected
                                {p.isGraduating && " · Attendance records preserved"}
                              </div>
                            </div>
                            <div style={{ fontSize:"1.5rem", fontWeight:800, color:p.isGraduating?C.red:C.green }}>{p.count}</div>
                          </div>
                        ))}
                      </div>
                      {previewData.uncoveredCount > 0 && (
                        <div style={{ padding:"10px 14px", borderRadius:C.radius, background:"var(--amber-lt)", border:`1px solid ${C.amber}`, fontSize:"0.8rem", color:"var(--ink3)" }}>
                          ⚠️ <strong>{previewData.uncoveredCount}</strong> student{previewData.uncoveredCount!==1?"s":""} not in grade map — will not be promoted.
                        </div>
                      )}
                      <button className="btn btn-primary" onClick={()=>setPromoteStep(2)}>Continue →</button>
                    </>
                  ) : null}
                </div>
              )}

              {promoteStep === 2 && (
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  <div style={{ padding:16, borderRadius:C.radius, background:"#fff5f5", border:`2px solid ${C.red}` }}>
                    <div style={{ fontWeight:700, fontSize:"0.9rem", color:C.red, marginBottom:8 }}>⚠️ This cannot be undone</div>
                    <ul style={{ margin:0, paddingLeft:18, color:"var(--ink3)", fontSize:"0.83rem", lineHeight:1.7 }}>
                      <li>Grade 11 students → Grade 12</li>
                      <li>Grade 12 students → <strong>permanently deleted</strong></li>
                      <li>All attendance records of graduates are <strong>preserved</strong></li>
                    </ul>
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button className="btn btn-ghost" style={{ flex:1 }} onClick={()=>setPromoteStep(1)} disabled={actionLoading}>← Back</button>
                    <button className="btn btn-sm" disabled={actionLoading}
                      style={{ flex:2, background:C.red, color:"#fff", border:"none", cursor:"pointer", padding:"10px 16px", borderRadius:C.radius, fontWeight:700, fontSize:"0.88rem" }}
                      onClick={handlePromote}>
                      {actionLoading?<Spinner size={16}/>:"🎓 Confirm & Promote School Year"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════ BATCH REGISTER ═══════════════ */}
          {view === "batch" && (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

              {/* Context banner */}
              <div style={{ padding:"12px 14px", borderRadius:C.radius, background:"var(--accent-lt,#eff6ff)", border:`1px solid ${C.accent}`, fontSize:"0.82rem", color:C.ink }}>
                <strong>Register incoming Grade 11 students</strong> for academic year <strong>{activeYear?.name || "—"}</strong>.
                Students are auto-verified and must change their password on first login.
              </div>

              {/* Result */}
              {batchResult && (
                <div style={{ padding:"14px", borderRadius:C.radius, border:`1px solid ${C.green}`, background:"var(--green-lt)" }}>
                  <div style={{ fontWeight:700, color:C.green, marginBottom:6 }}>✅ {batchResult.message}</div>
                  <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                    <span style={{ fontSize:"0.78rem" }}>✓ Created: <strong>{batchResult.created?.length}</strong></span>
                    <span style={{ fontSize:"0.78rem" }}>⏭ Skipped: <strong>{batchResult.skipped?.length}</strong></span>
                    {batchResult.errors?.length > 0 && <span style={{ fontSize:"0.78rem", color:C.red }}>✗ Errors: <strong>{batchResult.errors?.length}</strong></span>}
                  </div>
                  <div style={{ fontSize:"0.77rem", marginTop:8, color:C.muted }}>
                    Default password: <code style={{ background:"var(--surface)", padding:"2px 6px", borderRadius:4 }}>{batchResult.defaultPassword}</code>
                    <span> — students must change this on first login.</span>
                  </div>
                  {batchResult.skipped?.length > 0 && (
                    <div style={{ marginTop:8, fontSize:"0.75rem", color:C.muted }}>
                      Skipped: {batchResult.skipped.slice(0,5).map(s=>s.email).join(", ")}{batchResult.skipped.length>5?` +${batchResult.skipped.length-5} more`:""}
                    </div>
                  )}
                  <button className="btn btn-ghost btn-sm" style={{ marginTop:10 }} onClick={()=>{ setBatchResult(null); setBatchParsed([]); setBatchRows([]); setCsvError(""); }}>
                    Register more students
                  </button>
                </div>
              )}

              {!batchResult && (
                <>
                  {/* Default password & section */}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                    <div className="form-group">
                      <label className="form-label">Default Section (optional)</label>
                      <input className="form-input" placeholder="e.g. Gold, STEM-A"
                        value={batchSection} onChange={e=>setBatchSection(e.target.value)}/>
                      <div style={{ fontSize:"0.72rem", color:C.muted, marginTop:3 }}>Applied when CSV has no section column</div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Default Password</label>
                      <input className="form-input" value={batchDefaultPw}
                        onChange={e=>setBatchDefaultPw(e.target.value)}/>
                      <div style={{ fontSize:"0.72rem", color:C.muted, marginTop:3 }}>Students must change on first login</div>
                    </div>
                  </div>

                  {/* CSV upload area */}
                  <div style={{ padding:"14px 16px", borderRadius:C.radius, border:`2px dashed ${C.border}`, background:C.surface2 }}>
                    <div style={{ fontWeight:700, fontSize:"0.85rem", color:C.ink, marginBottom:6 }}>📁 Upload CSV File</div>
                    <div style={{ fontSize:"0.78rem", color:C.muted, marginBottom:10 }}>
                      Required columns: <code>name</code>, <code>email</code> · Optional: <code>student_id</code>, <code>section</code>, <code>strand</code>
                    </div>
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      <button className="btn btn-primary btn-sm" onClick={()=>batchFileRef.current?.click()}>
                        📂 Choose CSV
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={downloadTemplate}>
                        ⬇ Download Template
                      </button>
                      <input ref={batchFileRef} type="file" accept=".csv,.txt" style={{ display:"none" }} onChange={handleBatchCSV}/>
                    </div>
                    {csvError && (
                      <div style={{ marginTop:8, fontSize:"0.8rem", color: csvError.startsWith("✓") ? C.green : C.red, fontWeight:600 }}>
                        {csvError}
                      </div>
                    )}

                    {/* Preview parsed rows */}
                    {batchParsed.length > 0 && (
                      <div style={{ marginTop:12 }}>
                        <div style={{ fontSize:"0.75rem", color:C.muted, fontWeight:700, marginBottom:6, textTransform:"uppercase" }}>
                          Preview ({batchParsed.length} students)
                        </div>
                        <div style={{ maxHeight:180, overflowY:"auto", display:"flex", flexDirection:"column", gap:4 }}>
                          {batchParsed.slice(0,10).map((r,i)=>(
                            <div key={i} style={{ display:"flex", gap:8, fontSize:"0.78rem", padding:"4px 8px", background:C.surface, borderRadius:4, border:`1px solid ${C.border}` }}>
                              <span style={{ flex:1, fontWeight:600 }}>{r.name||r.name_||"—"}</span>
                              <span style={{ flex:1, color:C.muted }}>{r.email||"—"}</span>
                              <span style={{ color:C.muted }}>{r.section||batchSection||"—"}</span>
                            </div>
                          ))}
                          {batchParsed.length > 10 && (
                            <div style={{ fontSize:"0.75rem", color:C.muted, textAlign:"center", padding:"4px" }}>
                              +{batchParsed.length-10} more rows
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Manual add fallback */}
                  <div>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                      <div style={{ fontSize:"0.8rem", color:C.muted, fontWeight:600 }}>Or add manually</div>
                      <button className="btn btn-ghost btn-sm" onClick={addManualRow}>＋ Add row</button>
                    </div>
                    {batchRows.length > 0 && (
                      <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:200, overflowY:"auto" }}>
                        <div style={{ display:"grid", gridTemplateColumns:"2fr 2fr 1fr 1fr auto", gap:4, fontSize:"0.72rem", color:C.muted, fontWeight:700, textTransform:"uppercase", padding:"0 2px" }}>
                          <span>Name</span><span>Email</span><span>Student ID</span><span>Section</span><span></span>
                        </div>
                        {batchRows.map((r,i)=>(
                          <div key={i} style={{ display:"grid", gridTemplateColumns:"2fr 2fr 1fr 1fr auto", gap:4 }}>
                            <input className="form-input" style={{ fontSize:"0.8rem", padding:"4px 8px" }} placeholder="Full name" value={r.name} onChange={e=>updateRow(i,"name",e.target.value)}/>
                            <input className="form-input" style={{ fontSize:"0.8rem", padding:"4px 8px" }} placeholder="Email" value={r.email} onChange={e=>updateRow(i,"email",e.target.value)}/>
                            <input className="form-input" style={{ fontSize:"0.8rem", padding:"4px 8px" }} placeholder="LRN/ID" value={r.student_id} onChange={e=>updateRow(i,"student_id",e.target.value)}/>
                            <input className="form-input" style={{ fontSize:"0.8rem", padding:"4px 8px" }} placeholder="Section" value={r.section} onChange={e=>updateRow(i,"section",e.target.value)}/>
                            <button onClick={()=>removeRow(i)} style={{ background:"none", border:"none", cursor:"pointer", color:C.red, fontSize:"1rem" }}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Submit */}
                  {(batchParsed.length > 0 || batchRows.length > 0) && (
                    <button className="btn btn-primary" onClick={handleBatchRegister} disabled={batchLoading}>
                      {batchLoading ? <Spinner size={16}/> : `🎓 Register ${batchParsed.length || batchRows.length} Grade 11 Students`}
                    </button>
                  )}
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function StudentDashboard() {
  const { user } = useAuth();
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showScanner, setShowScanner]  = useState(false);
  const [scanResult, setScanResult]    = useState(null); // { token, status }
  // "subject" | "date" — top-level grouping mode
  const [groupMode, setGroupMode] = useState("subject");
  // accordion open state
  const [openSubjects, setOpenSubjects] = useState({});
  const [openMonths, setOpenMonths]   = useState({});
  const [openDays, setOpenDays]       = useState({});
  const [showGraph, setShowGraph]     = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notifOpen, setNotifOpen]     = useState(false);
  const [sessions, setSessions]       = useState([]); // upcoming sessions for schedule

  useEffect(() => {
    api.get("/attendance/my")
      .then(d => { setAttendance(d.attendance || []); setLoading(false); })
      .catch(() => setLoading(false));
    // Load announcements as notifications
    api.get("/admin/announcements?role=student")
      .then(d => {
        const dismissed = JSON.parse(localStorage.getItem("dismissedAnn") || "[]");
        setNotifications((d.announcements || []).filter(a => !dismissed.includes(a._id)));
      }).catch(() => {});
    // Load active sessions for schedule view
    api.get("/attendance/my").then(d => {
      // Extract unique subjects for schedule
      const recs = d.attendance || [];
      const bySubject = {};
      recs.forEach(a => {
        const subj = a.session?.subject;
        if (subj && !bySubject[subj]) bySubject[subj] = a;
      });
      setSessions(Object.values(bySubject).slice(0, 5));
    }).catch(() => {});
  }, []);

  const present = attendance.filter(a => a.status === "present").length;
  const late    = attendance.filter(a => a.status === "late").length;
  const absent  = attendance.filter(a => a.status === "absent").length;
  const rate    = attendance.length > 0 ? Math.round((present / attendance.length) * 100) : 0;

  // Attendance streak — consecutive present/late days (no absences)
  const streak = (() => {
    const sorted = [...attendance]
      .filter(a => a.status === "present" || a.status === "late")
      .sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    if (!sorted.length) return 0;
    let count = 1;
    for (let i = 1; i < sorted.length; i++) {
      const dayDiff = Math.round(
        (new Date(sorted[i-1].timestamp) - new Date(sorted[i].timestamp)) / 86400000
      );
      if (dayDiff <= 3) count++; // allow weekends
      else break;
    }
    return count;
  })();

  // Absence warning — per subject
  const absenceBySubject = (() => {
    const map = {};
    attendance.forEach(a => {
      const subj = a.session?.subject || "Unknown";
      if (!map[subj]) map[subj] = { absent: 0, total: 0 };
      map[subj].total++;
      if (a.status === "absent") map[subj].absent++;
    });
    return map;
  })();
  const atRiskSubjects = Object.entries(absenceBySubject)
    .filter(([,v]) => v.absent >= 3)
    .map(([subj,v]) => ({ subj, absent: v.absent, total: v.total }));

  // Weekly chart data — last 8 weeks
  const weeklyData = (() => {
    const weeks = {};
    attendance.forEach(a => {
      const d = new Date(a.timestamp);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const key = weekStart.toISOString().split("T")[0];
      if (!weeks[key]) weeks[key] = { present: 0, late: 0, absent: 0 };
      if (a.status === "present") weeks[key].present++;
      else if (a.status === "late") weeks[key].late++;
      else if (a.status === "absent") weeks[key].absent++;
    });
    return Object.entries(weeks)
      .sort(([a],[b]) => a.localeCompare(b))
      .slice(-8)
      .map(([date, v]) => ({ date: date.slice(5), ...v, total: v.present + v.late + v.absent }));
  })();

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

  const handleScan = async (token) => {
    setShowScanner(false);
    setScanResult({ status: "loading", token });
    try {
      // Navigate to check-in page with token
      window.history.pushState({}, "", `/?token=${token}`);
      window.location.reload();
    } catch(e) {
      setScanResult({ status: "error", message: e.message });
    }
  };

  return (
    <div className="main">
      <div className="container">
        <div className="page-header">
          <div className="page-title-block">
            <h1 className="page-title">My Attendance</h1>
            <p className="page-sub">Track your class attendance history</p>
          </div>
          {/* Scan QR button */}
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {/* Notification Bell */}
            <div style={{ position:"relative" }}>
              <button onClick={() => setNotifOpen(o=>!o)} style={{
                background:"var(--surface2)", border:"1px solid var(--border)",
                borderRadius:"50%", width:38, height:38, cursor:"pointer",
                display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.1rem",
                color: notifications.length > 0 ? "var(--amber)" : "var(--muted)",
              }}>🔔</button>
              {notifications.length > 0 && (
                <span style={{ position:"absolute", top:-4, right:-4, background:"var(--red)",
                  color:"#fff", borderRadius:"50%", width:16, height:16,
                  fontSize:"0.65rem", fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  {notifications.length}
                </span>
              )}
              {notifOpen && (
                <div style={{ position:"absolute", right:0, top:"110%", width:300,
                  background:"var(--surface)", border:"1px solid var(--border)",
                  borderRadius:"var(--radius-sm)", boxShadow:"var(--shadow-md)", zIndex:200,
                  maxHeight:320, overflowY:"auto" }}>
                  <div style={{ padding:"10px 14px", fontWeight:700, fontSize:"0.82rem",
                    borderBottom:"1px solid var(--border)", color:"var(--ink)" }}>
                    Notifications {notifications.length > 0 && `(${notifications.length})`}
                  </div>
                  {notifications.length === 0 ? (
                    <div style={{ padding:"20px", textAlign:"center", color:"var(--muted)", fontSize:"0.83rem" }}>
                      No new notifications
                    </div>
                  ) : notifications.map(n => {
                    const colors = { info:"var(--accent)", warning:"var(--amber)", urgent:"var(--red)", success:"var(--green)" };
                    const icons  = { info:"ℹ️", warning:"⚠️", urgent:"🚨", success:"✅" };
                    return (
                      <div key={n._id} style={{ padding:"10px 14px", borderBottom:"1px solid var(--border)" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                          <span>{icons[n.type]||"ℹ️"}</span>
                          <span style={{ fontWeight:700, fontSize:"0.83rem", color:colors[n.type]||"var(--accent)" }}>{n.title}</span>
                        </div>
                        <div style={{ fontSize:"0.78rem", color:"var(--ink3)", lineHeight:1.5 }}>{n.message}</div>
                        <button onClick={() => {
                          const dismissed = JSON.parse(localStorage.getItem("dismissedAnn")||"[]");
                          localStorage.setItem("dismissedAnn", JSON.stringify([...dismissed, n._id]));
                          setNotifications(prev => prev.filter(x => x._id !== n._id));
                          api.request("POST", `/admin/announcements/${n._id}/read`).catch(()=>{});
                        }} style={{ fontSize:"0.7rem", color:"var(--muted)", background:"none", border:"none", cursor:"pointer", marginTop:4 }}>
                          Mark as read
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Graph toggle */}
            <button onClick={() => setShowGraph(g=>!g)}
              style={{ background: showGraph?"var(--accent)":"var(--surface2)",
                color: showGraph?"#fff":"var(--muted)",
                border:"1px solid var(--border)", borderRadius:"var(--radius-sm)",
                padding:"8px 14px", cursor:"pointer", fontSize:"0.82rem", fontWeight:600 }}>
              📈 {showGraph ? "Hide Graph" : "Show Graph"}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setShowScanner(true)}
              style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}
            >
              <span style={{ fontSize:"1.1rem" }}>📷</span>
              Scan QR Code
            </button>
          </div>
        </div>

        {/* Scanner modal */}
        {showScanner && (
          <QRScannerModal
            onClose={() => setShowScanner(false)}
            onScan={handleScan}
          />
        )}

        {/* Scan error */}
        {scanResult?.status === "error" && (
          <div style={{ padding:"12px 16px", background:"var(--red-lt)", border:"1px solid var(--red)", borderRadius:"var(--radius-sm)", marginBottom:16, display:"flex", alignItems:"center", gap:10 }}>
            <span>⚠️</span>
            <div style={{ flex:1, fontSize:"0.85rem", color:"var(--red)" }}>{scanResult.message}</div>
            <button onClick={() => setScanResult(null)} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--red)" }}>✕</button>
          </div>
        )}

        {/* Absence warning */}
        {atRiskSubjects.length > 0 && (
          <div style={{ padding:"12px 16px", background:"var(--red-lt)", border:"1px solid var(--red)",
            borderRadius:"var(--radius-sm)", marginBottom:16, display:"flex", gap:10, alignItems:"flex-start" }}>
            <span style={{ fontSize:"1.2rem", flexShrink:0 }}>⚠️</span>
            <div>
              <div style={{ fontWeight:700, fontSize:"0.88rem", color:"var(--red)", marginBottom:4 }}>
                Absence Warning — You are close to the limit in {atRiskSubjects.length} subject{atRiskSubjects.length!==1?"s":""}
              </div>
              {atRiskSubjects.map(s => (
                <div key={s.subj} style={{ fontSize:"0.8rem", color:"var(--red)", marginBottom:2 }}>
                  • {s.subj}: {s.absent} absence{s.absent!==1?"s":""}
                </div>
              ))}
            </div>
          </div>
        )}

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
          {/* Streak card */}
          <div className="stat-card" style={{ "--stat-color": streak >= 7 ? "var(--amber)" : "var(--purple, #6D28D9)" }}>
            <div className="stat-label">Streak</div>
            <div className="stat-value" style={{ display:"flex", alignItems:"center", gap:6 }}>
              {streak}
              <span style={{ fontSize:"1.2rem" }}>{streak >= 14 ? "🔥" : streak >= 7 ? "⭐" : "📅"}</span>
            </div>
            <div className="stat-sub">days present</div>
          </div>
        </div>

        {/* Personal attendance graph */}
        {showGraph && (
          <div style={{ background:"var(--surface2)", border:"1px solid var(--border)",
            borderRadius:"var(--radius-sm)", padding:"16px", marginBottom:16 }}>
            <div style={{ fontWeight:700, fontSize:"0.88rem", color:"var(--ink)", marginBottom:12 }}>
              📈 My Attendance Trend — Last 8 Weeks
            </div>
            {weeklyData.length === 0 ? (
              <div style={{ textAlign:"center", padding:"20px", color:"var(--muted)", fontSize:"0.83rem" }}>
                No data yet — scan QR codes to start tracking
              </div>
            ) : (
              <>
                <div style={{ display:"flex", alignItems:"flex-end", gap:6, height:80, marginBottom:8 }}>
                  {weeklyData.map((w, i) => {
                    const max = Math.max(...weeklyData.map(x => x.total), 1);
                    const h = Math.round((w.total / max) * 72);
                    const ph = w.total > 0 ? Math.round((w.present / w.total) * h) : 0;
                    const lh = w.total > 0 ? Math.round((w.late / w.total) * h) : 0;
                    const ah = h - ph - lh;
                    return (
                      <div key={w.date} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}
                        title={`${w.date}: ${w.present} present, ${w.late} late, ${w.absent} absent`}>
                        <div style={{ width:"100%", display:"flex", flexDirection:"column", justifyContent:"flex-end", height:72 }}>
                          <div style={{ width:"100%", borderRadius:"2px 2px 0 0", overflow:"hidden" }}>
                            {ah > 0 && <div style={{ height:ah, background:"var(--red)", opacity:0.8 }}/>}
                            {lh > 0 && <div style={{ height:lh, background:"var(--amber)", opacity:0.9 }}/>}
                            {ph > 0 && <div style={{ height:ph, background:"var(--green)", opacity:0.9 }}/>}
                          </div>
                        </div>
                        <div style={{ fontSize:"0.58rem", color:"var(--muted)", whiteSpace:"nowrap" }}>{w.date}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display:"flex", gap:12 }}>
                  {[["var(--green)","Present"],["var(--amber)","Late"],["var(--red)","Absent"]].map(([col,label]) => (
                    <span key={label} style={{ fontSize:"0.72rem", display:"flex", alignItems:"center", gap:4 }}>
                      <span style={{ width:10, height:10, background:col, borderRadius:2, display:"inline-block" }}/>
                      {label}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Class schedule — recent subjects */}
        {sessions.length > 0 && (
          <div style={{ background:"var(--surface2)", border:"1px solid var(--border)",
            borderRadius:"var(--radius-sm)", padding:"14px 16px", marginBottom:16 }}>
            <div style={{ fontWeight:700, fontSize:"0.88rem", color:"var(--ink)", marginBottom:10 }}>
              📅 My Subjects
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {sessions.map((a, i) => {
                const subj = a.session?.subject || "Unknown";
                const teacher = a.session?.teacher?.name || "";
                const recs = attendance.filter(r => r.session?.subject === subj);
                const p = recs.filter(r => r.status==="present").length;
                const t = recs.length;
                const r = t > 0 ? Math.round(p/t*100) : 0;
                return (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:10,
                    padding:"8px 10px", background:"var(--surface)", borderRadius:"var(--radius-sm)",
                    border:"1px solid var(--border)" }}>
                    <div style={{ width:32, height:32, borderRadius:8,
                      background:`hsl(${(subj.charCodeAt(0)*37)%360},60%,85%)`,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:"0.9rem", flexShrink:0 }}>
                      📚
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:600, fontSize:"0.85rem", color:"var(--ink)",
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{subj}</div>
                      {teacher && <div style={{ fontSize:"0.72rem", color:"var(--muted)" }}>{teacher}</div>}
                    </div>
                    <div style={{ textAlign:"right", flexShrink:0 }}>
                      <div style={{ fontSize:"0.82rem", fontWeight:700,
                        color: r>=80?"var(--green)":r>=60?"var(--amber)":"var(--red)" }}>{r}%</div>
                      <div style={{ fontSize:"0.68rem", color:"var(--muted)" }}>{t} sessions</div>
                    </div>
                    <div style={{ width:40, height:5, background:"var(--border)", borderRadius:3, overflow:"hidden", flexShrink:0 }}>
                      <div style={{ width:`${r}%`, height:"100%",
                        background: r>=80?"var(--green)":r>=60?"var(--amber)":"var(--red)", borderRadius:3 }}/>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
                      <button className="btn btn-excel btn-sm" onClick={e => { e.stopPropagation(); setTimeout(() => exportStudentBySubject(subjRecords, subj, user?.name), 0); }} title="Export this subject">⬇ CSV</button>
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
                                <button className="btn btn-excel btn-sm" onClick={e => { e.stopPropagation(); setTimeout(() => exportStudentByMonth(moRecords, mo, user?.name), 0); }} title="Export this month">⬇ CSV</button>
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
                      <button className="btn btn-excel btn-sm" onClick={e => { e.stopPropagation(); setTimeout(() => exportStudentByMonth(moRecords, mo, user?.name), 0); }} title="Export this month">⬇ CSV</button>
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
                <PasswordStrengthBar password={pwForm.newPassword} />
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

          <LoginHistorySection />
          <SecuritySettingsSection />
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
          <LoginHistorySection />
          <SecuritySettingsSection />
        </div>
      </div>
    </div>
  );
}


// ─── SECURITY SETTINGS SECTION ───────────────────────────────────────────────
function SecuritySettingsSection() {
  const { user, logout } = useAuth();
  const [twoFA, setTwoFA]           = useState(user?.twoFAEnabled || false);
  const [otpStep, setOtpStep]       = useState(false); // showing OTP input
  const [otp, setOtp]               = useState("");
  const [twoFALoading, setTwoFALoading] = useState(false);
  const [twoFAMsg, setTwoFAMsg]     = useState(null);
  const [sessions, setSessions]     = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [currentIP, setCurrentIP]   = useState("");
  const [showSessions, setShowSessions] = useState(false);
  const [sessionId]                 = useState(() => localStorage.getItem("sessionId") || "");

  // Load current IP — poll every 30 seconds
  useEffect(() => {
    const fetchIP = () => api.get("/security/my-ip").then(d => setCurrentIP(d.ip)).catch(()=>{});
    fetchIP(); // immediate on mount
    const interval = setInterval(fetchIP, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadSessions = async () => {
    setSessionsLoading(true);
    try {
      const d = await api.get("/security/sessions");
      setSessions(d.sessions || []);
      setShowSessions(true);
    } catch(e) {}
    finally { setSessionsLoading(false); }
  };

  const revokeSession = async (sid) => {
    try {
      await api.request("DELETE", `/security/sessions/${sid}`);
      setSessions(s => s.filter(x => x.sessionId !== sid));
    } catch(e) {}
  };

  const revokeAll = async () => {
    try {
      await api.request("DELETE", "/security/sessions/all", { currentSessionId: sessionId });
      setSessions(s => s.filter(x => x.sessionId === sessionId));
    } catch(e) {}
  };

  const handleToggle2FA = async () => {
    if (twoFA) {
      // Disable
      setTwoFALoading(true);
      try {
        await api.request("POST", "/security/2fa/disable");
        setTwoFA(false);
        setTwoFAMsg({ type:"success", text:"Two-factor authentication disabled." });
      } catch(e) { setTwoFAMsg({ type:"error", text: e.message }); }
      finally { setTwoFALoading(false); }
    } else {
      // Enable — send OTP first
      setTwoFALoading(true);
      try {
        await api.request("POST", "/security/2fa/enable");
        setOtpStep(true);
        setTwoFAMsg({ type:"info", text:"A verification code was sent to your email." });
      } catch(e) { setTwoFAMsg({ type:"error", text: e.message }); }
      finally { setTwoFALoading(false); }
    }
  };

  const handleConfirm2FA = async () => {
    if (!otp || otp.length !== 6) { setTwoFAMsg({ type:"error", text:"Enter the 6-digit code." }); return; }
    setTwoFALoading(true);
    try {
      await api.request("POST", "/security/2fa/confirm", { otp });
      setTwoFA(true); setOtpStep(false); setOtp("");
      setTwoFAMsg({ type:"success", text:"2FA enabled! Your account is now more secure." });
    } catch(e) { setTwoFAMsg({ type:"error", text: e.message }); }
    finally { setTwoFALoading(false); }
  };

  const formatRelative = (dt) => {
    const diff = Date.now() - new Date(dt);
    const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), d = Math.floor(diff / 86400000);
    if (m < 1) return "Just now";
    if (m < 60) return `${m}m ago`;
    if (h < 24) return `${h}h ago`;
    return `${d}d ago`;
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* Current IP */}
      <div className="settings-card">
        <div className="settings-card-title">🌐 Current IP Address</div>
        <div className="settings-card-sub">Your real-time detected IP address</div>
        <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", background:"var(--surface2)", borderRadius:"var(--radius-sm)", border:"1px solid var(--border)" }}>
          <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
            <span style={{ fontFamily:"var(--font-mono)", fontSize:"1rem", fontWeight:700, color:"var(--accent)", letterSpacing:"0.04em" }}>
              {currentIP || "Detecting…"}
            </span>
            <span style={{ fontSize:"0.68rem", color:"var(--muted)" }}>Updates every 30 seconds</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => api.get("/security/my-ip").then(d => setCurrentIP(d.ip)).catch(()=>{})} style={{ marginLeft:"auto" }} title="Refreshes automatically every 30 seconds">↻</button>
        </div>
      </div>

      {/* Trusted Device */}
      {user?.role === "student" && (
        <div className="settings-card">
          <div className="settings-card-title">📱 Trusted Device</div>
          <div className="settings-card-sub">This is the only device allowed to access your account</div>
          <div style={{ marginTop:12, padding:"12px 14px", background:"var(--surface2)", borderRadius:"var(--radius-sm)", border:"1px solid var(--border)" }}>
            {user?.trustedDevice?.browser ? (
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <span style={{ fontSize:"1.5rem" }}>💻</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:"0.88rem", color:"var(--ink)" }}>
                    {user.trustedDevice.label || "Primary Device"}
                    <span style={{ marginLeft:8, padding:"2px 8px", borderRadius:20, background:"var(--green-lt)", color:"var(--green)", fontSize:"0.68rem", fontWeight:700 }}>✓ Trusted</span>
                  </div>
                  <div style={{ fontSize:"0.75rem", color:"var(--muted)", marginTop:2 }}>
                    {user.trustedDevice.browser} · {user.trustedDevice.os}
                  </div>
                  <div style={{ fontSize:"0.72rem", color:"var(--muted)", marginTop:2 }}>
                    Registered: {user.trustedDevice.registeredAt ? new Date(user.trustedDevice.registeredAt).toLocaleDateString("en-PH", { month:"long", day:"numeric", year:"numeric" }) : "Unknown"}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ fontSize:"0.85rem", color:"var(--muted)", textAlign:"center", padding:"8px 0" }}>
                No trusted device registered yet. Your next login will register this device.
              </div>
            )}
          </div>
          <p style={{ fontSize:"0.78rem", color:"var(--muted)", marginTop:8 }}>
            If your device is lost or stolen, log in from the new device and submit a device change request to your administrator.
          </p>
        </div>
      )}

      {/* 2FA */}
      <div className="settings-card">
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
          <div>
            <div className="settings-card-title">🔐 Two-Factor Authentication</div>
            <div className="settings-card-sub">Require an email code every time you log in</div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:"0.78rem", fontWeight:700, color: twoFA ? "var(--green)" : "var(--muted)" }}>
              {twoFA ? "ON" : "OFF"}
            </span>
            <button
              onClick={handleToggle2FA}
              disabled={twoFALoading || otpStep}
              style={{
                width:44, height:24, borderRadius:12, border:"none", cursor:"pointer",
                background: twoFA ? "var(--green)" : "var(--border2)",
                position:"relative", transition:"background 0.2s",
              }}
            >
              <span style={{
                position:"absolute", top:3, left: twoFA ? 22 : 3,
                width:18, height:18, borderRadius:"50%", background:"#fff",
                transition:"left 0.2s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)"
              }}/>
            </button>
          </div>
        </div>
        {twoFAMsg && (
          <div style={{ padding:"8px 12px", borderRadius:"var(--radius-sm)", marginBottom:10, fontSize:"0.82rem", fontWeight:600,
            background: twoFAMsg.type === "error" ? "var(--red-lt)" : twoFAMsg.type === "success" ? "var(--green-lt)" : "var(--accent-lt)",
            color: twoFAMsg.type === "error" ? "var(--red)" : twoFAMsg.type === "success" ? "var(--green)" : "var(--accent)",
          }}>{twoFAMsg.text}</div>
        )}
        {otpStep && (
          <div style={{ display:"flex", flexDirection:"column", gap:10, padding:"14px 16px", background:"var(--surface2)", borderRadius:"var(--radius-sm)", border:"1px solid var(--border)" }}>
            <div style={{ fontSize:"0.82rem", color:"var(--ink3)", fontWeight:600 }}>Enter the 6-digit code sent to your email:</div>
            <div style={{ display:"flex", gap:8 }}>
              <input className="form-input" style={{ textAlign:"center", fontSize:"1.3rem", letterSpacing:"0.4em", fontWeight:700, flex:1 }}
                placeholder="000000" maxLength={6} value={otp}
                onChange={e => setOtp(e.target.value.replace(/[^0-9]/g,""))}
                onKeyDown={e => e.key === "Enter" && handleConfirm2FA()} autoFocus />
              <button className="btn btn-primary btn-sm" onClick={handleConfirm2FA} disabled={twoFALoading}>
                {twoFALoading ? <Spinner size={14}/> : "Confirm"}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setOtpStep(false); setOtp(""); setTwoFAMsg(null); }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Active Sessions */}
      <div className="settings-card">
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div className="settings-card-title">📱 Active Sessions</div>
            <div className="settings-card-sub">Devices currently logged into your account</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={showSessions ? () => setShowSessions(false) : loadSessions}>
            {sessionsLoading ? <Spinner size={14}/> : showSessions ? "Hide" : "View Sessions"}
          </button>
        </div>
        {showSessions && (
          <div style={{ marginTop:14, display:"flex", flexDirection:"column", gap:8 }}>
            {sessions.length === 0 ? (
              <div style={{ textAlign:"center", padding:"20px 0", color:"var(--muted)", fontSize:"0.85rem" }}>No active sessions found.</div>
            ) : sessions.map(s => {
              const isCurrent = s.sessionId === sessionId;
              return (
                <div key={s.sessionId} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", background:"var(--surface2)", borderRadius:"var(--radius-sm)", border:`1px solid ${isCurrent ? "var(--accent)" : "var(--border)"}` }}>
                  <span style={{ fontSize:"1.2rem" }}>{s.device === "mobile" ? "📱" : "💻"}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:"0.85rem", fontWeight:700, color:"var(--ink)", display:"flex", alignItems:"center", gap:6 }}>
                      {s.browser}
                      {isCurrent && <span style={{ fontSize:"0.68rem", background:"var(--accent)", color:"#fff", padding:"1px 7px", borderRadius:20, fontWeight:700 }}>This device</span>}
                    </div>
                    <div style={{ fontSize:"0.74rem", color:"var(--muted)", display:"flex", gap:8, flexWrap:"wrap", marginTop:2 }}>
                      <span>🖥 {s.os}</span>
                      {s.ip && <span style={{ fontFamily:"var(--font-mono)", fontSize:"0.7rem", background:"var(--surface3)", padding:"1px 5px", borderRadius:3 }}>{s.ip}</span>}
                      <span>· {formatRelative(s.lastSeenAt)}</span>
                    </div>
                  </div>
                  {!isCurrent && (
                    <button className="btn btn-ghost btn-sm" onClick={() => revokeSession(s.sessionId)} style={{ color:"var(--red)", fontSize:"0.78rem" }}>Revoke</button>
                  )}
                </div>
              );
            })}
            {sessions.filter(s => s.sessionId !== sessionId).length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={revokeAll} style={{ color:"var(--red)", alignSelf:"flex-end" }}>
                Revoke all other sessions
              </button>
            )}
          </div>
        )}
      </div>

    </div>
  );
}

// ─── DEVICE BLOCKED SCREEN ───────────────────────────────────────────────────
function DeviceBlockedScreen({ onBack, email }) {
  const [reason, setReason] = useState("");
  const [sent, setSent]     = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRequest = async () => {
    setLoading(true);
    try {
      await api.post("/auth/request-device", { reason, fingerprint: DEVICE_FP, email });
      setSent(true);
    } catch(e) {}
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"var(--bg)", padding:24 }}>
      <div className="auth-card" style={{ maxWidth:420, textAlign:"center" }}>
        <div style={{ fontSize:"3rem", marginBottom:16 }}>🔒</div>
        <h2 style={{ fontFamily:"var(--font-heading)", color:"var(--ink)", marginBottom:8 }}>Device Not Recognized</h2>
        {!sent ? (
          <>
            <p style={{ color:"var(--muted)", fontSize:"0.88rem", marginBottom:20, lineHeight:1.6 }}>
              This device is not registered for your account. For security, AttendQR only allows login from your registered device.<br/><br/>
              If your device was <strong>lost or stolen</strong>, you can request access from a new device below.
            </p>
            <div className="form-group" style={{ textAlign:"left" }}>
              <label className="form-label">Reason for new device request</label>
              <input className="form-input" placeholder="e.g. My phone was stolen, using school computer..."
                value={reason} onChange={e => setReason(e.target.value)} />
              <p className="form-hint">Your request will be reviewed by the administrator.</p>
            </div>
            <button className="btn btn-primary" style={{ width:"100%", marginBottom:10 }}
              onClick={handleRequest} disabled={loading || !reason.trim()}>
              {loading ? <Spinner /> : "📨 Submit Device Request"}
            </button>
            <button className="btn btn-ghost btn-sm" style={{ width:"100%" }} onClick={onBack}>← Back to Login</button>
          </>
        ) : (
          <>
            <div style={{ fontSize:"2.5rem", marginBottom:12 }}>✅</div>
            <p style={{ color:"var(--green)", fontWeight:700, marginBottom:8 }}>Request Submitted!</p>
            <p style={{ color:"var(--muted)", fontSize:"0.85rem", marginBottom:20 }}>
              Your request has been sent to the administrator. You will be notified when it is approved.
              Please contact your teacher or school office if you need immediate access.
            </p>
            <button className="btn btn-ghost btn-sm" style={{ width:"100%" }} onClick={onBack}>← Back to Login</button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── 2FA VERIFY SCREEN ───────────────────────────────────────────────────────
function TwoFAVerifyScreen({ tempToken, onSuccess }) {
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resent, setResent] = useState(false);

  const handleVerify = async () => {
    if (!otp || otp.length !== 6) { setError("Enter the 6-digit code from your email."); return; }
    setLoading(true); setError("");
    try {
      const data = await api.request("POST", "/security/2fa/verify", { otp, tempToken });
      onSuccess(data.token, data.user);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"var(--bg)", padding:24 }}>
      <div className="auth-card" style={{ maxWidth:400, textAlign:"center" }}>
        <div style={{ fontSize:"2.5rem", marginBottom:12 }}>🔐</div>
        <h2 style={{ fontFamily:"var(--font-heading)", color:"var(--ink)", marginBottom:8 }}>Two-Factor Authentication</h2>
        <p style={{ color:"var(--muted)", fontSize:"0.88rem", marginBottom:24 }}>
          A 6-digit code was sent to your email address. Enter it below to complete your login.
        </p>
        {error && <div style={{ padding:"10px 14px", background:"var(--red-lt)", border:"1px solid var(--red)", borderRadius:"var(--radius-sm)", color:"var(--red)", fontSize:"0.83rem", marginBottom:12 }}>{error}</div>}
        <input
          className="form-input"
          style={{ textAlign:"center", fontSize:"1.6rem", letterSpacing:"0.4em", fontWeight:700, marginBottom:16 }}
          placeholder="000000"
          maxLength={6}
          value={otp}
          onChange={e => setOtp(e.target.value.replace(/\D/g,""))}
          onKeyDown={e => e.key === "Enter" && handleVerify()}
          autoFocus
        />
        <button className="btn btn-primary" style={{ width:"100%", marginBottom:12 }} onClick={handleVerify} disabled={loading}>
          {loading ? <Spinner /> : "Verify Code"}
        </button>
        <button className="btn btn-ghost btn-sm" style={{ width:"100%" }} onClick={() => window.location.reload()}>
          ← Back to Login
        </button>
        {resent && <div style={{ fontSize:"0.78rem", color:"var(--green)", marginTop:8 }}>✓ New code sent to your email.</div>}
      </div>
    </div>
  );
}

// ─── ADMIN SETTINGS ──────────────────────────────────────────────────────────
function AdminSettings({ onBack }) {
  const { user } = useAuth();
  const [form, setForm]     = useState({ currentPassword:"", newPassword:"", confirmPassword:"" });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]       = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg(null);
    if (form.newPassword !== form.confirmPassword)
      return setMsg({ type:"error", text:"Passwords do not match." });
    if (form.newPassword.length < 6)
      return setMsg({ type:"error", text:"Password must be at least 6 characters." });
    setLoading(true);
    try {
      await api.request("PATCH", "/auth/change-password", {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      setMsg({ type:"success", text:"Password updated successfully." });
      setForm({ currentPassword:"", newPassword:"", confirmPassword:"" });
    } catch(e) {
      setMsg({ type:"error", text: e.message });
    } finally { setLoading(false); }
  };

  return (
    <div className="container" style={{ paddingTop:24, maxWidth:540 }}>
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom:20 }}>← Back to Dashboard</button>
      <div className="settings-card">
        <div className="settings-card-title">🔑 Change Password</div>
        <div className="settings-card-sub">Update your admin account password</div>
        {msg && <Alert type={msg.type} message={msg.text} />}
        <form onSubmit={handleSubmit} style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div className="form-group">
            <label className="form-label">Current Password</label>
            <input className="form-input" type="password" required
              placeholder="Enter current password"
              value={form.currentPassword}
              onChange={e => setForm(f => ({ ...f, currentPassword: e.target.value }))} />
          </div>
          <div className="divider-label"><span>New Password</span></div>
          <div className="form-group">
            <label className="form-label">New Password</label>
            <input className="form-input" type="password" required
              placeholder="Min. 6 characters"
              value={form.newPassword}
              onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))} />
            <PasswordStrengthBar password={form.newPassword} />
          </div>
          <div className="form-group">
            <label className="form-label">Confirm New Password</label>
            <input className="form-input" type="password" required
              placeholder="Repeat new password"
              value={form.confirmPassword}
              onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? <Spinner /> : "Change Password"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── ADMIN DASHBOARD ─────────────────────────────────────────────────────────

function AdminStatCard({ icon, label, value, sub, color }) {
  return (
    <div style={{
      background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"var(--radius-lg)",
      padding:"20px 24px", display:"flex", alignItems:"center", gap:16, boxShadow:"var(--shadow-xs)",
    }}>
      <div style={{ width:44, height:44, borderRadius:12, background:`${color}22`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.4rem", flexShrink:0 }}>{icon}</div>
      <div>
        <div style={{ fontSize:"1.6rem", fontWeight:800, color:"var(--ink)", lineHeight:1 }}>{value ?? <Spinner size={18}/>}</div>
        <div style={{ fontSize:"0.8rem", fontWeight:600, color:"var(--ink3)", marginTop:3 }}>{label}</div>
        {sub && <div style={{ fontSize:"0.72rem", color:"var(--muted)", marginTop:2 }}>{sub}</div>}
      </div>
    </div>
  );
}

function AdminBadge({ children, color }) {
  const colors = {
    green:  { bg:"var(--green-lt)",  text:"var(--green)" },
    red:    { bg:"var(--red-lt)",    text:"var(--red)" },
    amber:  { bg:"var(--amber-lt)",  text:"var(--amber)" },
    blue:   { bg:"var(--accent-lt)", text:"var(--accent)" },
    gray:   { bg:"var(--surface2)",  text:"var(--ink3)" },
  };
  const col = colors[color] || colors.gray;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", padding:"2px 9px", borderRadius:20, fontSize:"0.72rem", fontWeight:700, background:col.bg, color:col.text }}>
      {children}
    </span>
  );
}

function AdminUserRow({ user, onDelete, onVerify, onUnverify, onView, selected, onSelect }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:12, padding:"12px 16px",
      borderRadius:"var(--radius-sm)", border:`1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
      background: selected ? "var(--accent-lt)" : "var(--surface)", transition:"background 0.1s",
    }}>
      <input type="checkbox" checked={selected || false} onChange={() => onSelect && onSelect(user._id)}
        style={{ width:16, height:16, flexShrink:0, cursor:"pointer", accentColor:"var(--accent)" }} />
      <AvatarCircle name={user.name} picture={user.profilePicture} size={36} radius={18} fontSize="0.85rem" />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
          <span style={{ fontWeight:700, fontSize:"0.88rem", color:"var(--ink)" }}>{user.name}</span>
          <AdminBadge color={user.role === "teacher" ? "blue" : "gray"}>{user.role}</AdminBadge>
          {user.isVerified
            ? <AdminBadge color="green">✓ Verified</AdminBadge>
            : <AdminBadge color="amber">⚠ Unverified</AdminBadge>}
          {user.pendingDevices?.length > 0 && (
            <AdminBadge color="amber">📱 {user.pendingDevices.length} device req.</AdminBadge>
          )}
        </div>
        <div style={{ fontSize:"0.75rem", color:"var(--muted)", marginTop:2, display:"flex", gap:10, flexWrap:"wrap" }}>
          <span>{user.email}</span>
          {user.grade && <span>· {user.grade}</span>}
          {user.section && <span>· {user.section}</span>}
          {user.studentId && <span>· ID: {user.studentId}</span>}
          <span style={{ color:"var(--border2)" }}>· Joined {new Date(user.createdAt).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})}</span>
        </div>
      </div>
      <div style={{ display:"flex", gap:6, flexShrink:0 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => onView(user)} title="View details" style={{ fontSize:"0.8rem" }}>👁</button>
        {!user.isVerified
          ? <button className="btn btn-ghost btn-sm" onClick={() => onVerify(user._id)} style={{ color:"var(--green)", fontSize:"0.8rem" }} title="Manually verify">✓</button>
          : <button className="btn btn-ghost btn-sm" onClick={() => onUnverify(user._id)} style={{ color:"var(--amber)", fontSize:"0.8rem" }} title="Revoke verification">✗</button>}
        {!confirming
          ? <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(true)} style={{ color:"var(--red)", fontSize:"0.8rem" }} title="Delete">🗑</button>
          : <div style={{ display:"flex", gap:4 }}>
              <button className="btn btn-sm" onClick={() => onDelete(user._id)} style={{ background:"var(--red)", color:"#fff", border:"none", fontSize:"0.75rem", padding:"4px 10px" }}>Delete</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)} style={{ fontSize:"0.75rem" }}>Cancel</button>
            </div>}
      </div>
    </div>
  );
}

function AdminSessionRow({ session, onStop, onDelete }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:12, padding:"12px 16px",
      borderRadius:"var(--radius-sm)", border:"1px solid var(--border)",
      background:"var(--surface)",
    }}>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
          <span style={{ fontWeight:700, fontSize:"0.88rem", color:"var(--ink)" }}>{session.subject}</span>
          {session.isActive
            ? <AdminBadge color="green">● Live</AdminBadge>
            : session.endTime
              ? <AdminBadge color="gray">Ended</AdminBadge>
              : <AdminBadge color="amber">Idle</AdminBadge>}
          {session.room && <span style={{ fontSize:"0.75rem", color:"var(--muted)" }}>📍 {session.room}</span>}
        </div>
        <div style={{ fontSize:"0.75rem", color:"var(--muted)", marginTop:2, display:"flex", gap:10, flexWrap:"wrap" }}>
          <span>👤 {session.teacher?.name || "Unknown"}</span>
          <span>· {session.attendanceCount ?? 0} check-ins</span>
          <span>· Created {new Date(session.createdAt).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})}</span>
          {session.activatedAt && <span>· Started {new Date(session.activatedAt).toLocaleTimeString("en-PH",{hour:"2-digit",minute:"2-digit"})}</span>}
        </div>
      </div>
      <div style={{ display:"flex", gap:6, flexShrink:0 }}>
        {session.isActive && (
          !confirmStop
            ? <button className="btn btn-ghost btn-sm" onClick={() => setConfirmStop(true)} style={{ color:"var(--amber)", fontSize:"0.8rem" }}>⏹ Stop</button>
            : <div style={{ display:"flex", gap:4 }}>
                <button className="btn btn-sm" onClick={() => { onStop(session._id); setConfirmStop(false); }} style={{ background:"var(--amber)", color:"#fff", border:"none", fontSize:"0.75rem", padding:"4px 10px" }}>Confirm</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setConfirmStop(false)} style={{ fontSize:"0.75rem" }}>Cancel</button>
              </div>
        )}
        {!confirmDel
          ? <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDel(true)} style={{ color:"var(--red)", fontSize:"0.8rem" }}>🗑</button>
          : <div style={{ display:"flex", gap:4 }}>
              <button className="btn btn-sm" onClick={() => onDelete(session._id)} style={{ background:"var(--red)", color:"#fff", border:"none", fontSize:"0.75rem", padding:"4px 10px" }}>Delete</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDel(false)} style={{ fontSize:"0.75rem" }}>Cancel</button>
            </div>}
      </div>
    </div>
  );
}

function AdminUserDetailModal({ user, onClose, onDelete, onVerify, onUnverify, onResetPassword }) {
  useEscKey(onClose);
  const [confirming, setConfirming]   = useState(false);
  const [showPwForm, setShowPwForm]   = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [pwLoading, setPwLoading]     = useState(false);
  const [pwMsg, setPwMsg]             = useState(null);

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) { setPwMsg({ type:"error", text:"Min. 6 characters." }); return; }
    setPwLoading(true); setPwMsg(null);
    try {
      await onResetPassword(user._id, newPassword);
      setPwMsg({ type:"success", text:"Password updated successfully." });
      setNewPassword("");
      setShowPwForm(false);
    } catch(e) { setPwMsg({ type:"error", text: e.message }); }
    finally { setPwLoading(false); }
  };

  if (!user) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth:500, width:"92vw" }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">User Details</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ display:"flex", flexDirection:"column", gap:16, padding:"20px 24px" }}>

          {/* Avatar + name row */}
          <div style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 16px", background:"var(--surface2)", borderRadius:"var(--radius-sm)", border:"1px solid var(--border)" }}>
            <AvatarCircle name={user.name} picture={user.profilePicture} size={52} radius={26} fontSize="1.1rem" />
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:800, fontSize:"1rem", color:"var(--ink)", wordBreak:"break-word" }}>{user.name}</div>
              <div style={{ fontSize:"0.78rem", color:"var(--muted)", marginTop:2, wordBreak:"break-all" }}>{user.email}</div>
              <div style={{ display:"flex", gap:6, marginTop:6, flexWrap:"wrap" }}>
                <AdminBadge color={user.role === "teacher" ? "blue" : "gray"}>{user.role}</AdminBadge>
                {user.isVerified
                  ? <AdminBadge color="green">✓ Verified</AdminBadge>
                  : <AdminBadge color="amber">⚠ Unverified</AdminBadge>}
              </div>
            </div>
          </div>

          {/* Info grid */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            {[
              ["Student ID", user.studentId],
              ["Grade",      user.grade],
              ["Section",    user.section],
              ["Birthdate",  user.birthdate ? new Date(user.birthdate).toLocaleDateString("en-PH") : null],
              ["Phone",      user.phoneNumber],
              ["School",     user.school],
              ["Department", user.department],
              ["Joined",     new Date(user.createdAt).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})],
            ].filter(([,v]) => v).map(([label, val]) => (
              <div key={label} style={{ background:"var(--surface2)", borderRadius:"var(--radius-sm)", padding:"10px 12px", border:"1px solid var(--border)" }}>
                <div style={{ fontSize:"0.68rem", color:"var(--muted)", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4 }}>{label}</div>
                <div style={{ fontSize:"0.85rem", color:"var(--ink)", fontWeight:600, wordBreak:"break-word" }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Password reset */}
          <div style={{ background:"var(--surface2)", borderRadius:"var(--radius-sm)", border:"1px solid var(--border)", padding:"14px 16px" }}>
            {!showPwForm ? (
              <button className="btn btn-ghost btn-sm" onClick={() => setShowPwForm(true)} style={{ fontSize:"0.82rem", width:"100%" }}>
                🔑 Change Password
              </button>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                <div style={{ fontSize:"0.78rem", fontWeight:700, color:"var(--ink3)" }}>Set new password for {user.name}</div>
                <input className="form-input" type="password" style={{ fontSize:"0.85rem" }}
                  placeholder="New password (min. 6 characters)" value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleResetPassword()} />
                <div style={{ display:"flex", gap:8 }}>
                  <button className="btn btn-primary btn-sm" onClick={handleResetPassword} disabled={pwLoading} style={{ flex:1 }}>
                    {pwLoading ? <Spinner size={14}/> : "Save Password"}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setShowPwForm(false); setNewPassword(""); setPwMsg(null); }}>Cancel</button>
                </div>
                {pwMsg && (
                  <div style={{ fontSize:"0.78rem", color: pwMsg.type === "error" ? "var(--red)" : "var(--green)", fontWeight:600 }}>
                    {pwMsg.type === "error" ? "⚠ " : "✓ "}{pwMsg.text}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {!user.isVerified
              ? <button className="btn btn-primary btn-sm" onClick={() => { onVerify(user._id); onClose(); }}
                  style={{ background:"var(--green)", borderColor:"var(--green)", flex:1 }}>✓ Verify Account</button>
              : <button className="btn btn-ghost btn-sm" onClick={() => { onUnverify(user._id); onClose(); }}
                  style={{ color:"var(--amber)", flex:1 }}>✗ Revoke Verification</button>}
            {!confirming
              ? <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(true)}
                  style={{ color:"var(--red)" }}>🗑 Delete</button>
              : <>
                  <button className="btn btn-sm" onClick={() => { onDelete(user._id); onClose(); }}
                    style={{ background:"var(--red)", color:"#fff", border:"none" }}>Yes, delete</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>Cancel</button>
                </>}
          </div>

        </div>
      </div>
    </div>
  );
}

function AdminDashboard() {
  const [tab, setTab]           = useState("users");
  const [stats, setStats]       = useState(null);
  const [users, setUsers]       = useState([]);
  const [sessions, setSessions] = useState([]);
  const [deviceRequests, setDeviceRequests] = useState([]);
  const [deviceLoading, setDeviceLoading]   = useState(false);
  const [announcements, setAnnouncements]   = useState([]);
  const [annLoading, setAnnLoading]         = useState(false);
  const [annForm, setAnnForm]               = useState({ title:"", message:"", type:"info", targetRole:"all", pinned:false, expiresAt:"" });
  const [logs, setLogs]                     = useState([]);
  const [logsLoading, setLogsLoading]       = useState(false);
  const [activity, setActivity]             = useState([]);
  const [activityPeriod, setActivityPeriod] = useState("today");
  const [activityLoading, setActivityLoading] = useState(false);
  const [emailForm, setEmailForm]           = useState({ subject:"", message:"", targetRole:"all" });
  const [emailSending, setEmailSending]     = useState(false);
  const [globalQ, setGlobalQ]               = useState("");
  const [globalResults, setGlobalResults]   = useState(null);
  const [globalLoading, setGlobalLoading]   = useState(false);
  const [selectedIds, setSelectedIds]       = useState([]);
  const [analytics, setAnalytics]           = useState(null);
  const [leaderboard, setLeaderboard]       = useState([]);
  const [leaderboardFull, setLeaderboardFull]   = useState(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [showAcadYearMgr, setShowAcadYearMgr] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsDays, setAnalyticsDays]   = useState(30);
  const [riskData, setRiskData]             = useState(null);
  const [riskLoading, setRiskLoading]       = useState(false);
  const [riskFilter, setRiskFilter]         = useState("all");
  const [anomalies, setAnomalies]           = useState(null);
  const [anomalyLoading, setAnomalyLoading] = useState(false);
  const [aiSubTab, setAiSubTab]             = useState("analytics");
  const [loading, setLoading]   = useState(false);
  const [search, setSearch]     = useState("");
  const [roleFilter, setRoleFilter]     = useState("");
  const [verifiedFilter, setVerifiedFilter] = useState("");
  const [sessionFilter, setSessionFilter]   = useState("");
  const [toast, setToast]       = useState(null);
  const [viewUser, setViewUser] = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadStats = async () => {
    try { const d = await api.get("/admin/stats"); setStats(d.stats); } catch(e) {}
  };

  const loadUsers = async (forceRole = "") => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search)        params.set("search",   search);
      const role = forceRole || roleFilter;
      if (role)          params.set("role",      role);
      if (verifiedFilter !== "") params.set("verified", verifiedFilter);
      const d = await api.get(`/admin/users?${params}`);
      setUsers(d.users || []);
    } catch(e) { showToast(e.message, "error"); }
    finally { setLoading(false); }
  };

  const loadDeviceRequests = async () => {
    setDeviceLoading(true);
    try {
      const d = await api.get("/admin/device-requests");
      setDeviceRequests(d?.requests || []);
    } catch(e) { showToast(e.message, "error"); }
    finally { setDeviceLoading(false); }
  };

  const loadLeaderboard = async () => {
    setLeaderboardLoading(true);
    try {
      const d = await api.get("/academic/leaderboard");
      setLeaderboard(d.leaderboard||[]);
      setLeaderboardFull(d);
    }
    catch(e) { showToast(e.message,"error"); }
    finally { setLeaderboardLoading(false); }
  };

  const loadAnalytics = async (days = analyticsDays) => {
    setAnalyticsLoading(true);
    try { const d = await api.get(`/admin/analytics?days=${days}`); setAnalytics(d.analytics); }
    catch(e) { showToast(e.message, "error"); }
    finally { setAnalyticsLoading(false); }
  };

  const loadRisk = async () => {
    setRiskLoading(true);
    try { const d = await api.get("/admin/risk"); setRiskData(d); }
    catch(e) { showToast(e.message, "error"); }
    finally { setRiskLoading(false); }
  };

  const loadAnomalies = async () => {
    setAnomalyLoading(true);
    try { const d = await api.get("/admin/anomalies"); setAnomalies(d); }
    catch(e) { showToast(e.message, "error"); }
    finally { setAnomalyLoading(false); }
  };

  const loadAnnouncements = async () => {
    setAnnLoading(true);
    try { const d = await api.get("/admin/announcements"); setAnnouncements(d.announcements || []); }
    catch(e) { showToast(e.message, "error"); }
    finally { setAnnLoading(false); }
  };

  const handleCreateAnn = async () => {
    if (!annForm.title || !annForm.message) return showToast("Title and message required.", "error");
    try {
      await api.request("POST", "/admin/announcements", annForm);
      showToast("Announcement created ✓");
      setAnnForm({ title:"", message:"", type:"info", targetRole:"all", pinned:false, expiresAt:"" });
      loadAnnouncements();
    } catch(e) { showToast(e.message, "error"); }
  };

  const handleDeleteAnn = async (id) => {
    try { await api.request("DELETE", `/admin/announcements/${id}`); showToast("Deleted."); loadAnnouncements(); }
    catch(e) { showToast(e.message, "error"); }
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    try { const d = await api.get("/admin/logs"); setLogs(d.logs || []); }
    catch(e) { showToast(e.message, "error"); }
    finally { setLogsLoading(false); }
  };

  const loadActivity = async (period = activityPeriod) => {
    setActivityLoading(true);
    try { const d = await api.get(`/admin/activity?period=${period}`); setActivity(d.activity || []); }
    catch(e) { showToast(e.message, "error"); }
    finally { setActivityLoading(false); }
  };

  const handleEmailBlast = async () => {
    if (!emailForm.subject || !emailForm.message) return showToast("Subject and message required.", "error");
    setEmailSending(true);
    try {
      const d = await api.request("POST", "/admin/email-blast", emailForm);
      showToast(`✓ Email sent to ${d.sent} users`);
      setEmailForm({ subject:"", message:"", targetRole:"all" });
    } catch(e) { showToast(e.message, "error"); }
    finally { setEmailSending(false); }
  };

  const handleGlobalSearch = async (q) => {
    setGlobalQ(q);
    if (q.length < 2) { setGlobalResults(null); return; }
    setGlobalLoading(true);
    try { const d = await api.get(`/admin/search?q=${encodeURIComponent(q)}`); setGlobalResults(d); }
    catch(e) {} finally { setGlobalLoading(false); }
  };

  const handleBulkVerify = async () => {
    if (!selectedIds.length) return showToast("Select users first.", "error");
    try { const d = await api.request("POST", "/admin/bulk-verify-users", { ids: selectedIds }); showToast(d.message); setSelectedIds([]); loadUsers("student"); loadStats(); }
    catch(e) { showToast(e.message, "error"); }
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.length) return showToast("Select users first.", "error");
    try { const d = await api.request("POST", "/admin/bulk-delete-users", { ids: selectedIds }); showToast(d.message); setSelectedIds([]); loadUsers("student"); loadStats(); }
    catch(e) { showToast(e.message, "error"); }
  };

  const handleExportUsers = async () => {
    try {
      const d = await api.get("/admin/export-users");
      const users = d.users || [];
      // Build XLSX using SheetJS
      const loadXLSX = () => new Promise((resolve) => {
        if (window.XLSX) { resolve(window.XLSX); return; }
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
        s.onload = () => resolve(window.XLSX);
        document.head.appendChild(s);
      });
      const XLSX = await loadXLSX();
      const rows = users.map(u => ({
        Name: u.name, Email: u.email, Role: u.role,
        "Student ID": u.studentId || "", Grade: u.grade || "", Section: u.section || "",
        Verified: u.isVerified ? "Yes" : "No", School: u.school || "",
        Department: u.department || "", Joined: new Date(u.createdAt).toLocaleDateString("en-PH"),
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Users");
      XLSX.writeFile(wb, `AttendQR_Users_${new Date().toISOString().split("T")[0]}.xlsx`);
      showToast(`✓ Exported ${users.length} users`);
    } catch(e) { showToast(e.message, "error"); }
  };

  const handleApproveDevice = async (userId, fingerprint) => {
    try {
      await api.request("PATCH", `/admin/device-requests/${userId}/approve`, { fingerprint });
      showToast("Device approved ✓");
      loadDeviceRequests();
      loadStats();
    } catch(e) { showToast(e.message, "error"); }
  };

  const handleRejectDevice = async (userId, fingerprint) => {
    try {
      await api.request("DELETE", `/admin/device-requests/${userId}/reject`, { fingerprint });
      showToast("Device request rejected.");
      loadDeviceRequests();
    } catch(e) { showToast(e.message, "error"); }
  };

  const handleResetDevice = async (userId) => {
    try {
      await api.request("PATCH", `/admin/users/${userId}/reset-device`);
      showToast("Device policy reset. Student can login from any device once.");
      loadDeviceRequests();
    } catch(e) { showToast(e.message, "error"); }
  };



  const loadSessions = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (sessionFilter !== "") params.set("active", sessionFilter);
      if (search) params.set("search", search);
      const d = await api.get(`/admin/sessions?${params}`);
      setSessions(d.sessions || []);
    } catch(e) { showToast(e.message, "error"); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadStats(); }, []);
  useEffect(() => {
    if (tab === "users")          loadUsers("student");
    if (tab === "teachers")       loadUsers("teacher");
    if (tab === "sessions")       loadSessions();
    if (tab === "devices")        loadDeviceRequests();
    if (tab === "announcements")  loadAnnouncements();
    if (tab === "logs")           loadLogs();
    if (tab === "overview")       loadActivity(activityPeriod);
    if (tab === "ai")             { loadAnalytics(); loadRisk(); loadAnomalies(); }
    if (tab === "academic")       { loadLeaderboard(); }
  }, [tab, roleFilter, verifiedFilter, sessionFilter]);

  const handleSearch = (e) => {
    if (e.key === "Enter") {
      if (tab === "sessions") loadSessions();
      else if (tab === "teachers") loadUsers("teacher");
      else loadUsers("student");
    }
  };

  const handleDelete = async (id) => {
    try { await api.request("DELETE", `/admin/users/${id}`); showToast("Account deleted."); loadUsers(); loadStats(); }
    catch(e) { showToast(e.message, "error"); }
  };

  const handleVerify = async (id) => {
    try { await api.request("PATCH", `/admin/users/${id}/verify`); showToast("User verified ✓"); loadUsers(); loadStats(); }
    catch(e) { showToast(e.message, "error"); }
  };

  const handleUnverify = async (id) => {
    try { await api.request("PATCH", `/admin/users/${id}/unverify`); showToast("Verification revoked."); loadUsers(); loadStats(); }
    catch(e) { showToast(e.message, "error"); }
  };

  const handleStopSession = async (id) => {
    try { await api.request("PATCH", `/admin/sessions/${id}/stop`); showToast("Session stopped."); loadSessions(); loadStats(); }
    catch(e) { showToast(e.message, "error"); }
  };

  const handleDeleteSession = async (id) => {
    try { await api.request("DELETE", `/admin/sessions/${id}`); showToast("Session deleted."); loadSessions(); loadStats(); }
    catch(e) { showToast(e.message, "error"); }
  };

  const handleResetPassword = async (id, newPassword) => {
    await api.request("PATCH", `/admin/users/${id}/password`, { newPassword });
    showToast("Password updated ✓");
  };

  return (
    <div className="container" style={{ paddingTop:24, paddingBottom:40 }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position:"fixed", top:16, right:16, zIndex:9999,
          padding:"10px 18px", borderRadius:"var(--radius-sm)", fontWeight:600, fontSize:"0.85rem",
          background: toast.type === "error" ? "var(--red)" : "var(--green)", color:"#fff",
          boxShadow:"0 4px 20px rgba(0,0,0,0.3)", animation:"fadeIn 0.2s",
        }}>{toast.msg}</div>
      )}

      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:"1.5rem", fontWeight:800, color:"var(--ink)", margin:0 }}>🛡 Admin Panel</h1>
        <p style={{ color:"var(--muted)", margin:"4px 0 0", fontSize:"0.85rem" }}>Manage users, sessions, and system activity</p>
      </div>

      {/* Stat cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px, 1fr))", gap:12, marginBottom:28 }}>
        <AdminStatCard icon="👥" label="Total Students" value={stats?.totalStudents} color="#3b82f6"
          sub={`${stats?.verifiedStudents ?? "–"} verified · ${stats?.unverifiedStudents ?? "–"} pending`} />
        <AdminStatCard icon="🧑‍🏫" label="Teachers" value={stats?.totalTeachers} color="#8b5cf6" />
        <AdminStatCard icon="📋" label="Sessions" value={stats?.totalSessions} color="#f59e0b"
          sub={stats?.activeSessions ? `${stats.activeSessions} live now` : "None active"} />
        <AdminStatCard icon="✅" label="Attendance Records" value={stats?.totalAttendance} color="#10b981" />
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:4, borderBottom:"2px solid var(--border)", marginBottom:20 }}>
        {[["overview","📊 Overview"], ["ai","🤖 AI Insights"], ["academic","🎓 Academic"], ["users","👥 Students"], ["teachers","🧑‍🏫 Teachers"], ["sessions","📋 Sessions"], ["devices","📱 Devices"], ["announcements","📢 Announcements"], ["email","✉️ Email Blast"], ["logs","🗒 Logs"]].map(([key, label]) => (
          <button key={key} onClick={() => { setTab(key); setSearch(""); }} style={{
            padding:"8px 18px", fontWeight:700, fontSize:"0.85rem", border:"none", cursor:"pointer",
            background:"none", borderBottom: tab === key ? "2px solid var(--accent)" : "2px solid transparent",
            color: tab === key ? "var(--accent)" : "var(--muted)", marginBottom:"-2px", transition:"all 0.15s",
          }}>{label}</button>
        ))}
      </div>

      {/* Global search */}
      <div style={{ position:"relative", marginBottom:16 }}>
        <input className="form-input" style={{ width:"100%", padding:"10px 14px 10px 36px", fontSize:"0.9rem" }}
          placeholder="🔍 Search everything — users, sessions, student ID..."
          value={globalQ} onChange={e => handleGlobalSearch(e.target.value)} />
        {globalLoading && <div style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)" }}><Spinner size={16}/></div>}
        {globalResults && (globalResults.users?.length > 0 || globalResults.sessions?.length > 0) && (
          <div style={{ position:"absolute", top:"110%", left:0, right:0, background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"var(--radius-sm)", boxShadow:"var(--shadow-md)", zIndex:200, maxHeight:320, overflowY:"auto" }}>
            {globalResults.users?.length > 0 && (
              <>
                <div style={{ padding:"8px 14px 4px", fontSize:"0.72rem", fontWeight:700, color:"var(--muted)", textTransform:"uppercase" }}>Users</div>
                {globalResults.users.map(u => (
                  <div key={u._id} onClick={() => { setViewUser(u); setGlobalQ(""); setGlobalResults(null); }}
                    style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 14px", cursor:"pointer", borderBottom:"1px solid var(--border)" }}
                    onMouseEnter={e => e.currentTarget.style.background="var(--surface2)"}
                    onMouseLeave={e => e.currentTarget.style.background=""}>
                    <AvatarCircle name={u.name} picture={u.profilePicture} size={28} radius={14} fontSize="0.7rem"/>
                    <div>
                      <div style={{ fontSize:"0.85rem", fontWeight:600, color:"var(--ink)" }}>{u.name}</div>
                      <div style={{ fontSize:"0.72rem", color:"var(--muted)" }}>{u.email} · {u.role}{u.grade ? ` · ${u.grade}` : ""}</div>
                    </div>
                  </div>
                ))}
              </>
            )}
            {globalResults.sessions?.length > 0 && (
              <>
                <div style={{ padding:"8px 14px 4px", fontSize:"0.72rem", fontWeight:700, color:"var(--muted)", textTransform:"uppercase" }}>Sessions</div>
                {globalResults.sessions.map(s => (
                  <div key={s._id} style={{ padding:"8px 14px", borderBottom:"1px solid var(--border)" }}>
                    <div style={{ fontSize:"0.85rem", fontWeight:600, color:"var(--ink)" }}>{s.subject}</div>
                    <div style={{ fontSize:"0.72rem", color:"var(--muted)" }}>by {s.teacher?.name} {s.room ? `· ${s.room}` : ""}</div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Bulk action bar — shown when students selected */}
      {selectedIds.length > 0 && (
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:"var(--accent-lt)", border:"1px solid var(--accent)", borderRadius:"var(--radius-sm)", marginBottom:12 }}>
          <span style={{ fontSize:"0.85rem", fontWeight:700, color:"var(--accent)" }}>{selectedIds.length} selected</span>
          <button className="btn btn-primary btn-sm" style={{ background:"var(--green)", borderColor:"var(--green)" }} onClick={handleBulkVerify}>✓ Verify All</button>
          <button className="btn btn-ghost btn-sm" style={{ color:"var(--red)" }} onClick={handleBulkDelete}>🗑 Delete All</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelectedIds([])}>✕ Clear</button>
          <button className="btn btn-ghost btn-sm" onClick={handleExportUsers} style={{ marginLeft:"auto" }}>📥 Export Excel</button>
        </div>
      )}

      {/* Search + filters — only for user/teacher/session tabs */}
      {(tab === "users" || tab === "teachers" || tab === "sessions") && (
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        <input className="form-input" style={{ flex:1, minWidth:200, padding:"8px 12px", fontSize:"0.85rem" }}
          placeholder={tab === "sessions" ? "Search subject, teacher…" : tab === "teachers" ? "Search name, email…" : "Search name, email, student ID…"}
          value={search}
          onChange={e => { const v = e.target.value; setTimeout(() => setSearch(v), 0); }}
          onKeyDown={handleSearch} />
        <button className="btn btn-ghost btn-sm" onClick={() => tab === "sessions" ? loadSessions() : tab === "teachers" ? loadUsers("teacher") : loadUsers("student")}>Search</button>

        {(tab === "users" || tab === "teachers") && (
          <select className="form-input" style={{ padding:"8px 10px", fontSize:"0.82rem", width:"auto" }}
            value={verifiedFilter} onChange={e => setVerifiedFilter(e.target.value)}>
            <option value="">All status</option>
            <option value="true">Verified</option>
            <option value="false">Unverified</option>
          </select>
        )}

        {tab === "sessions" && (
          <select className="form-input" style={{ padding:"8px 10px", fontSize:"0.82rem", width:"auto" }}
            value={sessionFilter} onChange={e => setSessionFilter(e.target.value)}>
            <option value="">All sessions</option>
            <option value="true">Live only</option>
            <option value="false">Ended only</option>
          </select>
        )}

        <button className="btn btn-ghost btn-sm" onClick={() => tab === "sessions" ? loadSessions() : tab === "teachers" ? loadUsers("teacher") : loadUsers("student")} title="Refresh">↻</button>
      </div>
      )}

      {/* Content */}
      {loading && (tab === "users" || tab === "teachers" || tab === "sessions") && tab !== "ai" ? (
        <div style={{ display:"flex", justifyContent:"center", padding:"40px 0" }}><Spinner size={28} /></div>
      ) : (tab === "users" || tab === "teachers") ? (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {users.length === 0 ? (
            <div style={{ textAlign:"center", padding:"40px 0", color:"var(--muted)" }}>
              No {tab === "teachers" ? "teachers" : "students"} found.
            </div>
          ) : users.map(u => (
            <AdminUserRow key={u._id} user={u}
              onDelete={handleDelete} onVerify={handleVerify}
              onUnverify={handleUnverify} onView={setViewUser}
              selected={selectedIds.includes(u._id)}
              onSelect={(id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id])} />
          ))}
        </div>
      ) : tab === "sessions" ? (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {sessions.length === 0 ? (
            <div style={{ textAlign:"center", padding:"40px 0", color:"var(--muted)" }}>No sessions found.</div>
          ) : sessions.map(s => (
            <AdminSessionRow key={s._id} session={s}
              onStop={handleStopSession} onDelete={handleDeleteSession} />
          ))}
        </div>
      ) : tab === "devices" ? (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {deviceLoading ? (
            <div style={{ display:"flex", justifyContent:"center", padding:"40px 0" }}><Spinner size={24}/></div>
          ) : deviceRequests.length === 0 ? (
            <div style={{ textAlign:"center", padding:"40px 0", color:"var(--muted)" }}>
              <div style={{ fontSize:"2rem", marginBottom:8 }}>📱</div>
              <div style={{ fontWeight:600, color:"var(--ink3)" }}>No pending device requests</div>
            </div>
          ) : deviceRequests.map((req, i) => (
            <div key={`${req.userId}-${req.fingerprint}`} style={{
              padding:"14px 16px", borderRadius:"var(--radius-sm)",
              border:"1px solid var(--amber)", background:"var(--amber-lt)",
              display:"flex", flexDirection:"column", gap:10,
            }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                <span style={{ fontSize:"1.2rem" }}>{req.device === "mobile" ? "📱" : "💻"}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:"0.9rem", color:"var(--ink)" }}>
                    {req.userName}
                    <span style={{ fontSize:"0.75rem", color:"var(--muted)", fontWeight:400, marginLeft:8 }}>{req.userEmail}</span>
                  </div>
                  <div style={{ fontSize:"0.75rem", color:"var(--muted)", marginTop:2 }}>
                    {req.grade && <span>Grade: {req.grade} · </span>}
                    {req.section && <span>Section: {req.section} · </span>}
                    Requested: {new Date(req.requestedAt).toLocaleString("en-PH", { timeZone:"Asia/Manila", dateStyle:"medium", timeStyle:"short" })}
                  </div>
                </div>
                <AdminBadge color="amber">⏳ Pending</AdminBadge>
              </div>
              <div style={{ background:"var(--surface2)", borderRadius:"var(--radius-sm)", padding:"10px 12px", fontSize:"0.82rem" }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  <div><span style={{ color:"var(--muted)", fontWeight:600 }}>New Device: </span>{req.browser} · {req.os}</div>
                  <div><span style={{ color:"var(--muted)", fontWeight:600 }}>IP: </span><code style={{ fontSize:"0.78rem" }}>{req.ip}</code></div>
                  {req.trustedDevice?.browser && <div><span style={{ color:"var(--muted)", fontWeight:600 }}>Current Device: </span>{req.trustedDevice.browser}</div>}
                  {req.reason && <div style={{ gridColumn:"1/-1" }}><span style={{ color:"var(--muted)", fontWeight:600 }}>Reason: </span>{req.reason}</div>}
                </div>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button className="btn btn-primary btn-sm" style={{ background:"var(--green)", borderColor:"var(--green)", flex:1 }}
                  onClick={() => handleApproveDevice(req.userId, req.fingerprint)}>
                  ✓ Approve — Replace Trusted Device
                </button>
                <button className="btn btn-ghost btn-sm" style={{ color:"var(--red)" }}
                  onClick={() => handleRejectDevice(req.userId, req.fingerprint)}>
                  ✗ Reject
                </button>
                <button className="btn btn-ghost btn-sm" style={{ color:"var(--amber)", fontSize:"0.78rem" }}
                  onClick={() => handleResetDevice(req.userId)} title="Reset device policy — student can login once from any device">
                  🔓 Reset
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : tab === "ai" ? (
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

          {/* AI Sub-tabs */}
          <div style={{ display:"flex", gap:4, borderBottom:"2px solid var(--border)", marginBottom:4 }}>
            {[["analytics","📈 Analytics"], ["risk","⚠️ Risk Prediction"], ["anomalies","🔍 Anomaly Detection"]].map(([key, label]) => (
              <button key={key} onClick={() => setAiSubTab(key)} style={{
                padding:"7px 16px", fontWeight:700, fontSize:"0.82rem", border:"none", cursor:"pointer",
                background:"none", borderBottom: aiSubTab===key ? "2px solid var(--accent)" : "2px solid transparent",
                color: aiSubTab===key ? "var(--accent)" : "var(--muted)", marginBottom:"-2px", transition:"all 0.15s",
              }}>{label}</button>
            ))}
          </div>

          {/* ── ANALYTICS ── */}
          {aiSubTab === "analytics" && (
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                <span style={{ fontWeight:700, fontSize:"0.9rem", color:"var(--ink)" }}>Attendance Analytics</span>
                <div style={{ display:"flex", gap:6, marginLeft:"auto" }}>
                  {[7,14,30,60].map(d => (
                    <button key={d} className="btn btn-ghost btn-sm"
                      style={{ background: analyticsDays===d ? "var(--accent)" : undefined, color: analyticsDays===d ? "#fff" : undefined, border: analyticsDays===d ? "none" : undefined, fontSize:"0.78rem" }}
                      onClick={() => { setAnalyticsDays(d); loadAnalytics(d); }}>
                      {d}d
                    </button>
                  ))}
                  <button className="btn btn-ghost btn-sm" onClick={() => loadAnalytics(analyticsDays)}>↻</button>
                </div>
              </div>

              {analyticsLoading ? <div style={{ textAlign:"center", padding:"40px 0" }}><Spinner size={28}/></div>
              : !analytics ? <div style={{ textAlign:"center", padding:"40px 0", color:"var(--muted)" }}>Click ↻ to load analytics</div>
              : (
                <>
                  {/* Summary cards */}
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(160px, 1fr))", gap:10 }}>
                    {[
                      { label:"Total Check-ins", value:analytics?.totals.total, color:"var(--accent)" },
                      { label:"Present", value:analytics?.totals.present, color:"var(--green)" },
                      { label:"Late", value:analytics?.totals.late, color:"var(--amber)" },
                      { label:"On-time Rate", value:`${analytics?.totals.presentRate}%`, color:"var(--teal,#0D9488)" },
                    ].map(card => (
                      <div key={card.label} style={{ padding:"14px 16px", background:"var(--surface2)", borderRadius:"var(--radius-sm)", border:"1px solid var(--border)" }}>
                        <div style={{ fontSize:"0.72rem", color:"var(--muted)", fontWeight:700, textTransform:"uppercase", marginBottom:6 }}>{card.label}</div>
                        <div style={{ fontSize:"1.6rem", fontWeight:800, color:card.color }}>{card.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Daily trend chart — pure CSS bar chart */}
                  <div style={{ background:"var(--surface2)", borderRadius:"var(--radius-sm)", border:"1px solid var(--border)", padding:"16px" }}>
                    <div style={{ fontWeight:700, fontSize:"0.85rem", color:"var(--ink)", marginBottom:12 }}>Daily Attendance Trend</div>
                    <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:80, overflowX:"auto", paddingBottom:4 }}>
                      {analytics?.dailyTrend.map((d, i) => {
                        const maxVal = Math.max(...analytics?.dailyTrend.map(x => x.total), 1);
                        const h = Math.round((d.total / maxVal) * 72);
                        const ph = Math.round((d.present / d.total) * h);
                        return (
                          <div key={d._id} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2, minWidth:28, flex:1 }} title={`${d._id}: ${d.total} total`}>
                            <div style={{ width:"100%", display:"flex", flexDirection:"column", justifyContent:"flex-end", height:72 }}>
                              <div style={{ width:"100%", height:h, background:`linear-gradient(to top, var(--green) ${Math.round(ph/h*100)}%, var(--amber) 0%)`, borderRadius:"2px 2px 0 0", opacity:0.85 }}/>
                            </div>
                            <div style={{ fontSize:"0.58rem", color:"var(--muted)", whiteSpace:"nowrap" }}>
                              {d._id.slice(5)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display:"flex", gap:12, marginTop:8 }}>
                      <span style={{ fontSize:"0.72rem", display:"flex", alignItems:"center", gap:4 }}><span style={{ width:10, height:10, background:"var(--green)", borderRadius:2, display:"inline-block" }}/> Present</span>
                      <span style={{ fontSize:"0.72rem", display:"flex", alignItems:"center", gap:4 }}><span style={{ width:10, height:10, background:"var(--amber)", borderRadius:2, display:"inline-block" }}/> Late</span>
                    </div>
                  </div>

                  {/* Day of week heatmap */}
                  <div style={{ background:"var(--surface2)", borderRadius:"var(--radius-sm)", border:"1px solid var(--border)", padding:"16px" }}>
                    <div style={{ fontWeight:700, fontSize:"0.85rem", color:"var(--ink)", marginBottom:12 }}>Best Days for Attendance</div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:6 }}>
                      {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((day, i) => {
                        const dayData = analytics?.byDayOfWeek.find(d => d._id === i+1);
                        const total = dayData?.total || 0;
                        const maxDay = Math.max(...analytics?.byDayOfWeek.map(d => d.total), 1);
                        const intensity = total / maxDay;
                        return (
                          <div key={day} style={{ textAlign:"center" }}>
                            <div style={{ padding:"10px 4px", borderRadius:"var(--radius-sm)", background:`rgba(37,99,235,${intensity * 0.8 + 0.05})`, color: intensity > 0.5 ? "#fff" : "var(--ink)", fontSize:"0.78rem", fontWeight:700, marginBottom:4 }}>{total || 0}</div>
                            <div style={{ fontSize:"0.7rem", color:"var(--muted)" }}>{day}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Top subjects */}
                  {analytics?.bySubject.length > 0 && (
                    <div style={{ background:"var(--surface2)", borderRadius:"var(--radius-sm)", border:"1px solid var(--border)", padding:"16px" }}>
                      <div style={{ fontWeight:700, fontSize:"0.85rem", color:"var(--ink)", marginBottom:12 }}>Attendance by Subject</div>
                      {analytics?.bySubject.map((s, i) => {
                        const rate = s.total > 0 ? Math.round(s.present/s.total*100) : 0;
                        return (
                          <div key={s._id} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                            <div style={{ fontSize:"0.82rem", color:"var(--ink)", minWidth:120, fontWeight:600 }}>{s._id}</div>
                            <div style={{ flex:1, height:8, background:"var(--border)", borderRadius:4, overflow:"hidden" }}>
                              <div style={{ width:`${rate}%`, height:"100%", background: rate>=80?"var(--green)":rate>=60?"var(--amber)":"var(--red)", borderRadius:4, transition:"width 0.5s" }}/>
                            </div>
                            <div style={{ fontSize:"0.78rem", color:"var(--muted)", minWidth:50, textAlign:"right" }}>{rate}% ({s.total})</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── RISK PREDICTION ── */}
          {aiSubTab === "risk" && (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:"0.9rem", color:"var(--ink)" }}>⚠️ Attendance Risk Prediction</div>
                  <div style={{ fontSize:"0.78rem", color:"var(--muted)" }}>AI scoring based on absence rate, consecutive misses, and late patterns (last 30 days)</div>
                </div>
                <div style={{ display:"flex", gap:6, marginLeft:"auto" }}>
                  {[["all","All"],["high","🔴 High"],["medium","🟡 Medium"],["low","🟢 Low"]].map(([v,l]) => (
                    <button key={v} className="btn btn-ghost btn-sm" style={{ fontSize:"0.75rem",
                      background: riskFilter===v ? "var(--accent)" : undefined,
                      color: riskFilter===v ? "#fff" : undefined,
                      border: riskFilter===v ? "none" : undefined }}
                      onClick={() => setRiskFilter(v)}>{l}</button>
                  ))}
                  <button className="btn btn-ghost btn-sm" onClick={loadRisk}>↻</button>
                </div>
              </div>

              {/* Risk legend */}
              <div style={{ display:"flex", gap:12, padding:"10px 14px", background:"var(--surface2)", borderRadius:"var(--radius-sm)", border:"1px solid var(--border)", flexWrap:"wrap" }}>
                {[["high","var(--red)","var(--red-lt)","🔴 High Risk","Score 70-100 — Likely to fail"],["medium","var(--amber)","var(--amber-lt)","🟡 Medium Risk","Score 40-69 — Needs attention"],["low","var(--green)","var(--green-lt)","🟢 Low Risk","Score 0-39 — Attendance is fine"]].map(([l,col,bg,label,desc]) => (
                  <div key={l} style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ width:32, height:32, borderRadius:8, background:bg, border:`2px solid ${col}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"0.7rem", fontWeight:800, color:col }}>AI</div>
                    <div><div style={{ fontSize:"0.78rem", fontWeight:700, color:col }}>{label}</div><div style={{ fontSize:"0.7rem", color:"var(--muted)" }}>{desc}</div></div>
                  </div>
                ))}
              </div>

              {riskLoading ? <div style={{ textAlign:"center", padding:"40px 0" }}><Spinner size={28}/></div>
              : !riskData ? <div style={{ textAlign:"center", padding:"30px 0", color:"var(--muted)" }}>Click ↻ to run prediction</div>
              : (() => {
                const filtered = (riskData?.predictions || []).filter(p => riskFilter === "all" || p.riskLevel === riskFilter);
                return filtered.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"30px 0", color:"var(--muted)" }}>No students in this risk category.</div>
                ) : filtered.map(p => {
                  const colors = { high:["var(--red-lt)","var(--red)"], medium:["var(--amber-lt)","var(--amber)"], low:["var(--green-lt)","var(--green)"] };
                  const [bg, border] = colors[p.riskLevel];
                  return (
                    <div key={p._id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", borderRadius:"var(--radius-sm)", border:`1px solid ${border}`, background:bg }}>
                      <AvatarCircle name={p.name} picture={p.profilePicture} size={38} radius={19} fontSize="0.85rem"/>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:700, fontSize:"0.88rem", color:"var(--ink)" }}>{p.name}
                          {p.grade && <span style={{ fontSize:"0.74rem", color:"var(--muted)", fontWeight:400, marginLeft:8 }}>{p.grade} · {p.section}</span>}
                        </div>
                        <div style={{ display:"flex", gap:10, fontSize:"0.74rem", color:"var(--muted)", marginTop:3, flexWrap:"wrap" }}>
                          <span>✅ {p.attended}/{p.totalSessions} sessions</span>
                          <span>📊 {p.attendanceRate}% rate</span>
                          {p.daysSinceLastSeen < 999 && <span>🕐 Last seen {p.daysSinceLastSeen}d ago</span>}
                          {p.daysSinceLastSeen === 999 && <span style={{ color:"var(--red)", fontWeight:600 }}>Never attended</span>}
                        </div>
                      </div>
                      {/* Risk score gauge */}
                      <div style={{ textAlign:"center", flexShrink:0 }}>
                        <div style={{ fontSize:"1.4rem", fontWeight:800, color:border }}>{p.riskScore}</div>
                        <div style={{ fontSize:"0.68rem", color:"var(--muted)", textTransform:"uppercase", fontWeight:700 }}>Risk</div>
                        <div style={{ width:48, height:4, background:"var(--border)", borderRadius:2, marginTop:4, overflow:"hidden" }}>
                          <div style={{ width:`${p.riskScore}%`, height:"100%", background:border, borderRadius:2 }}/>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}

          {/* ── ANOMALY DETECTION ── */}
          {aiSubTab === "anomalies" && (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:"0.9rem", color:"var(--ink)" }}>🔍 Anomaly Detection</div>
                  <div style={{ fontSize:"0.78rem", color:"var(--muted)" }}>Suspicious patterns detected in the last 7 days — shared IPs, rapid check-ins, off-hours, outliers</div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={loadAnomalies} style={{ marginLeft:"auto" }}>↻ Scan Now</button>
              </div>

              {anomalyLoading ? <div style={{ textAlign:"center", padding:"40px 0" }}><Spinner size={28}/></div>
              : !anomalies ? <div style={{ textAlign:"center", padding:"30px 0", color:"var(--muted)" }}>Click ↻ Scan Now to run detection</div>
              : anomalies?.anomalies?.length === 0 ? (
                <div style={{ textAlign:"center", padding:"32px 0" }}>
                  <div style={{ fontSize:"2.5rem", marginBottom:10 }}>✅</div>
                  <div style={{ fontWeight:700, color:"var(--green)", fontSize:"0.95rem" }}>No anomalies detected</div>
                  <div style={{ fontSize:"0.82rem", color:"var(--muted)", marginTop:4 }}>All check-in patterns look normal for the past 7 days.</div>
                </div>
              ) : (
                <>
                  <div style={{ padding:"10px 14px", background:"var(--red-lt)", border:"1px solid var(--red)", borderRadius:"var(--radius-sm)", fontSize:"0.83rem", color:"var(--red)", fontWeight:600 }}>
                    ⚠ {anomalies?.anomalies.length} anomal{anomalies?.anomalies.length!==1?"ies":"y"} detected — review immediately
                  </div>
                  {anomalies?.anomalies.map((a, i) => {
                    const sevColors = { high:["var(--red-lt)","var(--red)"], medium:["var(--amber-lt)","var(--amber)"], low:["var(--surface2)","var(--border)"] };
                    const typeIcons = { SHARED_IP:"🌐", RAPID_CHECKINS:"⚡", OFF_HOURS:"🌙", STATISTICAL_OUTLIER:"📊" };
                    const [bg, border] = sevColors[a.severity] || sevColors.low;
                    return (
                      <div key={i} style={{ padding:"14px 16px", borderRadius:"var(--radius-sm)", border:`1px solid ${border}`, background:bg }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                          <span style={{ fontSize:"1.1rem" }}>{typeIcons[a.type] || "⚠"}</span>
                          <span style={{ fontWeight:700, fontSize:"0.88rem", color:"var(--ink)" }}>{a.title}</span>
                          <AdminBadge color={a.severity==="high"?"red":a.severity==="medium"?"amber":"gray"}>{a.severity.toUpperCase()}</AdminBadge>
                          <span style={{ fontSize:"0.72rem", color:"var(--muted)", marginLeft:"auto" }}>
                            {new Date(a.detectedAt).toLocaleString("en-PH",{timeZone:"Asia/Manila",dateStyle:"short",timeStyle:"short"})}
                          </span>
                        </div>
                        <div style={{ fontSize:"0.83rem", color:"var(--ink3)", marginBottom: a.students?.length ? 8 : 0 }}>{a.description}</div>
                        {a.students?.length > 0 && (
                          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                            {a.students.map(s => (
                              <span key={s.email} style={{ fontSize:"0.74rem", padding:"2px 8px", background:"var(--surface)", borderRadius:20, border:"1px solid var(--border)", color:"var(--ink3)" }}>{s.name}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

        </div>
      
) : tab === "academic" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Header row */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--ink)" }}>🎓 Academic Management</div>
              <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Manage school years, promote students, and view section attendance rankings</div>
            </div>
            <button className="btn btn-primary btn-sm" style={{ marginLeft: "auto" }} onClick={() => setShowAcadYearMgr(true)}>
              📅 Manage Academic Years
            </button>
          </div>

          {/* Active year banner */}
          {(() => {
            const activeYear = null; // loaded below via leaderboard fetch — placeholder
            return null;
          })()}

          {/* Section Leaderboard */}
          <AdminLeaderboardPanel data={leaderboardFull} loading={leaderboardLoading} onRefresh={loadLeaderboard} />

          {/* Academic Year Manager Modal */}
          {showAcadYearMgr && (
            <AcademicYearManager onClose={() => { setShowAcadYearMgr(false); loadLeaderboard(); }} />
          )}
        </div>

      ) : tab === "overview" ? (
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {/* Period selector */}
          <div style={{ display:"flex", gap:8 }}>
            {[["today","Today"],["week","This Week"],["month","This Month"]].map(([v,l]) => (
              <button key={v} className="btn btn-ghost btn-sm"
                style={{ background: activityPeriod===v ? "var(--accent)" : undefined, color: activityPeriod===v ? "#fff" : undefined, border: activityPeriod===v ? "none" : undefined }}
                onClick={() => { setActivityPeriod(v); loadActivity(v); }}>{l}</button>
            ))}
            <button className="btn btn-ghost btn-sm" onClick={() => loadActivity(activityPeriod)}>↻ Refresh</button>
          </div>
          {activityLoading ? <div style={{ textAlign:"center", padding:"40px 0" }}><Spinner size={24}/></div> : activity.length === 0 ? (
            <div style={{ textAlign:"center", padding:"40px 0", color:"var(--muted)" }}>No login activity for this period.</div>
          ) : activity.map((a, i) => (
            <div key={a._id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", borderRadius:"var(--radius-sm)", border:"1px solid var(--border)", background:"var(--surface)" }}>
              <AvatarCircle name={a.name} picture={a.profilePicture} size={36} radius={18} fontSize="0.85rem"/>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:"0.88rem", color:"var(--ink)" }}>{a.name}
                  <AdminBadge color={a.role==="teacher"?"blue":"gray"} >{a.role}</AdminBadge>
                </div>
                <div style={{ fontSize:"0.75rem", color:"var(--muted)", marginTop:2 }}>
                  {a.email} {a.grade ? `· ${a.grade} ${a.section||""}` : ""}
                </div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:"0.82rem", fontWeight:700, color:"var(--accent)" }}>{a.loginCount} login{a.loginCount!==1?"s":""}</div>
                <div style={{ fontSize:"0.72rem", color:"var(--muted)" }}>{a.lastBrowser}</div>
                <div style={{ fontSize:"0.7rem", fontFamily:"var(--font-mono)", color:"var(--muted)" }}>{a.lastIP}</div>
              </div>
            </div>
          ))}
        </div>

      ) : tab === "announcements" ? (
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {/* Create form */}
          <div style={{ padding:"16px", background:"var(--surface2)", borderRadius:"var(--radius-sm)", border:"1px solid var(--border)" }}>
            <div style={{ fontWeight:700, fontSize:"0.9rem", color:"var(--ink)", marginBottom:12 }}>📢 New Announcement</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
              <div className="form-group" style={{ marginBottom:0 }}>
                <label className="form-label">Title</label>
                <input className="form-input" placeholder="Announcement title" value={annForm.title} onChange={e=>setAnnForm(f=>({...f,title:e.target.value}))}/>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <div className="form-group" style={{ marginBottom:0, flex:1 }}>
                  <label className="form-label">Type</label>
                  <select className="form-input" value={annForm.type} onChange={e=>setAnnForm(f=>({...f,type:e.target.value}))}>
                    <option value="info">ℹ Info</option>
                    <option value="warning">⚠ Warning</option>
                    <option value="urgent">🚨 Urgent</option>
                    <option value="success">✅ Success</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom:0, flex:1 }}>
                  <label className="form-label">Target</label>
                  <select className="form-input" value={annForm.targetRole} onChange={e=>setAnnForm(f=>({...f,targetRole:e.target.value}))}>
                    <option value="all">Everyone</option>
                    <option value="student">Students only</option>
                    <option value="teacher">Teachers only</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom:10 }}>
              <label className="form-label">Message</label>
              <textarea className="form-input" rows={3} placeholder="Announcement message..." value={annForm.message} onChange={e=>setAnnForm(f=>({...f,message:e.target.value}))} style={{ resize:"vertical" }}/>
            </div>
            <div style={{ display:"flex", gap:10, alignItems:"center" }}>
              <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:"0.82rem", cursor:"pointer" }}>
                <input type="checkbox" checked={annForm.pinned} onChange={e=>setAnnForm(f=>({...f,pinned:e.target.checked}))}/> 📌 Pin this announcement
              </label>
              <button className="btn btn-primary btn-sm" onClick={handleCreateAnn} style={{ marginLeft:"auto" }}>Post Announcement</button>
            </div>
          </div>
          {/* List */}
          {annLoading ? <div style={{ textAlign:"center" }}><Spinner size={22}/></div> : announcements.length === 0 ? (
            <div style={{ textAlign:"center", padding:"30px 0", color:"var(--muted)" }}>No announcements yet.</div>
          ) : announcements.map(a => {
            const colors = { info:["var(--accent-lt)","var(--accent)"], warning:["var(--amber-lt)","var(--amber)"], urgent:["var(--red-lt)","var(--red)"], success:["var(--green-lt)","var(--green)"] };
            const [bg, border] = colors[a.type] || colors.info;
            return (
              <div key={a._id} style={{ padding:"14px 16px", borderRadius:"var(--radius-sm)", background:bg, border:`1px solid ${border}` }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                  {a.pinned && <span>📌</span>}
                  <span style={{ fontWeight:700, color:"var(--ink)", fontSize:"0.9rem" }}>{a.title}</span>
                  <AdminBadge color={a.type==="info"?"blue":a.type==="warning"?"amber":a.type==="urgent"?"red":"green"}>{a.type}</AdminBadge>
                  <AdminBadge color="gray">{a.targetRole}</AdminBadge>
                  <button className="btn btn-ghost btn-sm" onClick={()=>handleDeleteAnn(a._id)} style={{ marginLeft:"auto", color:"var(--red)", fontSize:"0.75rem" }}>🗑</button>
                </div>
                <div style={{ fontSize:"0.85rem", color:"var(--ink3)", lineHeight:1.6 }}>{a.message}</div>
                <div style={{ fontSize:"0.72rem", color:"var(--muted)", marginTop:6 }}>by {a.author?.name} · {new Date(a.createdAt).toLocaleString("en-PH",{timeZone:"Asia/Manila",dateStyle:"medium",timeStyle:"short"})}</div>
              </div>
            );
          })}
        </div>

      ) : tab === "email" ? (
        <div style={{ display:"flex", flexDirection:"column", gap:14, maxWidth:600 }}>
          <div style={{ padding:"4px 0 12px", borderBottom:"1px solid var(--border)" }}>
            <div style={{ fontWeight:700, fontSize:"1rem", color:"var(--ink)" }}>✉️ Email Blast</div>
            <div style={{ fontSize:"0.82rem", color:"var(--muted)", marginTop:4 }}>Send an email to all verified students, teachers, or everyone.</div>
          </div>
          <div className="form-group">
            <label className="form-label">Send to</label>
            <select className="form-input" value={emailForm.targetRole} onChange={e=>setEmailForm(f=>({...f,targetRole:e.target.value}))}>
              <option value="all">All users (students + teachers)</option>
              <option value="student">Students only</option>
              <option value="teacher">Teachers only</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Subject</label>
            <input className="form-input" placeholder="Email subject..." value={emailForm.subject} onChange={e=>setEmailForm(f=>({...f,subject:e.target.value}))}/>
          </div>
          <div className="form-group">
            <label className="form-label">Message</label>
            <textarea className="form-input" rows={6} placeholder="Email message..." value={emailForm.message} onChange={e=>setEmailForm(f=>({...f,message:e.target.value}))} style={{ resize:"vertical" }}/>
          </div>
          <button className="btn btn-primary" onClick={handleEmailBlast} disabled={emailSending} style={{ alignSelf:"flex-start" }}>
            {emailSending ? <><Spinner size={16}/> Sending…</> : "📨 Send Email Blast"}
          </button>
          <p style={{ fontSize:"0.78rem", color:"var(--muted)" }}>⚠ Only verified accounts receive emails. Sent in batches of 10 to avoid rate limits.</p>
        </div>

      ) : tab === "logs" ? (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <div style={{ display:"flex", justifyContent:"flex-end" }}>
            <button className="btn btn-ghost btn-sm" onClick={loadLogs}>↻ Refresh</button>
          </div>
          {logsLoading ? <div style={{ textAlign:"center", padding:"40px 0" }}><Spinner size={24}/></div>
          : logs.length === 0 ? <div style={{ textAlign:"center", padding:"40px 0", color:"var(--muted)" }}>No logs yet.</div>
          : logs.map((log, i) => {
            const actionColors = { DELETE_USER:"var(--red)", DELETE_SESSION:"var(--red)", BULK_DELETE:"var(--red)", VERIFY_USER:"var(--green)", BULK_VERIFY:"var(--green)", APPROVE_DEVICE:"var(--green)", EMAIL_BLAST:"var(--blue)", CREATE_ANNOUNCEMENT:"var(--accent)", RESET_PASSWORD:"var(--amber)" };
            const col = actionColors[log.action] || "var(--gray)";
            return (
              <div key={log._id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", borderRadius:"var(--radius-sm)", border:"1px solid var(--border)", background: i%2===0 ? "var(--surface)" : "var(--surface2)" }}>
                <span style={{ padding:"2px 8px", borderRadius:20, background:`${col}22`, color:col, fontSize:"0.72rem", fontWeight:700, flexShrink:0 }}>{log.action}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:"0.83rem", color:"var(--ink)" }}>{log.target || "—"}</div>
                  {log.details && <div style={{ fontSize:"0.72rem", color:"var(--muted)" }}>{log.details}</div>}
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <div style={{ fontSize:"0.78rem", fontWeight:600, color:"var(--ink3)" }}>{log.adminName}</div>
                  <div style={{ fontSize:"0.68rem", color:"var(--muted)" }}>{new Date(log.createdAt).toLocaleString("en-PH",{timeZone:"Asia/Manila",dateStyle:"short",timeStyle:"short"})}</div>
                </div>
              </div>
            );
          })}
        </div>

      ) : null}

      {/* User detail modal */}
      {viewUser && (
        <AdminUserDetailModal user={viewUser} onClose={() => setViewUser(null)}
          onDelete={(id) => { handleDelete(id); setViewUser(null); }}
          onVerify={handleVerify} onUnverify={handleUnverify}
          onResetPassword={handleResetPassword} />
      )}
    </div>
  );
}

function App() {
  const { user } = useAuth();
  const [page, setPage] = useState("home");
  const [qrToken, setQrToken] = useState(null);
  const [resetToken, setResetToken] = useState("");

  useEffect(() => {
    // Sync offline queue when app loads and is online
    if (navigator.onLine) syncOfflineQueue();
    window.addEventListener("online", syncOfflineQueue);
    return () => window.removeEventListener("online", syncOfflineQueue);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token  = params.get("token");
    const path   = window.location.pathname;
    if (path === "/reset-password" && token) {
      setResetToken(token);
      setPage("reset-password");
    } else if (path === "/verify-email" && token) {
      setResetToken(token);
      setPage("verify-email");
    } else if (token) {
      setQrToken(token);
      setPage("checkin");
    }
  }, []);

  const [twoFAPending, setTwoFAPending] = useState(null); // { tempToken }
  const [suspiciousAlert, setSuspiciousAlert] = useState(false);

  const handleAuthSuccess = (opts = {}) => {
    if (opts.suspicious) setSuspiciousAlert(true);
    if (opts.sessionId)  localStorage.setItem("sessionId", opts.sessionId);
    setPage("home");
  };

  const handleLogout = () => { logout(); setTwoFAPending(null); setSuspiciousAlert(false); localStorage.removeItem("sessionId"); };

  // Idle timeout — 30 minutes
  useIdleTimeout(() => { if (user) { handleLogout(); } }, 30);

  if (page === "reset-password" && resetToken) return <ResetPasswordPage token={resetToken} />;
  if (page === "verify-email"   && resetToken) return <VerifyEmailPage token={resetToken} />;
  if (!user) return <AuthPage onSuccess={handleAuthSuccess} />;

  if (page === "checkin" && qrToken) return <CheckInPage token={qrToken} />;

  // twoFAPending is now handled inside AuthPage directly

  return (
    <div className="app">
      <Nav onSettings={() => setPage("settings")} />
      <EmailVerificationBanner />
      <AnnouncementBanner />
      {/* Offline indicator */}
      <OfflineIndicator />
      {suspiciousAlert && (
        <div style={{ background:"var(--accent-lt)", borderBottom:"1px solid var(--accent)", padding:"10px 24px", display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:"1rem" }}>🔔</span>
          <div style={{ flex:1, fontSize:"0.83rem", color:"var(--accent-dk, #1e40af)" }}>
            New device login detected. If this was you, no action needed. If not, go to Settings → Security to review active sessions.
          </div>
          <button onClick={() => setSuspiciousAlert(false)} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--accent)", fontWeight:700, fontSize:"1rem" }}>✕</button>
        </div>
      )}
      {page === "settings" && user.role === "admin" ? (
        <AdminSettings onBack={() => setPage("home")} />
      )
      : page === "settings" && user.role === "teacher" ? (
        <TeacherSettings onBack={() => setPage("home")} />
      ) : page === "settings" && user.role === "student" ? (
        <StudentSettings onBack={() => setPage("home")} />
      ) : user.role === "admin" ? (
        <AdminDashboard />
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
    <ThemeProvider>
      <style>{styles}</style>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  );
}
