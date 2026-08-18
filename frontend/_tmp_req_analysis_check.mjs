// Sanity-check Requirement Analysis FE completeness + legacy payload migration.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync(path.resolve('src/lib/carryOrderWorkflow.js'), 'utf8');
const tmp = path.resolve('_tmp_workflow_copy.mjs');
fs.writeFileSync(tmp, src);

const mod = await import(`file://${tmp}`);
const {
  mergeWorkflowPayload,
  isOpportunityAssessmentComplete,
  requirementAnalysisIncompleteMessage,
  siteVisitAssignees,
  siteVisitOtherPeople,
  CARRY_ORDER_STAGES,
  WORKFLOW_PIPELINE_IDS,
  isTechnicalAssessmentComplete,
  technicalAssessmentIncompleteMessage,
  isStageComplete,
  stageIncompleteMessage,
  newTechnicalAssessmentItem,
  isMaterialProductComplete,
  materialProductIncompleteMessage,
  materialStockRows,
  materialPurchaseRows,
  newMaterialProductRow,
  isVendorSelectionComplete,
  vendorManagementIncompleteMessage,
} = mod;

assert.equal(
  CARRY_ORDER_STAGES.find((s) => s.id === 'opportunity_assessment').label,
  'Requirement Analysis',
);
assert.equal(
  CARRY_ORDER_STAGES.find((s) => s.id === 'technical_assessment').label,
  'Technical assessment',
);
// Material & product sits between Technical assessment and Vendor selection
assert.deepEqual(WORKFLOW_PIPELINE_IDS.slice(0, 5), [
  'enquiry_logged',
  'opportunity_assessment',
  'technical_assessment',
  'material_product',
  'technical_clearance',
]);
assert.equal(
  CARRY_ORDER_STAGES.find((s) => s.id === 'material_product').label,
  'Material & product',
);

const base = {
  business_category: 'Project',
  product_categories: ['Pumps'],
  technical_datas_required: true,
  expected_enquiry_closing_date: '2026-09-01',
};

// No site visit
assert.equal(
  isOpportunityAssessmentComplete({ opportunity_assessment: { ...base, site_visit_required: false } }),
  true,
);

// Other category requires text
let oa = { ...base, product_categories: ['Pumps', 'Other'], site_visit_required: false };
assert.equal(isOpportunityAssessmentComplete({ opportunity_assessment: oa }), false);
assert.match(requirementAnalysisIncompleteMessage({ opportunity_assessment: oa }), /Other/);
oa.product_category_other = 'Custom skid';
assert.equal(isOpportunityAssessmentComplete({ opportunity_assessment: oa }), true);

// Site visit needs status
oa = {
  ...base,
  site_visit_required: true,
  site_visit_date: '2026-08-25',
  site_visit_assignees: [{ employee_id: 'EMP0018', name: 'Pritam' }],
};
assert.equal(isOpportunityAssessmentComplete({ opportunity_assessment: oa }), false);
assert.match(requirementAnalysisIncompleteMessage({ opportunity_assessment: oa }), /site visit status/i);

oa.site_visit_status = 'pending';
assert.equal(isOpportunityAssessmentComplete({ opportunity_assessment: oa }), true);

// Done requires the full report
oa.site_visit_status = 'done';
assert.equal(isOpportunityAssessmentComplete({ opportunity_assessment: oa }), false);
assert.match(requirementAnalysisIncompleteMessage({ opportunity_assessment: oa }), /marked Done/);
Object.assign(oa, {
  site_visit_photos: [{ id: 'a1', file_url: 'u' }],
  technical_discussions: 'Discussed pump head',
  technical_datasheet_drawing: [{ id: 'a2', file_url: 'u' }],
  existing_equipment_details: 'Old KSB pump',
  process_parameters: '50 m3/h at 4 bar',
  minutes_of_meeting: 'Agreed scope',
  customer_signature: { id: 's1', file_url: 'u' },
  engineer_signature: { id: 's2', file_url: 'u' },
});
assert.equal(isOpportunityAssessmentComplete({ opportunity_assessment: oa }), true);

// Legacy single-assignee migration through mergeWorkflowPayload
const legacyMerged = mergeWorkflowPayload({
  opportunity_assessment: {
    ...base,
    site_visit_required: true,
    site_visit_date: '2026-08-25',
    site_visit_assignee_employee_id: 'EMP0005',
    site_visit_assignee_name: 'Subhashree',
    site_visit_status: 'pending',
  },
});
assert.deepEqual(siteVisitAssignees(legacyMerged.opportunity_assessment), [
  { employee_id: 'EMP0005', name: 'Subhashree' },
]);
assert.equal(isOpportunityAssessmentComplete(legacyMerged), true);

// Legacy "other" person migration
const legacyOther = mergeWorkflowPayload({
  opportunity_assessment: {
    ...base,
    site_visit_required: true,
    site_visit_date: '2026-08-25',
    site_visit_assignee_employee_id: 'other',
    site_visit_status: 'pending',
    site_visit_other: {
      name: 'Ravi',
      mobile: '9999999999',
      email: 'ravi@x.com',
      address: 'Bhubaneswar',
      id_proof: { id: 'p1', file_url: 'u' },
    },
  },
});
assert.equal(siteVisitAssignees(legacyOther.opportunity_assessment).length, 0);
assert.equal(siteVisitOtherPeople(legacyOther.opportunity_assessment).length, 1);
assert.equal(isOpportunityAssessmentComplete(legacyOther), true);

// Empty payload still merges cleanly
const empty = mergeWorkflowPayload(null);
assert.deepEqual(empty.opportunity_assessment.site_visit_assignees, []);
assert.deepEqual(empty.opportunity_assessment.site_visit_follow_ups, []);
assert.equal(isOpportunityAssessmentComplete(empty), false);

// --- Technical assessment: blank + dynamic Q&A ---
assert.deepEqual(empty.technical_assessment, { items: [], follow_ups: [] });
assert.equal(isTechnicalAssessmentComplete(empty), false);
assert.match(technicalAssessmentIncompleteMessage(empty), /at least one technical question/i);

// A question without an answer is not enough
const qOnly = mergeWorkflowPayload({
  technical_assessment: { items: [{ ...newTechnicalAssessmentItem(), question: 'Flow rate?' }] },
});
assert.equal(isTechnicalAssessmentComplete(qOnly), false);
assert.match(technicalAssessmentIncompleteMessage(qOnly), /answer/i);

// Question + answer completes the stage
const answered = mergeWorkflowPayload({
  technical_assessment: {
    items: [
      { question: 'Flow rate?', answer: '50 m3/h' },
      { question: 'Pressure?', answer: '' },
    ],
    follow_ups: [{ follow_up_channel: 'whatsapp', notes: 'Sent datasheet' }],
  },
});
assert.equal(isTechnicalAssessmentComplete(answered), true);
assert.equal(answered.technical_assessment.items.length, 2);
assert.ok(answered.technical_assessment.items.every((r) => r.id));
assert.equal(answered.technical_assessment.follow_ups.length, 1);
assert.deepEqual(answered.technical_assessment.follow_ups[0].attachments, []);

// Stage plumbing routes through isStageComplete / stageIncompleteMessage
const stageCtx = { isCarryAndOrder: () => false, leadNeedsVendor: () => false, payload: empty };
assert.equal(isStageComplete('technical_assessment', empty, {}, stageCtx), false);
assert.equal(isStageComplete('technical_assessment', answered, {}, stageCtx), true);
assert.match(stageIncompleteMessage('technical_assessment', {}, stageCtx), /technical question/i);

// --- Material & product component: two grids + follow-ups ---
assert.deepEqual(empty.material_product, { stock_items: [], purchase_items: [], follow_ups: [] });
assert.equal(isMaterialProductComplete(empty), false);
assert.match(materialProductIncompleteMessage(empty), /at least one item/i);

// A stock row alone is enough, and the stock link/available count survive a merge
const stockOnly = mergeWorkflowPayload({
  material_product: {
    stock_items: [{ item_name: 'MS Pipe 2"', specification: 'Sch 40', quantity: '10', uom: 'Mtr', stock_item_id: 'S1', available_qty: 40 }],
  },
});
assert.equal(materialStockRows(stockOnly)[0].stock_item_id, 'S1');
assert.equal(materialStockRows(stockOnly)[0].available_qty, 40);

// A shortfall split keeps the stock row at the on-hand count and links the buy row
const split = mergeWorkflowPayload({
  material_product: {
    stock_items: [{ id: 'stk-1', item_name: 'MS Pipe 2"', quantity: '40', uom: 'Mtr', stock_item_id: 'S1', available_qty: 40 }],
    purchase_items: [{ id: 'buy-x', item_name: 'MS Pipe 2"', quantity: '10', uom: 'Mtr', split_from_row_id: 'stk-1' }],
  },
});
assert.equal(isMaterialProductComplete(split), true);
assert.equal(materialPurchaseRows(split)[0].split_from_row_id, 'stk-1');
assert.equal(newMaterialProductRow().split_from_row_id, '');
assert.equal(isMaterialProductComplete(stockOnly), true);
assert.equal(materialStockRows(stockOnly).length, 1);
assert.ok(materialStockRows(stockOnly).every((r) => r.id));

// A half-typed row blocks the stage
const halfTyped = mergeWorkflowPayload({
  material_product: {
    stock_items: [{ item_name: 'MS Pipe', quantity: '10', uom: 'Mtr' }],
    purchase_items: [{ item_name: 'Booster pump', quantity: '', uom: 'Nos' }],
  },
});
assert.equal(isMaterialProductComplete(halfTyped), false);
assert.match(materialProductIncompleteMessage(halfTyped), /every row/i);

// Purchase grid feeds vendor selection
const withPurchase = mergeWorkflowPayload({
  material_product: {
    purchase_items: [{ id: 'buy-1', item_name: 'Booster pump', quantity: '2', uom: 'Nos' }],
    follow_ups: [{ follow_up_channel: 'call', notes: 'Asked vendor for lead time' }],
  },
});
assert.equal(isMaterialProductComplete(withPurchase), true);
assert.equal(materialPurchaseRows(withPurchase)[0].id, 'buy-1');
assert.equal(withPurchase.material_product.follow_ups.length, 1);
assert.deepEqual(withPurchase.material_product.follow_ups[0].attachments, []);
assert.equal(newMaterialProductRow().vendor_id, '');
assert.equal(
  CARRY_ORDER_STAGES.find((s) => s.id === 'technical_clearance').label,
  'Vendor management',
);

// Vendor management needs vendor + inquiry + quote (price, technical data, warranty/delivery)
assert.equal(isVendorSelectionComplete(withPurchase), false);
assert.match(vendorManagementIncompleteMessage(withPurchase), /Booster pump/i);
const assigned = mergeWorkflowPayload({
  material_product: {
    purchase_items: [{ id: 'buy-1', item_name: 'Booster pump', quantity: '2', uom: 'Nos', vendor_id: 'V1', vendor_name: 'ABC Pumps' }],
  },
});
assert.equal(isVendorSelectionComplete(assigned), false);
assert.match(vendorManagementIncompleteMessage(assigned), /inquiry date|technical data|price/i);
const quoted = mergeWorkflowPayload({
  material_product: {
    purchase_items: [{
      id: 'buy-1',
      item_name: 'Booster pump',
      quantity: '2',
      uom: 'Nos',
      vendor_id: 'V1',
      vendor_name: 'ABC Pumps',
      quoted_price: '15000',
      warranty: '18 months',
      delivery_period: '4 weeks',
    }],
  },
  vendor_inquiries: [{
    vendor_id: 'V1',
    vendor_name: 'ABC Pumps',
    inquiry_date: '2026-08-20',
    technical_data_notes: 'Datasheet attached by vendor',
  }],
});
assert.equal(isVendorSelectionComplete(quoted), true);
assert.equal(isStageComplete('technical_clearance', quoted, {}, stageCtx), true);

assert.equal(isStageComplete('material_product', empty, {}, stageCtx), false);
assert.equal(isStageComplete('material_product', withPurchase, {}, stageCtx), true);
assert.match(stageIncompleteMessage('material_product', {}, { ...stageCtx, payload: empty }), /at least one item/i);

fs.unlinkSync(tmp);
console.log('All Requirement Analysis frontend checks passed');
