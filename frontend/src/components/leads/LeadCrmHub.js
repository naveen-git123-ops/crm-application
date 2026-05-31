import React, { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import {
  Search,
  SlidersHorizontal,
  Store,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';
import { formatLeadValue } from '@/lib/leadUtils';
import { workflowStageLabel } from '@/lib/carryOrderWorkflow';

function StatusBadge({ status, statusColors }) {
  const c = statusColors[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${c?.pill || 'bg-slate-50 text-slate-700 border-slate-200'}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c?.dot || 'bg-slate-400'}`} />
      {status}
    </span>
  );
}

function VendorChip({ lead, isCarryAndOrder, leadNeedsVendor }) {
  if (!isCarryAndOrder(lead)) return <span className="text-slate-400 text-xs">—</span>;
  if (lead.vendor_name) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium max-w-[140px] truncate" title={lead.vendor_name}>
        <Store className="h-3.5 w-3.5 shrink-0" />
        {lead.vendor_name}
      </span>
    );
  }
  if (leadNeedsVendor(lead)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
        <AlertCircle className="h-3 w-3 shrink-0" />
        Vendor pending
      </span>
    );
  }
  return <span className="text-slate-400 text-xs">—</span>;
}

function PendingSetupBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
      Setup pending
    </span>
  );
}

const selectClass =
  'h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100';

export function LeadCrmHub({
  filteredLeads,
  selectedLead,
  stats,
  searchQuery,
  onSearchChange,
  filterStatus,
  onSelectStatusFilter,
  filterSource,
  onFilterSource,
  filterAssigned,
  onFilterAssigned,
  sortBy,
  onSortBy,
  statuses,
  sources,
  assigneeOptions,
  statusColors,
  onSelectLead,
  onAssignVendor,
  isCarryAndOrder,
  leadNeedsVendor,
  getLeadInitials,
}) {
  const statusCounts = stats?.by_status || {};
  const totalForBar = Math.max(stats?.total || 1, 1);

  const sortedLeads = useMemo(() => {
    const list = [...filteredLeads];
    if (sortBy === 'company') {
      list.sort((a, b) => (a.company || '').localeCompare(b.company || ''));
    } else if (sortBy === 'value') {
      list.sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
    } else {
      list.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
    }
    return list;
  }, [filteredLeads, sortBy]);

  return (
    <div className="space-y-5">
      {/* Pipeline overview */}
      <section className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-5 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Pipeline overview</h2>
            <p className="text-xs text-slate-500 mt-0.5">Filter by stage — click any segment</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onSelectStatusFilter(filterStatus === '__pipeline__' ? '' : '__pipeline__')}
              className={`h-8 px-3 rounded-lg text-xs font-semibold transition-colors ${
                filterStatus === '__pipeline__'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-slate-700 border border-slate-200 hover:border-indigo-200'
              }`}
            >
              Open deals only
            </button>
            {filterStatus && (
              <button
                type="button"
                onClick={() => onSelectStatusFilter('')}
                className="h-8 px-3 rounded-lg text-xs font-medium text-slate-600 border border-slate-200 bg-white hover:bg-slate-50"
              >
                Reset filters
              </button>
            )}
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="flex h-2 rounded-full overflow-hidden bg-slate-100 mb-4">
            {statuses.map((status) => {
              const count = statusCounts[status] || 0;
              const pct = (count / totalForBar) * 100;
              if (pct <= 0) return null;
              return (
                <div
                  key={status}
                  className={`${statusColors[status]?.bar || 'bg-slate-400'} transition-all`}
                  style={{ width: `${pct}%` }}
                  title={`${status}: ${count}`}
                />
              );
            })}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {statuses.map((status) => {
              const count = statusCounts[status] || 0;
              const active = filterStatus === status;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => onSelectStatusFilter(active ? '' : status)}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-all ${
                    active
                      ? 'border-indigo-300 bg-indigo-50/80 shadow-sm ring-2 ring-indigo-100'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`h-2 w-2 rounded-full ${statusColors[status]?.dot || 'bg-slate-400'}`} />
                    <span className="text-[11px] font-semibold text-slate-700 truncate">{status}</span>
                  </div>
                  <p className="text-lg font-bold text-slate-900 tabular-nums leading-none">{count}</p>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Main workspace */}
      <section className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="px-4 py-3 border-b border-slate-100 flex flex-col lg:flex-row gap-3 lg:items-center bg-white">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search company, contact, email, vendor…"
              className="pl-9 h-9 border-slate-200 bg-slate-50/50 focus:bg-white rounded-lg text-sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-slate-400 hidden sm:block" />
            <select value={filterSource} onChange={(e) => onFilterSource(e.target.value)} className={selectClass}>
              <option value="">All sources</option>
              {sources.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select value={filterAssigned} onChange={(e) => onFilterAssigned(e.target.value)} className={selectClass}>
              <option value="">All owners</option>
              {assigneeOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select value={sortBy} onChange={(e) => onSortBy(e.target.value)} className={selectClass}>
              <option value="updated">Recent first</option>
              <option value="company">Company A–Z</option>
              <option value="value">Highest value</option>
            </select>
          </div>
        </div>

        <div className="flex flex-1 flex-col min-h-0">
          {/* Table */}
          <div className="flex flex-col min-h-0 w-full">
            <div className="px-4 py-2.5 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Lead registry
                <span className="ml-2 font-normal text-slate-500 normal-case">({sortedLeads.length})</span>
              </p>
            </div>
            <div className="overflow-auto max-h-[min(68vh,calc(100vh-16rem))]">
              {sortedLeads.length === 0 ? (
                <EmptyRegistry />
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left py-2.5 pl-4 pr-2 font-semibold text-slate-600 text-xs">Company</th>
                      <th className="text-left py-2.5 px-2 font-semibold text-slate-600 text-xs hidden md:table-cell">Contact</th>
                      <th className="text-left py-2.5 px-2 font-semibold text-slate-600 text-xs">Stage</th>
                      <th className="text-left py-2.5 px-2 font-semibold text-slate-600 text-xs hidden lg:table-cell">Vendor</th>
                      <th className="text-right py-2.5 px-2 font-semibold text-slate-600 text-xs">Value</th>
                      <th className="w-10 py-2.5 pr-3" aria-label="Open" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedLeads.map((lead) => {
                      const selected = selectedLead?.id === lead.id;
                      const pendingSetup = leadNeedsVendor(lead);
                      return (
                        <tr
                          key={lead.id}
                          onClick={() => onSelectLead(lead)}
                          className={`cursor-pointer transition-colors ${
                            selected
                              ? 'bg-indigo-50/90 hover:bg-indigo-50'
                              : pendingSetup
                                ? 'bg-amber-50/40 hover:bg-amber-50/70 border-l-4 border-l-amber-400'
                                : 'hover:bg-slate-50/80'
                          }`}
                        >
                          <td className="py-3 pl-4 pr-2">
                            <div className="flex items-center gap-3">
                              <div
                                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                                  selected ? 'bg-indigo-600 text-white' : pendingSetup ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {getLeadInitials(lead)}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-semibold text-slate-900 truncate">{lead.company || '—'}</p>
                                  {pendingSetup && <PendingSetupBadge />}
                                </div>
                                <p className="text-xs text-slate-500 capitalize truncate">{lead.sub_category || lead.source}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-2 hidden md:table-cell">
                            <p className="text-slate-800 truncate max-w-[140px]">{lead.contact_name || '—'}</p>
                            <p className="text-xs text-slate-500 truncate max-w-[140px]">{lead.email}</p>
                          </td>
                          <td className="py-3 px-2">
                            {workflowStageLabel(lead.workflow_stage) ? (
                              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold border bg-indigo-50 text-indigo-800 border-indigo-200">
                                {workflowStageLabel(lead.workflow_stage)}
                              </span>
                            ) : (
                              <StatusBadge status={lead.status} statusColors={statusColors} />
                            )}
                          </td>
                          <td className="py-3 px-2 hidden lg:table-cell">
                            <VendorChip lead={lead} isCarryAndOrder={isCarryAndOrder} leadNeedsVendor={leadNeedsVendor} />
                          </td>
                          <td className="py-3 px-2 text-right font-medium text-slate-800 tabular-nums">
                            {formatLeadValue(lead.value)}
                          </td>
                          <td className="py-3 pr-3 text-right">
                            <span
                              className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${
                                pendingSetup
                                  ? 'bg-amber-500 text-white shadow-sm'
                                  : selected
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-slate-100 text-slate-500'
                              }`}
                              title={pendingSetup ? 'Open workflow — vendor pending' : 'Open workflow'}
                            >
                              <ChevronRight className="h-4 w-4" />
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

        </div>

        {sortedLeads.length > 0 && (
          <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/60 text-center">
            <p className="text-xs text-slate-500">
              Click a row to open enquiry, costing, and next steps in a popup
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function EmptyRegistry() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
        <Search className="h-7 w-7 text-slate-400" />
      </div>
      <p className="text-sm font-semibold text-slate-800">No leads found</p>
      <p className="text-xs text-slate-500 mt-1 max-w-xs">Adjust your filters or create a new lead to get started.</p>
    </div>
  );
}
