import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { BarChart3, ChevronLeft, ChevronRight, Calendar, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const inputClass =
  'h-11 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none';

const formatPunch = (t) => {
  if (!t) return '—';
  if (typeof t === 'string' && t.match(/^\d{2}:\d{2}(:\d{2})?$/)) {
    return t.length === 5 ? `${t}:00` : t;
  }
  return t;
};

export const MonthlyReport = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [reportEmployeeId, setReportEmployeeId] = useState('');

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'Admin') {
      setReportEmployeeId(user.employee_id || '');
      return;
    }
    setReportEmployeeId((prev) => {
      if (prev) return prev;
      return user.employee_id || '';
    });
  }, [user?.id, user?.role, user?.employee_id]);

  useEffect(() => {
    if (!isAdmin) return;
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
  }, [isAdmin]);

  const load = useCallback(async () => {
    const canView =
      user?.role === 'Admin' ||
      (Array.isArray(user?.permissions) && user.permissions.includes('monthly-report'));
    if (!canView) {
      setLoading(false);
      setData(null);
      return;
    }
    if (isAdmin && !reportEmployeeId) {
      setLoading(false);
      setData(null);
      return;
    }
    if (!isAdmin && !user?.employee_id) {
      setLoading(false);
      setData(null);
      return;
    }
    setLoading(true);
    const params = { month };
    if (isAdmin && reportEmployeeId) {
      params.employee_id = reportEmployeeId;
    }
    try {
      const res = await axios.get(`${API}/attendance/monthly-report`, { params, headers: authHeader() });
      setData(res.data);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.detail || 'Failed to load monthly report');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [month, user, isAdmin, reportEmployeeId]);

  useEffect(() => {
    load();
  }, [load]);

  const year = parseInt(month.split('-')[0], 10);
  const monthNum = parseInt(month.split('-')[1], 10);

  const canViewPage =
    user?.role === 'Admin' || (Array.isArray(user?.permissions) && user?.permissions.includes('monthly-report'));

  if (!canViewPage) {
    return (
      <div className="space-y-6" data-testid="monthly-report-page">
        <Card className="p-12 text-center rounded-lg border border-gray-200 bg-white shadow-sm">
          <p className="text-gray-600">You do not have access to the monthly report.</p>
        </Card>
      </div>
    );
  }

  if (!isAdmin && !user?.employee_id) {
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
  const gridTableClass =
    'w-full text-sm border-collapse border border-gray-200 table-fixed min-w-[520px] [&_th]:border [&_th]:border-gray-200 [&_td]:border [&_td]:border-gray-200';

  return (
    <div className="space-y-6" data-testid="monthly-report-page">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-gray-900">Monthly attendance</h1>
          <p className="text-gray-600 text-sm mt-1">Date-wise login, logout, and effective hours for the selected month.</p>
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
          {isAdmin ? (
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
      ) : isAdmin && !reportEmployeeId ? (
        <Card className="p-12 text-center rounded-lg border border-gray-200 bg-white shadow-sm">
          <BarChart3 className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600">Select an employee above to load their monthly attendance report.</p>
        </Card>
      ) : (
        <>
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
                  Worked days: <strong className="text-gray-900 tabular-nums">{data?.worked_days ?? 0}</strong>
                </span>
              </div>
            </div>
          </Card>

          <Card className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="bg-blue-600 text-white px-4 sm:px-5 py-3">
              <h2 className="text-sm font-semibold">Attendance grid</h2>
              <p className="text-blue-100 text-xs mt-0.5">
                Login = first punch-in · Logout = last punch-out · Effective hours = total for the day ·{' '}
                <span className="text-yellow-100 font-medium">Yellow row = late login</span>
              </p>
            </div>
            <div className="overflow-x-auto table-scroll p-0">
              <table className={gridTableClass}>
                <colgroup>
                  <col className="w-[22%]" />
                  <col className="w-[26%]" />
                  <col className="w-[26%]" />
                  <col className="w-[26%]" />
                </colgroup>
                <thead>
                  <tr className="bg-gray-100">
                    <th className="text-left py-3 px-4 font-semibold text-gray-800">Date</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-800">Login time</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-800">Logout time</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-800">Effective hours</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((row) => {
                    let trClass = '';
                    if (row.status === 'Leave') {
                      trClass = 'bg-blue-50 hover:bg-blue-100/80 ';
                    } else if (row.late_login) {
                      trClass = 'bg-yellow-100 hover:bg-yellow-200/70 ';
                    } else if (row.is_tour_day && row.tour_approved) {
                      trClass = 'bg-pink-50 hover:bg-pink-100/70 ';
                    } else if (row.is_tour_day && row.tour_pending_or_other) {
                      trClass = 'bg-red-50 hover:bg-red-100/60 ';
                    } else {
                      trClass = 'bg-white hover:bg-gray-50/80 ';
                    }
                    const hrs = Number(row.total_work_hours || 0);
                    return (
                      <tr key={row.date} className={trClass}>
                        <td className="py-3 px-4 font-mono text-gray-900 align-middle">{row.date}</td>
                        <td className="py-3 px-4 font-mono text-gray-800 align-middle">{formatPunch(row.first_punch_in)}</td>
                        <td className="py-3 px-4 font-mono text-gray-800 align-middle">{formatPunch(row.last_punch_out)}</td>
                        <td className="py-3 px-4 font-mono text-right text-gray-900 font-medium tabular-nums align-middle">
                          {row.status === 'Leave' ? '0.00' : hrs > 0 ? hrs.toFixed(2) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {days.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-100 font-semibold text-gray-900">
                      <td className="py-3 px-4 border border-gray-200" colSpan={3}>
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
                <p className="text-gray-600">No attendance rows for this month yet.</p>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
};
