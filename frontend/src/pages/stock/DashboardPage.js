import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminUser } from '@/lib/permissions';
import { apiError, daysAgoISO, formatMoney, formatQty, inputClass, inventoryApi, todayISO } from './shared';

const KPI = [
  ['active_products', 'Active products'],
  ['units_on_hand', 'Units on hand', formatQty],
  ['cost_value', 'Cost value', formatMoney],
  ['selling_value', 'Selling value', formatMoney],
  ['low_stock', 'Low stock'],
  ['out_of_stock', 'Out of stock'],
  ['pending_purchase_orders', 'Open purchase orders'],
  ['stock_out_quantity', 'Units posted out', formatQty],
];

export default function DashboardPage() {
  const { user } = useAuth();
  const [from, setFrom] = useState(daysAgoISO(29));
  const [to, setTo] = useState(todayISO());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [allowNegative, setAllowNegative] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [dash, settings] = await Promise.all([
        inventoryApi.get('/dashboard', { date_from: from, date_to: to }),
        inventoryApi.get('/settings'),
      ]);
      setData(dash.data);
      setAllowNegative(Boolean(settings.data?.allow_negative));
    } catch (err) {
      toast.error(apiError(err, 'Failed to load inventory dashboard'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [from, to]);

  const saveNegative = async (value) => {
    try {
      await inventoryApi.put('/settings', { allow_negative: value });
      setAllowNegative(value);
      toast.success(value ? 'Negative stock is allowed' : 'Negative stock is blocked');
    } catch (err) {
      toast.error(apiError(err, 'Could not update the setting'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-end gap-3 justify-between">
        <div className="flex flex-wrap gap-2">
          <Link to="/stock-management/products"><Button>Add product</Button></Link>
          <Link to="/stock-management/purchases"><Button variant="outline">Record a purchase</Button></Link>
          <Link to="/stock-management/adjustments"><Button variant="outline">Adjust stock</Button></Link>
          <Link to="/stock-management/transfers"><Button variant="outline">Transfer stock</Button></Link>
        </div>
        <div className="flex gap-2">
          <input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
        </div>
      </div>
      {loading || !data ? (
        <div role="status" aria-label="Loading" className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      ) : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            {KPI.map(([key, label, fmt]) => (
              <Card key={key} className="p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
                <p className="text-2xl font-semibold tabular-nums mt-1">{fmt ? fmt(data.kpis[key]) : data.kpis[key]}</p>
              </Card>
            ))}
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <Card className="p-4 xl:col-span-2">
              <h2 className="font-semibold mb-1">Stock movement</h2>
              <p className="text-xs text-muted-foreground mb-3">{data.definitions.stock_out_quantity}</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.movement_trend}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="in_qty" name="In" fill="#059669" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="out_qty" name="Out" fill="#d97706" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card className="p-4">
              <h2 className="font-semibold mb-1">Cost value by group</h2>
              <p className="text-xs text-muted-foreground mb-3">{data.definitions.cost_value}</p>
              <ul className="space-y-2 text-sm">
                {data.category_value.length === 0 ? <li className="text-muted-foreground">No stock value yet.</li> : data.category_value.map((row) => (
                  <li key={row.category} className="flex justify-between gap-3">
                    <span>{row.category}</span>
                    <span className="tabular-nums font-medium">{formatMoney(row.cost_value)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-4">
              <h2 className="font-semibold mb-3">Recent movements</h2>
              <MovementList rows={data.recent_movements} />
            </Card>
            <Card className="p-4">
              <h2 className="font-semibold mb-3">Low stock</h2>
              <p className="text-xs text-muted-foreground mb-3">{data.definitions.low_stock}</p>
              {data.low_stock.length === 0 ? <p className="text-sm text-muted-foreground">No low-stock products.</p> : (
                <ul className="space-y-2 text-sm">
                  {data.low_stock.map((row) => (
                    <li key={row.id} className="flex justify-between gap-3">
                      <Link className="text-primary hover:underline" to={`/stock-management/products/${row.id}`}>{row.name}</Link>
                      <span className="tabular-nums">{formatQty(row.quantity)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
          {isAdminUser(user) && (
            <Card className="p-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold">Negative stock</h2>
                <p className="text-sm text-muted-foreground">Off by default. Only an administrator can allow on-hand quantity to go below available stock.</p>
              </div>
              <Button variant={allowNegative ? 'destructive' : 'outline'} onClick={() => saveNegative(!allowNegative)}>
                {allowNegative ? 'Disable negative stock' : 'Allow negative stock'}
              </Button>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function MovementList({ rows }) {
  if (!rows?.length) return <p className="text-sm text-muted-foreground">No movements in this period.</p>;
  return (
    <ul className="space-y-2 text-sm">
      {rows.map((row) => (
        <li key={row.id} className="flex justify-between gap-3 border-b border-border pb-2">
          <div>
            <div className="font-medium">{row.product_name}</div>
            <div className="text-xs text-muted-foreground">{row.movement_label} · {row.warehouse_name}</div>
          </div>
          <span className={`tabular-nums font-medium ${Number(row.qty_change) < 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
            {Number(row.qty_change) > 0 ? '+' : ''}{formatQty(row.qty_change)}
          </span>
        </li>
      ))}
    </ul>
  );
}
