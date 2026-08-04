// Shared helpers to ensure all dates/times are shown in IST (Asia/Kolkata)
// Keep in sync with backend ATTENDANCE_TIMEZONE (default Asia/Kolkata).

export const ATTENDANCE_TIMEZONE = 'Asia/Kolkata';

const IST_DATE_OPTIONS = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: ATTENDANCE_TIMEZONE,
};

/** YYYY-MM-DD for attendance / daily work logs (IST wall calendar, not UTC). */
export const todayISTDateString = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: ATTENDANCE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

const IST_DATETIME_OPTIONS = {
  ...IST_DATE_OPTIONS,
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
};

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const formatISTDate = (value) => {
  const date = toDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('en-IN', IST_DATE_OPTIONS).format(date);
};

export const formatISTDateTime = (value) => {
  const date = toDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('en-IN', IST_DATETIME_OPTIONS).format(date);
};

