export const CARRY_ORDER_STAGES = [
  { id: 'enquiry_logged', label: 'Enquiry', short: '1' },
  { id: 'technical_clearance', label: 'Technical clearance', short: '2' },
  { id: 'bom_costing', label: 'BOM & costing', short: '3' },
  { id: 'offer_revision', label: 'Offer & revision', short: '4' },
  { id: 'follow_up', label: 'Follow-up', short: '5' },
  { id: 'closed_won', label: 'Closed won', short: '6a' },
  { id: 'closed_lost', label: 'Closed lost', short: '6b' },
];

export const LOSS_REASONS = [
  { id: 'price_high', label: 'Price high' },
  { id: 'relationship', label: 'Person of business / relationship issues' },
  { id: 'non_followup', label: 'Non-follow-up of customer (internal failure)' },
  { id: 'tpc_mismatch', label: 'TPC requirement mismatch (technical)' },
  { id: 'delivery_period', label: 'Delivery period issues' },
  { id: 'other', label: 'Any other custom reason' },
];

export const TRANSPORT_MODES = ['SEA', 'AIR', 'ROAD'];

export function defaultWorkflowPayload() {
  return {
    technical_approved: null,
    commercial_otx_comment: '',
    otx_date_from: '',
    otx_date_to: '',
    bom: {
      materials: [],
      install_cost: 0,
      testing_cost: 0,
      packaging_cost: 0,
      transport_mode: 'AIR',
      transport_cost: 0,
      cost_of_ap: 0,
      margin_amount: 0,
    },
    offers: [],
    follow_ups: [],
    closed_won: {
      order_value: null,
      terms: '',
      packaging_regulations: '',
      payment_terms: '',
      warranty_delivery: '',
    },
    closed_lost: { reasons: [], notes: '' },
  };
}

export function mergeWorkflowPayload(stored) {
  const base = defaultWorkflowPayload();
  if (!stored || typeof stored !== 'object') return base;
  return {
    ...base,
    ...stored,
    bom: { ...base.bom, ...(stored.bom || {}) },
    closed_won: { ...base.closed_won, ...(stored.closed_won || {}) },
    closed_lost: { ...base.closed_lost, ...(stored.closed_lost || {}) },
  };
}

export function computeBomTotals(bom) {
  const materials = bom?.materials || [];
  const tpc = materials.reduce((sum, row) => sum + (Number(row.base_cost) || 0), 0);
  const install = Number(bom?.install_cost) || 0;
  const testing = Number(bom?.testing_cost) || 0;
  const packaging = Number(bom?.packaging_cost) || 0;
  const transport = Number(bom?.transport_cost) || 0;
  const totalCost = tpc + install + testing + packaging + transport;
  const margin = Number(bom?.margin_amount) || 0;
  const sellingValue = totalCost + margin;
  return { tpc, totalCost, sellingValue };
}

export function stageIndex(stageId) {
  return CARRY_ORDER_STAGES.findIndex((s) => s.id === stageId);
}

export function workflowStageLabel(stageId) {
  if (!stageId) return null;
  return CARRY_ORDER_STAGES.find((s) => s.id === stageId)?.label || null;
}

export function formatInr(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function newMaterialRow() {
  return {
    id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    material_name: '',
    max_wp_rating: '',
    base_cost: 0,
  };
}

export function newOfferRow() {
  return {
    id: `o-${Date.now()}`,
    offer_no: '',
    revision_index: 1,
    change_description: '',
    attachment_url: '',
    attachment_name: '',
  };
}

export function newFollowUpRow() {
  return {
    id: `f-${Date.now()}`,
    follow_up_date: '',
    notes: '',
    next_date: '',
    status: 'Pending',
  };
}
