import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, Pager, Spinner, apiError, daysAgoISO, downloadReport, inputClass, inventoryApi, todayISO } from './shared';

const REPORTS = [
  ['current-stock', 'Current stock'],
  ['valuation', 'Stock valuation'],
  ['low-stock', 'Low stock'],
  ['out-of-stock', 'Out of stock'],
  ['movements', 'Inventory movement'],
  ['purchase-orders', 'Purchase orders'],
  ['goods-received', 'Goods received'],
];

export default function ReportsPage() {
  const [kind, setKind] = useState('current-stock');
  const [from, setFrom] = useState(daysAgoISO(29));
  const [to, setTo] = useState(todayISO());
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await inventoryApi.get(`/reports/${kind}`, {
        date_from: from || undefined,
        date_to: to || undefined,
        q: q || undefined,
        page,
        page_size: 25,
      });
      setReport(data);
    } catch (err) {
      toast.error(apiError(err, 'Failed to load the report'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [kind, from, to, q, page]);

  const exportFile = async (format) => {
    try {
      const response = await downloadReport(kind, { format, date_from: from || undefined, date_to: to || undefined, q: q || undefined });
      const blob = new Blob([response.data]);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${kind}.${format === 'xlsx' ? 'xlsx' : 'csv'}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(apiError(err, 'Export failed'));
    }
  };

  return (
    <Card className="p-4 space-y-4 print:shadow-none">
      <div className="flex flex-col lg:flex-row gap-3 lg:items-end justify-between print:hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 flex-1">
          <select className={inputClass} value={kind} onChange={(e) => { setPage(1); setKind(e.target.value); }} aria-label="Report">
            {REPORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input className={inputClass} value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} placeholder="Search" aria-label="Search report" />
          <input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => exportFile('csv')}>CSV</Button>
          <Button variant="outline" onClick={() => exportFile('xlsx')}>Excel</Button>
          <Button variant="outline" onClick={() => window.print()}>Print</Button>
        </div>
      </div>
      {report && (
        <div className="rounded-lg border border-border bg-muted px-3 py-2 text-sm">
          <p>{report.definition}</p>
          <p className="text-muted-foreground mt-1">Period: {report.period?.from || 'any'} to {report.period?.to || 'any'}</p>
        </div>
      )}
      {loading || !report ? <Spinner /> : report.rows.length === 0 ? <EmptyState title="No rows for this report" /> : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>{report.columns.map((col) => <th key={col.key} className="px-2 py-2">{col.label}</th>)}</tr>
            </thead>
            <tbody>
              {report.rows.map((row, index) => (
                <tr key={index} className="border-t border-border">
                  {report.columns.map((col) => <td key={col.key} className="px-2 py-2">{row[col.key] ?? '—'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} pageSize={25} total={report?.total || 0} onPage={setPage} />
    </Card>
  );
}
