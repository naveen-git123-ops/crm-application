import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { format, parse } from 'date-fns';
import { BarChart3, ChevronLeft, ChevronRight, Calendar, User, Clock, LogIn, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { formatDayCount } from '@/utils/attendanceGridMetrics';
import { toast } from 'sonner';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const inputClass =
  'h-11 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none';

const PIE_COLORS = ['#3b82f6', '#22c55e', '#eab308', '#f97316', '#a855f7', '#ec4899', '#64748b', '#14b8a6', '#0ea5e9', '#d946ef'];

const emptyLateReport = (meta = {}) => ({
  month: meta.month || '',
  employee_id: meta.employee_id || '',
  employee_name: meta.employee_name || '',
  summary: {
    late_login_events: 0,
    late_logout_events: 0,
    total_minutes_late_in: 0,
    total_minutes_late_out: 0,
    pending_late_in: 0,
    pending_late_out: 0,
  },
  late_logins: [],
  late_logouts: [],
  reason_breakdown: [],
  late_in_minutes_by_date: [],
  late_out_minutes_by_date: [],
});

const formatPunch = (t) => {
  if (!t) return '—';
  if (typeof t === 'string' && t.match(/^\d{2}:\d{2}(:\d{2})?$/)) {
    return t.length === 5 ? `${t}:00` : t;
  }
  return t;
};

const formatShortDate = (ds) => {
  if (!ds || typeof ds !== 'string') return '';
  try {
    return format(parse(ds, 'yyyy-MM-dd', new Date()), 'MMM d');
  } catch {
    return ds.slice(5);
  }
};

/** Row background by day status. */
const attendanceGridRowClass = (row) => {
  const s = row.status;
  if (s === 'Holiday') return 'bg-emerald-50 hover:bg-emerald-100/70 ';
  if (s === 'Absent') return 'bg-rose-50 hover:bg-rose-100/70 ';
  if (s === 'Half Day') return 'bg-teal-50 hover:bg-teal-100/70 ';
  return 'bg-white hover:bg-gray-50/80 ';
};

const statusBadgeClass = (status) => {
  if (status === 'Holiday') return 'bg-emerald-100 text-emerald-800';
  if (status === 'Absent') return 'bg-rose-100 text-rose-800';
  if (status === 'Half Day') return 'bg-teal-100 text-teal-800';
  return 'bg-blue-100 text-blue-800';
};

const statusLabel = (row) => {
  if (row.status === 'Half Day' && row.half_day_session) {
    return `Half day (${row.half_day_session})`;
  }
  return row.status || 'Present';
};

export const MonthlyReport = () => {
  const { user } = useAuth();
  const canSelectEmployee = user?.role === 'Admin' || user?.role === 'Accountant';
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [lateData, setLateData] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [reportEmployeeId, setReportEmployeeId] = useState('');

  useEffect(() => {
    if (!user) return;
    if (!canSelectEmployee) {
      setReportEmployeeId(user.employee_id || '');
      return;
    }
    setReportEmployeeId((prev) => {
      if (prev) return prev;
      return user.employee_id || '';
    });
  }, [user?.id, user?.role, user?.employee_id, canSelectEmployee]);

  useEffect(() => {
    if (!canSelectEmployee) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API}/employees`, { headers: authHeader() });
        if (cancelled) return;
        const list = [...(res.data || [])].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setEmployees(list);
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          toast.error(err.response?.data?.detail || 'Failed to load employees');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canSelectEmployee]);

  const load = useCallback(async () => {
    const canView =
      user?.role === 'Admin' ||
      (Array.isArray(user?.permissions) && user.permissions.includes('monthly-report'));
    if (!canView) {
      setLoading(false);
      setData(null);
      setLateData(null);
      return;
    }
    if (canSelectEmployee && !reportEmployeeId) {
      setLoading(false);
      setData(null);
      setLateData(null);
      return;
    }
    if (!canSelectEmployee && !user?.employee_id) {
      setLoading(false);
      setData(null);
      setLateData(null);
      return;
    }
    setLoading(true);
    const params = { month };
    if (canSelectEmployee && reportEmployeeId) {
      params.employee_id = reportEmployeeId;
    }
    try {
      const [gridResult, lateResult] = await Promise.allSettled([
        axios.get(`${API}/attendance/monthly-report`, { params, headers: authHeader() }),
        axios.get(`${API}/attendance/monthly-late-report`, { params, headers: authHeader() }),
      ]);
      if (gridResult.status !== 'fulfilled') {
        throw gridResult.reason;
      }
      const grid = gridResult.value.data;
      setData(grid);
      if (lateResult.status === 'fulfilled') {
        setLateData(lateResult.value.data);
      } else {
        console.error(lateResult.reason);
        setLateData(
          emptyLateReport({
            month,
            employee_id: grid?.employee_id,
            employee_name: grid?.employee_name,
          })
        );
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.detail || 'Failed to load monthly report');
      setData(null);
      setLateData(null);
    } finally {
      setLoading(false);
    }
  }, [month, user, canSelectEmployee, reportEmployeeId]);

  useEffect(() => {
    load();
  }, [load]);

  const year = parseInt(month.split('-')[0], 10);
  const monthNum = parseInt(month.split('-')[1], 10);

  const canViewPage =
    user?.role === 'Admin' || (Array.isArray(user?.permissions) && user.permissions.includes('monthly-report'));

  if (!canViewPage) {
    return (
      <div className="space-y-6" data-testid="monthly-report-page">
        <Card className="p-12 text-center rounded-lg border border-gray-200 bg-white shadow-sm">
          <p className="text-gray-600">You do not have access to the monthly report.</p>
        </Card>
      </div>
    );
  }

  if (!canSelectEmployee && !user?.employee_id) {
    return (
      <div className="space-y-6" data-testid="monthly-report-page">
        <Card className="p-12 text-center rounded-lg border border-gray-200 bg-white shadow-sm">
          <p className="text-gray-600">
            Your account is not linked to an employee profile, so a monthly attendance report is not available.
          </p>
        </Card>
      </div>
    );
  }

  const days = data?.days || [];
  const late = lateData || emptyLateReport({ month, employee_id: data?.employee_id, employee_name: data?.employee_name });
  const reasonPie = (late.reason_breakdown || []).map((r, i) => ({ ...r, color: PIE_COLORS[i % PIE_COLORS.length] }));
  const lateInByDate = (late.late_in_minutes_by_date || []).map((row) => ({
    ...row,
    label: formatShortDate(row.date),
  }));
  const lateOutByDate = (late.late_out_minutes_by_date || []).map((row) => ({
    ...row,
    label: formatShortDate(row.date),
  }));

  const gridTableClass =
    'w-full text-sm border-collapse border border-gray-200 table-fixed min-w-[520px] [&_th]:border [&_th]:border-gray-200 [&_td]:border [&_td]:border-gray-200';

  const sum = late.summary || {};

  return (
    <div className="space-y-6" data-testid="monthly-report-page">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-gray-900">Monthly attendance</h1>
          <p className="text-gray-600 text-sm mt-1">
            Full calendar month with each day marked Present, Absent, Half day, or Holiday. Use the Late attendance report
            tab for charts and reasons for late punch-ins and punch-outs.
          </p>
          {data?.employee_name ? (
            <p className="text-gray-600 text-sm mt-1 flex flex-wrap items-center gap-2">
              <User className="h-4 w-4 text-gray-400 shrink-0" />
              <span className="font-medium text-gray-900">{data.employee_name}</span>
              {data.employee_id ? <span className="font-mono text-gray-500">{data.employee_id}</span> : null}
            </p>
          ) : null}
        </div>
      </div>

      <Card className="p-4 sm:p-5 rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col lg:flex-row gap-5 lg:items-end lg:justify-between">
          {canSelectEmployee ? (
            <div className="space-y-2 w-full lg:max-w-md">
              <Label htmlFor="monthly-report-employee" className="text-sm font-medium text-gray-700">
                Employee
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <select
                  id="monthly-report-employee"
                  value={reportEmployeeId}
                  onChange={(e) => setReportEmployeeId(e.target.value)}
                  className={`w-full pl-10 pr-3 ${inputClass}`}
                >
                  <option value="">Select employee…</option>
                  {employees.map((emp) => (
                    <option key={emp.employee_id} value={emp.employee_id}>
                      {emp.name} ({emp.employee_id})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="monthly-report-month" className="text-sm font-medium text-gray-700">
              Month
            </Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11 shrink-0 border-gray-300 text-gray-700 hover:bg-gray-50"
                onClick={() => {
                  const d = new Date(year, monthNum - 2, 1);
                  setMonth(format(d, 'yyyy-MM'));
                }}
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <Input
                  id="monthly-report-month"
                  type="month"
                  value={month}
                  onChange={(e) => e.target.value && setMonth(e.target.value)}
                  className={`pl-10 w-[min(100%,11rem)] ${inputClass}`}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11 shrink-0 border-gray-300 text-gray-700 hover:bg-gray-50"
                onClick={() => {
                  const d = new Date(year, monthNum, 1);
                  setMonth(format(d, 'yyyy-MM'));
                }}
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      ) : canSelectEmployee && !reportEmployeeId ? (
        <Card className="p-12 text-center rounded-lg border border-gray-200 bg-white shadow-sm">
          <BarChart3 className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600">Select an employee above to load their monthly attendance report.</p>
        </Card>
      ) : (
        <Tabs defaultValue="grid" className="space-y-4">
          <TabsList className="grid w-full max-w-md grid-cols-2 h-auto p-1">
            <TabsTrigger value="grid" className="py-2">
              Attendance grid
            </TabsTrigger>
            <TabsTrigger value="insights" className="py-2">
              Late attendance report
            </TabsTrigger>
          </TabsList>

          <TabsContent value="grid" className="space-y-4 mt-4 focus-visible:outline-none">
            <Card className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-200 px-4 sm:px-5 py-3 flex flex-wrap gap-4 justify-between items-center">
                <h2 className="text-sm font-semibold text-gray-800">Summary · {month}</h2>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-600">
                  <span>
                    Avg / worked day:{' '}
                    <strong className="text-gray-900 tabular-nums">{data?.avg_hours_per_worked_day ?? 0}</strong> h
                  </span>
                  <span>
                    Total hours: <strong className="text-gray-900 tabular-nums">{data?.total_work_hours ?? 0}</strong> h
                  </span>
                  <span>
                    Worked days:{' '}
                    <strong className="text-gray-900 tabular-nums">{formatDayCount(data?.worked_days ?? 0)}</strong>
                  </span>
                  <span>
                    Half days: <strong className="text-gray-900 tabular-nums">{data?.half_day_days ?? 0}</strong>
                  </span>
                </div>
              </div>
            </Card>

            <Card className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="bg-blue-600 text-white px-4 sm:px-5 py-3">
                <h2 className="text-sm font-semibold">Attendance grid</h2>
                <p className="text-blue-100 text-xs mt-0.5">
                  Each row is Present, Absent, Half day, or Holiday. Login = first punch-in · Logout = last punch-out ·
                  Effective hours = total for the day (Holiday/Absent/Half day non-work days show —).
                </p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-blue-50 leading-tight">
                  <span>
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-white border border-blue-200/80 align-middle mr-1" />
                    Present
                  </span>
                  <span>
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-teal-200 align-middle mr-1" /> Half day
                  </span>
                  <span>
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-200 align-middle mr-1" /> Absent
                  </span>
                  <span>
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-200 align-middle mr-1" /> Holiday
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto table-scroll p-0">
                <table className={gridTableClass}>
                  <colgroup>
                    <col className="w-[18%]" />
                    <col className="w-[22%]" />
                    <col className="w-[20%]" />
                    <col className="w-[20%]" />
                    <col className="w-[20%]" />
                  </colgroup>
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="text-left py-3 px-4 font-semibold text-gray-800">Date</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-800">Status</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-800">Login time</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-800">Logout time</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-800">Effective hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {days.map((row) => {
                      const trClass = attendanceGridRowClass(row);
                      const hrs = Number(row.total_work_hours || 0);
                      let effCell = '—';
                      if (row.status === 'Present') effCell = hrs > 0 ? hrs.toFixed(2) : '0.00';

                      return (
                        <tr key={row.date} className={trClass}>
                          <td className="py-3 px-4 font-mono text-gray-900 align-middle">{row.date}</td>
                          <td className="py-3 px-4 align-middle">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(row.status)}`}
                            >
                              {statusLabel(row)}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-gray-800 align-middle">{formatPunch(row.first_punch_in)}</td>
                          <td className="py-3 px-4 font-mono text-gray-800 align-middle">{formatPunch(row.last_punch_out)}</td>
                          <td className="py-3 px-4 font-mono text-right text-gray-900 font-medium tabular-nums align-middle">
                            {effCell}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {days.length > 0 && (
                    <tfoot>
                      <tr className="bg-gray-100 font-semibold text-gray-900">
                        <td className="py-3 px-4 border border-gray-200" colSpan={4}>
                          Month total (effective hours)
                        </td>
                        <td className="py-3 px-4 border border-gray-200 text-right font-mono tabular-nums">
                          {(data?.total_work_hours ?? 0).toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              {days.length === 0 && (
                <div className="p-12 text-center border-t border-gray-100">
                  <p className="text-gray-600">No data for this month. Try again or pick another month.</p>
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="insights" className="space-y-4 mt-4 focus-visible:outline-none">
            <Card className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="bg-indigo-600 text-white px-4 sm:px-5 py-3">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4 shrink-0" />
                  Late attendance report · {month}
                </h2>
                <p className="text-indigo-100 text-xs mt-0.5">
                  Based on late punch-in and late punch-out requests (with employee reasons). Admins: pick an employee
                  above; employees see their own data.
                </p>
              </div>
              <div className="p-4 sm:p-5 space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                    <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Late logins</p>
                    <p className="text-lg font-semibold text-gray-900 tabular-nums">{sum.late_login_events ?? 0}</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                    <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Late logouts</p>
                    <p className="text-lg font-semibold text-gray-900 tabular-nums">{sum.late_logout_events ?? 0}</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                    <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Min late (in)</p>
                    <p className="text-lg font-semibold text-gray-900 tabular-nums">{sum.total_minutes_late_in ?? 0}</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                    <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Min late (out)</p>
                    <p className="text-lg font-semibold text-gray-900 tabular-nums">{sum.total_minutes_late_out ?? 0}</p>
                  </div>
                  <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5">
                    <p className="text-[11px] font-medium text-amber-800 uppercase tracking-wide">Pending in</p>
                    <p className="text-lg font-semibold text-amber-900 tabular-nums">{sum.pending_late_in ?? 0}</p>
                  </div>
                  <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5">
                    <p className="text-[11px] font-medium text-amber-800 uppercase tracking-wide">Pending out</p>
                    <p className="text-lg font-semibold text-amber-900 tabular-nums">{sum.pending_late_out ?? 0}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">Late login minutes by day</h3>
                    {lateInByDate.length > 0 ? (
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={lateInByDate} margin={{ top: 8, right: 8, left: 0, bottom: 32 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-35} textAnchor="end" height={48} />
                          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                          <Tooltip formatter={(value) => [`${value} min`, 'Late (login)']} labelFormatter={(l) => l} />
                          <Bar dataKey="minutes" name="Minutes late" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-[280px] flex items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-500">
                        No late punch-in events this month
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">Late punch-in reasons</h3>
                    {reasonPie.length > 0 ? (
                      <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                          <Pie
                            data={reasonPie}
                            cx="50%"
                            cy="50%"
                            innerRadius={56}
                            outerRadius={92}
                            paddingAngle={2}
                            dataKey="value"
                            nameKey="name"
                          >
                            {reasonPie.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => [value, 'Events']} />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-[280px] flex items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-500">
                        No late punch-in reasons recorded this month
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Late logout minutes by day</h3>
                  {lateOutByDate.length > 0 ? (
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={lateOutByDate} margin={{ top: 8, right: 8, left: 0, bottom: 32 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-35} textAnchor="end" height={48} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip formatter={(value) => [`${value} min`, 'Late (logout)']} labelFormatter={(l) => l} />
                        <Bar dataKey="minutes" name="Minutes late" fill="#0d9488" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[260px] flex items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-500">
                      No late punch-out events this month
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <LogIn className="h-4 w-4 text-indigo-600" />
                    Late punch-in detail
                  </h3>
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-sm border-collapse [&_th]:border-b [&_th]:border-gray-200 [&_td]:border-b [&_td]:border-gray-100">
                      <thead>
                        <tr className="bg-gray-50 text-left text-gray-700">
                          <th className="py-2.5 px-3 font-semibold">Date</th>
                          <th className="py-2.5 px-3 font-semibold">Punch in</th>
                          <th className="py-2.5 px-3 font-semibold text-right">Minutes late</th>
                          <th className="py-2.5 px-3 font-semibold">Employee reason</th>
                          <th className="py-2.5 px-3 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(late.late_logins || []).length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-gray-500">
                              No late punch-in rows for this month.
                            </td>
                          </tr>
                        ) : (
                          late.late_logins.map((r) => (
                            <tr key={r.id} className="hover:bg-gray-50/80">
                              <td className="py-2.5 px-3 font-mono text-gray-900">{r.punch_in_date}</td>
                              <td className="py-2.5 px-3 font-mono text-gray-800">{formatPunch(r.punch_in_time)}</td>
                              <td className="py-2.5 px-3 text-right tabular-nums font-medium text-gray-900">{r.minutes_late ?? 0}</td>
                              <td className="py-2.5 px-3 text-gray-700 max-w-[240px] sm:max-w-xs">
                                {r.employee_reason || '—'}
                              </td>
                              <td className="py-2.5 px-3">
                                <span
                                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                    r.status === 'Approved'
                                      ? 'bg-green-100 text-green-800'
                                      : r.status === 'Rejected'
                                        ? 'bg-red-100 text-red-800'
                                        : 'bg-amber-100 text-amber-900'
                                  }`}
                                >
                                  {r.status || '—'}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <LogOut className="h-4 w-4 text-teal-600" />
                    Late punch-out detail
                  </h3>
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-sm border-collapse [&_th]:border-b [&_th]:border-gray-200 [&_td]:border-b [&_td]:border-gray-100">
                      <thead>
                        <tr className="bg-gray-50 text-left text-gray-700">
                          <th className="py-2.5 px-3 font-semibold">Date</th>
                          <th className="py-2.5 px-3 font-semibold">Punch out</th>
                          <th className="py-2.5 px-3 font-semibold text-right">Minutes late</th>
                          <th className="py-2.5 px-3 font-semibold">Employee reason</th>
                          <th className="py-2.5 px-3 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(late.late_logouts || []).length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-gray-500">
                              No late punch-out rows for this month.
                            </td>
                          </tr>
                        ) : (
                          late.late_logouts.map((r) => (
                            <tr key={r.id} className="hover:bg-gray-50/80">
                              <td className="py-2.5 px-3 font-mono text-gray-900">{r.punch_out_date}</td>
                              <td className="py-2.5 px-3 font-mono text-gray-800">{formatPunch(r.punch_out_time)}</td>
                              <td className="py-2.5 px-3 text-right tabular-nums font-medium text-gray-900">{r.minutes_late ?? 0}</td>
                              <td className="py-2.5 px-3 text-gray-700 max-w-[240px] sm:max-w-xs">
                                {r.employee_reason || '—'}
                              </td>
                              <td className="py-2.5 px-3">
                                <span
                                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                    r.status === 'Approved'
                                      ? 'bg-green-100 text-green-800'
                                      : r.status === 'Rejected'
                                        ? 'bg-red-100 text-red-800'
                                        : 'bg-amber-100 text-amber-900'
                                  }`}
                                >
                                  {r.status || '—'}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};
