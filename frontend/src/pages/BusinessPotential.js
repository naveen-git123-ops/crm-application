import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Search, TrendingUp, Eye, Upload, Download } from 'lucide-react';
import {
  BPO_STATUS_FILTERS,
  BPO_STATUS_TONES,
  bpoOutcomeLabel,
  bpoStatusLabel,
} from '@/lib/businessPotential';
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

const COLOR_FILTERS = [
  { key: '', label: 'All', swatch: 'bg-slate-400', active: 'border-slate-400 bg-slate-100 text-slate-800' },
  { key: 'expired', label: 'Expired', swatch: 'bg-red-500', active: 'border-red-400 bg-red-50 text-red-700' },
  { key: 'd90', label: 'Within 90 days', swatch: 'bg-yellow-400', active: 'border-yellow-400 bg-yellow-50 text-yellow-800' },
  { key: 'd365', label: 'Within 365 days', swatch: 'bg-sky-400', active: 'border-sky-400 bg-sky-50 text-sky-800' },
];

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
  ['contact_email', 'Email'],
  ['contact_phone', 'Contact'],
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
  ['days_to_expire', 'Days to expire'],
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

function displayDate(value) {
  const text = String(value ?? '').trim();
  if (!text) return '—';
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  return text;
}

function parseValidDate(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const dt = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return null;
  const dt = new Date(parsed);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function isValidEndPassed(raw) {
  const end = parseValidDate(raw);
  if (!end) return false;
  return end.getTime() < startOfToday().getTime();
}

function isValidEndUpcoming(raw, days = 90) {
  const end = parseValidDate(raw);
  if (!end) return false;
  const today = startOfToday();
  const limit = new Date(today);
  limit.setDate(limit.getDate() + days);
  return end.getTime() >= today.getTime() && end.getTime() <= limit.getTime();
}

function validEndRowTone(raw) {
  if (isValidEndPassed(raw)) return 'red';
  if (isValidEndUpcoming(raw, 90)) return 'yellow';
  if (isValidEndUpcoming(raw, 365)) return 'sky';
  return null;
}

const BAND_TONE = { expired: 'red', d90: 'yellow', d365: 'sky' };

function rowMatchesValidityBand(row, band) {
  if (!band) return true;
  return validEndRowTone(row?.validity_end) === BAND_TONE[band];
}

function countValidityBands(rows) {
  const counts = { expired: 0, d90: 0, d365: 0 };
  (rows || []).forEach((row) => {
    const tone = validEndRowTone(row?.validity_end);
    if (tone === 'red') counts.expired += 1;
    else if (tone === 'yellow') counts.d90 += 1;
    else if (tone === 'sky') counts.d365 += 1;
  });
  return counts;
}

function daysUntilExpiry(raw) {
  const end = parseValidDate(raw);
  if (!end) return null;
  return Math.round((end.getTime() - startOfToday().getTime()) / 86400000);
}

function displayDaysUntilExpiry(raw) {
  const days = daysUntilExpiry(raw);
  if (days === null) return '—';
  if (days === 0) return '0 (today)';
  if (days > 0) return `${days} days`;
  return `Expired ${Math.abs(days)} days`;
}

function parseCommunicationContacts(address) {
  const text = String(address || '');
  const emailMatch = text.match(/Email\s*:\s*([^,]*)/i);
  const contactMatch = text.match(/Contact\s*:\s*([^,]*)/i);
  return {
    email: (emailMatch?.[1] || '').trim(),
    contact: (contactMatch?.[1] || '').trim(),
  };
}

function rowEmail(row) {
  return row?.contact_email || parseCommunicationContacts(row?.communication_address).email;
}

function rowContact(row) {
  return row?.contact_phone || parseCommunicationContacts(row?.communication_address).contact;
}

export function BusinessPotential() {
  const { user } = useAuth();
  const isAdmin = isAdminUser(user);
  const [items, setItems] = useState([]);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [total, setTotal] = useState(0);
  const [meta, setMeta] = useState({ sources: [], districts: [], statuses: [], application_types: [], validity_bands: {}, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [district, setDistrict] = useState('');
  const [applicationType, setApplicationType] = useState('');
  const [validityBand, setValidityBand] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selected, setSelected] = useState(null);
  const [followUps, setFollowUps] = useState([]);
  const [catalog, setCatalog] = useState(null);
  const catalogCacheRef = useRef({ key: '', rows: null, promise: null });
  const [bpoStatus, setBpoStatus] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, district, applicationType, validityBand, bpoStatus, pageSize]);

  const fetchMeta = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/business-potential-records/meta`, authHeaders());
      setMeta({
        sources: data?.sources || [],
        districts: data?.districts || [],
        statuses: data?.statuses || [],
        application_types: data?.application_types || [],
        validity_bands: data?.validity_bands || {},
        total: data?.total || 0,
      });
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to load Business Potential filters'));
    }
  }, []);

  const loadCatalog = useCallback(async () => {
    const key = `${debouncedSearch}|${district}|${applicationType}|${bpoStatus}`;
    const cache = catalogCacheRef.current;
    if (cache.key === key && Array.isArray(cache.rows)) return cache.rows;
    if (cache.key === key && cache.promise) return cache.promise;
    const request = (async () => {
      const collected = [];
      let pageNum = 1;
      let available = Infinity;
      const chunkSize = 200;
      while (collected.length < available && pageNum <= 40) {
        const { data } = await axios.get(`${API}/business-potential-records`, {
          ...authHeaders(),
          params: {
            q: debouncedSearch || undefined,
            district: district || undefined,
            application_type: applicationType || undefined,
            bpo_status: bpoStatus || undefined,
            page: pageNum,
            page_size: chunkSize,
          },
        });
        available = Number(data?.total) || 0;
        const chunk = Array.isArray(data?.items) ? data.items : [];
        collected.push(...chunk);
        if (!chunk.length || chunk.length < chunkSize) break;
        pageNum += 1;
      }
      return collected;
    })();
    catalogCacheRef.current = { key, rows: null, promise: request };
    try {
      const rows = await request;
      catalogCacheRef.current = { key, rows, promise: null };
      setCatalog(rows);
      return rows;
    } catch (err) {
      catalogCacheRef.current = { key: '', rows: null, promise: null };
      throw err;
    }
  }, [debouncedSearch, district, applicationType, bpoStatus]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      if (validityBand) {
        const cacheKey = `${debouncedSearch}|${district}|${applicationType}|${bpoStatus}`;
        if (catalogCacheRef.current.key !== cacheKey || !catalogCacheRef.current.rows) {
          setItems([]);
        }
        const rows = await loadCatalog();
        const filtered = rows.filter((row) => rowMatchesValidityBand(row, validityBand));
        const start = (Math.max(1, page) - 1) * pageSize;
        setItems(filtered.slice(start, start + pageSize));
        setTotal(filtered.length);
        return;
      }
      const { data } = await axios.get(`${API}/business-potential-records`, {
        ...authHeaders(),
        params: {
          q: debouncedSearch || undefined,
          district: district || undefined,
          application_type: applicationType || undefined,
          bpo_status: bpoStatus || undefined,
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
  }, [debouncedSearch, district, applicationType, validityBand, bpoStatus, page, pageSize, loadCatalog]);

  useEffect(() => {
    fetchMeta();
  }, [fetchMeta]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const bandCounts = useMemo(() => {
    if (meta.validity_bands && (meta.validity_bands.expired != null || meta.validity_bands.d90 != null)) {
      return meta.validity_bands;
    }
    return catalog ? countValidityBands(catalog) : {};
  }, [meta.validity_bands, catalog]);

  useEffect(() => {
    if (!selected?.id) {
      setFollowUps([]);
      return undefined;
    }
    let cancelled = false;
    axios.get(`${API}/business-potential-records/${selected.id}/follow-ups`, authHeaders())
      .then(({ data }) => {
        if (!cancelled) setFollowUps(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setFollowUps([]);
      });
    return () => { cancelled = true; };
  }, [selected?.id]);

  const pageHeaderSubtitle = useMemo(() => {
    if (total !== meta.total && meta.total) {
      return `${total.toLocaleString('en-IN')} matches · ${meta.total.toLocaleString('en-IN')} records`;
    }
    return `${(meta.total || total).toLocaleString('en-IN')} potential records · all BPO statuses`;
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

  const exportExcel = async () => {
    setExporting(true);
    try {
      const response = await axios.get(`${API}/business-potential-records/export`, {
        ...authHeaders(),
        responseType: 'blob',
        params: {
          q: debouncedSearch || undefined,
          district: district || undefined,
          application_type: applicationType || undefined,
          validity_band: validityBand || undefined,
          bpo_status: bpoStatus || undefined,
        },
      });
      const type = response.headers['content-type'] || '';
      if (type.includes('application/json')) {
        const text = await response.data.text();
        const parsed = JSON.parse(text);
        throw new Error(parsed?.detail || 'Failed to export Excel');
      }
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Business_Potential_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success('Excel exported');
    } catch (err) {
      toast.error(getApiErrorMessage(err, err?.message || 'Failed to export Excel'));
    } finally {
      setExporting(false);
    }
  };

  const pageHeaderActions = useMemo(
    () => (
      isAdmin ? (
        <>
          <Button className="h-9" variant="outline" disabled={exporting || total === 0} onClick={exportExcel}>
            <Download className="h-4 w-4 mr-1.5" />
            {exporting ? 'Exporting…' : 'Export Excel'}
          </Button>
          <Button className="h-9" variant="outline" disabled={importing} onClick={importExcel}>
            <Upload className="h-4 w-4 mr-1.5" />
            {importing ? 'Importing…' : meta.total ? 'Re-import Excel' : 'Import Excel'}
          </Button>
        </>
      ) : null
    ),
    [isAdmin, exporting, total, exportExcel, importing, meta.total, importExcel],
  );

  useRegisterPageHeader({
    subtitle: pageHeaderSubtitle,
    actions: pageHeaderActions,
    enabled: !loading || items.length > 0 || isAdmin,
  });

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 min-w-0 flex-col -mx-4 -mt-4 p-3 sm:-mx-6 sm:-mt-6 lg:-mx-8 lg:-mt-8 lg:-mb-8" data-testid="business-potential-page">
      <Card className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-2.5 sm:p-3 space-y-2">
        <div className="flex shrink-0 flex-col gap-2 xl:flex-row xl:items-center">
          <div className="flex flex-wrap items-center gap-1.5">
            {COLOR_FILTERS.map((item) => {
              const selected = validityBand === item.key;
              const count = item.key ? bandCounts?.[item.key] : (meta.total || total);
              return (
                <button
                  key={item.key || 'all'}
                  type="button"
                  onClick={() => setValidityBand(item.key)}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium',
                    selected ? item.active : 'border-gray-200 bg-white text-gray-700 hover:bg-slate-50',
                  )}
                >
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', item.swatch)} />
                  {item.label}
                  {count != null && (
                    <span className="tabular-nums text-[11px] opacity-70">{Number(count).toLocaleString('en-IN')}</span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search project, NOC, email, contact, district…"
                className="h-8 pl-8 text-sm"
              />
            </div>
            <select value={district} onChange={(e) => setDistrict(e.target.value)} className="h-8 rounded-md border border-gray-300 bg-white px-2 text-sm">
              <option value="">All districts</option>
              {meta.districts.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <select value={applicationType} onChange={(e) => setApplicationType(e.target.value)} className="h-8 rounded-md border border-gray-300 bg-white px-2 text-sm">
              <option value="">All application types</option>
              {meta.application_types.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select value={bpoStatus} onChange={(e) => setBpoStatus(e.target.value)} className="h-8 rounded-md border border-gray-300 bg-white px-2 text-sm">
              {BPO_STATUS_FILTERS.map((item) => (
                <option key={item.key || 'all'} value={item.key}>{item.label}</option>
              ))}
            </select>
          </div>
        </div>

        {loading && items.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <TrendingUp className="mx-auto mb-2 h-12 w-12 opacity-40" />
            <p>No Business Potential records match your search.</p>
          </div>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200">
            <div className="min-h-0 flex-1 overflow-auto">
            <table className="min-w-full text-[13px] leading-5">
              <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-600 shadow-[inset_0_-1px_0_0_rgb(226,232,240)]">
                <tr>
                  <th className="px-2 py-1.5 font-semibold">Project</th>
                  <th className="px-2 py-1.5 font-semibold">Application no</th>
                  <th className="px-2 py-1.5 font-semibold">NOC number</th>
                  <th className="px-2 py-1.5 font-semibold">District</th>
                  <th className="px-2 py-1.5 font-semibold">Email</th>
                  <th className="px-2 py-1.5 font-semibold">Contact</th>
                  <th className="px-2 py-1.5 font-semibold">Valid start</th>
                  <th className="px-2 py-1.5 font-semibold">Valid end</th>
                  <th className="px-2 py-1.5 font-semibold">Days to expire</th>
                  <th className="px-2 py-1.5 font-semibold">Type</th>
                  <th className="px-2 py-1.5 font-semibold">Status</th>
                  <th className="px-2 py-1.5 font-semibold">Source</th>
                  <th className="px-2 py-1.5 font-semibold">BPO status</th>
                  <th className="px-2 py-1.5 font-semibold">BPO follow-up</th>
                  <th className="px-2 py-1.5 font-semibold">Reason</th>
                  <th className="px-2 py-1.5 font-semibold text-right">View</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const tone = validEndRowTone(row.validity_end);
                  const textMain = tone === 'red' ? 'text-red-600' : tone === 'yellow' ? 'text-yellow-600' : tone === 'sky' ? 'text-sky-600' : 'text-gray-700';
                  const textStrong = tone === 'red' ? 'text-red-700' : tone === 'yellow' ? 'text-yellow-700' : tone === 'sky' ? 'text-sky-700' : 'text-gray-900';
                  const textMono = tone === 'red' ? 'text-red-600' : tone === 'yellow' ? 'text-yellow-600' : tone === 'sky' ? 'text-sky-600' : 'text-gray-800';
                  return (
                  <tr
                    key={row.id}
                    className={cn(
                      'border-t cursor-pointer',
                      tone === 'red' && 'border-red-100 bg-red-50/50 hover:bg-red-50',
                      tone === 'yellow' && 'border-yellow-100 bg-yellow-50/50 hover:bg-yellow-50',
                      tone === 'sky' && 'border-sky-100 bg-sky-50/50 hover:bg-sky-50',
                      !tone && 'border-gray-100 hover:bg-slate-50/70',
                    )}
                    onClick={() => setSelected(row)}
                  >
                    <td className="px-2 py-1">
                      <div className={cn('font-medium max-w-[260px] truncate', textStrong)} title={`${row.project_name || ''} · ${row.village_name || ''}`}>
                        {displayValue(row.project_name)}
                      </div>
                    </td>
                    <td className={cn('px-2 py-1 font-mono text-xs whitespace-nowrap', textMono)}>{displayValue(row.application_number)}</td>
                    <td className={cn('px-2 py-1 font-mono text-xs whitespace-nowrap', textMono)}>{displayValue(row.noc_number)}</td>
                    <td className={cn('px-2 py-1 whitespace-nowrap', textMain)}>{displayValue(row.district_name)}</td>
                    <td className={cn('px-2 py-1 max-w-[200px] truncate', textMain)} title={rowEmail(row) || ''}>{displayValue(rowEmail(row))}</td>
                    <td className={cn('px-2 py-1 whitespace-nowrap font-mono text-xs', textMono)}>{displayValue(rowContact(row))}</td>
                    <td className={cn('px-2 py-1 whitespace-nowrap font-mono text-xs', textMain)}>{displayDate(row.validity_start)}</td>
                    <td className={cn('px-2 py-1 whitespace-nowrap font-mono text-xs font-semibold', textStrong)}>{displayDate(row.validity_end)}</td>
                    <td className={cn('px-2 py-1 whitespace-nowrap font-mono text-xs font-semibold', textStrong)}>{displayDaysUntilExpiry(row.validity_end)}</td>
                    <td className={cn('px-2 py-1 whitespace-nowrap', textMain)}>{displayValue(row.application_type)}</td>
                    <td className="px-2 py-1 whitespace-nowrap">
                      <span className={cn(
                        'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium',
                        tone === 'red' ? 'bg-red-100 text-red-700' : tone === 'yellow' ? 'bg-yellow-100 text-yellow-800' : tone === 'sky' ? 'bg-sky-100 text-sky-800' : 'bg-emerald-50 text-emerald-800',
                      )}>
                        {displayValue(row.application_status)}
                      </span>
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap">
                      <span className={cn(
                        'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium',
                        tone === 'red' ? 'bg-red-100 text-red-700' : tone === 'yellow' ? 'bg-yellow-100 text-yellow-800' : tone === 'sky' ? 'bg-sky-100 text-sky-800' : (SOURCE_TONES[row.source_key] || SOURCE_TONES.nocap_old),
                      )}>
                        {displayValue(row.source_label)}
                      </span>
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap">
                      <span className={cn(
                        'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium',
                        BPO_STATUS_TONES[row.bpo_status] || BPO_STATUS_TONES.new,
                      )}>
                        {bpoStatusLabel(row.bpo_status)}
                      </span>
                    </td>
                    <td className="px-2 py-1 max-w-[200px]">
                      <p className={cn('truncate text-xs', textMain)} title={row.last_follow_up_notes || ''}>
                        {displayValue(row.last_follow_up_notes)}
                      </p>
                    </td>
                    <td className="px-2 py-1 max-w-[160px]">
                      <p className={cn('truncate text-xs', textMain)} title={row.bpo_disqualify_reason || ''}>
                        {displayValue(row.bpo_disqualify_reason)}
                      </p>
                    </td>
                    <td className="px-2 py-1 text-right">
                      <Button type="button" variant="ghost" size="sm" className={cn('h-7 w-7 p-0', tone === 'red' && 'text-red-600 hover:text-red-700', tone === 'yellow' && 'text-yellow-600 hover:text-yellow-700', tone === 'sky' && 'text-sky-600 hover:text-sky-700')} onClick={(e) => { e.stopPropagation(); setSelected(row); }}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            <div className="flex shrink-0 flex-col gap-2 border-t border-gray-200 bg-slate-50/80 px-3 py-1.5 text-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="shrink-0 text-gray-600">
                Showing{' '}
                <span className="font-medium text-gray-900">{total === 0 ? 0 : (safePage - 1) * pageSize + 1}</span>
                –
                <span className="font-medium text-gray-900">{Math.min(safePage * pageSize, total)}</span>
                {' '}of{' '}
                <span className="font-medium text-gray-900">{total.toLocaleString('en-IN')}</span>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="h-8 shrink-0 rounded-md border border-gray-300 bg-white px-2 text-sm"
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>{n} / page</option>
                  ))}
                </select>
                <Button type="button" variant="outline" className="h-8 shrink-0 px-3" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Prev
                </Button>
                <span className="min-w-[88px] shrink-0 text-center tabular-nums text-gray-700">
                  Page {safePage} / {totalPages}
                </span>
                <Button type="button" variant="outline" className="h-8 shrink-0 px-3" disabled={safePage >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
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
              {selected && (
                <span className={cn(
                  'mt-3 inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium',
                  BPO_STATUS_TONES[selected.bpo_status] || BPO_STATUS_TONES.new,
                )}>
                  {bpoStatusLabel(selected.bpo_status)}
                </span>
              )}
            </DialogHeader>
          </div>
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">BPO status</p>
                <p className="mt-1 text-sm text-gray-900">{bpoStatusLabel(selected?.bpo_status)}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Assigned</p>
                <p className="mt-1 text-sm text-gray-900">{displayValue(selected?.assigned_to_name)}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Last follow-up</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-900">{displayValue(selected?.last_follow_up_notes)}</p>
              </div>
              {selected?.bpo_disqualify_reason ? (
                <div className="sm:col-span-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Not qualified reason</p>
                  <p className="mt-1 text-sm text-rose-800">{selected.bpo_disqualify_reason}</p>
                </div>
              ) : null}
              {selected?.converted_customer_ledger_id ? (
                <div className="sm:col-span-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Ledger customer</p>
                  <p className="mt-1 text-sm text-emerald-800">{selected.converted_customer_ledger_id}</p>
                </div>
              ) : null}
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">BPO follow-up history</p>
              {followUps.length === 0 ? (
                <p className="text-sm text-muted-foreground">No BPO activity yet.</p>
              ) : (
                <div className="space-y-2">
                  {followUps.map((item) => (
                    <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                        <span className="font-medium text-slate-800">{bpoOutcomeLabel(item.outcome)}</span>
                        <span>{item.created_at ? String(item.created_at).replace('T', ' ').slice(0, 16) : ''}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{item.notes || '—'}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.created_by_name || 'BPO'}
                        {item.next_follow_up_date ? ` · next ${item.next_follow_up_date}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {DETAIL_FIELDS.map(([key, label]) => (
              <div key={key} className={['proposed_address', 'communication_address', 'project_name'].includes(key) ? 'sm:col-span-2' : ''}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
                <p className="mt-1 text-sm text-gray-900 break-words">
                  {displayValue(
                    key === 'contact_email' ? rowEmail(selected)
                      : key === 'contact_phone' ? rowContact(selected)
                        : key === 'days_to_expire' ? displayDaysUntilExpiry(selected?.validity_end)
                          : selected?.[key],
                  )}
                </p>
              </div>
            ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default BusinessPotential;
