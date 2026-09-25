import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import {
  AlertTriangle, CheckCircle2, Clock, Filter, Plus, Search, UserRound,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useRegisterPageHeader } from '@/contexts/PageHeaderContext';
import { API_ENDPOINT } from '@/lib/apiConfig';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { HEALTH_STYLES, formatMoney, openOperationTab } from '@/lib/operationUtils';
import { cn } from '@/lib/utils';

const API = API_ENDPOINT;

const KPI_CARDS = [
  { key: 'active', label: 'Active', filter: { view: 'active' } },
  { key: 'due_today', label: 'Due today', filter: { view: 'active', health: '' } },
  { key: 'overdue', label: 'Overdue', filter: { view: 'active', health: 'red' } },
  { key: 'at_risk', label: 'At risk', filter: { view: 'active', health: 'yellow' } },
  { key: 'customer_hold', label: 'Customer hold', filter: { view: 'active' } },
  { key: 'vendor_hold', label: 'Vendor hold', filter: { view: 'active' } },
  { key: 'payment_pending', label: 'Payment pending', filter: { view: 'historical' } },
  { key: 'completed', label: 'Completed', filter: { view: 'completed' } },
];

export function Operations() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const authHeader = useCallback(
    () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` }),
    [],
  );

  const [tab, setTab] = useState('control');
  const [stats, setStats] = useState({});
  const [attention, setAttention] = useState([]);
  const [rows, setRows] = useState([]);
  const [myWork, setMyWork] = useState({ counts: {}, overdue: [], due_today: [], upcoming: [], completed: [] });
  const [meta, setMeta] = useState({ operation_types: [] });
  const [employees, setEmployees] = useState([]);
  const [wonLeads, setWonLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('active');
  const [health, setHealth] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    lead_id: '',
    customer_name: '',
    project_name: '',
    po_number: '',
    po_value: '',
    estimated_cost: '',
    operation_type: 'Stock & Sell',
    target_date: '',
    responsible_employee_id: '',
    priority: 'Medium',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ view });
      if (search) params.set('q', search);
      if (health) params.set('health', health);
      if (typeFilter) params.set('operation_type', typeFilter);
      const [statsRes, attRes, listRes, workRes, metaRes, wonRes, empRes] = await Promise.all([
        axios.get(`${API}/operations/stats`, { headers: authHeader() }),
        axios.get(`${API}/operations/attention`, { headers: authHeader() }),
        axios.get(`${API}/operations?${params.toString()}`, { headers: authHeader() }),
        axios.get(`${API}/operations/my-work`, { headers: authHeader() }),
        axios.get(`${API}/operations/meta`, { headers: authHeader() }),
        axios.get(`${API}/operations/won-leads`, { headers: authHeader() }).catch(() => ({ data: [] })),
        axios.get(`${API}/employees`, { headers: authHeader() }).catch(() => ({ data: [] })),
      ]);
      setStats(statsRes.data || {});
      setAttention(attRes.data || []);
      setRows(listRes.data || []);
      setMyWork(workRes.data || { counts: {}, overdue: [], due_today: [], upcoming: [], completed: [] });
      setMeta(metaRes.data || { operation_types: [] });
      setWonLeads(wonRes.data || []);
      setEmployees(empRes.data || []);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to load operations'));
    } finally {
      setLoading(false);
    }
  }, [authHeader, health, search, typeFilter, view]);

  useEffect(() => {
    load();
  }, [load]);

  useRegisterPageHeader({
    subtitle: 'Control confirmed customer work after a lead is won',
    actions: (
      <Button size="sm" onClick={() => setCreateOpen(true)}>
        <Plus className="h-4 w-4 mr-1" />
        New operation
      </Button>
    ),
    enabled: true,
  });

  const applyKpi = (card) => {
    if (card.key === 'due_today') {
      setView('active');
      setHealth('');
      setTab('control');
      return;
    }
    setView(card.filter.view);
    setHealth(card.filter.health || '');
    setTab('control');
  };

  const submitCreate = async () => {
    if (!form.lead_id && !form.customer_name) {
      toast.error('Select a won lead or enter a customer name');
      return;
    }
    setCreating(true);
    try {
      const payload = {
        lead_id: form.lead_id || undefined,
        customer_name: form.customer_name || undefined,
        project_name: form.project_name || undefined,
        po_number: form.po_number || undefined,
        po_value: form.po_value ? Number(form.po_value) : undefined,
        estimated_cost: form.estimated_cost ? Number(form.estimated_cost) : undefined,
        operation_type: form.operation_type,
        target_date: form.target_date || undefined,
        responsible_employee_id: form.responsible_employee_id || user?.employee_id,
        responsible_name: employees.find((e) => e.employee_id === form.responsible_employee_id)?.name || user?.name,
        priority: form.priority,
      };
      const { data } = await axios.post(`${API}/operations`, payload, { headers: authHeader() });
      toast.success(`${data.operation_code} created`);
      setCreateOpen(false);
      navigate(`/operations/${data.id}`);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not create operation'));
    } finally {
      setCreating(false);
    }
  };

  const filteredDueToday = useMemo(
    () => rows.filter((row) => row.next_action_date && row.next_action_date === new Date().toISOString().slice(0, 10)),
    [rows],
  );

  const tableRows = health === '' && view === 'active' && stats.due_today && false ? filteredDueToday : rows;

  return (
    <div className="space-y-4 pb-8" data-testid="operations-page">
      <div className="flex flex-wrap gap-2">
        {[
          { key: 'control', label: 'Control center' },
          { key: 'my', label: 'My work' },
          { key: 'historical', label: 'Historical' },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              setTab(item.key);
              if (item.key === 'historical') setView('historical');
              if (item.key === 'control') setView('active');
            }}
            className={cn(
              'h-9 rounded-lg border px-3 text-sm font-medium',
              tab === item.key ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-700',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
        {KPI_CARDS.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => applyKpi(card)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-left hover:border-indigo-200 hover:shadow-sm"
          >
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{card.label}</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{stats[card.key] ?? 0}</div>
          </button>
        ))}
      </div>

      {tab === 'my' ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {[
            { key: 'overdue', title: 'Overdue', icon: AlertTriangle, tone: 'text-rose-700 bg-rose-50 border-rose-200' },
            { key: 'due_today', title: 'Due today', icon: Clock, tone: 'text-amber-800 bg-amber-50 border-amber-200' },
            { key: 'upcoming', title: 'Upcoming', icon: UserRound, tone: 'text-indigo-800 bg-indigo-50 border-indigo-200' },
            { key: 'completed', title: 'Completed', icon: CheckCircle2, tone: 'text-emerald-800 bg-emerald-50 border-emerald-200' },
          ].map((bucket) => (
            <Card key={bucket.key} className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-800">{bucket.title}</h3>
                <span className="text-sm text-slate-500">{myWork.counts?.[bucket.key] || 0}</span>
              </div>
              <div className="space-y-2">
                {(myWork[bucket.key] || []).slice(0, 8).map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => navigate(`/operations/${task.operation_id}`)}
                    className={cn('w-full rounded-lg border px-3 py-2 text-left text-sm', bucket.tone)}
                  >
                    <div className="font-medium">{task.customer_name || task.operation_code}</div>
                    <div className="text-xs opacity-80">{task.task_name} · due {task.due_date || '—'}</div>
                  </button>
                ))}
                {(myWork[bucket.key] || []).length === 0 && (
                  <p className="text-sm text-slate-500">Nothing here.</p>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <>
          {tab === 'control' && attention.length > 0 && (
            <Card className="p-4 space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Attention required</h3>
              {attention.map((item) => (
                <button
                  key={item.operation_id}
                  type="button"
                  onClick={() => navigate(`/operations/${item.operation_id}`)}
                  className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-left hover:bg-slate-50"
                >
                  <span className={cn('h-2.5 w-2.5 rounded-full', HEALTH_STYLES[item.health]?.dot || 'bg-slate-400')} />
                  <span className="font-mono text-xs text-slate-500">{item.operation_code}</span>
                  <span className="font-medium text-slate-800">{item.customer_name}</span>
                  <span className="text-sm text-slate-600 truncate">{item.reason}</span>
                  <span className="ml-auto text-xs text-slate-500">{item.detail}</span>
                </button>
              ))}
            </Card>
          )}

          <Card className="p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[12rem]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input className="pl-8" placeholder="Search ID, customer, PO, enquiry" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <select className="h-10 rounded-md border border-slate-200 px-2 text-sm" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="">All types</option>
                {(meta.operation_types || []).map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              <select className="h-10 rounded-md border border-slate-200 px-2 text-sm" value={health} onChange={(e) => setHealth(e.target.value)}>
                <option value="">All health</option>
                <option value="green">Green</option>
                <option value="yellow">At risk</option>
                <option value="red">Overdue</option>
              </select>
              <select className="h-10 rounded-md border border-slate-200 px-2 text-sm" value={view} onChange={(e) => setView(e.target.value)}>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="historical">Historical</option>
              </select>
              <Button variant="outline" size="sm" onClick={load}><Filter className="h-4 w-4 mr-1" />Refresh</Button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">ID</th>
                    <th className="py-2 pr-3">Customer</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Responsible</th>
                    <th className="py-2 pr-3">Stage</th>
                    <th className="py-2 pr-3">Next action</th>
                    <th className="py-2 pr-3">PO value</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr><td colSpan={8} className="py-8 text-center text-slate-500">Loading operations…</td></tr>
                  )}
                  {!loading && tableRows.map((row) => {
                    const healthStyle = HEALTH_STYLES[row.health_status] || HEALTH_STYLES.green;
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-slate-100 cursor-pointer hover:bg-slate-50"
                        onClick={() => openOperationTab(row.id)}
                      >
                        <td className="py-2 pr-3 font-mono text-xs">{row.operation_code}</td>
                        <td className="py-2 pr-3 font-medium text-slate-800">{row.customer_name}</td>
                        <td className="py-2 pr-3 text-slate-600">{row.operation_type}</td>
                        <td className="py-2 pr-3">{row.responsible_name || '—'}</td>
                        <td className="py-2 pr-3">{row.current_stage || '—'}</td>
                        <td className="py-2 pr-3">
                          <div className="truncate max-w-[14rem]">{row.next_action || '—'}</div>
                          <div className="text-[11px] text-slate-400">{row.next_action_date || ''}</div>
                        </td>
                        <td className="py-2 pr-3">{formatMoney(row.po_value)}</td>
                        <td className="py-2">
                          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', healthStyle.badge)}>
                            <span className={cn('h-1.5 w-1.5 rounded-full', healthStyle.dot)} />
                            {healthStyle.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {!loading && tableRows.length === 0 && (
                    <tr><td colSpan={8} className="py-10 text-center text-slate-500">No operations in this view. Create one from a won lead.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New operation</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Won lead</Label>
              <select
                className="mt-1 h-10 w-full rounded-md border border-slate-200 px-2 text-sm"
                value={form.lead_id}
                onChange={(e) => {
                  const lead = wonLeads.find((item) => item.id === e.target.value);
                  setForm((prev) => ({
                    ...prev,
                    lead_id: e.target.value,
                    customer_name: lead?.company || prev.customer_name,
                    operation_type: lead?.suggested_type || prev.operation_type,
                    po_value: lead?.value || prev.po_value,
                    responsible_employee_id: lead?.assigned_to_employee_id || prev.responsible_employee_id,
                  }));
                }}
              >
                <option value="">Select a won enquiry</option>
                {wonLeads.map((lead) => (
                  <option key={lead.id} value={lead.id}>{lead.company} · {lead.suggested_type}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Customer</Label>
              <Input value={form.customer_name} onChange={(e) => setForm((p) => ({ ...p, customer_name: e.target.value }))} />
            </div>
            <div>
              <Label>Project / requirement</Label>
              <Input value={form.project_name} onChange={(e) => setForm((p) => ({ ...p, project_name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>PO number</Label>
                <Input value={form.po_number} onChange={(e) => setForm((p) => ({ ...p, po_number: e.target.value }))} />
              </div>
              <div>
                <Label>PO value</Label>
                <Input type="number" value={form.po_value} onChange={(e) => setForm((p) => ({ ...p, po_value: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Type</Label>
                <select className="mt-1 h-10 w-full rounded-md border border-slate-200 px-2 text-sm" value={form.operation_type} onChange={(e) => setForm((p) => ({ ...p, operation_type: e.target.value }))}>
                  {(meta.operation_types || ['Stock & Sell']).map((type) => <option key={type}>{type}</option>)}
                </select>
              </div>
              <div>
                <Label>Target completion</Label>
                <Input type="date" value={form.target_date} onChange={(e) => setForm((p) => ({ ...p, target_date: e.target.value }))} />
              </div>
            </div>
            <Button className="w-full" disabled={creating} onClick={submitCreate}>
              {creating ? 'Creating…' : 'Create operation'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Operations;
