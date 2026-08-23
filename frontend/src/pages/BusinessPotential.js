import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Search, TrendingUp, Eye, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useRegisterPageHeader } from '@/contexts/PageHeaderContext';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminUser } from '@/lib/permissions';
import { API_ENDPOINT } from '@/lib/apiConfig';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { cn } from '@/lib/utils';

const API = API_ENDPOINT;
const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
const PAGE_SIZE_OPTIONS = [25, 50, 100];

const SOURCE_TONES = {
  bhuneer_renewal: 'bg-amber-50 text-amber-800',
  nocap_new: 'bg-indigo-50 text-indigo-800',
  nocap_old: 'bg-slate-100 text-slate-700',
};

const DETAIL_FIELDS = [
  ['source_label', 'Source'],
  ['source_sheet', 'Sheet / district tab'],
  ['application_code', 'Application code'],
  ['application_number', 'Application number'],
  ['application_status', 'Status'],
  ['application_type', 'Application type'],
  ['project_name', 'Project name'],
  ['noc_number', 'NOC number'],
  ['category_description', 'Category'],
  ['gw_utilisation_for', 'GW utilisation'],
  ['msme', 'MSME'],
  ['relaxation', 'Relaxation'],
  ['geology', 'Geology'],
  ['state_name', 'State'],
  ['district_name', 'District'],
  ['sub_district_name', 'Sub-district'],
  ['village_name', 'Village'],
  ['proposed_address', 'Proposed address'],
  ['communication_address', 'Communication address'],
  ['net_gw_requirement', 'Net GW requirement (m³/day)'],
  ['issued_letter_type', 'Issued letter'],
  ['eligible_exemption', 'Exemption letter'],
  ['present_area_type', 'Present area type'],
  ['apply_area_type', 'Apply area type'],
  ['renewal_apply_area_type', 'Renewal apply area type'],
  ['first_apply_area_type', 'First apply area type'],
  ['latitude', 'Latitude'],
  ['longitude', 'Longitude'],
  ['validity_start', 'Validity start'],
  ['validity_end', 'Validity end'],
  ['date_of_commencement', 'Date of commencement'],
  ['date_of_expansion', 'Date of expansion'],
  ['application_created_date', 'Created date'],
  ['application_submitted_date', 'Submitted date'],
  ['application_approved_date', 'Approved date'],
];

function displayValue(value) {
  const text = String(value ?? '').trim();
  return text || '—';
}

export function BusinessPotential() {
  const { user } = useAuth();
  const canImport = isAdminUser(user);
  const [items, setItems] = useState([]);
  const [importing, setImporting] = useState(false);
  const [total, setTotal] = useState(0);
  const [meta, setMeta] = useState({ sources: [], districts: [], statuses: [], application_types: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [source, setSource] = useState('');
  const [district, setDistrict] = useState('');
  const [status, setStatus] = useState('');
  const [applicationType, setApplicationType] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, source, district, status, applicationType, pageSize]);

  const fetchMeta = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/business-potential-records/meta`, authHeaders());
      setMeta({
        sources: data?.sources || [],
        districts: data?.districts || [],
        statuses: data?.statuses || [],
        application_types: data?.application_types || [],
        total: data?.total || 0,
      });
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to load Business Potential filters'));
    }
  }, []);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/business-potential-records`, {
        ...authHeaders(),
        params: {
          q: debouncedSearch || undefined,
          source: source || undefined,
          district: district || undefined,
          status: status || undefined,
          application_type: applicationType || undefined,
          page,
          page_size: pageSize,
        },
      });
      setItems(Array.isArray(data?.items) ? data.items : []);
      setTotal(Number(data?.total) || 0);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to load Business Potential data'));
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, source, district, status, applicationType, page, pageSize]);

  useEffect(() => {
    fetchMeta();
  }, [fetchMeta]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  const pageHeaderSubtitle = useMemo(() => {
    if (total !== meta.total && meta.total) {
      return `${total.toLocaleString('en-IN')} matches · ${meta.total.toLocaleString('en-IN')} imported`;
    }
    return `${(meta.total || total).toLocaleString('en-IN')} imported records`;
  }, [total, meta.total]);

  const importExcel = async () => {
    setImporting(true);
    try {
      const { data } = await axios.post(`${API}/business-potential-records/import?replace=true`, {}, authHeaders());
      toast.success(`Imported ${Number(data?.imported || 0).toLocaleString('en-IN')} records`);
      await fetchMeta();
      await fetchRows();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to import Excel data'));
    } finally {
      setImporting(false);
    }
  };

  const pageHeaderActions = useMemo(
    () => (
      canImport ? (
        <Button className="h-9" variant="outline" disabled={importing} onClick={importExcel}>
          <Upload className="h-4 w-4 mr-1.5" />
          {importing ? 'Importing…' : meta.total ? 'Re-import Excel' : 'Import Excel'}
        </Button>
      ) : null
    ),
    [canImport, importing, meta.total, importExcel],
  );

  useRegisterPageHeader({
    subtitle: pageHeaderSubtitle,
    actions: pageHeaderActions,
    enabled: !loading || items.length > 0 || canImport,
  });

  return (
    <div className="space-y-5" data-testid="business-potential-page">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">All records</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{meta.total.toLocaleString('en-IN')}</p>
        </Card>
        {(meta.sources.length ? meta.sources : [
          { key: 'bhuneer_renewal', label: 'Bhuneer one-time renewal', count: 0 },
          { key: 'nocap_new', label: 'NOCAP new', count: 0 },
          { key: 'nocap_old', label: 'NOCAP old', count: 0 },
        ]).slice(0, 3).map((src) => (
          <Card key={src.key} className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground truncate">{src.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{Number(src.count || 0).toLocaleString('en-IN')}</p>
          </Card>
        ))}
      </div>

      <Card className="p-4 sm:p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          <div className="relative xl:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search project, NOC, application no, district…"
              className="h-10 pl-9"
            />
          </div>
          <select value={source} onChange={(e) => setSource(e.target.value)} className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm">
            <option value="">All sources</option>
            {meta.sources.map((src) => (
              <option key={src.key} value={src.key}>{src.label} ({src.count})</option>
            ))}
          </select>
          <select value={district} onChange={(e) => setDistrict(e.target.value)} className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm">
            <option value="">All districts</option>
            {meta.districts.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm">
            <option value="">All statuses</option>
            {meta.statuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-3">
          <select value={applicationType} onChange={(e) => setApplicationType(e.target.value)} className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm">
            <option value="">All application types</option>
            {meta.application_types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {loading && items.length === 0 ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <TrendingUp className="mx-auto mb-2 h-12 w-12 opacity-40" />
            <p>No Business Potential records match your search.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-3 font-semibold">Project</th>
                  <th className="px-3 py-3 font-semibold">Application no</th>
                  <th className="px-3 py-3 font-semibold">NOC number</th>
                  <th className="px-3 py-3 font-semibold">District</th>
                  <th className="px-3 py-3 font-semibold">Type</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Source</th>
                  <th className="px-3 py-3 font-semibold text-right">View</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-gray-100 hover:bg-slate-50/70 cursor-pointer"
                    onClick={() => setSelected(row)}
                  >
                    <td className="px-3 py-3">
                      <div className="font-medium text-gray-900 max-w-[280px] truncate" title={row.project_name || ''}>
                        {displayValue(row.project_name)}
                      </div>
                      <div className="mt-0.5 text-xs text-gray-500">{displayValue(row.village_name)}</div>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-gray-800">{displayValue(row.application_number)}</td>
                    <td className="px-3 py-3 font-mono text-xs text-gray-800">{displayValue(row.noc_number)}</td>
                    <td className="px-3 py-3 text-gray-700">{displayValue(row.district_name)}</td>
                    <td className="px-3 py-3 text-gray-700">{displayValue(row.application_type)}</td>
                    <td className="px-3 py-3">
                      <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                        {displayValue(row.application_status)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium', SOURCE_TONES[row.source_key] || SOURCE_TONES.nocap_old)}>
                        {displayValue(row.source_label)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); setSelected(row); }}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm text-gray-600">
          <p>
            Showing {total === 0 ? 0 : (safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, total)} of {total.toLocaleString('en-IN')}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n} / page</option>
              ))}
            </select>
            <Button type="button" variant="outline" className="h-9" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </Button>
            <span className="px-1 tabular-nums">{safePage} / {totalPages}</span>
            <Button type="button" variant="outline" className="h-9" disabled={safePage >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      </Card>

      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="max-w-3xl bg-white rounded-xl border shadow-xl p-0 max-h-[90vh] overflow-y-auto">
          <div className="bg-gradient-to-r from-slate-900 to-indigo-900 text-white px-6 py-5 rounded-t-xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-white tracking-tight">
                {selected?.project_name || 'Business potential'}
              </DialogTitle>
              <p className="text-slate-300 text-sm mt-1">
                {displayValue(selected?.application_number)} · {displayValue(selected?.source_label)}
              </p>
            </DialogHeader>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {DETAIL_FIELDS.map(([key, label]) => (
              <div key={key} className={['proposed_address', 'communication_address', 'project_name'].includes(key) ? 'sm:col-span-2' : ''}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
                <p className="mt-1 text-sm text-gray-900 break-words">{displayValue(selected?.[key])}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default BusinessPotential;
