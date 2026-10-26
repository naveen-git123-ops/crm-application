import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowDown, ArrowUp, Bell, ChevronLeft, ChevronRight, Download, FileText, History, Plus, Search, Settings2, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useRegisterPageHeader } from '@/contexts/PageHeaderContext';
import { getApiErrorMessage } from '@/lib/apiErrors';
import {
  INPUT_CLASS, SUMMARY_CARDS, fmtDate, fmtDateTime, serviceApi, triggerDownload,
} from '@/lib/serviceUtils';
import { cn } from '@/lib/utils';
import { PriorityBadge, StatusBadge } from '@/components/service/ServiceFields';
import { CreateServiceRequest } from '@/components/service/CreateServiceRequest';
import { ServiceHistoryDialog, ServiceReportsDialog } from '@/components/service/ServiceListDialogs';
import { AmcDialog, ServiceSettingsDialog } from '@/components/service/ServiceAdminDialogs';

const EMPTY_FILTERS = {
  q: '', card: '', status: '', customer_type: '', service_type: '', priority: '', technician: '',
  date_from: '', date_to: '', lead_id: '',
};

const COLUMNS = [
  { key: 'service_code', label: 'Service ID' },
  { key: 'request_date', label: 'Date', sort: 'request_date' },
  { key: 'customer_name', label: 'Customer' },
  { key: 'customer_type', label: 'Type' },
  { key: 'lead_label', label: 'Lead' },
  { key: 'product_name', label: 'Product' },
  { key: 'serial_number', label: 'Serial no.' },
  { key: 'service_type', label: 'Service type' },
  { key: 'priority', label: 'Priority', sort: 'priority' },
  { key: 'assigned_name', label: 'Technician' },
  { key: 'status', label: 'Status' },
  { key: 'expected_completion', label: 'Expected', sort: 'expected_completion' },
];

export function ServiceMaintenance() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [meta, setMeta] = useState(null);
  const [lookups, setLookups] = useState({ employees: [], vendors: [] });
  const [stats, setStats] = useState({});
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS, lead_id: searchParams.get('lead_id') || '' });
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ by: 'request_date', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [createOpen, setCreateOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [amcOpen, setAmcOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notifications, setNotifications] = useState({ items: [], unread: 0 });
  const [exporting, setExporting] = useState(false);

  const caps = meta?.caps || {};

  const queryParams = useMemo(() => {
    const params = { ...filters, sort_by: sort.by, sort_dir: sort.dir, page, page_size: pageSize };
    Object.keys(params).forEach((k) => { if (params[k] === '') delete params[k]; });
    return params;
  }, [filters, sort, page, pageSize]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const [list, summary] = await Promise.all([
        serviceApi.get('/service-requests', queryParams),
        serviceApi.get('/service-requests/stats'),
      ]);
      setData(list);
      setStats(summary);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to load service requests'));
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  const loadNotifications = useCallback(async () => {
    try {
      setNotifications(await serviceApi.get('/service/notifications'));
    } catch {
      /* the bell is a convenience; the list still works without it */
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [metaData, lookupData] = await Promise.all([serviceApi.get('/service/meta'), serviceApi.get('/service/lookups')]);
        setMeta(metaData);
        setLookups(lookupData);
      } catch (err) {
        toast.error(getApiErrorMessage(err, 'Failed to load Service & Maintenance'));
      }
    })();
  }, []);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadNotifications(); }, [loadNotifications, data.total]);

  // Typing in search waits a moment before querying.
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => (prev.q === search ? prev : { ...prev, q: search }));
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const setFilter = (key) => (event) => {
    const value = typeof event === 'string' ? event : event.target.value;
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const pickCard = (card) => {
    setFilters((prev) => ({ ...prev, card: prev.card === card ? '' : card, status: '' }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setSearch('');
    setPage(1);
  };

  const toggleSort = (column) => {
    if (!column.sort) return;
    setSort((prev) => (prev.by === column.sort ? { by: column.sort, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { by: column.sort, dir: 'asc' }));
    setPage(1);
  };

  const exportCsv = useCallback(async () => {
    setExporting(true);
    try {
      const params = { ...filters };
      Object.keys(params).forEach((k) => { if (params[k] === '') delete params[k]; });
      const res = await serviceApi.blob('/service-requests/export', params);
      triggerDownload(res.data, 'service-requests.csv');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Export failed'));
    } finally {
      setExporting(false);
    }
  }, [filters]);

  const markRead = async () => {
    try {
      await serviceApi.post('/service/notifications/read', {});
      loadNotifications();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not update notifications'));
    }
  };

  const openNotification = (item) => {
    if (item.service_id) navigate(`/service-maintenance/${item.service_id}`);
  };

  const actions = useMemo(() => (
    <div className="flex flex-wrap items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="relative" aria-label="Service notifications">
            <Bell className="h-4 w-4" />
            {notifications.unread > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold text-white">
                {notifications.unread}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96 p-0">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-semibold">Service notifications</span>
            <Button variant="ghost" size="sm" onClick={markRead} disabled={notifications.unread === 0}>Mark all read</Button>
          </div>
          <ul className="max-h-80 divide-y overflow-y-auto">
            {notifications.items.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">Nothing new.</li>}
            {notifications.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => openNotification(item)}
                  className={cn('block w-full px-3 py-2 text-left text-sm hover:bg-slate-50', !item.read && 'bg-indigo-50/50')}
                >
                  <span className="block text-slate-800">{item.message}</span>
                  <span className="text-[11px] text-slate-500">{fmtDateTime(item.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
      <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}><History className="mr-1 h-4 w-4" />Service history</Button>
      <Button variant="outline" size="sm" onClick={() => setReportsOpen(true)}><FileText className="mr-1 h-4 w-4" />Service reports</Button>
      <Button variant="outline" size="sm" onClick={exportCsv} disabled={exporting}><Download className="mr-1 h-4 w-4" />{exporting ? 'Exporting…' : 'Export'}</Button>
      {caps.coordinate && <Button variant="outline" size="sm" onClick={() => setAmcOpen(true)}>AMC contracts</Button>}
      {caps.manage && <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}><Settings2 className="mr-1 h-4 w-4" />Settings</Button>}
      {caps.coordinate && (
        <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="create-service-request">
          <Plus className="mr-1 h-4 w-4" />Create Service Request
        </Button>
      )}
    </div>
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [caps.coordinate, caps.manage, notifications, exporting, exportCsv]);

  useRegisterPageHeader({
    subtitle: 'Installation, repair, vendor repair and AMC work for customers',
    actions,
    enabled: Boolean(meta),
  });

  const totalPages = Math.max(1, Math.ceil((data.total || 0) / pageSize));
  const filtersActive = Object.entries(filters).some(([, v]) => v !== '');
  const serviceTypes = useMemo(() => {
    const all = new Set();
    Object.values(meta?.service_types_by_customer || {}).forEach((list) => list.forEach((t) => all.add(t)));
    return Array.from(all);
  }, [meta]);

  return (
    <div className="space-y-4 pb-8" data-testid="service-maintenance-page">
      {caps.technician_only && (
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          You are seeing the service requests assigned to you.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
        {SUMMARY_CARDS.map((card) => {
          const active = card.key === '' ? !filters.card && !filters.status : filters.card === card.key;
          return (
            <button
              key={card.label}
              type="button"
              onClick={() => (card.key === '' ? clearFilters() : pickCard(card.key))}
              className={cn(
                'rounded-xl border bg-white px-3 py-3 text-left transition-colors hover:border-indigo-200 hover:shadow-sm',
                active ? 'border-indigo-400 ring-1 ring-indigo-200' : 'border-slate-200',
                card.key === 'overdue' && (stats.overdue || 0) > 0 && 'border-rose-200',
              )}
              data-testid={`summary-card-${card.stat}`}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{card.label}</div>
              <div className={cn('mt-1 text-2xl font-semibold', card.key === 'overdue' && (stats.overdue || 0) > 0 ? 'text-rose-700' : 'text-slate-900')}>
                {stats[card.stat] ?? 0}
              </div>
            </button>
          );
        })}
      </div>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input className="pl-8" placeholder="Search service ID, customer, product, serial, mobile, lead" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className={cn(INPUT_CLASS, 'w-auto')} value={filters.customer_type} onChange={setFilter('customer_type')} aria-label="Customer type">
            <option value="">All customers</option>
            <option value="New">New customers</option>
            <option value="Existing">Existing customers</option>
          </select>
          <select className={cn(INPUT_CLASS, 'w-auto')} value={filters.service_type} onChange={setFilter('service_type')} aria-label="Service type">
            <option value="">All service types</option>
            {serviceTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className={cn(INPUT_CLASS, 'w-auto')} value={filters.status} onChange={(e) => { setFilters((p) => ({ ...p, status: e.target.value, card: '' })); setPage(1); }} aria-label="Status">
            <option value="">All statuses</option>
            {(meta?.statuses || []).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className={cn(INPUT_CLASS, 'w-auto')} value={filters.priority} onChange={setFilter('priority')} aria-label="Priority">
            <option value="">All priorities</option>
            {(meta?.priorities || []).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          {!caps.technician_only && (
            <select className={cn(INPUT_CLASS, 'w-auto')} value={filters.technician} onChange={setFilter('technician')} aria-label="Technician">
              <option value="">All technicians</option>
              {lookups.employees.map((e) => <option key={e.employee_id} value={e.employee_id}>{e.name}</option>)}
            </select>
          )}
          <input type="date" className={cn(INPUT_CLASS, 'w-auto')} value={filters.date_from} onChange={setFilter('date_from')} aria-label="From date" />
          <input type="date" className={cn(INPUT_CLASS, 'w-auto')} value={filters.date_to} onChange={setFilter('date_to')} aria-label="To date" />
          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={clearFilters}><X className="mr-1 h-4 w-4" />Clear</Button>
          )}
        </div>
        {filters.lead_id && (
          <p className="text-xs text-indigo-700">Showing requests linked to one lead. <button type="button" className="underline" onClick={() => setFilters((p) => ({ ...p, lead_id: '' }))}>Show all</button></p>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wide text-slate-500">
                {COLUMNS.map((column) => (
                  <th key={column.key} className="whitespace-nowrap py-2 pr-3">
                    {column.sort ? (
                      <button type="button" className="inline-flex items-center gap-1 hover:text-slate-800" onClick={() => toggleSort(column)}>
                        {column.label}
                        {sort.by === column.sort && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                      </button>
                    ) : column.label}
                  </th>
                ))}
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {loading && data.items.length === 0 && (
                <tr><td colSpan={COLUMNS.length + 1} className="py-8 text-center text-slate-500">Loading service requests…</td></tr>
              )}
              {data.items.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                  onClick={() => navigate(`/service-maintenance/${row.id}`)}
                >
                  <td className="whitespace-nowrap py-2 pr-3 font-mono text-xs">{row.service_code}</td>
                  <td className="whitespace-nowrap py-2 pr-3">{fmtDate(row.request_date)}</td>
                  <td className="py-2 pr-3 font-medium text-slate-800">{row.customer_name}</td>
                  <td className="py-2 pr-3 text-slate-600">{row.customer_type}</td>
                  <td className="max-w-[12rem] truncate py-2 pr-3 text-slate-600" title={row.lead_label || ''}>{row.lead_label || '—'}</td>
                  <td className="max-w-[12rem] truncate py-2 pr-3" title={row.product_name || ''}>{row.product_name || '—'}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{row.serial_number || '—'}</td>
                  <td className="py-2 pr-3">{row.service_type || '—'}</td>
                  <td className="py-2 pr-3"><PriorityBadge priority={row.priority} /></td>
                  <td className="py-2 pr-3">{row.assigned_name || <span className="text-slate-400">Unassigned</span>}</td>
                  <td className="py-2 pr-3"><StatusBadge status={row.status} /></td>
                  <td className={cn('whitespace-nowrap py-2 pr-3', row.overdue && 'font-semibold text-rose-700')}>
                    {fmtDate(row.expected_completion)}{row.overdue ? ' · overdue' : ''}
                  </td>
                  <td className="py-2"><span className="text-xs font-medium text-indigo-700">View</span></td>
                </tr>
              ))}
              {!loading && data.items.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length + 1} className="py-10 text-center text-slate-500">
                    {filtersActive ? 'No service requests match these filters.' : 'No service requests yet.'}
                    {!filtersActive && caps.coordinate ? ' Use “Create Service Request” to add the first one.' : ''}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
          <span>
            {data.total === 0 ? '0 requests' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, data.total)} of ${data.total}`}
          </span>
          <div className="flex items-center gap-2">
            <select className={cn(INPUT_CLASS, 'h-8 w-auto text-xs')} value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} aria-label="Rows per page">
              {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}
            </select>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-xs">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </Card>

      {meta && (
        <CreateServiceRequest
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          meta={meta}
          onCreated={(id) => navigate(`/service-maintenance/${id}`)}
        />
      )}
      <ServiceHistoryDialog open={historyOpen} onClose={() => setHistoryOpen(false)} onOpenService={(id) => navigate(`/service-maintenance/${id}`)} />
      <ServiceReportsDialog open={reportsOpen} onClose={() => setReportsOpen(false)} onOpenService={(id) => navigate(`/service-maintenance/${id}`)} />
      {meta && (
        <AmcDialog open={amcOpen} onClose={() => setAmcOpen(false)} serviceTypes={serviceTypes} />
      )}
      {meta && caps.manage && (
        <ServiceSettingsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          meta={meta}
          onSaved={(config) => setMeta((prev) => ({ ...prev, config }))}
        />
      )}
    </div>
  );
}

export default ServiceMaintenance;
