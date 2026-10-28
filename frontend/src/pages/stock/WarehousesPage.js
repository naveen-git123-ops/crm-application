import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { apiError, formatMoney, formatQty, inputClass, inventoryApi, labelClass } from './shared';

const empty = () => ({ name: '', address: '', contact_name: '', contact_phone: '', manager_name: '', notes: '', is_active: true });

export default function WarehousesPage() {
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [stock, setStock] = useState([]);
  const [form, setForm] = useState(empty());
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await inventoryApi.get('/warehouses');
    setRows(data || []);
  };

  useEffect(() => { load().catch((err) => toast.error(apiError(err, 'Failed to load warehouses'))); }, []);

  const openStock = async (row) => {
    setSelected(row);
    try {
      const { data } = await inventoryApi.get(`/warehouses/${row.id}/stock`);
      setStock(data.items || []);
    } catch (err) {
      toast.error(apiError(err, 'Failed to load warehouse stock'));
    }
  };

  const edit = (row) => {
    setEditing(row.id);
    setForm({
      name: row.name || '', address: row.address || '', contact_name: row.contact_name || '',
      contact_phone: row.contact_phone || '', manager_name: row.manager_name || '', notes: row.notes || '',
      is_active: row.is_active,
    });
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) await inventoryApi.put(`/warehouses/${editing}`, form);
      else await inventoryApi.post('/warehouses', form);
      toast.success(editing ? 'Warehouse updated' : 'Warehouse added');
      setEditing(null);
      setForm(empty());
      load();
    } catch (err) {
      toast.error(apiError(err, 'Failed to save warehouse'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <Card className="p-4 xl:col-span-2 space-y-3">
        <h2 className="font-semibold">Warehouses</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr><th className="py-2">Name</th><th className="py-2">Contact</th><th className="py-2">Status</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="py-2 font-medium">{row.name}</td>
                  <td className="py-2">{row.contact_name || row.contact_phone || '—'}</td>
                  <td className="py-2">{row.is_active ? 'Active' : 'Inactive'}</td>
                  <td className="py-2 text-right space-x-2">
                    <button type="button" className="text-primary text-sm" onClick={() => openStock(row)}>Stock</button>
                    <button type="button" className="text-sm" onClick={() => edit(row)}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selected && (
          <div>
            <h3 className="font-semibold mt-4 mb-2">{selected.name} stock</h3>
            {stock.length === 0 ? <p className="text-sm text-muted-foreground">No balances in this warehouse.</p> : (
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="py-2">Product</th><th className="py-2 text-right">On hand</th><th className="py-2 text-right">Available</th><th className="py-2 text-right">Value</th></tr></thead>
                <tbody>
                  {stock.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="py-2">{row.product_name}</td>
                      <td className="py-2 text-right tabular-nums">{formatQty(row.on_hand)}</td>
                      <td className="py-2 text-right tabular-nums">{formatQty(row.available)}</td>
                      <td className="py-2 text-right tabular-nums">{formatMoney(row.cost_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Card>
      <Card className="p-4">
        <h2 className="font-semibold mb-3">{editing ? 'Edit warehouse' : 'Add warehouse'}</h2>
        <form onSubmit={save} className="space-y-3">
          <label className="space-y-2 block"><span className={labelClass}>Name *</span><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label className="space-y-2 block"><span className={labelClass}>Address</span><input className={inputClass} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
          <label className="space-y-2 block"><span className={labelClass}>Contact</span><input className={inputClass} value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></label>
          <label className="space-y-2 block"><span className={labelClass}>Phone</span><input className={inputClass} value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} /></label>
          <label className="space-y-2 block"><span className={labelClass}>Manager</span><input className={inputClass} value={form.manager_name} onChange={(e) => setForm({ ...form, manager_name: e.target.value })} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Active</label>
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            {editing && <Button type="button" variant="outline" onClick={() => { setEditing(null); setForm(empty()); }}>Cancel</Button>}
          </div>
        </form>
      </Card>
    </div>
  );
}
