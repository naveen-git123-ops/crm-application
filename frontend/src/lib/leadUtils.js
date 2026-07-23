export const LEAD_SOURCES = ['India Mart', 'Mail Enquiry', 'Telephonic', 'Whats app', 'Other'];
export const LEAD_STATUSES = ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'];
export const LEAD_ACTIVITY_TYPES = ['Call', 'Email', 'Meeting', 'Note'];

export const LEAD_CATEGORY_OPTIONS = [
  'Project',
  'Automation',
  'Instrumentation',
  'Electrical & Electronics',
  'ION Exchange SSD',
  'ION Exchange Chemical',
  'CGWA NOC',
  'CGWA Flowmeter',
];

export const BUSINESS_CATEGORY_OPTIONS = ['carry and order', 'stock and sell', 'consultancy'];
export const CARRY_AND_ORDER = 'carry and order';

export const STATUS_COLORS = {
  New: {
    dot: 'bg-slate-500',
    bar: 'bg-slate-500',
    badge: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
    pill: 'bg-slate-50 text-slate-700 border-slate-200',
  },
  Contacted: {
    dot: 'bg-blue-500',
    bar: 'bg-blue-500',
    badge: 'bg-blue-50 text-blue-800 ring-1 ring-blue-100',
    pill: 'bg-blue-50 text-blue-800 border-blue-200',
  },
  Qualified: {
    dot: 'bg-cyan-500',
    bar: 'bg-cyan-500',
    badge: 'bg-cyan-50 text-cyan-800 ring-1 ring-cyan-100',
    pill: 'bg-cyan-50 text-cyan-800 border-cyan-200',
  },
  Proposal: {
    dot: 'bg-indigo-500',
    bar: 'bg-indigo-500',
    badge: 'bg-indigo-50 text-indigo-800 ring-1 ring-indigo-100',
    pill: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  },
  Negotiation: {
    dot: 'bg-violet-500',
    bar: 'bg-violet-500',
    badge: 'bg-violet-50 text-violet-800 ring-1 ring-violet-100',
    pill: 'bg-violet-50 text-violet-800 border-violet-200',
  },
  Won: {
    dot: 'bg-emerald-500',
    bar: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100',
    pill: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  Lost: {
    dot: 'bg-rose-500',
    bar: 'bg-rose-500',
    badge: 'bg-rose-50 text-rose-800 ring-1 ring-rose-100',
    pill: 'bg-rose-50 text-rose-800 border-rose-200',
  },
};

export const isCarryAndOrder = (leadOrSubCategory) => {
  const value = typeof leadOrSubCategory === 'string'
    ? leadOrSubCategory
    : leadOrSubCategory?.sub_category;
  return (value || '').trim().toLowerCase() === CARRY_AND_ORDER;
};

export const leadNeedsVendor = (lead) => isCarryAndOrder(lead) && !lead?.vendor_id;

export const statusIndex = (status) => LEAD_STATUSES.indexOf(status);

export const isForwardStatusChange = (oldStatus, newStatus) => {
  const oldIdx = statusIndex(oldStatus);
  const newIdx = statusIndex(newStatus);
  return oldIdx >= 0 && newIdx > oldIdx;
};

export const getNextStatus = (status) => {
  const idx = statusIndex(status);
  if (idx < 0 || idx >= LEAD_STATUSES.length - 1) return null;
  return LEAD_STATUSES[idx + 1];
};

export const leadProgressPercent = (status) => {
  const idx = statusIndex(status);
  if (idx < 0) return 0;
  return Math.round(((idx + 1) / LEAD_STATUSES.length) * 100);
};

export const getLeadInitials = (lead) => {
  const name = lead?.company || lead?.contact_name || '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
};

export const formatLeadValue = (value) => {
  if (value == null || Number(value) <= 0) return '—';
  return `₹${Number(value).toLocaleString('en-IN')}`;
};

export const todayIsoDate = () => new Date().toISOString().slice(0, 10);

export const defaultLeadForm = () => ({
  contact_name: '',
  company: '',
  email: '',
  phone: '',
  source: 'Other',
  status: 'New',
  value: '',
  notes: '',
  assigned_to_employee_id: '',
  assigned_to_name: '',
  enquiry_date: todayIsoDate(),
  otx_date_from: '',
  otx_date_to: '',
  category: '',
  sub_category: '',
});
