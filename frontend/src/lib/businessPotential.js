export const BPO_OUTCOMES = [
  { key: 'called_interested', label: 'Connected — interested', needsNext: true },
  { key: 'callback', label: 'Call back later', needsNext: true },
  { key: 'no_answer', label: 'No answer', needsNext: true },
  { key: 'busy', label: 'Busy / not available', needsNext: true },
  { key: 'called_not_interested', label: 'Not interested', needsNext: false },
  { key: 'wrong_number', label: 'Wrong number', needsNext: false },
];

export const BPO_STATUS_LABELS = {
  new: 'New',
  follow_up: 'Follow-up',
  not_interested: 'Not interested',
  not_reachable: 'Not reachable',
  converted: 'Converted',
};

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
