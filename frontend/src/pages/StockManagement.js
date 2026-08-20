import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { API_ENDPOINT } from '@/lib/apiConfig';
import { getApiErrorMessage } from '@/lib/apiErrors';
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Package,
  Warehouse,
  AlertTriangle,
  IndianRupee,
} from 'lucide-react';

const authHeader = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
});

const UNIT_OPTIONS = ['Nos', 'Kg', 'Ltr', 'Mtr', 'Set', 'Box', 'Pcs', 'Pair', 'Roll', 'Other'];

const emptyForm = () => ({
  name: '',
  alias: '',
  item_code: '',
  stock_group: '',
  unit: 'Nos',
  hsn_code: '',
  godown: '',
  opening_qty: '0',
  quantity: '',
  rate: '0',
  reorder_level: '',
  notes: '',
});

const formatQty = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return v.toLocaleString('en-IN', { maximumFractionDigits: 3 });
};

const formatMoney = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '₹0';
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
};

export default function StockManagement() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [godownFilter, setGodownFilter] = useState('');
  const [filterOptions, setFilterOptions] = useState({ stock_groups: [], godowns: [] });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());

  const fetchFilters = async () => {
    try {
      const { data } = await axios.get(`${API_ENDPOINT}/stock-items/meta/filters`, authHeader());
      setFilterOptions({
        stock_groups: data?.stock_groups || [],
        godowns: data?.godowns || [],
      });
    } catch {
      setFilterOptions({ stock_groups: [], godowns: [] });
    }
  };

  const fetchItems = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_ENDPOINT}/stock-items`, {
        ...authHeader(),
        params: {
          q: search.trim() || undefined,
          stock_group: groupFilter || undefined,
          godown: godownFilter || undefined,
        },
      });
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to load stock items'));
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFilters();
  }, []);

  useEffect(() => {
    const t = setTimeout(fetchItems, 250);
    return () => clearTimeout(t);
  }, [search, groupFilter, godownFilter]);

  const summary = useMemo(() => {
    const totalItems = items.length;
    const totalQty = items.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    const totalValue = items.reduce((s, r) => s + (Number(r.value) || 0), 0);
    const lowStock = items.filter((r) => {
      const reorder = r.reorder_level;
      if (reorder == null || reorder === '') return false;
      return Number(r.quantity) <= Number(reorder);
    }).length;
    return { totalItems, totalQty, totalValue, lowStock };
  }, [items]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      name: row.name || '',
      alias: row.alias || '',
      item_code: row.item_code || '',
      stock_group: row.stock_group || '',
      unit: row.unit || 'Nos',
      hsn_code: row.hsn_code || '',
      godown: row.godown || '',
      opening_qty: String(row.opening_qty ?? 0),
      quantity: String(row.quantity ?? 0),
      rate: String(row.rate ?? 0),
      reorder_level: row.reorder_level == null ? '' : String(row.reorder_level),
      notes: row.notes || '',
    });
    setDialogOpen(true);
  };

  const onChange = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const computedValue = useMemo(() => {
    const qty = form.quantity !== '' ? Number(form.quantity) : Number(form.opening_qty || 0);
    const rate = Number(form.rate || 0);
    if (!Number.isFinite(qty) || !Number.isFinite(rate)) return 0;
    return qty * rate;
  }, [form.quantity, form.opening_qty, form.rate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Item name is required');
      return;
    }
    const opening = Number(form.opening_qty || 0);
    const rate = Number(form.rate || 0);
    const payload = {
      name: form.name.trim(),
      alias: form.alias.trim() || null,
      item_code: form.item_code.trim() || null,
      stock_group: form.stock_group.trim() || null,
      unit: form.unit || 'Nos',
      hsn_code: form.hsn_code.trim() || null,
      godown: form.godown.trim() || null,
      opening_qty: Number.isFinite(opening) ? opening : 0,
      rate: Number.isFinite(rate) ? rate : 0,
      reorder_level: form.reorder_level === '' ? null : Number(form.reorder_level),
      notes: form.notes.trim() || null,
    };
    if (form.quantity !== '') {
      const qty = Number(form.quantity);
      payload.quantity = Number.isFinite(qty) ? qty : 0;
    } else if (!editing) {
      payload.quantity = payload.opening_qty;
    }

    setSaving(true);
    try {
      if (editing) {
        await axios.put(`${API_ENDPOINT}/stock-items/${editing.id}`, payload, authHeader());
        toast.success('Stock item updated');
      } else {
        await axios.post(`${API_ENDPOINT}/stock-items`, payload, authHeader());
        toast.success('Stock item added');
      }
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm());
      await Promise.all([fetchItems(), fetchFilters()]);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to save stock item'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete stock item "${row.name}"?`)) return;
    try {
      await axios.delete(`${API_ENDPOINT}/stock-items/${row.id}`, authHeader());
      toast.success('Stock item deleted');
      await Promise.all([fetchItems(), fetchFilters()]);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to delete stock item'));
    }
  };

  const inputClass =
    'h-11 bg-card border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary/50';
  const labelClass = 'text-sm font-semibold text-foreground block';

  return (
    <div className="space-y-4 sm:space-y-6" data-testid="stock-management-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-[1.35rem] sm:text-2xl font-semibold tracking-tight text-foreground">
            Stock Management
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Maintain stock items here (name, group, godown, qty, rate) — same details you track in Tally.
          </p>
        </div>
        <Button
          className="min-h-[44px]"
          onClick={openCreate}
          data-testid="add-stock-item"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add stock item
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.08em]">
            <Package className="h-4 w-4" /> Items
          </div>
          <p className="text-2xl font-semibold tabular-nums text-foreground mt-1">{summary.totalItems}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.08em]">
            <Warehouse className="h-4 w-4" /> Total qty
          </div>
          <p className="text-2xl font-semibold tabular-nums text-foreground mt-1">{formatQty(summary.totalQty)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.08em]">
            <IndianRupee className="h-4 w-4" /> Stock value
          </div>
          <p className="text-2xl font-semibold tabular-nums text-foreground mt-1">{formatMoney(summary.totalValue)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.08em]">
            <AlertTriangle className="h-4 w-4" /> Low stock
          </div>
          <p className="text-2xl font-semibold tabular-nums text-foreground mt-1">{summary.lowStock}</p>
        </Card>
      </div>

      <Card className="p-4 sm:p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, code, HSN…"
              className={`${inputClass} pl-9`}
            />
          </div>
          <select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            className={inputClass}
          >
            <option value="">All stock groups</option>
            {filterOptions.stock_groups.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
          <select
            value={godownFilter}
            onChange={(e) => setGodownFilter(e.target.value)}
            className={inputClass}
          >
            <option value="">All godowns</option>
            {filterOptions.godowns.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Package className="h-12 w-12 mx-auto mb-2 opacity-40" />
            <p>No stock items yet.</p>
            <p className="text-sm mt-1">Add items to start managing inventory here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-3 font-semibold">Particulars</th>
                  <th className="px-3 py-3 font-semibold">Group</th>
                  <th className="px-3 py-3 font-semibold">Godown</th>
                  <th className="px-3 py-3 font-semibold">Unit</th>
                  <th className="px-3 py-3 font-semibold text-right">Qty</th>
                  <th className="px-3 py-3 font-semibold text-right">Rate</th>
                  <th className="px-3 py-3 font-semibold text-right">Value</th>
                  <th className="px-3 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const low =
                    row.reorder_level != null
                    && row.reorder_level !== ''
                    && Number(row.quantity) <= Number(row.reorder_level);
                  return (
                    <tr key={row.id} className="border-t border-gray-100 hover:bg-slate-50/70">
                      <td className="px-3 py-3">
                        <div className="font-medium text-gray-900">{row.name}</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {[row.item_code, row.hsn_code ? `HSN ${row.hsn_code}` : null]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </div>
                        {low && (
                          <span className="inline-flex mt-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                            Low stock
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-gray-700">{row.stock_group || '—'}</td>
                      <td className="px-3 py-3 text-gray-700">{row.godown || '—'}</td>
                      <td className="px-3 py-3 text-gray-700">{row.unit || '—'}</td>
                      <td className="px-3 py-3 text-right font-medium text-gray-900">{formatQty(row.quantity)}</td>
                      <td className="px-3 py-3 text-right text-gray-700">{formatMoney(row.rate)}</td>
                      <td className="px-3 py-3 text-right font-medium text-gray-900">{formatMoney(row.value)}</td>
                      <td className="px-3 py-3 text-right">
                        <div className="inline-flex gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 px-2"
                            onClick={() => openEdit(row)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 px-2 text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => handleDelete(row)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-slate-50 font-semibold text-gray-900">
                  <td className="px-3 py-3" colSpan={4}>Closing total</td>
                  <td className="px-3 py-3 text-right">{formatQty(summary.totalQty)}</td>
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3 text-right">{formatMoney(summary.totalValue)}</td>
                  <td className="px-3 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl p-0 max-h-[90vh] overflow-y-auto">
          <div className="border-b border-border px-6 py-5">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold text-foreground">
                {editing ? 'Edit stock item' : 'Add stock item'}
              </DialogTitle>
              <p className="text-muted-foreground text-sm mt-1">
                Enter stock master details manually (as in Tally stock item).
              </p>
            </DialogHeader>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4 p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2">
                <Label className={labelClass}>Name (Particulars) *</Label>
                <Input
                  className={inputClass}
                  value={form.name}
                  onChange={(e) => onChange('name', e.target.value)}
                  placeholder="Stock item name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className={labelClass}>Alias</Label>
                <Input
                  className={inputClass}
                  value={form.alias}
                  onChange={(e) => onChange('alias', e.target.value)}
                  placeholder="Optional alias"
                />
              </div>
              <div className="space-y-2">
                <Label className={labelClass}>Item code</Label>
                <Input
                  className={inputClass}
                  value={form.item_code}
                  onChange={(e) => onChange('item_code', e.target.value)}
                  placeholder="Part / SKU code"
                />
              </div>
              <div className="space-y-2">
                <Label className={labelClass}>Under (Stock group)</Label>
                <Input
                  className={inputClass}
                  value={form.stock_group}
                  onChange={(e) => onChange('stock_group', e.target.value)}
                  placeholder="e.g. Raw Material, Finished Goods"
                  list="stock-group-suggestions"
                />
                <datalist id="stock-group-suggestions">
                  {filterOptions.stock_groups.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-2">
                <Label className={labelClass}>Unit *</Label>
                <select
                  className={inputClass}
                  value={form.unit}
                  onChange={(e) => onChange('unit', e.target.value)}
                >
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label className={labelClass}>HSN / SAC</Label>
                <Input
                  className={inputClass}
                  value={form.hsn_code}
                  onChange={(e) => onChange('hsn_code', e.target.value)}
                  placeholder="HSN code"
                />
              </div>
              <div className="space-y-2">
                <Label className={labelClass}>Godown / Location</Label>
                <Input
                  className={inputClass}
                  value={form.godown}
                  onChange={(e) => onChange('godown', e.target.value)}
                  placeholder="e.g. Main Store"
                  list="godown-suggestions"
                />
                <datalist id="godown-suggestions">
                  {filterOptions.godowns.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-2">
                <Label className={labelClass}>Opening qty</Label>
                <Input
                  type="number"
                  step="any"
                  className={inputClass}
                  value={form.opening_qty}
                  onChange={(e) => onChange('opening_qty', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className={labelClass}>
                  Current qty {editing ? '' : '(defaults to opening)'}
                </Label>
                <Input
                  type="number"
                  step="any"
                  className={inputClass}
                  value={form.quantity}
                  onChange={(e) => onChange('quantity', e.target.value)}
                  placeholder={editing ? undefined : 'Same as opening if blank'}
                />
              </div>
              <div className="space-y-2">
                <Label className={labelClass}>Rate</Label>
                <Input
                  type="number"
                  step="any"
                  className={inputClass}
                  value={form.rate}
                  onChange={(e) => onChange('rate', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className={labelClass}>Value (auto)</Label>
                <Input className={inputClass} value={formatMoney(computedValue)} readOnly />
              </div>
              <div className="space-y-2">
                <Label className={labelClass}>Reorder level</Label>
                <Input
                  type="number"
                  step="any"
                  className={inputClass}
                  value={form.reorder_level}
                  onChange={(e) => onChange('reorder_level', e.target.value)}
                  placeholder="Optional min qty"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label className={labelClass}>Notes</Label>
                <Textarea
                  rows={2}
                  className="resize-none bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.notes}
                  onChange={(e) => onChange('notes', e.target.value)}
                  placeholder="Optional notes"
                />
              </div>
            </div>
            <div className="flex gap-3 pt-2 justify-end border-t border-gray-200">
              <Button
                type="button"
                variant="outline"
                className="border-gray-300 text-gray-700"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Add item'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
