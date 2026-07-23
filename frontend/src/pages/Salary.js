import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { format, parse } from 'date-fns';
import {
  Wallet,
  Download,
  Printer,
  ChevronRight,
  Loader2,
  CheckCircle2,
  Banknote
} from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const money = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const parseMonthParts = (ym) => {
  const [y, m] = (ym || '').split('-').map((x) => parseInt(x, 10));
  return { year: y || new Date().getFullYear(), month: m || new Date().getMonth() + 1 };
};

const inSelectedMonth = (isoDate, year, month) => {
  if (!isoDate) return false;
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return false;
  return d.getFullYear() === year && d.getMonth() + 1 === month;
};

export const Salary = () => {
  const { user } = useAuth();
  const canAccess = ['Admin', 'Accountant'].includes(user?.role);

  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [attendanceById, setAttendanceById] = useState({});
  const [expenseById, setExpenseById] = useState({});
  const [vehicleClaims, setVehicleClaims] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [jobFilter, setJobFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  /** @type {Record<string, boolean>} key: `${employee_id}|${month}` */
  const [paidMap, setPaidMap] = useState({});
  const [claimsOpen, setClaimsOpen] = useState(null);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [claimsExpenses, setClaimsExpenses] = useState([]);
  const [claimsTab, setClaimsTab] = useState('expense');

  const { year, month: monthNum } = parseMonthParts(month);

  const load = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/salary/overview`, {
        params: { month },
        headers: authHeader()
      });

      const emps = Array.isArray(data?.employees) ? data.employees : [];
      setEmployees(emps);
      setAttendanceById(data?.attendance_by_employee || {});
      setExpenseById(data?.expense_by_employee || {});
      setVehicleClaims(Array.isArray(data?.vehicle_claims) ? data.vehicle_claims : []);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.detail || 'Failed to load salary data');
      setEmployees([]);
      setAttendanceById({});
      setExpenseById({});
      setVehicleClaims([]);
    } finally {
      setLoading(false);
    }
  }, [canAccess, month]);

  useEffect(() => {
    load();
  }, [load]);

  const vehicleByEmployee = useMemo(() => {
    const m = {};
    vehicleClaims.forEach((c) => {
      const id = c.employee_id;
      if (!id) return;
      if (!m[id]) m[id] = 0;
      m[id] += Number(c.approved_amount || 0);
    });
    return m;
  }, [vehicleClaims]);

  const departments = useMemo(() => {
    const s = new Set();
    employees.forEach((e) => {
      if (e.department) s.add(e.department);
    });
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [employees]);

  const jobRoles = useMemo(() => {
    const s = new Set();
    employees.forEach((e) => {
      if (e.job_role) s.add(e.job_role);
    });
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [employees]);

  const rows = useMemo(() => {
    return employees.map((emp) => {
      const att = attendanceById[emp.employee_id] || {};
      const present = Number(att.present_days || 0);
      const absent = Number(att.absent_days || 0);
      const workingDays = Math.max(present + absent, 0);
      const salary = Number(emp.salary || 0);
      const perDay = workingDays > 0 ? salary / workingDays : 0;
      const unpaidDeduction = perDay * absent;
      const expenseApproved = Number(expenseById[emp.employee_id]?.total_approved || 0);
      const vehicleApproved = Number(vehicleByEmployee[emp.employee_id] || 0);
      const proRatedBase = Math.max(salary - unpaidDeduction, 0);
      const totalPayable = proRatedBase + expenseApproved + vehicleApproved;
      const paidKey = `${emp.employee_id}|${month}`;
      const paid = !!paidMap[paidKey];

      return {
        id: emp.id,
        employee_id: emp.employee_id,
        name: emp.name,
        department: emp.department || '—',
        job_role: emp.job_role || '—',
        salary,
        present_days: present,
        absent_days: absent,
        working_days: workingDays,
        late_days: Number(att.late_days || 0),
        half_day_days: Number(att.half_day_days || 0),
        expenseApproved,
        expensePending: Number(expenseById[emp.employee_id]?.total_pending || 0),
        vehicleApproved,
        unpaidDeduction,
        proRatedBase,
        totalPayable,
        paid,
        paidKey
      };
    });
  }, [employees, attendanceById, expenseById, vehicleByEmployee, paidMap, month]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (deptFilter && r.department !== deptFilter) return false;
      if (jobFilter && r.job_role !== jobFilter) return false;
      if (statusFilter === 'Pending' && r.paid) return false;
      if (statusFilter === 'Paid' && !r.paid) return false;
      return true;
    });
  }, [rows, deptFilter, jobFilter, statusFilter]);

  useEffect(() => {
    if (!filteredRows.length) return;
    const stillVisible = filteredRows.some((r) => r.employee_id === selectedEmployeeId);
    if (!selectedEmployeeId || !stillVisible) {
      setSelectedEmployeeId(filteredRows[0].employee_id);
    }
  }, [filteredRows, selectedEmployeeId]);

  const selectedRow = filteredRows.find((r) => r.employee_id === selectedEmployeeId) || filteredRows[0];

  const markPaid = (employeeId) => {
    const key = `${employeeId}|${month}`;
    setPaidMap((prev) => ({ ...prev, [key]: true }));
    toast.success('Marked as paid (local record). Update your bank ledger separately.');
  };

  const exportCsv = () => {
    const header = [
      'Employee ID',
      'Name',
      'Department',
      'Job role',
      'Base salary',
      'Working days',
      'Present days',
      'Absent days',
      'Expense approved',
      'Vehicle claims approved',
      'Unpaid / LOP deduction',
      'Total payable',
      'Payment recorded (local)'
    ];
    const lines = [header.join(',')];
    filteredRows.forEach((r) => {
      lines.push(
        [
          r.employee_id,
          `"${(r.name || '').replace(/"/g, '""')}"`,
          `"${(r.department || '').replace(/"/g, '""')}"`,
          `"${(r.job_role || '').replace(/"/g, '""')}"`,
          r.salary.toFixed(2),
          r.working_days,
          r.present_days,
          r.absent_days,
          r.expenseApproved.toFixed(2),
          r.vehicleApproved.toFixed(2),
          r.unpaidDeduction.toFixed(2),
          r.totalPayable.toFixed(2),
          r.paid ? 'Yes' : 'No'
        ].join(',')
      );
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `salary-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  };

  const openClaims = async (type, employeeId) => {
    setClaimsTab(type);
    setClaimsOpen(employeeId);
    setClaimsLoading(true);
    setClaimsExpenses([]);
    try {
      const res = await axios.get(`${API}/expenses`, {
        params: { employee_id: employeeId },
        headers: authHeader()
      });
      const list = (res.data || []).filter((e) => inSelectedMonth(e.created_at, year, monthNum));
      setClaimsExpenses(list);
    } catch {
      toast.error('Failed to load expense lines');
    } finally {
      setClaimsLoading(false);
    }
  };

  const printPayslip = async (row) => {
    if (!row?.id) {
      toast.error('Missing employee record id for payslip');
      return;
    }
    try {
      const response = await axios.get(`${API}/payroll/payslip/${row.id}?month=${month}`, {
        responseType: 'blob',
        headers: authHeader()
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `payslip_${row.employee_id}_${month}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Payslip downloaded');
    } catch {
      toast.error('Failed to generate payslip');
    }
  };

  if (!canAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  if (loading && !employees.length) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-slate-600">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span>Loading salary data…</span>
      </div>
    );
  }

  const monthLabel = (() => {
    try {
      return format(parse(month, 'yyyy-MM', new Date()), 'MMMM yyyy');
    } catch {
      return month;
    }
  })();

  return (
    <div className="space-y-6" data-testid="salary-page">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            <Wallet className="h-8 w-8 text-blue-600" />
            Calculate &amp; process salary
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            For <span className="font-medium text-gray-800">{monthLabel}</span> — based on attendance, approved
            expenses, and approved vehicle fuel claims.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <Button variant="outline" className="gap-2 border-gray-300" onClick={exportCsv} type="button">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <Card className="flex flex-wrap gap-3 border-0 bg-white p-4 shadow-sm ring-1 ring-slate-200/60">
        <select
          className="h-10 min-w-[160px] rounded-lg border border-gray-300 bg-white px-3 text-sm"
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          className="h-10 min-w-[160px] rounded-lg border border-gray-300 bg-white px-3 text-sm"
          value={jobFilter}
          onChange={(e) => setJobFilter(e.target.value)}
        >
          <option value="">All job roles</option>
          {jobRoles.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          className="h-10 min-w-[160px] rounded-lg border border-gray-300 bg-white px-3 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="All">All payroll statuses</option>
          <option value="Pending">Pending</option>
          <option value="Paid">Paid</option>
        </select>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_min(380px,100%)]">
        <Card className="overflow-hidden border-0 bg-white shadow-sm ring-1 ring-slate-200/60">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Base salary</th>
                  <th className="px-4 py-3">Present</th>
                  <th className="px-4 py-3">Expenses</th>
                  <th className="px-4 py-3">Vehicle</th>
                  <th className="px-4 py-3">LOP / unpaid</th>
                  <th className="px-4 py-3">Total payable</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((r) => {
                  const active = selectedEmployeeId === r.employee_id;
                  return (
                    <tr
                      key={r.employee_id}
                      className={`cursor-pointer transition-colors ${active ? 'bg-sky-50/80' : 'hover:bg-slate-50'}`}
                      onClick={() => setSelectedEmployeeId(r.employee_id)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{r.name}</div>
                        <div className="font-mono text-xs text-slate-500">{r.employee_id}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-800">{money(r.salary)}</td>
                      <td className="px-4 py-3 text-gray-800">
                        {r.working_days ? (
                          <span>
                            {r.present_days}/{r.working_days}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                        {r.late_days > 0 && (
                          <span className="ml-1 text-xs text-amber-700">({r.late_days} late)</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono">{money(r.expenseApproved)}</span>
                        <button
                          type="button"
                          className="ml-2 text-xs font-medium text-blue-600 hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            openClaims('expense', r.employee_id);
                          }}
                        >
                          View
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono">{money(r.vehicleApproved)}</span>
                        <button
                          type="button"
                          className="ml-2 text-xs font-medium text-blue-600 hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            openClaims('vehicle', r.employee_id);
                          }}
                        >
                          View
                        </button>
                      </td>
                      <td className="px-4 py-3 font-mono text-rose-700">−{money(r.unpaidDeduction)}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-emerald-800">{money(r.totalPayable)}</td>
                      <td className="px-4 py-3">
                        {r.paid ? (
                          <Badge className="border-0 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                            Paid
                          </Badge>
                        ) : (
                          <Badge className="border-0 bg-amber-100 text-amber-900 hover:bg-amber-100">
                            Pending
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {!r.paid && (
                            <Button
                              size="sm"
                              className="h-8 bg-blue-600 text-white hover:bg-blue-700"
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                markPaid(r.employee_id);
                              }}
                            >
                              Mark paid
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1 border-gray-300"
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              printPayslip(r);
                            }}
                          >
                            <Printer className="h-3.5 w-3.5" />
                            PDF
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!filteredRows.length && (
            <p className="px-4 py-8 text-center text-sm text-slate-500">No employees match the filters.</p>
          )}
        </Card>

        <Card className="border-0 bg-white p-5 shadow-sm ring-1 ring-slate-200/60">
          {!selectedRow ? (
            <p className="text-sm text-slate-500">Select an employee from the table.</p>
          ) : (
            <>
              <div className="mb-4 flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Detailed pay breakdown</h2>
                  <p className="text-sm text-slate-600">
                    {selectedRow.name}{' '}
                    <span className="font-mono text-xs text-slate-500">({selectedRow.employee_id})</span>
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 lg:hidden" />
              </div>

              <div className="space-y-4 text-sm">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Earnings</p>
                  <ul className="space-y-2 rounded-xl bg-slate-50/80 p-3 ring-1 ring-slate-100">
                    <li className="flex justify-between">
                      <span className="text-slate-600">Monthly gross (contract)</span>
                      <span className="font-mono font-medium">{money(selectedRow.salary)}</span>
                    </li>
                    <li className="flex justify-between">
                      <span className="text-slate-600">Pro-rated salary after attendance</span>
                      <span className="font-mono font-medium">{money(selectedRow.proRatedBase)}</span>
                    </li>
                    <li className="flex justify-between">
                      <span className="text-slate-600">Expense reimbursement (approved)</span>
                      <span className="font-mono font-medium text-emerald-800">
                        +{money(selectedRow.expenseApproved)}
                      </span>
                    </li>
                    <li className="flex justify-between">
                      <span className="text-slate-600">Vehicle / fuel claims (approved)</span>
                      <span className="font-mono font-medium text-emerald-800">
                        +{money(selectedRow.vehicleApproved)}
                      </span>
                    </li>
                  </ul>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Deductions</p>
                  <ul className="space-y-2 rounded-xl bg-rose-50/40 p-3 ring-1 ring-rose-100/80">
                    <li className="flex justify-between">
                      <span className="text-slate-600">
                        Unpaid working days ({selectedRow.absent_days} ×{' '}
                        {selectedRow.working_days
                          ? money(selectedRow.salary / selectedRow.working_days)
                          : money(0)}{' '}
                        / day)
                      </span>
                      <span className="font-mono font-medium text-rose-800">
                        −{money(selectedRow.unpaidDeduction)}
                      </span>
                    </li>
                    {selectedRow.expensePending > 0 && (
                      <li className="flex justify-between text-amber-900">
                        <span>Expenses not fully approved (informational)</span>
                        <span className="font-mono">{money(selectedRow.expensePending)}</span>
                      </li>
                    )}
                  </ul>
                </div>

                <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/90 to-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-800">Net salary payable</span>
                    <span className="text-xl font-bold tracking-tight text-blue-900">
                      {money(selectedRow.totalPayable)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">
                    Net = pro-rated salary after LOP + approved expenses + approved vehicle claims. Record bank
                    transfers in your accounting system; &quot;Mark paid&quot; here is only a local checklist.
                  </p>
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <Button
                    className="h-11 w-full gap-2 bg-blue-600 text-white hover:bg-blue-700"
                    type="button"
                    disabled={selectedRow.paid}
                    onClick={() => markPaid(selectedRow.employee_id)}
                  >
                    <Banknote className="h-4 w-4" />
                    Approve &amp; record payment
                  </Button>
                  <Button
                    variant="outline"
                    className="h-11 w-full gap-2 border-gray-300"
                    type="button"
                    onClick={() => printPayslip(selectedRow)}
                  >
                    <Printer className="h-4 w-4" />
                    Print / download payslip (PDF)
                  </Button>
                  {selectedRow.paid && (
                    <p className="flex items-center gap-1 text-xs text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />
                      Marked paid for this month (browser only).
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </Card>
      </div>

      {claimsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Claims detail"
          onClick={() => setClaimsOpen(null)}
        >
          <Card
            className="max-h-[85vh] w-full max-w-lg overflow-hidden border-0 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h3 className="font-semibold text-gray-900">Claims detail</h3>
              <Button variant="ghost" size="sm" type="button" onClick={() => setClaimsOpen(null)}>
                Close
              </Button>
            </div>
            <div className="flex border-b border-slate-100">
              <button
                type="button"
                className={`flex-1 py-2 text-sm font-medium ${
                  claimsTab === 'expense' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-slate-600'
                }`}
                onClick={() => setClaimsTab('expense')}
              >
                Expenses
              </button>
              <button
                type="button"
                className={`flex-1 py-2 text-sm font-medium ${
                  claimsTab === 'vehicle' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-slate-600'
                }`}
                onClick={() => setClaimsTab('vehicle')}
              >
                Vehicle
              </button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-4 text-sm">
              {claimsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                </div>
              ) : claimsTab === 'expense' ? (
                claimsExpenses.length ? (
                  <ul className="space-y-2">
                    {claimsExpenses.map((ex) => (
                      <li key={ex.id} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                        <div className="flex justify-between gap-2">
                          <span className="font-medium text-gray-900">{ex.category}</span>
                          <span className="font-mono">{money(ex.amount)}</span>
                        </div>
                        <div className="mt-1 text-xs text-slate-600">{ex.description}</div>
                        <div className="mt-1 text-xs">
                          <Badge variant="outline" className="text-[10px]">
                            {ex.status}
                          </Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-slate-500">No expense rows in this month for this employee.</p>
                )
              ) : vehicleClaims.filter((c) => c.employee_id === claimsOpen).length ? (
                <ul className="space-y-2">
                  {vehicleClaims
                    .filter((c) => c.employee_id === claimsOpen)
                    .map((c) => (
                      <li key={c.id} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                        <div className="flex justify-between gap-2">
                          <span className="font-medium text-gray-900">{c.vehicle_name || 'Vehicle'}</span>
                          <span className="font-mono">{money(c.approved_amount)}</span>
                        </div>
                        <div className="mt-1 text-xs text-slate-600">
                          Status: {c.claim_status}
                          {c.km_driven != null && ` · ${c.km_driven} km`}
                        </div>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="text-slate-500">No approved vehicle claims in this month for this employee.</p>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
