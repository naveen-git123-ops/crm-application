/** Office attendance rules (IST). Keep in sync with backend/server.py */

export const PUNCH_IN_ON_TIME_END = 9 * 60 + 15; // 9:15 AM
export const PUNCH_IN_LATE_END = 10 * 60; // 10:00 AM — after this = half day
export const PUNCH_OUT_EARLY_BEFORE = 18 * 60 + 15; // 6:15 PM
export const PUNCH_OUT_LATE_AFTER = 19 * 60 + 30; // 7:30 PM
export const STANDARD_PUNCH_IN = '09:15';
export const STANDARD_PUNCH_OUT = '19:00';

/** Late login count threshold (after 9:15, includes half-day arrivals). */
export const LATE_THRESHOLD_MINUTES = PUNCH_IN_ON_TIME_END;

export const getAttendanceWallClockHM = (date, timeZone = 'Asia/Kolkata') => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  return { hour, minute };
};

export const punchMinutes = (date = new Date()) => {
  const { hour, minute } = getAttendanceWallClockHM(date);
  return hour * 60 + minute;
};

export const classifyPunchInNow = (date = new Date()) => {
  const mins = punchMinutes(date);
  if (mins <= PUNCH_IN_ON_TIME_END) return 'on_time';
  if (mins <= PUNCH_IN_LATE_END) return 'late';
  return 'half_day';
};

export const classifyPunchOutNow = (date = new Date()) => {
  const mins = punchMinutes(date);
  if (mins < PUNCH_OUT_EARLY_BEFORE) return 'early';
  if (mins <= PUNCH_OUT_LATE_AFTER) return 'on_time';
  return 'late';
};

export const isLatePunchInNow = (date = new Date()) => classifyPunchInNow(date) === 'late';
export const isHalfDayPunchInNow = (date = new Date()) => classifyPunchInNow(date) === 'half_day';
export const isEarlyPunchOutNow = (date = new Date()) => classifyPunchOutNow(date) === 'early';
export const isLatePunchOutNow = (date = new Date()) => classifyPunchOutNow(date) === 'late';

export const punchReasonDialogTitle = (punchType) => {
  switch (punchType) {
    case 'half_day_in':
      return 'Half day punch-in';
    case 'late_in':
      return 'Late punch-in';
    case 'early_out':
      return 'Early punch-out';
    case 'late_out':
      return 'Late punch-out';
    default:
      return 'Attendance reason';
  }
};

export const punchReasonDialogDescription = (punchType) => {
  switch (punchType) {
    case 'half_day_in':
      return 'You are punching in after 10:00 AM. This is treated as a half day. Enter a reason — admin must approve.';
    case 'late_in':
      return 'You are punching in after 9:15 AM. Enter a reason — admin must approve.';
    case 'early_out':
      return 'You are punching out before 6:15 PM. Enter a reason — admin must approve.';
    case 'late_out':
      return 'You are punching out after 7:30 PM. Enter a reason — admin must approve.';
    default:
      return 'Enter a reason below. Your request is sent to admin only after you submit this form.';
  }
};
