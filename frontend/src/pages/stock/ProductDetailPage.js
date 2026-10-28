import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { apiError, formatMoney, formatQty, inputClass, inventoryApi, labelClass, UNITS } from './shared';

export default function ProductDetailPage() {
  const { itemId } = useParams();
  const [data, setData] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);

  const load = async () => {
    const { data: payload } = await inventoryApi.get(`/products/${itemId}`);
    setData(payload);
    const product = payload.product;
    setForm({
      name: product.name || '',
      sku: product.sku || '',
      barcode: product.barcode || '',
      alias: product.alias || '',
      item_code: product.item_code || '',
      stock_group: product.stock_group || '',
      unit: product.unit || 'Nos',
      hsn_code: product.hsn_code || '',
      selling_price: product.selling_price ?? 0,
      tax_percent: product.tax_percent ?? 0,
      reorder_level: product.reorder_level ?? '',
      min_stock: product.min_stock ?? '',
      reorder_qty: product.reorder_qty ?? '',
      preferred_supplier_id: product.preferred_supplier_id || '',
      notes: product.notes || '',
      status: product.status || 'active',
    });
  };

  useEffect(() => {
    load().catch((err) => toast.error(apiError(err, 'Failed to load product')));
    inventoryApi.get('/suppliers', { page_size: 100, status: 'all' }).then(({ data: payload }) => setSuppliers(payload.items || [])).catch(() => {});
  }, [itemId]);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await inventoryApi.put(`/products/${itemId}`, {
        ...form,
        reorder_level: form.reorder_level === '' ? null : Number(form.reorder_level),
        min_stock: form.min_stock === '' ? null : Number(form.min_stock),
        reorder_qty: form.reorder_qty === '' ? null : Number(form.reorder_qty),
        preferred_supplier_id: form.preferred_supplier_id || null,
        selling_price: Number(form.selling_price || 0),
        tax_percent: Number(form.tax_percent || 0),
      });
      toast.success('Product updated. On-hand quantity was not changed.');
      load();
    } catch (err) {
      toast.error(apiError(err, 'Failed to update product'));
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!window.confirm('Archive this product? Posted stock history stays on the ledger.')) return;
    try {
      const { data: result } = await inventoryApi.post(`/products/${itemId}/archive`);
      toast.success(result.message);
      load();
    } catch (err) {
      toast.error(apiError(err, 'Failed to archive product'));
    }
  };

  if (!data || !form) return <div role="status" aria-label="Loading" className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />;
  const product = data.product;

  return (
    <div className="space-y-4">
      <Link to="/stock-management/products" className="text-sm text-primary hover:underline">Back to products</Link>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">On hand</p><p className="text-2xl font-semibold tabular-nums">{formatQty(product.quantity)}</p></Card>
        <Card className="p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Average cost</p><p className="text-2xl font-semibold tabular-nums">{formatMoney(product.rate)}</p></Card>
        <Card className="p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Cost value</p><p className="text-2xl font-semibold tabular-nums">{formatMoney(product.value)}</p></Card>
        <Card className="p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Opening qty</p><p className="text-2xl font-semibold tabular-nums">{formatQty(product.opening_qty)}</p></Card>
      </div>
      <Card className="p-4 overflow-x-auto">
        <h2 className="font-semibold mb-3">Stock by warehouse</h2>
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="py-2 pr-3">Warehouse</th>
              <th className="py-2 pr-3 text-right">On hand</th>
              <th className="py-2 pr-3 text-right">Reserved</th>
              <th className="py-2 pr-3 text-right">Incoming</th>
              <th className="py-2 pr-3 text-right">Available</th>
              <th className="py-2 text-right">Avg cost</th>
            </tr>
          </thead>
          <tbody>
            {data.balances.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="py-2 pr-3">{row.warehouse_name}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatQty(row.on_hand)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatQty(row.reserved)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatQty(row.incoming)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatQty(row.available)}</td>
                <td className="py-2 text-right tabular-nums">{formatMoney(row.avg_cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-muted-foreground mt-3">Available = on-hand − reserved − damaged. Incoming purchase quantity is not available.</p>
      </Card>
      <Card className="p-4">
        <h2 className="font-semibold mb-3">Product details</h2>
        <form onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="space-y-2"><span className={labelClass}>Name *</span><input className={inputClass} value={form.name} onChange={(e) => set('name', e.target.value)} required /></label>
          <label className="space-y-2"><span className={labelClass}>SKU</span><input className={inputClass} value={form.sku} onChange={(e) => set('sku', e.target.value)} /></label>
          <label className="space-y-2"><span className={labelClass}>Barcode</span><input className={inputClass} value={form.barcode} onChange={(e) => set('barcode', e.target.value)} /></label>
          <label className="space-y-2"><span className={labelClass}>Group</span><input className={inputClass} value={form.stock_group} onChange={(e) => set('stock_group', e.target.value)} /></label>
          <label className="space-y-2"><span className={labelClass}>Unit</span><select className={inputClass} value={form.unit} onChange={(e) => set('unit', e.target.value)}>{UNITS.map((unit) => <option key={unit}>{unit}</option>)}</select></label>
          <label className="space-y-2"><span className={labelClass}>Selling price</span><input type="number" step="any" className={inputClass} value={form.selling_price} onChange={(e) => set('selling_price', e.target.value)} /></label>
          <label className="space-y-2"><span className={labelClass}>Reorder level</span><input type="number" step="any" className={inputClass} value={form.reorder_level} onChange={(e) => set('reorder_level', e.target.value)} /></label>
          <label className="space-y-2"><span className={labelClass}>Reorder quantity</span><input type="number" step="any" className={inputClass} value={form.reorder_qty} onChange={(e) => set('reorder_qty', e.target.value)} /></label>
          <label className="space-y-2"><span className={labelClass}>Minimum stock</span><input type="number" step="any" className={inputClass} value={form.min_stock} onChange={(e) => set('min_stock', e.target.value)} /></label>
          <label className="space-y-2"><span className={labelClass}>Preferred supplier</span>
            <select className={inputClass} value={form.preferred_supplier_id} onChange={(e) => set('preferred_supplier_id', e.target.value)}>
              <option value="">None</option>
              {suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="space-y-2"><span className={labelClass}>Status</span>
            <select className={inputClass} value={form.status} onChange={(e) => set('status', e.target.value)}>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <label className="space-y-2 sm:col-span-2"><span className={labelClass}>Notes</span><textarea className={`${inputClass} h-20`} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></label>
          <div className="sm:col-span-2 flex justify-between gap-2">
            <Button type="button" variant="outline" onClick={archive}>Archive</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save details'}</Button>
          </div>
        </form>
      </Card>
      <Card className="p-4 overflow-x-auto">
        <h2 className="font-semibold mb-3">Ledger history</h2>
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="py-2 pr-3">When</th>
              <th className="py-2 pr-3">Type</th>
              <th className="py-2 pr-3">Warehouse</th>
              <th className="py-2 pr-3 text-right">Before</th>
              <th className="py-2 pr-3 text-right">Change</th>
              <th className="py-2 pr-3 text-right">After</th>
              <th className="py-2">User</th>
            </tr>
          </thead>
          <tbody>
            {data.movements.length === 0 ? <tr><td className="py-4 text-muted-foreground" colSpan={7}>No posted movements.</td></tr> : data.movements.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="py-2 pr-3 whitespace-nowrap">{row.posted_at?.replace('T', ' ')}</td>
                <td className="py-2 pr-3">{row.movement_label}</td>
                <td className="py-2 pr-3">{row.warehouse_name}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatQty(row.qty_before)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatQty(row.qty_change)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatQty(row.qty_after)}</td>
                <td className="py-2">{row.actor_name || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
