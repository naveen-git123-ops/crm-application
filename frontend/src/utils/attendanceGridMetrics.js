import { eachDayOfInterval, endOfMonth, format } from 'date-fns';

/** Same threshold as Attendance grid / summary tab (10:30). */
const LATE_THRESHOLD_MINUTES = 10 * 60 + 30;

/** Present-day credit: full day = 1, half day = 0.5. */
export const presentDayCredit = (record) => {
  if (!record) return 0;
  if (record.is_tour === 1 && record.tour_approval_status === 'approved') return 1;
  const status = record.status;
  if (status === 'Present' || status === 'Leave') return 1;
  if (status === 'Half Day') return 0.5;
  return 0;
};

export const formatDayCount = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

/**
 * Group raw `/attendance?month=` rows by `employee_id` with `records[date]` shape
 * (matches Attendance grid `gridData`).
 */
export function groupAttendanceRecordsByEmployee(records) {
  const map = {};
  (records || []).forEach((record) => {
    const id = record.employee_id;
    if (!id) return;
    if (!map[id]) {
      map[id] = {
        employee_id: id,
        employee_name: record.employee_name || '',
        records: {}
      };
    }
    map[id].records[record.date] = record;
  });
  return map;
}

/**
 * "Present / days" column logic from Attendance month grid (`Attendance.js` ~1426–1459).
 * @param {Record<string, object>} recordsByDate - `empData.records`
 * @param {string} monthStr - `yyyy-MM`
 * @param {Iterable<string>|Set<string>} holidayDates - `YYYY-MM-DD` strings
 */
export function computePresentWorkingAbsentForMonth(recordsByDate, monthStr, holidayDates) {
  const parts = String(monthStr || '').split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (!y || !m) {
    return { presentDays: 0, totalWorkingDays: 0, absentDays: 0, halfDayDays: 0, tourDays: 0 };
  }

  const monthStart = new Date(y, m - 1, 1);
  const monthEnd = endOfMonth(monthStart);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const holidaySet = holidayDates instanceof Set ? holidayDates : new Set(holidayDates || []);

  let totalWorkingDays = 0;
  let presentDays = 0;
  let halfDayDays = 0;
  let tourDays = 0;

  days.forEach((day) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const dayDate = new Date(day);
    dayDate.setHours(0, 0, 0, 0);
    const isFutureDate = dayDate > today;
    const isSunday = day.getDay() === 0;
    const isHoliday = holidaySet.has(dateStr);
    const record = recordsByDate[dateStr];

    if (!isFutureDate && !isSunday && !isHoliday) {
      totalWorkingDays += 1;
      const credit = presentDayCredit(record);
      if (credit > 0) presentDays += credit;
      if (record?.status === 'Half Day') halfDayDays += 1;
      if (record?.is_tour === 1 && record?.tour_approval_status === 'approved') {
        tourDays += 1;
      }
    }
  });

  const absentDays = Math.max(totalWorkingDays - presentDays, 0);
  return { presentDays, totalWorkingDays, absentDays, halfDayDays, tourDays };
}

/**
 * Late login count for one employee in the month (same rules as grid `lateLogins`).
 */
export function countLateLoginsForEmployeeRecords(recordsByDate) {
  let count = 0;
  Object.values(recordsByDate || {}).forEach((record) => {
    if (record?.is_tour === 1) return;
    const punchIn = record?.punch_in;
    if (!punchIn || typeof punchIn !== 'string') return;
    const parts = punchIn.split(':');
    const h = parseInt(parts[0], 10);
    const mm = parseInt(parts[1], 10) || 0;
    if (Number.isNaN(h)) return;
    if (h * 60 + mm > LATE_THRESHOLD_MINUTES) count += 1;
  });
  return count;
}

/**
 * Build per-employee metrics for Salary using the same rules as the attendance grid.
 */
export function buildSalaryAttendanceMetrics(employees, attendanceRecords, holidayList, monthStr) {
  const holidaySet = new Set((holidayList || []).map((h) => h.date).filter(Boolean));
  const byEmp = groupAttendanceRecordsByEmployee(attendanceRecords);
  const metrics = {};

  (employees || []).forEach((emp) => {
    const id = emp.employee_id;
    const recordsByDate = byEmp[id]?.records || {};
    const { presentDays, totalWorkingDays, absentDays, halfDayDays, tourDays } = computePresentWorkingAbsentForMonth(
      recordsByDate,
      monthStr,
      holidaySet
    );
    const lateDays = countLateLoginsForEmployeeRecords(recordsByDate);
    metrics[id] = {
      employee_id: id,
      employee_name: emp.name || byEmp[id]?.employee_name || '',
      present_days: presentDays,
      absent_days: absentDays,
      /** Working days in grid sense (non-future, non-Sunday, non-holiday). */
      working_days: totalWorkingDays,
      late_days: lateDays,
      half_day_days: halfDayDays,
      tour_days: tourDays
    };
  });

  return metrics;
}
