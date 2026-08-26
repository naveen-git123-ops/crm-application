import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { NotebookPen, PhoneForwarded, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { API_ENDPOINT } from '@/lib/apiConfig';
import { getApiErrorMessage } from '@/lib/apiErrors';
import {
  BPO_DESK_OUTCOMES,
  BPO_NOT_QUALIFIED_REASONS,
  BPO_SITE_VISIT_OUTCOMES,
  BPO_STATUS_TONES,
  bpoOutcomeLabel,
  bpoStatusLabel,
  convertPrefill,
  displayDate,
  displayDaysUntilExpiry,
  displayValue,
  rowContact,
  rowEmail,
  todayIso,
  validEndRowTone,
} from '@/lib/businessPotential';
import { cn } from '@/lib/utils';

const API = API_ENDPOINT;
const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

export function BpoWorkPanel({
  record,
  history = [],
  mode = 'desk',
  onSaved,
  extraActions = null,
}) {
  const outcomes = mode === 'site-visit' ? BPO_SITE_VISIT_OUTCOMES : BPO_DESK_OUTCOMES;
  const [outcome, setOutcome] = useState(outcomes[0].key);
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [nextDate, setNextDate] = useState(todayIso());
  const [showConvert, setShowConvert] = useState(false);
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [convertForm, setConvertForm] = useState(convertPrefill(record));

  const selected = useMemo(() => outcomes.find((item) => item.key === outcome) || outcomes[0], [outcomes, outcome]);

  useEffect(() => {
    setOutcome(outcomes[0].key);
    setNotes('');
    setReason('');
    setNextDate(todayIso());
    setShowConvert(false);
    setConvertForm(convertPrefill(record));
  }, [record?.id, mode]);

  useEffect(() => {
    if (selected?.convert) setShowConvert(true);
  }, [selected?.convert]);

  const tone = validEndRowTone(record?.validity_end);

  const saveFollowUp = async () => {
    if (!record?.id || selected?.convert) return;
    if (selected?.needsReason && !reason) {
      toast.error('Select a reason for not qualified');
      return;
    }
    if (!notes.trim() && !selected?.needsReason) {
      toast.error('Add follow-up notes before saving');
      return;
    }
    if (selected?.needsReason && reason === 'Other' && !notes.trim()) {
      toast.error('Add a reason in the notes');
      return;
    }
    setSaving(true);
    try {
      await axios.post(
        `${API}/business-potential-records/${record.id}/follow-ups`,
        {
          outcome,
          notes: notes.trim(),
          reason: selected?.needsReason ? reason : undefined,
          next_follow_up_date: selected?.needsNext ? nextDate : undefined,
        },
        authHeaders(),
      );
      toast.success(
        outcome === 'on_hold'
          ? 'On hold — record stays in the BPO queue'
          : outcome === 'site_visit'
            ? 'Sent to the site-visit queue'
            : outcome === 'not_qualified'
              ? 'Marked not qualified'
              : 'Visit note saved',
      );
      onSaved?.(outcome);
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
      toast.success(`Our client — ledger ${data?.customer_ledger_id || 'created'}`);
      onSaved?.('our_client');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to mark as Our client'));
    } finally {
      setConverting(false);
    }
  };

  if (!record) return null;

  return (
    <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {mode === 'site-visit' ? 'Site visit' : 'BPO queue'}
            </p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">{displayValue(record.project_name)}</h3>
            <p className="text-sm text-slate-500">{displayValue(record.village_name)} · {displayValue(record.district_name)}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-medium', BPO_STATUS_TONES[record.bpo_status] || BPO_STATUS_TONES.new)}>
              {bpoStatusLabel(record.bpo_status)}
            </span>
            <span className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums',
              tone === 'red' && 'bg-red-100 text-red-700',
              tone === 'yellow' && 'bg-yellow-100 text-yellow-800',
              tone === 'sky' && 'bg-sky-100 text-sky-800',
              !tone && 'bg-slate-100 text-slate-700',
            )}>
              {displayDaysUntilExpiry(record.validity_end)}
            </span>
            {tone === 'yellow' && (
              <span className="rounded-full bg-yellow-50 px-2 py-0.5 text-[11px] font-medium text-yellow-800">1st · yellow</span>
            )}
            {tone === 'red' && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">2nd · expired</span>
            )}
            {tone === 'sky' && (
              <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-800">3rd · blue</span>
            )}
          </div>
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
            <p className="text-[11px] uppercase text-slate-500">Valid start</p>
            <p className="font-medium text-slate-800">{displayDate(record.validity_start)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase text-slate-500">Valid end</p>
            <p className={cn(
              'font-medium',
              tone === 'red' && 'text-red-700',
              tone === 'yellow' && 'text-yellow-700',
              tone === 'sky' && 'text-sky-700',
              !tone && 'text-slate-800',
            )}>{displayDate(record.validity_end)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase text-slate-500">Days to expire</p>
            <p className={cn(
              'font-semibold tabular-nums',
              tone === 'red' && 'text-red-700',
              tone === 'yellow' && 'text-yellow-700',
              tone === 'sky' && 'text-sky-700',
              !tone && 'text-slate-800',
            )}>{displayDaysUntilExpiry(record.validity_end)}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-[11px] uppercase text-slate-500">Proposed address</p>
            <p className="text-sm text-slate-800">{displayValue(record.proposed_address || record.communication_address)}</p>
          </div>
          {record.last_follow_up_notes ? (
            <div className="sm:col-span-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              <p className="text-[11px] uppercase text-slate-500">Last BPO follow-up</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{record.last_follow_up_notes}</p>
            </div>
          ) : null}
        </div>

        <div className="space-y-3 border-t border-slate-100 pt-4">
          <p className="text-sm font-semibold text-slate-800">Update status</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Status</Label>
              <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm">
                {outcomes.map((item) => (
                  <option key={item.key} value={item.key}>{item.label}</option>
                ))}
              </select>
            </div>
            {selected?.needsNext && (
              <div>
                <Label>Bring back on</Label>
                <Input type="date" className="mt-1" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
              </div>
            )}
            {selected?.needsReason && (
              <div className={selected?.needsNext ? '' : 'sm:col-span-2'}>
                <Label>Reason</Label>
                <select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm">
                  <option value="">Select reason</option>
                  {BPO_NOT_QUALIFIED_REASONS.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div>
            <Label>{selected?.needsReason ? 'Follow-up notes' : 'Notes'}</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder={
                selected?.convert
                  ? 'Optional notes for the ledger customer…'
                  : selected?.needsReason
                    ? 'Add context. Required if reason is Other.'
                    : 'What was discussed, who you spoke to, and the next step…'
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {!selected?.convert && (
              <Button type="button" disabled={saving} onClick={saveFollowUp}>
                <NotebookPen className="mr-1.5 h-4 w-4" />
                {saving ? 'Saving…' : 'Save status'}
              </Button>
            )}
            {selected?.convert && (
              <Button type="button" variant="outline" onClick={() => setShowConvert(true)}>
                <UserPlus className="mr-1.5 h-4 w-4" />
                Create ledger customer
              </Button>
            )}
            {extraActions}
          </div>
          {outcome === 'on_hold' && (
            <p className="text-xs text-amber-700">On hold keeps this record in the BPO queue so it comes back after the date above.</p>
          )}
          {outcome === 'site_visit' && (
            <p className="text-xs text-sky-700">This leaves the BPO queue and appears on the Site Visit screen for field staff.</p>
          )}
          {outcome === 'not_qualified' && (
            <p className="text-xs text-rose-700">Not qualified stays on Business Potential with the reason. It will not return to the BPO queue.</p>
          )}
        </div>

        {showConvert && selected?.convert && (
          <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
            <p className="text-sm font-semibold text-emerald-900">Mark as Our client</p>
            <p className="text-xs text-emerald-800">Creates a Create Ledger customer. The potential record stays on Business Potential as Our client.</p>
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
              {converting ? 'Saving…' : 'Create ledger & mark Our client'}
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-800">Follow-up history</p>
        {history.length === 0 ? (
          <p className="text-sm text-slate-500">No BPO activity yet.</p>
        ) : (
          <div className="space-y-2">
            {history.map((item) => (
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
    </div>
  );
}

export default BpoWorkPanel;
