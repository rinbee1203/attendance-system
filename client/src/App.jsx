import { useState, useEffect, useCallback, createContext, useContext, useRef } from "react";

// ─── API CONFIG ────────────────────────────────────────────────────────────────
const API_BASE = "https://attendance-system-api-wc0k.onrender.com/api";

const api = {
  async request(endpoint, options = {}) {
    const token = localStorage.getItem("token");
    const { headers: optHeaders, ...restOptions } = options;
    const config = {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  }
  .profile-pill-btn:hover { border-color: var(--border2); box-shadow: var(--shadow-sm); }
  .user-avatar {
    width: 28px; height: 28px; border-radius: 50%;
    background: var(--ink); color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 0.7rem; font-weight: 700; flex-shrink: 0; overflow: hidden;
  }
  .user-name { font-size: 0.82rem; font-weight: 600; color: var(--ink); line-height: 1.2; }
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
    position: fixed; inset: 0; background: rgba(26,26,23,0.45);
    display: flex; align-items: center; justify-content: center;
    z-index: 500; padding: 20px; backdrop-filter: blur(3px);
    animation: fadeIn 0.15s ease;
  }
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
    .stats-grid { grid-template-columns: repeat(2, 1fr); }
    .auth-card { padding: 28px 20px; }
    .modal { padding: 22px 18px; }
    .settings-card { padding: 20px 16px; }
    .export-bar { width: 100%; flex-wrap: wrap; }
    .history-filters { flex-wrap: wrap; }
    .page-title { font-size: 1.5rem; }
    .profile-info-row { flex-direction: column; align-items: flex-start; }
    .student-info-grid { grid-template-columns: 1fr; }
  }
  @media (max-width: 400px) {
    .container { padding: 0 14px; }
    .stats-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
    .session-card { flex-wrap: wrap; }
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
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setOpen(true); setLoading(true);
    try {
      const data = await api.get("/security/login-history");
      setHistory(data.history || []);
    } catch(e) { /* silent */ }
    finally { setLoading(false); }
  };

  // Browser → icon mapping
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

  const formatDate = (dt) => {
    const d = new Date(dt);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1)    return "Just now";
    if (diffMins < 60)   return `${diffMins}m ago`;
    if (diffHours < 24)  return `${diffHours}h ago`;
    if (diffDays < 7)    return `${diffDays}d ago`;
    return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
  };

  const formatTime = (dt) => new Date(dt).toLocaleTimeString("en-PH", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Manila"
  });

  return (
    <div className="settings-card">
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <div className="settings-card-title">Login Activity</div>
          <div className="settings-card-sub" style={{ marginBottom:0 }}>Recent sign-in history for your account</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => { if (!open) load(); else setOpen(false); }}>
          {open ? "Hide" : "View History"}
        </button>
      </div>

      {open && (
        <div style={{ marginTop:18 }}>
          {loading ? (
            <div style={{ display:"flex", justifyContent:"center", padding:"24px 0" }}><Spinner size={22} /></div>
          ) : history.length === 0 ? (
            <p style={{ color:"var(--muted)", fontSize:"0.84rem", textAlign:"center", padding:"16px 0" }}>No login history found.</p>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {history.map((h, i) => (
                <div key={i} style={{
                  borderRadius:"var(--radius-sm)",
                  border: `1px solid ${h.success ? "var(--border)" : "#f5c6c2"}`,
                  background: h.success ? "var(--surface2)" : "var(--red-lt)",
                  overflow:"hidden",
                }}>
                  {/* Main row */}
                  <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px" }}>
                    {/* Status dot */}
                    <div style={{
                      width:8, height:8, borderRadius:"50%", flexShrink:0,
                      background: h.success ? "var(--green)" : "var(--red)",
                      boxShadow: h.success ? "0 0 0 3px var(--green-lt)" : "0 0 0 3px var(--red-lt)",
                    }}/>

                    {/* Browser + device */}
                    <div style={{ fontSize:"1.1rem", flexShrink:0 }}>
                      {getBrowserIcon(h.browser)}{getDeviceIcon(h.device)}
                    </div>

                    {/* Details */}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                        <span style={{ fontWeight:700, fontSize:"0.88rem", color: h.success ? "var(--ink)" : "var(--red)" }}>
                          {h.success ? "Signed in" : "Failed attempt"}
                        </span>
                        {h.browser && h.browser !== "Unknown" && (
                          <span style={{ fontSize:"0.75rem", background:"var(--surface3)", border:"1px solid var(--border)", borderRadius:20, padding:"1px 8px", color:"var(--ink3)", fontWeight:600 }}>
                            {h.browser}{h.browserVersion ? ` ${h.browserVersion}` : ""}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize:"0.76rem", color:"var(--muted)", marginTop:3, display:"flex", gap:10, flexWrap:"wrap" }}>
                        {h.os && h.os !== "Unknown" && <span>🖥 {h.os}</span>}
                        {h.ip && h.ip !== "Unknown" && (
                          <span style={{ fontFamily:"var(--font-mono)", fontSize:"0.72rem" }}>
                            🌐 {h.ip}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Time */}
                    <div style={{ textAlign:"right", flexShrink:0 }}>
                      <div style={{ fontSize:"0.78rem", fontWeight:600, color:"var(--ink3)" }}>{formatDate(h.at)}</div>
                      <div style={{ fontSize:"0.7rem", color:"var(--muted)", fontFamily:"var(--font-mono)", marginTop:2 }}>{formatTime(h.at)}</div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Legend */}
              <div style={{ display:"flex", gap:16, padding:"8px 4px", borderTop:"1px solid var(--border)", marginTop:4 }}>
                <span style={{ fontSize:"0.72rem", color:"var(--muted)", display:"flex", alignItems:"center", gap:5 }}>
                  <span style={{ width:7, height:7, borderRadius:"50%", background:"var(--green)", display:"inline-block" }}/>
                  Successful login
                </span>
                <span style={{ fontSize:"0.72rem", color:"var(--muted)", display:"flex", alignItems:"center", gap:5 }}>
                  <span style={{ width:7, height:7, borderRadius:"50%", background:"var(--red)", display:"inline-block" }}/>
                  Failed attempt
                </span>
                <span style={{ fontSize:"0.72rem", color:"var(--muted)", marginLeft:"auto" }}>
                  Last {history.length} events
                </span>
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
  const [form, setForm] = useState({
    subject:          session.subject || "",
    room:             session.room || "",
    description:      session.description || "",
    lateAfterMinutes: session.lateAfterMinutes ?? 15,
    allowedGrades:    session.allowedGrades || [],
    allowedSections:  session.allowedSections || [],
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
  const [form, setForm] = useState({ subject: "", room: "", description: "", expiresAt: defaultEnd, lateAfterMinutes: 15, allowedGrades: [], allowedSections: [] });
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
              <label className="form-label">End Date / Time</label>
              <input className="form-input" type="datetime-local" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} />
              <p className="form-hint">Default: 210 days from now</p>
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

  const isUrgent = countdown <= 10;
  const progressPct = Math.round((countdown / 60) * 100);

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
  const handleDownload = async () => {
    if (selectedKeys.length === 0) return;
    setZipping(true);
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
  };

  return (
    <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
      <button className="btn btn-excel btn-sm" onClick={() => exportSessionFull(attendance, session)}>⬇ Full XLSX</button>
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
  const [editSession, setEditSession]   = useState(null);

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
                          {f === "all" ? "All" : f === "present" ? "✓ Present" : "⏰ Late"}
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
                        {/* Room */}
                        {session.room && (
                          <span className="session-meta-chip">
                            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a5 5 0 0 0-5 5c0 3.5 5 9 5 9s5-5.5 5-9a5 5 0 0 0-5-5zm0 6.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg>
                            {session.room}
                          </span>
                        )}
                        {/* Attendance count */}
                        <span className="session-meta-chip">
                          <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M7 14s-1 0-1-1 1-4 5-4 5 3 5 4-1 1-1 1H7zm4-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path fillRule="evenodd" d="M5.216 14A2.238 2.238 0 0 1 5 13c0-1.355.68-2.75 1.936-3.72A6.325 6.325 0 0 0 5 9c-4 0-5 3-5 4s1 1 1 1h4.216z"/><path d="M4.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/></svg>
                          {session.attendanceCount || 0} check-in{session.attendanceCount !== 1 ? "s" : ""}
                        </span>
                        {/* Grace period */}
                        <span className="session-meta-chip chip-accent">
                          <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/></svg>
                          Late after {session.lateAfterMinutes ?? 15}m
                        </span>
                        {/* Restriction chip */}
                        {(session.allowedGrades?.length > 0 || session.allowedSections?.length > 0) && (
                          <span className="session-meta-chip" style={{ borderColor:"var(--amber)", color:"var(--amber)", background:"var(--amber-lt)" }}>
                            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a2 2 0 0 1 2 2v4H6V3a2 2 0 0 1 2-2zm3 6V3a3 3 0 0 0-6 0v4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/></svg>
                            Restricted
                          </span>
                        )}
                        {/* Live badge */}
                        {session.isActive && (
                          <span className="session-meta-chip chip-live">
                            <span style={{ width:6, height:6, borderRadius:"50%", background:"var(--green)", display:"inline-block", animation:"pulse 1.4s infinite" }}/>
                            Live
                          </span>
                        )}
                        {/* Expiry */}
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
            {message?.includes("restricted") || message?.includes("grade") || message?.includes("section") || message?.includes("Grade") || message?.includes("Section") ? (
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
    <LoginHistorySection />
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
        </div>
      </div>
    </div>
  );
}

function App() {
  const { user } = useAuth();
  const [page, setPage] = useState("home");
  const [qrToken, setQrToken] = useState(null);
  const [resetToken, setResetToken] = useState("");

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

  const handleAuthSuccess = () => setPage("home");

  if (page === "reset-password" && resetToken) return <ResetPasswordPage token={resetToken} />;
  if (page === "verify-email"   && resetToken) return <VerifyEmailPage token={resetToken} />;
  if (!user) return <AuthPage onSuccess={handleAuthSuccess} />;

  if (page === "checkin" && qrToken) return <CheckInPage token={qrToken} />;

  return (
    <div className="app">
      <Nav onSettings={() => setPage("settings")} />
      <EmailVerificationBanner />
      {page === "settings" && user.role === "teacher" ? (
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
    <ThemeProvider>
      <style>{styles}</style>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  );
}
