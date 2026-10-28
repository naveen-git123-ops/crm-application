import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { fmtDate, serviceApi } from '@/lib/serviceUtils';
import { FieldGrid, FormField } from '@/components/service/ServiceFields';

const toLines = (list) => (list || []).join('\n');
const fromLines = (text) => String(text || '').split('\n').map((s) => s.trim()).filter(Boolean);

function errorText(err, fallback) {
  const detail = err?.response?.data?.detail;
  return Array.isArray(detail) ? detail.join('; ') : getApiErrorMessage(err, fallback);
}

const AMC_BLANK = {
  start_date: '', end_date: '', status: 'Active', planned_visits: '', next_planned_date: '', notes: '',
  covered_product_ids: [], covered_service_types: [],
};

/** AMC contracts: pick a customer, then add or edit that customer's contracts and covered products. */
export function AmcDialog({ open, onClose, serviceTypes }) {
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const amcTypes = (serviceTypes || []).filter((t) => t === 'AMC Visit' || t === 'Preventive Maintenance' || t === 'Repair' || t === 'Troubleshooting / Breakdown' || t === 'General Service');

  useEffect(() => {
    if (!open) {
      setQuery(''); setCustomers([]); setCustomer(null); setContracts([]); setProducts([]); setForm(null); setEditingId(''); setError('');
      return undefined;
    }
    if (customer) return undefined;
    const timer = setTimeout(async () => {
      try {
        setCustomers(await serviceApi.get('/service/customers', { q: query, limit: 15 }));
      } catch (err) {
        toast.error(getApiErrorMessage(err, 'Could not search customers'));
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [open, query, customer]);

  const loadFor = useCallback(async (c) => {
    const [list, prods] = await Promise.all([
      serviceApi.get('/service/amc', { customer_id: c.id }),
      serviceApi.get('/service/products', { customer_id: c.id }),
    ]);
    setContracts(list);
    setProducts(prods);
  }, []);

  const choose = async (c) => {
    setCustomer(c);
    try {
      await loadFor(c);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not load contracts'));
    }
  };

  const edit = (contract) => {
    setEditingId(contract.id);
    setForm({
      ...AMC_BLANK,
      ...contract,
      planned_visits: contract.planned_visits ?? '',
      covered_product_ids: contract.covered_product_ids || [],
      covered_service_types: contract.covered_service_types || [],
    });
    setError('');
  };

  const toggle = (key, value) => setForm((prev) => {
    const set = new Set(prev[key]);
    if (set.has(value)) set.delete(value); else set.add(value);
    return { ...prev, [key]: Array.from(set) };
  });

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const body = { ...form, customer_id: customer.id };
      if (editingId) await serviceApi.put(`/service/amc/${editingId}`, body);
      else await serviceApi.post('/service/amc', body);
      toast.success('AMC contract saved');
      setForm(null);
      setEditingId('');
      await loadFor(customer);
    } catch (err) {
      setError(errorText(err, 'Could not save the contract'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value && !busy) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>AMC contracts</DialogTitle>
          <DialogDescription>Contracts decide which products and service types an AMC visit can be booked for.</DialogDescription>
        </DialogHeader>

        {!customer ? (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input aria-label="Search customer" className="pl-8" placeholder="Search customer" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
            </div>
            <ul className="max-h-64 divide-y overflow-y-auto rounded-lg border">
              {customers.map((c) => (
                <li key={c.id}>
                  <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => choose(c)}>
                    <span className="font-medium">{c.company_name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{c.customer_id}</span>
                  </button>
                </li>
              ))}
              {customers.length === 0 && <li className="px-3 py-4 text-sm text-muted-foreground">No customers found.</li>}
            </ul>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">{customer.company_name}</div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setCustomer(null); setForm(null); setEditingId(''); }}>Change customer</Button>
                {!form && <Button size="sm" onClick={() => { setForm({ ...AMC_BLANK }); setEditingId(''); setError(''); }}><Plus className="mr-1 h-4 w-4" />New contract</Button>}
              </div>
            </div>

            {!form && (
              <ul className="space-y-2">
                {contracts.length === 0 && <li className="text-sm text-muted-foreground">No AMC contracts for this customer.</li>}
                {contracts.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                    <div className="text-sm">
                      <div className="font-semibold">{c.amc_number} <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs">{c.effective_status}</span></div>
                      <div className="text-xs text-muted-foreground">{fmtDate(c.start_date)} – {fmtDate(c.end_date)} · {c.visits_used}{c.planned_visits ? ` of ${c.planned_visits}` : ''} visits used</div>
                      <div className="text-xs text-muted-foreground">
                        Covers {(c.covered_product_ids || []).length === 0 ? 'all products' : `${c.covered_product_ids.length} product(s)`}
                        {(c.covered_service_types || []).length > 0 ? ` · ${c.covered_service_types.join(', ')}` : ''}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => edit(c)}>Edit</Button>
                  </li>
                ))}
              </ul>
            )}

            {form && (
              <div className="space-y-3 rounded-lg border border-border p-3">
                {error && <p className="rounded bg-rose-50 p-2 text-sm text-rose-800" role="alert">{error}</p>}
                <FieldGrid>
                  <FormField field={{ key: 'start_date', label: 'Start date', type: 'date', required: true }} value={form.start_date} onChange={(v) => setForm((p) => ({ ...p, start_date: v }))} />
                  <FormField field={{ key: 'end_date', label: 'End date', type: 'date', required: true }} value={form.end_date} onChange={(v) => setForm((p) => ({ ...p, end_date: v }))} />
                  <FormField field={{ key: 'status', label: 'Status', type: 'select' }} options={['Draft', 'Active', 'Cancelled']} value={form.status === 'Expired' ? 'Active' : form.status} onChange={(v) => setForm((p) => ({ ...p, status: v }))} />
                  <FormField field={{ key: 'planned_visits', label: 'Planned visits per contract', type: 'number' }} value={form.planned_visits} onChange={(v) => setForm((p) => ({ ...p, planned_visits: v }))} />
                  <FormField field={{ key: 'next_planned_date', label: 'Next planned visit', type: 'date' }} value={form.next_planned_date} onChange={(v) => setForm((p) => ({ ...p, next_planned_date: v }))} />
                  <FormField field={{ key: 'notes', label: 'Notes', type: 'textarea', wide: true }} value={form.notes} onChange={(v) => setForm((p) => ({ ...p, notes: v }))} />
                </FieldGrid>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Covered products (none ticked = all products of this customer)</Label>
                  <div className="mt-1 grid max-h-40 grid-cols-1 gap-1 overflow-y-auto rounded-lg border p-2 md:grid-cols-2">
                    {products.length === 0 && <p className="text-sm text-muted-foreground">No registered products for this customer.</p>}
                    {products.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-sm">
                        <Checkbox checked={form.covered_product_ids.includes(p.id)} onCheckedChange={() => toggle('covered_product_ids', p.id)} />
                        {p.name}{p.serial_number ? ` (${p.serial_number})` : ''}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Covered service types (none ticked = all)</Label>
                  <div className="mt-1 flex flex-wrap gap-3 rounded-lg border p-2">
                    {amcTypes.map((t) => (
                      <label key={t} className="flex items-center gap-2 text-sm">
                        <Checkbox checked={form.covered_service_types.includes(t)} onCheckedChange={() => toggle('covered_service_types', t)} />
                        {t}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => { setForm(null); setEditingId(''); setError(''); }} disabled={busy}>Cancel</Button>
                  <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save contract'}</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const CHECKLIST_LABELS = {
  installation_inspection: 'Installation: site inspection',
  installation_execution: 'Installation: execution',
  commissioning: 'Commissioning',
  repair_inspection: 'Repair: troubleshooting inspection',
  amc: 'AMC visit',
};

const WORKFLOW_LABELS = { installation: 'Installation & commissioning', repair: 'Repair / service', amc: 'AMC visit' };

function toForm(config) {
  return {
    problem_categories: toLines(config.problem_categories),
    vendor_stages: toLines(config.vendor_stages),
    checklists: Object.fromEntries(Object.keys(CHECKLIST_LABELS).map((k) => [k, toLines(config.checklists?.[k])])),
    mandatory_evidence: { installation: [], repair: [], amc: [], ...(config.mandatory_evidence || {}) },
    ack_required_types: config.ack_required_types || [],
    amc_required: config.amc_required !== false,
    allow_unassigned: Boolean(config.allow_unassigned),
    require_lead_for_existing: config.require_lead_for_existing !== false,
    vendor_approval_required: Boolean(config.vendor_approval_required),
    company_profile: { name: '', address: '', phone: '', email: '', ...(config.company_profile || {}) },
  };
}

/** Company policy for the module. Only service managers can open this. */
export function ServiceSettingsDialog({ open, onClose, meta, onSaved }) {
  const [form, setForm] = useState(() => toForm(meta.config));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const allTypes = Array.from(new Set(Object.values(meta.service_types_by_customer || {}).flat()));

  useEffect(() => {
    if (open) { setForm(toForm(meta.config)); setError(''); }
  }, [open, meta.config]);

  const flag = (key, label, hint) => (
    <label className="flex items-start gap-2 text-sm">
      <Checkbox className="mt-0.5" checked={form[key]} onCheckedChange={(v) => setForm((p) => ({ ...p, [key]: v === true }))} />
      <span><span className="font-medium">{label}</span><span className="block text-xs text-muted-foreground">{hint}</span></span>
    </label>
  );

  const toggleIn = (key, value) => setForm((p) => {
    const set = new Set(p[key]);
    if (set.has(value)) set.delete(value); else set.add(value);
    return { ...p, [key]: Array.from(set) };
  });

  const toggleEvidence = (workflow, category) => setForm((p) => {
    const set = new Set(p.mandatory_evidence[workflow] || []);
    if (set.has(category)) set.delete(category); else set.add(category);
    return { ...p, mandatory_evidence: { ...p.mandatory_evidence, [workflow]: Array.from(set) } };
  });

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const saved = await serviceApi.put('/service/config', {
        problem_categories: fromLines(form.problem_categories),
        vendor_stages: fromLines(form.vendor_stages),
        checklists: Object.fromEntries(Object.entries(form.checklists).map(([k, v]) => [k, fromLines(v)])),
        mandatory_evidence: form.mandatory_evidence,
        ack_required_types: form.ack_required_types,
        amc_required: form.amc_required,
        allow_unassigned: form.allow_unassigned,
        require_lead_for_existing: form.require_lead_for_existing,
        vendor_approval_required: form.vendor_approval_required,
        company_profile: form.company_profile,
      });
      toast.success('Service settings saved');
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(errorText(err, 'Could not save the settings'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value && !busy) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Service settings</DialogTitle>
          <DialogDescription>Company policy for the Service & Maintenance module. Changes apply to new requests and to the completion checks.</DialogDescription>
        </DialogHeader>
        {error && <p className="rounded bg-rose-50 p-2 text-sm text-rose-800" role="alert">{error}</p>}
        <Tabs defaultValue="rules">
          <TabsList className="flex-wrap">
            <TabsTrigger value="rules">Rules</TabsTrigger>
            <TabsTrigger value="lists">Lists</TabsTrigger>
            <TabsTrigger value="evidence">Mandatory evidence</TabsTrigger>
            <TabsTrigger value="checklists">Checklists</TabsTrigger>
            <TabsTrigger value="company">Report header</TabsTrigger>
          </TabsList>

          <TabsContent value="rules" className="space-y-3 pt-3">
            {flag('require_lead_for_existing', 'Existing customers must pick a lead', 'The request is then always linked to a lead.')}
            {flag('amc_required', 'AMC visits need an active contract', 'Blocks booking an AMC visit without a contract that covers the product.')}
            {flag('allow_unassigned', 'Allow work without an assigned technician', 'Normally a technician is required before work starts.')}
            {flag('vendor_approval_required', 'Vendor repair needs an approval step', 'Hides the shortcut that skips “Awaiting Approval”.')}
            <div>
              <Label className="text-xs font-medium text-muted-foreground">Customer acknowledgement is mandatory for</Label>
              <div className="mt-1 flex flex-wrap gap-3 rounded-lg border p-2">
                {allTypes.map((t) => (
                  <label key={t} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={form.ack_required_types.includes(t)} onCheckedChange={() => toggleIn('ack_required_types', t)} />
                    {t}
                  </label>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="lists" className="space-y-3 pt-3">
            <div className="space-y-1">
              <Label htmlFor="cfg-problems" className="text-xs font-medium text-muted-foreground">Problem categories (one per line)</Label>
              <Textarea id="cfg-problems" rows={7} value={form.problem_categories} onChange={(e) => setForm((p) => ({ ...p, problem_categories: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cfg-stages" className="text-xs font-medium text-muted-foreground">Vendor repair stages (one per line, in order)</Label>
              <Textarea id="cfg-stages" rows={11} value={form.vendor_stages} onChange={(e) => setForm((p) => ({ ...p, vendor_stages: e.target.value }))} />
              <p className="text-xs text-muted-foreground">
                You can add, remove or reorder stages. These carry rules and must stay: {meta.required_vendor_stages.join(' · ')}. The last stage must be “{meta.required_vendor_stages[meta.required_vendor_stages.length - 1]}”.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="evidence" className="space-y-3 pt-3">
            <p className="text-xs text-muted-foreground">The request cannot be completed until at least one file exists in each ticked category.</p>
            {Object.keys(WORKFLOW_LABELS).map((workflow) => (
              <div key={workflow}>
                <Label className="text-xs font-semibold text-foreground">{WORKFLOW_LABELS[workflow]}</Label>
                <div className="mt-1 grid grid-cols-1 gap-1 rounded-lg border p-2 md:grid-cols-2">
                  {meta.attachment_categories.map((cat) => (
                    <label key={cat} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={(form.mandatory_evidence[workflow] || []).includes(cat)} onCheckedChange={() => toggleEvidence(workflow, cat)} />
                      {cat}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="checklists" className="space-y-3 pt-3">
            <p className="text-xs text-muted-foreground">One item per line. New requests copy these items; existing requests keep their own list.</p>
            {Object.entries(CHECKLIST_LABELS).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`cfg-${key}`} className="text-xs font-medium text-muted-foreground">{label}</Label>
                <Textarea id={`cfg-${key}`} rows={5} value={form.checklists[key]} onChange={(e) => setForm((p) => ({ ...p, checklists: { ...p.checklists, [key]: e.target.value } }))} />
              </div>
            ))}
          </TabsContent>

          <TabsContent value="company" className="pt-3">
            <p className="mb-2 text-xs text-muted-foreground">Shown at the top of the final service report and its PDF.</p>
            <FieldGrid>
              {[
                { key: 'name', label: 'Company name', type: 'text' },
                { key: 'phone', label: 'Phone', type: 'text' },
                { key: 'email', label: 'Email', type: 'text' },
                { key: 'address', label: 'Address', type: 'textarea', wide: true },
              ].map((field) => (
                <FormField key={field.key} field={field} value={form.company_profile[field.key]} onChange={(v) => setForm((p) => ({ ...p, company_profile: { ...p.company_profile, [field.key]: v } }))} />
              ))}
            </FieldGrid>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
