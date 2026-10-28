import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, Pager, Spinner, apiError, formatQty, inputClass, inventoryApi, newKey } from './shared';

export default function MovementsPage() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [movementType, setMovementType] = useState('');
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState('');
  const [target, setTarget] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await inventoryApi.get('/movements', { q: q || undefined, movement_type: movementType || undefined, page, page_size: 25 });
      setRows(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      toast.error(apiError(err, 'Failed to load the ledger'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [q, movementType, page]);

  const reverse = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error('A reason is required');
      return;
    }
    setSaving(true);
    try {
      await inventoryApi.post(`/movements/${target}/reverse`, { reason: reason.trim(), idempotency_key: newKey() });
      toast.success('Reversal posted. The original entry was kept.');
      setTarget(null);
      setReason('');
      load();
    } catch (err) {
      toast.error(apiError(err, 'Failed to reverse the transaction'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input className={inputClass} value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} placeholder="Search product, SKU, or number" aria-label="Search ledger" />
        <select className={inputClass} value={movementType} onChange={(e) => { setPage(1); setMovementType(e.target.value); }} aria-label="Movement type">
          <option value="">All types</option>
          <option value="opening_balance">Opening balance</option>
          <option value="purchase_receipt">Purchase receipt</option>
          <option value="adjustment_increase">Adjustment increase</option>
          <option value="adjustment_decrease">Adjustment decrease</option>
          <option value="transfer_dispatch">Transfer dispatch</option>
          <option value="transfer_receipt">Transfer receipt</option>
          <option value="reversal">Reversal</option>
        </select>
      </div>
      {loading ? <Spinner /> : rows.length === 0 ? <EmptyState title="No ledger entries" detail="Receipts, transfers, and adjustments appear here." /> : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-3">Date</th>
                <th className="px-3 py-3">Number</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Product</th>
                <th className="px-3 py-3">Warehouse</th>
                <th className="px-3 py-3 text-right">Before</th>
                <th className="px-3 py-3 text-right">Change</th>
                <th className="px-3 py-3 text-right">After</th>
                <th className="px-3 py-3">User</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-3 py-3 whitespace-nowrap">{row.posted_at?.replace('T', ' ')}</td>
                  <td className="px-3 py-3">{row.number}</td>
                  <td className="px-3 py-3">{row.movement_label}</td>
                  <td className="px-3 py-3">{row.product_name}</td>
                  <td className="px-3 py-3">{row.warehouse_name}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatQty(row.qty_before)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatQty(row.qty_change)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatQty(row.qty_after)}</td>
                  <td className="px-3 py-3">{row.actor_name || '—'}</td>
                  <td className="px-3 py-3 text-right">
                    {row.reversed ? <span className="text-xs text-muted-foreground">Reversed</span> : (
                      <button type="button" className="text-sm text-primary" onClick={() => setTarget(row.transaction_id)}>Reverse</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} pageSize={25} total={total} onPage={setPage} />
      {target && (
        <form onSubmit={reverse} className="border border-border rounded-lg p-4 space-y-3">
          <h2 className="font-semibold">Reverse transaction</h2>
          <p className="text-sm text-muted-foreground">This posts a compensating entry. The original line stays on the ledger.</p>
          <textarea aria-label="Reason" className={`${inputClass} h-20`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" required />
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>{saving ? 'Posting…' : 'Post reversal'}</Button>
            <Button type="button" variant="outline" onClick={() => setTarget(null)}>Cancel</Button>
          </div>
        </form>
      )}
    </Card>
  );
}
