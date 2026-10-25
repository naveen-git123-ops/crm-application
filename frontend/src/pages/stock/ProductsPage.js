import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  EmptyState, Field, Pager, Spinner, StatusPill, UNITS, apiError, formatMoney, formatQty, inputClass, inventoryApi,
} from './shared';

const emptyForm = () => ({
  name: '', sku: '', barcode: '', alias: '', item_code: '', stock_group: '', unit: 'Nos', hsn_code: '',
  warehouse_id: '', opening_qty: '0', opening_cost: '0', selling_price: '0', tax_percent: '0',
  reorder_level: '', min_stock: '', reorder_qty: '', preferred_supplier_id: '', notes: '',
});

export default function ProductsPage() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [groups, setGroups] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [status, setStatus] = useState('active');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await inventoryApi.get('/products', {
        q: q || undefined, stock_group: group || undefined, warehouse_id: warehouseId || undefined,
        status, page, page_size: 25,
      });
      setRows(data.items || []);
      setTotal(data.total || 0);
      setGroups(data.stock_groups || []);
    } catch (err) {
      toast.error(apiError(err, 'Failed to load products'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    inventoryApi.get('/warehouses').then(({ data }) => setWarehouses(data || [])).catch(() => {});
    inventoryApi.get('/suppliers', { page_size: 100, status: 'active' }).then(({ data }) => setSuppliers(data.items || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [q, group, warehouseId, status, page]);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Item name is required');
      return;
    }
    setSaving(true);
    try {
      await inventoryApi.post('/products', {
        ...form,
        name: form.name.trim(),
        opening_qty: Number(form.opening_qty || 0),
        quantity: Number(form.opening_qty || 0),
        opening_cost: Number(form.opening_cost || 0),
        selling_price: Number(form.selling_price || 0),
        tax_percent: Number(form.tax_percent || 0),
        reorder_level: form.reorder_level === '' ? null : Number(form.reorder_level),
        min_stock: form.min_stock === '' ? null : Number(form.min_stock),
        reorder_qty: form.reorder_qty === '' ? null : Number(form.reorder_qty),
        preferred_supplier_id: form.preferred_supplier_id || null,
        warehouse_id: form.warehouse_id || null,
      });
      toast.success('Product added');
      setOpen(false);
      setForm(emptyForm());
      setPage(1);
      load();
    } catch (err) {
      toast.error(apiError(err, 'Failed to add product'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>Add product</Button>
      </div>
      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input className={inputClass} value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} placeholder="Search name, SKU, barcode" aria-label="Search products" />
          <select className={inputClass} value={group} onChange={(e) => { setPage(1); setGroup(e.target.value); }} aria-label="Stock group">
            <option value="">All groups</option>
            {groups.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className={inputClass} value={warehouseId} onChange={(e) => { setPage(1); setWarehouseId(e.target.value); }} aria-label="Warehouse">
            <option value="">All warehouses</option>
            {warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select className={inputClass} value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} aria-label="Status">
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="all">All</option>
          </select>
        </div>
        {loading ? <Spinner /> : rows.length === 0 ? <EmptyState title="No products yet" detail="Add a product to start the stock ledger." /> : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-3">Product</th>
                  <th className="px-3 py-3">Group</th>
                  <th className="px-3 py-3">Warehouse</th>
                  <th className="px-3 py-3 text-right">On hand</th>
                  <th className="px-3 py-3 text-right">Avg cost</th>
                  <th className="px-3 py-3 text-right">Cost value</th>
                  <th className="px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border hover:bg-slate-50/70">
                    <td className="px-3 py-3">
                      <Link className="font-medium text-primary hover:underline" to={`/stock-management/products/${row.id}`}>{row.name}</Link>
                      <div className="text-xs text-muted-foreground">{[row.sku, row.item_code].filter(Boolean).join(' · ') || '—'}</div>
                    </td>
                    <td className="px-3 py-3">{row.stock_group || '—'}</td>
                    <td className="px-3 py-3">{row.godown || '—'}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatQty(row.quantity)} {row.unit}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatMoney(row.rate)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatMoney(row.value)}</td>
                    <td className="px-3 py-3"><StatusPill status={row.stock_status} label={row.stock_status === 'ok' ? 'In stock' : row.stock_status === 'low' ? 'Low' : 'Out'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} pageSize={25} total={total} onPage={setPage} />
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl p-0 max-h-[90vh] overflow-y-auto">
          <div className="border-b border-border px-6 py-5">
            <DialogHeader>
              <DialogTitle>Add product</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground mt-1">Opening quantity is posted once. Later changes go through an adjustment or a receipt.</p>
          </div>
          <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-6">
            <Field label="Name *" className="sm:col-span-2"><input className={inputClass} value={form.name} onChange={(e) => set('name', e.target.value)} required /></Field>
            <Field label="SKU"><input className={inputClass} value={form.sku} onChange={(e) => set('sku', e.target.value)} /></Field>
            <Field label="Barcode"><input className={inputClass} value={form.barcode} onChange={(e) => set('barcode', e.target.value)} /></Field>
            <Field label="Alias"><input className={inputClass} value={form.alias} onChange={(e) => set('alias', e.target.value)} /></Field>
            <Field label="Item code"><input className={inputClass} value={form.item_code} onChange={(e) => set('item_code', e.target.value)} /></Field>
            <Field label="Stock group"><input className={inputClass} value={form.stock_group} onChange={(e) => set('stock_group', e.target.value)} /></Field>
            <Field label="Unit"><select className={inputClass} value={form.unit} onChange={(e) => set('unit', e.target.value)}>{UNITS.map((unit) => <option key={unit}>{unit}</option>)}</select></Field>
            <Field label="HSN"><input className={inputClass} value={form.hsn_code} onChange={(e) => set('hsn_code', e.target.value)} /></Field>
            <Field label="Opening warehouse">
              <select className={inputClass} value={form.warehouse_id} onChange={(e) => set('warehouse_id', e.target.value)}>
                <option value="">Default warehouse</option>
                {warehouses.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </Field>
            <Field label="Opening quantity"><input type="number" step="any" min="0" className={inputClass} value={form.opening_qty} onChange={(e) => set('opening_qty', e.target.value)} /></Field>
            <Field label="Opening cost"><input type="number" step="any" min="0" className={inputClass} value={form.opening_cost} onChange={(e) => set('opening_cost', e.target.value)} /></Field>
            <Field label="Selling price"><input type="number" step="any" min="0" className={inputClass} value={form.selling_price} onChange={(e) => set('selling_price', e.target.value)} /></Field>
            <Field label="Tax %"><input type="number" step="any" min="0" className={inputClass} value={form.tax_percent} onChange={(e) => set('tax_percent', e.target.value)} /></Field>
            <Field label="Minimum stock"><input type="number" step="any" min="0" className={inputClass} value={form.min_stock} onChange={(e) => set('min_stock', e.target.value)} /></Field>
            <Field label="Reorder level"><input type="number" step="any" min="0" className={inputClass} value={form.reorder_level} onChange={(e) => set('reorder_level', e.target.value)} /></Field>
            <Field label="Reorder quantity"><input type="number" step="any" min="0" className={inputClass} value={form.reorder_qty} onChange={(e) => set('reorder_qty', e.target.value)} /></Field>
            <Field label="Preferred supplier">
              <select className={inputClass} value={form.preferred_supplier_id} onChange={(e) => set('preferred_supplier_id', e.target.value)}>
                <option value="">None</option>
                {suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </Field>
            <Field label="Notes" className="sm:col-span-2"><textarea className={`${inputClass} h-20`} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add product'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
