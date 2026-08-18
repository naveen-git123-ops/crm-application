import React, { useEffect, useState, useMemo, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  CARRY_ORDER_STAGES,
  WORKFLOW_PIPELINE_IDS,
  WORKFLOW_TERMINAL_IDS,
  LOSS_REASONS,
  TRANSPORT_MODES,
  FOLLOW_UP_CHANNELS,
  followUpChannelLabel,
  mergeWorkflowPayload,
  computeBomTotals,
  computeOfferTotals,
  buildOfferRevisionEntry,
  latestOfferRevision,
  agreedOfferRevision,
  offerRevisionLabel,
  resolveLeadOfferBaseNumber,
  formatOfferRevisionNumber,
  RTB_OFFER_PREFIX,
  RTB_OFFER_SEQUENCE_START,
  revisionTotalProfit,
  revisionAttachments,
  revisionProofOfOfferAttachments,
  followUpAttachments,
  formatInr,
  newFollowUpRow,
  newMaterialRow,
  pipelineStageIndex,
  canAccessWorkflowStage,
  effectivePipelineMaxIndex,
  nextPipelineStageId,
  newTechnicalAttachmentRef,
  newVendorSelectionRow,
  isVendorSelectionComplete,
  isStageComplete,
  stageIncompleteMessage,
  OPPORTUNITY_BUSINESS_CATEGORIES,
  isOpportunityAssessmentComplete,
  requirementAnalysisIncompleteMessage,
  defaultOpportunityAssessment,
  PRODUCT_CATEGORY_OTHER,
  SITE_VISIT_STATUSES,
  SITE_VISIT_FOLLOW_UP_CHANNELS,
  siteVisitAssignees,
  siteVisitOtherPeople,
  newSiteVisitOtherPerson,
  newSiteVisitFollowUpRow,
  defaultTechnicalAssessment,
  newTechnicalAssessmentItem,
  isTechnicalAssessmentComplete,
  technicalAssessmentIncompleteMessage,
  defaultMaterialProduct,
  newMaterialProductRow,
  materialPurchaseRows,
  materialStockRows,
  isMaterialProductComplete,
  materialProductIncompleteMessage,
  MATERIAL_UOM_OPTIONS,
  unassignedPurchaseRows,
  vendorManagementIncompleteMessage,
  vendorInquiries,
  purchaseItemsByVendor,
  inquiryForVendor,
  newVendorInquiry,
  buildBomCostingLines,
  bomMaterialsFromWorkflow,
  withSyncedBomMaterials,
  isBomCostingComplete,
  bomCostingIncompleteMessage,
} from '@/lib/carryOrderWorkflow';
import {
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  Save,
  ChevronRight,
  Store,
  FileText,
  Eye,
  Loader2,
  Lock,
  Check,
  Mail,
} from 'lucide-react';
import { isCarryAndOrder, leadNeedsVendor, LEAD_CATEGORY_OPTIONS } from '@/lib/leadUtils';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { useAuth } from '@/contexts/AuthContext';
import { CgwMultiFilePicker, normalizeFileList } from '@/components/CgwMultiFilePicker';
import { LEAD_ATTACHMENT_ACCEPT, LEAD_ATTACHMENT_HINT } from '@/lib/leadAttachmentAccept';
import { useLeadCategories } from '@/hooks/useLeadCategories';

const inputClass = 'h-9 rounded-lg border-slate-200 bg-white text-sm text-slate-900';
const selectClass =
  'h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900';
const labelClass = 'text-xs font-semibold text-slate-800 uppercase tracking-wide';
const readOnlyValueClass = 'text-sm font-medium mt-1 text-slate-900';
const textareaClass =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 resize-none';

export function CarryOrderWorkspace({
  lead,
  apiBase,
  authHeader,
  vendors,
  attachments = [],
  canEdit,
  onRefresh,
  onAssignVendor,
  onOpenProfile,
  embedded = false,
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stage, setStage] = useState('enquiry_logged');
  const [payload, setPayload] = useState(() => mergeWorkflowPayload(null));
  const [activeTab, setActiveTab] = useState('enquiry_logged');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${apiBase}/leads/${lead.id}/workflow`, {
        headers: authHeader(),
      });
      setStage(data.workflow_stage || 'enquiry_logged');
      setPayload(mergeWorkflowPayload(data.workflow_payload));
      setActiveTab(data.workflow_stage || 'enquiry_logged');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to load workflow'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (lead?.id) load();
  }, [lead?.id]);

  const bomTotals = useMemo(() => computeBomTotals(payload.bom, payload), [payload]);
  const offerTotals = useMemo(() => {
    const latest = latestOfferRevision(payload.offer_revisions);
    const pct = latest?.offer_profit_margin_pct ?? payload.offer_profit_margin_pct;
    return computeOfferTotals(payload.bom, pct, payload);
  }, [payload]);

  const saveWorkflow = async (nextStage, nextPayload, comment, successMessage) => {
    if (
      isCarryAndOrder(lead)
      && leadNeedsVendor(lead)
      && nextStage !== 'enquiry_logged'
      && nextStage !== 'opportunity_assessment'
      && nextStage !== 'technical_assessment'
      && nextStage !== 'material_product'
      && nextStage !== 'technical_clearance'
      && !isVendorSelectionComplete(nextPayload || payload)
    ) {
      toast.error('Assign a vendor to every item that needs to be purchased');
      return;
    }
    setSaving(true);
    try {
      const prepared = withSyncedBomMaterials(nextPayload || payload);
      const { data } = await axios.put(
        `${apiBase}/leads/${lead.id}/workflow`,
        {
          workflow_stage: nextStage,
          workflow_payload: prepared,
          status_change_comment: comment || undefined,
        },
        { headers: authHeader() },
      );
      setStage(data.workflow_stage);
      setPayload(mergeWorkflowPayload(data.workflow_payload));
      const savedStage = data.workflow_stage || stage;
      setActiveTab(savedStage);
      toast.success(
        successMessage
          || (comment === 'Progress saved' ? 'Progress saved' : 'Step completed'),
      );
      if (data?.id) onRefresh?.(data.id);
      else onRefresh?.(lead.id);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  const uploadLeadAttachmentFile = async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    const { data } = await axios.post(`${apiBase}/leads/${lead.id}/attachments`, fd, {
      headers: { ...authHeader(), 'Content-Type': 'multipart/form-data' },
    });
    return newTechnicalAttachmentRef(data);
  };

  const persistVendorSelections = async (nextSelections, successMessage = 'Progress saved') => {
    const nextPayload = {
      ...payload,
      vendor_selections: nextSelections,
      technical_approved: isVendorSelectionComplete({ ...payload, vendor_selections: nextSelections })
        ? true
        : payload.technical_approved,
    };
    setPayload(nextPayload);
    setSaving(true);
    try {
      const { data } = await axios.put(
        `${apiBase}/leads/${lead.id}/workflow`,
        {
          workflow_stage: stage,
          workflow_payload: nextPayload,
          status_change_comment: successMessage,
        },
        { headers: authHeader() },
      );
      setPayload(mergeWorkflowPayload(data.workflow_payload));
      if (successMessage !== 'Progress saved') toast.success(successMessage);
      onRefresh?.(lead.id);
    } catch (err) {
      setPayload(payload);
      toast.error(getApiErrorMessage(err, 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  const uploadVendorRowAttachments = async (rowId, pickedFiles) => {
    const files = normalizeFileList(pickedFiles);
    if (!files.length || !canEdit) return;
    setSaving(true);
    try {
      const rows = [...(payload.vendor_selections || [])];
      const rowIdx = rows.findIndex((r) => r.id === rowId);
      if (rowIdx < 0) return;
      const refs = [...(rows[rowIdx].attachments || [])];
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        const { data } = await axios.post(`${apiBase}/leads/${lead.id}/attachments`, fd, {
          headers: { ...authHeader(), 'Content-Type': 'multipart/form-data' },
        });
        refs.push(newTechnicalAttachmentRef(data));
      }
      rows[rowIdx] = { ...rows[rowIdx], attachments: refs };
      await persistVendorSelections(
        rows,
        files.length > 1 ? 'Vendor attachments added' : 'Vendor attachment added',
      );
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Upload failed'));
    } finally {
      setSaving(false);
    }
  };

  const removeVendorRowAttachment = async (rowId, refId) => {
    const rows = (payload.vendor_selections || []).map((row) => {
      if (row.id !== rowId) return row;
      return {
        ...row,
        attachments: (row.attachments || []).filter((a) => a.id !== refId),
      };
    });
    await persistVendorSelections(rows, 'Attachment removed');
  };

  const uploadVendorRowTechnicalAttachments = async (rowId, pickedFiles) => {
    const files = normalizeFileList(pickedFiles);
    if (!files.length || !canEdit) return;
    setSaving(true);
    try {
      const rows = [...(payload.vendor_selections || [])];
      const rowIdx = rows.findIndex((r) => r.id === rowId);
      if (rowIdx < 0) return;
      const refs = [...(rows[rowIdx].technical_clearance_attachments || [])];
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        const { data } = await axios.post(`${apiBase}/leads/${lead.id}/attachments`, fd, {
          headers: { ...authHeader(), 'Content-Type': 'multipart/form-data' },
        });
        refs.push(newTechnicalAttachmentRef(data));
      }
      rows[rowIdx] = { ...rows[rowIdx], technical_clearance_attachments: refs };
      await persistVendorSelections(
        rows,
        files.length > 1 ? 'Technical clearance documents added' : 'Technical clearance document added',
      );
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Upload failed'));
    } finally {
      setSaving(false);
    }
  };

  const removeVendorRowTechnicalAttachment = async (rowId, refId) => {
    const rows = (payload.vendor_selections || []).map((row) => {
      if (row.id !== rowId) return row;
      return {
        ...row,
        technical_clearance_attachments: (row.technical_clearance_attachments || []).filter(
          (a) => a.id !== refId,
        ),
      };
    });
    await persistVendorSelections(rows, 'Technical clearance attachment removed');
  };

  const uploadVendorRowOfferAttachments = async (rowId, pickedFiles) => {
    const files = normalizeFileList(pickedFiles);
    if (!files.length || !canEdit) return;
    setSaving(true);
    try {
      const rows = [...(payload.vendor_selections || [])];
      const rowIdx = rows.findIndex((r) => r.id === rowId);
      if (rowIdx < 0) return;
      const refs = [...(rows[rowIdx].techno_commercial_offer_attachments || [])];
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        const { data } = await axios.post(`${apiBase}/leads/${lead.id}/attachments`, fd, {
          headers: { ...authHeader(), 'Content-Type': 'multipart/form-data' },
        });
        refs.push(newTechnicalAttachmentRef(data));
      }
      rows[rowIdx] = { ...rows[rowIdx], techno_commercial_offer_attachments: refs };
      await persistVendorSelections(
        rows,
        files.length > 1 ? 'Techno commercial offer documents added' : 'Techno commercial offer document added',
      );
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Upload failed'));
    } finally {
      setSaving(false);
    }
  };

  const removeVendorRowOfferAttachment = async (rowId, refId) => {
    const rows = (payload.vendor_selections || []).map((row) => {
      if (row.id !== rowId) return row;
      return {
        ...row,
        techno_commercial_offer_attachments: (row.techno_commercial_offer_attachments || []).filter(
          (a) => a.id !== refId,
        ),
      };
    });
    await persistVendorSelections(rows, 'Techno commercial offer attachment removed');
  };

  const persistBomAttachments = async (nextAttachments, successMessage = 'Progress saved') => {
    const nextPayload = { ...payload, bom_attachments: nextAttachments };
    setPayload(nextPayload);
    setSaving(true);
    try {
      const { data } = await axios.put(
        `${apiBase}/leads/${lead.id}/workflow`,
        {
          workflow_stage: stage,
          workflow_payload: nextPayload,
          status_change_comment: successMessage,
        },
        { headers: authHeader() },
      );
      setPayload(mergeWorkflowPayload(data.workflow_payload));
      if (successMessage !== 'Progress saved') toast.success(successMessage);
      onRefresh?.(lead.id);
    } catch (err) {
      setPayload(payload);
      toast.error(getApiErrorMessage(err, 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  const uploadBomAttachments = async (pickedFiles) => {
    const files = normalizeFileList(pickedFiles);
    if (!files.length || !canEdit) return;
    setSaving(true);
    try {
      const refs = [...(payload.bom_attachments || [])];
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        const { data } = await axios.post(`${apiBase}/leads/${lead.id}/attachments`, fd, {
          headers: { ...authHeader(), 'Content-Type': 'multipart/form-data' },
        });
        refs.push(newTechnicalAttachmentRef(data));
      }
      await persistBomAttachments(
        refs,
        files.length > 1 ? 'BOM attachments added' : 'BOM attachment added',
      );
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Upload failed'));
    } finally {
      setSaving(false);
    }
  };

  const removeBomAttachment = async (refId) => {
    const refs = (payload.bom_attachments || []).filter((a) => a.id !== refId);
    await persistBomAttachments(refs, 'BOM attachment removed');
  };

  const stageCtx = { isCarryAndOrder, leadNeedsVendor, payload };
  const pipelineMaxIdx = effectivePipelineMaxIndex(stage, payload);
  const isClosed = WORKFLOW_TERMINAL_IDS.includes(stage);

  const canOpenStage = (stageId) => canAccessWorkflowStage(stageId, stage, payload);

  const canEditStep = (tabId) =>
    canEdit
    && !isClosed
    && canOpenStage(tabId)
    && pipelineStageIndex(tabId) <= pipelineMaxIdx;

  const handleTabSelect = (stageId) => {
    if (!canOpenStage(stageId)) {
      const blocked = CARRY_ORDER_STAGES.find((s) => s.id === stageId);
      const techIdx = pipelineStageIndex('technical_clearance');
      if (
        !isVendorSelectionComplete(payload)
        && pipelineStageIndex(stageId) > techIdx
        && pipelineMaxIdx <= techIdx
      ) {
        toast.error('Complete vendor management to unlock the next steps');
        return;
      }
      const need = WORKFLOW_PIPELINE_IDS[pipelineMaxIdx];
      const needLabel = CARRY_ORDER_STAGES.find((s) => s.id === need)?.label;
      toast.error(
        needLabel
          ? `Complete "${needLabel}" before opening ${blocked?.label || 'this step'}`
          : 'Complete earlier steps first',
      );
      return;
    }
    setActiveTab(stageId);
  };

  const handleSaveDraft = () => {
    if (!canOpenStage(activeTab) || pipelineStageIndex(activeTab) > pipelineMaxIdx) {
      toast.error('This step is not available yet');
      return;
    }
    const { pipeline_terminal_confirmed: _c, ...draftPayload } = payload;
    saveWorkflow(stage, draftPayload, 'Progress saved');
  };

  const handleClientDecision = async (agreed) => {
    const revisions = payload.offer_revisions || [];
    if (!revisions.length) {
      toast.error('Record at least one offer in Offer & revision first');
      return;
    }
    const revId = payload.agreed_revision_id || revisions[revisions.length - 1]?.id;
    const agreedRev = agreedOfferRevision(revisions, revId);
    const nextPayload = {
      ...payload,
      client_outcome: agreed ? 'won' : 'lost',
      agreed_revision_id: agreed ? agreedRev?.id : null,
      offer_revisions: revisions.map((r) => ({
        ...r,
        client_agreed: Boolean(agreed && agreedRev && r.id === agreedRev.id),
      })),
    };
    if (agreed) {
      nextPayload.closed_won = {
        ...nextPayload.closed_won,
        order_value: nextPayload.closed_won?.order_value ?? agreedRev?.offer_value,
      };
      await saveWorkflow('closed_won', nextPayload, 'Client agreed — proceeding to Closed Won');
    } else {
      await saveWorkflow('closed_lost', nextPayload, 'Client did not agree — proceeding to Closed Lost');
    }
  };

  const completeCurrentStep = () => {
    if (!isStageComplete(activeTab, payload, lead, stageCtx)) {
      toast.error(stageIncompleteMessage(activeTab, lead, stageCtx));
      if (activeTab === 'enquiry_logged' && leadNeedsVendor(lead)) {
        onAssignVendor?.(lead);
      }
      return;
    }
    const next = nextPipelineStageId(activeTab);
    if (!next) return;
    const comment =
      next === 'bom_costing' && isVendorSelectionComplete(payload)
        ? 'Vendor management completed — proceeding to BOM'
        : `Completed ${CARRY_ORDER_STAGES.find((s) => s.id === activeTab)?.label}`;
    saveWorkflow(
      next,
      payload,
      comment || `Completed ${CARRY_ORDER_STAGES.find((s) => s.id === activeTab)?.label}`,
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const carryOrder = isCarryAndOrder(lead);
  const vendorPending = carryOrder && leadNeedsVendor(lead);
  const editActive = canEditStep(activeTab);
  const onCurrentStep = activeTab === stage && !isClosed;
  const stepComplete = isStageComplete(activeTab, payload, lead, stageCtx);

  return (
    <div
      className={`flex flex-col h-full bg-white overflow-hidden ${
        embedded ? 'min-h-0 rounded-lg border border-slate-200' : 'min-h-[480px] rounded-xl border border-slate-200 shadow-sm'
      }`}
    >
      {vendorPending && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-3 bg-amber-50 border-b border-amber-200 text-amber-950">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Setup pending — vendor not assigned</p>
            <p className="text-xs text-amber-800 mt-0.5">
              This lead is saved. Assign a vendor below to unlock vendor management and later stages.
            </p>
          </div>
          {canEdit && (
            <Button
              type="button"
              size="sm"
              className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white border-0"
              onClick={() => onAssignVendor?.(lead)}
            >
              <Store className="h-3.5 w-3.5 mr-1.5" />
              Assign vendor now
            </Button>
          )}
        </div>
      )}
      {!embedded && (
        <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-900 to-indigo-950 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">
            Inquiry & costing workflow
            {lead.sub_category ? ` · ${lead.sub_category}` : ''}
          </p>
          <h2 className="text-lg font-bold mt-0.5">{lead.company}</h2>
          <p className="text-sm text-slate-300 mt-0.5">{lead.contact_name}</p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {carryOrder && (
              lead.vendor_name ? (
                <span className="inline-flex items-center gap-1 text-xs bg-white/10 px-2 py-1 rounded-md">
                  <Store className="h-3.5 w-3.5" />
                  {lead.vendor_name}
                </span>
              ) : (
                canEdit && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 text-xs bg-amber-500/90 hover:bg-amber-500 text-white border-0"
                    onClick={() => onAssignVendor?.(lead)}
                  >
                    Assign vendor
                  </Button>
                )
              )
            )}
            <span className="text-xs text-slate-400">
              Stage: <strong className="text-white">{CARRY_ORDER_STAGES.find((s) => s.id === stage)?.label}</strong>
            </span>
            {onOpenProfile && (
              <Button size="sm" variant="secondary" className="h-7 text-xs ml-auto bg-white/10 hover:bg-white/20 text-white border-0" onClick={onOpenProfile}>
                Activity log
              </Button>
            )}
          </div>
        </div>
      )}

      <WorkflowStepper
        stage={stage}
        activeTab={activeTab}
        onSelect={handleTabSelect}
        canOpenStage={canOpenStage}
        maxIdx={pipelineMaxIdx}
      />

      {!canOpenStage(activeTab) && (
        <div className="mx-5 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Lock className="h-4 w-4 inline mr-2 -mt-0.5" />
          Complete the current step in order to unlock this section.
        </div>
      )}

      {/* Module content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 text-slate-900">
        {canOpenStage(activeTab) && activeTab === 'enquiry_logged' && (
          <ModuleEnquiry lead={lead} attachments={attachments} payload={payload} setPayload={setPayload} canEdit={editActive} />
        )}
        {canOpenStage(activeTab) && activeTab === 'opportunity_assessment' && (
          <ModuleOpportunityAssessment
            payload={payload}
            setPayload={setPayload}
            canEdit={editActive}
            saving={saving}
            uploadLeadFile={uploadLeadAttachmentFile}
            apiBase={apiBase}
            authHeader={authHeader}
          />
        )}
        {canOpenStage(activeTab) && activeTab === 'technical_assessment' && (
          <ModuleTechnicalAssessment
            payload={payload}
            setPayload={setPayload}
            canEdit={editActive}
            saving={saving}
            uploadLeadFile={uploadLeadAttachmentFile}
          />
        )}
        {canOpenStage(activeTab) && activeTab === 'material_product' && (
          <ModuleMaterialProduct
            payload={payload}
            setPayload={setPayload}
            canEdit={editActive}
            saving={saving}
            uploadLeadFile={uploadLeadAttachmentFile}
            apiBase={apiBase}
            authHeader={authHeader}
          />
        )}
        {canOpenStage(activeTab) && activeTab === 'technical_clearance' && (
          <ModuleVendorSelection
            lead={lead}
            payload={payload}
            setPayload={setPayload}
            vendors={vendors}
            canEdit={editActive}
            saving={saving}
            uploadLeadFile={uploadLeadAttachmentFile}
            apiBase={apiBase}
            authHeader={authHeader}
          />
        )}
        {canOpenStage(activeTab) && activeTab === 'bom_costing' && (
          <ModuleBom
            payload={payload}
            setPayload={setPayload}
            bomTotals={bomTotals}
            canEdit={editActive}
            saving={saving}
            onUploadBomFiles={uploadBomAttachments}
            onRemoveBomAttachment={removeBomAttachment}
          />
        )}
        {canOpenStage(activeTab) && (activeTab === 'offer_revision' || activeTab === 'follow_up') && (
          <ModuleOfferFollowUp
            lead={lead}
            apiBase={apiBase}
            authHeader={authHeader}
            payload={payload}
            setPayload={setPayload}
            offerTotals={offerTotals}
            canEdit={editActive}
            workflowStage={activeTab}
            uploadLeadFile={uploadLeadAttachmentFile}
            onClientDecision={handleClientDecision}
            onPersistPayload={(nextPayload, comment, successMessage) =>
              saveWorkflow(stage, nextPayload, comment, successMessage)
            }
            saving={saving}
          />
        )}
        {canOpenStage(activeTab) && activeTab === 'closed_won' && (
          <ModuleClosedWon
            payload={payload}
            setPayload={setPayload}
            bomTotals={bomTotals}
            offerTotals={offerTotals}
            canEdit={editActive && !isClosed}
          />
        )}
        {canOpenStage(activeTab) && activeTab === 'closed_lost' && (
          <ModuleClosedLost payload={payload} setPayload={setPayload} canEdit={editActive && !isClosed} />
        )}
      </div>

      {/* Actions */}
      {canEdit && !isClosed && WORKFLOW_PIPELINE_IDS.includes(activeTab) && (
        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-xs text-slate-600 flex-1">
            {onCurrentStep
              ? stepComplete
                ? 'Step requirements met — continue when ready.'
                : activeTab === 'opportunity_assessment' && !isOpportunityAssessmentComplete(payload)
                  ? requirementAnalysisIncompleteMessage(payload)
                : activeTab === 'technical_assessment' && !isTechnicalAssessmentComplete(payload)
                  ? technicalAssessmentIncompleteMessage(payload)
                : activeTab === 'material_product' && !isMaterialProductComplete(payload)
                  ? materialProductIncompleteMessage(payload)
                : activeTab === 'technical_clearance' && !isVendorSelectionComplete(payload)
                  ? vendorManagementIncompleteMessage(payload)
                : activeTab === 'bom_costing' && !isBomCostingComplete(payload)
                  ? bomCostingIncompleteMessage(payload)
                  : stageIncompleteMessage(activeTab, lead, stageCtx)
              : 'Viewing a completed step — save to update details without moving forward.'}
          </p>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              disabled={saving || !editActive}
              onClick={handleSaveDraft}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              Save progress
            </Button>
            {onCurrentStep && nextPipelineStageId(activeTab) && (
              <Button
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                disabled={saving || !stepComplete}
                onClick={completeCurrentStep}
              >
                Complete &amp; continue
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      )}
      {canEdit && !isClosed && ['closed_won', 'closed_lost'].includes(activeTab) && canOpenStage(activeTab) && (
        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50">
          <Button
            size="sm"
            className={activeTab === 'closed_won' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}
            disabled={saving}
            onClick={() =>
              saveWorkflow(activeTab, { ...payload, pipeline_terminal_confirmed: true }, `Pipeline closed: ${activeTab}`)
            }
          >
            Confirm {activeTab === 'closed_won' ? 'Closed Won' : 'Closed Lost'}
          </Button>
        </div>
      )}
    </div>
  );
}

function ModuleEnquiry({ lead, attachments, payload, setPayload, canEdit }) {
  return (
    <section className="space-y-4">
      <SectionTitle title="Module 1 — Enquiry details" subtitle="Client parameters captured at lead creation" />
      <div className="rounded-xl border border-slate-200 p-4 bg-white space-y-3 text-slate-900">
        <div>
          <Label className={labelClass}>Brief Of Enquiry</Label>
          <p className={`${readOnlyValueClass} whitespace-pre-wrap`}>
            {lead.brief_of_enquiry || lead.notes || '—'}
          </p>
        </div>
        <div>
          <Label className={labelClass}>Customer enquiry attachments</Label>
          {attachments.length === 0 ? (
            <p className="text-sm text-slate-600 mt-1">No files — attach when creating the lead</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {attachments.map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-sm text-indigo-800">
                  <FileText className="h-4 w-4" />
                  {a.file_name}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className={labelClass}>Assigned user</Label>
            <p className={readOnlyValueClass}>{lead.assigned_to_name || lead.created_by_name || '—'}</p>
          </div>
          <div>
            <Label className={labelClass}>Enquiry date</Label>
            <p className={readOnlyValueClass}>{lead.enquiry_date || '—'}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className={labelClass}>
              Enquiry Validity From <span className="font-normal normal-case text-slate-500">(optional)</span>
            </Label>
            <Input
              type="date"
              className={inputClass}
              disabled={!canEdit}
              value={payload.otx_date_from || lead.enquiry_date || ''}
              onChange={(e) => setPayload({ ...payload, otx_date_from: e.target.value })}
            />
          </div>
          <div>
            <Label className={labelClass}>
              Enquiry Validity To <span className="font-normal normal-case text-slate-500">(optional)</span>
            </Label>
            <Input
              type="date"
              className={inputClass}
              disabled={!canEdit}
              value={payload.otx_date_to || ''}
              onChange={(e) => setPayload({ ...payload, otx_date_to: e.target.value })}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Saved-attachment row with open + remove, used across the Requirement Analysis fields. */
function OaAttachmentRow({ item, canEdit, busy, onRemove }) {
  const name = item?.file_name || item?.name || 'File';
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
      <button
        type="button"
        className="flex-1 flex items-center gap-2 truncate text-left text-indigo-700 hover:underline"
        onClick={() => {
          if (item?.file_url) window.open(item.file_url, '_blank', 'noopener,noreferrer');
        }}
      >
        <FileText className="h-4 w-4 shrink-0" />
        <span className="truncate">{name}</span>
      </button>
      {canEdit && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={busy}
          onClick={onRemove}
        >
          Remove
        </Button>
      )}
    </div>
  );
}

function OaSingleFileField({ label, value, canEdit, busy, addLabel, onPick, onRemove }) {
  return (
    <div className="space-y-2">
      <Label className={labelClass}>{label}</Label>
      {value ? (
        <OaAttachmentRow item={value} canEdit={canEdit} busy={busy} onRemove={onRemove} />
      ) : (
        <p className="text-sm text-slate-500">Not attached</p>
      )}
      {canEdit && !value && (
        <CgwMultiFilePicker
          label=""
          accept={LEAD_ATTACHMENT_ACCEPT}
          hint={LEAD_ATTACHMENT_HINT}
          files={[]}
          onChange={onPick}
          addLabel={addLabel}
          disabled={busy}
        />
      )}
    </div>
  );
}

function OaMultiFileField({ label, items, canEdit, busy, addLabel, onPick, onRemove }) {
  const list = Array.isArray(items) ? items : [];
  return (
    <div className="space-y-2">
      <Label className={labelClass}>{label}</Label>
      {list.length === 0 ? (
        <p className="text-sm text-slate-500">No files attached</p>
      ) : (
        <div className="space-y-1.5">
          {list.map((item) => (
            <OaAttachmentRow
              key={item.id || item.file_url}
              item={item}
              canEdit={canEdit}
              busy={busy}
              onRemove={() => onRemove(item.id)}
            />
          ))}
        </div>
      )}
      {canEdit && (
        <CgwMultiFilePicker
          label=""
          accept={LEAD_ATTACHMENT_ACCEPT}
          hint={LEAD_ATTACHMENT_HINT}
          files={[]}
          onChange={onPick}
          addLabel={addLabel}
          disabled={busy}
        />
      )}
    </div>
  );
}

/**
 * Spreadsheet-style editable grid: arrow/Enter navigation between cells,
 * multi-cell paste from Excel, and add/remove rows.
 */
function ExcelGrid({
  columns,
  rows,
  onChange,
  canEdit,
  newRow,
  emptyLabel,
  rowActions,
  allowAddRemove = true,
}) {
  const list = Array.isArray(rows) ? rows : [];
  const showRowControls = canEdit && allowAddRemove;
  const cellRef = (rowIdx, colIdx) => `cell-${rowIdx}-${colIdx}`;
  const gridRef = useRef(null);

  const focusCell = (rowIdx, colIdx) => {
    const el = gridRef.current?.querySelector(`[data-cell="${cellRef(rowIdx, colIdx)}"]`);
    if (el) {
      el.focus();
      if (typeof el.select === 'function') el.select();
    }
  };

  const updateCell = (rowId, key, value) => {
    onChange(list.map((row) => (row.id === rowId ? { ...row, [key]: value } : row)));
  };

  // A column handler may return the next rows, or apply its own wider update
  // (e.g. splitting a shortfall into another grid) and return nothing.
  const applyHandler = (handler, row, value) => {
    const next = handler(list, row, value);
    if (Array.isArray(next)) onChange(next);
  };

  const addRow = () => onChange([...list, newRow()]);

  const removeRow = (rowId) => onChange(list.filter((row) => row.id !== rowId));

  const handleKeyDown = (e, rowIdx, colIdx) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (rowIdx === list.length - 1) {
        if (!showRowControls) return;
        onChange([...list, newRow()]);
        // Wait for the new row to render before moving into it.
        window.setTimeout(() => focusCell(rowIdx + 1, colIdx), 0);
      } else {
        focusCell(rowIdx + 1, colIdx);
      }
      return;
    }
    if (e.key === 'ArrowDown' && rowIdx < list.length - 1) {
      e.preventDefault();
      focusCell(rowIdx + 1, colIdx);
      return;
    }
    if (e.key === 'ArrowUp' && rowIdx > 0) {
      e.preventDefault();
      focusCell(rowIdx - 1, colIdx);
    }
  };

  /** Paste a block copied from Excel starting at the focused cell. */
  const handlePaste = (e, rowIdx, colIdx) => {
    const text = e.clipboardData?.getData('text/plain') || '';
    if (!text.includes('\t') && !text.includes('\n')) return;
    e.preventDefault();
    const matrix = text
      .replace(/\r/g, '')
      .split('\n')
      .filter((line, i, arr) => line.trim() || i < arr.length - 1)
      .map((line) => line.split('\t'));

    const next = [...list];
    matrix.forEach((cells, r) => {
      const targetIdx = rowIdx + r;
      if (!next[targetIdx]) next[targetIdx] = newRow();
      const patch = {};
      cells.forEach((raw, c) => {
        const col = columns[colIdx + c];
        if (!col) return;
        patch[col.key] = col.type === 'number' ? String(raw).trim() : String(raw).trim();
      });
      next[targetIdx] = { ...next[targetIdx], ...patch };
    });
    onChange(next);
  };

  return (
    <div className="space-y-2" ref={gridRef}>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100">
              <th className="w-14 border-b border-r border-slate-200 px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Sl no
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  className="border-b border-r border-slate-200 px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                >
                  {col.label}
                </th>
              ))}
              {showRowControls && <th className="w-20 border-b border-slate-200 px-2 py-2" />}
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (showRowControls ? 2 : 1)}
                  className="px-3 py-4 text-center text-sm text-slate-500"
                >
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              list.map((row, rowIdx) => (
                <tr key={row.id} className="odd:bg-white even:bg-slate-50/60">
                  <td className="border-b border-r border-slate-200 px-2 py-1 text-slate-600">
                    {rowIdx + 1}
                  </td>
                  {columns.map((col, colIdx) => {
                    const cellReadOnly = !canEdit || col.readOnly || Boolean(col.isReadOnly?.(row));
                    const alignClass = col.align === 'right' ? 'text-right tabular-nums' : '';
                    return (
                    <td key={col.key} className="border-b border-r border-slate-200 p-0">
                      {col.type === 'display' ? (
                        <div className={`px-2 py-1.5 text-sm text-slate-800 ${alignClass}`}>
                          {col.displayValue ? col.displayValue(row) : (row[col.key] ?? '')}
                        </div>
                      ) : col.type === 'select' ? (
                        <select
                          data-cell={cellRef(rowIdx, colIdx)}
                          disabled={cellReadOnly}
                          value={row[col.key] ?? ''}
                          onChange={(e) => {
                            if (col.onCellChange) {
                              applyHandler(col.onCellChange, row, e.target.value);
                              return;
                            }
                            updateCell(row.id, col.key, e.target.value);
                          }}
                          onKeyDown={(e) => handleKeyDown(e, rowIdx, colIdx)}
                          className="w-full border-0 bg-transparent px-2 py-1.5 text-sm text-slate-900 outline-none focus:bg-indigo-50/70 focus:ring-1 focus:ring-inset focus:ring-indigo-400 disabled:text-slate-500"
                        >
                          <option value="">{col.placeholder || 'Select'}</option>
                          {(col.selectOptions || []).map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          data-cell={cellRef(rowIdx, colIdx)}
                          type={col.type === 'number' ? 'number' : 'text'}
                          min={col.type === 'number' ? '0' : undefined}
                          step={col.type === 'number' ? 'any' : undefined}
                          list={col.options ? `${col.key}-options` : undefined}
                          disabled={cellReadOnly}
                          value={col.displayValue ? col.displayValue(row) : (row[col.key] ?? '')}
                          placeholder={col.placeholder}
                          onChange={(e) => {
                            if (col.onCellChange) {
                              applyHandler(col.onCellChange, row, e.target.value);
                              return;
                            }
                            updateCell(row.id, col.key, e.target.value);
                          }}
                          onBlur={(e) => {
                            if (col.onCellBlur) applyHandler(col.onCellBlur, row, e.target.value);
                          }}
                          onKeyDown={(e) => handleKeyDown(e, rowIdx, colIdx)}
                          onPaste={(e) => handlePaste(e, rowIdx, colIdx)}
                          className={`w-full border-0 bg-transparent px-2 py-1.5 text-sm text-slate-900 outline-none focus:bg-indigo-50/70 focus:ring-1 focus:ring-inset focus:ring-indigo-400 disabled:text-slate-500 ${alignClass}`}
                        />
                      )}
                    </td>
                    );
                  })}
                  {showRowControls && (
                    <td className="border-b border-slate-200 px-1 py-1">
                      <div className="flex items-center justify-end gap-1">
                        {rowActions?.(row)}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-slate-500 hover:text-rose-600"
                          aria-label="Remove row"
                          onClick={() => removeRow(row.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {columns.filter((c) => c.options).map((col) => (
        <datalist key={col.key} id={`${col.key}-options`}>
          {col.options.map((opt) => (
            <option key={opt} value={opt} />
          ))}
        </datalist>
      ))}
      {showRowControls && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={addRow}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add row
          </Button>
          <p className="text-xs text-slate-500">
            Press Enter for a new row, or paste a block of cells straight from Excel
          </p>
        </div>
      )}
    </div>
  );
}

/** Shared follow-up log used by Requirement Analysis and Technical assessment. */
function FollowUpLogSection({
  rows,
  canEdit,
  saving,
  uploadingField,
  keyPrefix,
  description,
  onAdd,
  onUpdate,
  onRemove,
  onUploadAttachments,
}) {
  const list = Array.isArray(rows) ? rows : [];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <Label className={labelClass}>Follow-ups</Label>
          <p className="text-xs text-slate-500 normal-case font-normal">{description}</p>
        </div>
        {canEdit && (
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={onAdd}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add follow-up
          </Button>
        )}
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-slate-500">No follow-ups logged yet</p>
      ) : (
        list.map((row, index) => (
          <div key={row.id} className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                Follow-up {index + 1}
              </p>
              {canEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-rose-600 hover:text-rose-700"
                  onClick={() => onRemove(row.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Remove
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className={labelClass}>Date</Label>
                <Input
                  type="date"
                  className={inputClass}
                  disabled={!canEdit}
                  value={row.follow_up_date || ''}
                  onChange={(e) => onUpdate(row.id, { follow_up_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className={labelClass}>Mode</Label>
                <select
                  className={selectClass}
                  disabled={!canEdit}
                  value={row.follow_up_channel || 'call'}
                  onChange={(e) => onUpdate(row.id, { follow_up_channel: e.target.value })}
                >
                  {SITE_VISIT_FOLLOW_UP_CHANNELS.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label className={labelClass}>Contact person</Label>
                <Input
                  className={inputClass}
                  disabled={!canEdit}
                  value={row.contact_person || ''}
                  onChange={(e) => onUpdate(row.id, { contact_person: e.target.value })}
                  placeholder="Who did you speak to"
                />
              </div>
              <div className="space-y-2">
                <Label className={labelClass}>Next follow-up date</Label>
                <Input
                  type="date"
                  className={inputClass}
                  disabled={!canEdit}
                  value={row.next_date || ''}
                  onChange={(e) => onUpdate(row.id, { next_date: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className={labelClass}>Discussion notes</Label>
              <textarea
                disabled={!canEdit}
                value={row.notes || ''}
                onChange={(e) => onUpdate(row.id, { notes: e.target.value })}
                rows={2}
                className={textareaClass}
                placeholder="What was discussed and agreed"
              />
            </div>
            <OaMultiFileField
              label="Attachments"
              items={row.attachments}
              canEdit={canEdit}
              busy={saving || uploadingField === `${keyPrefix}-${row.id}`}
              addLabel={uploadingField === `${keyPrefix}-${row.id}` ? 'Uploading…' : 'Add attachment'}
              onRemove={(refId) => onUpdate(row.id, {
                attachments: (row.attachments || []).filter((a) => a.id !== refId),
              })}
              onPick={(files) => onUploadAttachments(row, files)}
            />
          </div>
        ))
      )}
    </div>
  );
}

function ModuleOpportunityAssessment({
  payload,
  setPayload,
  canEdit,
  saving,
  uploadLeadFile,
  apiBase,
  authHeader,
}) {
  const { categories, loading: categoriesLoading } = useLeadCategories({ enabled: true });
  const [employees, setEmployees] = useState([]);
  const [uploadingField, setUploadingField] = useState('');
  const oa = payload.opportunity_assessment || defaultOpportunityAssessment();
  const productOptions = (categories || []).map((c) => c.name).filter(Boolean);
  const baseOptions = productOptions.length ? productOptions : LEAD_CATEGORY_OPTIONS;
  const options = baseOptions.includes(PRODUCT_CATEGORY_OTHER)
    ? baseOptions
    : [...baseOptions, PRODUCT_CATEGORY_OTHER];
  const selected = Array.isArray(oa.product_categories) ? oa.product_categories : [];
  const otherCategorySelected = selected.includes(PRODUCT_CATEGORY_OTHER);
  const siteVisitYes = oa.site_visit_required === true;
  const assignees = siteVisitAssignees(oa);
  const otherPeople = siteVisitOtherPeople(oa);
  const siteVisitStatus = String(oa.site_visit_status || '');
  const siteVisitDone = siteVisitStatus === 'done';
  const followUps = Array.isArray(oa.site_visit_follow_ups) ? oa.site_visit_follow_ups : [];

  useEffect(() => {
    axios
      .get(`${apiBase}/employees`, { headers: authHeader() })
      .then((r) => setEmployees(Array.isArray(r.data) ? r.data : []))
      .catch(() => setEmployees([]));
  }, [apiBase, authHeader]);

  const updateOa = (patch) => {
    setPayload({
      ...payload,
      opportunity_assessment: {
        ...defaultOpportunityAssessment(),
        ...oa,
        ...patch,
      },
    });
  };

  const toggleProduct = (name) => {
    if (!canEdit) return;
    const next = selected.includes(name)
      ? selected.filter((n) => n !== name)
      : [...selected, name];
    updateOa({
      product_categories: next,
      ...(name === PRODUCT_CATEGORY_OTHER && !next.includes(PRODUCT_CATEGORY_OTHER)
        ? { product_category_other: '' }
        : {}),
    });
  };

  const toggleAssignee = (employee) => {
    if (!canEdit) return;
    const id = String(employee.employee_id || employee.id);
    const exists = assignees.some((a) => String(a.employee_id) === id);
    const next = exists
      ? assignees.filter((a) => String(a.employee_id) !== id)
      : [...assignees, { employee_id: id, name: employee.name || '' }];
    updateOa({
      site_visit_assignees: next,
      site_visit_assignee_employee_id: next[0]?.employee_id || '',
      site_visit_assignee_name: next[0]?.name || '',
    });
  };

  const addOtherPerson = () => {
    if (!canEdit) return;
    updateOa({ site_visit_others: [...otherPeople, newSiteVisitOtherPerson()] });
  };

  const updateOtherPerson = (personId, patch) => {
    updateOa({
      site_visit_others: otherPeople.map((p) => (p.id === personId ? { ...p, ...patch } : p)),
    });
  };

  const removeOtherPerson = (personId) => {
    updateOa({ site_visit_others: otherPeople.filter((p) => p.id !== personId) });
  };

  /** Uploads the first picked file and hands the saved reference back to the caller. */
  const uploadSingle = async (fieldKey, files, onUploaded, successMessage) => {
    const list = normalizeFileList(files);
    if (!list.length || !uploadLeadFile) return;
    setUploadingField(fieldKey);
    try {
      const ref = await uploadLeadFile(list[0]);
      onUploaded(ref);
      toast.success(successMessage);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Upload failed'));
    } finally {
      setUploadingField('');
    }
  };

  const uploadMany = async (fieldKey, files, existing, onUploaded, successMessage) => {
    const list = normalizeFileList(files);
    if (!list.length || !uploadLeadFile) return;
    setUploadingField(fieldKey);
    try {
      const refs = [...(existing || [])];
      for (const file of list) {
        refs.push(await uploadLeadFile(file));
      }
      onUploaded(refs);
      toast.success(successMessage);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Upload failed'));
    } finally {
      setUploadingField('');
    }
  };

  const addFollowUp = () => {
    if (!canEdit) return;
    updateOa({ site_visit_follow_ups: [...followUps, newSiteVisitFollowUpRow()] });
  };

  const updateFollowUp = (rowId, patch) => {
    updateOa({
      site_visit_follow_ups: followUps.map((r) => (r.id === rowId ? { ...r, ...patch } : r)),
    });
  };

  const removeFollowUp = (rowId) => {
    updateOa({ site_visit_follow_ups: followUps.filter((r) => r.id !== rowId) });
  };

  return (
    <section className="space-y-4">
      <SectionTitle
        title="Module 2 — Requirement Analysis"
        subtitle="Capture the customer requirement, site visit findings and follow-ups before vendor and costing steps"
      />
      <div className="rounded-xl border border-slate-200 p-4 bg-white space-y-4 text-slate-900">
        <div className="space-y-2">
          <Label className={labelClass}>Business category</Label>
          <select
            className={selectClass}
            disabled={!canEdit}
            value={oa.business_category || ''}
            onChange={(e) => updateOa({ business_category: e.target.value })}
          >
            <option value="">Select business category</option>
            {OPPORTUNITY_BUSINESS_CATEGORIES.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label className={labelClass}>Product category</Label>
          <p className="text-xs text-slate-500 normal-case font-normal">Select one or more</p>
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 max-h-48 overflow-y-auto space-y-2">
            {categoriesLoading && !options.length ? (
              <p className="text-sm text-slate-500">Loading categories…</p>
            ) : (
              options.map((name) => (
                <label key={name} className="flex items-center gap-2 text-sm text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300"
                    disabled={!canEdit}
                    checked={selected.includes(name)}
                    onChange={() => toggleProduct(name)}
                  />
                  <span>{name}</span>
                </label>
              ))
            )}
          </div>
          {selected.length > 0 && (
            <p className="text-xs text-slate-600">Selected: {selected.join(', ')}</p>
          )}
          {otherCategorySelected && (
            <div className="space-y-2 pt-1">
              <Label className={labelClass}>Specify other category</Label>
              <Input
                className={inputClass}
                disabled={!canEdit}
                value={oa.product_category_other || ''}
                onChange={(e) => updateOa({ product_category_other: e.target.value })}
                placeholder="Type the product category"
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className={labelClass}>Technical datas required</Label>
            <select
              className={selectClass}
              disabled={!canEdit}
              value={oa.technical_datas_required === true ? 'yes' : oa.technical_datas_required === false ? 'no' : ''}
              onChange={(e) => {
                const v = e.target.value;
                updateOa({
                  technical_datas_required: v === 'yes' ? true : v === 'no' ? false : null,
                });
              }}
            >
              <option value="">Select</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label className={labelClass}>Site visit required</Label>
            <select
              className={selectClass}
              disabled={!canEdit}
              value={oa.site_visit_required === true ? 'yes' : oa.site_visit_required === false ? 'no' : ''}
              onChange={(e) => {
                const v = e.target.value;
                const yes = v === 'yes';
                const no = v === 'no';
                updateOa({
                  site_visit_required: yes ? true : no ? false : null,
                  ...(yes
                    ? {}
                    : {
                      site_visit_date: '',
                      site_visit_assignees: [],
                      site_visit_others: [],
                      site_visit_status: '',
                      site_visit_assignee_employee_id: '',
                      site_visit_assignee_name: '',
                      site_visit_other: defaultOpportunityAssessment().site_visit_other,
                    }),
                });
              }}
            >
              <option value="">Select</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
        </div>

        {siteVisitYes && (
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-4 space-y-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-800">Site visit</p>
            <div className="space-y-2 max-w-xs">
              <Label className={labelClass}>Site visit date</Label>
              <Input
                type="date"
                className={inputClass}
                disabled={!canEdit}
                value={oa.site_visit_date || ''}
                onChange={(e) => updateOa({ site_visit_date: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label className={labelClass}>Assign persons for site visit</Label>
              <p className="text-xs text-slate-500 normal-case font-normal">
                Select one or more employees — each gets a site visit task
              </p>
              <div className="rounded-lg border border-slate-200 bg-white p-3 max-h-44 overflow-y-auto space-y-2">
                {employees.length === 0 ? (
                  <p className="text-sm text-slate-500">No employees available</p>
                ) : (
                  employees.map((emp) => {
                    const id = String(emp.employee_id || emp.id);
                    return (
                      <label key={id} className="flex items-center gap-2 text-sm text-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300"
                          disabled={!canEdit}
                          checked={assignees.some((a) => String(a.employee_id) === id)}
                          onChange={() => toggleAssignee(emp)}
                        />
                        <span>{emp.name} ({id})</span>
                      </label>
                    );
                  })
                )}
              </div>
              {assignees.length > 0 && (
                <p className="text-xs text-slate-600">
                  Assigned: {assignees.map((a) => a.name || a.employee_id).join(', ')}
                </p>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <Label className={labelClass}>Other persons joining</Label>
                  <p className="text-xs text-slate-500 normal-case font-normal">
                    External engineers or customer-side people who are not employees
                  </p>
                </div>
                {canEdit && (
                  <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={addOtherPerson}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add person
                  </Button>
                )}
              </div>
              {otherPeople.map((person, index) => (
                <div key={person.id} className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Other person {index + 1}
                    </p>
                    {canEdit && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-rose-600 hover:text-rose-700"
                        onClick={() => removeOtherPerson(person.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Remove
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className={labelClass}>Name</Label>
                      <Input
                        className={inputClass}
                        disabled={!canEdit}
                        value={person.name || ''}
                        onChange={(e) => updateOtherPerson(person.id, { name: e.target.value })}
                        placeholder="Full name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className={labelClass}>Mobile number</Label>
                      <Input
                        className={inputClass}
                        disabled={!canEdit}
                        value={person.mobile || ''}
                        onChange={(e) => updateOtherPerson(person.id, { mobile: e.target.value })}
                        placeholder="Mobile number"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className={labelClass}>Email</Label>
                      <Input
                        type="email"
                        className={inputClass}
                        disabled={!canEdit}
                        value={person.email || ''}
                        onChange={(e) => updateOtherPerson(person.id, { email: e.target.value })}
                        placeholder="Email"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label className={labelClass}>Address</Label>
                      <textarea
                        disabled={!canEdit}
                        value={person.address || ''}
                        onChange={(e) => updateOtherPerson(person.id, { address: e.target.value })}
                        rows={2}
                        className={textareaClass}
                        placeholder="Address"
                      />
                    </div>
                  </div>
                  <OaSingleFileField
                    label="ID proof"
                    value={person.id_proof}
                    canEdit={canEdit}
                    busy={saving || uploadingField === `id_proof-${person.id}`}
                    addLabel={uploadingField === `id_proof-${person.id}` ? 'Uploading…' : 'Attach ID proof'}
                    onRemove={() => updateOtherPerson(person.id, { id_proof: null })}
                    onPick={(files) => uploadSingle(
                      `id_proof-${person.id}`,
                      files,
                      (ref) => updateOtherPerson(person.id, { id_proof: ref }),
                      'ID proof uploaded',
                    )}
                  />
                </div>
              ))}
              {otherPeople.length === 0 && (
                <p className="text-sm text-slate-500">No other persons added</p>
              )}
            </div>

            <div className="space-y-2 max-w-xs">
              <Label className={labelClass}>Site visit status</Label>
              <select
                className={selectClass}
                disabled={!canEdit}
                value={siteVisitStatus}
                onChange={(e) => updateOa({ site_visit_status: e.target.value })}
              >
                <option value="">Select status</option>
                {SITE_VISIT_STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
              <p className="text-xs text-slate-500">
                Mark Done to record the site visit report below
              </p>
            </div>

            {siteVisitDone && (
              <div className="rounded-lg border border-emerald-200 bg-white p-4 space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                    Site visit report
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Capture everything gathered on site — required to complete this step
                  </p>
                </div>

                <OaMultiFileField
                  label="Site visit photos"
                  items={oa.site_visit_photos}
                  canEdit={canEdit}
                  busy={saving || uploadingField === 'site_visit_photos'}
                  addLabel={uploadingField === 'site_visit_photos' ? 'Uploading…' : 'Add photos'}
                  onRemove={(refId) => updateOa({
                    site_visit_photos: (oa.site_visit_photos || []).filter((a) => a.id !== refId),
                  })}
                  onPick={(files) => uploadMany(
                    'site_visit_photos',
                    files,
                    oa.site_visit_photos,
                    (refs) => updateOa({ site_visit_photos: refs }),
                    'Site visit photos uploaded',
                  )}
                />

                <div className="space-y-2">
                  <Label className={labelClass}>Technical discussions</Label>
                  <textarea
                    disabled={!canEdit}
                    value={oa.technical_discussions || ''}
                    onChange={(e) => updateOa({ technical_discussions: e.target.value })}
                    rows={3}
                    className={textareaClass}
                    placeholder="What was discussed technically on site"
                  />
                </div>

                <OaMultiFileField
                  label="Technical datasheet / drawing"
                  items={oa.technical_datasheet_drawing}
                  canEdit={canEdit}
                  busy={saving || uploadingField === 'technical_datasheet_drawing'}
                  addLabel={uploadingField === 'technical_datasheet_drawing' ? 'Uploading…' : 'Add datasheet / drawing'}
                  onRemove={(refId) => updateOa({
                    technical_datasheet_drawing: (oa.technical_datasheet_drawing || []).filter((a) => a.id !== refId),
                  })}
                  onPick={(files) => uploadMany(
                    'technical_datasheet_drawing',
                    files,
                    oa.technical_datasheet_drawing,
                    (refs) => updateOa({ technical_datasheet_drawing: refs }),
                    'Datasheet / drawing uploaded',
                  )}
                />

                <div className="space-y-2">
                  <Label className={labelClass}>Existing equipment details</Label>
                  <textarea
                    disabled={!canEdit}
                    value={oa.existing_equipment_details || ''}
                    onChange={(e) => updateOa({ existing_equipment_details: e.target.value })}
                    rows={3}
                    className={textareaClass}
                    placeholder="Make, model, rating, condition of equipment already installed"
                  />
                </div>

                <div className="space-y-2">
                  <Label className={labelClass}>Process parameters</Label>
                  <textarea
                    disabled={!canEdit}
                    value={oa.process_parameters || ''}
                    onChange={(e) => updateOa({ process_parameters: e.target.value })}
                    rows={3}
                    className={textareaClass}
                    placeholder="Flow, pressure, temperature, capacity and other operating parameters"
                  />
                </div>

                <div className="space-y-2">
                  <Label className={labelClass}>Minutes of the meeting</Label>
                  <textarea
                    disabled={!canEdit}
                    value={oa.minutes_of_meeting || ''}
                    onChange={(e) => updateOa({ minutes_of_meeting: e.target.value })}
                    rows={4}
                    className={textareaClass}
                    placeholder="Agreements, action items and owners from the site meeting"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <OaSingleFileField
                    label="Customer signature"
                    value={oa.customer_signature}
                    canEdit={canEdit}
                    busy={saving || uploadingField === 'customer_signature'}
                    addLabel={uploadingField === 'customer_signature' ? 'Uploading…' : 'Attach signature'}
                    onRemove={() => updateOa({ customer_signature: null })}
                    onPick={(files) => uploadSingle(
                      'customer_signature',
                      files,
                      (ref) => updateOa({ customer_signature: ref }),
                      'Customer signature uploaded',
                    )}
                  />
                  <OaSingleFileField
                    label="Our engineer signature"
                    value={oa.engineer_signature}
                    canEdit={canEdit}
                    busy={saving || uploadingField === 'engineer_signature'}
                    addLabel={uploadingField === 'engineer_signature' ? 'Uploading…' : 'Attach signature'}
                    onRemove={() => updateOa({ engineer_signature: null })}
                    onPick={(files) => uploadSingle(
                      'engineer_signature',
                      files,
                      (ref) => updateOa({ engineer_signature: ref }),
                      'Engineer signature uploaded',
                    )}
                  />
                </div>
              </div>
            )}

            <FollowUpLogSection
              rows={followUps}
              canEdit={canEdit}
              saving={saving}
              uploadingField={uploadingField}
              keyPrefix="follow_up"
              description="Log every touchpoint after the visit — call, WhatsApp, email or meeting"
              onAdd={addFollowUp}
              onUpdate={updateFollowUp}
              onRemove={removeFollowUp}
              onUploadAttachments={(row, files) => uploadMany(
                `follow_up-${row.id}`,
                files,
                row.attachments,
                (refs) => updateFollowUp(row.id, { attachments: refs }),
                'Follow-up attachment uploaded',
              )}
            />
          </div>
        )}

        <div className="space-y-2 max-w-sm">
          <Label className={labelClass}>Expected Enquiry closing date</Label>
          <Input
            type="date"
            className={inputClass}
            disabled={!canEdit}
            value={oa.expected_enquiry_closing_date || ''}
            onChange={(e) => updateOa({ expected_enquiry_closing_date: e.target.value })}
          />
        </div>
      </div>
    </section>
  );
}

function ModuleTechnicalAssessment({ payload, setPayload, canEdit, saving, uploadLeadFile }) {
  const [uploadingField, setUploadingField] = useState('');
  const ta = payload.technical_assessment || defaultTechnicalAssessment();
  const items = Array.isArray(ta.items) ? ta.items : [];
  const followUps = Array.isArray(ta.follow_ups) ? ta.follow_ups : [];

  const updateTa = (patch) => {
    setPayload({
      ...payload,
      technical_assessment: { ...defaultTechnicalAssessment(), ...ta, ...patch },
    });
  };

  const addItem = () => {
    if (!canEdit) return;
    updateTa({ items: [...items, newTechnicalAssessmentItem()] });
  };

  const updateItem = (rowId, patch) => {
    updateTa({ items: items.map((row) => (row.id === rowId ? { ...row, ...patch } : row)) });
  };

  const removeItem = (rowId) => {
    updateTa({ items: items.filter((row) => row.id !== rowId) });
  };

  const addFollowUp = () => {
    if (!canEdit) return;
    updateTa({ follow_ups: [...followUps, newSiteVisitFollowUpRow()] });
  };

  const updateFollowUp = (rowId, patch) => {
    updateTa({ follow_ups: followUps.map((row) => (row.id === rowId ? { ...row, ...patch } : row)) });
  };

  const removeFollowUp = (rowId) => {
    updateTa({ follow_ups: followUps.filter((row) => row.id !== rowId) });
  };

  const uploadFollowUpFiles = async (row, files) => {
    const list = normalizeFileList(files);
    if (!list.length || !uploadLeadFile) return;
    const fieldKey = `ta_follow_up-${row.id}`;
    setUploadingField(fieldKey);
    try {
      const refs = [...(row.attachments || [])];
      for (const file of list) {
        refs.push(await uploadLeadFile(file));
      }
      updateFollowUp(row.id, { attachments: refs });
      toast.success('Follow-up attachment uploaded');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Upload failed'));
    } finally {
      setUploadingField('');
    }
  };

  return (
    <section className="space-y-4">
      <SectionTitle
        title="Module 3 — Technical assessment"
        subtitle="Build your own technical checklist — add any question and record the answer"
      />
      <div className="rounded-xl border border-slate-200 p-4 bg-white space-y-5 text-slate-900">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <Label className={labelClass}>Technical questions</Label>
              <p className="text-xs text-slate-500 normal-case font-normal">
                Type the question, then the answer — add as many as you need
              </p>
            </div>
            {canEdit && (
              <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={addItem}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add question
              </Button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-slate-500">
              No questions added yet — click Add question to start the assessment
            </p>
          ) : (
            items.map((row, index) => (
              <div key={row.id} className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                    Question {index + 1}
                  </p>
                  {canEdit && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-rose-600 hover:text-rose-700"
                      onClick={() => removeItem(row.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Remove
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Question</Label>
                  <Input
                    className={inputClass}
                    disabled={!canEdit}
                    value={row.question || ''}
                    onChange={(e) => updateItem(row.id, { question: e.target.value })}
                    placeholder="e.g. Required flow rate at duty point"
                  />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Answer</Label>
                  <textarea
                    disabled={!canEdit}
                    value={row.answer || ''}
                    onChange={(e) => updateItem(row.id, { answer: e.target.value })}
                    rows={2}
                    className={textareaClass}
                    placeholder="Answer from the customer or site"
                  />
                </div>
              </div>
            ))
          )}
        </div>

        <FollowUpLogSection
          rows={followUps}
          canEdit={canEdit}
          saving={saving}
          uploadingField={uploadingField}
          keyPrefix="ta_follow_up"
          description="Log every touchpoint on the technical assessment — call, WhatsApp, email or meeting"
          onAdd={addFollowUp}
          onUpdate={updateFollowUp}
          onRemove={removeFollowUp}
          onUploadAttachments={uploadFollowUpFiles}
        />
      </div>
    </section>
  );
}

function ModuleMaterialProduct({
  payload,
  setPayload,
  canEdit,
  saving,
  uploadLeadFile,
  apiBase,
  authHeader,
}) {
  const [uploadingField, setUploadingField] = useState('');
  const [stockItems, setStockItems] = useState([]);
  const [stockLoading, setStockLoading] = useState(true);
  const [stockError, setStockError] = useState('');
  const [stockReloadKey, setStockReloadKey] = useState(0);
  const mp = payload.material_product || defaultMaterialProduct();
  const stockRows = Array.isArray(mp.stock_items) ? mp.stock_items : [];
  const purchaseRows = Array.isArray(mp.purchase_items) ? mp.purchase_items : [];
  const followUps = Array.isArray(mp.follow_ups) ? mp.follow_ups : [];

  useEffect(() => {
    let active = true;
    const normalize = (rows) => (Array.isArray(rows) ? rows : [])
      .filter((item) => item && item.id && item.name)
      .map((item) => ({
        id: item.id,
        name: item.name,
        unit: item.unit || 'Nos',
        quantity: Number(item.quantity || 0),
        item_code: item.item_code || '',
      }));

    const load = async () => {
      setStockLoading(true);
      setStockError('');
      try {
        const { data } = await axios.get(`${apiBase}/stock-items/lookup`, { headers: authHeader() });
        if (active) setStockItems(normalize(data));
      } catch (err) {
        // Older API builds have no /lookup route — fall back to the Stock Management list.
        try {
          const { data } = await axios.get(`${apiBase}/stock-items`, { headers: authHeader() });
          if (active) setStockItems(normalize(data));
        } catch (fallbackErr) {
          if (active) {
            setStockItems([]);
            setStockError(getApiErrorMessage(fallbackErr, 'Could not load items from Stock Management'));
          }
        }
      } finally {
        if (active) setStockLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [apiBase, authHeader, stockReloadKey]);

  const stockByName = useMemo(() => {
    const map = new Map();
    stockItems.forEach((item) => {
      if (item?.name) map.set(String(item.name).trim().toLowerCase(), item);
    });
    return map;
  }, [stockItems]);

  const findStockItem = (name) => stockByName.get(String(name || '').trim().toLowerCase()) || null;

  const updateMp = (patch) => {
    setPayload({
      ...payload,
      material_product: { ...defaultMaterialProduct(), ...mp, ...patch },
    });
  };

  /** Picking a stock item fills its name, UOM and the on-hand count. */
  const applyStockPick = (rows, row, stockItemId) => {
    const match = stockItems.find((item) => item.id === stockItemId) || null;
    return rows.map((r) => (
      r.id === row.id
        ? {
          ...r,
          stock_item_id: match?.id || '',
          item_name: match?.name || '',
          uom: match?.unit || r.uom || 'Nos',
          available_qty: match ? Number(match.quantity || 0) : null,
        }
        : r
    ));
  };

  /**
   * Anything asked for beyond the on-hand count belongs to the purchase list,
   * so the stock row keeps what we can issue and the shortfall is split off.
   */
  const applyStockQuantity = (rows, row, value) => {
    const requested = Number(value);
    const available = Number(row.available_qty ?? 0);
    const unlinked = purchaseRows.filter((p) => p.split_from_row_id !== row.id);
    const linked = purchaseRows.find((p) => p.split_from_row_id === row.id) || null;

    const setQty = (qty) => rows.map((r) => (r.id === row.id ? { ...r, quantity: qty } : r));

    if (!row.stock_item_id || !Number.isFinite(requested) || requested <= 0) {
      updateMp({ stock_items: setQty(value), purchase_items: unlinked });
      return;
    }
    if (requested <= available) {
      updateMp({ stock_items: setQty(String(requested)), purchase_items: unlinked });
      return;
    }

    const shortfall = Math.round((requested - Math.max(available, 0)) * 1000) / 1000;
    const shortfallRow = {
      ...(linked || newMaterialProductRow()),
      item_name: row.item_name,
      specification: row.specification,
      uom: row.uom,
      quantity: String(shortfall),
      split_from_row_id: row.id,
    };
    const nextPurchase = linked
      ? purchaseRows.map((p) => (p.split_from_row_id === row.id ? shortfallRow : p))
      : [...purchaseRows, shortfallRow];

    if (available > 0) {
      updateMp({ stock_items: setQty(String(available)), purchase_items: nextPurchase });
      toast.info(`Only ${available} ${row.uom || ''} in stock — ${shortfall} moved to the purchase list`);
    } else {
      updateMp({
        stock_items: rows.filter((r) => r.id !== row.id),
        purchase_items: nextPurchase.map((p) => (
          p.split_from_row_id === row.id ? { ...p, split_from_row_id: '' } : p
        )),
      });
      toast.info(`${row.item_name} is out of stock — full quantity moved to the purchase list`);
    }
  };

  const moveRowToPurchase = (row) => {
    updateMp({
      stock_items: stockRows.filter((r) => r.id !== row.id),
      purchase_items: [
        // Drop the shortfall row this stock row spawned — the whole line moves over now.
        ...purchaseRows.filter((p) => p.split_from_row_id !== row.id),
        newMaterialProductRow({
          item_name: row.item_name,
          specification: row.specification,
          quantity: row.quantity,
          uom: row.uom,
        }),
      ],
    });
    toast.success('Moved to purchase list');
  };

  const moveRowToStock = (row) => {
    const match = findStockItem(row.item_name);
    updateMp({
      purchase_items: purchaseRows.filter((r) => r.id !== row.id),
      stock_items: [
        ...stockRows,
        newMaterialProductRow({
          item_name: row.item_name,
          specification: row.specification,
          quantity: row.quantity,
          uom: match?.unit || row.uom,
          stock_item_id: match?.id || '',
          available_qty: match ? match.quantity : null,
        }),
      ],
    });
    toast.success('Moved to stock list');
  };

  const addFollowUp = () => {
    if (!canEdit) return;
    updateMp({ follow_ups: [...followUps, newSiteVisitFollowUpRow()] });
  };

  const updateFollowUp = (rowId, patch) => {
    updateMp({ follow_ups: followUps.map((row) => (row.id === rowId ? { ...row, ...patch } : row)) });
  };

  const removeFollowUp = (rowId) => {
    updateMp({ follow_ups: followUps.filter((row) => row.id !== rowId) });
  };

  const uploadFollowUpFiles = async (row, files) => {
    const list = normalizeFileList(files);
    if (!list.length || !uploadLeadFile) return;
    const fieldKey = `mp_follow_up-${row.id}`;
    setUploadingField(fieldKey);
    try {
      const refs = [...(row.attachments || [])];
      for (const file of list) {
        refs.push(await uploadLeadFile(file));
      }
      updateFollowUp(row.id, { attachments: refs });
      toast.success('Follow-up attachment uploaded');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Upload failed'));
    } finally {
      setUploadingField('');
    }
  };

  const baseColumns = [
    { key: 'item_name', label: 'Item name', width: '26%', placeholder: 'Item name' },
    { key: 'specification', label: 'Specification / description', width: '34%', placeholder: 'Specification or description' },
    { key: 'quantity', label: 'Quantity', width: '12%', type: 'number', placeholder: '0' },
    { key: 'uom', label: 'UOM', width: '12%', options: MATERIAL_UOM_OPTIONS, placeholder: 'Nos' },
  ];

  const stockColumns = [
    {
      key: 'stock_item_id',
      label: 'Item name',
      width: '26%',
      type: 'select',
      placeholder: stockLoading
        ? 'Loading stock…'
        : (stockItems.length ? 'Select item from stock' : 'No stock items found'),
      selectOptions: stockItems.map((item) => ({
        value: item.id,
        label: `${item.name} — ${Number(item.quantity || 0)} ${item.unit || ''} available`,
      })),
      onCellChange: (rows, row, value) => applyStockPick(rows, row, value),
    },
    baseColumns[1],
    {
      ...baseColumns[2],
      onCellBlur: (rows, row, value) => applyStockQuantity(rows, row, value),
    },
    { ...baseColumns[3], readOnly: true },
    {
      key: 'available_qty',
      label: 'In stock',
      width: '10%',
      readOnly: true,
      placeholder: '—',
      displayValue: (row) => (row.available_qty == null ? '' : String(row.available_qty)),
    },
  ];

  return (
    <section className="space-y-4">
      <SectionTitle
        title="Module 4 — Material & product component"
        subtitle="List every item needed — what we hold in stock and what has to be bought from a vendor"
      />

      <div className="rounded-xl border border-slate-200 p-4 bg-white space-y-3 text-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-800">
              Available in our stock
              {!stockLoading && stockItems.length > 0 && (
                <span className="ml-2 text-xs font-normal text-slate-500">
                  {stockItems.length} item(s) loaded
                </span>
              )}
            </p>
            <p className="text-xs text-slate-500">
              Pick an item from Stock Management — UOM and available count fill in automatically. Ask for more
              than we hold and the extra quantity drops into the purchase list below.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={stockLoading}
            onClick={() => setStockReloadKey((k) => k + 1)}
          >
            {stockLoading ? 'Loading…' : 'Reload stock'}
          </Button>
        </div>
        <ExcelGrid
          columns={stockColumns}
          rows={stockRows}
          onChange={(rows) => updateMp({ stock_items: rows })}
          canEdit={canEdit}
          newRow={newMaterialProductRow}
          emptyLabel="No stock items added — click Add row to start"
          rowActions={(row) => (
            row.stock_item_id ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-amber-700 hover:text-amber-900"
                title="Buy this item from a vendor instead"
                onClick={() => moveRowToPurchase(row)}
              >
                To purchase
              </Button>
            ) : null
          )}
        />
        {stockError ? (
          <p className="text-xs text-rose-700">{stockError}</p>
        ) : (!stockLoading && !stockItems.length && (
          <p className="text-xs text-amber-700">
            No items found in Stock Management — add them there first, or list everything in the purchase grid below.
          </p>
        ))}
      </div>

      <div className="rounded-xl border border-indigo-200 p-4 bg-indigo-50/30 space-y-3 text-slate-900">
        <div>
          <p className="text-sm font-semibold text-slate-800">To be purchased from vendor</p>
          <p className="text-xs text-slate-500">
            This list is carried into Vendor management, where you assign each item to a vendor
          </p>
        </div>
        <ExcelGrid
          columns={baseColumns}
          rows={purchaseRows}
          onChange={(rows) => updateMp({ purchase_items: rows })}
          canEdit={canEdit}
          newRow={newMaterialProductRow}
          emptyLabel="No purchase items — add rows or ask for more than we hold in the grid above"
          rowActions={(row) => (
            !row.split_from_row_id && findStockItem(row.item_name) ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-emerald-700 hover:text-emerald-900"
                title="This item exists in stock — move it to the stock list"
                onClick={() => moveRowToStock(row)}
              >
                In stock
              </Button>
            ) : null
          )}
        />
      </div>

      <div className="rounded-xl border border-slate-200 p-4 bg-white space-y-3 text-slate-900">
        <FollowUpLogSection
          rows={followUps}
          canEdit={canEdit}
          saving={saving}
          uploadingField={uploadingField}
          keyPrefix="mp_follow_up"
          description="Log every touchpoint on material and product selection — call, WhatsApp, email or meeting"
          onAdd={addFollowUp}
          onUpdate={updateFollowUp}
          onRemove={removeFollowUp}
          onUploadAttachments={uploadFollowUpFiles}
        />
      </div>
    </section>
  );
}

function vendorMasterEmail(vendor) {
  if (!vendor) return '';
  if (vendor.email) return vendor.email;
  const contacts = Array.isArray(vendor.contacts) ? vendor.contacts : [];
  const primary = contacts.find((c) => c.is_primary) || contacts[0];
  return primary?.email || '';
}

function inquiryStatusLabel(status) {
  if (status === 'sent') return 'Inquiry sent';
  if (status === 'quoted') return 'Quote received';
  return 'Draft';
}

function ModuleVendorSelection({
  lead,
  payload,
  setPayload,
  vendors = [],
  canEdit,
  saving,
  uploadLeadFile,
  apiBase,
  authHeader,
}) {
  const { user } = useAuth();
  const [vendorList, setVendorList] = useState(Array.isArray(vendors) ? vendors : []);
  const [vendorLoading, setVendorLoading] = useState(false);
  const [uploadingField, setUploadingField] = useState('');
  const [inquiryDialog, setInquiryDialog] = useState(null);
  const [sendingInquiry, setSendingInquiry] = useState(false);
  const [draftTo, setDraftTo] = useState('');
  const [draftSubject, setDraftSubject] = useState('');
  const [draftRemarks, setDraftRemarks] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setVendorLoading(true);
      try {
        const { data } = await axios.get(`${apiBase}/customers?entity_type=1`, {
          headers: authHeader(),
        });
        if (active) setVendorList(Array.isArray(data) ? data : []);
      } catch (err) {
        if (active) {
          if (Array.isArray(vendors) && vendors.length) setVendorList(vendors);
          toast.error(getApiErrorMessage(err, 'Could not load vendors'));
        }
      } finally {
        if (active) setVendorLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [apiBase, authHeader]);

  useEffect(() => {
    if (Array.isArray(vendors) && vendors.length) setVendorList(vendors);
  }, [vendors]);

  const allPurchaseRows = materialPurchaseRows(payload);
  const purchaseItems = allPurchaseRows.filter((item) => String(item.item_name || '').trim());
  const missing = unassignedPurchaseRows(payload);

  const vendorGroups = purchaseItemsByVendor(payload);

  const vendorOptions = useMemo(() => {
    const options = vendorList
      .filter((v) => v.id && v.company_name)
      .map((v) => ({ value: v.id, label: v.company_name }));
    purchaseItems.forEach((item) => {
      if (item.vendor_id && !options.some((opt) => opt.value === item.vendor_id)) {
        options.push({ value: item.vendor_id, label: item.vendor_name || item.vendor_id });
      }
    });
    return options;
  }, [vendorList, purchaseItems]);

  const syncInquiries = (nextPurchase, extraInquiries) => {
    const usedKeys = new Set(
      nextPurchase
        .filter((item) => item.vendor_id || item.vendor_name)
        .map((item) => item.vendor_id || item.vendor_name),
    );
    const existing = extraInquiries || vendorInquiries(payload);
    const kept = existing.filter((row) => usedKeys.has(row.vendor_id || row.vendor_name));
    usedKeys.forEach((key) => {
      if (kept.some((row) => (row.vendor_id || row.vendor_name) === key)) return;
      const sample = nextPurchase.find((item) => (item.vendor_id || item.vendor_name) === key);
      const master = vendorList.find((v) => v.id === sample?.vendor_id);
      kept.push(newVendorInquiry({
        vendor_id: sample?.vendor_id || '',
        vendor_name: sample?.vendor_name || '',
        vendor_email: vendorMasterEmail(master),
      }));
    });
    return kept;
  };

  const assignItemVendor = (_rows, row, vendorId) => {
    const vendor = vendorList.find((v) => v.id === vendorId) || null;
    const nextPurchase = allPurchaseRows.map((r) => (
      r.id === row.id
        ? { ...r, vendor_id: vendor?.id || '', vendor_name: vendor?.company_name || '' }
        : r
    ));
    const uniqueVendors = [];
    const seen = new Set();
    nextPurchase.forEach((item) => {
      const key = item.vendor_id || item.vendor_name;
      if (!key || seen.has(key)) return;
      seen.add(key);
      uniqueVendors.push({
        ...newVendorSelectionRow(),
        id: `vs-${key}`,
        vendor_name: item.vendor_name || '',
      });
    });
    setPayload({
      ...payload,
      material_product: {
        ...(payload.material_product || defaultMaterialProduct()),
        purchase_items: nextPurchase,
      },
      vendor_selections: uniqueVendors.length ? uniqueVendors : payload.vendor_selections,
      vendor_inquiries: syncInquiries(nextPurchase),
    });
  };

  const updatePurchaseItem = (itemId, patch) => {
    const nextPurchase = allPurchaseRows.map((r) => (r.id === itemId ? { ...r, ...patch } : r));
    setPayload({
      ...payload,
      material_product: {
        ...(payload.material_product || defaultMaterialProduct()),
        purchase_items: nextPurchase,
      },
    });
  };

  const upsertInquiry = (group, patch) => {
    const rows = vendorInquiries(payload);
    const idx = rows.findIndex((r) => (
      (group.vendor_id && r.vendor_id === group.vendor_id)
      || (!group.vendor_id && r.vendor_name === group.vendor_name)
    ));
    const master = vendorList.find((v) => v.id === group.vendor_id);
    const base = idx >= 0
      ? rows[idx]
      : newVendorInquiry({
        vendor_id: group.vendor_id,
        vendor_name: group.vendor_name,
        vendor_email: vendorMasterEmail(master),
      });
    const next = {
      ...base,
      ...patch,
      vendor_id: group.vendor_id,
      vendor_name: group.vendor_name,
      vendor_email: patch.vendor_email ?? base.vendor_email ?? vendorMasterEmail(master),
    };
    const copy = [...rows];
    if (idx >= 0) copy[idx] = next;
    else copy.push(next);
    setPayload({ ...payload, vendor_inquiries: copy });
  };

  const uploadTechnicalFiles = async (group, files) => {
    const list = normalizeFileList(files);
    if (!list.length || !uploadLeadFile) return;
    const inquiry = inquiryForVendor(payload, group.vendor_id, group.vendor_name)
      || newVendorInquiry({ vendor_id: group.vendor_id, vendor_name: group.vendor_name });
    const fieldKey = `vi-tech-${group.key}`;
    setUploadingField(fieldKey);
    try {
      const refs = [...(inquiry.technical_data_attachments || [])];
      for (const file of list) refs.push(await uploadLeadFile(file));
      upsertInquiry(group, { technical_data_attachments: refs });
      toast.success('Technical data attached');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Upload failed'));
    } finally {
      setUploadingField('');
    }
  };

  const markInquirySent = (group) => {
    upsertInquiry(group, {
      inquiry_status: 'sent',
      inquiry_sent_at: new Date().toISOString(),
      inquiry_date: inquiryForVendor(payload, group.vendor_id, group.vendor_name)?.inquiry_date
        || new Date().toISOString().slice(0, 10),
    });
    toast.success('Marked as sent without email');
  };

  const openInquiryDialog = (group) => {
    const master = vendorList.find((v) => v.id === group.vendor_id);
    const inquiry = inquiryForVendor(payload, group.vendor_id, group.vendor_name);
    const to = inquiry?.vendor_email || vendorMasterEmail(master);
    const company = lead?.company || lead?.contact_name || 'enquiry';
    setDraftTo(to);
    setDraftSubject(`Inquiry for supply — ${company} — ${group.items.length} item(s)`);
    setDraftRemarks(inquiry?.remarks || '');
    setInquiryDialog(group);
  };

  const sendInquiryEmail = async () => {
    const group = inquiryDialog;
    if (!group || !lead?.id) return;
    const to = String(draftTo || '').trim();
    if (!to || !to.includes('@')) {
      toast.error('Enter a valid vendor email');
      return;
    }
    setSendingInquiry(true);
    try {
      upsertInquiry(group, {
        vendor_email: to,
        remarks: draftRemarks,
        inquiry_date: inquiryForVendor(payload, group.vendor_id, group.vendor_name)?.inquiry_date
          || new Date().toISOString().slice(0, 10),
      });
      const { data } = await axios.post(
        `${apiBase}/leads/${lead.id}/vendor-inquiry-email`,
        {
          vendor_id: group.vendor_id || '',
          vendor_name: group.vendor_name || '',
          to_email: to,
          subject: draftSubject,
          remarks: draftRemarks,
          items: group.items.map((item) => ({
            item_name: item.item_name || '',
            specification: item.specification || '',
            quantity: item.quantity || '',
            uom: item.uom || '',
          })),
        },
        { headers: authHeader() },
      );
      if (Array.isArray(data?.workflow_payload?.vendor_inquiries)) {
        setPayload(mergeWorkflowPayload({
          ...payload,
          vendor_inquiries: data.workflow_payload.vendor_inquiries,
        }));
      } else {
        upsertInquiry(group, {
          vendor_email: data?.to_email || to,
          remarks: draftRemarks,
          inquiry_status: 'sent',
          inquiry_sent_at: new Date().toISOString(),
        });
      }
      toast.success(data?.message || `Inquiry emailed to ${to}`);
      setInquiryDialog(null);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not send the inquiry email'));
    } finally {
      setSendingInquiry(false);
    }
  };

  const purchaseColumns = [
    { key: 'item_name', label: 'Item name', width: '22%', readOnly: true },
    { key: 'specification', label: 'Specification / description', width: '28%', readOnly: true },
    { key: 'quantity', label: 'Quantity', width: '10%', readOnly: true },
    { key: 'uom', label: 'UOM', width: '10%', readOnly: true },
    {
      key: 'vendor_id',
      label: 'Vendor',
      width: '22%',
      type: 'select',
      placeholder: vendorLoading
        ? 'Loading vendors…'
        : (vendorOptions.length ? 'Select vendor' : 'No vendors found'),
      selectOptions: vendorOptions,
      onCellChange: (itemRows, row, value) => assignItemVendor(itemRows, row, value),
    },
  ];

  return (
    <section className="space-y-4">
      <SectionTitle
        title="Module 5 — Vendor management"
        subtitle="Assign vendors, prepare the inquiry, then capture price, technical data, warranty and delivery"
      />
      <div className="rounded-xl border border-indigo-200 bg-white p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">
            Items to purchase ({purchaseItems.length})
          </p>
          <p className="text-xs text-slate-500">
            Pick a vendor for each line. Inquiry packs below are grouped by vendor — sending the email
            from the application comes next.
          </p>
        </div>
        <ExcelGrid
          columns={purchaseColumns}
          rows={purchaseItems}
          onChange={() => {}}
          canEdit={canEdit}
          newRow={newMaterialProductRow}
          allowAddRemove={false}
          emptyLabel="Nothing to purchase — every item is covered from stock. Continue to the next step."
        />
        {missing.length > 0 && (
          <p className="text-xs text-amber-700">
            {missing.length} item(s) still need a vendor: {missing.map((i) => i.item_name).join(', ')}
          </p>
        )}
        {!vendorLoading && !vendorList.length && (
          <p className="text-xs text-rose-700">
            No vendors found — add them in the Vendors screen, then reload this page.
          </p>
        )}
      </div>

      {vendorGroups.map((group) => {
        const master = vendorList.find((v) => v.id === group.vendor_id);
        const inquiry = inquiryForVendor(payload, group.vendor_id, group.vendor_name)
          || newVendorInquiry({
            vendor_id: group.vendor_id,
            vendor_name: group.vendor_name,
            vendor_email: vendorMasterEmail(master),
          });
        const email = inquiry.vendor_email || vendorMasterEmail(master);
        const status = inquiry.inquiry_status || 'draft';
        return (
          <div key={group.key} className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">{group.vendor_name || 'Vendor'}</p>
                <p className="text-xs text-slate-500">
                  {email || 'No email on the vendor record'} · {group.items.length} item(s)
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                status === 'quoted'
                  ? 'bg-emerald-50 text-emerald-800'
                  : status === 'sent'
                    ? 'bg-indigo-50 text-indigo-800'
                    : 'bg-slate-100 text-slate-700'
              }`}
              >
                {inquiryStatusLabel(status)}
              </span>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Inquiry to vendor
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className={labelClass}>Inquiry date</Label>
                  <Input
                    type="date"
                    className={inputClass}
                    disabled={!canEdit}
                    value={inquiry.inquiry_date || ''}
                    onChange={(e) => upsertInquiry(group, { inquiry_date: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className={labelClass}>Vendor email</Label>
                  <Input
                    type="email"
                    className={inputClass}
                    disabled={!canEdit}
                    value={email}
                    onChange={(e) => upsertInquiry(group, { vendor_email: e.target.value })}
                    placeholder="vendor@example.com"
                  />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label className={labelClass}>Remarks / covering note</Label>
                  <textarea
                    disabled={!canEdit}
                    rows={2}
                    className={textareaClass}
                    value={inquiry.remarks || ''}
                    onChange={(e) => upsertInquiry(group, { remarks: e.target.value })}
                    placeholder="Scope, drawings, due date for quote, etc."
                  />
                </div>
              </div>
              <ul className="text-xs text-slate-700 space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.id}>
                    • {item.item_name}
                    {item.specification ? ` — ${item.specification}` : ''}
                    {item.quantity ? ` (${item.quantity} ${item.uom || ''})` : ''}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="h-8 bg-indigo-600 text-white hover:bg-indigo-700"
                  disabled={!canEdit}
                  onClick={() => openInquiryDialog(group)}
                >
                  <Mail className="h-3.5 w-3.5 mr-1" />
                  Send inquiry
                </Button>
                {canEdit && status === 'draft' && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => markInquirySent(group)}
                  >
                    Mark as sent manually
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Vendor quote — price, technical data, warranty &amp; delivery
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className={labelClass}>Quote received date</Label>
                  <Input
                    type="date"
                    className={inputClass}
                    disabled={!canEdit}
                    value={inquiry.quote_received_date || ''}
                    onChange={(e) => upsertInquiry(group, {
                      quote_received_date: e.target.value,
                      inquiry_status: e.target.value ? 'quoted' : inquiry.inquiry_status,
                    })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className={labelClass}>Technical data / discussion</Label>
                <textarea
                  disabled={!canEdit}
                  rows={3}
                  className={textareaClass}
                  value={inquiry.technical_data_notes || ''}
                  onChange={(e) => upsertInquiry(group, { technical_data_notes: e.target.value })}
                  placeholder="Datasheet summary, deviations, model offered, etc."
                />
              </div>
              <OaMultiFileField
                label="Technical data attachments"
                items={inquiry.technical_data_attachments}
                canEdit={canEdit}
                busy={saving || uploadingField === `vi-tech-${group.key}`}
                addLabel={uploadingField === `vi-tech-${group.key}` ? 'Uploading…' : 'Add datasheet / drawing'}
                onRemove={(refId) => upsertInquiry(group, {
                  technical_data_attachments: (inquiry.technical_data_attachments || []).filter((a) => a.id !== refId),
                })}
                onPick={(files) => uploadTechnicalFiles(group, files)}
              />
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border-b border-r border-slate-200 px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600">Item</th>
                      <th className="border-b border-r border-slate-200 px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600">Qty</th>
                      <th className="border-b border-r border-slate-200 px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600">Price (₹)</th>
                      <th className="border-b border-r border-slate-200 px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600">Warranty</th>
                      <th className="border-b border-r border-slate-200 px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600">Delivery period</th>
                      <th className="border-b border-slate-200 px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600">Delivery date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item) => (
                      <tr key={item.id} className="odd:bg-white even:bg-slate-50/60">
                        <td className="border-b border-r border-slate-200 px-2 py-1.5 text-slate-800">
                          <p className="font-medium">{item.item_name}</p>
                          {item.specification ? (
                            <p className="text-xs text-slate-500">{item.specification}</p>
                          ) : null}
                        </td>
                        <td className="border-b border-r border-slate-200 px-2 py-1.5 text-slate-700 whitespace-nowrap">
                          {item.quantity} {item.uom || ''}
                        </td>
                        <td className="border-b border-r border-slate-200 p-1">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            className="h-8 border-0 bg-transparent shadow-none"
                            disabled={!canEdit}
                            value={item.quoted_price ?? ''}
                            onChange={(e) => updatePurchaseItem(item.id, { quoted_price: e.target.value })}
                            placeholder="0.00"
                          />
                        </td>
                        <td className="border-b border-r border-slate-200 p-1">
                          <Input
                            className="h-8 border-0 bg-transparent shadow-none"
                            disabled={!canEdit}
                            value={item.warranty || ''}
                            onChange={(e) => updatePurchaseItem(item.id, { warranty: e.target.value })}
                            placeholder="e.g. 18 months"
                          />
                        </td>
                        <td className="border-b border-r border-slate-200 p-1">
                          <Input
                            className="h-8 border-0 bg-transparent shadow-none"
                            disabled={!canEdit}
                            value={item.delivery_period || ''}
                            onChange={(e) => updatePurchaseItem(item.id, { delivery_period: e.target.value })}
                            placeholder="e.g. 4 weeks"
                          />
                        </td>
                        <td className="border-b border-slate-200 p-1">
                          <Input
                            type="date"
                            className="h-8 border-0 bg-transparent shadow-none"
                            disabled={!canEdit}
                            value={item.delivery_date || ''}
                            onChange={(e) => updatePurchaseItem(item.id, { delivery_date: e.target.value })}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })}
      <Dialog open={Boolean(inquiryDialog)} onOpenChange={(open) => { if (!open && !sendingInquiry) setInquiryDialog(null); }}>
        <DialogContent className="max-w-2xl" hideClose={sendingInquiry}>
          <DialogHeader>
            <DialogTitle>Send inquiry to {inquiryDialog?.vendor_name || 'vendor'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-slate-900">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              From: <span className="font-medium text-slate-800">{user?.name || 'You'}</span>
              {user?.email ? ` · ${user.email}` : ''} — the vendor’s reply will come to this mailbox
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className={labelClass}>Vendor email</Label>
                <Input
                  type="email"
                  className={inputClass}
                  value={draftTo}
                  onChange={(e) => setDraftTo(e.target.value)}
                  placeholder="vendor@example.com"
                  disabled={sendingInquiry}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className={labelClass}>Subject</Label>
                <Input
                  className={inputClass}
                  value={draftSubject}
                  onChange={(e) => setDraftSubject(e.target.value)}
                  disabled={sendingInquiry}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className={labelClass}>Message</Label>
                <textarea
                  rows={3}
                  className={textareaClass}
                  value={draftRemarks}
                  onChange={(e) => setDraftRemarks(e.target.value)}
                  placeholder="Please quote price, technical data, warranty and delivery for the items below."
                  disabled={sendingInquiry}
                />
              </div>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border-b border-r border-slate-200 px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600">Sl</th>
                    <th className="border-b border-r border-slate-200 px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600">Item name</th>
                    <th className="border-b border-r border-slate-200 px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600">Specification</th>
                    <th className="border-b border-r border-slate-200 px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600">Qty</th>
                    <th className="border-b border-slate-200 px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600">UOM</th>
                  </tr>
                </thead>
                <tbody>
                  {(inquiryDialog?.items || []).map((item, idx) => (
                    <tr key={item.id || idx} className="odd:bg-white even:bg-slate-50/60">
                      <td className="border-b border-r border-slate-200 px-2 py-1.5 text-slate-600">{idx + 1}</td>
                      <td className="border-b border-r border-slate-200 px-2 py-1.5 font-medium">{item.item_name}</td>
                      <td className="border-b border-r border-slate-200 px-2 py-1.5 text-slate-600">{item.specification || '—'}</td>
                      <td className="border-b border-r border-slate-200 px-2 py-1.5">{item.quantity || '—'}</td>
                      <td className="border-b border-slate-200 px-2 py-1.5">{item.uom || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={sendingInquiry}
              onClick={() => setInquiryDialog(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
              disabled={sendingInquiry}
              onClick={sendInquiryEmail}
            >
              {sendingInquiry ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Mail className="h-4 w-4 mr-1" />}
              Send email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ModuleBom({ payload, setPayload, bomTotals, canEdit, saving, onUploadBomFiles, onRemoveBomAttachment }) {
  const bom = payload.bom || {};
  const bomAttachments = payload.bom_attachments || [];
  const mp = payload.material_product || defaultMaterialProduct();
  const lines = useMemo(() => buildBomCostingLines(payload), [payload]);
  const useWorkflowLines = lines.length > 0;

  const patchPayload = (next) => {
    setPayload({
      ...next,
      bom: {
        ...(next.bom || bom),
        materials: bomMaterialsFromWorkflow(next),
      },
    });
  };

  const setBom = (patch) => {
    const next = { ...payload, bom: { ...bom, ...patch } };
    setPayload(useWorkflowLines ? { ...next, bom: { ...next.bom, materials: bomMaterialsFromWorkflow(next) } } : next);
  };

  const updateCostingRows = (nextLines) => {
    const stockById = new Map(nextLines.filter((line) => line.source === 'stock').map((line) => [line.id, line]));
    const purchaseById = new Map(nextLines.filter((line) => line.source === 'vendor').map((line) => [line.id, line]));
    const nextStock = materialStockRows(payload).map((item) => {
      const line = stockById.get(item.id);
      return line ? { ...item, unit_cost: line.unit_price } : item;
    });
    const nextPurchase = materialPurchaseRows(payload).map((item) => {
      const line = purchaseById.get(item.id);
      return line ? { ...item, quoted_price: line.unit_price } : item;
    });
    patchPayload({
      ...payload,
      material_product: { ...mp, stock_items: nextStock, purchase_items: nextPurchase },
    });
  };

  const costingIncomplete = !isBomCostingComplete(payload);

  const costingColumns = [
    {
      key: 'source_label',
      label: 'Source',
      width: '9%',
      type: 'display',
      displayValue: (row) => row.source_label,
    },
    { key: 'item_name', label: 'Item name', width: '18%', readOnly: true },
    { key: 'specification', label: 'Specification / description', width: '20%', readOnly: true },
    { key: 'quantity', label: 'Qty', width: '8%', readOnly: true, align: 'right' },
    { key: 'uom', label: 'UOM', width: '8%', readOnly: true },
    {
      key: 'vendor_name',
      label: 'Vendor',
      width: '14%',
      type: 'display',
      displayValue: (row) => (row.source === 'vendor' ? (row.vendor_name || '—') : '—'),
    },
    {
      key: 'unit_price',
      label: 'Unit price (₹)',
      width: '12%',
      type: 'number',
      align: 'right',
      placeholder: '0.00',
    },
    {
      key: 'amount',
      label: 'Amount (₹)',
      width: '11%',
      type: 'display',
      align: 'right',
      displayValue: (row) => formatInr(row.amount || 0),
    },
  ];

  const rollup = [
    { label: 'Stock items', value: bomTotals.stockTotal, show: useWorkflowLines },
    { label: 'Vendor purchase', value: bomTotals.vendorTotal, show: useWorkflowLines },
    { label: 'Materials total', value: bomTotals.materialsTotal, show: true },
    { label: 'Installation, commissioning', value: bomTotals.install, show: true },
    { label: 'Packaging', value: bomTotals.packaging, show: true },
    { label: 'Transportation', value: bomTotals.transport, show: true },
    { label: 'Tour & travel', value: bomTotals.costOfAp, show: true },
    { label: 'TPC cost', value: bomTotals.tpcCost, show: true },
  ].filter((row) => row.show);

  return (
    <section className="space-y-4">
      <SectionTitle
        title="Module 6 — BOM & costing"
        subtitle="Items come from Material & product and Vendor management. Enter stock unit prices; vendor prices are taken from quotes. Installation and other charges sit on top of that material total."
      />
      {useWorkflowLines ? (
        <div className="rounded-xl border border-indigo-200 bg-white p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">
              Supply to customer ({lines.length})
            </p>
            <p className="text-xs text-slate-500">
              Stock lines need a unit price here. Vendor lines use the quoted unit price from Vendor management
              (qty × unit price).
            </p>
          </div>
          <ExcelGrid
            columns={costingColumns}
            rows={lines}
            onChange={updateCostingRows}
            canEdit={canEdit}
            newRow={newMaterialProductRow}
            allowAddRemove={false}
            emptyLabel="No items yet — complete Material & product first."
          />
          {costingIncomplete && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {bomCostingIncompleteMessage(payload)}
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 border-b border-slate-200">
              <tr>
                <th className="text-left p-2 font-semibold text-slate-700">Material / Services</th>
                <th className="text-right p-2 font-semibold text-slate-700">Base cost (₹)</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {(bom.materials || []).map((row, idx) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="p-2">
                    <Input
                      disabled={!canEdit}
                      value={row.material_name}
                      onChange={(e) => {
                        const materials = [...bom.materials];
                        materials[idx] = { ...row, material_name: e.target.value };
                        setBom({ materials });
                      }}
                      className={inputClass}
                      placeholder="Material name"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={!canEdit}
                      value={row.base_cost}
                      onChange={(e) => {
                        const materials = [...bom.materials];
                        materials[idx] = { ...row, base_cost: parseFloat(e.target.value) || 0 };
                        setBom({ materials });
                      }}
                      className={`${inputClass} text-right`}
                    />
                  </td>
                  <td className="p-2">
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => setBom({ materials: bom.materials.filter((_, i) => i !== idx) })}
                        className="text-rose-500 hover:bg-rose-50 p-1 rounded"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {canEdit && (
            <div className="p-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setBom({ materials: [...(bom.materials || []), newMaterialRow()] })}
              >
                <Plus className="h-4 w-4 mr-1" /> Add material row
              </Button>
            </div>
          )}
        </div>
      )}
      <div>
        <p className="text-sm font-semibold text-slate-800 mb-2">Additional charges</p>
        <p className="text-xs text-slate-500 mb-3">
          These sit on top of the material total above to give the consignment cost before quotation profit.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <NumField label="Installation, Commissioning & Cost(₹)" value={bom.install_cost} onChange={(v) => setBom({ install_cost: v })} canEdit={canEdit} />
        {/* <NumField label="Testing, training & TPI (₹)" value={bom.testing_cost} onChange={(v) => setBom({ testing_cost: v })} canEdit={canEdit} /> */}
        <NumField label="Packaging Cost(₹)" value={bom.packaging_cost} onChange={(v) => setBom({ packaging_cost: v })} canEdit={canEdit} />
        {/* <div>
          <Label className={labelClass}>Transportation mode</Label>
          <select
            disabled={!canEdit}
            className={selectClass}
            value={bom.transport_mode || 'AIR'}
            onChange={(e) => setBom({ transport_mode: e.target.value })}
          >
            {TRANSPORT_MODES.map((m) => (
              <option key={m} value={m}>{m} logistics</option>
            ))}
          </select>
        </div> */}
        <NumField label="Transportation cost (₹)" value={bom.transport_cost} onChange={(v) => setBom({ transport_cost: v })} canEdit={canEdit} />
        <NumField label="Tour & Travel Cost (₹)" value={bom.cost_of_ap} onChange={(v) => setBom({ cost_of_ap: v })} canEdit={canEdit} />
        <NumField label="TPC  Cost (₹)" value={bom.margin_amount} onChange={(v) => setBom({ margin_amount: v })} canEdit={canEdit} />
        <div>
          <Label className={labelClass}>Profit margin (%)</Label>
          <Input
            type="number"
            min="0"
            max="99.99"
            step="0.01"
            disabled={!canEdit}
            value={bom.profit_margin_pct ?? ''}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setBom({ profit_margin_pct: Number.isFinite(v) ? Math.min(Math.max(v, 0), 99.99) : 0 });
            }}
            className={`${inputClass} mt-1`}
            placeholder="e.g. 20"
          />
        </div>
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <p className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600 bg-slate-50 border-b border-slate-200">
          Cost roll-up (before quotation)
        </p>
        <div className="divide-y divide-slate-100">
          {rollup.map((row) => (
            <div key={row.label} className="px-4 py-2 flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-600">{row.label}</span>
              <span className="font-medium tabular-nums text-slate-900">{formatInr(row.value || 0)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-sm font-semibold text-slate-800">Total cost for consignment</p>
          <p className="text-xl font-bold tabular-nums text-indigo-900">
            {formatInr(bomTotals.consignmentTotal)}
          </p>
        </div>
        {bomTotals.profitMarginPct > 0 && (
          <>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-800">Total Cost For Consignment after Adding Profit</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {formatInr(bomTotals.consignmentTotal)} ÷ (1 − {bomTotals.profitMarginPct}%)
                </p>
              </div>
              <p className="text-xl font-bold tabular-nums text-emerald-800">
                {formatInr(bomTotals.profitValue)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm">
              <span className="text-slate-600">Profit amount (₹)</span>
              <span className="font-semibold tabular-nums text-slate-900">
                {formatInr(bomTotals.profitAmount)}
              </span>
            </div>
          </>
        )}
      </div>
      <div className="pt-2 border-t border-slate-200 space-y-3">
        {bomAttachments.length > 0 && (
          <ul className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 mb-1">
              BOM & costing documents
            </p>
            {bomAttachments.map((att) => (
              <li key={att.id} className="flex items-center gap-2 text-sm">
                <button
                  type="button"
                  className="flex-1 flex items-center gap-2 truncate text-left text-indigo-700 hover:underline"
                  onClick={() => {
                    if (att.file_url) window.open(att.file_url, '_blank', 'noopener,noreferrer');
                  }}
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  {att.file_name || 'File'}
                </button>
                {canEdit && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-rose-600 hover:text-rose-700"
                    disabled={saving}
                    onClick={() => onRemoveBomAttachment?.(att.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <CgwMultiFilePicker
          label="BOM & costing attachment"
          accept={LEAD_ATTACHMENT_ACCEPT}
          hint={`Upload supporting BOM or costing documents (optional). ${LEAD_ATTACHMENT_HINT}`}
          disabled={!canEdit || saving}
          files={[]}
          onChange={(files) => onUploadBomFiles?.(files)}
          existingAttachments={null}
          addLabel="Attach"
        />
      </div>
    </section>
  );
}

function WorkflowAttachmentPreview({ attachments }) {
  const files = Array.isArray(attachments) ? attachments : [];
  if (!files.length) {
    return <span className="text-slate-400 text-xs">—</span>;
  }
  return (
    <ul className="space-y-1 min-w-[100px]">
      {files.map((att) => (
        <li key={att.id || att.file_url}>
          <button
            type="button"
            onClick={() => {
              if (att.file_url) window.open(att.file_url, '_blank', 'noopener,noreferrer');
            }}
            className="flex items-center gap-1.5 text-left text-indigo-700 hover:text-indigo-900 hover:underline text-xs max-w-[200px]"
            title={`Preview: ${att.file_name || 'File'}`}
          >
            <Eye className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate font-medium">{att.file_name || 'View file'}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function OfferRevisionAttachmentPreview({ rev }) {
  return <WorkflowAttachmentPreview attachments={revisionAttachments(rev)} />;
}

function OfferRevisionProofAttachmentPreview({ rev }) {
  return <WorkflowAttachmentPreview attachments={revisionProofOfOfferAttachments(rev)} />;
}

function ModuleOfferFollowUp({
  lead,
  apiBase,
  authHeader,
  payload,
  setPayload,
  offerTotals,
  canEdit,
  workflowStage,
  uploadLeadFile,
  onClientDecision,
  onPersistPayload,
  saving: parentSaving,
}) {
  const revisions = payload.offer_revisions || [];
  const followUps = payload.follow_ups || [];
  const isFollowUp = workflowStage === 'follow_up';
  const isOfferStep = workflowStage === 'offer_revision';
  const nextRevIndex = revisions.length;

  const [offerDraft, setOfferDraft] = React.useState(() => ({
    date: new Date().toISOString().slice(0, 10),
    comment: '',
    margin_pct: '',
    pendingFiles: [],
    proofPendingFiles: [],
  }));
  const [recording, setRecording] = React.useState(false);
  const [offerRevisionUploadingId, setOfferRevisionUploadingId] = React.useState(null);
  const [offerRevisionProofUploadingId, setOfferRevisionProofUploadingId] = React.useState(null);
  const [followUpUploadingIdx, setFollowUpUploadingIdx] = React.useState(null);
  const [followUpDraft, setFollowUpDraft] = React.useState(() => ({
    date: new Date().toISOString().slice(0, 10),
    channel: 'telephonic',
    comment: '',
    pendingFiles: [],
  }));
  const [addingFollowUp, setAddingFollowUp] = React.useState(false);

  const draftTotals = computeOfferTotals(payload.bom, offerDraft.margin_pct, payload);
  const canEditFollowUp = canEdit && isFollowUp;

  const uploadOfferRevisionAttachments = async (revId, pickedFiles) => {
    const files = normalizeFileList(pickedFiles);
    if (!files.length || !uploadLeadFile) return;
    const revIdx = revisions.findIndex((r) => r.id === revId);
    if (revIdx < 0) return;
    setOfferRevisionUploadingId(revId);
    try {
      const rev = revisions[revIdx];
      const refs = [...revisionAttachments(rev)];
      for (const file of files) {
        refs.push(await uploadLeadFile(file));
      }
      const nextRevisions = [...revisions];
      nextRevisions[revIdx] = { ...rev, attachments: refs };
      const nextPayload = { ...payload, offer_revisions: nextRevisions };
      setPayload(nextPayload);
      if (onPersistPayload) {
        await onPersistPayload(
          nextPayload,
          'Offer attachment added',
          files.length > 1 ? 'Attachments added' : 'Attachment added',
        );
      } else {
        toast.success(files.length > 1 ? 'Attachments added' : 'Attachment added');
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Upload failed'));
    } finally {
      setOfferRevisionUploadingId(null);
    }
  };

  const uploadOfferRevisionProofAttachments = async (revId, pickedFiles) => {
    const files = normalizeFileList(pickedFiles);
    if (!files.length || !uploadLeadFile) return;
    const revIdx = revisions.findIndex((r) => r.id === revId);
    if (revIdx < 0) return;
    setOfferRevisionProofUploadingId(revId);
    try {
      const rev = revisions[revIdx];
      const refs = [...revisionProofOfOfferAttachments(rev)];
      for (const file of files) {
        refs.push(await uploadLeadFile(file));
      }
      const nextRevisions = [...revisions];
      nextRevisions[revIdx] = { ...rev, proof_of_offer_attachments: refs };
      const nextPayload = { ...payload, offer_revisions: nextRevisions };
      setPayload(nextPayload);
      if (onPersistPayload) {
        await onPersistPayload(
          nextPayload,
          'Proof of offer attachment added',
          files.length > 1 ? 'Proof attachments added' : 'Proof attachment added',
        );
      } else {
        toast.success(files.length > 1 ? 'Proof attachments added' : 'Proof attachment added');
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Upload failed'));
    } finally {
      setOfferRevisionProofUploadingId(null);
    }
  };

  const uploadFollowUpAttachments = async (idx, pickedFiles) => {
    const files = normalizeFileList(pickedFiles);
    if (!files.length || !uploadLeadFile) return;
    setFollowUpUploadingIdx(idx);
    try {
      const fu = followUps[idx];
      const refs = [...followUpAttachments(fu)];
      for (const file of files) {
        refs.push(await uploadLeadFile(file));
      }
      const next = [...followUps];
      next[idx] = { ...fu, attachments: refs };
      setPayload({ ...payload, follow_ups: next });
      toast.success(files.length > 1 ? 'Attachments added' : 'Attachment added');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Upload failed'));
    } finally {
      setFollowUpUploadingIdx(null);
    }
  };

  const addFollowUpFromDraft = async () => {
    if (!followUpDraft.date) {
      toast.error('Enter follow-up date');
      return;
    }
    setAddingFollowUp(true);
    try {
      const attachmentRefs = [];
      const pending = normalizeFileList(followUpDraft.pendingFiles);
      if (pending.length && uploadLeadFile) {
        for (const file of pending) {
          attachmentRefs.push(await uploadLeadFile(file));
        }
      }
      const row = {
        ...newFollowUpRow(),
        follow_up_date: followUpDraft.date,
        follow_up_channel: followUpDraft.channel,
        notes: followUpDraft.comment.trim(),
        attachments: attachmentRefs,
      };
      setPayload({ ...payload, follow_ups: [...followUps, row] });
      setFollowUpDraft({
        date: new Date().toISOString().slice(0, 10),
        channel: 'telephonic',
        comment: '',
        pendingFiles: [],
      });
      toast.success('Follow-up recorded');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to add follow-up'));
    } finally {
      setAddingFollowUp(false);
    }
  };

  const leadOfferBase = resolveLeadOfferBaseNumber(payload, revisions);

  const recordOfferRevision = async () => {
    const pct = Number(offerDraft.margin_pct) || 0;
    if (!offerDraft.date) {
      toast.error('Enter offer date');
      return;
    }
    if (pct <= 0) {
      toast.error('Enter offer profit margin %');
      return;
    }
    const pending = normalizeFileList(offerDraft.pendingFiles);
    const proofPending = normalizeFileList(offerDraft.proofPendingFiles);
    setRecording(true);
    try {
      const attachmentRefs = [];
      const proofAttachmentRefs = [];
      if (pending.length && uploadLeadFile) {
        for (const file of pending) {
          attachmentRefs.push(await uploadLeadFile(file));
        }
      }
      if (proofPending.length && uploadLeadFile) {
        for (const file of proofPending) {
          proofAttachmentRefs.push(await uploadLeadFile(file));
        }
      }
      let offerBase = resolveLeadOfferBaseNumber(payload, revisions);
      if (!offerBase) {
        if (!apiBase || !lead?.id) {
          toast.error('Cannot assign offer number — refresh the page and try again');
          return;
        }
        const { data: alloc } = await axios.post(
          `${apiBase}/leads/${lead.id}/allocate-offer-number`,
          {},
          { headers: authHeader() },
        );
        offerBase = alloc.offer_base;
      }
      const entry = buildOfferRevisionEntry(payload.bom, pct, 'offer_revision', {
        notes: offerDraft.comment.trim(),
        recordedAt: offerDraft.date,
        attachments: attachmentRefs,
        proof_of_offer_attachments: proofAttachmentRefs,
        existingRevisions: revisions,
        lead_offer_no: offerBase,
        offerBase,
        payload,
      });
      const nextPayload = {
        ...payload,
        lead_offer_no: entry.lead_offer_base,
        offer_revisions: [...revisions, entry],
        offer_profit_margin_pct: pct,
      };
      setPayload(nextPayload);
      if (onPersistPayload) {
        await onPersistPayload(nextPayload, `${entry.offer_no} recorded`, `${entry.offer_no} recorded`);
      }
      setOfferDraft({
        date: new Date().toISOString().slice(0, 10),
        comment: '',
        margin_pct: '',
        pendingFiles: [],
        proofPendingFiles: [],
      });
      if (!onPersistPayload) {
        toast.success(`${entry.offer_no} recorded`);
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to record offer'));
    } finally {
      setRecording(false);
    }
  };

  const removeRevision = (id) => {
    const remaining = revisions.filter((r) => r.id !== id);
    const base = resolveLeadOfferBaseNumber(payload, remaining);
    const next = remaining.map((r, i) => ({
      ...r,
      revision_index: i,
      lead_offer_base: base || r.lead_offer_base,
      offer_no: formatOfferRevisionNumber(base || r.lead_offer_base, i),
    }));
    setPayload({
      ...payload,
      lead_offer_no: base,
      offer_revisions: next,
    });
  };

  const followUpLogTable = followUps.length === 0 ? (
    <p className="text-sm text-slate-500 rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center">
      {isOfferStep
        ? 'No follow-ups yet — they appear here after you log them on the Follow-up step.'
        : 'No follow-ups yet — add an entry below.'}
    </p>
  ) : (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-100 border-b border-slate-200">
          <tr>
            <th className="p-2 text-left font-semibold text-slate-700">#</th>
            <th className="p-2 text-left font-semibold text-slate-700">Date</th>
            <th className="p-2 text-left font-semibold text-slate-700">Follow-up through</th>
            <th className="p-2 text-left font-semibold text-slate-700">Comment</th>
            <th className="p-2 text-left font-semibold text-slate-700">Proof of follow-up attachment</th>
            {canEditFollowUp && <th className="w-8" />}
          </tr>
        </thead>
        <tbody className="text-slate-800">
          {followUps.map((fu, idx) => (
            <tr key={fu.id} className="border-t border-slate-100">
              <td className="p-2 text-slate-500">F{idx + 1}</td>
              <td className="p-2 whitespace-nowrap">
                {canEditFollowUp ? (
                  <Input
                    type="date"
                    value={fu.follow_up_date || ''}
                    className={inputClass}
                    onChange={(e) => {
                      const next = [...followUps];
                      next[idx] = { ...fu, follow_up_date: e.target.value };
                      setPayload({ ...payload, follow_ups: next });
                    }}
                  />
                ) : (
                  <span className="text-slate-600">{fu.follow_up_date || '—'}</span>
                )}
              </td>
              <td className="p-2 min-w-[130px]">
                {canEditFollowUp ? (
                  <select
                    className={selectClass}
                    value={fu.follow_up_channel || 'telephonic'}
                    onChange={(e) => {
                      const next = [...followUps];
                      next[idx] = { ...fu, follow_up_channel: e.target.value };
                      setPayload({ ...payload, follow_ups: next });
                    }}
                  >
                    {FOLLOW_UP_CHANNELS.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {ch.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-slate-700">{followUpChannelLabel(fu.follow_up_channel)}</span>
                )}
              </td>
              <td className="p-2 max-w-[200px]">
                {canEditFollowUp ? (
                  <Input
                    value={fu.notes || ''}
                    className={inputClass}
                    placeholder="Comment"
                    onChange={(e) => {
                      const next = [...followUps];
                      next[idx] = { ...fu, notes: e.target.value };
                      setPayload({ ...payload, follow_ups: next });
                    }}
                  />
                ) : (
                  <span className="text-slate-600">{fu.notes || '—'}</span>
                )}
              </td>
              <td className="p-2 align-top">
                <WorkflowAttachmentPreview attachments={followUpAttachments(fu)} />
                {canEditFollowUp && (
                  <div className="mt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-indigo-700 px-1"
                      disabled={followUpUploadingIdx === idx || parentSaving}
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.multiple = true;
                        input.accept = LEAD_ATTACHMENT_ACCEPT;
                        input.onchange = (e) => {
                          uploadFollowUpAttachments(idx, e.target.files ? Array.from(e.target.files) : []);
                        };
                        input.click();
                      }}
                    >
                      {followUpUploadingIdx === idx ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        'Attach'
                      )}
                    </Button>
                  </div>
                )}
              </td>
              {canEditFollowUp && (
                <td className="p-2">
                  <button
                    type="button"
                    onClick={() =>
                      setPayload({ ...payload, follow_ups: followUps.filter((_, i) => i !== idx) })
                    }
                    className="text-rose-500 hover:bg-rose-50 p-1 rounded"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const revisionLogTable = revisions.length === 0 ? (
    <p className="text-sm text-slate-500 rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center">
      {isFollowUp
        ? 'No offers recorded yet — add offers in the Offer & revision step (R0, R1, …).'
        : 'No offers yet — record R0, then R1, R2 as you revise.'}
    </p>
  ) : (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-100 border-b border-slate-200">
          <tr>
            <th className="p-2 text-left font-semibold text-slate-700">Rev</th>
            <th className="p-2 text-left font-semibold text-slate-700">Offer #</th>
            <th className="p-2 text-left font-semibold text-slate-700">Date</th>
            <th className="p-2 text-right font-semibold text-slate-700">Margin %</th>
            <th className="p-2 text-right font-semibold text-slate-700">Offered value</th>
            <th className="p-2 text-right font-semibold text-slate-700">Total profit</th>
            <th className="p-2 text-left font-semibold text-slate-700">Comment</th>
            <th className="p-2 text-left font-semibold text-slate-700">Calculation</th>
            <th className="p-2 text-left font-semibold text-slate-700">Offer attachment</th>
            <th className="p-2 text-left font-semibold text-slate-700">Proof of offer attachment</th>
            {canEdit && isOfferStep && <th className="w-8" />}
          </tr>
        </thead>
        <tbody className="text-slate-800">
          {revisions.map((rev) => (
            <tr
              key={rev.id}
              className={`border-t border-slate-100 ${rev.client_agreed ? 'bg-emerald-50/60' : ''}`}
            >
              <td className="p-2 font-medium text-slate-800">{offerRevisionLabel(rev.revision_index)}</td>
              <td className="p-2 font-mono text-xs font-semibold text-indigo-800 whitespace-nowrap">
                {rev.offer_no || '—'}
              </td>
              <td className="p-2 text-slate-600 whitespace-nowrap">{rev.recorded_at || '—'}</td>
              <td className="p-2 text-right tabular-nums font-medium text-slate-800">
                {rev.offer_profit_margin_pct}%
              </td>
              <td className="p-2 text-right tabular-nums font-semibold text-indigo-800">
                {formatInr(rev.offer_value)}
              </td>
              <td className="p-2 text-right tabular-nums font-semibold text-emerald-800">
                {formatInr(revisionTotalProfit(rev, payload.bom))}
              </td>
              <td className="p-2 text-slate-600 max-w-[180px]">{rev.notes || '—'}</td>
              <td className="p-2 text-slate-500 text-xs max-w-[220px]">
                {rev.calculation_comment
                  || (rev.offer_profit_margin_pct > 0 && rev.base_after_bom_profit
                    ? `${formatInr(rev.base_after_bom_profit)} ÷ (1 − ${rev.offer_profit_margin_pct}%) = ${formatInr(rev.offer_value)}`
                    : '—')}
              </td>
              <td className="p-2 align-top">
                <OfferRevisionAttachmentPreview rev={rev} />
                {canEdit && isOfferStep && (
                  <div className="mt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-indigo-700 px-1"
                      disabled={offerRevisionUploadingId === rev.id || parentSaving}
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.multiple = true;
                        input.accept = LEAD_ATTACHMENT_ACCEPT;
                        input.onchange = (e) => {
                          uploadOfferRevisionAttachments(
                            rev.id,
                            e.target.files ? Array.from(e.target.files) : [],
                          );
                        };
                        input.click();
                      }}
                    >
                      {offerRevisionUploadingId === rev.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : revisionAttachments(rev).length ? (
                        'Add more'
                      ) : (
                        'Attach'
                      )}
                    </Button>
                  </div>
                )}
              </td>
              <td className="p-2 align-top">
                <OfferRevisionProofAttachmentPreview rev={rev} />
                {canEdit && isOfferStep && (
                  <div className="mt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-indigo-700 px-1"
                      disabled={offerRevisionProofUploadingId === rev.id || parentSaving}
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.multiple = true;
                        input.accept = LEAD_ATTACHMENT_ACCEPT;
                        input.onchange = (e) => {
                          uploadOfferRevisionProofAttachments(
                            rev.id,
                            e.target.files ? Array.from(e.target.files) : [],
                          );
                        };
                        input.click();
                      }}
                    >
                      {offerRevisionProofUploadingId === rev.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : revisionProofOfOfferAttachments(rev).length ? (
                        'Add more'
                      ) : (
                        'Attach'
                      )}
                    </Button>
                  </div>
                )}
              </td>
              {canEdit && isOfferStep && (
                <td className="p-2">
                  <button
                    type="button"
                    onClick={() => removeRevision(rev.id)}
                    className="text-rose-500 hover:bg-rose-50 p-1 rounded"
                    aria-label="Remove offer revision"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <section className="space-y-6">
      <section className="space-y-4">
        <SectionTitle
          title="Offer revision log"
          subtitle={
            isFollowUp
              ? 'Offers are recorded in Offer & revision (R0, R1, …) — use Client decision below to close Won or Lost'
              : 'Record each offer from R0 onward — margin %, value, and total profit per row'
          }
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase text-slate-500">
              Total cost for consignment after adding profit (BOM base)
            </p>
            <p className="text-sm font-semibold tabular-nums text-slate-900 mt-1">
              {formatInr(offerTotals.baseAfterBomProfit)}
            </p>
          </div>
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/80 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase text-indigo-700">Enquiry offer number</p>
            <p className="text-sm font-mono font-semibold text-indigo-900 mt-1">
              {leadOfferBase || 'Assigned on first offer (R0)'}
            </p>
            <p className="text-[10px] text-indigo-600/80 mt-0.5">
              Format RTB/OFFER/#### — revisions R0, R1, R2 on the same enquiry number
            </p>
          </div>
        </div>

        {canEdit && isOfferStep && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">
              {offerRevisionLabel(nextRevIndex)} — {nextRevIndex === 0 ? 'first offer' : 'revised offer'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className={labelClass}>Offer date *</Label>
                <Input
                  type="date"
                  value={offerDraft.date}
                  onChange={(e) => setOfferDraft({ ...offerDraft, date: e.target.value })}
                  className={`${inputClass} mt-1`}
                />
              </div>
              <div>
                <Label className={labelClass}>Offer profit margin (%) *</Label>
                <Input
                  type="number"
                  min="0"
                  max="99.99"
                  step="0.01"
                  value={offerDraft.margin_pct}
                  onChange={(e) => setOfferDraft({ ...offerDraft, margin_pct: e.target.value })}
                  className={`${inputClass} mt-1`}
                  placeholder="e.g. 15"
                />
              </div>
            </div>
            <div className="rounded-lg border border-white bg-white px-3 py-2">
              <p className="text-[10px] font-semibold uppercase text-slate-500">Offered value</p>
              {draftTotals.offerMarginPct > 0 ? (
                <p className="text-xs text-slate-500 mt-0.5">
                  {formatInr(draftTotals.baseAfterBomProfit)} ÷ (1 − {draftTotals.offerMarginPct}%)
                </p>
              ) : null}
              <p className="text-lg font-bold tabular-nums text-indigo-900 mt-1">
                {formatInr(draftTotals.offerValue)}
              </p>
              {draftTotals.offerMarginPct > 0 && (
                <p className="text-xs text-emerald-700 mt-1">
                  Total profit: {formatInr(draftTotals.totalProfit)}
                </p>
              )}
            </div>
            <div>
              <Label className={labelClass}>
                Comment <span className="font-normal normal-case text-slate-500">(optional)</span>
              </Label>
              <textarea
                rows={2}
                value={offerDraft.comment}
                onChange={(e) => setOfferDraft({ ...offerDraft, comment: e.target.value })}
                className="w-full mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="e.g. Initial offer sent to client"
              />
            </div>
            <p className="text-xs text-slate-500">
              {leadOfferBase
                ? `Next revision: ${formatOfferRevisionNumber(leadOfferBase, nextRevIndex)}`
                : `First offer assigns ${RTB_OFFER_PREFIX}#### (from ${RTB_OFFER_SEQUENCE_START}); revisions R0, R1, R2…`}
            </p>
            <CgwMultiFilePicker
              label="Offer attachment"
              accept={LEAD_ATTACHMENT_ACCEPT}
              hint={`Attach offer document (optional). ${LEAD_ATTACHMENT_HINT}`}
              disabled={recording}
              files={offerDraft.pendingFiles}
              onChange={(files) => setOfferDraft({ ...offerDraft, pendingFiles: files })}
              addLabel="Attach"
            />
            <CgwMultiFilePicker
              label="Proof of offer attachment"
              accept={LEAD_ATTACHMENT_ACCEPT}
              hint={`Attach proof of offer document (optional). ${LEAD_ATTACHMENT_HINT}`}
              disabled={recording}
              files={offerDraft.proofPendingFiles}
              onChange={(files) => setOfferDraft({ ...offerDraft, proofPendingFiles: files })}
              addLabel="Attach"
            />
            <Button
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
              disabled={recording}
              onClick={recordOfferRevision}
            >
              {recording ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-1" />
              )}
              Record {offerRevisionLabel(nextRevIndex)}
            </Button>
          </div>
        )}

        {revisionLogTable}
      </section>

      {(isFollowUp || isOfferStep) && (
        <section className="space-y-4">
          <SectionTitle
            title="Follow-up log"
            subtitle={
              isFollowUp
                ? 'Same layout as offer log — date, channel, comment, and proof of follow-up attachment per row'
                : 'Read-only — add follow-ups on the Follow-up step'
            }
          />
          {followUpLogTable}
          {canEditFollowUp && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-4 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-800">New follow-up</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className={labelClass}>Date *</Label>
                  <Input
                    type="date"
                    value={followUpDraft.date}
                    onChange={(e) => setFollowUpDraft({ ...followUpDraft, date: e.target.value })}
                    className={`${inputClass} mt-1`}
                  />
                </div>
                <div>
                  <Label className={labelClass}>Follow-up through *</Label>
                  <select
                    className={`${selectClass} mt-1`}
                    value={followUpDraft.channel}
                    onChange={(e) => setFollowUpDraft({ ...followUpDraft, channel: e.target.value })}
                  >
                    {FOLLOW_UP_CHANNELS.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {ch.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <Label className={labelClass}>Comment</Label>
                <textarea
                  rows={2}
                  value={followUpDraft.comment}
                  onChange={(e) => setFollowUpDraft({ ...followUpDraft, comment: e.target.value })}
                  className="w-full mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  placeholder="Follow-up comment"
                />
              </div>
              <CgwMultiFilePicker
                label="Proof of follow-up attachment"
                accept={LEAD_ATTACHMENT_ACCEPT}
                hint={`Optional proof of follow-up — preview in the table after adding. ${LEAD_ATTACHMENT_HINT}`}
                disabled={addingFollowUp || parentSaving}
                files={followUpDraft.pendingFiles}
                onChange={(files) => setFollowUpDraft({ ...followUpDraft, pendingFiles: files })}
                addLabel="Attach"
              />
              <Button
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white"
                disabled={addingFollowUp || parentSaving}
                onClick={addFollowUpFromDraft}
              >
                {addingFollowUp ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-1" />
                )}
                Add to follow-up log
              </Button>
            </div>
          )}
        </section>
      )}

      {isFollowUp && (
        <section className="space-y-4">
          <section className="rounded-xl border-2 border-slate-200 bg-slate-50/50 p-4 space-y-4">
            <SectionTitle
              title="Client decision"
              subtitle="If the client agreed, you are taken to Won; otherwise to Lost"
            />
            {revisions.length > 1 && canEdit && (
              <div>
                <Label className={labelClass}>Offer client agreed to</Label>
                <select
                  className={`${selectClass} mt-1`}
                  disabled={parentSaving}
                  value={payload.agreed_revision_id || revisions[revisions.length - 1]?.id || ''}
                  onChange={(e) => setPayload({ ...payload, agreed_revision_id: e.target.value })}
                >
                  {revisions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.offer_no || offerRevisionLabel(r.revision_index)} — {formatInr(r.offer_value)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {revisions.length === 1 && (
              <p className="text-sm text-slate-600">
                Agreed offer:{' '}
                <strong className="text-slate-900">
                  {revisions[0].offer_no || offerRevisionLabel(revisions[0].revision_index)} (
                  {formatInr(revisions[0].offer_value)})
                </strong>
              </p>
            )}
            {payload.client_outcome && (
              <p className="text-sm font-medium text-slate-700">
                Decision recorded:{' '}
                <span className={payload.client_outcome === 'won' ? 'text-emerald-700' : 'text-rose-700'}>
                  {payload.client_outcome === 'won' ? 'Client agreed (Won)' : 'Client did not agree (Lost)'}
                </span>
              </p>
            )}
            {canEdit && (
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  size="sm"
                  disabled={parentSaving || !revisions.length}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => onClientDecision?.(true)}
                >
                  {parentSaving ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                  )}
                  Client agreed — go to Won
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={parentSaving || !revisions.length}
                  className="border-rose-300 text-rose-700 hover:bg-rose-50"
                  onClick={() => onClientDecision?.(false)}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Client did not agree — go to Lost
                </Button>
              </div>
            )}
            {!revisions.length && (
              <p className="text-sm text-amber-800">Add at least one offer in Offer & revision before recording a decision.</p>
            )}
          </section>
        </section>
      )}
    </section>
  );
}

function ModuleClosedWon({ payload, setPayload, bomTotals, offerTotals, canEdit }) {
  const cw = payload.closed_won || {};
  const setCw = (patch) => setPayload({ ...payload, closed_won: { ...cw, ...patch } });
  const defaultOrderValue =
    latestOfferRevision(payload.offer_revisions)?.offer_value
    ?? (offerTotals?.offerMarginPct > 0 ? offerTotals.offerValue : bomTotals.sellingValue);

  return (
    <section className="space-y-4">
      <SectionTitle title="Closed won — order execution" subtitle="All contract parameters required before confirm" />
      <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/30 p-5 space-y-3">
        <NumField
          label="Order value target (₹) *"
          value={cw.order_value ?? defaultOrderValue}
          onChange={(v) => setCw({ order_value: v })}
          canEdit={canEdit}
        />
        <TextField label="Terms & conditions of total invoice *" value={cw.terms} onChange={(v) => setCw({ terms: v })} canEdit={canEdit} rows={2} />
        <TextField label="Packaging & forwarding regulations *" value={cw.packaging_regulations} onChange={(v) => setCw({ packaging_regulations: v })} canEdit={canEdit} rows={2} />
        <TextField label="Payment terms structure *" value={cw.payment_terms} onChange={(v) => setCw({ payment_terms: v })} canEdit={canEdit} rows={2} />
        <TextField label="Warranty & delivery period *" value={cw.warranty_delivery} onChange={(v) => setCw({ warranty_delivery: v })} canEdit={canEdit} rows={2} />
      </div>
    </section>
  );
}

function ModuleClosedLost({ payload, setPayload, canEdit }) {
  const cl = payload.closed_lost || { reasons: [], notes: '' };
  const toggleReason = (id) => {
    const reasons = cl.reasons || [];
    const next = reasons.includes(id) ? reasons.filter((r) => r !== id) : [...reasons, id];
    setPayload({ ...payload, closed_lost: { ...cl, reasons: next } });
  };

  return (
    <section className="space-y-4">
      <SectionTitle title="Closed lost — audit" subtitle="Select disqualification reasons for analytics" />
      <div className="rounded-xl border-2 border-rose-200 bg-rose-50/20 p-5 space-y-3">
        {LOSS_REASONS.map((r) => (
          <label key={r.id} className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              disabled={!canEdit}
              checked={(cl.reasons || []).includes(r.id)}
              onChange={() => toggleReason(r.id)}
              className="mt-1"
            />
            <span className="text-sm text-slate-800">{r.label}</span>
          </label>
        ))}
        <div>
          <Label className={labelClass}>Loss explanation notes {(cl.reasons || []).includes('other') ? '*' : ''}</Label>
          <textarea
            rows={3}
            disabled={!canEdit}
            value={cl.notes || ''}
            onChange={(e) => setPayload({ ...payload, closed_lost: { ...cl, notes: e.target.value } })}
            className="w-full mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
      </div>
    </section>
  );
}

function WorkflowStepper({ stage, activeTab, onSelect, canOpenStage, maxIdx }) {
  const terminalUnlocked = canOpenStage('closed_won');

  const pipelineSteps = WORKFLOW_PIPELINE_IDS.map((id) => CARRY_ORDER_STAGES.find((s) => s.id === id));
  const terminalSteps = WORKFLOW_TERMINAL_IDS.map((id) => CARRY_ORDER_STAGES.find((s) => s.id === id));

  const stepButtonClass = (stepId, variant) => {
    const unlocked = canOpenStage(stepId);
    const idx = pipelineStageIndex(stepId);
    const isActive = activeTab === stepId;
    const isDone = idx >= 0 && idx < maxIdx;
    const isCurrent = stage === stepId;
    const base = 'flex items-center gap-1.5 rounded-lg text-xs font-semibold text-slate-900';

    if (!unlocked) {
      return `${base} px-2.5 py-2 bg-slate-100 text-slate-600 border border-slate-200 cursor-not-allowed`;
    }
    if (variant === 'won' && isActive) {
      return `${base} px-3 py-2 bg-emerald-100 text-emerald-950 border-2 border-emerald-600 shadow-sm`;
    }
    if (variant === 'lost' && isActive) {
      return `${base} px-3 py-2 bg-rose-100 text-rose-950 border-2 border-rose-600 shadow-sm`;
    }
    if (isActive) {
      return `${base} px-2.5 py-2 bg-indigo-100 text-slate-900 border-2 border-indigo-600 shadow-sm ring-2 ring-indigo-100`;
    }
    if (isDone) {
      return `${base} px-2.5 py-2 bg-emerald-50 text-emerald-950 border border-emerald-300 hover:bg-emerald-100`;
    }
    if (isCurrent) {
      return `${base} px-2.5 py-2 bg-indigo-50 text-indigo-950 border border-indigo-400`;
    }
    return `${base} px-2.5 py-2 bg-white text-slate-900 border border-slate-300 hover:border-indigo-300 hover:bg-slate-50`;
  };

  return (
    <div className="px-4 py-4 border-b border-slate-100 bg-white overflow-x-auto text-slate-900">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-700 mb-3">
        Workflow steps — complete in order
      </p>
      <div className="flex items-center gap-1 min-w-max">
        {pipelineSteps.map((s, i) => {
          const unlocked = canOpenStage(s.id);
          return (
            <React.Fragment key={s.id}>
              {i > 0 && (
                <ChevronRight
                  className={`h-4 w-4 shrink-0 ${unlocked ? 'text-slate-400' : 'text-slate-200'}`}
                  aria-hidden
                />
              )}
              <button type="button" onClick={() => onSelect(s.id)} className={stepButtonClass(s.id)}>
                {!unlocked ? (
                  <Lock className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                ) : pipelineStageIndex(s.id) < maxIdx ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
                ) : (
                  <span className="text-[10px] font-bold text-slate-800">{s.short}</span>
                )}
                <span className="whitespace-nowrap text-slate-900">{s.label}</span>
              </button>
            </React.Fragment>
          );
        })}
        <ChevronRight className={`h-4 w-4 shrink-0 mx-1 ${terminalUnlocked ? 'text-slate-400' : 'text-slate-200'}`} />
        {terminalSteps.map((s) => {
          const unlocked = canOpenStage(s.id);
          const variant = s.id === 'closed_won' ? 'won' : 'lost';
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              className={`${stepButtonClass(s.id, variant)} ml-1`}
            >
              {!unlocked && <Lock className="h-3.5 w-3.5 shrink-0 text-slate-600" />}
              <span className="text-slate-900">{s.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SectionTitle({ title, subtitle }) {
  return (
    <div>
      <h3 className="text-base font-bold text-slate-900">{title}</h3>
      {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function NumField({ label, value, onChange, canEdit }) {
  return (
    <div>
      <Label className={labelClass}>{label}</Label>
      <Input
        type="number"
        min="0"
        step="0.01"
        disabled={!canEdit}
        value={value ?? ''}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className={`${inputClass} mt-1`}
      />
    </div>
  );
}

function TextField({ label, value, onChange, canEdit, rows = 3 }) {
  return (
    <div>
      <Label className={labelClass}>{label}</Label>
      <textarea
        rows={rows}
        disabled={!canEdit}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
    </div>
  );
}
