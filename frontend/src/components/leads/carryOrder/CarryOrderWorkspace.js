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
  mergeWorkflowPayload,
  computeBomTotals,
  formatInr,
  newMaterialRow,
  newOfferRow,
  newFollowUpRow,
  pipelineStageIndex,
  resolvedPipelineIndex,
  isPipelineStageUnlocked,
  nextPipelineStageId,
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
  Upload,
  Loader2,
  Lock,
  Check,
} from 'lucide-react';
import { isCarryAndOrder, leadNeedsVendor } from '@/lib/leadUtils';
import { getApiErrorMessage } from '@/lib/apiErrors';

const inputClass = 'h-9 rounded-lg border-slate-200 text-sm';
const selectClass =
  'h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800';
const labelClass = 'text-xs font-semibold text-slate-600 uppercase tracking-wide';

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

  const saveWorkflow = async (nextStage, nextPayload, comment) => {
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
      toast.success(comment === 'Progress saved' ? 'Progress saved' : 'Step completed');
      if (data?.id) onRefresh?.(data.id);
      else onRefresh?.(lead.id);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  const uploadOfferFile = async (file, offerId) => {
    const fd = new FormData();
    fd.append('file', file);
    const { data } = await axios.post(`${apiBase}/leads/${lead.id}/attachments`, fd, {
      headers: { ...authHeader(), 'Content-Type': 'multipart/form-data' },
    });
    setPayload((p) => ({
      ...p,
      offers: p.offers.map((o) =>
        o.id === offerId
          ? { ...o, attachment_url: data.file_url, attachment_name: data.file_name || file.name }
          : o,
      ),
    }));
    toast.success('Offer file attached');
  };

  const stageCtx = { isCarryAndOrder, leadNeedsVendor };
  const pipelineMaxIdx = resolvedPipelineIndex(stage);
  const isClosed = WORKFLOW_TERMINAL_IDS.includes(stage);

  const canOpenStage = (stageId) => isPipelineStageUnlocked(stageId, stage);

  const canEditStep = (tabId) =>
    canEdit
    && !isClosed
    && canOpenStage(tabId)
    && pipelineStageIndex(tabId) <= pipelineMaxIdx;

  const handleTabSelect = (stageId) => {
    if (!canOpenStage(stageId)) {
      const blocked = CARRY_ORDER_STAGES.find((s) => s.id === stageId);
      const need = nextPipelineStageId(stage);
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
    saveWorkflow(stage, payload, 'Progress saved');
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
    let comment;
    if (next === 'bom_costing' && payload.technical_approved === true) {
      comment = 'Technical strategy approved — proceeding to BOM';
    }
    if (next === 'bom_costing' && payload.technical_approved === false) {
      comment = 'OTX commercial override — proceeding to BOM';
    }
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
    <div className="flex flex-col h-full min-h-[480px] bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {vendorPending && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-3 bg-amber-50 border-b border-amber-200 text-amber-950">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Setup pending — vendor not assigned</p>
            <p className="text-xs text-amber-800 mt-0.5">
              This lead is saved. Assign a vendor below to unlock technical clearance and later stages.
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
      {/* Header */}
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

      <WorkflowStepper
        stage={stage}
        activeTab={activeTab}
        onSelect={handleTabSelect}
        canOpenStage={canOpenStage}
      />

      {!canOpenStage(activeTab) && (
        <div className="mx-5 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Lock className="h-4 w-4 inline mr-2 -mt-0.5" />
          Complete the current step in order to unlock this section.
        </div>
      )}

      {/* Module content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {canOpenStage(activeTab) && activeTab === 'enquiry_logged' && (
          <ModuleEnquiry lead={lead} attachments={attachments} payload={payload} setPayload={setPayload} canEdit={editActive} />
        )}
        {canOpenStage(activeTab) && activeTab === 'technical_clearance' && (
          <ModuleTechnical payload={payload} setPayload={setPayload} canEdit={editActive} />
        )}
        {canOpenStage(activeTab) && activeTab === 'bom_costing' && (
          <ModuleBom payload={payload} setPayload={setPayload} bomTotals={bomTotals} canEdit={editActive} />
        )}
        {canOpenStage(activeTab) && (activeTab === 'offer_revision' || activeTab === 'follow_up') && (
          <ModuleOfferFollowUp
            payload={payload}
            setPayload={setPayload}
            canEdit={editActive}
            onUploadOffer={uploadOfferFile}
            showFollowUps={activeTab === 'follow_up'}
          />
        )}
        {canOpenStage(activeTab) && activeTab === 'closed_won' && (
          <ModuleClosedWon payload={payload} setPayload={setPayload} bomTotals={bomTotals} canEdit={editActive && !isClosed} />
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
            onClick={() => saveWorkflow(activeTab, payload, `Pipeline closed: ${activeTab}`)}
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
      <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/50 space-y-3">
        <div>
          <Label className={labelClass}>Enquiry details</Label>
          <p className="text-sm text-slate-800 mt-1 whitespace-pre-wrap">{lead.notes || '—'}</p>
        </div>
        <div>
          <Label className={labelClass}>Customer enquiry attachments</Label>
          {attachments.length === 0 ? (
            <p className="text-sm text-slate-500 mt-1">No files — attach when creating the lead</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {attachments.map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-sm text-indigo-700">
                  <FileText className="h-4 w-4" />
                  {a.file_name}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className={labelClass}>Sales owner</Label>
            <p className="text-sm font-medium mt-1">{lead.assigned_to_name || lead.created_by_name || '—'}</p>
          </div>
          <div>
            <Label className={labelClass}>Enquiry date</Label>
            <p className="text-sm font-medium mt-1">{lead.enquiry_date || '—'}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className={labelClass}>OTX validity from</Label>
            <Input
              type="date"
              className={inputClass}
              disabled={!canEdit}
              value={payload.otx_date_from || ''}
              onChange={(e) => setPayload({ ...payload, otx_date_from: e.target.value })}
            />
          </div>
          <div>
            <Label className={labelClass}>OTX validity to</Label>
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

function ModuleTechnical({ payload, setPayload, canEdit }) {
  return (
    <section className="space-y-4">
      <SectionTitle
        title="Technical clearance gateway"
        subtitle="Mandatory filter before BOM costing — per PRD routing rules"
      />
      <div className="rounded-xl border border-slate-200 p-5 space-y-4">
        <Label className={labelClass}>Customer strategy approve technical?</Label>
        <div className="flex gap-3">
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => setPayload({ ...payload, technical_approved: true })}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border-2 font-semibold text-sm ${
              payload.technical_approved === true
                ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                : 'border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            <CheckCircle2 className="h-5 w-5" /> YES
          </button>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => setPayload({ ...payload, technical_approved: false })}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border-2 font-semibold text-sm ${
              payload.technical_approved === false
                ? 'border-rose-400 bg-rose-50 text-rose-800'
                : 'border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            <XCircle className="h-5 w-5" /> NO
          </button>
        </div>
        {payload.technical_approved === false && (
          <div>
            <Label className={labelClass}>Commercial OTX override comment *</Label>
            <textarea
              rows={3}
              disabled={!canEdit}
              value={payload.commercial_otx_comment || ''}
              onChange={(e) => setPayload({ ...payload, commercial_otx_comment: e.target.value })}
              placeholder="Mandatory when technical approval is NO"
              className="w-full mt-1 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-sm"
            />
          </div>
        )}
      </div>
    </section>
  );
}

function ModuleBom({ payload, setPayload, bomTotals, canEdit }) {
  const bom = payload.bom || {};
  const setBom = (patch) => setPayload({ ...payload, bom: { ...bom, ...patch } });

  return (
    <section className="space-y-4">
      <SectionTitle title="BOM & costing workspace" subtitle="TPC = Σ material costs; totals update in real time" />
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 border-b border-slate-200">
            <tr>
              <th className="text-left p-2 font-semibold text-slate-700">Material / model</th>
              <th className="text-left p-2 font-semibold text-slate-700">Max WP</th>
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
                    disabled={!canEdit}
                    value={row.max_wp_rating}
                    onChange={(e) => {
                      const materials = [...bom.materials];
                      materials[idx] = { ...row, max_wp_rating: e.target.value };
                      setBom({ materials });
                    }}
                    className={inputClass}
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
        <NumField label="Installation, commissioning & amenity (₹)" value={bom.install_cost} onChange={(v) => setBom({ install_cost: v })} canEdit={canEdit} />
        <NumField label="Testing, training & TPI (₹)" value={bom.testing_cost} onChange={(v) => setBom({ testing_cost: v })} canEdit={canEdit} />
        <NumField label="Packaging (₹)" value={bom.packaging_cost} onChange={(v) => setBom({ packaging_cost: v })} canEdit={canEdit} />
        <div>
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
        </div>
        <NumField label="Transportation cost (₹)" value={bom.transport_cost} onChange={(v) => setBom({ transport_cost: v })} canEdit={canEdit} />
        <NumField label="Cost of AP — approved base (₹)" value={bom.cost_of_ap} onChange={(v) => setBom({ cost_of_ap: v })} canEdit={canEdit} />
        <NumField label="Desired margin (₹)" value={bom.margin_amount} onChange={(v) => setBom({ margin_amount: v })} canEdit={canEdit} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <TotalCard label="TPC aggregation" value={formatInr(bomTotals.tpc)} />
        <TotalCard label="Total cost to customer" value={formatInr(bomTotals.totalCost)} highlight />
        <TotalCard label="Cost of AP" value={formatInr(bom.cost_of_ap)} />
        <TotalCard label="Final selling value" value={formatInr(bomTotals.sellingValue)} accent />
      </div>
    </section>
  );
}

function ModuleOfferFollowUp({ payload, setPayload, canEdit, onUploadOffer, showFollowUps }) {
  const offers = payload.offers || [];
  const followUps = payload.follow_ups || [];

  return (
    <section className="space-y-6">
      <SectionTitle title="Techno-commercial offer tracking" subtitle="Revision index auto-increments per offer row" />
      {offers.map((offer, idx) => (
        <div key={offer.id} className="rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className={labelClass}>Techno-commercial offer #</Label>
              <Input
                disabled={!canEdit}
                value={offer.offer_no}
                onChange={(e) => {
                  const next = [...offers];
                  next[idx] = { ...offer, offer_no: e.target.value };
                  setPayload({ ...payload, offers: next });
                }}
                className={inputClass}
                placeholder="TCO-2026-089A"
              />
            </div>
            <div>
              <Label className={labelClass}>Revision #</Label>
              <Input
                type="number"
                min="1"
                disabled={!canEdit}
                value={offer.revision_index}
                onChange={(e) => {
                  const next = [...offers];
                  next[idx] = { ...offer, revision_index: parseInt(e.target.value, 10) || 1 };
                  setPayload({ ...payload, offers: next });
                }}
                className={inputClass}
              />
            </div>
            <div className="flex items-end">
              {canEdit && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-rose-600"
                  onClick={() => setPayload({ ...payload, offers: offers.filter((_, i) => i !== idx) })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          <div>
            <Label className={labelClass}>Change / modification</Label>
            <Input
              disabled={!canEdit}
              value={offer.change_description}
              onChange={(e) => {
                const next = [...offers];
                next[idx] = { ...offer, change_description: e.target.value };
                setPayload({ ...payload, offers: next });
              }}
              className={inputClass}
            />
          </div>
          <div>
            <Label className={labelClass}>Outbound offer attachment</Label>
            {offer.attachment_name && <p className="text-xs text-emerald-700 mb-1">{offer.attachment_name}</p>}
            {canEdit && (
              <Input
                type="file"
                className={inputClass}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUploadOffer(f, offer.id);
                }}
              />
            )}
          </div>
        </div>
      ))}
      {canEdit && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const rev = offers.length + 1;
            setPayload({ ...payload, offers: [...offers, { ...newOfferRow(), revision_index: rev }] });
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> Add offer revision
        </Button>
      )}

      {showFollowUps && (
        <>
          <SectionTitle title="Follow-up log" subtitle="Negotiation history & next actions" />
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-2 text-left">#</th>
                  <th className="p-2 text-left">Date</th>
                  <th className="p-2 text-left">Notes</th>
                  <th className="p-2 text-left">Next date</th>
                  <th className="p-2 text-left">Status</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {followUps.map((fu, idx) => (
                  <tr key={fu.id} className="border-t border-slate-100">
                    <td className="p-2 text-slate-500">F{idx + 1}</td>
                    <td className="p-2">
                      <Input type="date" disabled={!canEdit} value={fu.follow_up_date} className={inputClass}
                        onChange={(e) => {
                          const next = [...followUps];
                          next[idx] = { ...fu, follow_up_date: e.target.value };
                          setPayload({ ...payload, follow_ups: next });
                        }} />
                    </td>
                    <td className="p-2">
                      <Input disabled={!canEdit} value={fu.notes} className={inputClass}
                        onChange={(e) => {
                          const next = [...followUps];
                          next[idx] = { ...fu, notes: e.target.value };
                          setPayload({ ...payload, follow_ups: next });
                        }} />
                    </td>
                    <td className="p-2">
                      <Input type="date" disabled={!canEdit} value={fu.next_date} className={inputClass}
                        onChange={(e) => {
                          const next = [...followUps];
                          next[idx] = { ...fu, next_date: e.target.value };
                          setPayload({ ...payload, follow_ups: next });
                        }} />
                    </td>
                    <td className="p-2">
                      <select disabled={!canEdit} value={fu.status} className={selectClass}
                        onChange={(e) => {
                          const next = [...followUps];
                          next[idx] = { ...fu, status: e.target.value };
                          setPayload({ ...payload, follow_ups: next });
                        }}>
                        <option>Pending</option>
                        <option>Done</option>
                      </select>
                    </td>
                    <td className="p-2">
                      {canEdit && (
                        <button type="button" onClick={() => setPayload({ ...payload, follow_ups: followUps.filter((_, i) => i !== idx) })}>
                          <Trash2 className="h-4 w-4 text-rose-500" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setPayload({ ...payload, follow_ups: [...followUps, newFollowUpRow()] })}>
              <Plus className="h-4 w-4 mr-1" /> Add follow-up
            </Button>
          )}
        </>
      )}
    </section>
  );
}

function ModuleClosedWon({ payload, setPayload, bomTotals, canEdit }) {
  const cw = payload.closed_won || {};
  const setCw = (patch) => setPayload({ ...payload, closed_won: { ...cw, ...patch } });

  return (
    <section className="space-y-4">
      <SectionTitle title="Closed won — order execution" subtitle="All contract parameters required before confirm" />
      <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/30 p-5 space-y-3">
        <NumField
          label="Order value target (₹) *"
          value={cw.order_value ?? bomTotals.sellingValue}
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

function WorkflowStepper({ stage, activeTab, onSelect, canOpenStage }) {
  const maxIdx = resolvedPipelineIndex(stage);
  const terminalUnlocked = canOpenStage('closed_won');

  const pipelineSteps = WORKFLOW_PIPELINE_IDS.map((id) => CARRY_ORDER_STAGES.find((s) => s.id === id));
  const terminalSteps = WORKFLOW_TERMINAL_IDS.map((id) => CARRY_ORDER_STAGES.find((s) => s.id === id));

  const stepButtonClass = (stepId, variant) => {
    const unlocked = canOpenStage(stepId);
    const idx = pipelineStageIndex(stepId);
    const isActive = activeTab === stepId;
    const isDone = idx >= 0 && idx < maxIdx;
    const isCurrent = stage === stepId;

    if (!unlocked) {
      return 'flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed';
    }
    if (variant === 'won' && isActive) {
      return 'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white shadow-sm';
    }
    if (variant === 'lost' && isActive) {
      return 'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-rose-600 text-white shadow-sm';
    }
    if (isActive) {
      return 'flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-200';
    }
    if (isDone) {
      return 'flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100';
    }
    if (isCurrent) {
      return 'flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-800 border border-indigo-300';
    }
    return 'flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold bg-white text-slate-700 border border-slate-200 hover:border-indigo-200';
  };

  return (
    <div className="px-4 py-4 border-b border-slate-100 bg-slate-50/80 overflow-x-auto">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-3">
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
                  <Lock className="h-3.5 w-3.5 shrink-0" />
                ) : pipelineStageIndex(s.id) < maxIdx ? (
                  <Check className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <span className="text-[10px] font-bold opacity-80">{s.short}</span>
                )}
                <span className="whitespace-nowrap">{s.label}</span>
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
              {!unlocked && <Lock className="h-3.5 w-3.5 shrink-0" />}
              {s.label}
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

function TotalCard({ label, value, highlight, accent }) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        accent ? 'border-indigo-200 bg-indigo-50' : highlight ? 'border-slate-300 bg-slate-50' : 'border-slate-200 bg-white'
      }`}
    >
      <p className="text-[10px] font-semibold uppercase text-slate-500">{label}</p>
      <p className={`text-lg font-bold mt-1 tabular-nums ${accent ? 'text-indigo-800' : 'text-slate-900'}`}>{value}</p>
    </div>
  );
}
