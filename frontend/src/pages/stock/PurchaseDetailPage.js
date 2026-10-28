import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { apiError, formatMoney, formatQty, inputClass, inventoryApi, newKey, StatusPill } from './shared';

export default function PurchaseDetailPage() {
  const { poId } = useParams();
  const [po, setPo] = useState(null);
  const [qty, setQty] = useState({});
  const [supplierRef, setSupplierRef] = useState('');
  const [key, setKey] = useState(newKey());
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await inventoryApi.get(`/purchase-orders/${poId}`);
    setPo(data);
    const next = {};
    (data.lines || []).forEach((line) => { next[line.id] = line.outstanding_qty > 0 ? String(line.outstanding_qty) : ''; });
    setQty(next);
  };

  useEffect(() => { load().catch((err) => toast.error(apiError(err, 'Failed to load purchase order'))); }, [poId]);

  const run = async (action) => {
    setSaving(true);
    try {
      if (action === 'receive') {
        const lines = (po.lines || [])
          .filter((line) => Number(qty[line.id]) > 0)
          .map((line) => ({ purchase_order_line_id: line.id, quantity: Number(qty[line.id]) }));
        await inventoryApi.post(`/purchase-orders/${poId}/receive`, {
          idempotency_key: key,
          supplier_ref: supplierRef || null,
          lines,
        });
        toast.success('Goods receipt posted. On-hand stock increased once.');
        setKey(newKey());
      } else {
        if (action === 'cancel' && !window.confirm('Cancel this purchase order? Received stock stays; only the outstanding quantity is cancelled.')) {
          setSaving(false);
          return;
        }
        await inventoryApi.post(`/purchase-orders/${poId}/${action}`);
        toast.success('Purchase order updated');
      }
      load();
    } catch (err) {
      toast.error(apiError(err, 'Could not update the purchase order'));
    } finally {
      setSaving(false);
    }
  };

  if (!po) return <div role="status" aria-label="Loading" className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />;

  return (
    <div className="space-y-4">
      <Link to="/stock-management/purchases" className="text-sm text-primary hover:underline">Back to purchase orders</Link>
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{po.number}</h2>
            <p className="text-sm text-muted-foreground">{po.supplier_name} · {po.warehouse_name}</p>
          </div>
          <StatusPill status={po.status} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div><div className="text-muted-foreground">Subtotal</div><div className="font-medium tabular-nums">{formatMoney(po.subtotal)}</div></div>
          <div><div className="text-muted-foreground">Discount</div><div className="font-medium tabular-nums">{formatMoney(po.discount_amount)}</div></div>
          <div><div className="text-muted-foreground">Tax</div><div className="font-medium tabular-nums">{formatMoney(po.tax_amount)}</div></div>
          <div><div className="text-muted-foreground">Order total</div><div className="font-medium tabular-nums">{formatMoney(po.total)}</div></div>
        </div>
        <p className="text-xs text-muted-foreground">Order total is the purchase commitment. It is not inventory value until a goods receipt is posted.</p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2">Product</th>
                <th className="py-2 text-right">Ordered</th>
                <th className="py-2 text-right">Received</th>
                <th className="py-2 text-right">Outstanding</th>
                <th className="py-2 text-right">Cost</th>
                <th className="py-2">Receive now</th>
              </tr>
            </thead>
            <tbody>
              {(po.lines || []).map((line) => (
                <tr key={line.id} className="border-t border-border">
                  <td className="py-2">{line.description}</td>
                  <td className="py-2 text-right tabular-nums">{formatQty(line.quantity)}</td>
                  <td className="py-2 text-right tabular-nums">{formatQty(line.received_qty)}</td>
                  <td className="py-2 text-right tabular-nums">{formatQty(line.outstanding_qty)}</td>
                  <td className="py-2 text-right tabular-nums">{formatMoney(line.unit_cost)}</td>
                  <td className="py-2">
                    {['approved', 'partially_received'].includes(po.status) && line.outstanding_qty > 0 ? (
                      <input type="number" min="0" step="any" className={inputClass} value={qty[line.id] || ''} onChange={(e) => setQty({ ...qty, [line.id]: e.target.value })} />
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-2">
          {po.status === 'draft' && <Button disabled={saving} onClick={() => run('submit')}>Submit for approval</Button>}
          {po.status === 'pending_approval' && <Button disabled={saving} onClick={() => run('approve')}>Approve</Button>}
          {['approved', 'partially_received'].includes(po.status) && (
            <>
              <input aria-label="Supplier delivery ref" className={inputClass + ' max-w-xs'} placeholder="Supplier delivery ref" value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} />
              <Button disabled={saving} onClick={() => run('receive')}>{saving ? 'Posting…' : 'Post goods receipt'}</Button>
            </>
          )}
          {!['received', 'cancelled'].includes(po.status) && <Button variant="outline" disabled={saving} onClick={() => run('cancel')}>Cancel order</Button>}
        </div>
        {(po.receipts || []).length > 0 && (
          <div className="text-sm">
            <h3 className="font-medium mb-1">Receipts</h3>
            {po.receipts.map((row) => <div key={row.id}>{row.number} · {row.received_at?.replace('T', ' ')} · {row.supplier_ref || 'No supplier ref'}</div>)}
          </div>
        )}
      </Card>
    </div>
  );
}
