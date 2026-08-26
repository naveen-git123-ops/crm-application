export const BPO_DESK_OUTCOMES = [
  { key: 'on_hold', label: 'On hold', needsNext: true },
  { key: 'site_visit', label: 'Need site visit' },
  { key: 'our_client', label: 'Our client', convert: true },
  { key: 'not_qualified', label: 'Not qualified', needsReason: true },
];

export const BPO_SITE_VISIT_OUTCOMES = [
  { key: 'visit_note', label: 'Log visit note' },
  { key: 'on_hold', label: 'Return to BPO queue (on hold)', needsNext: true },
  { key: 'our_client', label: 'Our client', convert: true },
  { key: 'not_qualified', label: 'Not qualified', needsReason: true },
];

export const BPO_OUTCOMES = [...BPO_DESK_OUTCOMES, ...BPO_SITE_VISIT_OUTCOMES];

export const BPO_NOT_QUALIFIED_REASONS = [
  'Wrong industry / not a fit',
  'Already has a consultant',
  'NOC expired / not renewable',
  'Could not contact after attempts',
  'Not interested in paid service',
  'Duplicate record',
  'Other',
];

export const BPO_STATUS_LABELS = {
  new: 'New',
  follow_up: 'Follow-up',
  on_hold: 'On hold',
  site_visit: 'Need site visit',
  not_qualified: 'Not qualified',
  our_client: 'Our client',
  converted: 'Our client',
  not_interested: 'Not interested',
  not_reachable: 'Not reachable',
};

export const BPO_STATUS_TONES = {
  new: 'bg-slate-100 text-slate-700',
  follow_up: 'bg-indigo-50 text-indigo-800',
  on_hold: 'bg-amber-50 text-amber-800',
  site_visit: 'bg-sky-50 text-sky-800',
  not_qualified: 'bg-rose-50 text-rose-800',
  our_client: 'bg-emerald-50 text-emerald-800',
  converted: 'bg-emerald-50 text-emerald-800',
  not_interested: 'bg-slate-100 text-slate-600',
  not_reachable: 'bg-slate-100 text-slate-600',
};

export const BPO_STATUS_FILTERS = [
  { key: '', label: 'All BPO statuses' },
  { key: 'new', label: 'New' },
  { key: 'on_hold', label: 'On hold' },
  { key: 'follow_up', label: 'Follow-up' },
  { key: 'site_visit', label: 'Need site visit' },
  { key: 'our_client', label: 'Our client' },
  { key: 'not_qualified', label: 'Not qualified' },
];

export function bpoStatusLabel(status) {
  return BPO_STATUS_LABELS[status] || 'New';
}

export function bpoOutcomeLabel(outcome) {
  return (
    BPO_DESK_OUTCOMES.find((item) => item.key === outcome)?.label
    || BPO_SITE_VISIT_OUTCOMES.find((item) => item.key === outcome)?.label
    || BPO_STATUS_LABELS[outcome]
    || outcome
  );
}

export function parseCommunicationContacts(address) {
  const text = String(address || '');
  const emailMatch = text.match(/Email\s*:\s*([^,]*)/i);
  const contactMatch = text.match(/Contact\s*:\s*([^,]*)/i);
  return {
    email: (emailMatch?.[1] || '').trim(),
    contact: (contactMatch?.[1] || '').trim(),
  };
}

export function rowEmail(row) {
  return row?.contact_email || parseCommunicationContacts(row?.communication_address).email;
}

export function rowContact(row) {
  return row?.contact_phone || parseCommunicationContacts(row?.communication_address).contact;
}

export function displayValue(value) {
  const text = String(value ?? '').trim();
  return text || '—';
}

export function displayDate(value) {
  const text = String(value ?? '').trim();
  if (!text) return '—';
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  return text;
}

function parseValidDate(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const dt = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return null;
  const dt = new Date(parsed);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export function validEndRowTone(raw) {
  const end = parseValidDate(raw);
  if (!end) return null;
  const today = startOfToday();
  if (end.getTime() < today.getTime()) return 'red';
  const limit90 = new Date(today);
  limit90.setDate(limit90.getDate() + 90);
  if (end.getTime() <= limit90.getTime()) return 'yellow';
  const limit365 = new Date(today);
  limit365.setDate(limit365.getDate() + 365);
  if (end.getTime() <= limit365.getTime()) return 'sky';
  return null;
}

export function daysUntilExpiry(raw) {
  const end = parseValidDate(raw);
  if (!end) return null;
  return Math.round((end.getTime() - startOfToday().getTime()) / 86400000);
}

export function displayDaysUntilExpiry(raw) {
  const days = daysUntilExpiry(raw);
  if (days === null) return '—';
  if (days === 0) return '0 (today)';
  if (days > 0) return `${days} days`;
  return `Expired ${Math.abs(days)} days`;
}

export function convertPrefill(row) {
  const phone = rowContact(row);
  const email = rowEmail(row);
  return {
    company_name: String(row?.project_name || '').trim(),
    contact_person_name: String(row?.project_name || '').trim() || 'Authorized person',
    phone,
    email,
    address_line: String(row?.proposed_address || row?.communication_address || '').trim().slice(0, 240),
    city: String(row?.district_name || '').trim(),
    state: String(row?.state_name || '').trim(),
    pincode: '',
    notes: '',
  };
}

export function todayIso() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
