import React from 'react';
import { Users, TrendingUp, IndianRupee, AlertTriangle } from 'lucide-react';

export function LeadKpiStrip({ stats, pipelineValue, carryOrderPendingVendor }) {
  const pipelineCount = Object.entries(stats?.by_status || {}).reduce(
    (n, [s, c]) => n + (['Won', 'Lost'].includes(s) ? 0 : c),
    0,
  );
  const wonCount = stats?.by_status?.Won || 0;

  const items = [
    {
      label: 'Total leads',
      value: stats?.total ?? 0,
      sub: `${wonCount} won`,
      icon: Users,
      iconBg: 'bg-slate-100',
      iconColor: 'text-slate-600',
    },
    {
      label: 'Active pipeline',
      value: pipelineCount,
      sub: 'Excl. won & lost',
      icon: TrendingUp,
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-600',
    },
    {
      label: 'Pipeline value',
      value: pipelineValue > 0 ? formatCompactINR(pipelineValue) : '—',
      sub: 'Open opportunities',
      icon: IndianRupee,
      iconBg: 'bg-indigo-50',
      iconColor: 'text-indigo-600',
    },
    {
      label: 'Vendor action',
      value: carryOrderPendingVendor,
      sub: 'Assign vendor to continue',
      icon: AlertTriangle,
      iconBg: carryOrderPendingVendor > 0 ? 'bg-amber-50' : 'bg-emerald-50',
      iconColor: carryOrderPendingVendor > 0 ? 'text-amber-600' : 'text-emerald-600',
      highlight: carryOrderPendingVendor > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className={`relative overflow-hidden rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${
            item.highlight ? 'border-amber-200 ring-1 ring-amber-100' : 'border-slate-200/80'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {item.label}
              </p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
                {item.value}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{item.sub}</p>
            </div>
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${item.iconBg}`}>
              <item.icon className={`h-5 w-5 ${item.iconColor}`} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatCompactINR(n) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  return `₹${n.toLocaleString('en-IN')}`;
}
