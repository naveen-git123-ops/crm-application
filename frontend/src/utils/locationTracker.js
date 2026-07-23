import { formatISTDateTime } from '@/utils/date';

export function formatCoord(lat, lng) {
  if (lat == null || lng == null) return '—';
  return `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
}

export function formatTimeShort(time) {
  if (!time || typeof time !== 'string') return '—';
  const parts = time.split(':');
  if (parts.length < 2) return time;
  const h = parseInt(parts[0], 10);
  const m = parts[1];
  if (Number.isNaN(h)) return time.slice(0, 5);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

export function eventSortKey(loc, dateStr) {
  if (loc?.timestamp) return String(loc.timestamp);
  const t = loc?.time || '00:00:00';
  return `${dateStr || ''}T${t}`;
}

/** Chronological day journey for timeline (punches + GPS stops). */
export function buildDayTimeline(punchEvents = [], trackRecords = [], dateStr = '', maxTrackRows = 48) {
  const punches = (punchEvents || []).map((p) => ({
    id: p.id,
    kind: p.type,
    time: p.time,
    timestamp: p.timestamp,
    latitude: p.latitude,
    longitude: p.longitude,
    sortKey: eventSortKey(p, dateStr),
    title:
      p.type === 'punch_in'
        ? 'Punched in'
        : p.type === 'punch_out'
          ? 'Punched out'
          : 'Attendance',
    subtitle: formatCoord(p.latitude, p.longitude),
  }));

  const tracks = (trackRecords || []).map((t, index) => ({
    id: t.id || `track-${index}`,
    kind: 'track',
    time: t.time,
    timestamp: t.timestamp,
    latitude: t.latitude,
    longitude: t.longitude,
    accuracy: t.accuracy,
    sortKey: eventSortKey(t, dateStr),
    title: 'Location update',
    subtitle: formatCoord(t.latitude, t.longitude),
  }));

  let sampledTracks = tracks;
  let trackSampleNote = null;
  if (tracks.length > maxTrackRows) {
    const step = Math.ceil(tracks.length / maxTrackRows);
    sampledTracks = tracks.filter((_, i) => i % step === 0 || i === tracks.length - 1);
    trackSampleNote = `Showing ${sampledTracks.length} of ${tracks.length} GPS updates`;
  }

  const merged = [...punches, ...sampledTracks].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return { items: merged, trackSampleNote, totalTrackPoints: tracks.length };
}

export function formatRecordedAt(loc) {
  if (loc?.timestamp) return formatISTDateTime(loc.timestamp);
  if (loc?.time) return loc.time;
  return '—';
}
