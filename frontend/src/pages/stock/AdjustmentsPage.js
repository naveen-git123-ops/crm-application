import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { apiError, inputClass, inventoryApi, labelClass, newKey } from './shared';

export default function AdjustmentsPage() {
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [saving, setSaving] = useState(false);
  const [key, setKey] = useState(newKey());
  const [form, setForm] = useState({
    stock_item_id: '', warehouse_id: '', direction: 'decrease', quantity: '', unit_cost: '', reason: '', notes: '',
  });

  useEffect(() => {
    inventoryApi.get('/products', { page_size: 100, status: 'active' }).then(({ data }) => setProducts(data.items || [])).catch(() => {});
    inventoryApi.get('/warehouses').then(({ data }) => setWarehouses((data || []).filter((row) => row.is_active))).catch(() => {});
  }, []);

  const set = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.reason.trim()) {
      toast.error('A reason is required');
      return;
    }
    setSaving(true);
    try {
      const { data } = await inventoryApi.post('/adjustments', {
        ...form,
        quantity: Number(form.quantity),
        unit_cost: form.direction === 'increase' && form.unit_cost !== '' ? Number(form.unit_cost) : null,
        idempotency_key: key,
      });
      toast.success(`Adjustment ${data.number} posted`);
      setKey(newKey());
      setForm({ ...form, quantity: '', unit_cost: '', reason: '', notes: '' });
    } catch (err) {
      toast.error(apiError(err, 'Failed to post the adjustment'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4 max-w-2xl">
      <h2 className="font-semibold">Stock adjustment</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-4">Quantity cannot be typed onto the product. This form posts an increase or decrease with a reason.</p>
      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="space-y-2"><span className={labelClass}>Product *</span>
          <select className={inputClass} value={form.stock_item_id} onChange={(e) => set('stock_item_id', e.target.value)} required>
            <option value="">Select</option>
            {products.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </label>
        <label className="space-y-2"><span className={labelClass}>Warehouse *</span>
          <select className={inputClass} value={form.warehouse_id} onChange={(e) => set('warehouse_id', e.target.value)} required>
            <option value="">Select</option>
            {warehouses.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </label>
        <label className="space-y-2"><span className={labelClass}>Direction *</span>
          <select className={inputClass} value={form.direction} onChange={(e) => set('direction', e.target.value)}>
            <option value="increase">Increase</option>
            <option value="decrease">Decrease</option>
          </select>
        </label>
        <label className="space-y-2"><span className={labelClass}>Quantity *</span>
          <input type="number" min="0" step="any" className={inputClass} value={form.quantity} onChange={(e) => set('quantity', e.target.value)} required />
        </label>
        {form.direction === 'increase' && (
          <label className="space-y-2"><span className={labelClass}>Unit cost</span>
            <input type="number" min="0" step="any" className={inputClass} value={form.unit_cost} onChange={(e) => set('unit_cost', e.target.value)} placeholder="Uses current average if blank" />
          </label>
        )}
        <label className="space-y-2 sm:col-span-2"><span className={labelClass}>Reason *</span>
          <textarea className={`${inputClass} h-20`} value={form.reason} onChange={(e) => set('reason', e.target.value)} required />
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={saving}>{saving ? 'Posting…' : 'Post adjustment'}</Button>
        </div>
      </form>
    </Card>
  );
}
