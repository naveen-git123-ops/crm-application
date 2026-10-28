import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, Pager, Spinner, apiError, inputClass, inventoryApi, labelClass } from './shared';

const empty = () => ({ name: '', contact_person: '', email: '', phone: '', address: '', tax_id: '', payment_terms: '', notes: '', status: 'active' });

export default function SuppliersPage() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [form, setForm] = useState(empty());
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await inventoryApi.get('/suppliers', { q: q || undefined, status: 'all', page, page_size: 20 });
      setRows(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      toast.error(apiError(err, 'Failed to load suppliers'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [q, page]);

  const open = async (row) => {
    try {
      const { data } = await inventoryApi.get(`/suppliers/${row.id}`);
      setDetail(data);
    } catch (err) {
      toast.error(apiError(err, 'Failed to load supplier'));
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) await inventoryApi.put(`/suppliers/${editing}`, form);
      else await inventoryApi.post('/suppliers', form);
      toast.success(editing ? 'Supplier updated' : 'Supplier added');
      setForm(empty());
      setEditing(null);
      load();
    } catch (err) {
      toast.error(apiError(err, 'Failed to save supplier'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <Card className="p-4 xl:col-span-2 space-y-3">
        <input className={inputClass} value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} placeholder="Search suppliers" aria-label="Search suppliers" />
        {loading ? <Spinner /> : rows.length === 0 ? <EmptyState title="No suppliers" /> : (
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="py-2">Name</th><th className="py-2">Phone</th><th className="py-2">Status</th><th /></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="py-2 font-medium">{row.name}</td>
                  <td className="py-2">{row.phone || '—'}</td>
                  <td className="py-2">{row.status}</td>
                  <td className="py-2 text-right space-x-2">
                    <button type="button" className="text-primary text-sm" onClick={() => open(row)}>View</button>
                    <button type="button" className="text-sm" onClick={() => { setEditing(row.id); setForm({ ...empty(), ...row }); }}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pager page={page} pageSize={20} total={total} onPage={setPage} />
        {detail && (
          <div className="border-t border-border pt-3 text-sm space-y-2">
            <h2 className="font-semibold">{detail.supplier.name}</h2>
            <p>{[detail.supplier.contact_person, detail.supplier.email, detail.supplier.tax_id].filter(Boolean).join(' · ') || 'No contact details'}</p>
            <p className="text-muted-foreground">{detail.supplier.payment_terms || 'No payment terms'}</p>
            <h3 className="font-medium pt-2">Recent purchase orders</h3>
            {detail.purchase_orders.length === 0 ? <p className="text-muted-foreground">None yet.</p> : detail.purchase_orders.map((row) => (
              <div key={row.id} className="flex justify-between"><span>{row.number}</span><span>{row.status}</span></div>
            ))}
          </div>
        )}
      </Card>
      <Card className="p-4">
        <h2 className="font-semibold mb-3">{editing ? 'Edit supplier' : 'Add supplier'}</h2>
        <form onSubmit={save} className="space-y-3">
          {['name', 'contact_person', 'email', 'phone', 'tax_id', 'payment_terms'].map((field) => (
            <label key={field} className="space-y-2 block">
              <span className={labelClass}>{field.replace('_', ' ')}{field === 'name' ? ' *' : ''}</span>
              <input className={inputClass} value={form[field] || ''} onChange={(e) => setForm({ ...form, [field]: e.target.value })} required={field === 'name'} />
            </label>
          ))}
          <label className="space-y-2 block"><span className={labelClass}>Address</span><textarea className={`${inputClass} h-20`} value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
          <label className="space-y-2 block"><span className={labelClass}>Status</span>
            <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            {editing && <Button type="button" variant="outline" onClick={() => { setEditing(null); setForm(empty()); }}>Cancel</Button>}
          </div>
        </form>
      </Card>
    </div>
  );
}
