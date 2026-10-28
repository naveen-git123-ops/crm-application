import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Download, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { getApiErrorMessage } from '@/lib/apiErrors';
import {
  fmtDate, fmtDateTime, serviceApi, triggerDownload,
} from '@/lib/serviceUtils';
import { StatusBadge } from '@/components/service/ServiceFields';

/** Service history of one customer (all their products, leads and visits). */
export function ServiceHistoryDialog({ open, onClose, onOpenService }) {
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery(''); setCustomers([]); setCustomer(null); setRows([]);
      return undefined;
    }
    if (customer) return undefined;
    const timer = setTimeout(async () => {
      try {
        setCustomers(await serviceApi.get('/service/customers', { q: query, limit: 15 }));
      } catch (err) {
        toast.error(getApiErrorMessage(err, 'Could not search customers'));
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [open, query, customer]);

  const choose = async (c) => {
    setCustomer(c);
    setLoading(true);
    try {
      setRows(await serviceApi.get('/service-requests/history', { customer_id: c.id }));
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not load the history'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Service history</DialogTitle>
          <DialogDescription>Every service request for a customer, newest first.</DialogDescription>
        </DialogHeader>

        {!customer ? (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input aria-label="Search customer" className="pl-8" placeholder="Search customer" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
            </div>
            <ul className="max-h-64 divide-y overflow-y-auto rounded-lg border">
              {customers.map((c) => (
                <li key={c.id}>
                  <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => choose(c)}>
                    <span className="font-medium">{c.company_name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{[c.customer_id, c.city].filter(Boolean).join(' · ')}</span>
                  </button>
                </li>
              ))}
              {customers.length === 0 && <li className="px-3 py-4 text-sm text-muted-foreground">No customers found.</li>}
            </ul>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">{customer.company_name}</div>
              <Button variant="outline" size="sm" onClick={() => { setCustomer(null); setRows([]); }}>Change customer</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    {['Service ID', 'Date', 'Type', 'Product', 'Lead', 'Technician', 'Visits', 'Vendor', 'Report', 'Status'].map((h) => <th key={h} className="py-2 pr-3">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={10} className="py-6 text-center text-muted-foreground">Loading…</td></tr>}
                  {!loading && rows.map((r) => (
                    <tr key={r.id} className="cursor-pointer border-b border-border hover:bg-muted" onClick={() => { onOpenService(r.id); onClose(); }}>
                      <td className="py-2 pr-3 font-mono text-xs">{r.service_code}</td>
                      <td className="py-2 pr-3">{fmtDate(r.request_date)}</td>
                      <td className="py-2 pr-3">{r.service_type || '—'}</td>
                      <td className="py-2 pr-3">{[r.product_name, r.serial_number].filter(Boolean).join(' · ') || '—'}</td>
                      <td className="max-w-[10rem] truncate py-2 pr-3">{r.lead_label || '—'}</td>
                      <td className="py-2 pr-3">{r.assigned_name || '—'}</td>
                      <td className="py-2 pr-3">{r.visit_count}</td>
                      <td className="py-2 pr-3">{r.vendor_repair_count}</td>
                      <td className="py-2 pr-3">{r.report_status || '—'}</td>
                      <td className="py-2 pr-3"><StatusBadge status={r.status} /></td>
                    </tr>
                  ))}
                  {!loading && rows.length === 0 && <tr><td colSpan={10} className="py-6 text-center text-muted-foreground">No service history for this customer.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Submitted final service reports (PDF available for each). */
export function ServiceReportsDialog({ open, onClose, onOpenService }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    serviceApi.get('/service-requests/reports')
      .then(setRows)
      .catch((err) => toast.error(getApiErrorMessage(err, 'Could not load reports')))
      .finally(() => setLoading(false));
  }, [open]);

  const download = async (row) => {
    setDownloading(row.service_id);
    try {
      const res = await serviceApi.blob(`/service-requests/${row.service_id}/report/pdf`);
      triggerDownload(res.data, `${row.report_no || row.service_code}.pdf`);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not download the report'));
    } finally {
      setDownloading('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Service reports</DialogTitle>
          <DialogDescription>Final service reports that have been submitted.</DialogDescription>
        </DialogHeader>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              {['Report', 'Service', 'Customer', 'Type', 'Submitted', ''].map((h) => <th key={h} className="py-2 pr-3">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Loading…</td></tr>}
            {!loading && rows.map((r) => (
              <tr key={`${r.service_id}-${r.revision}`} className="border-b border-border">
                <td className="py-2 pr-3 font-mono text-xs">{r.report_no}</td>
                <td className="py-2 pr-3">
                  <button type="button" className="text-indigo-700 hover:underline" onClick={() => { onOpenService(r.service_id); onClose(); }}>{r.service_code}</button>
                </td>
                <td className="py-2 pr-3">{r.customer_name}</td>
                <td className="py-2 pr-3">{r.service_type}</td>
                <td className="py-2 pr-3">{fmtDateTime(r.submitted_at)}<div className="text-xs text-muted-foreground">{r.submitted_by}</div></td>
                <td className="py-2 text-right">
                  <Button variant="outline" size="sm" onClick={() => download(r)} disabled={downloading === r.service_id}>
                    <Download className="mr-1 h-3.5 w-3.5" />PDF
                  </Button>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No reports have been submitted yet.</td></tr>}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  );
}
