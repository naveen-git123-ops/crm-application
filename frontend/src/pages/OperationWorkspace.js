import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { ArrowLeft, Check, Circle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useRegisterPageHeader } from '@/contexts/PageHeaderContext';
import { API_ENDPOINT } from '@/lib/apiConfig';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { CLOSURE_LABELS, HEALTH_STYLES, TAB_LABELS, formatMoney } from '@/lib/operationUtils';
import { cn } from '@/lib/utils';

const API = API_ENDPOINT;

function Field({ label, children }) {
  return (
    <div>
      <Label className="text-xs text-slate-500">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function SimpleTable({ columns, rows, emptyText }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b text-left text-[11px] uppercase text-slate-500">
            {columns.map((col) => <th key={col} className="py-2 pr-3">{col}</th>)}
          </tr>
        </thead>
        <tbody>
          {(rows || []).map((row) => (
            <tr key={row._key} className="border-b border-slate-100 align-top">
              {row.cells.map((cell, i) => <td key={i} className="py-2 pr-3">{cell}</td>)}
            </tr>
          ))}
          {(!rows || rows.length === 0) && (
            <tr><td colSpan={columns.length} className="py-6 text-center text-slate-500">{emptyText}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function OperationWorkspace() {
  const { operationId } = useParams();
  const authHeader = useCallback(() => ({ Authorization: `Bearer ${localStorage.getItem('token')}` }), []);
  const [data, setData] = useState(null);
  const [meta, setMeta] = useState({});
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [opRes, metaRes] = await Promise.all([
        axios.get(`${API}/operations/${operationId}`, { headers: authHeader() }),
        axios.get(`${API}/operations/meta`, { headers: authHeader() }),
      ]);
      setData(opRes.data);
      setMeta(metaRes.data || {});
      const tabs = opRes.data.visible_tabs || ['overview'];
      if (!tabs.includes(tab)) setTab(tabs[0]);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to load operation'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [authHeader, operationId]);

  useEffect(() => { load(); }, [load]);

  const setF = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const post = async (path, payload, success) => {
    setSaving(true);
    try {
      await axios.post(`${API}/operations/${data.id}${path}`, payload, { headers: authHeader() });
      toast.success(success);
      setDialog(null);
      setForm({});
      await load();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  const put = async (path, payload, success) => {
    setSaving(true);
    try {
      await axios.put(`${API}/operations/${data.id}${path}`, payload, { headers: authHeader() });
      toast.success(success);
      setDialog(null);
      await load();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Update failed'));
    } finally {
      setSaving(false);
    }
  };

  useRegisterPageHeader({
    subtitle: data ? `${data.operation_code} · ${data.customer_name}` : 'Operation workspace',
    actions: data ? (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" asChild>
          <Link to="/operations"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link>
        </Button>
        <Button size="sm" variant="outline" onClick={() => { setForm({ next_action: data.next_action || '', next_action_date: data.next_action_date || '', blocker_category: data.blocker_category || '', blocker_description: data.blocker_description || '', current_stage: data.current_stage || '', priority: data.priority || 'Medium', target_date: data.target_date || '' }); setDialog('edit'); }}>Edit</Button>
        <Button size="sm" variant="outline" onClick={() => { setForm({ task_name: '', due_date: '', priority: 'Medium' }); setDialog('task'); }}>Add task</Button>
        <Button size="sm" variant="outline" onClick={() => { setForm({ action_type: 'Vendor Call', action_result: '', next_action: '', next_action_date: '' }); setDialog('update'); }}>Add follow-up</Button>
        <Button size="sm" variant="outline" onClick={() => { setForm({ category: 'Site Expense', amount: '', purpose: '' }); setDialog('expense'); }}>Add expense</Button>
        <Button size="sm" variant="outline" onClick={() => { setForm({ invoice_amount: '', invoice_date: '', due_date: '' }); setDialog('invoice'); }}>Create invoice</Button>
      </div>
    ) : null,
    enabled: !loading,
  });

  const tabs = data?.visible_tabs || ['overview'];
  const stages = data?.stages || [];
  const stageIndex = stages.indexOf(data?.current_stage);
  const health = HEALTH_STYLES[data?.health_status] || HEALTH_STYLES.green;

  const input = (key, type = 'text', extra = {}) => (
    <Input type={type} value={form[key] ?? ''} onChange={(e) => setF(key, e.target.value)} {...extra} />
  );

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" /></div>;
  }
  if (!data) {
    return (
      <Card className="p-8 text-center space-y-3">
        <p className="font-semibold">Operation not found</p>
        <Button asChild variant="outline"><Link to="/operations">Back</Link></Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4 pb-10" data-testid="operation-workspace">
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-slate-900">{data.operation_code}</h1>
              <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', health.badge)}>{health.label}</span>
            </div>
            <div className="text-lg font-medium text-slate-800">{data.customer_name}</div>
            <div className="text-sm text-slate-500">{data.project_name || data.operation_type}</div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <div>PO: <b>{data.po_number || '—'}</b></div>
            <div>PO value: <b>{formatMoney(data.po_value)}</b></div>
            <div>Responsible: <b>{data.responsible_name || '—'}</b></div>
            <div>Priority: <b>{data.priority}</b></div>
            <div>Target: <b>{data.target_date || '—'}</b></div>
            <div>Payment: <b>{data.payment_status}</b></div>
          </div>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {stages.map((stage, index) => {
            const done = stageIndex > index;
            const current = stageIndex === index;
            return (
              <div key={stage} className="flex items-center gap-2 shrink-0">
                <div className={cn('flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold', done && 'bg-emerald-50 text-emerald-700', current && 'bg-indigo-50 text-indigo-800', !done && !current && 'bg-slate-100 text-slate-500')}>
                  {done ? <Check className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                  {stage}
                </div>
                {index < stages.length - 1 && <span className="text-slate-300">→</span>}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="flex gap-1 overflow-x-auto">
        {tabs.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn('shrink-0 rounded-lg border px-3 py-1.5 text-sm', tab === key ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-600')}
          >
            {TAB_LABELS[key] || key}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card className="p-4 space-y-2 text-sm">
            <h3 className="font-semibold">Overview</h3>
            {[
              ['Customer', data.customer_name],
              ['Project', data.project_name],
              ['Enquiry', data.enquiry_id],
              ['Quotation', data.quotation_id],
              ['Customer PO', data.po_number],
              ['PO value', formatMoney(data.po_value)],
              ['Responsible', data.responsible_name],
              ['Start', data.start_date],
              ['Target', data.target_date],
              ['Priority', data.priority],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-slate-100 py-1"><span className="text-slate-500">{k}</span><span className="font-medium text-right">{v || '—'}</span></div>
            ))}
          </Card>
          <Card className="p-4 space-y-2 text-sm">
            <h3 className="font-semibold">What must happen next</h3>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-[11px] uppercase text-slate-500">Current stage</div>
              <div className="font-semibold">{data.current_stage || '—'}</div>
              <div className="mt-2 text-[11px] uppercase text-slate-500">Current blocker</div>
              <div className="font-medium">{data.blocker_category || 'None'}{data.blocker_description ? ` — ${data.blocker_description}` : ''}</div>
              <div className="mt-2 text-[11px] uppercase text-slate-500">Next action</div>
              <div className="font-medium">{data.next_action || '—'}</div>
              <div className="text-xs text-slate-500">{data.next_action_date || ''}</div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              {Object.entries(data.cost_summary || {}).map(([k, v]) => (
                <div key={k} className="rounded-lg border border-slate-100 p-2">
                  <div className="text-[10px] uppercase text-slate-400">{k.replace(/_/g, ' ')}</div>
                  <div className="font-semibold">{formatMoney(v)}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === 'tasks' && (
        <Card className="p-4 space-y-3">
          <div className="flex justify-between"><h3 className="font-semibold">Tasks & responsibility</h3><Button size="sm" onClick={() => { setForm({ task_name: '', due_date: '', priority: 'Medium' }); setDialog('task'); }}>Add task</Button></div>
          <SimpleTable
            columns={['Task', 'Assigned', 'Start', 'Due', 'Status', 'Auto', 'Next action']}
            emptyText="No tasks yet"
            rows={(data.tasks || []).map((task) => ({
              _key: task.id,
              cells: [task.task_name, task.assigned_to_name || '—', task.start_date || '—', task.due_date || '—', task.status, task.auto_state, task.next_action || '—'],
            }))}
          />
        </Card>
      )}

      {tab === 'procurement' && (
        <Card className="p-4 space-y-3">
          <div className="flex justify-between"><h3 className="font-semibold">Procurement</h3><Button size="sm" onClick={() => { setForm({ description: '', required_qty: 1, ordered_qty: 0, received_qty: 0, status: 'Required' }); setDialog('material'); }}>Add item</Button></div>
          <SimpleTable
            columns={['Item', 'Required', 'Vendor', 'Ordered', 'Received', 'Balance', 'Status']}
            emptyText="No procurement lines"
            rows={(data.materials || []).map((m) => ({
              _key: m.id,
              cells: [m.description, m.required_qty, m.vendor_name || '—', m.ordered_qty, m.received_qty, Math.max(0, Number(m.required_qty || 0) - Number(m.received_qty || 0)), m.status],
            }))}
          />
        </Card>
      )}

      {tab === 'vendor' && (
        <Card className="p-4 space-y-3">
          <div className="flex justify-between"><h3 className="font-semibold">Vendors</h3><Button size="sm" onClick={() => { setForm({ vendor_name: '', status: 'Pending' }); setDialog('vendor'); }}>Add vendor</Button></div>
          <SimpleTable
            columns={['Vendor', 'Contact', 'PO', 'Committed', 'Actual', 'Broken', 'Next follow-up']}
            emptyText="No vendors"
            rows={(data.vendors || []).map((v) => ({
              _key: v.id,
              cells: [v.vendor_name, v.contact_person || v.phone || '—', v.vendor_po || '—', v.confirmed_delivery || '—', v.actual_delivery || '—', v.broken_commitment ? 'YES' : 'No', v.next_followup || '—'],
            }))}
          />
        </Card>
      )}

      {tab === 'material' && (
        <Card className="p-4 space-y-3">
          <div className="flex justify-between"><h3 className="font-semibold">Material control</h3><Button size="sm" onClick={() => { setForm({ description: '', required_qty: 1, status: 'Required' }); setDialog('material'); }}>Add material</Button></div>
          <SimpleTable
            columns={['Material', 'Spec', 'Qty', 'Received', 'Status', 'Expected']}
            emptyText="No materials"
            rows={(data.materials || []).map((m) => ({
              _key: m.id,
              cells: [m.description, m.specification || '—', m.required_qty, m.received_qty, m.status, m.expected_delivery || '—'],
            }))}
          />
        </Card>
      )}

      {tab === 'site' && (
        <Card className="p-4 space-y-3">
          <div className="flex justify-between"><h3 className="font-semibold">Site / service</h3><Button size="sm" onClick={() => { setForm({ planned_date: '', work_performed: '' }); setDialog('site'); }}>Add site visit</Button></div>
          <SimpleTable
            columns={['Date', 'Engineer', 'Problem', 'Work', 'Acceptance']}
            emptyText="No site visits"
            rows={(data.site_visits || []).map((v) => ({
              _key: v.id,
              cells: [v.actual_date || v.planned_date || '—', v.engineer_name || '—', v.problem_reported || '—', v.work_performed || v.report || '—', v.customer_acceptance || '—'],
            }))}
          />
        </Card>
      )}

      {tab === 'dispatch' && (
        <Card className="p-4 space-y-3">
          <div className="flex justify-between"><h3 className="font-semibold">Dispatch & delivery</h3><Button size="sm" onClick={() => { setForm({ status: 'Material Ready' }); setDialog('dispatch'); }}>Add dispatch</Button></div>
          <SimpleTable
            columns={['ID', 'Date', 'Material', 'Transporter', 'LR', 'Expected', 'Actual', 'Delay']}
            emptyText="No dispatches"
            rows={(data.dispatches || []).map((d) => ({
              _key: d.id,
              cells: [d.dispatch_code, d.dispatch_date || '—', d.material || '—', d.transporter || '—', d.lr_number || '—', d.expected_delivery || '—', d.actual_delivery || '—', d.delay_days || 0],
            }))}
          />
        </Card>
      )}

      {tab === 'installation' && (
        <Card className="p-4 space-y-3">
          <div className="flex justify-between"><h3 className="font-semibold">Installation / commissioning</h3><Button size="sm" onClick={() => { setForm({ installation_status: 'Planned' }); setDialog('install'); }}>Add record</Button></div>
          <SimpleTable
            columns={['Engineer', 'Status', 'Planned', 'Actual', 'Testing', 'Handover']}
            emptyText="No installation records"
            rows={(data.installations || []).map((i) => ({
              _key: i.id,
              cells: [i.engineer_name || '—', i.installation_status, i.planned_date || '—', i.actual_date || '—', i.testing_result || '—', i.handover_date || '—'],
            }))}
          />
        </Card>
      )}

      {tab === 'expenses' && (
        <Card className="p-4 space-y-3">
          <div className="flex justify-between"><h3 className="font-semibold">Expenses & cost</h3><Button size="sm" onClick={() => { setForm({ category: 'Site Expense', amount: '', purpose: '' }); setDialog('expense'); }}>Add expense</Button></div>
          <SimpleTable
            columns={['ID', 'Employee', 'Category', 'Amount', 'Purpose', 'Status']}
            emptyText="No expenses"
            rows={(data.expenses || []).map((e) => ({
              _key: e.id,
              cells: [e.expense_code, e.employee_name || '—', e.category, formatMoney(e.amount), e.purpose || '—', e.approval_status],
            }))}
          />
        </Card>
      )}

      {tab === 'documents' && (
        <Card className="p-4 space-y-3">
          <div className="flex justify-between"><h3 className="font-semibold">Documents</h3><Button size="sm" onClick={() => { setForm({ folder: '18 Other', file_name: '', file_url: '' }); setDialog('document'); }}>Upload</Button></div>
          <SimpleTable
            columns={['Folder', 'File', 'Version', 'By', 'Date']}
            emptyText="No documents"
            rows={(data.documents || []).map((d) => ({
              _key: d.id,
              cells: [d.folder, d.file_url ? <a className="text-indigo-700 underline" href={d.file_url} target="_blank" rel="noreferrer">{d.file_name}</a> : d.file_name, d.version, d.uploaded_by || '—', (d.created_at || '').slice(0, 10)],
            }))}
          />
        </Card>
      )}

      {tab === 'invoice' && (
        <Card className="p-4 space-y-3">
          <div className="flex justify-between"><h3 className="font-semibold">Invoice & payment</h3><Button size="sm" onClick={() => { setForm({ invoice_amount: '', due_date: '' }); setDialog('invoice'); }}>Create invoice</Button></div>
          <SimpleTable
            columns={['Invoice', 'Amount', 'Due', 'Status', 'Promised', 'Missed']}
            emptyText="No invoices"
            rows={(data.invoices || []).map((inv) => ({
              _key: inv.id,
              cells: [inv.invoice_no, formatMoney(inv.invoice_amount), inv.due_date || '—', inv.status, inv.promised_payment_date || '—', inv.commitment_missed ? 'YES' : 'No'],
            }))}
          />
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => { setForm({ invoice_id: data.invoices?.[0]?.id || '', amount: '', received_date: new Date().toISOString().slice(0, 10) }); setDialog('payment'); }}>Record payment</Button>
          </div>
          <SimpleTable
            columns={['Amount', 'Date', 'Mode']}
            emptyText="No payments"
            rows={(data.payments || []).map((p) => ({
              _key: p.id,
              cells: [formatMoney(p.amount), p.received_date || '—', p.mode || '—'],
            }))}
          />
        </Card>
      )}

      {tab === 'followups' && (
        <Card className="p-4 space-y-3">
          <div className="flex justify-between"><h3 className="font-semibold">Follow-ups</h3><Button size="sm" onClick={() => { setForm({ followup_type: 'Vendor', next_action: '', due_date: '' }); setDialog('followup'); }}>Add follow-up</Button></div>
          <SimpleTable
            columns={['Type', 'Responsible', 'Last action', 'Next action', 'Due', 'Status']}
            emptyText="No follow-ups"
            rows={(data.followups || []).map((f) => ({
              _key: f.id,
              cells: [f.followup_type, f.responsible_name || '—', f.last_action || '—', f.next_action || '—', f.due_date || '—', f.status],
            }))}
          />
        </Card>
      )}

      {tab === 'timeline' && (
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold">Timeline & audit</h3>
          <div className="space-y-2">
            {(data.updates || []).map((u) => (
              <div key={u.id} className="rounded-lg border border-slate-100 px-3 py-2 text-sm">
                <div className="text-[11px] text-slate-400">{(u.created_at || '').replace('T', ' ').slice(0, 16)} · {u.employee_name}</div>
                <div className="font-medium">{u.action_type}</div>
                <div className="text-slate-600">{u.action_result}</div>
                {u.next_action && <div className="text-xs text-indigo-700">Next: {u.next_action} {u.next_action_date || ''}</div>}
              </div>
            ))}
            {(data.updates || []).length === 0 && <p className="text-sm text-slate-500">No timeline events yet.</p>}
          </div>
        </Card>
      )}

      {tab === 'closure' && (
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold">Closure</h3>
          <p className="text-sm text-slate-500">An operation cannot close just because material was delivered.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(CLOSURE_LABELS).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(data.closure_checklist?.[key])}
                  onChange={(e) => setData((prev) => ({
                    ...prev,
                    closure_checklist: { ...prev.closure_checklist, [key]: e.target.checked },
                  }))}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Final status">
              <select className="h-10 w-full rounded-md border border-slate-200 px-2 text-sm" value={form.closure_status || 'Completed'} onChange={(e) => setF('closure_status', e.target.value)}>
                {(meta.closure_statuses || ['Completed']).map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Warranty notes">{input('warranty_notes')}</Field>
          </div>
          <Button disabled={saving} onClick={() => post('/close', {
            closure_status: form.closure_status || 'Completed',
            checklist: data.closure_checklist || {},
            warranty_notes: form.warranty_notes,
            amc_notes: form.amc_notes,
          }, 'Operation closed')}>Close operation</Button>
        </Card>
      )}

      <Dialog open={Boolean(dialog)} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{dialog}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {dialog === 'edit' && (
              <>
                <Field label="Current stage">
                  <select className="h-10 w-full rounded-md border px-2 text-sm" value={form.current_stage || ''} onChange={(e) => setF('current_stage', e.target.value)}>
                    {stages.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Blocker">
                  <select className="h-10 w-full rounded-md border px-2 text-sm" value={form.blocker_category || ''} onChange={(e) => setF('blocker_category', e.target.value)}>
                    <option value="">None</option>
                    {(meta.blocker_categories || []).map((s) => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Blocker description">{input('blocker_description')}</Field>
                <Field label="Next action">{input('next_action')}</Field>
                <Field label="Next action date">{input('next_action_date', 'date')}</Field>
                <Field label="Target date">{input('target_date', 'date')}</Field>
                <Button disabled={saving} onClick={() => put('', form, 'Operation updated')}>Save</Button>
              </>
            )}
            {dialog === 'task' && (
              <>
                <Field label="Task name">{input('task_name')}</Field>
                <Field label="Due date">{input('due_date', 'date')}</Field>
                <Field label="Assigned to">{input('assigned_to_name')}</Field>
                <Field label="Next action">{input('next_action')}</Field>
                <Button disabled={saving} onClick={() => post('/tasks', form, 'Task added')}>Save task</Button>
              </>
            )}
            {dialog === 'update' && (
              <>
                <Field label="Action type">
                  <select className="h-10 w-full rounded-md border px-2 text-sm" value={form.action_type || ''} onChange={(e) => setF('action_type', e.target.value)}>
                    {(meta.action_types || []).map((s) => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="What happened">{input('action_result')}</Field>
                <Field label="Next action">{input('next_action')}</Field>
                <Field label="Next action date">{input('next_action_date', 'date')}</Field>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={Boolean(form.mark_task_complete)} onChange={(e) => setF('mark_task_complete', e.target.checked)} />
                  Mark selected task complete
                </label>
                {form.mark_task_complete && <Field label="Completion proof">{input('completion_proof')}</Field>}
                <Button disabled={saving} onClick={() => post('/updates', form, 'Update saved')}>Save update</Button>
              </>
            )}
            {dialog === 'vendor' && (
              <>
                <Field label="Vendor">{input('vendor_name')}</Field>
                <Field label="Contact">{input('contact_person')}</Field>
                <Field label="Phone">{input('phone')}</Field>
                <Field label="Vendor PO">{input('vendor_po')}</Field>
                <Field label="Confirmed delivery">{input('confirmed_delivery', 'date')}</Field>
                <Button disabled={saving} onClick={() => post('/vendors', form, 'Vendor added')}>Save</Button>
              </>
            )}
            {dialog === 'material' && (
              <>
                <Field label="Description">{input('description')}</Field>
                <Field label="Specification">{input('specification')}</Field>
                <Field label="Required qty">{input('required_qty', 'number')}</Field>
                <Field label="Vendor">{input('vendor_name')}</Field>
                <Field label="Status">
                  <select className="h-10 w-full rounded-md border px-2 text-sm" value={form.status || 'Required'} onChange={(e) => setF('status', e.target.value)}>
                    {(meta.material_statuses || []).map((s) => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <Button disabled={saving} onClick={() => post('/materials', { ...form, required_qty: Number(form.required_qty || 0), ordered_qty: Number(form.ordered_qty || 0), received_qty: Number(form.received_qty || 0) }, 'Material added')}>Save</Button>
              </>
            )}
            {dialog === 'dispatch' && (
              <>
                <Field label="Dispatch date">{input('dispatch_date', 'date')}</Field>
                <Field label="Material">{input('material')}</Field>
                <Field label="Transporter">{input('transporter')}</Field>
                <Field label="LR number">{input('lr_number')}</Field>
                <Field label="Expected delivery">{input('expected_delivery', 'date')}</Field>
                <Button disabled={saving} onClick={() => post('/dispatches', form, 'Dispatch added')}>Save</Button>
              </>
            )}
            {dialog === 'site' && (
              <>
                <Field label="Site address">{input('site_address')}</Field>
                <Field label="Engineer">{input('engineer_name')}</Field>
                <Field label="Planned date">{input('planned_date', 'date')}</Field>
                <Field label="Problem reported">{input('problem_reported')}</Field>
                <Field label="Work performed">{input('work_performed')}</Field>
                <Button disabled={saving} onClick={() => post('/site-visits', form, 'Site visit added')}>Save</Button>
              </>
            )}
            {dialog === 'install' && (
              <>
                <Field label="Engineer">{input('engineer_name')}</Field>
                <Field label="Status">{input('installation_status')}</Field>
                <Field label="Planned date">{input('planned_date', 'date')}</Field>
                <Field label="Equipment">{input('equipment')}</Field>
                <Button disabled={saving} onClick={() => post('/installations', form, 'Installation added')}>Save</Button>
              </>
            )}
            {dialog === 'expense' && (
              <>
                <Field label="Category">
                  <select className="h-10 w-full rounded-md border px-2 text-sm" value={form.category || ''} onChange={(e) => setF('category', e.target.value)}>
                    {(meta.expense_categories || []).map((s) => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Amount">{input('amount', 'number')}</Field>
                <Field label="Purpose">{input('purpose')}</Field>
                <Button disabled={saving} onClick={() => post('/expenses', { ...form, amount: Number(form.amount || 0) }, 'Expense added')}>Save</Button>
              </>
            )}
            {dialog === 'invoice' && (
              <>
                <Field label="Invoice no">{input('invoice_no')}</Field>
                <Field label="Amount">{input('invoice_amount', 'number')}</Field>
                <Field label="Invoice date">{input('invoice_date', 'date')}</Field>
                <Field label="Due date">{input('due_date', 'date')}</Field>
                <Button disabled={saving} onClick={() => post('/invoices', { ...form, invoice_amount: Number(form.invoice_amount || 0) }, 'Invoice created')}>Save</Button>
              </>
            )}
            {dialog === 'payment' && (
              <>
                <Field label="Invoice">
                  <select className="h-10 w-full rounded-md border px-2 text-sm" value={form.invoice_id || ''} onChange={(e) => setF('invoice_id', e.target.value)}>
                    {(data.invoices || []).map((inv) => <option key={inv.id} value={inv.id}>{inv.invoice_no}</option>)}
                  </select>
                </Field>
                <Field label="Amount">{input('amount', 'number')}</Field>
                <Field label="Date">{input('received_date', 'date')}</Field>
                <Field label="Mode">{input('mode')}</Field>
                <Button disabled={saving} onClick={() => post('/payments', { ...form, amount: Number(form.amount || 0) }, 'Payment recorded')}>Save</Button>
              </>
            )}
            {dialog === 'followup' && (
              <>
                <Field label="Type">{input('followup_type')}</Field>
                <Field label="Next action">{input('next_action')}</Field>
                <Field label="Due date">{input('due_date', 'date')}</Field>
                <Button disabled={saving} onClick={() => post('/followups', form, 'Follow-up added')}>Save</Button>
              </>
            )}
            {dialog === 'document' && (
              <>
                <Field label="Folder">
                  <select className="h-10 w-full rounded-md border px-2 text-sm" value={form.folder || ''} onChange={(e) => setF('folder', e.target.value)}>
                    {(meta.document_folders || []).map((s) => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="File name">{input('file_name')}</Field>
                <Field label="File URL">{input('file_url')}</Field>
                <Button disabled={saving} onClick={() => post('/documents', form, 'Document added')}>Save</Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default OperationWorkspace;
