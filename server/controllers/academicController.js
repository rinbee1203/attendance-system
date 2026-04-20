const AcademicYear   = require("../models/AcademicYear");
const RecurringSchedule = require("../models/RecurringSchedule");
const Session        = require("../models/Session");
const Attendance     = require("../models/Attendance");
const User           = require("../models/User");
const crypto         = require("crypto");
const QRCode         = require("qrcode");

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";
const QR_EXPIRY_SECONDS = parseInt(process.env.QR_EXPIRY_SECONDS) || 60;

// ── Academic Year CRUD ────────────────────────────────────────────────────────
const getAcademicYears = async (req, res) => {
  try {
    const years = await AcademicYear.find().sort({ startDate: -1 });
    res.json({ success: true, years });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const createAcademicYear = async (req, res) => {
  try {
    const { name, startDate, endDate, semester, gradeMap } = req.body;
    if (!name || !startDate || !endDate)
      return res.status(400).json({ success: false, message: "Name, start and end date required." });
    const year = await AcademicYear.create({ name, startDate, endDate, semester, gradeMap: gradeMap || [] });
    res.status(201).json({ success: true, year });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const setActiveYear = async (req, res) => {
  try {
    await AcademicYear.updateMany({}, { isActive: false });
    const year = await AcademicYear.findByIdAndUpdate(req.params.id, { isActive: true }, { new: true });
    if (!year) return res.status(404).json({ success: false, message: "Academic year not found." });
    await User.updateMany({ role: "student" }, { academicYear: year.name });
    res.json({ success: true, message: `"${year.name}" is now the active academic year.`, year });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const archiveYear = async (req, res) => {
  try {
    const year = await AcademicYear.findByIdAndUpdate(
      req.params.id,
      { isActive: false, archivedAt: new Date() },
      { new: true }
    );
    if (!year) return res.status(404).json({ success: false, message: "Academic year not found." });
    await Session.updateMany({ academicYear: year._id }, { isArchived: true, isActive: false });
    res.json({ success: true, message: `"${year.name}" archived. All sessions archived.`, year });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── Preview Promotion (dry run) ───────────────────────────────────────────────
const previewPromotion = async (req, res) => {
  try {
    const year = await AcademicYear.findById(req.params.id);
    if (!year) return res.status(404).json({ success: false, message: "Academic year not found." });
    if (!year.gradeMap || year.gradeMap.length === 0)
      return res.status(400).json({ success: false, message: "No grade map defined." });

    const preview = [];
    for (const { fromGrade, toGrade } of year.gradeMap) {
      if (!fromGrade || !toGrade) continue;
      const isGraduating = toGrade.trim().toLowerCase() === "graduated";
      const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const count = await User.countDocuments({
        role: "student",
        grade: { $regex: new RegExp(`^${escapeRegex(fromGrade.trim())}$`, "i") },
      });
      preview.push({ fromGrade, toGrade, count, isGraduating });
    }

    const coveredGrades = year.gradeMap.map(g => g.fromGrade.trim().toLowerCase());
    const allStudents = await User.find({ role: "student" }).select("grade name");
    const uncovered = allStudents.filter(s => !coveredGrades.includes((s.grade || "").trim().toLowerCase()));

    res.json({
      success: true,
      preview,
      uncoveredCount: uncovered.length,
      uncoveredSample: uncovered.slice(0, 5).map(s => ({ name: s.name, grade: s.grade }))
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── School Year Promotion ─────────────────────────────────────────────────────
// Grade 12 → "Graduated": attendance records preserved via snapshot, accounts deleted
const promoteStudents = async (req, res) => {
  try {
    const year = await AcademicYear.findById(req.params.id);
    if (!year) return res.status(404).json({ success: false, message: "Academic year not found." });
    if (!year.gradeMap || year.gradeMap.length === 0)
      return res.status(400).json({ success: false, message: "No grade map defined for this year." });

    let promoted = 0;
    let graduated = 0;
    const results = [];
    const graduatedStudentIds = [];
    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    for (const { fromGrade, toGrade } of year.gradeMap) {
      if (!fromGrade || !toGrade) continue;
      const isGraduating = toGrade.trim().toLowerCase() === "graduated";

      const students = await User.find({
        role: "student",
        grade: { $regex: new RegExp(`^${escapeRegex(fromGrade.trim())}$`, "i") },
      });

      if (isGraduating) {
        for (const student of students) {
          // Preserve leaderboard data — stamp attendance with student info snapshot
          await Attendance.updateMany(
            { student: student._id },
            {
              $set: {
                studentNameSnapshot: student.name,
                studentGradeSnapshot: student.grade,
                studentSectionSnapshot: student.section,
                graduatedAt: new Date(),
                graduatedYear: year.name,
              }
            }
          );
          graduatedStudentIds.push(student._id);
          graduated++;
        }
        results.push({ from: fromGrade, to: "Graduated", count: students.length, graduated: true });
      } else {
        for (const student of students) {
          student.previousGrades = student.previousGrades || [];
          student.previousGrades.push({
            grade: student.grade,
            section: student.section,
            year: year.name,
            promotedAt: new Date(),
          });
          student.grade = toGrade;
          await student.save({ validateBeforeSave: false });
          promoted++;
        }
        results.push({ from: fromGrade, to: toGrade, count: students.length, graduated: false });
      }
    }

    // Delete graduated student accounts AFTER preserving their attendance data
    if (graduatedStudentIds.length > 0) {
      await User.deleteMany({ _id: { $in: graduatedStudentIds } });
    }

    year.promotedAt = new Date();
    year.promotionSummary = results;
    year.promotedCount = promoted;
    year.graduatedCount = graduated;
    await year.save();

    res.json({
      success: true,
      message: `${promoted} student${promoted !== 1 ? "s" : ""} promoted. ${graduated} graduate${graduated !== 1 ? "s" : ""} removed (records preserved).`,
      results,
      promoted,
      graduated,
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── Section Leaderboard ───────────────────────────────────────────────────────
const getSectionLeaderboard = async (req, res) => {
  try {
    const { yearId } = req.query;
    const since = yearId
      ? (await AcademicYear.findById(yearId))?.startDate || new Date(0)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const attData = await Attendance.aggregate([
      { $match: { createdAt: { $gte: new Date(since) } } },
      { $group: {
        _id: "$student",
        total:   { $sum: 1 },
        present: { $sum: { $cond: [{ $in: ["$status", ["present","late"]] }, 1, 0] } },
        absent:  { $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] } },
        gradeSnapshot:   { $first: "$studentGradeSnapshot" },
        sectionSnapshot: { $first: "$studentSectionSnapshot" },
      }},
    ]);

    const attMap = {};
    attData.forEach(a => { attMap[a._id ? a._id.toString() : "__null__"] = a; });

    const students = await User.find({ role: "student", section: { $exists: true, $ne: null, $ne: "" } })
      .select("grade section _id");

    const sectionMap = {};
    for (const student of students) {
      const key = `${(student.grade || "").trim()} — ${(student.section || "").trim()}`;
      if (!sectionMap[key]) sectionMap[key] = { grade: student.grade, section: student.section, students: 0, present: 0, total: 0, absent: 0 };
      sectionMap[key].students++;
      const att = attMap[student._id.toString()];
      if (att) {
        sectionMap[key].present += att.present;
        sectionMap[key].total   += att.total;
        sectionMap[key].absent  += att.absent;
      }
    }

    const leaderboard = Object.entries(sectionMap).map(([key, v]) => ({
      key, grade: v.grade, section: v.section,
      students: v.students, present: v.present, total: v.total, absent: v.absent,
      rate: v.total > 0 ? Math.round((v.present / v.total) * 100) : 0,
    })).sort((a, b) => b.rate - a.rate);

    res.json({ success: true, leaderboard, since });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── Attendance Forecast ───────────────────────────────────────────────────────
const getAttendanceForecast = async (req, res) => {
  try {
    const { sessionId } = req.query;
    const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    let sessionFilter = { teacher: req.user._id };
    if (sessionId) {
      const targetSession = await Session.findById(sessionId);
      if (targetSession) sessionFilter.subject = targetSession.subject;
    }
    const sessions = await Session.find(sessionFilter).select("_id subject activatedAt startTime");
    const sessionIds = sessions.map(s => s._id);

    const rosterSizes = {};
    for (const s of sessions) {
      const roster = await Session.findById(s._id).select("roster");
      rosterSizes[s._id.toString()] = roster?.roster?.length || 0;
    }

    const attData = await Attendance.aggregate([
      { $match: { session: { $in: sessionIds }, createdAt: { $gte: since } } },
      { $addFields: {
        dayOfWeek: { $dayOfWeek: { date: "$createdAt", timezone: "Asia/Manila" } },
        hour: { $hour: { date: "$createdAt", timezone: "Asia/Manila" } },
      }},
      { $group: {
        _id: { session: "$session", dow: "$dayOfWeek" },
        checkins: { $sum: 1 },
        absents:  { $sum: { $cond: [{ $eq: ["$status","absent"] }, 1, 0] } },
        sessions: { $addToSet: "$attendanceDate" },
      }},
    ]);

    const dayNames = ["","Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const patterns = {};
    attData.forEach(a => {
      const sid = a._id.session.toString();
      if (!patterns[sid]) patterns[sid] = {};
      const sessionCount = a.sessions.length || 1;
      patterns[sid][a._id.dow] = {
        day: dayNames[a._id.dow],
        avgCheckins: Math.round(a.checkins / sessionCount),
        absentRate: a.checkins > 0 ? Math.round((a.absents / a.checkins) * 100) : 0,
      };
    });

    const forecast = [];
    const now = new Date();
    for (let d = 0; d <= 6; d++) {
      const date = new Date(now);
      date.setDate(now.getDate() + d);
      const dow = date.getDay() + 1;
      const dateStr = date.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday:"short", month:"short", day:"numeric" });
      for (const session of sessions) {
        const pattern = patterns[session._id.toString()]?.[dow];
        if (pattern) {
          const rosterSize = rosterSizes[session._id.toString()];
          const predicted = rosterSize > 0
            ? Math.round(rosterSize * (1 - pattern.absentRate / 100))
            : pattern.avgCheckins;
          forecast.push({
            date: dateStr, dow, dayName: dayNames[dow],
            subject: session.subject, sessionId: session._id,
            predictedCheckins: predicted,
            predictedAbsents: rosterSize > 0 ? rosterSize - predicted : null,
            historicalAbsentRate: pattern.absentRate,
            confidence: pattern.absentRate > 0 ? "medium" : "low",
            rosterSize,
          });
        }
      }
    }

    forecast.sort((a,b) => a.dow - b.dow);
    res.json({ success: true, forecast, generated: new Date() });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── Recurring Schedules ───────────────────────────────────────────────────────
const getRecurringSchedules = async (req, res) => {
  try {
    const schedules = await RecurringSchedule.find({ teacher: req.user._id, isActive: true }).sort({ createdAt: -1 });
    res.json({ success: true, schedules });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const createRecurringSchedule = async (req, res) => {
  try {
    const { subject, room, description, daysOfWeek, startTime, durationMinutes,
            lateAfterMinutes, allowedGrades, allowedSections, absenceLimit, absenceLimitEnabled } = req.body;
    if (!subject || !daysOfWeek?.length || !startTime)
      return res.status(400).json({ success: false, message: "Subject, days of week, and start time are required." });
    const activeYear = await AcademicYear.findOne({ isActive: true });
    const schedule = await RecurringSchedule.create({
      teacher: req.user._id, subject, room, description,
      daysOfWeek, startTime, durationMinutes: durationMinutes || 60,
      lateAfterMinutes: lateAfterMinutes || 15,
      allowedGrades: allowedGrades || [], allowedSections: allowedSections || [],
      academicYear: activeYear?._id || null,
      absenceLimit: absenceLimit || 3, absenceLimitEnabled: absenceLimitEnabled || false,
    });
    res.status(201).json({ success: true, schedule, message: "Recurring schedule created." });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const updateRecurringSchedule = async (req, res) => {
  try {
    const schedule = await RecurringSchedule.findOne({ _id: req.params.id, teacher: req.user._id });
    if (!schedule) return res.status(404).json({ success: false, message: "Schedule not found." });
    const allowed = ["subject","room","description","daysOfWeek","startTime","durationMinutes",
                     "lateAfterMinutes","allowedGrades","allowedSections","isActive","absenceLimit","absenceLimitEnabled"];
    allowed.forEach(f => { if (req.body[f] !== undefined) schedule[f] = req.body[f]; });
    await schedule.save();
    res.json({ success: true, schedule, message: "Schedule updated." });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const deleteRecurringSchedule = async (req, res) => {
  try {
    const schedule = await RecurringSchedule.findOneAndDelete({ _id: req.params.id, teacher: req.user._id });
    if (!schedule) return res.status(404).json({ success: false, message: "Schedule not found." });
    res.json({ success: true, message: "Recurring schedule deleted." });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const generateDailySessions = async (req, res) => {
  try {
    const now = new Date();
    const manilaTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const todayDOW  = manilaTime.getUTCDay();
    const todayStr  = manilaTime.toISOString().split("T")[0];

    const filter = req.user.role === "teacher"
      ? { teacher: req.user._id, isActive: true, daysOfWeek: todayDOW }
      : { isActive: true, daysOfWeek: todayDOW };

    const schedules = await RecurringSchedule.find(filter);
    let created = 0;

    for (const schedule of schedules) {
      if (schedule.createdDates.includes(todayStr)) continue;
      const [hh, mm] = schedule.startTime.split(":").map(Number);
      const sessionStart = new Date(manilaTime);
      sessionStart.setUTCHours(hh - 8, mm, 0, 0);
      const sessionEnd = new Date(sessionStart.getTime() + schedule.durationMinutes * 60 * 1000);
      const activeYear = await AcademicYear.findOne({ isActive: true });
      await Session.create({
        subject: schedule.subject, teacher: schedule.teacher,
        room: schedule.room, description: schedule.description,
        lateAfterMinutes: schedule.lateAfterMinutes,
        allowedGrades: schedule.allowedGrades, allowedSections: schedule.allowedSections,
        scheduledStart: sessionStart, scheduledEnd: sessionEnd,
        expiresAt: new Date(Date.now() + 210 * 24 * 60 * 60 * 1000),
        recurringSchedule: schedule._id,
        academicYear: activeYear?._id || null,
        absenceLimit: schedule.absenceLimit,
        absenceLimitEnabled: schedule.absenceLimitEnabled,
      });
      schedule.createdDates.push(todayStr);
      await schedule.save();
      created++;
    }

    res.json({ success: true, created, message: `${created} session${created !== 1 ? "s" : ""} created from recurring schedules.` });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

module.exports = {
  getAcademicYears, createAcademicYear, setActiveYear, archiveYear,
  promoteStudents, previewPromotion,
  getSectionLeaderboard, getAttendanceForecast,
  getRecurringSchedules, createRecurringSchedule, updateRecurringSchedule,
  deleteRecurringSchedule, generateDailySessions,
};
