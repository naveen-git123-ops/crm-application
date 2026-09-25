export const HEALTH_STYLES = {
  green: { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200', label: 'On track' },
  yellow: { dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200', label: 'At risk' },
  red: { dot: 'bg-rose-500', badge: 'bg-rose-50 text-rose-800 ring-1 ring-rose-200', label: 'Overdue' },
};

export const TAB_LABELS = {
  overview: 'Overview',
  tasks: 'Tasks',
  procurement: 'Procurement',
  vendor: 'Vendor',
  material: 'Material',
  site: 'Site / Service',
  dispatch: 'Dispatch',
  installation: 'Installation',
  expenses: 'Expenses',
  documents: 'Documents',
  invoice: 'Invoice & Payment',
  followups: 'Follow-ups',
  timeline: 'Timeline',
  closure: 'Closure',
};

export const CLOSURE_LABELS = {
  customer_po_completed: 'Customer PO completed',
  quantity_verified: 'Quantity verified',
  material_delivered: 'Material delivered',
  installation_completed: 'Installation completed',
  testing_completed: 'Testing completed',
  commissioning_completed: 'Commissioning completed',
  customer_acceptance: 'Customer acceptance obtained',
  delivery_documents: 'Delivery documents uploaded',
  service_report: 'Service / installation report uploaded',
  invoice_raised: 'Invoice raised',
  payment_status_recorded: 'Payment status recorded',
  outstanding_recorded: 'Outstanding amount recorded',
  warranty_recorded: 'Warranty recorded',
  amc_evaluated: 'AMC opportunity evaluated',
  final_expenses_recorded: 'Final expenses recorded',
  final_cost_calculated: 'Final actual cost calculated',
};

export function formatMoney(value) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function openOperationTab(operationId) {
  if (!operationId) return;
  window.open(`/operations/${operationId}`, '_blank', 'noopener,noreferrer');
}
