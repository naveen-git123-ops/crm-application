import React, { useState } from 'react';
import { CheckCircle2, Circle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { INPUT_CLASS, VENDOR_FIELD_GROUPS, fmtDateTime, serviceApi } from '@/lib/serviceUtils';
import { AttachmentPanel } from '@/components/service/AttachmentPanel';
import {
  FieldGrid, FormField, ReadRow, SectionCard,
} from '@/components/service/ServiceFields';

const VENDOR_CATEGORIES = ['Vendor Dispatch Photos/Documents', 'Vendor Repair Report', 'Post-Repair Inspection Photos/Videos', 'Other Supporting Document'];
const YES_NO = [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }];

const triToText = (value) => (value === true ? 'true' : value === false ? 'false' : '');

const POST_FIELDS = [
  { key: 'post_repair_date', label: 'Inspection date', type: 'date', required: true },
  { key: 'post_repair_inspector', label: 'Inspected by', type: 'text' },
  { key: 'post_repair_result', label: 'Test result', type: 'select', required: true },
  { key: 'problem_resolved', label: 'Original problem resolved?', type: 'select' },
  { key: 'ready_for_use', label: 'Ready for customer use?', type: 'select' },
  { key: 'post_repair_tests', label: 'Tests performed and readings', type: 'textarea', wide: true },
  { key: 'new_issues', label: 'New issues found', type: 'textarea', wide: true },
];

function StageProgress({ stages, current, status }) {
  const index = stages.indexOf(current);
  return (
    <ol className="flex flex-wrap gap-1.5 text-[11px]">
      {stages.map((stage, i) => {
        const done = index >= 0 && i < index;
        const active = i === index;
        return (
          <li
            key={stage}
            className={`flex items-center gap-1 rounded-full border px-2 py-1 ${active ? (status === 'Open' ? 'border-indigo-300 bg-indigo-50 font-semibold text-indigo-800' : 'border-slate-300 bg-slate-100 font-semibold text-slate-700') : done ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-500'}`}
          >
            {done ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
            {stage}
          </li>
        );
      })}
    </ol>
  );
}

function StartDialog({ ctx, open, onClose }) {
  const { detail, lookups, run } = ctx;
  const [vendorId, setVendorId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      await run(() => serviceApi.post(`/service-requests/${detail.service.id}/vendor-repairs`, { vendor_id: vendorId, reason }), 'Vendor repair started');
      setVendorId('');
      setReason('');
      onClose();
    } catch {
      /* shown by run() */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value && !busy) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Send for vendor repair</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600" htmlFor="svc-vendor-pick">Vendor <span className="text-rose-600">*</span></label>
            <select id="svc-vendor-pick" className={INPUT_CLASS} value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
              <option value="">Select vendor…</option>
              {lookups.vendors.map((v) => <option key={v.id} value={v.id}>{v.company_name}</option>)}
            </select>
            {lookups.vendors.length === 0 && <p className="text-xs text-amber-700">No vendors found. Add a vendor ledger first.</p>}
          </div>
          <FormField field={{ key: 'start-reason', label: 'Reason for vendor repair', type: 'textarea', wide: true }} value={reason} onChange={setReason} />
          <p className="text-xs text-slate-500">The fault description and findings are copied from the latest troubleshooting entry. You can edit them afterwards.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={start} disabled={busy || !vendorId}>{busy ? 'Starting…' : 'Start vendor repair'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RepairCard({ ctx, rep }) {
  const { detail, meta, lookups, run, ask, canWork, locked, reload } = ctx;
  const open = rep.status === 'Open';
  const editable = canWork && !locked && open;
  const [form, setForm] = useState(() => ({ ...rep }));
  const [vendorId, setVendorId] = useState('');
  const [post, setPost] = useState(() => ({
    ...rep, problem_resolved: triToText(rep.problem_resolved), ready_for_use: triToText(rep.ready_for_use),
  }));
  const [busy, setBusy] = useState('');
  const base = `/service-requests/${detail.service.id}/vendor-repairs/${rep.id}`;
  const showPost = rep.stage === 'Returned from Vendor' || rep.stage === 'Post-Repair Inspection' || rep.post_repair_result;
  const failed = rep.post_repair_result === 'Failed';

  const act = async (key, call, success) => {
    setBusy(key);
    try {
      await run(call, success);
    } catch {
      /* shown by run() */
    } finally {
      setBusy('');
    }
  };

  const saveDetails = () => {
    const body = {};
    VENDOR_FIELD_GROUPS.forEach((group) => group.fields.forEach((f) => { body[f.key] = form[f.key] ?? ''; }));
    if (vendorId) body.vendor_id = vendorId;
    return act('save', () => serviceApi.put(base, body), 'Vendor repair saved');
  };
  const savePost = () => act('post', () => serviceApi.post(`${base}/post-repair`, post), 'Post-repair inspection saved');
  const advance = (stage) => ask({
    title: `Move to "${stage}"`,
    description: 'Add a note for the stage log (optional).',
    confirmLabel: 'Move',
    required: false,
    run: (note) => run(() => serviceApi.post(`${base}/stage`, { stage, note }), `Moved to ${stage}`),
  });
  const sendBack = () => ask({
    title: 'Send back to vendor',
    description: 'The repair restarts as a new cycle. The failed inspection stays in the log.',
    confirmLabel: 'Send back',
    run: (reason) => run(() => serviceApi.post(`${base}/send-back`, { reason }), 'Sent back to vendor'),
  });
  const cancel = () => ask({
    title: 'Cancel vendor repair',
    confirmLabel: 'Cancel vendor repair',
    run: (reason) => run(() => serviceApi.post(`${base}/cancel`, { reason }), 'Vendor repair cancelled'),
  });

  const setF = (key) => (value) => setForm((p) => ({ ...p, [key]: value }));
  const setP = (key) => (value) => setPost((p) => ({ ...p, [key]: value }));

  return (
    <SectionCard
      title={`${rep.repair_code} · ${rep.vendor_name || 'Vendor not selected'}${rep.cycle > 1 ? ` · cycle ${rep.cycle}` : ''}`}
      description={`Status: ${rep.status}`}
      actions={editable && detail.caps.coordinate && <Button variant="outline" size="sm" onClick={cancel}>Cancel vendor repair</Button>}
    >
      <div className="space-y-4">
        <StageProgress stages={rep.stages} current={rep.stage} status={rep.status} />

        {editable && rep.next_stages.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">Next stage:</span>
            {rep.next_stages.map((stage) => <Button key={stage} size="sm" onClick={() => advance(stage)}>{stage}</Button>)}
          </div>
        )}
        {open && !rep.post_repair_result && rep.stage !== 'Returned from Vendor' && rep.stage !== 'Post-Repair Inspection' && (
          <p className="text-xs text-slate-500">Vendor completion does not close the request. After the product returns, a post-repair inspection by our team is mandatory.</p>
        )}

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Vendor</h4>
          <FieldGrid>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600" htmlFor={`svc-vendor-${rep.id}`}>Vendor</label>
              <select id={`svc-vendor-${rep.id}`} className={INPUT_CLASS} disabled={!editable} value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                <option value="">{rep.vendor_name || 'Select…'}</option>
                {lookups.vendors.map((v) => <option key={v.id} value={v.id}>{v.company_name}</option>)}
              </select>
            </div>
            <ReadRow label="Contact">{[rep.vendor_contact_person, rep.vendor_contact_details].filter(Boolean).join(' · ')}</ReadRow>
          </FieldGrid>
        </div>

        {VENDOR_FIELD_GROUPS.map((group) => (
          <div key={group.title}>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{group.title}</h4>
            <FieldGrid>
              {group.fields.map((field) => (
                <FormField key={field.key} field={{ ...field, key: `${field.key}-${rep.id}` }} disabled={!editable} value={form[field.key]} onChange={setF(field.key)} />
              ))}
            </FieldGrid>
          </div>
        ))}
        {editable && (
          <div className="flex justify-end">
            <Button onClick={saveDetails} disabled={Boolean(busy)}>{busy === 'save' ? 'Saving…' : 'Save vendor details'}</Button>
          </div>
        )}

        {showPost && (
          <div className="rounded-lg border border-slate-200 p-3">
            <h4 className="mb-2 text-sm font-semibold text-slate-900">Post-repair inspection</h4>
            <p className="mb-2 text-xs text-slate-500">Mandatory before the service can be completed. Upload inspection photos or videos below.</p>
            <FieldGrid>
              {POST_FIELDS.map((field) => (
                <FormField
                  key={field.key}
                  field={{ ...field, key: `${field.key}-${rep.id}` }}
                  options={field.key === 'post_repair_result' ? meta.post_repair_results : field.type === 'select' ? YES_NO : undefined}
                  disabled={!editable}
                  value={post[field.key]}
                  onChange={setP(field.key)}
                />
              ))}
            </FieldGrid>
            {editable && (
              <div className="mt-3 flex justify-end">
                <Button onClick={savePost} disabled={Boolean(busy)}>{busy === 'post' ? 'Saving…' : 'Save post-repair inspection'}</Button>
              </div>
            )}
            {failed && open && (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                The post-repair inspection failed, so the request is back In Progress. Add a troubleshooting entry on the Inspection tab,
                or send the product back to the vendor.
                {editable && <div className="mt-2"><Button size="sm" variant="destructive" onClick={sendBack}>Send back to vendor</Button></div>}
              </div>
            )}
          </div>
        )}

        <AttachmentPanel
          title="Vendor dispatch, repair report and post-repair files"
          serviceId={detail.service.id}
          attachments={detail.attachments}
          categories={VENDOR_CATEGORIES}
          limits={meta.attachment_limits}
          canEdit={editable}
          canRemove={editable}
          locked={locked}
          askReason={ask}
          vendorRepairId={rep.id}
          defaultCategory="Vendor Dispatch Photos/Documents"
          onChanged={reload}
        />

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Stage log</h4>
          <ol className="space-y-1 text-xs text-slate-700">
            {[...(rep.stage_log || [])].reverse().map((entry, i) => (
              <li key={`${entry.at}-${i}`} className="flex flex-wrap gap-2">
                <span className="font-medium">{entry.stage}</span>
                <span className="text-slate-500">{fmtDateTime(entry.at)} · {entry.by}</span>
                {entry.note && <span className="italic">{entry.note}</span>}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </SectionCard>
  );
}

export function VendorTab({ ctx }) {
  const { detail, canWork, locked } = ctx;
  const [startOpen, setStartOpen] = useState(false);
  const repairs = [...detail.vendor_repairs].reverse();
  const hasOpen = repairs.some((r) => r.status === 'Open');
  const canStart = canWork && !locked && !hasOpen && detail.service.status !== 'Draft';

  return (
    <div className="space-y-4">
      <SectionCard
        title="Vendor repair"
        description="Use when the product cannot be repaired on site. The request stays open until our own post-repair inspection passes."
        actions={canStart && <Button size="sm" onClick={() => setStartOpen(true)}><Plus className="mr-1 h-4 w-4" />Send for vendor repair</Button>}
      >
        {repairs.length === 0 && <p className="text-sm text-slate-500">No vendor repair has been started for this request.</p>}
      </SectionCard>
      {repairs.map((rep) => (
        <RepairCard
          key={`${rep.id}-${rep.stage}-${rep.cycle}-${rep.status}-${rep.post_repair_result || ''}-${(rep.stage_log || []).length}`}
          ctx={ctx}
          rep={rep}
        />
      ))}
      <StartDialog ctx={ctx} open={startOpen} onClose={() => setStartOpen(false)} />
    </div>
  );
}
