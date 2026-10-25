import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, Spinner, StatusPill, apiError, formatQty, inventoryApi } from './shared';

export default function AlertsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [definition, setDefinition] = useState('');
  const [status, setStatus] = useState('open');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await inventoryApi.get('/alerts', { status });
      setItems(data.items || []);
      setDefinition(data.definition || '');
    } catch (err) {
      toast.error(apiError(err, 'Failed to load alerts'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [status]);

  const mark = async (id, action) => {
    try {
      await inventoryApi.post(`/alerts/${id}/${action}`);
      load();
    } catch (err) {
      toast.error(apiError(err, 'Failed to update the alert'));
    }
  };

  const createPo = async (alert) => {
    const quantity = Number(alert.suggested_qty) > 0 ? Number(alert.suggested_qty) : 1;
    if (!alert.preferred_supplier_id) {
      toast.error('Set a preferred supplier on the product, then create the purchase order.');
      navigate(`/stock-management/products/${alert.stock_item_id}`);
      return;
    }
    try {
      const { data } = await inventoryApi.post('/purchase-orders', {
        supplier_id: alert.preferred_supplier_id,
        warehouse_id: alert.warehouse_id,
        lines: [{ stock_item_id: alert.stock_item_id, quantity, unit_cost: 0 }],
      });
      toast.success(`${data.number} draft created for ${formatQty(quantity)}. Stock is unchanged until the goods are received.`);
      navigate(`/stock-management/purchases/${data.id}`);
    } catch (err) {
      toast.error(apiError(err, 'Could not create the purchase order'));
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Stock alerts</h2>
          <p className="text-sm text-muted-foreground mt-1">{definition}</p>
        </div>
        <select className="h-11 rounded-lg border border-input px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Alert status">
          <option value="open">Open and read</option>
          <option value="resolved">Resolved</option>
          <option value="all">All</option>
        </select>
      </div>
      {loading ? <Spinner /> : items.length === 0 ? <EmptyState title="No alerts" detail="Low-stock and out-of-stock alerts appear when a balance crosses its level." /> : (
        <ul className="space-y-3">
          {items.map((alert) => (
            <li key={alert.id} className="border border-border rounded-lg p-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <StatusPill status={alert.severity} label={alert.severity} />
                  <StatusPill status={alert.status} />
                </div>
                <p className="mt-2 text-sm">{alert.message}</p>
                <p className="text-xs text-muted-foreground mt-1">Suggested reorder {formatQty(alert.suggested_qty)} · {alert.warehouse_name}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to={`/stock-management/products/${alert.stock_item_id}`}><Button variant="outline" size="sm">Product</Button></Link>
                <Button variant="outline" size="sm" onClick={() => createPo(alert)}>Create purchase</Button>
                {alert.status === 'open' && <Button variant="outline" size="sm" onClick={() => mark(alert.id, 'read')}>Mark read</Button>}
                {alert.status !== 'resolved' && <Button size="sm" onClick={() => mark(alert.id, 'resolve')}>Resolve</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
