import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Clock, Calendar, LogIn, LogOut, AlertCircle, User, TrendingDown } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;
const LOGIN_START = '10:00';
const LOGIN_END = '10:30';

export const Attendance = () => {
  const { user } = useAuth();
  const [attendance, setAttendance] = useState([]);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [summaryMonth, setSummaryMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [attendanceSummary, setAttendanceSummary] = useState([]);
  const [report, setReport] = useState([]);
  const [lateDetails, setLateDetails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [activeTab, setActiveTab] = useState('punch'); // punch | report | late | summary
  const [reportLoading, setReportLoading] = useState(false);
  const [lateLoading, setLateLoading] = useState(false);

  const canManageAttendance = ['Admin', 'HR'].includes(user?.role);

  const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  useEffect(() => {
    fetchEmployees();
    fetchAttendance();
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (user?.employee_id && !canManageAttendance) {
      setSelectedEmployee(user.employee_id);
    }
  }, [user]);

  useEffect(() => {
    fetchAttendance();
  }, [selectedEmployee, user?.employee_id]);

  useEffect(() => {
    if (user) fetchAttendanceSummary(summaryMonth);
  }, [summaryMonth, user]);

  const fetchEmployees = async () => {
    try {
      const res = await axios.get(`${API}/employees`, { headers: authHeader() });
      setEmployees(res.data);
    } catch {
      toast.error('Failed to load employees');
    }
  };

  const fetchAttendance = async () => {
    try {
      const month = format(new Date(), 'yyyy-MM');
      const res = await axios.get(`${API}/attendance`, { params: { month }, headers: authHeader() });
      setAttendance(res.data);
      const employeeId = canManageAttendance ? selectedEmployee : user?.employee_id;
      if (employeeId) {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const todayRecord = res.data.find(
          (r) => r.employee_id === employeeId && r.date === todayStr
        );
        setTodayAttendance(todayRecord || null);
      } else {
        setTodayAttendance(null);
      }
    } catch {
      toast.error('Failed to load attendance');
    } finally {
      setLoading(false);
    }
  };

  const fetchAttendanceSummary = async (month) => {
    try {
      const res = await axios.get(`${API}/attendance/summary`, { params: { month }, headers: authHeader() });
      setAttendanceSummary(res.data);
    } catch {
      toast.error('Failed to load summary');
    }
  };

  const fetchReport = async () => {
    setReportLoading(true);
    try {
      const params = { start_date: startDate, end_date: endDate };
      if (canManageAttendance && selectedEmployee) params.employee_id = selectedEmployee;
      const res = await axios.get(`${API}/attendance/report`, { params, headers: authHeader() });
      setReport(res.data);
    } catch {
      toast.error('Failed to load report');
    } finally {
      setReportLoading(false);
    }
  };

  const fetchLateDetails = async () => {
    setLateLoading(true);
    try {
      const params = { start_date: startDate, end_date: endDate };
      if (canManageAttendance && selectedEmployee) params.employee_id = selectedEmployee;
      const res = await axios.get(`${API}/attendance/late-details`, { params, headers: authHeader() });
      setLateDetails(res.data);
    } catch {
      toast.error('Failed to load late details');
    } finally {
      setLateLoading(false);
    }
  };

  const handlePunch = async (action) => {
    const employeeId = canManageAttendance ? selectedEmployee : user?.employee_id;
    if (!employeeId) {
      toast.error('Employee information not available');
      return;
    }
    let employeeName = user?.name;
    if (canManageAttendance && selectedEmployee) {
      const emp = employees.find((e) => e.employee_id === selectedEmployee);
      employeeName = emp?.name || user?.name;
    }
    try {
      await axios.post(
        `${API}/attendance/punch`,
        { employee_id: employeeId, action },
        { headers: authHeader() }
      );
      toast.success(action === 'punch_in' ? 'Punch In recorded' : 'Punch Out recorded');
      fetchAttendance();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Punch failed');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="attendance-page">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Attendance</h1>
        <p className="text-gray-600 text-sm mt-1">Punch in to mark your attendance. Login window 10:00 – 10:30.</p>
      </div>

      {/* Login window notice */}
      <Card className="p-4 rounded-lg border border-blue-200 bg-blue-50 flex items-center gap-3">
        <AlertCircle className="h-6 w-6 text-blue-600 shrink-0" />
        <div>
          <p className="font-semibold text-blue-900">Login window: 10:00 AM – 10:30 AM</p>
          <p className="text-sm text-blue-800">
            Punch in between 10:00 and 10:30 to be marked on time. After 10:30 will be marked <strong>Late</strong>. If you do not punch in, you will be marked <strong>Absent</strong>.
          </p>
        </div>
      </Card>

      {/* Tabs for Admin/HR */}
      {canManageAttendance && (
        <Card className="p-2 rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex gap-2 flex-wrap">
            {[
              { id: 'punch', label: 'Mark Attendance' },
              { id: 'report', label: 'Report (Date Range)' },
              { id: 'late', label: 'Late Logins' },
              { id: 'summary', label: 'Monthly Summary' },
            ].map((tab) => (
              <Button
                key={tab.id}
                variant={activeTab === tab.id ? 'default' : 'ghost'}
                size="sm"
                className={activeTab === tab.id ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </Card>
      )}

      {/* Current time card */}
      <Card className="p-6 border border-gray-200 bg-white shadow-sm">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-1">Current Time</p>
            <p className="text-4xl font-bold font-mono text-gray-900">{format(currentTime, 'HH:mm:ss')}</p>
            <p className="text-sm text-gray-600 mt-1">{format(currentTime, 'EEEE, MMMM d, yyyy')}</p>
          </div>
          <Clock className="h-14 w-14 text-gray-300" />
        </div>
      </Card>

      {/* Punch In/Out - show for punch tab or for employees (no tabs) */}
      {(activeTab === 'punch' || !canManageAttendance) && (
        <Card className="p-6 rounded-lg border border-gray-200 bg-white shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Mark Attendance</h3>

          {!canManageAttendance && user && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center gap-3">
                <User className="h-10 w-10 text-gray-400" />
                <div>
                  <p className="font-medium text-gray-900">{user.name}</p>
                  <p className="text-sm text-gray-600">{user.employee_id} · {user.department || 'N/A'}</p>
                </div>
              </div>
            </div>
          )}

          {canManageAttendance && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Employee</label>
              <select
                data-testid="employee-select"
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              >
                <option value="">Select an employee</option>
                {employees.map((emp) => (
                  <option key={emp.employee_id} value={emp.employee_id}>
                    {emp.name} ({emp.employee_id})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button
              size="lg"
              className="h-20 text-lg bg-blue-600 text-white font-semibold hover:bg-blue-700"
              onClick={() => handlePunch('punch_in')}
              disabled={todayAttendance !== null}
              data-testid="punch-in-button"
            >
              <LogIn className="h-6 w-6 mr-2" />
              Punch In
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-20 text-lg border-gray-300 text-gray-900 hover:bg-gray-50 font-semibold"
              onClick={() => handlePunch('punch_out')}
              disabled={!todayAttendance || todayAttendance.punch_out}
              data-testid="punch-out-button"
            >
              <LogOut className="h-6 w-6 mr-2" />
              Punch Out
            </Button>
          </div>

          {todayAttendance && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-gray-500 text-xs uppercase">Punch In</p>
                <p className="font-mono font-medium text-gray-900">{todayAttendance.punch_in || '–'}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs uppercase">Punch Out</p>
                <p className="font-mono font-medium text-gray-900">{todayAttendance.punch_out || '–'}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs uppercase">Work Hours</p>
                <p className="font-mono font-medium text-gray-900">{todayAttendance.work_hours?.toFixed(2) ?? 0} hrs</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs uppercase">Status</p>
                <span
                  className={`inline-block px-2.5 py-1 rounded text-xs font-medium ${
                    todayAttendance.status === 'Present' ? 'bg-green-50 text-green-700' :
                    todayAttendance.status === 'Late' ? 'bg-amber-50 text-amber-700' :
                    'bg-gray-200 text-gray-700'
                  }`}
                >
                  {todayAttendance.status}
                </span>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Report by date range - Admin/HR */}
      {canManageAttendance && activeTab === 'report' && (
        <Card className="p-6 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Attendance Report (Date Range)</h3>
          <div className="flex flex-wrap gap-3 mb-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Start</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-10 rounded-lg border border-gray-300 px-3 text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">End</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-10 rounded-lg border border-gray-300 px-3 text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Employee</label>
              <select
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
                className="h-10 rounded-lg border border-gray-300 px-3 text-sm text-gray-900 bg-white min-w-[180px]"
              >
                <option value="">All employees</option>
                {employees.map((emp) => (
                  <option key={emp.employee_id} value={emp.employee_id}>{emp.name} ({emp.employee_id})</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button onClick={fetchReport} disabled={reportLoading} className="bg-blue-600 text-white hover:bg-blue-700">
                {reportLoading ? 'Loading…' : 'Load Report'}
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left p-3 font-medium text-gray-700">Date</th>
                  <th className="text-left p-3 font-medium text-gray-700">Employee</th>
                  <th className="text-left p-3 font-medium text-gray-700">Punch In</th>
                  <th className="text-left p-3 font-medium text-gray-700">Punch Out</th>
                  <th className="text-left p-3 font-medium text-gray-700">Hours</th>
                  <th className="text-left p-3 font-medium text-gray-700">Status</th>
                </tr>
              </thead>
              <tbody>
                {report.map((row, idx) => (
                  <tr key={`${row.date}-${row.employee_id}-${idx}`} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-3 font-mono text-gray-900">{row.date}</td>
                    <td className="p-3 text-gray-900">{row.employee_name}</td>
                    <td className="p-3 font-mono text-gray-700">{row.punch_in || '–'}</td>
                    <td className="p-3 font-mono text-gray-700">{row.punch_out || '–'}</td>
                    <td className="p-3 font-mono text-gray-700">{row.work_hours?.toFixed(2) ?? '0'}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          row.status === 'Present' ? 'bg-green-50 text-green-700' :
                          row.status === 'Late' ? 'bg-amber-50 text-amber-700' :
                          row.status === 'Absent' ? 'bg-red-50 text-red-700' :
                          'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {report.length === 0 && !reportLoading && (
            <p className="text-center py-8 text-gray-500">Select date range and click Load Report.</p>
          )}
        </Card>
      )}

      {/* Late logins - Admin/HR */}
      {canManageAttendance && activeTab === 'late' && (
        <Card className="p-6 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-amber-600" />
            Late Login Details
          </h3>
          <div className="flex flex-wrap gap-3 mb-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Start</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-10 rounded-lg border border-gray-300 px-3 text-sm text-gray-900" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">End</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-10 rounded-lg border border-gray-300 px-3 text-sm text-gray-900" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Employee</label>
              <select value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)} className="h-10 rounded-lg border border-gray-300 px-3 text-sm text-gray-900 bg-white min-w-[180px]">
                <option value="">All employees</option>
                {employees.map((emp) => (
                  <option key={emp.employee_id} value={emp.employee_id}>{emp.name} ({emp.employee_id})</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button onClick={fetchLateDetails} disabled={lateLoading} className="bg-blue-600 text-white hover:bg-blue-700">
                {lateLoading ? 'Loading…' : 'Load Late Logins'}
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left p-3 font-medium text-gray-700">Date</th>
                  <th className="text-left p-3 font-medium text-gray-700">Employee</th>
                  <th className="text-left p-3 font-medium text-gray-700">Punch In</th>
                  <th className="text-left p-3 font-medium text-gray-700">Minutes Late</th>
                </tr>
              </thead>
              <tbody>
                {lateDetails.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 hover:bg-amber-50/50">
                    <td className="p-3 font-mono text-gray-900">{row.date}</td>
                    <td className="p-3 text-gray-900">{row.employee_name}</td>
                    <td className="p-3 font-mono text-amber-700">{row.punch_in}</td>
                    <td className="p-3 font-medium text-amber-700">{row.minutes_late} min</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lateDetails.length === 0 && !lateLoading && (
            <p className="text-center py-8 text-gray-500">No late logins in this range. Select dates and click Load Late Logins.</p>
          )}
        </Card>
      )}

      {/* Monthly summary - show for summary tab (Admin/HR) or always for employees */}
      {(activeTab === 'summary' || !canManageAttendance) && (
        <Card className="p-6 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Monthly Overview</h3>
              <p className="text-sm text-gray-600">
                {canManageAttendance ? 'Present, late, absent summary per employee' : 'Your attendance summary'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Month</label>
              <input
                type="month"
                value={summaryMonth}
                onChange={(e) => setSummaryMonth(e.target.value)}
                className="h-10 rounded-lg border border-gray-300 px-3 text-sm text-gray-900"
              />
            </div>
          </div>
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left p-3 font-medium text-gray-700">{canManageAttendance ? 'Employee' : 'Summary'}</th>
                  <th className="text-left p-3 font-medium text-gray-700">Present</th>
                  <th className="text-left p-3 font-medium text-gray-700">Late</th>
                  <th className="text-left p-3 font-medium text-gray-700">Half Day</th>
                  <th className="text-left p-3 font-medium text-gray-700">Absent</th>
                  <th className="text-left p-3 font-medium text-gray-700">Total Days</th>
                </tr>
              </thead>
              <tbody>
                {attendanceSummary.map((row) => (
                  <tr key={row.employee_id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-3">
                      <div className="font-medium text-gray-900">{canManageAttendance ? row.employee_name : 'My Attendance'}</div>
                      {canManageAttendance && <div className="text-xs text-gray-500">{row.employee_id}</div>}
                    </td>
                    <td className="p-3 text-green-700 font-medium">{row.present_days}</td>
                    <td className="p-3 text-amber-700 font-medium">{row.late_days}</td>
                    <td className="p-3 text-blue-700 font-medium">{row.half_day_days}</td>
                    <td className="p-3 text-red-700 font-medium">{row.absent_days}</td>
                    <td className="p-3 text-gray-700 font-medium">{row.total_days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {attendanceSummary.length === 0 && (
            <p className="text-center py-8 text-gray-500">No summary for this month.</p>
          )}
        </Card>
      )}

      {/* Recent attendance history - for current user / selected employee */}
      {!canManageAttendance && (
        <Card className="p-6 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent History</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left p-3 text-gray-600 font-medium">Date</th>
                  <th className="text-left p-3 text-gray-600 font-medium">Punch In</th>
                  <th className="text-left p-3 text-gray-600 font-medium">Punch Out</th>
                  <th className="text-left p-3 text-gray-600 font-medium">Hours</th>
                  <th className="text-left p-3 text-gray-600 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {attendance
                  .filter((r) => r.employee_id === user?.employee_id)
                  .slice(0, 15)
                  .map((record) => (
                    <tr key={record.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="p-3 font-mono text-gray-900">{record.date}</td>
                      <td className="p-3 font-mono text-gray-700">{record.punch_in || '–'}</td>
                      <td className="p-3 font-mono text-gray-700">{record.punch_out || '–'}</td>
                      <td className="p-3 font-mono text-gray-700">{record.work_hours?.toFixed(2) ?? 0}</td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            record.status === 'Present' ? 'bg-green-50 text-green-700' :
                            record.status === 'Late' ? 'bg-amber-50 text-amber-700' :
                            record.status === 'Absent' ? 'bg-red-50 text-red-700' :
                            'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {record.status}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {attendance.filter((r) => r.employee_id === user?.employee_id).length === 0 && (
            <p className="text-center py-8 text-gray-500">No attendance records yet.</p>
          )}
        </Card>
      )}
    </div>
  );
};
