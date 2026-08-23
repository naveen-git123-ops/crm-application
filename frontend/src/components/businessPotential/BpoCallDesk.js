import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Phone, PhoneForwarded, UserPlus, SkipForward, NotebookPen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { API_ENDPOINT } from '@/lib/apiConfig';
import { getApiErrorMessage } from '@/lib/apiErrors';
import {
  BPO_OUTCOMES,
  BPO_STATUS_LABELS,
  convertPrefill,
  displayValue,
  rowContact,
  rowEmail,
} from '@/lib/businessPotential';
import { cn } from '@/lib/utils';

const API = API_ENDPOINT;
const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

function todayIso() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function BpoCallDesk({ onConverted }) {
  const [stats, setStats] = useState({ my_target: 0, my_calls: 0, my_conversions: 0, open_records: 0 });
  const [record, setRecord] = useState(null);
  const [remaining, setRemaining] = useState(0);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [showConvert, setShowConvert] = useState(false);
  const [outcome, setOutcome] = useState('called_interested');
  const [notes, setNotes] = useState('');
  const [nextDate, setNextDate] = useState(todayIso());
  const [convertForm, setConvertForm] = useState(convertPrefill(null));

  const needsNext = BPO_OUTCOMES.find((item) => item.key === outcome)?.needsNext;

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
      setOutcome('called_interested');
      setNotes('');
      setNextDate(todayIso());
      setShowConvert(false);
      setConvertForm(convertPrefill(item));
      if (item?.id) {
        const hist = await axios.get(`${API}/business-potential-records/${item.id}/follow-ups`, authHeaders());
        setHistory(Array.isArray(hist.data) ? hist.data : []);
      } else {
        setHistory([]);
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to load the next call'));
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

  const saveFollowUp = async () => {
    if (!record?.id) return;
    if (!notes.trim()) {
      toast.error('Add follow-up notes before saving');
      return;
    }
    setSaving(true);
    try {
      await axios.post(
        `${API}/business-potential-records/${record.id}/follow-ups`,
        {
          outcome,
          notes: notes.trim(),
          next_follow_up_date: needsNext ? nextDate : undefined,
        },
        authHeaders(),
      );
      toast.success('Follow-up saved');
      await loadStats();
      await loadQueue(record.id);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to save follow-up'));
    } finally {
      setSaving(false);
    }
  };

  const convertRecord = async () => {
    if (!record?.id) return;
    if (!convertForm.company_name.trim() || !convertForm.contact_person_name.trim()) {
      toast.error('Company name and contact person are required');
      return;
    }
    setConverting(true);
    try {
      const { data } = await axios.post(
        `${API}/business-potential-records/${record.id}/convert`,
        convertForm,
        authHeaders(),
      );
      toast.success(`Moved to Create Ledger as ${data?.customer_ledger_id || 'customer'}`);
      onConverted?.();
      await loadStats();
      await loadQueue(record.id);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to convert this record'));
    } finally {
      setConverting(false);
    }
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
          <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">Calls / follow-ups</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-indigo-800">{calls}</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Converted today</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-800">{Number(stats.my_conversions || 0)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Still in queue</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{remaining || Number(stats.open_records || 0)}</p>
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
          <p>No more potential customers in the call queue.</p>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Next call</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">{displayValue(record.project_name)}</h3>
                <p className="text-sm text-slate-500">{displayValue(record.village_name)} · {displayValue(record.district_name)}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                {BPO_STATUS_LABELS[record.bpo_status] || 'New'}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
              <div>
                <p className="text-[11px] uppercase text-slate-500">Phone</p>
                <a className="font-medium text-indigo-700" href={rowContact(record) ? `tel:${rowContact(record)}` : undefined}>{displayValue(rowContact(record))}</a>
              </div>
              <div>
                <p className="text-[11px] uppercase text-slate-500">Email</p>
                <p className="font-medium text-slate-800 break-all">{displayValue(rowEmail(record))}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase text-slate-500">NOC / Application</p>
                <p className="font-mono text-xs text-slate-800">{displayValue(record.noc_number)} · {displayValue(record.application_number)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase text-slate-500">Valid end</p>
                <p className="font-medium text-slate-800">{displayValue(record.validity_end)}</p>
              </div>
            </div>

            <div className="space-y-3 border-t border-slate-100 pt-4">
              <p className="text-sm font-semibold text-slate-800">Log this follow-up</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label>Call result</Label>
                  <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm">
                    {BPO_OUTCOMES.map((item) => (
                      <option key={item.key} value={item.key}>{item.label}</option>
                    ))}
                  </select>
                </div>
                {needsNext && (
                  <div>
                    <Label>Next follow-up date</Label>
                    <Input type="date" className="mt-1" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
                  </div>
                )}
              </div>
              <div>
                <Label>Notes</Label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  placeholder="What was discussed, who you spoke to, and the next step…"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={saving} onClick={saveFollowUp}>
                  <NotebookPen className="mr-1.5 h-4 w-4" />
                  {saving ? 'Saving…' : 'Save follow-up & next'}
                </Button>
                <Button type="button" variant="outline" onClick={() => loadQueue(record.id)}>
                  <SkipForward className="mr-1.5 h-4 w-4" />
                  Skip
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowConvert((v) => !v)}>
                  <UserPlus className="mr-1.5 h-4 w-4" />
                  Convert to customer
                </Button>
              </div>
            </div>

            {showConvert && (
              <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                <p className="text-sm font-semibold text-emerald-900">Move required data to Create Ledger</p>
                <p className="text-xs text-emerald-800">This record will leave Business Potential after conversion.</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Company name</Label>
                    <Input className="mt-1" value={convertForm.company_name} onChange={(e) => setConvertForm((f) => ({ ...f, company_name: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Contact person</Label>
                    <Input className="mt-1" value={convertForm.contact_person_name} onChange={(e) => setConvertForm((f) => ({ ...f, contact_person_name: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input className="mt-1" value={convertForm.phone} onChange={(e) => setConvertForm((f) => ({ ...f, phone: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input className="mt-1" value={convertForm.email} onChange={(e) => setConvertForm((f) => ({ ...f, email: e.target.value }))} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Address</Label>
                    <Input className="mt-1" value={convertForm.address_line} onChange={(e) => setConvertForm((f) => ({ ...f, address_line: e.target.value }))} />
                  </div>
                  <div>
                    <Label>City</Label>
                    <Input className="mt-1" value={convertForm.city} onChange={(e) => setConvertForm((f) => ({ ...f, city: e.target.value }))} />
                  </div>
                  <div>
                    <Label>State</Label>
                    <Input className="mt-1" value={convertForm.state} onChange={(e) => setConvertForm((f) => ({ ...f, state: e.target.value }))} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Conversion notes</Label>
                    <textarea
                      value={convertForm.notes}
                      onChange={(e) => setConvertForm((f) => ({ ...f, notes: e.target.value }))}
                      rows={2}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <Button type="button" className="bg-emerald-700 hover:bg-emerald-800" disabled={converting} onClick={convertRecord}>
                  <PhoneForwarded className="mr-1.5 h-4 w-4" />
                  {converting ? 'Converting…' : 'Create ledger customer'}
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-800">Follow-up history</p>
            {history.length === 0 ? (
              <p className="text-sm text-slate-500">No follow-up yet. This is the first call.</p>
            ) : (
              <div className="space-y-2">
                {history.map((item) => (
                  <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span className={cn('font-medium text-slate-800')}>
                        {BPO_OUTCOMES.find((o) => o.key === item.outcome)?.label || item.outcome}
                      </span>
                      <span>{item.created_at ? String(item.created_at).replace('T', ' ').slice(0, 16) : ''}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{item.notes || '—'}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.created_by_name || 'BPO'}
                      {item.next_follow_up_date ? ` · next ${item.next_follow_up_date}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default BpoCallDesk;
