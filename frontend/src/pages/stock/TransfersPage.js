import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, Pager, Spinner, StatusPill, apiError, formatQty, inputClass, inventoryApi, labelClass, newKey } from './shared';

const blankLine = () => ({ stock_item_id: '', quantity: '' });

export default function TransfersPage() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [lines, setLines] = useState([blankLine()]);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await inventoryApi.get('/transfers', { page, page_size: 15 });
      setRows(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      toast.error(apiError(err, 'Failed to load transfers'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page]);
  useEffect(() => {
    inventoryApi.get('/products', { page_size: 100, status: 'active' }).then(({ data }) => setProducts(data.items || [])).catch(() => {});
    inventoryApi.get('/warehouses').then(({ data }) => setWarehouses((data || []).filter((row) => row.is_active))).catch(() => {});
  }, []);

  const create = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await inventoryApi.post('/transfers', {
        from_warehouse_id: fromId,
        to_warehouse_id: toId,
        notes,
        lines: lines.filter((line) => line.stock_item_id).map((line) => ({ stock_item_id: line.stock_item_id, quantity: Number(line.quantity) })),
      });
      toast.success('Transfer saved as draft. Dispatch it to move stock out of the source warehouse.');
      setLines([blankLine()]);
      setNotes('');
      load();
    } catch (err) {
      toast.error(apiError(err, 'Failed to create the transfer'));
    } finally {
      setSaving(false);
    }
  };

  const act = async (row, action) => {
    if (action === 'cancel' && !window.confirm('Cancel this transfer? An in-transit transfer is reversed back to the source warehouse.')) return;
    try {
      const path = action === 'dispatch' ? 'dispatch' : action === 'receive' ? 'receive' : 'cancel';
      const body = action === 'receive'
        ? { idempotency_key: newKey(), lines: [] }
        : { idempotency_key: newKey(), reason: action === 'cancel' ? 'Transfer cancelled' : undefined };
      await inventoryApi.post(`/transfers/${row.id}/${path}`, body);
      toast.success(action === 'dispatch' ? 'Dispatched. Destination stock is unchanged until receipt.' : 'Transfer updated');
      load();
    } catch (err) {
      toast.error(apiError(err, 'Transfer action failed'));
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <Card className="p-4 xl:col-span-2 space-y-3">
        <h2 className="font-semibold">Transfers</h2>
        <p className="text-sm text-muted-foreground">Dispatch reduces the source. The destination increases only when the receipt is confirmed.</p>
        {loading ? <Spinner /> : rows.length === 0 ? <EmptyState title="No transfers" /> : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.id} className="border border-border rounded-lg p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{row.number}</div>
                    <div className="text-sm text-muted-foreground">{row.from_warehouse_name} → {row.to_warehouse_name}</div>
                  </div>
                  <StatusPill status={row.status} />
                </div>
                <ul className="mt-2 text-sm space-y-1">
                  {(row.lines || []).map((line) => (
                    <li key={line.id} className="flex justify-between">
                      <span>{line.product_name}</span>
                      <span className="tabular-nums">In transit {formatQty(line.in_transit)} / {formatQty(line.quantity)}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2 mt-3">
                  {row.status === 'draft' && <Button type="button" size="sm" onClick={() => act(row, 'dispatch')}>Dispatch</Button>}
                  {row.status === 'in_transit' && <Button type="button" size="sm" onClick={() => act(row, 'receive')}>Confirm receipt</Button>}
                  {['draft', 'in_transit'].includes(row.status) && <Button type="button" size="sm" variant="outline" onClick={() => act(row, 'cancel')}>Cancel</Button>}
                </div>
              </div>
            ))}
          </div>
        )}
        <Pager page={page} pageSize={15} total={total} onPage={setPage} />
      </Card>
      <Card className="p-4">
        <h2 className="font-semibold mb-3">New transfer</h2>
        <form onSubmit={create} className="space-y-3">
          <label className="space-y-2 block"><span className={labelClass}>From *</span>
            <select className={inputClass} value={fromId} onChange={(e) => setFromId(e.target.value)} required>
              <option value="">Select</option>
              {warehouses.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </label>
          <label className="space-y-2 block"><span className={labelClass}>To *</span>
            <select className={inputClass} value={toId} onChange={(e) => setToId(e.target.value)} required>
              <option value="">Select</option>
              {warehouses.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </label>
          {lines.map((line, index) => (
            <div key={index} className="grid grid-cols-2 gap-2">
              <select className={inputClass} value={line.stock_item_id} onChange={(e) => setLines(lines.map((item, i) => i === index ? { ...item, stock_item_id: e.target.value } : item))} aria-label="Product">
                <option value="">Product</option>
                {products.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
              <input type="number" min="0" step="any" className={inputClass} value={line.quantity} placeholder="Qty" onChange={(e) => setLines(lines.map((item, i) => i === index ? { ...item, quantity: e.target.value } : item))} />
            </div>
          ))}
          <button type="button" className="text-sm text-primary" onClick={() => setLines([...lines, blankLine()])}>Add line</button>
          <textarea className={`${inputClass} h-20`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" />
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save draft'}</Button>
        </form>
      </Card>
    </div>
  );
}
