import React from 'react';
import axios from 'axios';
import { API_ENDPOINT } from '@/lib/apiConfig';
import { getApiErrorMessage } from '@/lib/apiErrors';

const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

export const inventoryApi = {
  get: (path, params) => axios.get(`${API_ENDPOINT}/inventory${path}`, { ...auth(), params }),
  post: (path, body) => axios.post(`${API_ENDPOINT}/inventory${path}`, body ?? {}, auth()),
  put: (path, body) => axios.put(`${API_ENDPOINT}/inventory${path}`, body ?? {}, auth()),
};

export function downloadReport(kind, params) {
  return axios.get(`${API_ENDPOINT}/inventory/reports/${kind}/export`, {
    ...auth(),
    params,
    responseType: 'blob',
  });
}

export function newKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function apiError(err, fallback) {
  return getApiErrorMessage(err, fallback);
}

export function formatQty(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return v.toLocaleString('en-IN', { maximumFractionDigits: 3 });
}

export function formatMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '₹0.00';
  return `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function daysAgoISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export const inputClass = 'h-11 w-full bg-card border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary/50';
export const labelClass = 'text-sm font-semibold text-foreground block';

export const UNITS = ['Nos', 'Kg', 'Ltr', 'Mtr', 'Set', 'Box', 'Pcs', 'Pair', 'Roll', 'Other'];

export const PO_STATUS = {
  draft: 'Draft',
  pending_approval: 'Pending approval',
  approved: 'Approved',
  partially_received: 'Partially received',
  received: 'Received',
  cancelled: 'Cancelled',
};

export const TRANSFER_STATUS = {
  draft: 'Draft',
  in_transit: 'In transit',
  received: 'Received',
  cancelled: 'Cancelled',
};

export function statusClass(status) {
  if (['ok', 'received', 'active'].includes(status)) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (['low', 'pending_approval', 'in_transit', 'partially_received', 'warning'].includes(status)) return 'bg-amber-50 text-amber-800 border-amber-200';
  if (['out', 'cancelled', 'critical'].includes(status)) return 'bg-red-50 text-red-700 border-red-200';
  if (['approved', 'read', 'info'].includes(status)) return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  return 'bg-muted text-foreground border-border';
}

export function StatusPill({ status, label }) {
  const text = label || PO_STATUS[status] || TRANSFER_STATUS[status] || status;
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${statusClass(status)}`}>
      {text}
    </span>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div role="status" aria-label="Loading" className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
    </div>
  );
}

export function EmptyState({ title, detail }) {
  return (
    <div className="text-center py-12 text-muted-foreground">
      <p className="font-medium text-foreground">{title}</p>
      {detail ? <p className="text-sm mt-1">{detail}</p> : null}
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil((total || 0) / pageSize));
  if (total <= pageSize) return null;
  return (
    <div className="flex items-center justify-between gap-3 pt-3 text-sm">
      <span className="text-muted-foreground">{total} records</span>
      <div className="flex items-center gap-2">
        <button type="button" className="h-9 px-3 rounded-lg border border-input disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <span className="tabular-nums">{page} / {pages}</span>
        <button type="button" className="h-9 px-3 rounded-lg border border-input disabled:opacity-40" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

export function Field({ label, children, className = '' }) {
  return (
    <label className={`space-y-2 block ${className}`}>
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}
