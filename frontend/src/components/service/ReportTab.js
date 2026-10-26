import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Download, Printer, Save, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { INPUT_CLASS, fmtDateTime, serviceApi, triggerDownload } from '@/lib/serviceUtils';
import { BlockerList, FieldGrid, FormField, SectionCard } from '@/components/service/ServiceFields';

const ACK_METHODS = ['Signature on paper', 'Email confirmation', 'Verbal confirmation', 'Digital signature'];

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

function reportHtml(view) {
  const sections = (view.report?.sections || []).map((section) => {
    const rows = (section.rows || []).map(([label, value]) => `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>`).join('');
    let table = '';
    if (section.table) {
      const head = section.table.columns.map((c) => `<th>${esc(c)}</th>`).join('');
      const body = section.table.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');
      table = `<table class="grid"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
    }
    return `<h2>${esc(section.title)}</h2>${rows ? `<table class="kv">${rows}</table>` : ''}${table}`;
  }).join('');
  const draftMark = view.status === 'Submitted' ? '' : '<p class="draft">DRAFT - not submitted</p>';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(view.report_no)}</title><style>
    body{font-family:Arial,sans-serif;font-size:12px;color:#111;margin:24px}
    h1{font-size:18px;margin:0 0 4px} h2{font-size:13px;background:#f1f5f9;padding:4px 8px;margin:16px 0 4px}
    table{border-collapse:collapse;width:100%} th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:left;vertical-align:top}
    .kv th{width:30%;background:#f8fafc;font-weight:600} .grid th{background:#f8fafc}
    .draft{color:#b91c1c;font-weight:700}
  </style></head><body><h1>Service Report ${esc(view.report_no)}${view.revision > 1 ? ` (rev ${esc(view.revision)})` : ''}</h1>${draftMark}${sections}</body></html>`;
}

function errorLines(err, fallback) {
  const detail = err?.response?.data?.detail;
  if (Array.isArray(detail)) return detail;
  return [getApiErrorMessage(err, fallback)];
}

export function ReportTab({ ctx }) {
  const { detail, canWork, caps, ask, reload } = ctx;
  const serviceId = detail.service.id;
  const [view, setView] = useState(null);
  const [draft, setDraft] = useState({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');
  const [problems, setProblems] = useState([]);
  const [loadError, setLoadError] = useState('');

  const apply = useCallback((next) => {
    setView(next);
    const ack = next.draft?.customer_acknowledgement || {};
    setDraft({
      outstanding_issues: next.draft?.outstanding_issues ?? next.report?.outstanding_issues ?? '',
      technician_remarks: next.draft?.technician_remarks ?? '',
      final_remarks: next.draft?.final_remarks ?? '',
      customer_acknowledgement: {
        acknowledged: Boolean(ack.acknowledged), name: ack.name || '', date: ack.date || '',
        method: ack.method || '', notes: ack.notes || '',
      },
    });
    setDirty(false);
  }, []);

  const load = useCallback(async () => {
    try {
      apply(await serviceApi.get(`/service-requests/${serviceId}/report`));
      setLoadError('');
    } catch (err) {
      setLoadError(getApiErrorMessage(err, 'Could not load the report'));
    }
  }, [serviceId, apply]);

  useEffect(() => { load(); }, [load, detail.service.status, detail.service.updated_at]);

  const submitted = view?.status === 'Submitted';
  const editable = canWork && !submitted && !detail.locked;
  const setField = (key) => (value) => { setDraft((p) => ({ ...p, [key]: value })); setDirty(true); };
  const setAck = (key) => (value) => {
    setDraft((p) => ({ ...p, customer_acknowledgement: { ...p.customer_acknowledgement, [key]: value } }));
    setDirty(true);
  };

  const guard = async (key, fn, success) => {
    setBusy(key);
    setProblems([]);
    try {
      const next = await fn();
      if (next) apply(next);
      if (success) toast.success(success);
      await reload();
      return true;
    } catch (err) {
      setProblems(errorLines(err, 'The report action failed'));
      return false;
    } finally {
      setBusy('');
    }
  };

  const save = () => guard('save', () => serviceApi.put(`/service-requests/${serviceId}/report`, { draft }), 'Report draft saved');

  const submit = async () => {
    if (!window.confirm('Submit the final report? It is frozen after submission and can only be changed through a recorded amendment.')) return;
    setBusy('submit');
    setProblems([]);
    try {
      if (dirty) await serviceApi.put(`/service-requests/${serviceId}/report`, { draft });
      apply(await serviceApi.post(`/service-requests/${serviceId}/report/submit`));
      toast.success('Report submitted');
      await reload();
    } catch (err) {
      setProblems(errorLines(err, 'Could not submit the report'));
    } finally {
      setBusy('');
    }
  };

  const amend = () => ask({
    title: 'Amend submitted report',
    description: 'The report becomes a draft again and the previous version is kept in the revision list.',
    confirmLabel: 'Reopen for amendment',
    run: async (reason) => {
      try {
        apply(await serviceApi.post(`/service-requests/${serviceId}/report/amend`, { reason }));
        toast.success('Report reopened for amendment');
        await reload();
      } catch (err) {
        toast.error(errorLines(err, 'Could not amend the report').join('; '));
        throw err;
      }
    },
  });

  const downloadPdf = async () => {
    setBusy('pdf');
    try {
      const res = await serviceApi.blob(`/service-requests/${serviceId}/report/pdf`);
      triggerDownload(res.data, `${view.report_no}${submitted ? '' : '-DRAFT'}.pdf`);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not generate the PDF'));
    } finally {
      setBusy('');
    }
  };

  const print = () => {
    const win = window.open('', '_blank');
    if (!win) {
      toast.error('Allow pop-ups to print the report');
      return;
    }
    win.document.write(reportHtml(view));
    win.document.close();
    win.focus();
    win.print();
  };

  if (loadError) return <p className="rounded bg-rose-50 p-3 text-sm text-rose-800" role="alert">{loadError}</p>;
  if (!view) return <p className="text-sm text-slate-500">Loading report…</p>;

  const ack = draft.customer_acknowledgement || {};

  return (
    <div className="space-y-4">
      <SectionCard
        title={`Service report ${view.report_no}`}
        description={submitted
          ? `Submitted by ${view.submitted_by || '—'} on ${fmtDateTime(view.submitted_at)}${view.revision > 1 ? ` · revision ${view.revision}` : ''}`
          : 'Draft. The report is built from the data recorded on this request.'}
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={downloadPdf} disabled={busy === 'pdf'}><Download className="mr-1 h-4 w-4" />PDF</Button>
            <Button variant="outline" size="sm" onClick={print}><Printer className="mr-1 h-4 w-4" />Print</Button>
            {submitted && caps.manage && <Button variant="outline" size="sm" onClick={amend}>Amend</Button>}
          </div>
        )}
      >
        <BlockerList items={problems} title="This could not be completed" />
        {view.revisions.length > 0 && (
          <div className="mt-3 text-xs text-slate-600">
            <div className="font-semibold">Earlier revisions</div>
            <ul className="mt-1 space-y-0.5">
              {view.revisions.map((r) => (
                <li key={`${r.revision}-${r.amended_at}`}>Revision {r.revision}, submitted {fmtDateTime(r.submitted_at)} by {r.submitted_by}; amended {fmtDateTime(r.amended_at)} by {r.amended_by}: {r.reason}</li>
              ))}
            </ul>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Closing notes">
        <FieldGrid>
          <FormField field={{ key: 'rep-outstanding', label: 'Outstanding issues', type: 'textarea', wide: true }} disabled={!editable} value={draft.outstanding_issues} onChange={setField('outstanding_issues')} />
          <FormField field={{ key: 'rep-tech', label: 'Technician remarks', type: 'textarea', wide: true }} disabled={!editable} value={draft.technician_remarks} onChange={setField('technician_remarks')} />
          <FormField field={{ key: 'rep-final', label: 'Final remarks', type: 'textarea', wide: true }} disabled={!editable} value={draft.final_remarks} onChange={setField('final_remarks')} />
        </FieldGrid>
      </SectionCard>

      <SectionCard
        title="Customer acknowledgement"
        description={view.ack_required ? 'Required for this service type before the report can be submitted.' : 'Optional for this service type.'}
      >
        <label className="mb-3 flex items-center gap-2 text-sm">
          <Checkbox checked={ack.acknowledged} disabled={!editable} onCheckedChange={(v) => setAck('acknowledged')(Boolean(v))} />
          The customer has acknowledged the completed work
        </label>
        {ack.acknowledged && (
          <FieldGrid>
            <FormField field={{ key: 'ack-name', label: 'Acknowledged by', type: 'text', required: true }} disabled={!editable} value={ack.name} onChange={setAck('name')} />
            <FormField field={{ key: 'ack-date', label: 'Date', type: 'date' }} disabled={!editable} value={ack.date} onChange={setAck('date')} />
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600" htmlFor="svc-ack-method">Method</label>
              <select id="svc-ack-method" className={INPUT_CLASS} disabled={!editable} value={ack.method} onChange={(e) => setAck('method')(e.target.value)}>
                <option value="">Select…</option>
                {ACK_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <FormField field={{ key: 'ack-notes', label: 'Notes', type: 'text' }} disabled={!editable} value={ack.notes} onChange={setAck('notes')} />
          </FieldGrid>
        )}
        {editable && (
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={save} disabled={Boolean(busy) || !dirty}><Save className="mr-1 h-4 w-4" />{busy === 'save' ? 'Saving…' : 'Save draft'}</Button>
            <Button onClick={submit} disabled={Boolean(busy)}><Send className="mr-1 h-4 w-4" />{busy === 'submit' ? 'Submitting…' : 'Submit report'}</Button>
          </div>
        )}
        {!editable && !submitted && <p className="mt-3 text-xs text-slate-500">You can view this report but not edit it.</p>}
      </SectionCard>

      <SectionCard title="Report preview">
        <div className="space-y-4">
          {(view.report?.sections || []).map((section) => (
            <div key={section.title}>
              <h4 className="mb-1 rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-800">{section.title}</h4>
              {section.rows?.length > 0 && (
                <table className="w-full border-collapse text-xs">
                  <tbody>
                    {section.rows.map(([label, value]) => (
                      <tr key={label} className="border-b border-slate-100">
                        <th className="w-1/3 py-1 pr-2 text-left align-top font-medium text-slate-600">{label}</th>
                        <td className="py-1 whitespace-pre-wrap break-words">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {section.table && (
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-full border-collapse text-xs">
                    <thead>
                      <tr>{section.table.columns.map((c) => <th key={c} className="border-b px-2 py-1 text-left font-semibold text-slate-600">{c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {section.table.rows.map((row, i) => (
                        <tr key={`${section.title}-${i}`} className="border-b border-slate-100">
                          {row.map((cell, j) => <td key={`${i}-${j}`} className="px-2 py-1 align-top">{cell}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
