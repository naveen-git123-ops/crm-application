import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, Pager, Spinner, StatusPill, apiError, formatMoney, inputClass, inventoryApi, labelClass } from './shared';

const blankLine = () => ({ stock_item_id: '', quantity: '', unit_cost: '', discount_percent: '0', tax_percent: '0' });

export default function PurchasesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [expected, setExpected] = useState('');
  const [lines, setLines] = useState([blankLine()]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await inventoryApi.get('/purchase-orders', { status: status || undefined, page, page_size: 20 });
      setRows(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      toast.error(apiError(err, 'Failed to load purchase orders'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page, status]);
  useEffect(() => {
    inventoryApi.get('/suppliers', { page_size: 100, status: 'active' }).then(({ data }) => setSuppliers(data.items || [])).catch(() => {});
    inventoryApi.get('/warehouses').then(({ data }) => setWarehouses((data || []).filter((row) => row.is_active))).catch(() => {});
    inventoryApi.get('/products', { page_size: 100, status: 'active' }).then(({ data }) => setProducts(data.items || [])).catch(() => {});
  }, []);

  const create = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await inventoryApi.post('/purchase-orders', {
        supplier_id: supplierId,
        warehouse_id: warehouseId,
        expected_date: expected || null,
        lines: lines.filter((line) => line.stock_item_id).map((line) => ({
          stock_item_id: line.stock_item_id,
          quantity: Number(line.quantity),
          unit_cost: Number(line.unit_cost || 0),
          discount_percent: Number(line.discount_percent || 0),
          tax_percent: Number(line.tax_percent || 0),
        })),
      });
      toast.success(`${data.number} created as a draft. Stock is unchanged until goods are received.`);
      navigate(`/stock-management/purchases/${data.id}`);
    } catch (err) {
      toast.error(apiError(err, 'Failed to create the purchase order'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <Card className="p-4 xl:col-span-2 space-y-3">
        <div className="flex justify-between gap-3">
          <h2 className="font-semibold">Purchase orders</h2>
          <select className={inputClass + ' max-w-[220px]'} value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} aria-label="Status">
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="pending_approval">Pending approval</option>
            <option value="approved">Approved</option>
            <option value="partially_received">Partially received</option>
            <option value="received">Received</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        {loading ? <Spinner /> : rows.length === 0 ? <EmptyState title="No purchase orders" detail="Creating an order does not increase stock." /> : (
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr><th className="py-2">Number</th><th className="py-2">Supplier</th><th className="py-2">Status</th><th className="py-2 text-right">Total</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="py-2"><Link className="text-primary hover:underline" to={`/stock-management/purchases/${row.id}`}>{row.number}</Link></td>
                  <td className="py-2">{row.supplier_name}</td>
                  <td className="py-2"><StatusPill status={row.status} /></td>
                  <td className="py-2 text-right tabular-nums">{formatMoney(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pager page={page} pageSize={20} total={total} onPage={setPage} />
      </Card>
      <Card className="p-4">
        <h2 className="font-semibold mb-1">New purchase order</h2>
        <p className="text-xs text-muted-foreground mb-3">Approval does not add physical stock. Receive the goods to increase on-hand quantity.</p>
        <form onSubmit={create} className="space-y-3">
          <label className="space-y-2 block"><span className={labelClass}>Supplier *</span>
            <select className={inputClass} value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
              <option value="">Select</option>
              {suppliers.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </label>
          <label className="space-y-2 block"><span className={labelClass}>Receive into *</span>
            <select className={inputClass} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
              <option value="">Select</option>
              {warehouses.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </label>
          <label className="space-y-2 block"><span className={labelClass}>Expected date</span>
            <input type="date" className={inputClass} value={expected} onChange={(e) => setExpected(e.target.value)} />
          </label>
          {lines.map((line, index) => (
            <div key={index} className="grid grid-cols-2 gap-2">
              <select className={`${inputClass} col-span-2`} value={line.stock_item_id} onChange={(e) => setLines(lines.map((item, i) => i === index ? { ...item, stock_item_id: e.target.value } : item))}>
                <option value="">Product</option>
                {products.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
              <input aria-label="Qty" type="number" min="0" step="any" className={inputClass} placeholder="Qty" value={line.quantity} onChange={(e) => setLines(lines.map((item, i) => i === index ? { ...item, quantity: e.target.value } : item))} />
              <input aria-label="Cost" type="number" min="0" step="any" className={inputClass} placeholder="Cost" value={line.unit_cost} onChange={(e) => setLines(lines.map((item, i) => i === index ? { ...item, unit_cost: e.target.value } : item))} />
            </div>
          ))}
          <button type="button" className="text-sm text-primary" onClick={() => setLines([...lines, blankLine()])}>Add line</button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create draft'}</Button>
        </form>
      </Card>
    </div>
  );
}
