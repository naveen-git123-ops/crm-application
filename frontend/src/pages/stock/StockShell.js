import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';

const LINKS = [
  { to: '/stock-management', label: 'Overview', end: true },
  { to: '/stock-management/products', label: 'Products' },
  { to: '/stock-management/warehouses', label: 'Warehouses' },
  { to: '/stock-management/movements', label: 'Ledger' },
  { to: '/stock-management/adjustments', label: 'Adjustments' },
  { to: '/stock-management/transfers', label: 'Transfers' },
  { to: '/stock-management/suppliers', label: 'Suppliers' },
  { to: '/stock-management/purchases', label: 'Purchases' },
  { to: '/stock-management/alerts', label: 'Alerts' },
  { to: '/stock-management/reports', label: 'Reports' },
];

export default function StockShell() {
  return (
    <div className="space-y-4 sm:space-y-6" data-testid="stock-management-page">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Operations</p>
        <h1 className="text-[1.35rem] sm:text-2xl font-semibold tracking-tight text-foreground">Stock Management</h1>
        <p className="text-muted-foreground text-sm mt-1">
          On-hand stock changes only through posted receipts, transfers, and adjustments.
        </p>
      </div>
      <nav className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1" aria-label="Stock management">
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) =>
              `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${
                isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              }`
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
