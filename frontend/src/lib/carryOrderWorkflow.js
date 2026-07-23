export const CARRY_ORDER_STAGES = [
  { id: 'enquiry_logged', label: 'Enquiry', short: '1' },
  { id: 'technical_clearance', label: 'Vendor selection', short: '2' },
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

function isVendorRowComplete(row) {
  return (
    String(row?.vendor_name || '').trim()
    && String(row?.date || '').trim()
    && String(row?.enquiry_sent_to_customer || '').trim()
    && row?.technical_clearance_from_vendor === true
  );
}

/** At least one vendor row fully filled with technical clearance YES from vendor. */
export function isVendorSelectionComplete(payload) {
  if (payload?.technical_approved === true) return true;
  const rows = payload?.vendor_selections || [];
  return rows.some(isVendorRowComplete);
}

/** Max pipeline index reachable given saved stage and vendor selection gate. */
export function effectivePipelineMaxIndex(workflowStage, payload) {
  const max = resolvedPipelineIndex(workflowStage);
  const vendorIdx = pipelineStageIndex('technical_clearance');
  if (vendorIdx < 0) return max;
  if (max > vendorIdx && !isVendorSelectionComplete(payload)) {
    return vendorIdx;
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
      return isVendorSelectionComplete(payload);
    case 'bom_costing':
      return (payload.bom?.materials || []).length > 0;
    case 'offer_revision':
      return (payload.offer_revisions || []).some((r) => (Number(r.offer_profit_margin_pct) || 0) > 0);
    case 'follow_up':
      return payload.client_outcome === 'won' || payload.client_outcome === 'lost';
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
      return 'Add at least one vendor with details filled and technical clearance from vendor set to YES';
    case 'bom_costing':
      return 'Add at least one BOM material line';
    case 'offer_revision':
      return 'Record at least one offer revision with profit margin %';
    case 'follow_up':
      return 'Record client decision — agreed (Won) or not agreed (Lost)';
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

export const FOLLOW_UP_CHANNELS = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'email', label: 'Email' },
  { id: 'telephonic', label: 'Telephonic' },
];

export function followUpChannelLabel(channelId) {
  return FOLLOW_UP_CHANNELS.find((c) => c.id === channelId)?.label || channelId || '—';
}

export function newVendorSelectionRow() {
  return {
    id: `vs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    vendor_name: '',
    date: '',
    enquiry_sent_to_customer: '',
    attachments: [],
    technical_clearance_from_vendor: null,
    technical_clearance_attachments: [],
    techno_commercial_offer_attachments: [],
  };
}

function normalizeVendorSelections(stored) {
  if (Array.isArray(stored?.vendor_selections) && stored.vendor_selections.length) {
    return stored.vendor_selections.map((row, i) => ({
      id: row.id || `vs-${i}`,
      vendor_name: row.vendor_name || '',
      date: row.date || '',
      enquiry_sent_to_customer: row.enquiry_sent_to_customer || '',
      attachments: Array.isArray(row.attachments) ? row.attachments : [],
      technical_clearance_from_vendor:
        row.technical_clearance_from_vendor === true
          ? true
          : row.technical_clearance_from_vendor === false
            ? false
            : null,
      technical_clearance_attachments: Array.isArray(row.technical_clearance_attachments)
        ? row.technical_clearance_attachments
        : [],
      techno_commercial_offer_attachments: Array.isArray(row.techno_commercial_offer_attachments)
        ? row.techno_commercial_offer_attachments
        : [],
    }));
  }
  const legacyAttachments = Array.isArray(stored?.technical_attachments)
    ? stored.technical_attachments
    : [];
  if (stored?.technical_approved === true || legacyAttachments.length) {
    return [
      {
        ...newVendorSelectionRow(),
        id: 'vs-legacy',
        attachments: legacyAttachments,
        technical_clearance_from_vendor: stored.technical_approved === true ? true : null,
        technical_clearance_attachments: legacyAttachments,
      },
    ];
  }
  return [newVendorSelectionRow()];
}

export function defaultWorkflowPayload() {
  return {
    technical_approved: null,
    commercial_otx_comment: '',
    technical_attachments: [],
    vendor_selections: [newVendorSelectionRow()],
    bom_attachments: [],
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
    lead_offer_no: '',
    follow_ups: [],
    offer_profit_margin_pct: 0,
    client_outcome: null,
    agreed_revision_id: null,
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
  const offer_revisions = normalizeOfferRevisions(stored);
  const lead_offer_no =
    String(stored.lead_offer_no || '').trim() || offer_revisions[0]?.lead_offer_base || '';
  return {
    ...base,
    ...stored,
    bom: { ...base.bom, ...(stored.bom || {}) },
    closed_won: { ...base.closed_won, ...(stored.closed_won || {}) },
    closed_lost: { ...base.closed_lost, ...(stored.closed_lost || {}) },
    technical_attachments: Array.isArray(stored.technical_attachments)
      ? stored.technical_attachments
      : base.technical_attachments,
    vendor_selections: normalizeVendorSelections(stored),
    bom_attachments: Array.isArray(stored.bom_attachments) ? stored.bom_attachments : base.bom_attachments,
    offer_revisions,
    lead_offer_no,
  };
}

export const RTB_OFFER_PREFIX = 'RTB/OFFER/';
/** Next enquiry offer number when the sequence counter is unset (current company sequence). */
export const RTB_OFFER_SEQUENCE_START = 3700;

/** Strip trailing -R0, -R1 from per-revision offer numbers. */
export function stripOfferRevisionSuffix(offerNo) {
  const s = String(offerNo || '').trim();
  const match = s.match(/^(.+)-R\d+$/i);
  return match ? match[1] : s;
}

export function parseRtbOfferSequenceNumber(offerNo) {
  const base = stripOfferRevisionSuffix(offerNo);
  const m = String(base || '')
    .trim()
    .match(/^RTB\/OFFER\/(\d+)$/i);
  return m ? parseInt(m[1], 10) : null;
}

export function formatRtbOfferBaseNumber(seq) {
  return `${RTB_OFFER_PREFIX}${seq}`;
}

export function resolveLeadOfferBaseNumber(payload, revisions = []) {
  const fromPayload = String(payload?.lead_offer_no || '').trim();
  if (fromPayload) return fromPayload;
  const list = Array.isArray(revisions) ? revisions : [];
  for (const r of list) {
    const base = String(r.lead_offer_base || '').trim();
    if (base) return base;
    const stripped = stripOfferRevisionSuffix(r.offer_no);
    if (stripped) return stripped;
  }
  return '';
}

/** One base offer number per enquiry; revisions are base-R0, base-R1, … */
export function formatOfferRevisionNumber(baseNo, revisionIndex) {
  const base = String(baseNo || '').trim();
  if (!base) return offerRevisionLabel(revisionIndex);
  return `${base}-${offerRevisionLabel(revisionIndex)}`;
}

/** Local fallback only — prefer POST /leads/{id}/allocate-offer-number for new enquiries. */
export function generateOfferBaseNumber(existingBases = [], explicitSeq = null) {
  if (explicitSeq != null && Number.isFinite(Number(explicitSeq))) {
    return formatRtbOfferBaseNumber(Number(explicitSeq));
  }
  const nums = (existingBases || [])
    .map((b) => parseRtbOfferSequenceNumber(b))
    .filter((n) => n != null);
  const maxSeq = nums.length ? Math.max(...nums) : RTB_OFFER_SEQUENCE_START - 1;
  const next = Math.max(RTB_OFFER_SEQUENCE_START, maxSeq + 1);
  return formatRtbOfferBaseNumber(next);
}

function normalizeOfferRevisions(stored) {
  const list = Array.isArray(stored?.offer_revisions) ? stored.offer_revisions : [];
  if (!list.length) return [];
  let base = String(stored.lead_offer_no || '').trim() || resolveLeadOfferBaseNumber(stored, list);
  if (!base) {
    base = stripOfferRevisionSuffix(list[0].offer_no) || generateOfferBaseNumber();
  }
  return list.map((r, i) => {
    const idx = Number.isFinite(Number(r.revision_index)) ? Number(r.revision_index) : i;
    const rowBase = String(r.lead_offer_base || base).trim() || base;
    return {
      ...r,
      revision_index: idx,
      lead_offer_base: rowBase,
      offer_no: formatOfferRevisionNumber(rowBase, idx),
    };
  });
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

/** Display label: R0, R1, R2 … */
export function offerRevisionLabel(revisionIndex) {
  const n = Number(revisionIndex);
  return Number.isFinite(n) && n >= 0 ? `R${n}` : 'R0';
}

export function agreedOfferRevision(revisions, agreedRevisionId) {
  const list = Array.isArray(revisions) ? revisions : [];
  if (!list.length) return null;
  if (agreedRevisionId) {
    return list.find((r) => r.id === agreedRevisionId) || null;
  }
  return list.find((r) => r.client_agreed) || list[list.length - 1];
}

export function latestOfferRevision(revisions) {
  const list = Array.isArray(revisions) ? revisions : [];
  if (!list.length) return null;
  return list[list.length - 1];
}

/** @deprecated use generateOfferBaseNumber */
export function generateOfferNumber(existingRevisions = []) {
  const bases = (existingRevisions || []).map(
    (r) => r.lead_offer_base || stripOfferRevisionSuffix(r.offer_no),
  );
  return generateOfferBaseNumber(bases);
}

export function buildOfferRevisionEntry(bom, marginPct, stage = 'offer_revision', options = {}) {
  const opts = typeof options === 'string' ? { notes: options } : options || {};
  const notes = (opts.notes || '').trim();
  const recordedAt = opts.recordedAt || new Date().toISOString().slice(0, 10);
  const existingRevisions = opts.existingRevisions || [];
  const revisionIndex =
    Number.isFinite(Number(opts.revisionIndex)) ? Number(opts.revisionIndex) : existingRevisions.length;
  let baseNo = resolveLeadOfferBaseNumber(
    { lead_offer_no: opts.lead_offer_no || opts.offerBase },
    existingRevisions,
  );
  if (!baseNo) {
    baseNo = generateOfferBaseNumber(
      existingRevisions.map((r) => r.lead_offer_base || stripOfferRevisionSuffix(r.offer_no)),
      opts.explicitOfferSeq,
    );
  }
  const offerNo = formatOfferRevisionNumber(baseNo, revisionIndex);
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
  const consignmentTotal = bomTotals.consignmentTotal;
  const totalProfit = offerValue - consignmentTotal;
  return {
    id: `or-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    revision_index: revisionIndex,
    lead_offer_base: baseNo,
    offer_no: offerNo,
    offer_profit_margin_pct: pct,
    base_after_bom_profit: baseAfterBomProfit,
    consignment_total: consignmentTotal,
    offer_value: offerValue,
    offer_profit_amount: offerProfitAmount,
    total_profit: totalProfit,
    notes,
    calculation_comment: calculationComment,
    recorded_at: recordedAt,
    stage,
    client_agreed: false,
    attachments: Array.isArray(opts.attachments) ? opts.attachments : [],
    proof_of_offer_attachments: Array.isArray(opts.proof_of_offer_attachments)
      ? opts.proof_of_offer_attachments
      : [],
  };
}

export function revisionAttachments(rev) {
  if (Array.isArray(rev?.attachments) && rev.attachments.length) return rev.attachments;
  if (rev?.attachment?.file_url) return [rev.attachment];
  return [];
}

export function revisionProofOfOfferAttachments(rev) {
  return Array.isArray(rev?.proof_of_offer_attachments) ? rev.proof_of_offer_attachments : [];
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
    consignmentTotal: bomTotals.consignmentTotal,
    totalProfit: offerValue - bomTotals.consignmentTotal,
  };
}

export function revisionTotalProfit(rev, bom) {
  if (rev?.total_profit != null && !Number.isNaN(Number(rev.total_profit))) {
    return Number(rev.total_profit);
  }
  const offer = Number(rev?.offer_value) || 0;
  const consignment =
    Number(rev?.consignment_total) || (bom ? computeBomTotals(bom).consignmentTotal : 0);
  return offer - consignment;
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
    revision_index: 0,
    change_description: '',
    attachment_url: '',
    attachment_name: '',
  };
}

export function newFollowUpRow() {
  return {
    id: `f-${Date.now()}`,
    follow_up_date: new Date().toISOString().slice(0, 10),
    follow_up_channel: 'telephonic',
    notes: '',
    attachments: [],
    next_date: '',
    status: 'Pending',
  };
}

export function followUpAttachments(fu) {
  if (Array.isArray(fu?.attachments) && fu.attachments.length) return fu.attachments;
  return [];
}
