import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search, TrendingUp, IndianRupee } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useRegisterPageHeader } from '@/contexts/PageHeaderContext';
import { API_ENDPOINT } from '@/lib/apiConfig';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { cn } from '@/lib/utils';

const API = API_ENDPOINT;
const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

const STAGES = [
  'Identified',
  'In discussion',
  'Proposal',
  'Committed',
  'Converted',
  'Dropped',
];

const STAGE_STYLES = {
  Identified: 'bg-slate-100 text-slate-700',
  'In discussion': 'bg-sky-50 text-sky-800',
  Proposal: 'bg-indigo-50 text-indigo-700',
  Committed: 'bg-amber-50 text-amber-800',
  Converted: 'bg-emerald-50 text-emerald-800',
  Dropped: 'bg-rose-50 text-rose-700',
};

const emptyForm = () => ({
  account_name: '',
  customer_id: '',
  location: '',
  opportunity: '',
  estimated_value: '',
  probability: '50',
  stage: 'Identified',
  expected_date: '',
  assigned_to_employee_id: '',
  notes: '',
});

const formatMoney = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '₹0';
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};

const weightedValue = (row) => {
  const value = Number(row?.estimated_value) || 0;
  const probability = Number(row?.probability) || 0;
  return (value * probability) / 100;
};

const selectClass =
  'flex h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900';

export function BusinessPotential() {
  const [items, setItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());

  const fetchItems = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/business-potentials`, authHeaders());
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to load business potential'));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
    axios
      .get(`${API}/customers?entity_type=0`, authHeaders())
      .then((r) => setCustomers(Array.isArray(r.data) ? r.data : []))
      .catch(() => setCustomers([]));
    axios
      .get(`${API}/employees`, authHeaders())
      .then((r) => setEmployees(Array.isArray(r.data) ? r.data : []))
      .catch(() => setEmployees([]));
  }, [fetchItems]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((row) => {
      if (stageFilter && row.stage !== stageFilter) return false;
      if (!term) return true;
      return [
        row.account_name,
        row.customer_name,
        row.location,
        row.opportunity,
        row.assigned_to_name,
        row.notes,
        row.stage,
      ].some((v) => String(v || '').toLowerCase().includes(term));
    });
  }, [items, search, stageFilter]);

  const summary = useMemo(() => {
    const active = items.filter((r) => r.stage !== 'Converted' && r.stage !== 'Dropped');
    const totalPotential = active.reduce((s, r) => s + (Number(r.estimated_value) || 0), 0);
    const weighted = active.reduce((s, r) => s + weightedValue(r), 0);
    const converted = items.filter((r) => r.stage === 'Converted').length;
    return { total: items.length, totalPotential, weighted, converted };
  }, [items]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      account_name: row.account_name || '',
      customer_id: row.customer_id || '',
      location: row.location || '',
      opportunity: row.opportunity || '',
      estimated_value: row.estimated_value == null ? '' : String(row.estimated_value),
      probability: row.probability == null ? '' : String(row.probability),
      stage: row.stage || 'Identified',
      expected_date: row.expected_date || '',
      assigned_to_employee_id: row.assigned_to_employee_id || '',
      notes: row.notes || '',
    });
    setDialogOpen(true);
  };

  const onChange = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const onCustomerChange = (customerId) => {
    const customer = customers.find((c) => c.id === customerId);
    setForm((prev) => ({
      ...prev,
      customer_id: customerId,
      account_name: customer?.company_name || prev.account_name,
      location: customer?.city || prev.location,
    }));
  };

  const saveRecord = async () => {
    if (!(form.account_name || '').trim()) {
      toast.error('Please enter an account name');
      return;
    }
    const assignee = employees.find((e) => e.employee_id === form.assigned_to_employee_id);
    const payload = {
      account_name: form.account_name.trim(),
      customer_id: form.customer_id || null,
      customer_name: form.account_name.trim(),
      location: form.location.trim() || null,
      opportunity: form.opportunity.trim() || null,
      estimated_value: form.estimated_value === '' ? 0 : Number(form.estimated_value),
      probability: form.probability === '' ? 0 : Number(form.probability),
      stage: form.stage,
      expected_date: form.expected_date || null,
      assigned_to_employee_id: form.assigned_to_employee_id || null,
      assigned_to_name: assignee?.name || null,
      notes: form.notes.trim() || null,
    };
    setSaving(true);
    try {
      if (editing?.id) {
        await axios.put(`${API}/business-potentials/${editing.id}`, payload, authHeaders());
        toast.success('Business potential updated');
      } else {
        await axios.post(`${API}/business-potentials`, payload, authHeaders());
        toast.success('Business potential added');
      }
      setDialogOpen(false);
      await fetchItems();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to save business potential'));
    } finally {
      setSaving(false);
    }
  };

  const deleteRecord = async (row) => {
    if (!window.confirm(`Delete business potential for "${row.account_name}"?`)) return;
    try {
      await axios.delete(`${API}/business-potentials/${row.id}`, authHeaders());
      toast.success('Record deleted');
      await fetchItems();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to delete record'));
    }
  };

  const pageHeaderActions = useMemo(
    () => (
      <Button className="h-9" onClick={openCreate}>
        <Plus className="h-4 w-4 mr-1.5" />
        Add potential
      </Button>
    ),
    [],
  );

  useRegisterPageHeader({
    subtitle: `${summary.total} ${summary.total === 1 ? 'record' : 'records'}`,
    actions: pageHeaderActions,
    enabled: !loading,
  });

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="business-potential-page">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Records</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{summary.total}</p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <IndianRupee className="h-3.5 w-3.5" /> Active potential
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{formatMoney(summary.totalPotential)}</p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" /> Weighted
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-indigo-700">{formatMoney(summary.weighted)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Converted</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-700">{summary.converted}</p>
        </Card>
      </div>

      <Card className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search account, location, opportunity…"
              className="h-10 pl-9"
            />
          </div>
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm"
          >
            <option value="">All stages</option>
            {STAGES.map((stage) => (
              <option key={stage} value={stage}>{stage}</option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <TrendingUp className="mx-auto mb-2 h-12 w-12 opacity-40" />
            <p>{items.length === 0 ? 'No business potential records yet.' : 'No records match your search.'}</p>
            {items.length === 0 ? (
              <p className="mt-1 text-sm">Add an account to start tracking potential business.</p>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-3 font-semibold">Account</th>
                  <th className="px-3 py-3 font-semibold">Opportunity</th>
                  <th className="px-3 py-3 font-semibold">Stage</th>
                  <th className="px-3 py-3 font-semibold text-right">Potential</th>
                  <th className="px-3 py-3 font-semibold text-right">Weighted</th>
                  <th className="px-3 py-3 font-semibold">Assigned</th>
                  <th className="px-3 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100 hover:bg-slate-50/70">
                    <td className="px-3 py-3">
                      <div className="font-medium text-gray-900">{row.account_name}</div>
                      <div className="mt-0.5 text-xs text-gray-500">{row.location || '—'}</div>
                    </td>
                    <td className="px-3 py-3 text-gray-700">{row.opportunity || '—'}</td>
                    <td className="px-3 py-3">
                      <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium', STAGE_STYLES[row.stage] || STAGE_STYLES.Identified)}>
                        {row.stage}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-medium text-gray-900">
                      {formatMoney(row.estimated_value)}
                      <div className="text-[11px] font-normal text-gray-500">{Number(row.probability) || 0}%</div>
                    </td>
                    <td className="px-3 py-3 text-right text-gray-700">{formatMoney(weightedValue(row))}</td>
                    <td className="px-3 py-3 text-gray-700">{row.assigned_to_name || '—'}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(row)} title="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-rose-600 hover:text-rose-700" onClick={() => deleteRecord(row)} title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg bg-white rounded-xl border shadow-xl p-0 max-h-[90vh] overflow-y-auto">
          <div className="bg-gradient-to-r from-slate-900 to-indigo-900 text-white px-6 py-5 rounded-t-xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-white tracking-tight">
                {editing ? 'Edit business potential' : 'New business potential'}
              </DialogTitle>
            </DialogHeader>
          </div>
          <form
            className="p-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveRecord();
            }}
          >
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700">Customer</Label>
              <select
                value={form.customer_id}
                onChange={(e) => onCustomerChange(e.target.value)}
                className={selectClass}
              >
                <option value="">Select customer (optional)</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.company_name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700">Account name *</Label>
              <Input
                value={form.account_name}
                onChange={(e) => onChange('account_name', e.target.value)}
                className="h-11"
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700">Location</Label>
                <Input value={form.location} onChange={(e) => onChange('location', e.target.value)} className="h-11" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700">Opportunity</Label>
                <Input value={form.opportunity} onChange={(e) => onChange('opportunity', e.target.value)} className="h-11" placeholder="Product or service" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700">Estimated value (₹)</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.estimated_value}
                  onChange={(e) => onChange('estimated_value', e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700">Probability (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={form.probability}
                  onChange={(e) => onChange('probability', e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700">Stage</Label>
                <select value={form.stage} onChange={(e) => onChange('stage', e.target.value)} className={selectClass}>
                  {STAGES.map((stage) => (
                    <option key={stage} value={stage}>{stage}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700">Expected date</Label>
                <Input type="date" value={form.expected_date} onChange={(e) => onChange('expected_date', e.target.value)} className="h-11" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700">Assigned to</Label>
              <select
                value={form.assigned_to_employee_id}
                onChange={(e) => onChange('assigned_to_employee_id', e.target.value)}
                className={selectClass}
              >
                <option value="">Unassigned</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.employee_id}>{emp.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700">Notes</Label>
              <textarea
                value={form.notes}
                onChange={(e) => onChange('notes', e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white" disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Update' : 'Save'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default BusinessPotential;
