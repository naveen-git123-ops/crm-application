import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
} from 'lucide-react';
import { isCarryAndOrder, leadNeedsVendor } from '@/lib/leadUtils';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { CgwMultiFilePicker, normalizeFileList } from '@/components/CgwMultiFilePicker';
import { LEAD_ATTACHMENT_ACCEPT, LEAD_ATTACHMENT_HINT } from '@/lib/leadAttachmentAccept';

const inputClass = 'h-9 rounded-lg border-slate-200 bg-white text-sm text-slate-900';
const selectClass =
  'h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900';
const labelClass = 'text-xs font-semibold text-slate-800 uppercase tracking-wide';
const readOnlyValueClass = 'text-sm font-medium mt-1 text-slate-900';

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

  const bomTotals = useMemo(() => computeBomTotals(payload.bom), [payload.bom]);
  const offerTotals = useMemo(() => {
    const latest = latestOfferRevision(payload.offer_revisions);
    const pct = latest?.offer_profit_margin_pct ?? payload.offer_profit_margin_pct;
    return computeOfferTotals(payload.bom, pct);
  }, [payload.bom, payload.offer_revisions, payload.offer_profit_margin_pct]);

  const saveWorkflow = async (nextStage, nextPayload, comment, successMessage) => {
    if (isCarryAndOrder(lead) && leadNeedsVendor(lead) && nextStage !== 'enquiry_logged') {
      toast.error('Assign a vendor before moving past enquiry');
      onAssignVendor?.(lead);
      return;
    }
    setSaving(true);
    try {
      const { data } = await axios.put(
        `${apiBase}/leads/${lead.id}/workflow`,
        {
          workflow_stage: nextStage,
          workflow_payload: nextPayload,
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
        toast.error('Complete vendor selection to unlock the next steps');
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
        ? 'Vendor selection completed — proceeding to BOM'
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
              This lead is saved. Assign a vendor below to unlock vendor selection and later stages.
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
        {canOpenStage(activeTab) && activeTab === 'technical_clearance' && (
          <ModuleVendorSelection
            payload={payload}
            setPayload={setPayload}
            vendors={vendors}
            canEdit={editActive}
            saving={saving}
            onUploadRowFiles={uploadVendorRowAttachments}
            onRemoveRowAttachment={removeVendorRowAttachment}
            onUploadRowTechnicalFiles={uploadVendorRowTechnicalAttachments}
            onRemoveRowTechnicalAttachment={removeVendorRowTechnicalAttachment}
            onUploadRowOfferFiles={uploadVendorRowOfferAttachments}
            onRemoveRowOfferAttachment={removeVendorRowOfferAttachment}
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
                : activeTab === 'technical_clearance' && !isVendorSelectionComplete(payload)
                  ? 'Complete vendor details and set technical clearance from vendor to YES for at least one vendor.'
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
          <Label className={labelClass}>Enquiry details</Label>
          <p className={`${readOnlyValueClass} whitespace-pre-wrap`}>{lead.notes || '—'}</p>
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

function ModuleVendorSelection({
  payload,
  setPayload,
  vendors = [],
  canEdit,
  saving,
  onUploadRowFiles,
  onRemoveRowAttachment,
  onUploadRowTechnicalFiles,
  onRemoveRowTechnicalAttachment,
  onUploadRowOfferFiles,
  onRemoveRowOfferAttachment,
}) {
  const rows = payload.vendor_selections?.length
    ? payload.vendor_selections
    : [newVendorSelectionRow()];

  const updateRow = (rowId, patch) => {
    const next = rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row));
    setPayload({ ...payload, vendor_selections: next });
  };

  const addRow = () => {
    setPayload({ ...payload, vendor_selections: [...rows, newVendorSelectionRow()] });
  };

  const removeRow = (rowId) => {
    if (rows.length <= 1) return;
    setPayload({ ...payload, vendor_selections: rows.filter((row) => row.id !== rowId) });
  };

  const vendorNames = vendors.map((v) => v.company_name).filter(Boolean);

  return (
    <section className="space-y-4">
      <SectionTitle
        title="Vendor selection"
        subtitle="Record each vendor — complete details, attach enquiry, and confirm technical clearance from vendor (YES) to continue"
      />
      <div className="space-y-4">
        {rows.map((row, index) => {
          const attachments = row.attachments || [];
          const technicalAttachments = row.technical_clearance_attachments || [];
          const offerAttachments = row.techno_commercial_offer_attachments || [];
          const technicalYes = row.technical_clearance_from_vendor === true;
          const technicalNo = row.technical_clearance_from_vendor === false;
          return (
            <div key={row.id} className="rounded-xl border border-slate-200 p-5 space-y-4 bg-white">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">Vendor {index + 1}</p>
                {canEdit && rows.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-rose-600 hover:text-rose-700"
                    onClick={() => removeRow(row.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Remove
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className={labelClass}>Vendor name</Label>
                  <Input
                    list={vendorNames.length ? `vendor-names-${row.id}` : undefined}
                    className={inputClass}
                    disabled={!canEdit}
                    value={row.vendor_name || ''}
                    onChange={(e) => updateRow(row.id, { vendor_name: e.target.value })}
                    placeholder="Enter vendor name"
                  />
                  {vendorNames.length > 0 && (
                    <datalist id={`vendor-names-${row.id}`}>
                      {vendorNames.map((name) => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                  )}
                </div>
                <div>
                  <Label className={labelClass}>Date of enquiry sent to vendor</Label>
                  <Input
                    type="date"
                    className={inputClass}
                    disabled={!canEdit}
                    value={row.date || ''}
                    onChange={(e) => updateRow(row.id, { date: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className={labelClass}>Enquiry Details sent to Vendor</Label>
                  <Input
                    className={inputClass}
                    disabled={!canEdit}
                    value={row.enquiry_sent_to_customer || ''}
                    onChange={(e) => updateRow(row.id, { enquiry_sent_to_customer: e.target.value })}
                    placeholder="e.g. Yes, sent on email, pending, etc."
                  />
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100">
                {attachments.length > 0 && (
                  <ul className="mb-3 space-y-1">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 mb-1">
                      Attachments
                    </p>
                    {attachments.map((att) => (
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
                            onClick={() => onRemoveRowAttachment?.(row.id, att.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <CgwMultiFilePicker
                  label="Attachment of customer enquiry sent to vendor"
                  accept={LEAD_ATTACHMENT_ACCEPT}
                  hint={`Supporting documents for this vendor (optional). ${LEAD_ATTACHMENT_HINT}`}
                  disabled={!canEdit || saving}
                  files={[]}
                  onChange={(files) => onUploadRowFiles?.(row.id, files)}
                  existingAttachments={null}
                  addLabel="Attach"
                />
              </div>
              <div className="pt-2 border-t border-slate-100 space-y-4">
                <Label className={labelClass}>Technical clearance from vendor</Label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => updateRow(row.id, { technical_clearance_from_vendor: true })}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border-2 font-semibold text-sm ${
                      technicalYes
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <CheckCircle2 className="h-5 w-5" /> YES
                  </button>
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() =>
                      updateRow(row.id, {
                        technical_clearance_from_vendor: false,
                        technical_clearance_attachments: [],
                      })
                    }
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border-2 font-semibold text-sm ${
                      technicalNo
                        ? 'border-rose-400 bg-rose-50 text-rose-800'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <XCircle className="h-5 w-5" /> NO
                  </button>
                </div>
                {technicalNo && (
                  <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Technical clearance is NO — this vendor will not unlock the next workflow steps. Select YES on
                    another vendor or change to YES to continue.
                  </p>
                )}
                {technicalYes && (
                  <div className="space-y-3">
                    {technicalAttachments.length > 0 && (
                      <ul className="space-y-1">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 mb-1">
                          Technical clearance documents
                        </p>
                        {technicalAttachments.map((att) => (
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
                                onClick={() => onRemoveRowTechnicalAttachment?.(row.id, att.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    <CgwMultiFilePicker
                      label="Attachment of technical clearance data"
                      accept={LEAD_ATTACHMENT_ACCEPT}
                      hint={`Upload technical clearance documents from vendor. ${LEAD_ATTACHMENT_HINT}`}
                      disabled={!canEdit || saving}
                      files={[]}
                      onChange={(files) => onUploadRowTechnicalFiles?.(row.id, files)}
                      existingAttachments={null}
                      addLabel="Attach"
                    />
                  </div>
                )}
              </div>
              <div className="pt-2 border-t border-slate-100 space-y-3">
                {offerAttachments.length > 0 && (
                  <ul className="space-y-1">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 mb-1">
                      Techno commercial offer documents
                    </p>
                    {offerAttachments.map((att) => (
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
                            onClick={() => onRemoveRowOfferAttachment?.(row.id, att.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <CgwMultiFilePicker
                  label="Techno commercial offer from vendor"
                  accept={LEAD_ATTACHMENT_ACCEPT}
                  hint={`Upload techno commercial offer from vendor (optional). ${LEAD_ATTACHMENT_HINT}`}
                  disabled={!canEdit || saving}
                  files={[]}
                  onChange={(files) => onUploadRowOfferFiles?.(row.id, files)}
                  existingAttachments={null}
                  addLabel="Attach"
                />
              </div>
            </div>
          );
        })}
        {canEdit && (
          <Button type="button" variant="outline" size="sm" className="border-slate-300" onClick={addRow}>
            <Plus className="h-4 w-4 mr-1" />
            Add vendor
          </Button>
        )}
      </div>
    </section>
  );
}

function ModuleBom({ payload, setPayload, bomTotals, canEdit, saving, onUploadBomFiles, onRemoveBomAttachment }) {
  const bom = payload.bom || {};
  const bomAttachments = payload.bom_attachments || [];
  const setBom = (patch) => setPayload({ ...payload, bom: { ...bom, ...patch } });

  return (
    <section className="space-y-4">
      <SectionTitle title="BOM & Costing Workspace" subtitle="Consignment total updates as you enter material and cost fields" />
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 border-b border-slate-200">
            <tr>
              <th className="text-left p-2 font-semibold text-slate-700">Material / Services</th>
              {/* <th className="text-left p-2 font-semibold text-slate-700">Max WP</th> */}
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
                {/* <td className="p-2">
                  <Input
                    disabled={!canEdit}
                    value={row.max_wp_rating}
                    onChange={(e) => {
                      const materials = [...bom.materials];
                      materials[idx] = { ...row, max_wp_rating: e.target.value };
                      setBom({ materials });
                    }}
                    className={inputClass}
                  />
                </td> */}
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
      </div>
      {canEdit && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setBom({ materials: [...(bom.materials || []), newMaterialRow()] })}
        >
          <Plus className="h-4 w-4 mr-1" /> Add material row
        </Button>
      )}
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

  const draftTotals = computeOfferTotals(payload.bom, offerDraft.margin_pct);
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
