export const CARRY_ORDER_STAGES = [
  { id: 'enquiry_logged', label: 'Enquiry', short: '1' },
  { id: 'opportunity_assessment', label: 'Requirement Analysis', short: '2' },
  { id: 'technical_assessment', label: 'Technical assessment', short: '3' },
  { id: 'material_product', label: 'Material & product', short: '4' },
  { id: 'technical_clearance', label: 'Vendor management', short: '5' },
  { id: 'bom_costing', label: 'BOM & costing', short: '6' },
  { id: 'offer_revision', label: 'Offer & revision', short: '7' },
  { id: 'follow_up', label: 'Follow-up', short: '8' },
  { id: 'closed_won', label: 'Won', short: 'W' },
  { id: 'closed_lost', label: 'Lost', short: 'L' },
];

/** Ordered pipeline (excludes Won/Lost). */
export const WORKFLOW_PIPELINE_IDS = [
  'enquiry_logged',
  'opportunity_assessment',
  'technical_assessment',
  'material_product',
  'technical_clearance',
  'bom_costing',
  'offer_revision',
  'follow_up',
];

export const OPPORTUNITY_BUSINESS_CATEGORIES = [
  'Trading',
  'Consultancy',
  'Project',
  'Service & Maintenance',
];

/** Sentinel product category that lets the user type a custom category. */
export const PRODUCT_CATEGORY_OTHER = 'Other';

export const SITE_VISIT_STATUSES = [
  { id: 'pending', label: 'Pending' },
  { id: 'done', label: 'Done' },
];

export const SITE_VISIT_FOLLOW_UP_CHANNELS = [
  { id: 'call', label: 'Call' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'email', label: 'Email' },
  { id: 'meeting', label: 'Meeting' },
  { id: 'other', label: 'Other' },
];

export function siteVisitFollowUpChannelLabel(channelId) {
  return (
    SITE_VISIT_FOLLOW_UP_CHANNELS.find((c) => c.id === channelId)?.label
    || followUpChannelLabel(channelId)
  );
}

export function newSiteVisitOtherPerson() {
  return {
    id: `svo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    mobile: '',
    email: '',
    address: '',
    id_proof: null,
  };
}

export function newSiteVisitFollowUpRow() {
  return {
    id: `svf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    follow_up_date: new Date().toISOString().slice(0, 10),
    follow_up_channel: 'call',
    contact_person: '',
    notes: '',
    next_date: '',
    attachments: [],
  };
}

export function defaultOpportunityAssessment() {
  return {
    business_category: '',
    product_categories: [],
    product_category_other: '',
    technical_datas_required: null,
    site_visit_required: null,
    expected_enquiry_closing_date: '',
    site_visit_date: '',
    site_visit_assignees: [],
    site_visit_others: [],
    site_visit_status: '',
    site_visit_photos: [],
    technical_discussions: '',
    technical_datasheet_drawing: [],
    existing_equipment_details: '',
    process_parameters: '',
    minutes_of_meeting: '',
    customer_signature: null,
    engineer_signature: null,
    site_visit_follow_ups: [],
    // Legacy single-assignee keys — still written on save so older readers keep working.
    site_visit_assignee_employee_id: '',
    site_visit_assignee_name: '',
    site_visit_task_id: '',
    site_visit_task_ids: {},
    site_visit_other: {
      name: '',
      mobile: '',
      email: '',
      address: '',
      id_proof: null,
    },
  };
}

function hasAttachmentRef(ref) {
  if (!ref || typeof ref !== 'object') return false;
  return Boolean(ref.id || ref.attachment_id || ref.file_url || ref.url);
}

function isSiteVisitOtherComplete(person) {
  return Boolean(
    String(person?.name || '').trim()
    && String(person?.mobile || '').trim()
    && String(person?.email || '').trim()
    && String(person?.address || '').trim()
    && hasAttachmentRef(person?.id_proof),
  );
}

/** Employees + external people assigned to the visit, migrating legacy single-assignee payloads. */
export function siteVisitAssignees(oa) {
  const list = Array.isArray(oa?.site_visit_assignees) ? oa.site_visit_assignees : [];
  const normalized = list
    .map((row) => ({
      employee_id: String(row?.employee_id || row?.id || '').trim(),
      name: String(row?.name || '').trim(),
    }))
    .filter((row) => row.employee_id);
  if (normalized.length) return normalized;

  const legacyId = String(oa?.site_visit_assignee_employee_id || '').trim();
  if (legacyId && legacyId.toLowerCase() !== 'other') {
    return [{ employee_id: legacyId, name: String(oa?.site_visit_assignee_name || '').trim() }];
  }
  return [];
}

export function siteVisitOtherPeople(oa) {
  const list = Array.isArray(oa?.site_visit_others) ? oa.site_visit_others : [];
  const normalized = list
    .map((row, i) => ({
      ...newSiteVisitOtherPerson(),
      ...row,
      id: row?.id || `svo-${i}`,
    }))
    .filter((row) => (
      String(row.name || '').trim()
      || String(row.mobile || '').trim()
      || String(row.email || '').trim()
      || String(row.address || '').trim()
      || row.id_proof
    ));
  if (normalized.length) return normalized;

  const legacy = oa?.site_visit_other;
  const legacyIsOther = String(oa?.site_visit_assignee_employee_id || '').toLowerCase() === 'other';
  if (legacyIsOther && legacy && (String(legacy.name || '').trim() || legacy.id_proof)) {
    return [{ ...newSiteVisitOtherPerson(), ...legacy, id: 'svo-legacy' }];
  }
  return [];
}

function normalizeOpportunityAssessment(stored) {
  const base = defaultOpportunityAssessment();
  const oa = { ...base, ...(stored || {}) };
  return {
    ...oa,
    product_categories: Array.isArray(stored?.product_categories) ? stored.product_categories : [],
    site_visit_assignees: siteVisitAssignees(oa),
    site_visit_others: siteVisitOtherPeople(oa),
    site_visit_photos: Array.isArray(stored?.site_visit_photos) ? stored.site_visit_photos : [],
    technical_datasheet_drawing: Array.isArray(stored?.technical_datasheet_drawing)
      ? stored.technical_datasheet_drawing
      : [],
    site_visit_follow_ups: Array.isArray(stored?.site_visit_follow_ups)
      ? stored.site_visit_follow_ups.map((row, i) => ({
        ...newSiteVisitFollowUpRow(),
        ...row,
        id: row?.id || `svf-${i}`,
        attachments: Array.isArray(row?.attachments) ? row.attachments : [],
      }))
      : [],
    site_visit_task_ids:
      stored?.site_visit_task_ids && typeof stored.site_visit_task_ids === 'object'
        ? stored.site_visit_task_ids
        : {},
    site_visit_other: { ...base.site_visit_other, ...(stored?.site_visit_other || {}) },
  };
}

/** Post-visit capture is mandatory once the engineer marks the visit Done. */
export function isSiteVisitDoneComplete(oa) {
  return Boolean(
    (oa?.site_visit_photos || []).length > 0
    && String(oa?.technical_discussions || '').trim()
    && (oa?.technical_datasheet_drawing || []).length > 0
    && String(oa?.existing_equipment_details || '').trim()
    && String(oa?.process_parameters || '').trim()
    && String(oa?.minutes_of_meeting || '').trim()
    && hasAttachmentRef(oa?.customer_signature)
    && hasAttachmentRef(oa?.engineer_signature),
  );
}

export function isOpportunityAssessmentComplete(payload) {
  const oa = payload?.opportunity_assessment || {};
  const categories = Array.isArray(oa.product_categories) ? oa.product_categories : [];
  const baseOk = Boolean(
    String(oa.business_category || '').trim()
    && categories.length > 0
    && typeof oa.technical_datas_required === 'boolean'
    && typeof oa.site_visit_required === 'boolean'
    && String(oa.expected_enquiry_closing_date || '').trim(),
  );
  if (!baseOk) return false;
  if (
    categories.includes(PRODUCT_CATEGORY_OTHER)
    && !String(oa.product_category_other || '').trim()
  ) {
    return false;
  }
  if (oa.site_visit_required !== true) return true;

  if (!String(oa.site_visit_date || '').trim()) return false;

  const employees = siteVisitAssignees(oa);
  const others = siteVisitOtherPeople(oa);
  if (!employees.length && !others.length) return false;
  if (others.some((person) => !isSiteVisitOtherComplete(person))) return false;

  const status = String(oa.site_visit_status || '').trim();
  if (!status) return false;
  if (status !== 'done') return true;

  return isSiteVisitDoneComplete(oa);
}

/** Free-form technical Q&A the engineer builds per enquiry. */
export function newTechnicalAssessmentItem() {
  return {
    id: `ta-q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    question: '',
    answer: '',
  };
}

export function defaultTechnicalAssessment() {
  return {
    items: [],
    follow_ups: [],
  };
}

function normalizeTechnicalAssessment(stored) {
  const base = defaultTechnicalAssessment();
  if (!stored || typeof stored !== 'object') return base;
  return {
    ...base,
    ...stored,
    items: Array.isArray(stored.items)
      ? stored.items.map((row, i) => ({
        ...newTechnicalAssessmentItem(),
        ...row,
        id: row?.id || `ta-q-${i}`,
      }))
      : [],
    follow_ups: Array.isArray(stored.follow_ups)
      ? stored.follow_ups.map((row, i) => ({
        ...newSiteVisitFollowUpRow(),
        ...row,
        id: row?.id || `svf-ta-${i}`,
        attachments: Array.isArray(row?.attachments) ? row.attachments : [],
      }))
      : [],
  };
}

export function technicalAssessmentItems(payload) {
  const items = payload?.technical_assessment?.items;
  return Array.isArray(items) ? items : [];
}

/** At least one question answered — the rest is up to the engineer. */
export function isTechnicalAssessmentComplete(payload) {
  return technicalAssessmentItems(payload).some(
    (row) => String(row?.question || '').trim() && String(row?.answer || '').trim(),
  );
}

export function technicalAssessmentIncompleteMessage(payload) {
  const items = technicalAssessmentItems(payload);
  if (!items.length) return 'Add at least one technical question and its answer';
  return 'Fill both the question and the answer for at least one entry';
}

export const MATERIAL_UOM_OPTIONS = [
  'Nos', 'Set', 'Pair', 'Mtr', 'Ft', 'Sq.Mtr', 'Kg', 'Ton', 'Ltr', 'Box', 'Pkt', 'Roll', 'Lot',
];

/** One line item in the material / product grids. */
export function newMaterialProductRow(overrides = {}) {
  return {
    id: `mp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    item_name: '',
    specification: '',
    quantity: '',
    uom: 'Nos',
    // Stock-grid only: link back to the stock master row.
    stock_item_id: '',
    available_qty: null,
    // Purchase-grid only: the stock row whose shortfall created this line,
    // plus the vendor picked for it in Vendor management.
    split_from_row_id: '',
    vendor_id: '',
    vendor_name: '',
    quoted_price: '',
    warranty: '',
    delivery_period: '',
    delivery_date: '',
    // Stock-grid only: unit cost entered on BOM & costing.
    unit_cost: '',
    ...overrides,
  };
}

export function defaultMaterialProduct() {
  return {
    stock_items: [],
    purchase_items: [],
    follow_ups: [],
  };
}

function normalizeMaterialRows(rows, keyPrefix) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row, i) => ({
    ...newMaterialProductRow(),
    ...row,
    id: row?.id || `${keyPrefix}-${i}`,
  }));
}

function normalizeMaterialProduct(stored) {
  const base = defaultMaterialProduct();
  if (!stored || typeof stored !== 'object') return base;
  return {
    ...base,
    ...stored,
    stock_items: normalizeMaterialRows(stored.stock_items, 'mp-stk'),
    purchase_items: normalizeMaterialRows(stored.purchase_items, 'mp-buy'),
    follow_ups: Array.isArray(stored.follow_ups)
      ? stored.follow_ups.map((row, i) => ({
        ...newSiteVisitFollowUpRow(),
        ...row,
        id: row?.id || `svf-mp-${i}`,
        attachments: Array.isArray(row?.attachments) ? row.attachments : [],
      }))
      : [],
  };
}

export function materialStockRows(payload) {
  const rows = payload?.material_product?.stock_items;
  return Array.isArray(rows) ? rows : [];
}

/** Items to buy — this list is what Vendor management allocates to vendors. */
export function materialPurchaseRows(payload) {
  const rows = payload?.material_product?.purchase_items;
  return Array.isArray(rows) ? rows : [];
}

/** Purchase lines still waiting for a vendor in Vendor management. */
export function unassignedPurchaseRows(payload) {
  return materialPurchaseRows(payload).filter(
    (row) => String(row.item_name || '').trim() && !String(row.vendor_id || '').trim(),
  );
}

export const VENDOR_INQUIRY_STATUSES = [
  { id: 'draft', label: 'Draft' },
  { id: 'sent', label: 'Inquiry sent' },
  { id: 'quoted', label: 'Quote received' },
];

export function newVendorInquiry(overrides = {}) {
  return {
    id: `vi-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    vendor_id: '',
    vendor_name: '',
    vendor_email: '',
    inquiry_date: new Date().toISOString().slice(0, 10),
    inquiry_status: 'draft',
    inquiry_sent_at: '',
    remarks: '',
    technical_data_notes: '',
    technical_data_attachments: [],
    quote_received_date: '',
    ...overrides,
  };
}

function normalizeVendorInquiries(stored) {
  const rows = Array.isArray(stored?.vendor_inquiries) ? stored.vendor_inquiries : [];
  return rows.map((row, i) => ({
    ...newVendorInquiry(),
    ...row,
    id: row?.id || `vi-${i}`,
    technical_data_attachments: Array.isArray(row?.technical_data_attachments)
      ? row.technical_data_attachments
      : [],
  }));
}

export function vendorInquiries(payload) {
  return Array.isArray(payload?.vendor_inquiries) ? payload.vendor_inquiries : [];
}

/** Purchase lines grouped by the vendor they were assigned to. */
export function purchaseItemsByVendor(payload) {
  const groups = [];
  const index = new Map();
  materialPurchaseRows(payload)
    .filter((row) => String(row?.item_name || '').trim() && (row.vendor_id || row.vendor_name))
    .forEach((row) => {
      const key = String(row.vendor_id || row.vendor_name || '').trim();
      if (!key) return;
      if (!index.has(key)) {
        index.set(key, groups.length);
        groups.push({
          key,
          vendor_id: row.vendor_id || '',
          vendor_name: row.vendor_name || '',
          items: [],
        });
      }
      groups[index.get(key)].items.push(row);
    });
  return groups;
}

export function inquiryForVendor(payload, vendorId, vendorName) {
  const rows = vendorInquiries(payload);
  return rows.find((row) => (
    (vendorId && row.vendor_id === vendorId)
    || (!vendorId && String(row.vendor_name || '').trim() === String(vendorName || '').trim())
  )) || null;
}

function purchaseQuoteComplete(row) {
  const price = Number(row?.quoted_price);
  return Boolean(
    Number.isFinite(price) && price > 0
    && String(row?.warranty || '').trim()
    && (String(row?.delivery_date || '').trim() || String(row?.delivery_period || '').trim()),
  );
}

function vendorInquiryQuoteComplete(inquiry) {
  if (!inquiry) return false;
  return Boolean(
    String(inquiry.inquiry_date || '').trim()
    && (
      String(inquiry.technical_data_notes || '').trim()
      || (Array.isArray(inquiry.technical_data_attachments) && inquiry.technical_data_attachments.length)
    ),
  );
}

export function isMaterialProductRowFilled(row) {
  return Boolean(
    String(row?.item_name || '').trim()
    && String(row?.quantity ?? '').toString().trim()
    && Number(row?.quantity) > 0
    && String(row?.uom || '').trim(),
  );
}

export function isMaterialProductComplete(payload) {
  const rows = [...materialStockRows(payload), ...materialPurchaseRows(payload)];
  const filled = rows.filter(isMaterialProductRowFilled);
  if (!filled.length) return false;
  // Every started row must be finished so nothing half-typed reaches the vendor step.
  return rows.every((row) => {
    const touched = String(row?.item_name || '').trim()
      || String(row?.specification || '').trim()
      || String(row?.quantity ?? '').toString().trim();
    return !touched || isMaterialProductRowFilled(row);
  });
}

export function materialProductIncompleteMessage(payload) {
  const rows = [...materialStockRows(payload), ...materialPurchaseRows(payload)];
  if (!rows.some(isMaterialProductRowFilled)) {
    return 'Add at least one item with name, quantity and UOM';
  }
  return 'Complete item name, quantity and UOM on every row (or remove the empty rows)';
}

export function materialLineQty(row) {
  const n = Number(row?.quantity);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function parseMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const n = Number(String(value ?? '').replace(/₹/g, '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

export function materialLineUnitPrice(row, source) {
  const raw = source === 'vendor'
    ? (row?.quoted_price ?? row?.unit_price)
    : (row?.unit_cost ?? row?.unit_price);
  const n = parseMoney(raw);
  return n > 0 ? n : 0;
}

export function materialLineAmount(row, source) {
  return materialLineQty(row) * materialLineUnitPrice(row, source);
}

/** Combined customer-supply list for BOM: stock issues + vendor purchases. */
export function buildBomCostingLines(payload) {
  const stock = materialStockRows(payload).filter(isMaterialProductRowFilled).map((row) => {
    const rate = materialLineUnitPrice(row, 'stock');
    return {
      ...row,
      source: 'stock',
      source_label: 'Stock',
      vendor_name: '',
      unit_price: row.unit_cost ?? '',
      amount: materialLineQty(row) * rate,
      price_editable: true,
    };
  });
  const purchase = materialPurchaseRows(payload).filter(isMaterialProductRowFilled).map((row) => {
    const rate = materialLineUnitPrice(row, 'vendor');
    return {
      ...row,
      source: 'vendor',
      source_label: 'Vendor',
      unit_price: row.quoted_price ?? '',
      amount: materialLineQty(row) * rate,
      price_editable: true,
    };
  });
  return [...stock, ...purchase];
}

export function bomMaterialsFromWorkflow(payload) {
  return buildBomCostingLines(payload).map((row) => ({
    id: `bom-${row.source}-${row.id}`,
    source: row.source,
    source_row_id: row.id,
    material_name: row.item_name,
    specification: row.specification || '',
    quantity: row.quantity,
    uom: row.uom || '',
    vendor_name: row.vendor_name || '',
    unit_price: materialLineUnitPrice(row, row.source),
    base_cost: row.amount,
  }));
}

export function withSyncedBomMaterials(payload) {
  const lines = buildBomCostingLines(payload);
  if (!lines.length) return payload;
  return {
    ...payload,
    bom: {
      ...(payload.bom || {}),
      materials: bomMaterialsFromWorkflow(payload),
    },
  };
}

export function isBomCostingComplete(payload) {
  const lines = buildBomCostingLines(payload);
  if (lines.length) {
    return lines.every((row) => materialLineUnitPrice(row, row.source) > 0);
  }
  return (payload?.bom?.materials || []).some(
    (row) => String(row?.material_name || '').trim() && parseMoney(row?.base_cost) > 0,
  );
}

export function bomCostingIncompleteMessage(payload) {
  const lines = buildBomCostingLines(payload);
  if (!lines.length) {
    if ((payload?.bom?.materials || []).length) {
      return 'Enter a base cost on at least one BOM material line';
    }
    return 'Add stock or purchase items on Material & product first — they appear here automatically';
  }
  const missingStock = lines.filter((row) => row.source === 'stock' && !(materialLineUnitPrice(row, 'stock') > 0));
  if (missingStock.length) {
    return `Enter a unit price for every stock item (${missingStock.map((row) => row.item_name).join(', ')})`;
  }
  const missingVendor = lines.filter((row) => row.source === 'vendor' && !(materialLineUnitPrice(row, 'vendor') > 0));
  if (missingVendor.length) {
    return `Vendor quotes are missing a price for: ${missingVendor.map((row) => row.item_name).join(', ')}`;
  }
  return 'Complete costing for every line';
}

/** Tells the user exactly which Requirement Analysis field is still missing. */
export function requirementAnalysisIncompleteMessage(payload) {
  const oa = payload?.opportunity_assessment || {};
  const categories = Array.isArray(oa.product_categories) ? oa.product_categories : [];
  if (!String(oa.business_category || '').trim()) return 'Select a business category';
  if (!categories.length) return 'Select at least one product category';
  if (categories.includes(PRODUCT_CATEGORY_OTHER) && !String(oa.product_category_other || '').trim()) {
    return 'Type the custom product category for "Other"';
  }
  if (typeof oa.technical_datas_required !== 'boolean') return 'Answer whether technical datas are required';
  if (typeof oa.site_visit_required !== 'boolean') return 'Answer whether a site visit is required';
  if (!String(oa.expected_enquiry_closing_date || '').trim()) return 'Set the expected enquiry closing date';
  if (oa.site_visit_required !== true) return 'Complete Requirement Analysis details';

  if (!String(oa.site_visit_date || '').trim()) return 'Set the site visit date';
  const employees = siteVisitAssignees(oa);
  const others = siteVisitOtherPeople(oa);
  if (!employees.length && !others.length) return 'Assign at least one person for the site visit';
  if (others.some((person) => !isSiteVisitOtherComplete(person))) {
    return 'Complete name, mobile, email, address and ID proof for every other person';
  }
  const status = String(oa.site_visit_status || '').trim();
  if (!status) return 'Set the site visit status (Pending or Done)';
  if (status === 'done' && !isSiteVisitDoneComplete(oa)) {
    return 'Site visit marked Done — add photos, technical discussions, datasheet/drawing, existing equipment, process parameters, minutes of meeting and both signatures';
  }
  return 'Complete Requirement Analysis details';
}

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

function purchaseRowsNeedingVendor(payload) {
  return materialPurchaseRows(payload).filter((row) => String(row?.item_name || '').trim());
}

function purchaseRowHasVendor(row) {
  return Boolean(String(row?.vendor_id || '').trim() || String(row?.vendor_name || '').trim());
}

/** Every purchase item has a vendor, an inquiry, and a quote (price, technical data, warranty/delivery). */
export function isVendorSelectionComplete(payload) {
  if (payload?.technical_approved === true) return true;
  const purchase = purchaseRowsNeedingVendor(payload);
  if (!purchase.length) return true;
  if (!purchase.every(purchaseRowHasVendor)) return false;
  if (!purchase.every(purchaseQuoteComplete)) return false;
  const groups = purchaseItemsByVendor(payload);
  return groups.every((group) => vendorInquiryQuoteComplete(
    inquiryForVendor(payload, group.vendor_id, group.vendor_name),
  ));
}

export function vendorManagementIncompleteMessage(payload) {
  const missingVendors = unassignedPurchaseRows(payload);
  if (missingVendors.length) {
    const names = missingVendors.map((row) => row.item_name).filter(Boolean).slice(0, 4).join(', ');
    const extra = missingVendors.length > 4 ? ` +${missingVendors.length - 4} more` : '';
    return `Select a vendor for: ${names}${extra}`;
  }
  const groups = purchaseItemsByVendor(payload);
  for (const group of groups) {
    const inquiry = inquiryForVendor(payload, group.vendor_id, group.vendor_name);
    if (!String(inquiry?.inquiry_date || '').trim()) {
      return `Set the inquiry date for ${group.vendor_name || 'the vendor'}`;
    }
    if (!vendorInquiryQuoteComplete(inquiry)) {
      return `Add technical data (notes or attachment) from ${group.vendor_name || 'the vendor'}`;
    }
  }
  const missingQuote = purchaseRowsNeedingVendor(payload).filter((row) => !purchaseQuoteComplete(row));
  if (missingQuote.length) {
    return 'Enter price, warranty and delivery (date or period) for every quoted item';
  }
  return 'Complete vendor inquiry and quote details';
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
    case 'opportunity_assessment':
      return isOpportunityAssessmentComplete(payload);
    case 'technical_assessment':
      return isTechnicalAssessmentComplete(payload);
    case 'material_product':
      return isMaterialProductComplete(payload);
    case 'technical_clearance':
      return isVendorSelectionComplete(payload);
    case 'bom_costing':
      return isBomCostingComplete(payload);
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
    case 'opportunity_assessment':
      return requirementAnalysisIncompleteMessage(payload);
    case 'technical_assessment':
      return technicalAssessmentIncompleteMessage(payload);
    case 'material_product':
      return materialProductIncompleteMessage(payload);
    case 'technical_clearance':
      return vendorManagementIncompleteMessage(payload);
    case 'bom_costing':
      return bomCostingIncompleteMessage(payload);
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
    vendor_inquiries: [],
    bom_attachments: [],
    otx_date_from: '',
    otx_date_to: '',
    opportunity_assessment: defaultOpportunityAssessment(),
    technical_assessment: defaultTechnicalAssessment(),
    material_product: defaultMaterialProduct(),
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
  if (typeof stored === 'string') {
    try {
      stored = JSON.parse(stored);
    } catch {
      stored = null;
    }
  }
  if (!stored || typeof stored !== 'object') return base;
  const offer_revisions = normalizeOfferRevisions(stored);
  const lead_offer_no =
    String(stored.lead_offer_no || '').trim() || offer_revisions[0]?.lead_offer_base || '';
  return {
    ...base,
    ...stored,
    opportunity_assessment: normalizeOpportunityAssessment(stored.opportunity_assessment),
    technical_assessment: normalizeTechnicalAssessment(stored.technical_assessment),
    material_product: normalizeMaterialProduct(stored.material_product),
    bom: { ...base.bom, ...(stored.bom || {}) },
    closed_won: { ...base.closed_won, ...(stored.closed_won || {}) },
    closed_lost: { ...base.closed_lost, ...(stored.closed_lost || {}) },
    technical_attachments: Array.isArray(stored.technical_attachments)
      ? stored.technical_attachments
      : base.technical_attachments,
    vendor_selections: normalizeVendorSelections(stored),
    vendor_inquiries: normalizeVendorInquiries(stored),
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

export function computeBomTotals(bom, payload) {
  const workflowLines = payload ? buildBomCostingLines(payload) : [];
  const useWorkflow = workflowLines.length > 0;
  const materialsTotal = useWorkflow
    ? workflowLines.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
    : (bom?.materials || []).reduce((sum, row) => sum + (Number(row.base_cost) || 0), 0);
  const stockTotal = useWorkflow
    ? workflowLines.filter((row) => row.source === 'stock').reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
    : 0;
  const vendorTotal = useWorkflow
    ? workflowLines.filter((row) => row.source === 'vendor').reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
    : 0;
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
    materialsTotal,
    stockTotal,
    vendorTotal,
    install,
    testing,
    packaging,
    transport,
    costOfAp,
    tpcCost,
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
  const bomTotals = computeBomTotals(bom, opts.payload);
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

export function computeOfferTotals(bom, offerProfitMarginPct, payload) {
  const bomTotals = computeBomTotals(bom, payload);
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
