const AcademicYear      = require("../models/AcademicYear");
const Session           = require("../models/Session");
const Attendance        = require("../models/Attendance");
const RecurringSchedule = require("../models/RecurringSchedule");
const User              = require("../models/User");

// ─── DepEd School Calendar Helper ─────────────────────────────────────────────
// DepEd officially opens classes on the FIRST MONDAY of JUNE (DepEd Order No. 012 s. 2024).
// School year ends on the last Friday of March of the following year.
// All dates computed in Philippine Standard Time (UTC+8).

function getFirstMondayOfJune(year) {
  const june1   = new Date(Date.UTC(year, 5, 1)); // June 1 00:00 UTC
  const day     = june1.getUTCDay();              // 0=Sun,1=Mon,...,6=Sat
  const toMon   = day === 1 ? 0 : (8 - day) % 7 || 7;
  const d       = new Date(june1);
  d.setUTCDate(june1.getUTCDate() + toMon);
  return d;
}

function getLastFridayOfMarch(year) {
  const march31 = new Date(Date.UTC(year, 2, 31)); // March 31 UTC
  const day     = march31.getUTCDay();
  const back    = day >= 5 ? day - 5 : day + 2;
  const d       = new Date(march31);
  d.setUTCDate(march31.getUTCDate() - back);
  return d;
}

function getDepEdSchoolYear(refDate) {
  const manila = new Date(refDate.getTime() + 8 * 60 * 60 * 1000);
  const year   = manila.getUTCFullYear();
  const month  = manila.getUTCMonth() + 1;
  const startY = month >= 6 ? year : year - 1;
  const endY   = startY + 1;
  return {
    name:      `${startY}-${endY}`,
    startDate: getFirstMondayOfJune(startY),
    endDate:   getLastFridayOfMarch(endY),
  };
}

// DepEd Quarter boundaries (month is 1-based)
// Q1: June–August   Q2: September–October   Q3: November–January   Q4: February–March
function getDepEdQuarter(dateStr, syStartYear) {
  const [y, m] = dateStr.split("-").map(Number);
  if (m >= 6 && m <= 8)  return "Q1";
  if (m >= 9 && m <= 10) return "Q2";
  if (m >= 11 || m === 1) return "Q3";
  if (m >= 2 && m <= 3)  return "Q4";
  return null; // outside SY
}

// ─── Auto-Ensure Active Academic Year ─────────────────────────────────────────
// @route  POST /api/academic/years/auto-ensure
// @access Admin
const autoEnsureAcademicYear = async (req, res) => {
  try {
    const now = new Date();
    const sy  = getDepEdSchoolYear(now);

    // 1. Already active
    const active = await AcademicYear.findOne({ isActive: true });
    if (active) return res.json({ success: true, created: false, activated: false, year: active });

    // 2. Inactive year with same name exists → re-activate
    const existing = await AcademicYear.findOne({ name: sy.name });
    if (existing) {
      await AcademicYear.updateMany({}, { isActive: false });
      existing.isActive = true;
      await existing.save();
      return res.json({ success: true, created: false, activated: true, year: existing });
    }

    // 3. Create new SY using DepEd-computed dates
    await AcademicYear.updateMany({}, { isActive: false });
    const created = await AcademicYear.create({
      name:      sy.name,
      startDate: sy.startDate,
      endDate:   sy.endDate,
      isActive:  true,
      semester:  "Full Year",
      gradeMap: [
        { fromGrade: "Grade 11", toGrade: "Grade 12"  },
        { fromGrade: "Grade 12", toGrade: "Graduated" },
      ],
    });
    return res.json({ success: true, created: true, activated: false, year: created });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Get all academic years ────────────────────────────────────────────────────
const getAcademicYears = async (req, res) => {
  try {
    const years = await AcademicYear.find().sort({ createdAt: -1 });
    res.json({ success: true, years });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Create academic year manually ────────────────────────────────────────────
const createAcademicYear = async (req, res) => {
  try {
    const { name, startDate, endDate, semester, gradeMap } = req.body;
    if (!name || !startDate || !endDate)
      return res.status(400).json({ success: false, message: "Name, startDate, and endDate are required." });
    const year = await AcademicYear.create({
      name, startDate, endDate,
      semester: semester || "Full Year",
      gradeMap: gradeMap || [],
      isActive: false,
    });
    res.status(201).json({ success: true, message: "Academic year created.", year });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Set a year as active ──────────────────────────────────────────────────────
const setActiveYear = async (req, res) => {
  try {
    await AcademicYear.updateMany({}, { isActive: false });
    const year = await AcademicYear.findByIdAndUpdate(req.params.id, { isActive: true }, { new: true });
    if (!year) return res.status(404).json({ success: false, message: "Year not found." });
    res.json({ success: true, message: `${year.name} is now active.`, year });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Archive a year ────────────────────────────────────────────────────────────
const archiveYear = async (req, res) => {
  try {
    const year = await AcademicYear.findByIdAndUpdate(
      req.params.id, { isActive: false, archivedAt: new Date() }, { new: true }
    );
    if (!year) return res.status(404).json({ success: false, message: "Year not found." });
    await Session.updateMany({ academicYear: year._id }, { isArchived: true });
    res.json({ success: true, message: `${year.name} archived.`, year });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Update end date ───────────────────────────────────────────────────────────
const updateYearEndDate = async (req, res) => {
  try {
    const { endDate } = req.body;
    if (!endDate) return res.status(400).json({ success: false, message: "endDate required." });
    const year = await AcademicYear.findByIdAndUpdate(req.params.id, { endDate: new Date(endDate) }, { new: true });
    if (!year) return res.status(404).json({ success: false, message: "Year not found." });
    res.json({ success: true, message: "End date updated.", year });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Preview promotion ─────────────────────────────────────────────────────────
const previewPromotion = async (req, res) => {
  try {
    const year = await AcademicYear.findById(req.params.id);
    if (!year) return res.status(404).json({ success: false, message: "Year not found." });
    const preview = [];
    for (const map of year.gradeMap) {
      const students = await User.find({ role: "student", grade: map.fromGrade }).select("name grade section email");
      preview.push({ fromGrade: map.fromGrade, toGrade: map.toGrade, count: students.length, students, graduated: map.toGrade === "Graduated" });
    }
    res.json({ success: true, preview, yearName: year.name });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Promote students ─────────────────────────────────────────────────────────
const promoteStudents = async (req, res) => {
  try {
    const year = await AcademicYear.findById(req.params.id);
    if (!year) return res.status(404).json({ success: false, message: "Year not found." });
    if (year.promotedAt) return res.status(400).json({ success: false, message: "Already promoted for this year." });

    let promotedCount = 0;
    let graduatedCount = 0;
    const summary = [];

    for (const map of year.gradeMap) {
      const students = await User.find({ role: "student", grade: map.fromGrade });
      const isGrad = map.toGrade === "Graduated";
      for (const s of students) {
        s.previousGrades = s.previousGrades || [];
        s.previousGrades.push({ grade: s.grade, section: s.section, year: year.name, promotedAt: new Date() });
        if (isGrad) {
          s.isGraduated = true;
          graduatedCount++;
        } else {
          s.grade = map.toGrade;
          promotedCount++;
        }
        await s.save();
      }
      summary.push({ fromGrade: map.fromGrade, toGrade: map.toGrade, count: students.length, graduated: isGrad });
    }

    year.promotedAt    = new Date();
    year.promotedCount  = promotedCount;
    year.graduatedCount = graduatedCount;
    year.promotionSummary = summary;
    await year.save();

    res.json({ success: true, message: `${promotedCount} promoted, ${graduatedCount} graduated.`, summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Comprehensive Leaderboard ─────────────────────────────────────────────────
// Returns:
//   leaderboard        — overall section ranking (all sessions)
//   sessionLeaderboard — per-subject/session ranking with perfect attendance
//   sectionHonorRoll   — best attendance student per section
//   perfectAttendance  — { monthly, quarterly, fullYear } perfect attendance lists
//   sectionStudentRank — per-student rankings within each section
// @route  GET /api/academic/leaderboard
// @access Authenticated
const getSectionLeaderboard = async (req, res) => {
  try {
    const now     = new Date();
    const sy      = getDepEdSchoolYear(now);

    // ── Fetch all non-archived sessions ──
    const sessions    = await Session.find({ isArchived: { $ne: true } })
      .select("_id subject teacher allowedGrades allowedSections roster academicYear");
    const sessionIds  = sessions.map(s => s._id);

    // ── Fetch all attendance records ──
    const records = await Attendance.find({ session: { $in: sessionIds } })
      .select("student session status attendanceDate studentGradeSnapshot studentSectionSnapshot");

    // ── Build student lookup ──
    const studentIds = [...new Set(records.map(r => r.student?.toString()).filter(Boolean))];
    const students   = await User.find({ _id: { $in: studentIds } }).select("_id grade section name");
    const studentMap = {};
    for (const s of students) studentMap[s._id.toString()] = s;

    // Helper: get grade/section for a record
    const getGS = (rec) => {
      const stud = studentMap[rec.student?.toString()];
      return {
        grade:   stud?.grade   || rec.studentGradeSnapshot   || "Unknown",
        section: stud?.section || rec.studentSectionSnapshot || "Unknown",
        name:    stud?.name    || "Unknown",
      };
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // 1. OVERALL SECTION LEADERBOARD
    // ═══════════════════════════════════════════════════════════════════════════
    const sectionMap = {};
    for (const rec of records) {
      const { grade, section } = getGS(rec);
      const key = `${grade}||${section}`;
      if (!sectionMap[key]) sectionMap[key] = { grade, section, key, totalRecords: 0, present: 0, late: 0, absent: 0, students: new Set() };
      sectionMap[key].totalRecords++;
      sectionMap[key].students.add(rec.student?.toString());
      if (rec.status === "present")      sectionMap[key].present++;
      else if (rec.status === "late")    sectionMap[key].late++;
      else if (rec.status === "absent")  sectionMap[key].absent++;
    }

    const leaderboard = Object.values(sectionMap)
      .map(s => ({
        key: s.key, grade: s.grade, section: s.section,
        students: s.students.size,
        present: s.present, late: s.late, absent: s.absent, total: s.totalRecords,
        rate: s.totalRecords > 0 ? Math.round(((s.present + s.late) / s.totalRecords) * 100) : 0,
      }))
      .sort((a, b) => b.rate - a.rate || b.present - a.present);

    // ═══════════════════════════════════════════════════════════════════════════
    // 2. PER-SESSION (SUBJECT) LEADERBOARD
    // ═══════════════════════════════════════════════════════════════════════════
    const subjectGroupMap = {};
    for (const sess of sessions) {
      const key = `${sess.subject}||${sess.teacher?.toString()}`;
      if (!subjectGroupMap[key]) subjectGroupMap[key] = { subject: sess.subject, sessionIds: [] };
      subjectGroupMap[key].sessionIds.push(sess._id);
    }

    const sessionLeaderboard = [];
    for (const [, group] of Object.entries(subjectGroupMap)) {
      const sessRecs      = records.filter(r => group.sessionIds.some(id => id.toString() === r.session?.toString()));
      const uniqueSessions = new Set(sessRecs.map(r => r.session?.toString())).size;
      if (uniqueSessions === 0) continue;

      // Per-student summary for this subject
      const perStudent = {};
      for (const rec of sessRecs) {
        const sid = rec.student?.toString();
        if (!sid) continue;
        if (!perStudent[sid]) perStudent[sid] = { present: 0, late: 0, absent: 0, total: 0 };
        perStudent[sid].total++;
        if (rec.status === "present")     perStudent[sid].present++;
        else if (rec.status === "late")   perStudent[sid].late++;
        else if (rec.status === "absent") perStudent[sid].absent++;
      }

      const perfectStudents = Object.entries(perStudent)
        .filter(([, v]) => (v.present + v.late) === v.total && v.total === uniqueSessions)
        .map(([sid]) => {
          const s = studentMap[sid];
          return { id: sid, name: s?.name || "Unknown", grade: s?.grade || "?", section: s?.section || "?" };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      // Section ranking for this subject
      const secSubMap = {};
      for (const rec of sessRecs) {
        const { grade, section } = getGS(rec);
        const k = `${grade}||${section}`;
        if (!secSubMap[k]) secSubMap[k] = { grade, section, present: 0, late: 0, absent: 0, total: 0, students: new Set() };
        secSubMap[k].total++;
        secSubMap[k].students.add(rec.student?.toString());
        if (rec.status === "present")     secSubMap[k].present++;
        else if (rec.status === "late")   secSubMap[k].late++;
        else if (rec.status === "absent") secSubMap[k].absent++;
      }

      const sectionRanking = Object.values(secSubMap)
        .map(s => ({
          grade: s.grade, section: s.section, students: s.students.size,
          rate: s.total > 0 ? Math.round(((s.present + s.late) / s.total) * 100) : 0,
          present: s.present, late: s.late, absent: s.absent,
        }))
        .sort((a, b) => b.rate - a.rate);

      sessionLeaderboard.push({
        subject: group.subject,
        totalSessions: uniqueSessions,
        perfectCount: perfectStudents.length,
        perfectStudents: perfectStudents.slice(0, 20),
        bestSection: sectionRanking[0] || null,
        sectionRanking,
      });
    }
    sessionLeaderboard.sort((a, b) => a.subject.localeCompare(b.subject));

    // ═══════════════════════════════════════════════════════════════════════════
    // 3. BEST-IN-ATTENDANCE PER SECTION (HONOR ROLL)
    // ═══════════════════════════════════════════════════════════════════════════
    const bestPerSection = {};
    for (const rec of records) {
      const sid = rec.student?.toString();
      const { grade, section, name } = getGS(rec);
      const k = `${grade}||${section}`;
      if (!bestPerSection[k]) bestPerSection[k] = { grade, section, students: {} };
      if (!bestPerSection[k].students[sid]) bestPerSection[k].students[sid] = { name, present: 0, late: 0, total: 0 };
      bestPerSection[k].students[sid].total++;
      if (rec.status === "present")   bestPerSection[k].students[sid].present++;
      else if (rec.status === "late") bestPerSection[k].students[sid].late++;
    }

    const sectionHonorRoll = Object.values(bestPerSection).map(sec => {
      const ranked = Object.entries(sec.students)
        .map(([id, v]) => ({
          id, name: v.name,
          rate: v.total > 0 ? Math.round(((v.present + v.late) / v.total) * 100) : 0,
          present: v.present, late: v.late, total: v.total,
        }))
        .sort((a, b) => b.rate - a.rate || b.present - a.present);
      return { grade: sec.grade, section: sec.section, best: ranked[0] || null, topThree: ranked.slice(0, 3) };
    })
    .filter(s => s.best !== null)
    .sort((a, b) => (b.best?.rate || 0) - (a.best?.rate || 0));

    // ═══════════════════════════════════════════════════════════════════════════
    // 4. PERFECT ATTENDANCE — MONTHLY, QUARTERLY, FULL YEAR
    // ═══════════════════════════════════════════════════════════════════════════
    // Group records by attendanceDate
    // For "perfect" we need every session-day the student was enrolled to be present/late

    // Build unique session-dates (how many distinct dates per session)
    const sessionDates = {}; // sessionId -> Set of dates
    for (const rec of records) {
      const sid = rec.session?.toString();
      if (!sid || !rec.attendanceDate) continue;
      if (!sessionDates[sid]) sessionDates[sid] = new Set();
      sessionDates[sid].add(rec.attendanceDate);
    }

    // All distinct dates in the dataset
    const allDates = [...new Set(records.map(r => r.attendanceDate).filter(Boolean))].sort();

    // Get SY start year from current SY
    const manilaMs   = now.getTime() + 8 * 60 * 60 * 1000;
    const manilaDate = new Date(manilaMs);
    const mMonth     = manilaDate.getUTCMonth() + 1;
    const syStartYear = mMonth >= 6 ? manilaDate.getUTCFullYear() : manilaDate.getUTCFullYear() - 1;

    // Helper: build perfect attendance list for a set of dates
    const buildPerfect = (filteredDates) => {
      const dateSet = new Set(filteredDates);
      // Sessions that have at least one date in this period
      const periodSessionIds = Object.entries(sessionDates)
        .filter(([, dates]) => [...dates].some(d => dateSet.has(d)))
        .map(([id]) => id);

      // Per student: count of records in period (present+late vs total)
      const perStudent = {};
      for (const rec of records) {
        if (!rec.attendanceDate || !dateSet.has(rec.attendanceDate)) continue;
        const sid = rec.student?.toString();
        if (!sid) continue;
        if (!perStudent[sid]) perStudent[sid] = { present: 0, late: 0, absent: 0, total: 0 };
        perStudent[sid].total++;
        if (rec.status === "present")     perStudent[sid].present++;
        else if (rec.status === "late")   perStudent[sid].late++;
        else if (rec.status === "absent") perStudent[sid].absent++;
      }

      return Object.entries(perStudent)
        .filter(([, v]) => v.total > 0 && v.absent === 0)
        .map(([sid, v]) => {
          const s = studentMap[sid];
          return {
            id: sid,
            name: s?.name || "Unknown",
            grade: s?.grade || "?",
            section: s?.section || "?",
            present: v.present, late: v.late, total: v.total,
          };
        })
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    };

    // Monthly grouping
    const monthlyMap = {};
    for (const d of allDates) {
      const ym = d.substring(0, 7); // "YYYY-MM"
      if (!monthlyMap[ym]) monthlyMap[ym] = [];
      monthlyMap[ym].push(d);
    }

    const monthNames = ["","January","February","March","April","May","June","July","August","September","October","November","December"];
    const monthlyPerfect = Object.entries(monthlyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, dates]) => {
        const [y, m] = ym.split("-").map(Number);
        return {
          key: ym,
          label: `${monthNames[m]} ${y}`,
          students: buildPerfect(dates),
        };
      });

    // Quarterly grouping (DepEd)
    const quarterMap = { Q1: [], Q2: [], Q3: [], Q4: [] };
    for (const d of allDates) {
      const q = getDepEdQuarter(d, syStartYear);
      if (q) quarterMap[q].push(d);
    }

    const quarterLabels = {
      Q1: "Quarter 1 (June–August)",
      Q2: "Quarter 2 (September–October)",
      Q3: "Quarter 3 (November–January)",
      Q4: "Quarter 4 (February–March)",
    };

    const quarterlyPerfect = Object.entries(quarterMap)
      .map(([q, dates]) => ({
        key: q,
        label: quarterLabels[q],
        students: buildPerfect(dates),
      }));

    // Full year perfect
    const fullYearPerfect = buildPerfect(allDates);

    const perfectAttendance = {
      monthly:  monthlyPerfect,
      quarterly: quarterlyPerfect,
      fullYear: fullYearPerfect,
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // 5. PER-STUDENT RANKINGS WITHIN EACH SECTION
    // ═══════════════════════════════════════════════════════════════════════════
    const sectionStudentMap = {};
    for (const rec of records) {
      const sid = rec.student?.toString();
      if (!sid) continue;
      const { grade, section, name } = getGS(rec);
      const k = `${grade}||${section}`;
      if (!sectionStudentMap[k]) sectionStudentMap[k] = { grade, section, students: {} };
      if (!sectionStudentMap[k].students[sid]) sectionStudentMap[k].students[sid] = { name, present: 0, late: 0, absent: 0, excused: 0, total: 0 };
      sectionStudentMap[k].students[sid].total++;
      if (rec.status === "present")      sectionStudentMap[k].students[sid].present++;
      else if (rec.status === "late")    sectionStudentMap[k].students[sid].late++;
      else if (rec.status === "absent")  sectionStudentMap[k].students[sid].absent++;
      else if (rec.status === "excused") sectionStudentMap[k].students[sid].excused++;
    }

    const sectionStudentRank = Object.values(sectionStudentMap).map(sec => {
      const ranked = Object.entries(sec.students)
        .map(([id, v]) => ({
          id, name: v.name,
          present: v.present, late: v.late, absent: v.absent, excused: v.excused, total: v.total,
          attendedRate: v.total > 0 ? Math.round(((v.present + v.late) / v.total) * 100) : 0,
          perfectDays: v.absent === 0 && v.total > 0,
        }))
        .sort((a, b) => b.attendedRate - a.attendedRate || b.present - a.present || a.name.localeCompare(b.name))
        .map((s, idx) => ({ ...s, rank: idx + 1 }));

      return {
        grade: sec.grade,
        section: sec.section,
        key: `${sec.grade}||${sec.section}`,
        studentCount: ranked.length,
        students: ranked,
      };
    }).sort((a, b) => a.grade.localeCompare(b.grade) || a.section.localeCompare(b.section));

    res.json({
      success: true,
      leaderboard,           // overall section ranking
      sessionLeaderboard,    // per-subject leaderboard
      sectionHonorRoll,      // top student per section
      perfectAttendance,     // monthly / quarterly / full-year perfect attendance
      sectionStudentRank,    // per-student rankings per section
    });
  } catch (err) {
    console.error("Leaderboard error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Attendance Forecast ───────────────────────────────────────────────────────
// @route  GET /api/academic/forecast
// @access Teacher
const getAttendanceForecast = async (req, res) => {
  try {
    const sessions   = await Session.find({ teacher: req.user._id, isArchived: { $ne: true } }).select("_id subject");
    const sessionIds = sessions.map(s => s._id);

    const records = await Attendance.find({ session: { $in: sessionIds } })
      .select("student session status attendanceDate");

    const byDate = {};
    for (const r of records) {
      const d = r.attendanceDate || "unknown";
      if (!byDate[d]) byDate[d] = { present: 0, absent: 0, late: 0 };
      if (r.status === "present")     byDate[d].present++;
      else if (r.status === "absent") byDate[d].absent++;
      else if (r.status === "late")   byDate[d].late++;
    }

    const trend = Object.entries(byDate)
      .map(([date, v]) => ({ date, ...v, total: v.present + v.absent + v.late, rate: Math.round(((v.present + v.late) / (v.present + v.absent + v.late || 1)) * 100) }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);

    res.json({ success: true, trend });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Recurring Schedules ───────────────────────────────────────────────────────
const getRecurringSchedules = async (req, res) => {
  try {
    const schedules = await RecurringSchedule.find({ teacher: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, schedules });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const createRecurringSchedule = async (req, res) => {
  try {
    const { subject, room, description, daysOfWeek, startTime, durationMinutes, lateAfterMinutes, allowedGrades, allowedSections, absenceLimit, absenceLimitEnabled } = req.body;
    if (!subject || !daysOfWeek?.length || !startTime)
      return res.status(400).json({ success: false, message: "Subject, daysOfWeek, and startTime are required." });

    const active = await AcademicYear.findOne({ isActive: true });
    const sched  = await RecurringSchedule.create({
      teacher: req.user._id,
      subject, room, description,
      daysOfWeek, startTime,
      durationMinutes: durationMinutes || 60,
      lateAfterMinutes: lateAfterMinutes || 15,
      allowedGrades:   allowedGrades   || [],
      allowedSections: allowedSections || [],
      academicYear: active?._id || null,
      absenceLimit:        absenceLimit        || 3,
      absenceLimitEnabled: absenceLimitEnabled || false,
    });
    res.status(201).json({ success: true, message: "Schedule created.", schedule: sched });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateRecurringSchedule = async (req, res) => {
  try {
    const sched = await RecurringSchedule.findOneAndUpdate(
      { _id: req.params.id, teacher: req.user._id },
      req.body,
      { new: true }
    );
    if (!sched) return res.status(404).json({ success: false, message: "Schedule not found." });
    res.json({ success: true, message: "Schedule updated.", schedule: sched });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteRecurringSchedule = async (req, res) => {
  try {
    const sched = await RecurringSchedule.findOneAndDelete({ _id: req.params.id, teacher: req.user._id });
    if (!sched) return res.status(404).json({ success: false, message: "Schedule not found." });
    res.json({ success: true, message: "Schedule deleted." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Generate Daily Sessions from Recurring Schedules ─────────────────────────
const generateDailySessions = async (req, res) => {
  try {
    const now         = new Date();
    const manilaMs    = now.getTime() + 8 * 60 * 60 * 1000;
    const manilaDate  = new Date(manilaMs);
    const todayStr    = manilaDate.toISOString().split("T")[0];
    const todayDOW    = manilaDate.getUTCDay();

    const schedules   = await RecurringSchedule.find({ teacher: req.user._id, isActive: true, daysOfWeek: todayDOW });
    const active      = await AcademicYear.findOne({ isActive: true });

    let created = 0;
    for (const sched of schedules) {
      if (sched.createdDates.includes(todayStr)) continue;

      const [hh, mm]  = sched.startTime.split(":").map(Number);
      const startMs   = Date.UTC(manilaDate.getUTCFullYear(), manilaDate.getUTCMonth(), manilaDate.getUTCDate(), hh - 8, mm);
      const startTime = new Date(startMs);
      const endTime   = new Date(startMs + sched.durationMinutes * 60000);

      await Session.create({
        subject:          sched.subject,
        teacher:          req.user._id,
        room:             sched.room,
        description:      sched.description,
        scheduledStart:   startTime,
        scheduledEnd:     endTime,
        lateAfterMinutes: sched.lateAfterMinutes,
        allowedGrades:    sched.allowedGrades,
        allowedSections:  sched.allowedSections,
        academicYear:     active?._id || null,
        recurringSchedule: sched._id,
        absenceLimit:        sched.absenceLimit,
        absenceLimitEnabled: sched.absenceLimitEnabled,
      });

      sched.createdDates.push(todayStr);
      await sched.save();
      created++;
    }

    res.json({ success: true, created, message: `${created} session${created !== 1 ? "s" : ""} generated for today.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  autoEnsureAcademicYear,
  getAcademicYears,
  createAcademicYear,
  setActiveYear,
  archiveYear,
  updateYearEndDate,
  previewPromotion,
  promoteStudents,
  getSectionLeaderboard,
  getAttendanceForecast,
  getRecurringSchedules,
  createRecurringSchedule,
  updateRecurringSchedule,
  deleteRecurringSchedule,
  generateDailySessions,
};
