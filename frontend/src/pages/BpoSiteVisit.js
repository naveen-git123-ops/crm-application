import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { MapPin, Search } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { BpoWorkPanel } from '@/components/businessPotential/BpoWorkPanel';
import { useRegisterPageHeader } from '@/contexts/PageHeaderContext';
import { API_ENDPOINT } from '@/lib/apiConfig';
import { getApiErrorMessage } from '@/lib/apiErrors';
import {
  BPO_STATUS_TONES,
  bpoStatusLabel,
  displayDate,
  displayDaysUntilExpiry,
  displayValue,
  rowContact,
  validEndRowTone,
} from '@/lib/businessPotential';
import { cn } from '@/lib/utils';

const API = API_ENDPOINT;
const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

export function BpoSiteVisit() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [record, setRecord] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/business-potential-records/site-visit-queue`, {
        ...authHeaders(),
        params: { q: debouncedSearch || undefined },
      });
      const rows = Array.isArray(data?.items) ? data.items : [];
      setItems(rows);
      setTotal(Number(data?.total) || rows.length);
      return rows;
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to load site visits'));
      setItems([]);
      setTotal(0);
      return [];
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  const loadRecord = useCallback(async (id) => {
    if (!id) {
      setRecord(null);
      setHistory([]);
      return;
    }
    try {
      const [{ data: item }, hist] = await Promise.all([
        axios.get(`${API}/business-potential-records/${id}`, authHeaders()),
        axios.get(`${API}/business-potential-records/${id}/follow-ups`, authHeaders()),
      ]);
      setRecord(item || null);
      setHistory(Array.isArray(hist.data) ? hist.data : []);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to load site visit details'));
    }
  }, []);

  useEffect(() => {
    loadList().then((rows) => {
      setSelectedId((current) => {
        if (current && rows.some((row) => row.id === current)) return current;
        return rows[0]?.id || null;
      });
    });
  }, [loadList]);

  useEffect(() => {
    loadRecord(selectedId);
  }, [selectedId, loadRecord]);

  const handleSaved = async (outcome) => {
    const rows = await loadList();
    if (outcome === 'visit_note') {
      await loadRecord(selectedId);
      return;
    }
    const next = rows.find((row) => row.id !== selectedId) || rows[0] || null;
    setSelectedId(next?.id || null);
  };

  useRegisterPageHeader({
    subtitle: `${total.toLocaleString('en-IN')} site visit${total === 1 ? '' : 's'} waiting · yellow (90 days) first`,
    enabled: true,
  });

  return (
    <div className="flex h-[calc(100dvh-13rem)] min-h-0 min-w-0 flex-col lg:h-[calc(100dvh-8.5rem)]" data-testid="bpo-site-visit-page">
      <Card className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-4 sm:p-5 space-y-4">
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.4fr)]">
          <div className="flex min-h-0 flex-col gap-3">
            <div className="relative shrink-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search project, NOC, district…"
                className="h-10 pl-9"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200">
              {loading && items.length === 0 ? (
                <div className="flex items-center justify-center py-16">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
                </div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-4 py-16 text-center text-muted-foreground">
                  <MapPin className="mb-2 h-10 w-10 opacity-40" />
                  <p>No site visits in the field queue.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {items.map((row) => {
                    const tone = validEndRowTone(row.validity_end);
                    const active = row.id === selectedId;
                    return (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => setSelectedId(row.id)}
                        className={cn(
                          'w-full px-3 py-3 text-left',
                          active ? 'bg-indigo-50' : 'hover:bg-slate-50',
                          tone === 'yellow' && !active && 'bg-yellow-50/70',
                          tone === 'red' && !active && 'bg-red-50/50',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-slate-900 line-clamp-2">{displayValue(row.project_name)}</p>
                          {tone === 'yellow' && (
                            <span className="shrink-0 rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-medium text-yellow-800">90d</span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{displayValue(row.district_name)} · {displayValue(rowContact(row))}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">Valid end {displayDate(row.validity_end)} · {displayDaysUntilExpiry(row.validity_end)}</p>
                        <span className={cn('mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium', BPO_STATUS_TONES.site_visit)}>
                          {bpoStatusLabel(row.bpo_status)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <div className="min-h-0 overflow-auto">
            {record ? (
              <BpoWorkPanel mode="site-visit" record={record} history={history} onSaved={handleSaved} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Select a site visit to see details.
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

export default BpoSiteVisit;
