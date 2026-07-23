/**
 * Turn FastAPI / Pydantic error payloads into a string safe for toast/UI.
 */
export function formatApiErrorDetail(detail, fallback = 'Something went wrong') {
  if (detail == null || detail === '') return fallback;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const parts = detail.map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const loc = Array.isArray(item.loc)
          ? item.loc.filter((x) => x !== 'body').join(' → ')
          : '';
        const msg = item.msg || item.message || '';
        return loc && msg ? `${loc}: ${msg}` : msg || JSON.stringify(item);
      }
      return String(item);
    });
    const text = parts.filter(Boolean).join('; ');
    return text || fallback;
  }
  if (typeof detail === 'object') {
    if (typeof detail.msg === 'string') return detail.msg;
    if (typeof detail.message === 'string') return detail.message;
    try {
      return JSON.stringify(detail);
    } catch {
      return fallback;
    }
  }
  return String(detail);
}

export function getApiErrorMessage(error, fallback = 'Something went wrong') {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  const data = error.response?.data;
  if (data?.detail != null) return formatApiErrorDetail(data.detail, fallback);
  if (typeof data?.message === 'string') return data.message;
  if (typeof error.message === 'string' && error.message) return error.message;
  return fallback;
}
