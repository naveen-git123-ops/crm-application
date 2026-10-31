import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, Pencil, Plus, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { getApiErrorMessage } from '@/lib/apiErrors';
import {
  EVIDENCE_CATEGORIES, INPUT_CLASS, INSTALLATION_PRODUCT_CATEGORIES, SITE_VISIT_ACK_CATEGORY, TAB_SECTIONS,
  fmtDate, fmtDateTime, serviceApi, serviceTypesForCustomer, uid, workflowsForServiceTypes,
} from '@/lib/serviceUtils';
import {
  BlockerList, FieldGrid, FormField, MultiPicker, PriorityBadge, ReadRow, SectionCard, StatusBadge,
} from '@/components/service/ServiceFields';
import { AttachmentPanel } from '@/components/service/AttachmentPanel';
import { SectionForm, TroubleshootingForm } from '@/components/service/SectionForm';

function errorText(err, fallback) {
  const detail = err?.response?.data?.detail;
  return Array.isArray(detail) ? detail.join('; ') : getApiErrorMessage(err, fallback);
}

/** Shows which mandatory photo/video categories already have files. */
export function EvidenceChecklist({ detail }) {
  const required = detail.config?.mandatory_evidence?.[detail.service.workflow] || [];
  if (required.length === 0) return null;
  const present = new Set(detail.attachments.map((a) => a.category));
  return (
    <SectionCard title="Mandatory photos and videos" description="The request cannot be completed until each of these has at least one file.">
      <ul className="space-y-1 text-sm">
        {required.map((category) => (
          <li key={category} className="flex items-center gap-2">
            {present.has(category) ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-amber-500" />}
            <span className={present.has(category) ? 'text-foreground' : 'text-amber-800'}>{category}</span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

// --- Overview ---------------------------------------------------------------------

function EditDetailsDialog({ ctx, open, onClose }) {
  const { detail, run, withLock } = ctx;
  const s = detail.service;
  const config = detail.config;
  const fields = useMemo(() => {
    const typeOptions = serviceTypesForCustomer(s.customer_type, ctx.meta);
    const base = [
      { key: 'priority', label: 'Priority', type: 'select', options: ctx.meta.priorities },
      { key: 'contact_person', label: 'Contact person', type: 'text', required: true },
      { key: 'mobile', label: 'Mobile', type: 'text', required: true },
      { key: 'email', label: 'Email', type: 'text' },
      { key: 'pincode', label: 'PIN code', type: 'text' },
      { key: 'site_address', label: 'Site address', type: 'textarea', wide: true, required: true },
      { key: 'city', label: 'City', type: 'text' },
      { key: 'state', label: 'State', type: 'text' },
      { key: 'planned_date', label: 'Planned date', type: 'date' },
      { key: 'expected_visit_date', label: 'Expected visit date', type: 'date' },
      { key: 'expected_completion', label: 'Expected completion', type: 'date' },
      { key: 'problem_description', label: 'Problem reported on the call', type: 'textarea', wide: true },
    ];
    if (s.status === 'Draft' || !s.service_type) {
      base.unshift({ key: 'service_type', label: 'Service type', type: 'select', required: true, options: typeOptions });
    }
    if (s.workflow === 'installation') {
      base.push(
        { key: 'product_category', label: 'Product category', type: 'text' },
        { key: 'product_name', label: 'Product name', type: 'text' },
        { key: 'product_model', label: 'Model', type: 'text' },
        { key: 'serial_number', label: 'Serial number', type: 'text' },
        { key: 'quantity', label: 'Quantity', type: 'number' },
        { key: 'installation_requirements', label: 'Special requirements', type: 'textarea', wide: true },
      );
    }
    if (s.workflow === 'repair') {
      base.push(
        { key: 'problem_category', label: 'Problem category', type: 'select', options: config.problem_categories },
        { key: 'reported_date', label: 'Reported date', type: 'date' },
        { key: 'reported_by', label: 'Reported by', type: 'text' },
      );
    }
    base.push(
      { key: 'customer_notes', label: 'Customer notes', type: 'textarea', wide: true },
      { key: 'remarks', label: 'Remarks', type: 'textarea', wide: true },
    );
    return base;
  }, [s.workflow, s.customer_type, s.status, s.service_type, config, ctx.meta]);

  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm(Object.fromEntries(fields.map((f) => [f.key, s[f.key] ?? ''])));
      setError('');
    }
  }, [open, fields, s]);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const done = await withLock('Reason for editing a locked request', (reason) => run(
        () => serviceApi.put(`/service-requests/${detail.service.id}`, { ...form, reason }),
        'Details updated',
      ));
      if (done) onClose();
    } catch (err) {
      setError(errorText(err, 'Could not save'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value && !busy) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>Edit request details</DialogTitle></DialogHeader>
        {error && <p className="rounded bg-rose-50 p-2 text-sm text-rose-800" role="alert">{error}</p>}
        <FieldGrid>
          {fields.map((field) => (
            <FormField key={field.key} field={field} options={field.options} value={form[field.key]} onChange={(v) => setForm((p) => ({ ...p, [field.key]: v }))} />
          ))}
        </FieldGrid>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignmentCard({ ctx }) {
  const { detail, lookups, run } = ctx;
  const s = detail.service;
  const [employeeId, setEmployeeId] = useState(s.assigned_employee_id || '');
  const [engineerId, setEngineerId] = useState(s.engineer_employee_id || '');
  const [schedule, setSchedule] = useState({
    planned_date: s.planned_date || '', planned_start_time: s.planned_start_time || '',
    expected_duration: s.expected_duration || '', expected_visit_date: s.expected_visit_date || '',
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEmployeeId(s.assigned_employee_id || '');
    setEngineerId(s.engineer_employee_id || '');
  }, [s.assigned_employee_id, s.engineer_employee_id]);

  const assign = async () => {
    setBusy(true);
    try {
      await run(() => serviceApi.post(`/service-requests/${s.id}/assign`, {
        employee_id: employeeId, engineer_employee_id: engineerId, schedule,
      }), 'Technician assigned');
    } catch {
      /* shown by run() */
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard title="Technician and schedule" description={s.assigned_name ? `Currently assigned to ${s.assigned_name}` : 'No technician assigned yet'}>
      <FieldGrid>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="svc-assign-tech">Technician</label>
          <select id="svc-assign-tech" className={INPUT_CLASS} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">Select technician…</option>
            {lookups.employees.map((e) => <option key={e.employee_id} value={e.employee_id}>{e.name}{e.job_role ? ` — ${e.job_role}` : ''}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="svc-assign-eng">Engineer (optional)</label>
          <select id="svc-assign-eng" className={INPUT_CLASS} value={engineerId} onChange={(e) => setEngineerId(e.target.value)}>
            <option value="">None</option>
            {lookups.employees.map((e) => <option key={e.employee_id} value={e.employee_id}>{e.name}</option>)}
          </select>
        </div>
        <FormField field={{ key: 'sched-date', label: 'Planned date', type: 'date' }} value={schedule.planned_date} onChange={(v) => setSchedule((p) => ({ ...p, planned_date: v }))} />
        <FormField field={{ key: 'sched-time', label: 'Planned start time', type: 'text', placeholder: 'e.g. 10:30' }} value={schedule.planned_start_time} onChange={(v) => setSchedule((p) => ({ ...p, planned_start_time: v }))} />
        <FormField field={{ key: 'sched-visit', label: 'Expected visit date', type: 'date' }} value={schedule.expected_visit_date} onChange={(v) => setSchedule((p) => ({ ...p, expected_visit_date: v }))} />
        <FormField field={{ key: 'sched-dur', label: 'Expected duration', type: 'text', placeholder: 'e.g. 4 hours' }} value={schedule.expected_duration} onChange={(v) => setSchedule((p) => ({ ...p, expected_duration: v }))} />
      </FieldGrid>
      <div className="mt-3 flex justify-end">
        <Button onClick={assign} disabled={busy || !employeeId}>
          <UserCheck className="mr-1 h-4 w-4" />{busy ? 'Saving…' : s.assigned_employee_id ? 'Reassign / update schedule' : 'Assign technician'}
        </Button>
      </div>
    </SectionCard>
  );
}

function CommentsCard({ ctx }) {
  const { detail, saveSection, canWork } = ctx;
  const entries = detail.data?.comments?.entries || [];
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    const note = text.trim();
    if (!note) return;
    setBusy(true);
    try {
      await saveSection('comments', {
        entries: [...entries, {
          id: uid(),
          text: note,
          author: detail.caps?.coordinate ? 'Coordinator' : 'Technician',
          at: new Date().toISOString(),
        }],
      });
      setText('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard title="Comments and customer notes" description="Keep the customer notes and a running comment log until the ticket is resolved. Attachments go on the Files tab.">
      {detail.service.customer_notes && (
        <div className="mb-3">
          <ReadRow label="Customer notes">{detail.service.customer_notes}</ReadRow>
        </div>
      )}
      <ul className="space-y-2">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded-lg border border-border p-2 text-sm">
            <div className="text-xs text-muted-foreground">{entry.author || 'Team'} · {fmtDateTime(entry.at)}</div>
            <p className="whitespace-pre-wrap text-foreground">{entry.text}</p>
          </li>
        ))}
        {entries.length === 0 && <li className="text-sm text-muted-foreground">No comments yet.</li>}
      </ul>
      {canWork && (
        <div className="mt-3 space-y-2">
          <FormField field={{ key: 'ticket-comment', label: 'Add a comment', type: 'textarea', wide: true }} value={text} onChange={setText} />
          <div className="flex justify-end">
            <Button onClick={add} disabled={busy || !text.trim()}>{busy ? 'Saving…' : 'Add comment'}</Button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function InstallationJobCard({ ctx }) {
  const { detail, lookups, saveSection, canWork } = ctx;
  const s = detail.service;
  const proc = detail.data?.procurement || {};
  const [form, setForm] = useState({
    product_available: proc.product_available,
    vendor_id: proc.vendor_id || '',
    vendor_name: proc.vendor_name || '',
    quote_amount: proc.quote_amount || '',
    currency: proc.currency || 'INR',
    delivery_date: proc.delivery_date || '',
    notes: proc.notes || '',
    product_received: Boolean(proc.product_received),
  });
  const [busy, setBusy] = useState(false);
  const vendors = lookups?.vendors || [];
  const assigned = Boolean(s.assigned_employee_id);

  useEffect(() => {
    setForm({
      product_available: proc.product_available,
      vendor_id: proc.vendor_id || '',
      vendor_name: proc.vendor_name || '',
      quote_amount: proc.quote_amount || '',
      currency: proc.currency || 'INR',
      delivery_date: proc.delivery_date || '',
      notes: proc.notes || '',
      product_received: Boolean(proc.product_received),
    });
  }, [proc.product_available, proc.vendor_id, proc.quote_amount, proc.delivery_date, proc.notes, proc.product_received, proc.vendor_name]);

  const setAvailable = (value) => setForm((prev) => ({ ...prev, product_available: value }));

  const save = async (extra = {}) => {
    setBusy(true);
    try {
      const vendor = vendors.find((item) => item.id === form.vendor_id);
      await saveSection('procurement', {
        ...form,
        ...extra,
        vendor_name: vendor?.company_name || form.vendor_name,
      });
    } finally {
      setBusy(false);
    }
  };

  if (s.workflow !== 'installation') return null;

  const insp = detail.data?.inspection || {};
  const ex = detail.data?.execution || {};
  const com = detail.data?.commissioning || {};
  const vendorPath = form.product_available === false;
  const installDone = ex.status === 'Completed' && com.status === 'Successful';
  const steps = [
    { label: 'Assign technician', done: assigned },
    { label: 'Product available?', done: form.product_available != null },
    ...(vendorPath
      ? [
        { label: 'Vendor and pricing', done: Boolean(form.vendor_id && form.quote_amount) },
        { label: 'Product received', done: form.product_received },
      ]
      : [{ label: 'Site visit', done: form.product_available === true && Boolean(insp.inspection_date) }]),
    { label: 'Install and commission', done: installDone },
    { label: 'Resolve ticket', done: ['Completed', 'Closed'].includes(s.status) },
  ];

  return (
    <SectionCard
      title="Installation job"
      description="After the technician is assigned, first record whether the product is available. If it is, continue with the site visit. If it is not, source it from a vendor the same way as a lead."
    >
      <ol className="mb-4 flex flex-wrap gap-1.5 text-xs font-medium">
        {steps.map((item, idx) => (
          <li key={item.label} className={cnStep(item.done, idx === steps.findIndex((step) => !step.done))}>
            {idx + 1}. {item.label}
          </li>
        ))}
      </ol>

      {!assigned && (
        <p className="text-sm text-muted-foreground">Assign a technician first. Then the technician records whether the product is available.</p>
      )}

      {assigned && (
        <div className="space-y-4">
          <div>
            <div className="mb-2 text-xs font-medium text-muted-foreground">Is the product available?</div>
            <div className="grid gap-3 md:grid-cols-2">
              <button type="button" disabled={!canWork} onClick={() => setAvailable(true)} className={`rounded-xl border p-4 text-left ${form.product_available === true ? 'border-indigo-400 bg-indigo-50' : 'border-border hover:bg-muted'}`}>
                <div className="font-semibold">Yes — product is available</div>
                <p className="mt-1 text-sm text-muted-foreground">Continue with the site visit, installation and commissioning.</p>
              </button>
              <button type="button" disabled={!canWork} onClick={() => setAvailable(false)} className={`rounded-xl border p-4 text-left ${form.product_available === false ? 'border-indigo-400 bg-indigo-50' : 'border-border hover:bg-muted'}`}>
                <div className="font-semibold">No — source from vendor</div>
                <p className="mt-1 text-sm text-muted-foreground">Select the vendor, enter pricing, then mark the product received.</p>
              </button>
            </div>
          </div>

          {form.product_available === true && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              Use the Inspection, Visits and Work Log tabs for the site visit, installation and commissioning. Add comments and files until the ticket is resolved.
            </p>
          )}

          {form.product_available === false && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="svc-vendor">Vendor</label>
                <select id="svc-vendor" className={INPUT_CLASS} disabled={!canWork} value={form.vendor_id} onChange={(e) => setForm((prev) => ({ ...prev, vendor_id: e.target.value }))}>
                  <option value="">Select vendor…</option>
                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>{vendor.company_name}</option>
                  ))}
                </select>
              </div>
              <FieldGrid>
                <FormField field={{ key: 'quote_amount', label: 'Vendor price', type: 'number', required: true }} value={form.quote_amount} onChange={(value) => setForm((prev) => ({ ...prev, quote_amount: value }))} disabled={!canWork} />
                <FormField field={{ key: 'currency', label: 'Currency', type: 'text' }} value={form.currency} onChange={(value) => setForm((prev) => ({ ...prev, currency: value }))} disabled={!canWork} />
                <FormField field={{ key: 'delivery_date', label: 'Expected delivery', type: 'date' }} value={form.delivery_date} onChange={(value) => setForm((prev) => ({ ...prev, delivery_date: value }))} disabled={!canWork} />
                <FormField field={{ key: 'proc-notes', label: 'Vendor / pricing notes', type: 'textarea', wide: true }} value={form.notes} onChange={(value) => setForm((prev) => ({ ...prev, notes: value }))} disabled={!canWork} />
              </FieldGrid>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" disabled={!canWork} checked={form.product_received} onChange={(e) => setForm((prev) => ({ ...prev, product_received: e.target.checked }))} />
                Product has been received and the site visit can start
              </label>
            </div>
          )}

          {canWork && form.product_available != null && (
            <div className="flex justify-end">
              <Button onClick={() => save()} disabled={busy}>{busy ? 'Saving…' : 'Save job details'}</Button>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function RepairJobCard({ ctx }) {
  const { detail } = ctx;
  const s = detail.service;
  if (s.workflow !== 'repair') return null;
  const entries = detail.data?.troubleshooting || [];
  const work = detail.data?.work || {};
  const test = detail.data?.final_test || {};
  const assigned = Boolean(s.assigned_employee_id);
  const steps = [
    { label: 'Assign technician', done: assigned },
    { label: 'Inspect and diagnose', done: entries.some((entry) => entry.fault_identified) },
    { label: 'Repair work', done: work.status === 'Completed' },
    { label: 'Final test', done: test.outcome === 'Passed' },
    { label: 'Resolve ticket', done: ['Completed', 'Closed'].includes(s.status) },
  ];
  return (
    <SectionCard title="Repair job" description="After the technician is assigned, inspect, repair and test. Comments, files and customer notes stay on this ticket until it is resolved.">
      <ol className="mb-4 flex flex-wrap gap-1.5 text-xs font-medium">
        {steps.map((item, idx) => (
          <li key={item.label} className={cnStep(item.done, idx === steps.findIndex((step) => !step.done))}>
            {idx + 1}. {item.label}
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted-foreground">
        Use the Inspection and Work Log tabs for diagnosis and repair. Add comments below and attachments on the Files tab.
      </p>
    </SectionCard>
  );
}

function IntakeProgress({ service, intake }) {
  const required = intake?.site_visit_required;
  const visitDone = required === false || (required === true && Boolean(intake?.site_visit_done));
  const classified = Boolean(service.service_type);
  const assigned = Boolean(service.assigned_employee_id);
  const steps = [
    { label: 'Call details', done: true },
    { label: required === false ? 'No site visit' : 'Site visit', done: visitDone },
    { label: 'Service and product', done: classified },
    { label: 'Assign technician', done: assigned },
  ];
  return (
    <ol className="flex flex-wrap gap-1.5 text-xs font-medium">
      {steps.map((item, idx) => (
        <li
          key={item.label}
          className={cnStep(item.done, idx === steps.findIndex((step) => !step.done))}
        >
          {idx + 1}. {item.label}
        </li>
      ))}
    </ol>
  );
}

function cnStep(done, current) {
  if (current) return 'rounded-full border border-indigo-300 bg-indigo-50 px-2.5 py-0.5 text-indigo-800';
  if (done) return 'rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-emerald-800';
  return 'rounded-full border border-border px-2.5 py-0.5 text-muted-foreground';
}

function SiteVisitCard({ ctx }) {
  const { detail, run, caps, reload } = ctx;
  const intake = detail.data?.intake || {};
  const ack = intake.acknowledgement || {};
  const s = detail.service;
  const closed = ['Closed', 'Cancelled'].includes(s.status);
  const canRecord = Boolean(caps.coordinate) && !closed && (!detail.locked || caps.manage);
  const [findings, setFindings] = useState(intake.site_visit_findings || '');
  const [ackUpload, setAckUpload] = useState(null);
  const [busy, setBusy] = useState(false);
  const [visitAnswer, setVisitAnswer] = useState(null);
  const [ackForm, setAckForm] = useState({ acknowledged: false, name: s.contact_person || '', notes: '' });
  const ackFiles = (detail.attachments || []).filter((file) => file.category === SITE_VISIT_ACK_CATEGORY);

  useEffect(() => {
    setFindings(intake.site_visit_findings || '');
  }, [intake.site_visit_findings]);

  const saveIntake = async () => {
    setBusy(true);
    try {
      await run(() => serviceApi.post(`/service-requests/${s.id}/intake`, {
        site_visit_required: visitAnswer,
        site_visit_acknowledgement: visitAnswer ? ackForm : null,
      }), visitAnswer ? 'Site visit acknowledgement saved' : 'No site visit recorded');
      if (visitAnswer && ackUpload) {
        const form = new FormData();
        form.append('file', ackUpload);
        form.append('category', SITE_VISIT_ACK_CATEGORY);
        form.append('description', ackForm.notes);
        try {
          await serviceApi.upload(`/service-requests/${s.id}/attachments`, form);
          toast.success('Acknowledgement file uploaded');
          await reload();
        } catch (err) {
          toast.error(errorText(err, 'The acknowledgement was saved, but the file did not upload'));
        }
      }
    } catch {
      /* shown by run() */
    } finally {
      setBusy(false);
    }
  };

  if (!intake || !Object.prototype.hasOwnProperty.call(intake, 'site_visit_required')) {
    if (s.status !== 'Draft') return null;
  }
  if (intake.site_visit_required == null) {
    return (
      <SectionCard title="Site visit" description="Say whether a visit is required, then submit the draft.">
        <div className="grid gap-3 md:grid-cols-2">
          <button type="button" onClick={() => setVisitAnswer(true)} className={`rounded-xl border p-4 text-left ${visitAnswer === true ? 'border-indigo-400 bg-indigo-50' : 'border-border hover:bg-muted'}`}>
            <div className="font-semibold text-foreground">Site visit required</div>
            <p className="mt-1 text-sm text-muted-foreground">Record the customer acknowledgement below.</p>
          </button>
          <button type="button" onClick={() => setVisitAnswer(false)} className={`rounded-xl border p-4 text-left ${visitAnswer === false ? 'border-indigo-400 bg-indigo-50' : 'border-border hover:bg-muted'}`}>
            <div className="font-semibold text-foreground">No site visit</div>
            <p className="mt-1 text-sm text-muted-foreground">The executive can fill service and product next.</p>
          </button>
        </div>
        {visitAnswer === true && (
          <div className="mt-3 space-y-3 rounded-lg border border-border p-3">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={ackForm.acknowledged} onChange={(event) => setAckForm((prev) => ({ ...prev, acknowledged: event.target.checked }))} />
              The customer acknowledged the site visit.
            </label>
            <FieldGrid>
              <FormField field={{ key: 'draft-ack-name', label: 'Acknowledged by', type: 'text', required: true }} value={ackForm.name} onChange={(value) => setAckForm((prev) => ({ ...prev, name: value }))} />
              <FormField field={{ key: 'draft-ack-notes', label: 'Acknowledgement notes', type: 'textarea', required: true, wide: true }} value={ackForm.notes} onChange={(value) => setAckForm((prev) => ({ ...prev, notes: value }))} />
            </FieldGrid>
            <input type="file" className="block w-full text-sm" onChange={(event) => setAckUpload(event.target.files?.[0] || null)} />
          </div>
        )}
        {canRecord && visitAnswer != null && (
          <div className="mt-3 flex justify-end">
            <Button onClick={saveIntake} disabled={busy || (visitAnswer && (!ackForm.acknowledged || !ackForm.name.trim() || !ackForm.notes.trim() || !ackUpload))}>
              {busy ? 'Saving…' : 'Save site visit answer'}
            </Button>
          </div>
        )}
      </SectionCard>
    );
  }

  const uploadAck = async () => {
    if (!ackUpload) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', ackUpload);
      form.append('category', SITE_VISIT_ACK_CATEGORY);
      form.append('description', ack.notes || 'Site visit acknowledgement');
      await serviceApi.upload(`/service-requests/${s.id}/attachments`, form);
      setAckUpload(null);
      toast.success('Acknowledgement file uploaded');
      await reload();
    } catch (err) {
      toast.error(errorText(err, 'Could not upload the acknowledgement'));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      await run(() => serviceApi.post(`/service-requests/${s.id}/site-visit`, { findings }), 'Site visit recorded');
    } catch {
      /* shown by run() */
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      title="Site visit"
      description={intake.site_visit_required
        ? 'The customer agreed to a visit. Mark it done once someone has been to the site.'
        : 'No site visit was needed on this call.'}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <ReadRow label="Site visit">{intake.site_visit_required ? 'Required' : 'Not required'}</ReadRow>
        {intake.site_visit_required && <ReadRow label="Acknowledged by">{ack.name}</ReadRow>}
        {intake.site_visit_required && <ReadRow label="Acknowledged">{ack.acknowledged ? 'Yes' : 'No'}</ReadRow>}
        {intake.site_visit_required && ack.notes && <div className="md:col-span-3"><ReadRow label="Acknowledgement notes">{ack.notes}</ReadRow></div>}
        {intake.site_visit_required && (
          <div className="md:col-span-3">
            <ReadRow label="Acknowledgement file">
              {ackFiles.length ? ackFiles.map((file) => file.file_name).join(', ') : 'Required'}
            </ReadRow>
          </div>
        )}
        {intake.site_visit_done && (
          <>
            <ReadRow label="Visit recorded">{intake.site_visit_done_by || 'Yes'}</ReadRow>
            <ReadRow label="Recorded at">{fmtDateTime(intake.site_visit_done_at)}</ReadRow>
          </>
        )}
      </div>
      {intake.site_visit_required && canRecord && ackFiles.length === 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-amber-900">The customer acknowledgement file is still required.</p>
          <input type="file" className="block w-full text-sm" onChange={(event) => setAckUpload(event.target.files?.[0] || null)} />
          <Button onClick={uploadAck} disabled={busy || !ackUpload}>{busy ? 'Uploading…' : 'Upload acknowledgement'}</Button>
        </div>
      )}
      {intake.site_visit_required && canRecord && (
        <div className="mt-3 space-y-3">
          <FormField
            field={{ key: 'visit-findings', label: 'What was found on the visit', type: 'textarea', wide: true }}
            value={findings}
            onChange={setFindings}
          />
          <div className="flex justify-end">
            <Button onClick={save} disabled={busy || ackFiles.length === 0}>
              {busy ? 'Saving…' : intake.site_visit_done ? 'Update visit notes' : 'Site visit completed'}
            </Button>
          </div>
        </div>
      )}
      {intake.site_visit_required && intake.site_visit_done && intake.site_visit_findings && !canRecord && (
        <div className="mt-3"><ReadRow label="Findings">{intake.site_visit_findings}</ReadRow></div>
      )}
    </SectionCard>
  );
}

function FieldDetailsCard({ ctx }) {
  const { detail, meta, run, caps } = ctx;
  const s = detail.service;
  const intake = detail.data?.intake;
  const config = detail.config || {};
  const closed = ['Closed', 'Cancelled'].includes(s.status);
  const canRecord = Boolean(caps.coordinate) && !closed && (!detail.locked || caps.manage);
  const visitBlocks = s.status !== 'Draft'
    && Boolean(intake)
    && intake.site_visit_required === true
    && !intake.site_visit_done;
  const [editing, setEditing] = useState(!s.service_type);
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState([]);
  const [newProductOpen, setNewProductOpen] = useState(false);
  const [newProduct, setNewProduct] = useState({ category: '', name: '', model: '', serial_number: '' });

  const serviceTypes = serviceTypesForCustomer(s.customer_type, meta);
  const selectedWorkflows = workflowsForServiceTypes(form.service_types, meta);
  const leadRequired = s.customer_type === 'Existing' && config.require_lead_for_existing !== false;

  useEffect(() => {
    setEditing(!s.service_type);
    setForm({
      service_types: s.service_types?.length ? s.service_types : (s.service_type ? [s.service_type] : []),
      product_types: s.product_types?.length ? s.product_types : (s.product_category ? [s.product_category] : []),
      lead_id: s.lead_id || '',
      product_id: s.product_id || '',
      amc_id: s.amc_id || '',
      product_name: s.product_name || '',
      product_model: s.product_model || '',
      serial_number: s.serial_number || '',
      quantity: s.quantity || '1',
      planned_date: s.planned_date || '',
      installation_requirements: s.installation_requirements || '',
      problem_category: s.problem_category || '',
      problem_description: s.problem_description || '',
    });
  }, [s]);

  useEffect(() => {
    if (!editing || visitBlocks) return undefined;
    let cancelled = false;
    serviceApi.get(`/service/customers/${s.customer_id}/profile`)
      .then((value) => { if (!cancelled) setProfile(value); })
      .catch(() => { if (!cancelled) setProfile({ leads: [], products: [], amcs: [] }); });
    return () => { cancelled = true; };
  }, [editing, visitBlocks, s.customer_id]);

  const setField = (key) => (value) => setForm((prev) => ({ ...prev, [key]: value }));

  const usableAmcs = (profile?.amcs || []).filter((a) => {
    if (a.effective_status !== 'Active') return false;
    const covered = a.covered_product_ids || [];
    return !form.product_id || covered.length === 0 || covered.includes(form.product_id);
  });

  const registerProduct = async () => {
    setBusy(true);
    setError([]);
    try {
      const created = await serviceApi.post('/service/products', {
        ...newProduct, customer_id: s.customer_id, lead_id: form.lead_id || null,
      });
      const next = await serviceApi.get(`/service/customers/${s.customer_id}/profile`);
      setProfile(next);
      setForm((prev) => ({ ...prev, product_id: created.id }));
      setNewProductOpen(false);
      setNewProduct({ category: '', name: '', model: '', serial_number: '' });
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(Array.isArray(detail) ? detail.map(String) : [errorText(err, 'Could not register the product')]);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setError([]);
    try {
      const payload = {
        service_types: form.service_types,
        service_type: (form.service_types || [])[0],
        product_types: form.product_types,
        product_category: (form.product_types || [])[0],
        lead_id: form.lead_id || null,
        product_id: form.product_id || null,
        amc_id: selectedWorkflows.has('amc') ? form.amc_id || null : null,
        product_name: form.product_name,
        product_model: form.product_model,
        serial_number: form.serial_number,
        quantity: form.quantity,
        planned_date: form.planned_date,
        installation_requirements: form.installation_requirements,
        problem_category: form.problem_category,
        problem_description: form.problem_description,
      };
      await run(() => serviceApi.post(`/service-requests/${s.id}/field-details`, payload).catch((err) => {
        if (err?.response?.status === 404) {
          return serviceApi.put(`/service-requests/${s.id}`, payload);
        }
        throw err;
      }), 'Service and product details saved');
      setEditing(false);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(Array.isArray(detail) ? detail.map(String) : [errorText(err, 'Could not save')]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      title="Service and product"
      description={s.status === 'Draft'
        ? 'Save the service types and product types here, then submit the draft at the top of this page.'
        : 'Filled after the site visit, when the problem and the product are known. The technician is assigned in the next step.'}
      actions={s.service_type && canRecord && !editing && (
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>
      )}
    >
      {visitBlocks && (
        <p className="text-sm text-amber-900">
          Complete the site visit first. After the visit, record the service type, product and the other job details here.
        </p>
      )}

      {!visitBlocks && s.service_type && !editing && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <ReadRow label="Service type">{(s.service_types || []).join(', ') || s.service_type}</ReadRow>
          {s.workflow === 'installation' && (
            <>
              <ReadRow label="Product">{[s.product_name, s.product_model].filter(Boolean).join(' · ')}</ReadRow>
              <ReadRow label="Product type">{(s.product_types || []).join(', ') || s.product_category}</ReadRow>
            </>
          )}
          {s.problem_category && <ReadRow label="Problem category">{s.problem_category}</ReadRow>}
        </div>
      )}

      {!visitBlocks && editing && canRecord && (
        <div className="space-y-4">
          {error.length > 0 && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">
              <ul className="list-disc space-y-0.5 pl-5">{error.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          )}
          <FieldGrid>
            <MultiPicker
              label="Service type"
              required
              options={serviceTypes}
              selected={form.service_types || []}
              onToggle={(value) => setForm((prev) => ({
                ...prev,
                service_types: (prev.service_types || []).includes(value)
                  ? prev.service_types.filter((item) => item !== value)
                  : [...(prev.service_types || []), value],
              }))}
            />
            {selectedWorkflows.has('installation') && (
              <MultiPicker
                label="Product type"
                required
                options={INSTALLATION_PRODUCT_CATEGORIES}
                selected={form.product_types || []}
                onToggle={(value) => setForm((prev) => ({
                  ...prev,
                  product_types: (prev.product_types || []).includes(value)
                    ? prev.product_types.filter((item) => item !== value)
                    : [...(prev.product_types || []), value],
                }))}
              />
            )}
          </FieldGrid>

          {s.customer_type === 'Existing' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground">Lead{leadRequired && <span className="text-rose-600"> *</span>}</h4>
                {!profile ? (
                  <p className="text-sm text-muted-foreground">Loading leads and products…</p>
                ) : profile.leads.length === 0 ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    No lead exists for this customer. Create the lead from the Leads screen first, then come back.
                  </p>
                ) : (
                  <div className="max-h-40 space-y-1.5 overflow-y-auto">
                    {profile.leads.map((lead) => (
                      <button
                        key={lead.id}
                        type="button"
                        onClick={() => setField('lead_id')(lead.id)}
                        className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${form.lead_id === lead.id ? 'border-indigo-400 bg-indigo-50' : 'border-border hover:bg-muted'}`}
                      >
                        <span className="font-medium">{lead.company || 'Lead'}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{[lead.sub_category || lead.category, lead.status].filter(Boolean).join(' · ')}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-foreground">Registered product</h4>
                  {!newProductOpen && (
                    <Button variant="outline" size="sm" onClick={() => setNewProductOpen(true)}>
                      <Plus className="mr-1 h-3.5 w-3.5" />Register product
                    </Button>
                  )}
                </div>
                {!newProductOpen && (
                  <div className="max-h-40 space-y-1.5 overflow-y-auto">
                    {(profile?.products || []).length === 0 && profile && <p className="text-sm text-muted-foreground">No registered products yet.</p>}
                    {(profile?.products || []).map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => setField('product_id')(product.id)}
                        className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${form.product_id === product.id ? 'border-indigo-400 bg-indigo-50' : 'border-border hover:bg-muted'}`}
                      >
                        <span className="font-medium">{product.name}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{[product.category, product.model, product.serial_number].filter(Boolean).join(' · ')}</span>
                      </button>
                    ))}
                  </div>
                )}
                {newProductOpen && (
                  <div className="space-y-3 rounded-lg border border-border p-3">
                    <FieldGrid>
                      <FormField field={{ key: 'np-category', label: 'Product category', type: 'text', required: true }} value={newProduct.category} onChange={(value) => setNewProduct((p) => ({ ...p, category: value }))} />
                      <FormField field={{ key: 'np-name', label: 'Product name', type: 'text', required: true }} value={newProduct.name} onChange={(value) => setNewProduct((p) => ({ ...p, name: value }))} />
                      <FormField field={{ key: 'np-model', label: 'Model', type: 'text' }} value={newProduct.model} onChange={(value) => setNewProduct((p) => ({ ...p, model: value }))} />
                      <FormField field={{ key: 'np-serial', label: 'Serial number', type: 'text' }} value={newProduct.serial_number} onChange={(value) => setNewProduct((p) => ({ ...p, serial_number: value }))} />
                    </FieldGrid>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setNewProductOpen(false)} disabled={busy}>Cancel</Button>
                      <Button onClick={registerProduct} disabled={busy || !newProduct.name.trim() || !newProduct.category.trim()}>
                        {busy ? 'Saving…' : 'Register product'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {selectedWorkflows.has('installation') && (
            <FieldGrid>
              <FormField field={{ key: 'product_name', label: 'Product name', type: 'text', required: true }} value={form.product_name} onChange={setField('product_name')} />
              <FormField field={{ key: 'product_model', label: 'Model', type: 'text', required: true }} value={form.product_model} onChange={setField('product_model')} />
              <FormField field={{ key: 'serial_number', label: 'Serial number', type: 'text' }} value={form.serial_number} onChange={setField('serial_number')} />
              <FormField field={{ key: 'quantity', label: 'Quantity', type: 'number', required: true }} value={form.quantity} onChange={setField('quantity')} />
              <FormField field={{ key: 'planned_date', label: 'Planned date', type: 'date', required: true }} value={form.planned_date} onChange={setField('planned_date')} />
              <FormField field={{ key: 'installation_requirements', label: 'Special requirements', type: 'textarea', wide: true }} value={form.installation_requirements} onChange={setField('installation_requirements')} />
            </FieldGrid>
          )}

          {selectedWorkflows.has('repair') && (
            <FieldGrid>
              <FormField
                field={{ key: 'problem_category', label: 'Problem category', type: 'select', required: true }}
                value={form.problem_category}
                options={config.problem_categories || []}
                onChange={setField('problem_category')}
              />
              <FormField field={{ key: 'problem_description', label: 'Problem', type: 'textarea', required: true, wide: true }} value={form.problem_description} onChange={setField('problem_description')} />
            </FieldGrid>
          )}

          {selectedWorkflows.has('amc') && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-foreground">AMC contract</h4>
              {usableAmcs.length === 0 ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  No active AMC contract covers this customer. Add a contract from AMC contracts before booking the visit.
                </p>
              ) : usableAmcs.map((contract) => (
                <button
                  key={contract.id}
                  type="button"
                  onClick={() => setField('amc_id')(contract.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${form.amc_id === contract.id ? 'border-indigo-400 bg-indigo-50' : 'border-border hover:bg-muted'}`}
                >
                  <span className="font-medium">{contract.amc_number}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{fmtDate(contract.start_date)} to {fmtDate(contract.end_date)}</span>
                </button>
              ))}
              <FieldGrid>
                <FormField field={{ key: 'planned_date', label: 'Planned visit date', type: 'date' }} value={form.planned_date} onChange={setField('planned_date')} />
              </FieldGrid>
            </div>
          )}

          <div className="flex justify-end gap-2">
            {s.service_type && <Button variant="outline" onClick={() => { setEditing(false); setError([]); }} disabled={busy}>Cancel</Button>}
            <Button onClick={save} disabled={busy || !(form.service_types || []).length}>{busy ? 'Saving…' : 'Save service and product'}</Button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

export function OverviewTab({ ctx }) {
  const { detail, run, ask } = ctx;
  const s = detail.service;
  const [editOpen, setEditOpen] = useState(false);
  const [blocked, setBlocked] = useState(null);
  const caps = detail.caps;
  const closed = ['Closed', 'Cancelled'].includes(s.status);

  const statusLabel = (next) => {
    if (s.status === 'Draft' && next === 'New') return 'Submit request';
    if (s.status === 'Draft' && next === 'Cancelled') return 'Discard draft';
    return next;
  };

  const move = (option) => {
    if (option.blockers.length > 0) {
      setBlocked(option);
      return;
    }
    const submitting = s.status === 'Draft' && option.status === 'New';
    const send = (reason) => run(
      () => (submitting
        ? serviceApi.post(`/service-requests/${s.id}/submit`, { reason }).catch((err) => {
          if (err?.response?.status === 404) {
            return serviceApi.post(`/service-requests/${s.id}/status`, { status: 'New', reason });
          }
          throw err;
        })
        : serviceApi.post(`/service-requests/${s.id}/status`, { status: option.status, reason })),
      submitting ? 'Request submitted' : `Status changed to ${option.status}`,
    );
    if (option.reason_required) {
      ask({
        title: submitting ? 'Submit this draft' : `Move to ${option.status}`,
        description: s.status === 'Completed' || s.status === 'Closed'
          ? 'Enter why this finished request is being changed.'
          : 'Enter the reason. It is recorded in the history.',
        confirmLabel: submitting ? 'Submit request' : 'Change status',
        run: send,
      });
    } else {
      send('').catch(() => {});
    }
  };

  const submitOption = detail.next_statuses.find((option) => option.status === 'New');

  const completion = detail.next_statuses.find((o) => o.status === 'Completed');
  const intake = detail.data?.intake;
  const showIntake = Boolean(intake) || !s.service_type;

  return (
    <div className="space-y-4">
      {s.status === 'Draft' && (
        <SectionCard
          title="This request is still a draft"
          description="Finish the call, site visit answer, and service and product details below. Then submit the request. It stays a draft until you do."
        >
          {submitOption && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => move(submitOption)}
                variant={submitOption.blockers.length > 0 ? 'outline' : 'default'}
                className={submitOption.blockers.length > 0 ? 'border-amber-300 text-amber-800' : undefined}
              >
                Submit request
              </Button>
              <p className="text-sm text-muted-foreground">
                {submitOption.blockers.length > 0
                  ? 'Some required details are still missing. Click Submit request to see them.'
                  : 'This will open the request so a technician can be assigned.'}
              </p>
            </div>
          )}
        </SectionCard>
      )}
      {s.status === 'Draft' && <FieldDetailsCard ctx={ctx} />}
      {showIntake && (
        <SectionCard title="How this request moves" description="The call is recorded first. Service type and product come after the visit. The technician is assigned last.">
          <IntakeProgress service={s} intake={intake} />
        </SectionCard>
      )}
      <SectionCard
        title="Status"
        actions={<StatusBadge status={s.status} />}
        description={detail.locked ? 'This request is locked. Only a service manager can change it, and every change needs a reason.' : undefined}
      >
        {detail.next_statuses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No status changes are available to you right now.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {detail.next_statuses.map((option) => (
              <Button aria-label={option.blockers.length > 0 ? 'Not ready — click to see why' : undefined}
                key={option.status}
                variant={option.blockers.length > 0 ? 'outline' : 'default'}
                size="sm"
                onClick={() => move(option)}
                className={option.blockers.length > 0 ? 'border-amber-300 text-amber-800' : undefined}
                title={option.blockers.length > 0 ? 'Not ready — click to see why' : undefined}
              >
                {statusLabel(option.status)}
              </Button>
            ))}
          </div>
        )}
        {completion && completion.blockers.length > 0 && (
          <div className="mt-3"><BlockerList title="Before this request can be completed" items={completion.blockers} /></div>
        )}
      </SectionCard>

      <SectionCard
        title="Request"
        actions={detail.can_edit && !closed && (!detail.locked || caps.manage) && (
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>
        )}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <ReadRow label="Service ID">{s.service_code}</ReadRow>
          <ReadRow label="Service type">{(s.service_types || []).join(', ') || s.service_type}</ReadRow>
          <ReadRow label="Customer type">{s.customer_type}</ReadRow>
          <ReadRow label="Priority"><PriorityBadge priority={s.priority} /></ReadRow>
          <ReadRow label="Request date">{fmtDate(s.request_date)}</ReadRow>
          <ReadRow label="Created by">{s.created_by_name}</ReadRow>
          <ReadRow label="Planned date">{fmtDate(s.planned_date)}</ReadRow>
          <ReadRow label="Expected visit">{fmtDate(s.expected_visit_date)}</ReadRow>
          <ReadRow label="Expected completion">
            <span className={detail.overdue ? 'font-semibold text-rose-700' : ''}>{fmtDate(s.expected_completion)}{detail.overdue ? ' (overdue)' : ''}</span>
          </ReadRow>
          <ReadRow label="Technician">{s.assigned_name || 'Unassigned'}</ReadRow>
          <ReadRow label="Engineer">{s.engineer_name}</ReadRow>
          <ReadRow label="Completed">{s.completed_at ? fmtDateTime(s.completed_at) : '—'}</ReadRow>
          {s.problem_description && s.workflow !== 'repair' && (
            <div className="md:col-span-3"><ReadRow label="Problem reported on the call">{s.problem_description}</ReadRow></div>
          )}
          {s.workflow === 'repair' && (
            <>
              <ReadRow label="Problem category">{s.problem_category}</ReadRow>
              <div className="md:col-span-2"><ReadRow label="Problem description">{s.problem_description}</ReadRow></div>
            </>
          )}
          {s.workflow === 'installation' && (
            <>
              <ReadRow label="Product">{[s.product_name, s.product_model].filter(Boolean).join(' · ')}</ReadRow>
              <ReadRow label="Quantity">{s.quantity}</ReadRow>
              <div className="md:col-span-3"><ReadRow label="Special requirements">{s.installation_requirements}</ReadRow></div>
            </>
          )}
          {s.cancel_reason && <div className="md:col-span-3"><ReadRow label="Cancellation reason">{s.cancel_reason}</ReadRow></div>}
          {s.customer_notes && <div className="md:col-span-3"><ReadRow label="Notes">{s.customer_notes}</ReadRow></div>}
          {s.remarks && <div className="md:col-span-3"><ReadRow label="Remarks">{s.remarks}</ReadRow></div>}
        </div>
      </SectionCard>

      {(showIntake || s.status === 'Draft') && <SiteVisitCard ctx={ctx} />}
      {s.status !== 'Draft' && showIntake && <FieldDetailsCard ctx={ctx} />}

      {s.service_type && caps.coordinate && !closed && <AssignmentCard ctx={ctx} />}
      {!s.service_type && (
        <SectionCard title="Assign technician" description="This step opens after the service type and job details are saved.">
          <p className="text-sm text-muted-foreground">
            After the visit, record the service type and job details. Then assign the technician who will do the work.
          </p>
        </SectionCard>
      )}
      {s.service_type && s.status !== 'Draft' && <InstallationJobCard ctx={ctx} />}
      {s.service_type && s.status !== 'Draft' && <RepairJobCard ctx={ctx} />}
      {s.status !== 'Draft' && <CommentsCard ctx={ctx} />}

      <EditDetailsDialog ctx={ctx} open={editOpen} onClose={() => setEditOpen(false)} />
      <Dialog open={Boolean(blocked)} onOpenChange={(value) => { if (!value) setBlocked(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{blocked?.status === 'New' && s.status === 'Draft' ? 'Cannot submit this draft yet' : `Cannot move to ${blocked?.status} yet`}</DialogTitle>
            <DialogDescription>Finish these first:</DialogDescription>
          </DialogHeader>
          <BlockerList items={blocked?.blockers} title="Still missing" />
          <DialogFooter><Button onClick={() => setBlocked(null)}>OK</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- Customer & product -----------------------------------------------------------

export function CustomerTab({ ctx }) {
  const { detail } = ctx;
  const s = detail.service;
  const p = detail.product;
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (!s.product_id) return;
    serviceApi.get(`/service/products/${s.product_id}/history`).then(setHistory).catch(() => setHistory([]));
  }, [s.product_id, s.status]);

  return (
    <div className="space-y-4">
      <SectionCard title="Customer">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <ReadRow label="Customer">{s.customer_name}</ReadRow>
          <ReadRow label="Customer ID">{s.customer_code}</ReadRow>
          <ReadRow label="Contact person">{s.contact_person}</ReadRow>
          <ReadRow label="Mobile">{s.mobile}</ReadRow>
          <ReadRow label="Email">{s.email}</ReadRow>
          <ReadRow label="Lead">
            {s.lead_id ? <Link className="text-indigo-700 hover:underline" to={`/viewlead/${s.lead_id}`}>{s.lead_label || 'Open lead'}</Link> : 'Not linked'}
          </ReadRow>
          <div className="md:col-span-3"><ReadRow label="Site address">{[s.site_address, s.city, s.state, s.pincode].filter(Boolean).join(', ')}</ReadRow></div>
        </div>
      </SectionCard>

      <SectionCard title="Product">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <ReadRow label="Category">{s.product_category}</ReadRow>
          <ReadRow label="Product">{s.product_name}</ReadRow>
          <ReadRow label="Model">{s.product_model}</ReadRow>
          <ReadRow label="Serial number">{s.serial_number}</ReadRow>
          <ReadRow label="Installation date">{fmtDate(p?.installation_date)}</ReadRow>
          <ReadRow label="Warranty">{p ? `${p.warranty_status}${p.warranty_end ? ` (until ${fmtDate(p.warranty_end)})` : ''}` : '—'}</ReadRow>
          {detail.amc && (
            <ReadRow label="AMC">{`${detail.amc.amc_number} — ${detail.amc.effective_status}, ${fmtDate(detail.amc.start_date)} to ${fmtDate(detail.amc.end_date)}`}</ReadRow>
          )}
          {p && <ReadRow label="Repairs on this product">{p.repair_count}</ReadRow>}
        </div>
      </SectionCard>

      {s.product_id && (
        <SectionCard title="Service history of this product">
          {history.length === 0 ? <p className="text-sm text-muted-foreground">No other service history.</p> : (
            <ul className="divide-y divide-border text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-2 py-2">
                  <Link className="font-mono text-xs text-indigo-700 hover:underline" to={`/service-maintenance/${h.id}`}>{h.service_code}</Link>
                  <span className="flex-1 truncate">{h.service_type}{h.problem_category ? ` — ${h.problem_category}` : ''}</span>
                  <span className="text-xs text-muted-foreground">{fmtDate(h.request_date)}</span>
                  <StatusBadge status={h.status} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}
    </div>
  );
}

// --- Inspection and work log ---------------------------------------------------------

function sectionBlock(ctx, section) {
  const { detail, meta, canWork, saveSection } = ctx;
  const data = detail.data || {};
  const templates = detail.checklist_templates || {};
  if (section === 'troubleshooting') {
    return (
      <TroubleshootingForm
        key={section}
        entries={data.troubleshooting || []}
        enums={meta.enums}
        disabled={!canWork}
        checklistTemplate={templates.repair_inspection}
        technicianName={detail.service.assigned_name}
        onSave={(entries) => saveSection('troubleshooting', entries)}
      />
    );
  }
  return (
    <SectionForm
      key={section}
      section={section}
      value={data[section]}
      enums={meta.enums}
      disabled={!canWork}
      withChecklist={['inspection', 'execution', 'commissioning', 'amc'].includes(section)}
      onSave={(value) => saveSection(section, value)}
    />
  );
}

function EvidencePanel({ ctx, categories, title }) {
  const { detail, meta, canWork, locked, ask, reload } = ctx;
  return (
    <SectionCard>
      <AttachmentPanel
        title={title}
        serviceId={detail.service.id}
        attachments={detail.attachments}
        categories={categories}
        limits={meta.attachment_limits}
        canEdit={canWork}
        canRemove={canWork}
        locked={locked}
        askReason={ask}
        onChanged={reload}
      />
    </SectionCard>
  );
}

export function InspectionTab({ ctx }) {
  const { detail } = ctx;
  const workflow = detail.service.workflow;
  const sections = TAB_SECTIONS[workflow]?.inspection || [];
  const proc = detail.data?.procurement || {};
  const waitProduct = workflow === 'installation' && proc.product_available === false && !proc.product_received;
  return (
    <div className="space-y-4">
      {workflow === 'installation' && <InstallationJobCard ctx={ctx} />}
      {waitProduct ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Site inspection opens after the product is received from the vendor.
        </p>
      ) : (
        sections.map((section) => sectionBlock(ctx, section))
      )}
      <EvidencePanel ctx={ctx} categories={EVIDENCE_CATEGORIES.inspection[workflow]} title="Inspection photos and videos" />
    </div>
  );
}

export function WorkLogTab({ ctx }) {
  const { detail } = ctx;
  const workflow = detail.service.workflow;
  const sections = TAB_SECTIONS[workflow]?.worklog || [];
  const proc = detail.data?.procurement || {};
  const waitProduct = workflow === 'installation' && proc.product_available === false && !proc.product_received;
  const finalTest = detail.data?.final_test || {};
  const failed = finalTest.outcome && finalTest.outcome !== 'Passed';
  const visitsWithLog = detail.visits.filter((v) => v.work_log || v.parts_used || v.test_results);
  return (
    <div className="space-y-4">
      {failed && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          The final test result is “{finalTest.outcome}”. The request cannot be completed yet: add another troubleshooting entry,
          plan a revisit, or send the product for vendor repair.
        </div>
      )}
      {waitProduct ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Installation and commissioning open after the product is received from the vendor.
        </p>
      ) : sections.map((section) => sectionBlock(ctx, section))}
      {sections.length === 0 && (
        <p className="rounded-lg border border-border bg-white p-4 text-sm text-muted-foreground">
          The AMC visit details are recorded on the Inspection tab. Visit-by-visit notes appear below and on the Visits tab.
        </p>
      )}
      {visitsWithLog.length > 0 && (
        <SectionCard title="Work recorded on visits">
          <ul className="space-y-3 text-sm">
            {visitsWithLog.map((v) => (
              <li key={v.id} className="rounded-lg border border-border p-3">
                <div className="mb-1 font-medium">Visit {v.visit_no} · {fmtDate(v.actual_date || v.planned_date)} · {v.technician_name || 'Unassigned'}</div>
                {v.work_log && <p className="whitespace-pre-wrap text-foreground">{v.work_log}</p>}
                {v.parts_used && <p className="text-xs text-muted-foreground">Parts: {v.parts_used}</p>}
                {v.test_results && <p className="text-xs text-muted-foreground">Tests: {v.test_results}</p>}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
      <EvidenceChecklist detail={detail} />
      <EvidencePanel ctx={ctx} categories={EVIDENCE_CATEGORIES.worklog[workflow]} title="Work photos and videos" />
    </div>
  );
}

// --- Visits ------------------------------------------------------------------------

const VISIT_FIELDS = [
  { key: 'planned_date', label: 'Planned date', type: 'date' },
  { key: 'planned_start', label: 'Planned start', type: 'text', placeholder: 'e.g. 10:30' },
  { key: 'expected_duration', label: 'Expected duration', type: 'text' },
  { key: 'actual_date', label: 'Actual date', type: 'date' },
  { key: 'actual_start', label: 'Actual start', type: 'text' },
  { key: 'actual_end', label: 'Actual end', type: 'text' },
  { key: 'status', label: 'Status', type: 'select' },
  { key: 'outcome', label: 'Outcome', type: 'select' },
  { key: 'next_visit_date', label: 'Next visit date', type: 'date' },
  { key: 'inspection_notes', label: 'Inspection notes', type: 'textarea', wide: true },
  { key: 'work_log', label: 'Work log', type: 'textarea', wide: true },
  { key: 'parts_used', label: 'Parts used', type: 'textarea', wide: true },
  { key: 'test_results', label: 'Test results', type: 'textarea', wide: true },
  { key: 'remarks', label: 'Remarks', type: 'textarea', wide: true },
];

function VisitDialog({ ctx, visit, open, onClose }) {
  const { detail, meta, lookups, run, withLock, canWork, locked, ask, reload } = ctx;
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isCoordinator = detail.caps.coordinate;

  useEffect(() => {
    if (open) {
      setForm(visit ? { ...visit } : { status: 'Planned', technician_id: detail.service.assigned_employee_id || '', technician_name: detail.service.assigned_name || '' });
      setError('');
    }
  }, [open, visit, detail.service]);

  const setTechnician = (employeeId) => {
    const emp = lookups.employees.find((e) => e.employee_id === employeeId);
    setForm((p) => ({ ...p, technician_id: employeeId, technician_name: emp?.name || '' }));
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const base = `/service-requests/${detail.service.id}/visits`;
      const done = await withLock('Reason for changing a visit on a locked request', (reason) => run(
        () => (visit ? serviceApi.put(`${base}/${visit.id}`, { ...form, reason }) : serviceApi.post(base, { ...form, reason })),
        'Visit saved',
      ));
      if (done) onClose();
    } catch (err) {
      setError(errorText(err, 'Could not save the visit'));
    } finally {
      setBusy(false);
    }
  };

  const options = (key) => (key === 'status' ? meta.visit_statuses : meta.visit_outcomes);

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value && !busy) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>{visit ? `Visit ${visit.visit_no}` : 'Add visit'}</DialogTitle></DialogHeader>
        {error && <p className="rounded bg-rose-50 p-2 text-sm text-rose-800" role="alert">{error}</p>}
        <FieldGrid>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="svc-visit-tech">Technician</label>
            <select id="svc-visit-tech" className={INPUT_CLASS} value={form.technician_id || ''} disabled={!isCoordinator} onChange={(e) => setTechnician(e.target.value)}>
              <option value="">Select…</option>
              {lookups.employees.map((e) => <option key={e.employee_id} value={e.employee_id}>{e.name}</option>)}
            </select>
          </div>
          {VISIT_FIELDS.map((field) => (
            <FormField key={field.key} field={{ ...field, key: `visit-${field.key}` }} options={field.type === 'select' ? options(field.key) : undefined} value={form[field.key]} onChange={(v) => setForm((p) => ({ ...p, [field.key]: v }))} />
          ))}
        </FieldGrid>
        {visit && (
          <AttachmentPanel
            title="Files for this visit"
            serviceId={detail.service.id}
            attachments={detail.attachments}
            categories={meta.attachment_categories}
            limits={meta.attachment_limits}
            canEdit={canWork}
            canRemove={canWork}
            locked={locked}
            askReason={ask}
            visitId={visit.id}
            defaultCategory="During-Service Photos/Videos"
            onChanged={reload}
          />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Close</Button>
          <Button onClick={save} disabled={busy || !canWork}>{busy ? 'Saving…' : 'Save visit'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function VisitsTab({ ctx }) {
  const { detail, canWork } = ctx;
  const [dialog, setDialog] = useState({ open: false, visit: null });
  return (
    <SectionCard
      title="Visits"
      description="Every visit to the site or workshop, including revisits after a failed test."
      actions={canWork && <Button size="sm" onClick={() => setDialog({ open: true, visit: null })}><Plus className="mr-1 h-4 w-4" />Add visit</Button>}
    >
      {detail.visits.length === 0 ? <p className="text-sm text-muted-foreground">No visits recorded.</p> : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                {['#', 'Technician', 'Planned', 'Actual', 'Status', 'Outcome', 'Next visit', ''].map((h) => <th key={h} className="py-2 pr-3">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {detail.visits.map((v) => (
                <tr key={v.id} className="border-b border-border">
                  <td className="py-2 pr-3">{v.visit_no}</td>
                  <td className="py-2 pr-3">{v.technician_name || '—'}</td>
                  <td className="py-2 pr-3">{fmtDate(v.planned_date)}</td>
                  <td className="py-2 pr-3">{fmtDate(v.actual_date)}</td>
                  <td className="py-2 pr-3">{v.status}</td>
                  <td className="py-2 pr-3">{v.outcome || '—'}</td>
                  <td className="py-2 pr-3">{fmtDate(v.next_visit_date)}</td>
                  <td className="py-2 text-right"><Button variant="outline" size="sm" onClick={() => setDialog({ open: true, visit: v })}>{canWork ? 'Open' : 'View'}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <VisitDialog ctx={ctx} open={dialog.open} visit={dialog.visit} onClose={() => setDialog({ open: false, visit: null })} />
    </SectionCard>
  );
}

// --- Photos & documents -----------------------------------------------------------------

export function FilesTab({ ctx }) {
  const { detail, meta, canWork, locked, ask, reload } = ctx;
  const [filter, setFilter] = useState('');
  const counts = useMemo(() => {
    const out = {};
    detail.attachments.forEach((a) => { out[a.category] = (out[a.category] || 0) + 1; });
    return out;
  }, [detail.attachments]);
  return (
    <SectionCard>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="svc-file-filter">Show</label>
        <select id="svc-file-filter" className={`${INPUT_CLASS} w-auto`} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All categories ({detail.attachments.length})</option>
          {meta.attachment_categories.filter((c) => counts[c]).map((c) => <option key={c} value={c}>{c} ({counts[c]})</option>)}
        </select>
      </div>
      <AttachmentPanel
        serviceId={detail.service.id}
        attachments={detail.attachments}
        categories={meta.attachment_categories}
        showOnly={filter ? [filter] : undefined}
        limits={meta.attachment_limits}
        canEdit={canWork}
        canRemove={canWork}
        locked={locked}
        askReason={ask}
        onChanged={reload}
      />
    </SectionCard>
  );
}

// --- History -----------------------------------------------------------------------------

const EVENT_LABELS = {
  created: 'Created', status_change: 'Status change', assignment: 'Assignment', section_updated: 'Work updated',
  updated: 'Details updated', locked_edit: 'Locked record edited', attachment: 'File added',
  attachment_removed: 'File removed', vendor_repair: 'Vendor repair', report: 'Report', visit: 'Visit',
  site_visit: 'Site visit', field_details: 'Service and product',
};

export function HistoryTab({ ctx }) {
  const { detail } = ctx;
  const [type, setType] = useState('');
  const rows = detail.history.filter((h) => !type || h.event_type === type);
  const types = Array.from(new Set(detail.history.map((h) => h.event_type)));
  return (
    <SectionCard
      title="History"
      description="Every change with who made it, when, and why."
      actions={(
        <select className={`${INPUT_CLASS} w-auto`} value={type} onChange={(e) => setType(e.target.value)} aria-label="Event type">
          <option value="">All events</option>
          {types.map((t) => <option key={t} value={t}>{EVENT_LABELS[t] || t}</option>)}
        </select>
      )}
    >
      <ol className="space-y-3">
        {rows.map((h) => (
          <li key={h.id} className="border-l-2 border-border pl-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">{EVENT_LABELS[h.event_type] || h.event_type}</span>
              {h.to_status && (
                <span className="text-xs text-muted-foreground">
                  {h.from_status ? `${h.from_status} → ` : ''}<StatusBadge status={h.to_status} />
                </span>
              )}
              <span className="ml-auto text-xs text-muted-foreground">{fmtDateTime(h.created_at)} · {h.user_name || 'System'}</span>
            </div>
            {h.detail && <div className="text-xs text-muted-foreground">{h.detail}</div>}
            {h.reason && <div className="text-xs italic text-muted-foreground">Reason: {h.reason}</div>}
          </li>
        ))}
        {rows.length === 0 && <li className="text-sm text-muted-foreground">No history.</li>}
      </ol>
    </SectionCard>
  );
}

export { errorText };
