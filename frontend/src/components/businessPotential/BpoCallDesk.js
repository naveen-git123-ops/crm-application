import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Phone, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { API_ENDPOINT } from '@/lib/apiConfig';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { BpoWorkPanel } from '@/components/businessPotential/BpoWorkPanel';

const API = API_ENDPOINT;
const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

export function BpoCallDesk({ onConverted }) {
  const [stats, setStats] = useState({ my_target: 0, my_calls: 0, my_conversions: 0, open_records: 0 });
  const [record, setRecord] = useState(null);
  const [remaining, setRemaining] = useState(0);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    const { data } = await axios.get(`${API}/business-potential-records/bpo-stats`, authHeaders());
    setStats(data || { my_target: 0, my_calls: 0, my_conversions: 0, open_records: 0 });
  }, []);

  const loadQueue = useCallback(async (skipId) => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/business-potential-records/queue`, {
        ...authHeaders(),
        params: { skip_id: skipId || undefined },
      });
      const item = data?.item || null;
      setRecord(item);
      setRemaining(Number(data?.remaining || 0));
      if (item?.id) {
        const hist = await axios.get(`${API}/business-potential-records/${item.id}/follow-ups`, authHeaders());
        setHistory(Array.isArray(hist.data) ? hist.data : []);
      } else {
        setHistory([]);
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to load the next BPO record'));
      setRecord(null);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats().catch(() => {});
    loadQueue();
  }, [loadStats, loadQueue]);

  const handleSaved = async (outcome) => {
    await loadStats();
    await loadQueue(record?.id);
    if (outcome === 'our_client') onConverted?.();
  };

  const target = Number(stats.my_target || 0);
  const calls = Number(stats.my_calls || 0);
  const progress = target > 0 ? Math.min(100, Math.round((calls / target) * 100)) : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
      <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Today’s target</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{target || '—'}</p>
        </div>
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">Follow-ups today</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-indigo-800">{calls}</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Our client today</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-800">{Number(stats.my_conversions || 0)}</p>
        </div>
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-yellow-800">Still in queue</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-yellow-900">{remaining || Number(stats.open_records || 0)}</p>
        </div>
      </div>
      {target > 0 && (
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-indigo-500" style={{ width: `${progress}%` }} />
        </div>
      )}

      {loading && !record ? (
        <div className="flex flex-1 items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      ) : !record ? (
        <div className="flex flex-1 flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <Phone className="mb-2 h-10 w-10 opacity-40" />
          <p>No records in the BPO queue.</p>
        </div>
      ) : (
        <BpoWorkPanel
          mode="desk"
          record={record}
          history={history}
          onSaved={handleSaved}
          extraActions={(
            <Button type="button" variant="outline" onClick={() => loadQueue(record.id)}>
              <SkipForward className="mr-1.5 h-4 w-4" />
              Skip
            </Button>
          )}
        />
      )}
    </div>
  );
}

export default BpoCallDesk;
