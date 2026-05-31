export const CARRY_ORDER_STAGES = [
  { id: 'enquiry_logged', label: 'Enquiry', short: '1' },
  { id: 'technical_clearance', label: 'Technical clearance', short: '2' },
  { id: 'bom_costing', label: 'BOM & costing', short: '3' },
  { id: 'offer_revision', label: 'Offer & revision', short: '4' },
  { id: 'follow_up', label: 'Follow-up', short: '5' },
  { id: 'closed_won', label: 'Won', short: 'W' },
  { id: 'closed_lost', label: 'Lost', short: 'L' },
];

/** Ordered pipeline (excludes Won/Lost). */
export const WORKFLOW_PIPELINE_IDS = [
  'enquiry_logged',
  'technical_clearance',
  'bom_costing',
  'offer_revision',
  'follow_up',
];

export const WORKFLOW_TERMINAL_IDS = ['closed_won', 'closed_lost'];

export function pipelineStageIndex(stageId) {
  const idx = WORKFLOW_PIPELINE_IDS.indexOf(stageId);
  return idx >= 0 ? idx : -1;
}

/** Furthest pipeline step reached (Won/Lost map to end of pipeline). */
export function resolvedPipelineIndex(workflowStage) {
  if (workflowStage === 'closed_won' || workflowStage === 'closed_lost') {
    return WORKFLOW_PIPELINE_IDS.length - 1;
  }
  return pipelineStageIndex(workflowStage || 'enquiry_logged');
}

export function isPipelineStageUnlocked(targetStageId, currentWorkflowStage) {
  return canAccessWorkflowStage(targetStageId, currentWorkflowStage, null);
}

/** Max pipeline index reachable given saved stage and technical YES gate. */
export function effectivePipelineMaxIndex(workflowStage, payload) {
  const max = resolvedPipelineIndex(workflowStage);
  const techIdx = pipelineStageIndex('technical_clearance');
  if (techIdx < 0) return max;
  if (max > techIdx && payload?.technical_approved !== true) {
    return techIdx;
  }
  return max;
}

export function canAccessWorkflowStage(targetStageId, workflowStage, payload) {
  const max = effectivePipelineMaxIndex(workflowStage, payload);
  if (WORKFLOW_TERMINAL_IDS.includes(targetStageId)) {
    return max >= WORKFLOW_PIPELINE_IDS.length - 1;
  }
  const targetIdx = pipelineStageIndex(targetStageId);
  if (targetIdx < 0) return false;
  return targetIdx <= max;
}

export function nextPipelineStageId(currentWorkflowStage) {
  const idx = resolvedPipelineIndex(currentWorkflowStage);
  if (idx < 0 || idx >= WORKFLOW_PIPELINE_IDS.length - 1) return null;
  return WORKFLOW_PIPELINE_IDS[idx + 1];
}

export function isStageComplete(stageId, payload, lead, { isCarryAndOrder, leadNeedsVendor }) {
  switch (stageId) {
    case 'enquiry_logged':
      if (isCarryAndOrder?.(lead)) return !leadNeedsVendor?.(lead);
      return true;
    case 'technical_clearance':
      return payload.technical_approved === true;
    case 'bom_costing':
      return (payload.bom?.materials || []).length > 0;
    case 'offer_revision':
      return (payload.offer_revisions || []).some((r) => (Number(r.offer_profit_margin_pct) || 0) > 0);
    case 'follow_up':
      return true;
    default:
      return true;
  }
}

export function stageIncompleteMessage(stageId, lead, { isCarryAndOrder, leadNeedsVendor, payload }) {
  switch (stageId) {
    case 'enquiry_logged':
      if (isCarryAndOrder?.(lead) && leadNeedsVendor?.(lead)) {
        return 'Assign a vendor to complete enquiry';
      }
      return 'Complete enquiry details';
    case 'technical_clearance':
      if (payload?.technical_approved === false) {
        return 'Technical not approved — select YES to unlock the next workflow steps';
      }
      return 'Select YES for technical approval to continue';
    case 'bom_costing':
      return 'Add at least one BOM material line';
    case 'offer_revision':
      return 'Record at least one offer revision with profit margin %';
    case 'follow_up':
      return 'Complete follow-up';
    default:
      return 'Complete the previous step first';
  }
}

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
    technical_attachments: [],
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
      profit_margin_pct: 0,
    },
    offers: [],
    offer_revisions: [],
    follow_ups: [],
    offer_profit_margin_pct: 0,
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
    technical_attachments: Array.isArray(stored.technical_attachments)
      ? stored.technical_attachments
      : base.technical_attachments,
    offer_revisions: Array.isArray(stored.offer_revisions)
      ? stored.offer_revisions
      : base.offer_revisions,
  };
}

export function newTechnicalAttachmentRef(uploaded) {
  return {
    id: `ta-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    attachment_id: uploaded?.id || null,
    file_name: uploaded?.file_name || 'File',
    file_url: uploaded?.file_url || '',
    file_type: uploaded?.file_type || null,
  };
}

export function applyMarginFormula(base, marginPct) {
  const pct = Math.min(Math.max(Number(marginPct) || 0, 0), 99.99);
  const rate = pct / 100;
  const safeBase = Number(base) || 0;
  if (safeBase <= 0 || rate <= 0 || rate >= 1) {
    return { pct, value: safeBase, amount: 0 };
  }
  const value = safeBase / (1 - rate);
  return { pct, value, amount: value - safeBase };
}

export function computeBomTotals(bom) {
  const materials = bom?.materials || [];
  const materialsTotal = materials.reduce((sum, row) => sum + (Number(row.base_cost) || 0), 0);
  const install = Number(bom?.install_cost) || 0;
  const testing = Number(bom?.testing_cost) || 0;
  const packaging = Number(bom?.packaging_cost) || 0;
  const transport = Number(bom?.transport_cost) || 0;
  const costOfAp = Number(bom?.cost_of_ap) || 0;
  const tpcCost = Number(bom?.margin_amount) || 0;
  const consignmentTotal =
    materialsTotal + install + testing + packaging + transport + costOfAp + tpcCost;
  const { pct, value: profitValue, amount: profitAmount } = applyMarginFormula(
    consignmentTotal,
    bom?.profit_margin_pct,
  );
  return {
    tpc: materialsTotal,
    totalCost: materialsTotal + install + testing + packaging + transport + costOfAp,
    sellingValue: profitValue,
    consignmentTotal,
    profitMarginPct: pct,
    profitValue,
    profitAmount,
  };
}

export function latestOfferRevision(revisions) {
  const list = Array.isArray(revisions) ? revisions : [];
  if (!list.length) return null;
  return list[list.length - 1];
}

export function buildOfferRevisionEntry(bom, marginPct, stage = 'offer_revision', options = {}) {
  const opts = typeof options === 'string' ? { notes: options } : options || {};
  const notes = (opts.notes || '').trim();
  const recordedAt = opts.recordedAt || new Date().toISOString().slice(0, 10);
  const bomTotals = computeBomTotals(bom);
  const baseAfterBomProfit = bomTotals.profitValue;
  const { pct, value: offerValue, amount: offerProfitAmount } = applyMarginFormula(
    baseAfterBomProfit,
    marginPct,
  );
  const calculationComment =
    pct > 0 && baseAfterBomProfit > 0
      ? `${formatInr(baseAfterBomProfit)} ÷ (1 − ${pct}%) = ${formatInr(offerValue)}`
      : '';
  return {
    id: `or-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    revision_index: 1,
    offer_profit_margin_pct: pct,
    base_after_bom_profit: baseAfterBomProfit,
    offer_value: offerValue,
    offer_profit_amount: offerProfitAmount,
    notes,
    calculation_comment: calculationComment,
    recorded_at: recordedAt,
    stage,
    client_agreed: false,
  };
}

export function computeOfferTotals(bom, offerProfitMarginPct) {
  const bomTotals = computeBomTotals(bom);
  const baseAfterBomProfit = bomTotals.profitValue;
  const { pct, value: offerValue, amount: offerProfitAmount } = applyMarginFormula(
    baseAfterBomProfit,
    offerProfitMarginPct,
  );
  return {
    bomTotals,
    baseAfterBomProfit,
    offerMarginPct: pct,
    offerValue,
    offerProfitAmount,
  };
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

export function newOfferRevisionRow(bom, marginPct, stage = 'offer_revision', notes = '') {
  return buildOfferRevisionEntry(bom, marginPct, stage, notes);
}

/** @deprecated legacy shape — kept for old payloads */
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
