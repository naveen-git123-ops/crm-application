// Shared helpers to ensure all dates/times are shown in IST (Asia/Kolkata)

const IST_DATE_OPTIONS = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'Asia/Kolkata',
};

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

