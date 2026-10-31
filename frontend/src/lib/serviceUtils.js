import axios from 'axios';
import { API_ENDPOINT, BACKEND_BASE_URL } from '@/lib/apiConfig';

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

/** Thin wrapper so every Service & Maintenance call sends the token and returns `data`. */
export const serviceApi = {
  get: (path, params) => axios.get(`${API_ENDPOINT}${path}`, { headers: authHeader(), params }).then((r) => r.data),
  post: (path, body) => axios.post(`${API_ENDPOINT}${path}`, body ?? {}, { headers: authHeader() }).then((r) => r.data),
  put: (path, body) => axios.put(`${API_ENDPOINT}${path}`, body ?? {}, { headers: authHeader() }).then((r) => r.data),
  del: (path, params) => axios.delete(`${API_ENDPOINT}${path}`, { headers: authHeader(), params }).then((r) => r.data),
  upload: (path, formData, onProgress) => axios
    .post(`${API_ENDPOINT}${path}`, formData, {
      headers: authHeader(),
      onUploadProgress: (event) => {
        if (onProgress && event.total) onProgress(Math.round((event.loaded * 100) / event.total));
      },
    })
    .then((r) => r.data),
  /** Fetches a file with the token and returns a Blob (used for PDF / CSV downloads). */
  blob: (path, params) => axios
    .get(`${API_ENDPOINT}${path}`, { headers: authHeader(), params, responseType: 'blob' })
    .then((r) => r),
};

/** Stored files are either absolute (S3) or relative (/uploads/...) on the API host. */
export function fileHref(url) {
  if (!url) return '#';
  return /^https?:\/\//i.test(url) ? url : `${BACKEND_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function triggerDownload(blob, fileName) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export function fmtDate(value) {
  if (!value) return '—';
  const text = String(value);
  const d = new Date(text.length <= 10 ? `${text}T00:00:00` : text);
  if (Number.isNaN(d.getTime())) return text;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtBytes(bytes) {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export const STATUS_STYLES = {
  Draft: 'bg-slate-100 text-slate-700 border-slate-200',
  New: 'bg-sky-50 text-sky-800 border-sky-200',
  Scheduled: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  Assigned: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  'In Progress': 'bg-blue-50 text-blue-800 border-blue-200',
  'On Hold': 'bg-amber-50 text-amber-800 border-amber-200',
  'Awaiting Customer': 'bg-amber-50 text-amber-800 border-amber-200',
  'Awaiting Parts': 'bg-amber-50 text-amber-800 border-amber-200',
  'Waiting for Vendor': 'bg-purple-50 text-purple-800 border-purple-200',
  'Inspection Pending': 'bg-cyan-50 text-cyan-800 border-cyan-200',
  'Report Pending': 'bg-cyan-50 text-cyan-800 border-cyan-200',
  Completed: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  Closed: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  Cancelled: 'bg-rose-50 text-rose-800 border-rose-200',
};

export const PRIORITY_STYLES = {
  Low: 'bg-slate-100 text-slate-700',
  Medium: 'bg-sky-50 text-sky-800',
  High: 'bg-orange-50 text-orange-800',
  Critical: 'bg-rose-100 text-rose-800',
};

/** Summary cards on the listing page. `card` is the key the API understands. */
export const SUMMARY_CARDS = [
  { key: '', stat: 'total', label: 'Total' },
  { key: 'new', stat: 'new', label: 'New' },
  { key: 'assigned', stat: 'assigned', label: 'Assigned' },
  { key: 'in_progress', stat: 'in_progress', label: 'In progress' },
  { key: 'waiting_vendor', stat: 'waiting_vendor', label: 'Waiting for vendor' },
  { key: 'waiting_customer', stat: 'waiting_customer', label: 'Waiting for customer' },
  { key: 'completed', stat: 'completed', label: 'Completed' },
  { key: 'overdue', stat: 'overdue', label: 'Overdue' },
];

export const CUSTOMER_TYPE_COPY = {
  New: {
    title: 'New customer',
    hint: 'They are not in the system yet. On this call you only need their name, address, number, the problem and any notes.',
  },
  Existing: {
    title: 'Existing customer',
    hint: 'They are already in the system. Find them, then record what they told you on the call.',
  },
};

export const DETAIL_TABS = {
  overview: 'Overview',
  customer: 'Customer & Product',
  inspection: 'Inspection',
  worklog: 'Work Log',
  visits: 'Visits',
  files: 'Photos & Documents',
  vendor: 'Vendor Repair',
  report: 'Service Report',
  history: 'History',
};

/**
 * Form definitions for the per-request sections. `enum` fields take their options from /service/meta
 * (so the screen and the server always agree). `required` fields are the ones the completion gate checks.
 */
export const SECTION_FIELDS = {
  inspection: [
    { key: 'inspection_date', label: 'Inspection date', type: 'date', required: true },
    { key: 'inspector', label: 'Inspected by', type: 'text', required: true },
    { key: 'site_readiness', label: 'Site readiness', type: 'enum', required: true },
    { key: 'electrical', label: 'Electrical readiness', type: 'textarea', wide: true },
    { key: 'mechanical', label: 'Mechanical / civil readiness', type: 'textarea', wide: true },
    { key: 'space', label: 'Space and location', type: 'textarea', wide: true },
    { key: 'tools', label: 'Tools and materials needed', type: 'textarea', wide: true },
    { key: 'pending_customer', label: 'Work pending on the customer side', type: 'textarea', wide: true },
    { key: 'remarks', label: 'Remarks', type: 'textarea', wide: true },
  ],
  execution: [
    { key: 'status', label: 'Installation status', type: 'enum', required: true },
    { key: 'technician', label: 'Technician', type: 'text' },
    { key: 'start_at', label: 'Started at', type: 'datetime', required: true },
    { key: 'end_at', label: 'Completed at', type: 'datetime', required: true },
    { key: 'materials', label: 'Materials / parts used', type: 'textarea', wide: true },
    { key: 'notes', label: 'Installation notes', type: 'textarea', wide: true },
    { key: 'issues', label: 'Issues identified', type: 'textarea', wide: true },
    { key: 'pending', label: 'Pending work', type: 'textarea', wide: true },
    { key: 'dependencies', label: 'Customer-side dependencies', type: 'textarea', wide: true },
    { key: 'result', label: 'Result', type: 'textarea', wide: true },
  ],
  commissioning: [
    { key: 'status', label: 'Commissioning status', type: 'enum', required: true },
    { key: 'commissioning_date', label: 'Commissioning date', type: 'date', required: true },
    { key: 'engineer', label: 'Commissioning engineer', type: 'text', required: true },
    { key: 'startup_result', label: 'Initial start-up result', type: 'textarea', wide: true },
    { key: 'functional', label: 'Functional tests', type: 'textarea', wide: true },
    { key: 'parameters', label: 'Parameters / configuration', type: 'textarea', wide: true },
    { key: 'test_run', label: 'Test run results', type: 'textarea', wide: true },
    { key: 'safety', label: 'Safety checks', type: 'textarea', wide: true },
    { key: 'issues', label: 'Issues found', type: 'textarea', wide: true },
    { key: 'corrective', label: 'Corrective actions', type: 'textarea', wide: true },
    { key: 'remarks', label: 'Remarks, pending items or revisit reason', type: 'textarea', wide: true },
  ],
  troubleshooting: [
    { key: 'inspection_date', label: 'Inspection date', type: 'date', required: true },
    { key: 'technician', label: 'Technician', type: 'text' },
    { key: 'initial_condition', label: 'Initial product condition', type: 'textarea', wide: true },
    { key: 'problem_verified', label: 'Problem verified?', type: 'enum' },
    { key: 'steps', label: 'Troubleshooting steps performed', type: 'textarea', wide: true },
    { key: 'fault_identified', label: 'Fault identified', type: 'textarea', required: true, wide: true },
    { key: 'root_cause', label: 'Probable root cause', type: 'textarea', wide: true },
    { key: 'required_repair', label: 'Repair required', type: 'textarea', wide: true },
    { key: 'parts_required', label: 'Spare parts required', type: 'textarea', wide: true },
    { key: 'feasibility', label: 'Repair feasibility', type: 'enum' },
    { key: 'repair_location', label: 'Repair location', type: 'enum' },
    { key: 'technician_remarks', label: 'Technician remarks', type: 'textarea', wide: true },
  ],
  work: [
    { key: 'repair_status', label: 'Repair status', type: 'enum', required: true },
    { key: 'technician', label: 'Technician', type: 'text' },
    { key: 'start_at', label: 'Work started at', type: 'datetime', required: true },
    { key: 'end_at', label: 'Work ended at', type: 'datetime', required: true },
    { key: 'troubleshooting_performed', label: 'Troubleshooting performed', type: 'textarea', wide: true },
    { key: 'repair_actions', label: 'Repair actions performed', type: 'textarea', required: true, wide: true },
    { key: 'parts_replaced', label: 'Parts replaced', type: 'textarea', wide: true },
    { key: 'spares_used', label: 'Spare parts used', type: 'textarea', wide: true },
    { key: 'config_changes', label: 'Configuration changes', type: 'textarea', wide: true },
    { key: 'tests', label: 'Tests conducted', type: 'textarea', wide: true },
    { key: 'results', label: 'Results', type: 'textarea', wide: true },
    { key: 'pending', label: 'Work pending', type: 'textarea', wide: true },
    { key: 'incomplete_reason', label: 'Reason, if incomplete', type: 'textarea', wide: true },
    { key: 'next_step', label: 'Next step, if incomplete', type: 'enum' },
    { key: 'additional_visit', label: 'Additional visit required?', type: 'text' },
    { key: 'remarks', label: 'Remarks', type: 'textarea', wide: true },
  ],
  final_test: [
    { key: 'outcome', label: 'Final test result', type: 'enum', required: true },
    { key: 'final_inspection_date', label: 'Final inspection date', type: 'date', required: true },
    { key: 'inspector', label: 'Inspected by', type: 'text', required: true },
    { key: 'operational_status', label: 'Product operational status', type: 'text', required: true },
    { key: 'functional', label: 'Functional test', type: 'textarea', wide: true },
    { key: 'performance', label: 'Performance test', type: 'textarea', wide: true },
    { key: 'safety', label: 'Safety check', type: 'textarea', wide: true },
    { key: 'demo', label: 'Customer demonstration', type: 'textarea', wide: true },
    { key: 'remaining', label: 'Remaining issues', type: 'textarea', wide: true },
    { key: 'remarks', label: 'Final remarks', type: 'textarea', wide: true },
  ],
  amc: [
    { key: 'planned_visit_date', label: 'Planned visit date', type: 'date' },
    { key: 'actual_visit_date', label: 'Actual visit date', type: 'date', required: true },
    { key: 'technician', label: 'Technician', type: 'text' },
    { key: 'product_condition', label: 'Product condition', type: 'text', required: true },
    { key: 'findings', label: 'Findings', type: 'textarea', wide: true },
    { key: 'work_performed', label: 'Work performed', type: 'textarea', required: true, wide: true },
    { key: 'parts_used', label: 'Parts used', type: 'textarea', wide: true },
    { key: 'test_results', label: 'Test results / readings', type: 'textarea', wide: true },
    { key: 'pending', label: 'Pending issues', type: 'textarea', wide: true },
    { key: 'next_service_date', label: 'Next recommended service', type: 'date' },
  ],
};

export const SECTION_TITLES = {
  inspection: 'Site inspection',
  execution: 'Installation execution',
  commissioning: 'Commissioning',
  troubleshooting: 'Troubleshooting / inspection',
  work: 'Repair / service work',
  final_test: 'Final test and inspection',
  amc: 'AMC maintenance visit',
};

/** Which sections appear on the Inspection tab and which on the Work Log tab, per workflow. */
export const TAB_SECTIONS = {
  installation: { inspection: ['inspection'], worklog: ['execution', 'commissioning'] },
  repair: { inspection: ['troubleshooting'], worklog: ['work', 'final_test'] },
  amc: { inspection: ['amc'], worklog: [] },
};

/** Attachment categories offered on the Inspection and Work Log tabs (the Files tab offers all of them). */
export const EVIDENCE_CATEGORIES = {
  inspection: {
    installation: ['Site Inspection Photos', 'Site Before Installation'],
    repair: ['Before-Service Photos/Videos', 'Site Inspection Photos'],
    amc: ['Before-Service Photos/Videos', 'Site Inspection Photos'],
  },
  worklog: {
    installation: ['Installation in Progress', 'Installed Product', 'Commissioning Evidence', 'Final Site Condition'],
    repair: ['During-Service Photos/Videos', 'After-Service Photos/Videos'],
    amc: ['During-Service Photos/Videos', 'After-Service Photos/Videos'],
  },
};

export const CHECKLIST_KEYS = {
  inspection: 'installation_inspection',
  execution: 'installation_execution',
  commissioning: 'commissioning',
  troubleshooting: 'repair_inspection',
  amc: 'amc',
};

export function checklistRows(labels) {
  return (labels || []).map((label) => ({ id: uid(), label, done: false, remark: '', required: true }));
}

export const SITE_VISIT_ACK_CATEGORY = 'Site Visit Acknowledgement';

export const SERVICE_TYPES_BY_CUSTOMER = {
  New: ['Installation & Commissioning', 'Repair and Troubleshooting'],
  Existing: ['Troubleshooting / Breakdown', 'Repair', 'General Service', 'Preventive Maintenance', 'AMC Visit'],
};

export const WORKFLOW_BY_SERVICE_TYPE = {
  'Installation & Commissioning': 'installation',
  'On-site Commissioning': 'installation',
  'Repair and Troubleshooting': 'repair',
  'Repair and Trouble shooting': 'repair',
  'Troubleshooting / Breakdown': 'repair',
  Repair: 'repair',
  'General Service': 'repair',
  'Preventive Maintenance': 'repair',
  'AMC Visit': 'amc',
};

export function serviceTypesForCustomer(customerType, meta) {
  if (customerType === 'New') return SERVICE_TYPES_BY_CUSTOMER.New;
  const fromMeta = meta?.service_types_by_customer?.[customerType];
  if (Array.isArray(fromMeta) && fromMeta.length) return fromMeta;
  return SERVICE_TYPES_BY_CUSTOMER[customerType] || [];
}

export function workflowForServiceType(type, meta) {
  return meta?.workflow_by_service_type?.[type] || WORKFLOW_BY_SERVICE_TYPE[type] || '';
}

export function workflowsForServiceTypes(types, meta) {
  return new Set((types || []).map((item) => workflowForServiceType(item, meta)).filter(Boolean));
}

export const INSTALLATION_PRODUCT_CATEGORIES = [
  'Electrical Automation',
  'Instrumentation',
  'Electrical & Electronics',
  'Water and Waste Water',
  'Environment Liaisoning',
  'Other',
];

export const VENDOR_FIELD_GROUPS = [
  {
    title: 'Vendor and reason',
    fields: [
      { key: 'reason', label: 'Reason for vendor repair', type: 'textarea', wide: true },
      { key: 'fault_description', label: 'Fault description', type: 'textarea', wide: true },
      { key: 'internal_findings', label: 'Internal inspection findings', type: 'textarea', wide: true },
      { key: 'warranty_amc_info', label: 'Warranty / AMC information', type: 'text', wide: true },
    ],
  },
  {
    title: 'Dispatch',
    fields: [
      { key: 'dispatch_date', label: 'Dispatch date', type: 'date' },
      { key: 'dispatch_reference', label: 'Tracking / courier / vehicle reference', type: 'text' },
      { key: 'expected_return_date', label: 'Expected return date', type: 'date' },
      { key: 'vendor_ack', label: 'Vendor acknowledgement', type: 'text' },
      { key: 'dispatch_remarks', label: 'Dispatch remarks', type: 'textarea', wide: true },
    ],
  },
  {
    title: 'Vendor work',
    fields: [
      { key: 'vendor_completion_date', label: 'Vendor completion date', type: 'date' },
      { key: 'work_performed_by_vendor', label: 'Work performed by vendor', type: 'textarea', wide: true },
      { key: 'parts_replaced_by_vendor', label: 'Parts replaced by vendor', type: 'textarea', wide: true },
      { key: 'vendor_charges', label: 'Vendor charges', type: 'number' },
      { key: 'vendor_warranty', label: 'Vendor warranty on repair', type: 'text' },
      { key: 'vendor_remarks', label: 'Vendor remarks', type: 'textarea', wide: true },
    ],
  },
  {
    title: 'Return',
    fields: [
      { key: 'return_dispatch_date', label: 'Vendor dispatch date (return)', type: 'date' },
      { key: 'actual_return_date', label: 'Actual return date', type: 'date' },
    ],
  },
];

export const INPUT_CLASS = 'h-10 w-full rounded-md border border-slate-200 bg-white px-2 text-sm disabled:bg-slate-50 disabled:text-slate-500';
