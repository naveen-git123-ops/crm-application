import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Clock, Calendar, LogIn, LogOut, AlertCircle, User, TrendingDown, MapPin, Briefcase, Check, X } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState('punch'); // punch | report | late | summary | tour
  const [reportLoading, setReportLoading] = useState(false);
  const [lateLoading, setLateLoading] = useState(false);
  const [punchLoading, setPunchLoading] = useState(false);
  const [tourPending, setTourPending] = useState([]);
  const [tourLoading, setTourLoading] = useState(false);

  const canManageAttendance = ['Admin', 'HR'].includes(user?.role);
  const canApproveTour = ['Admin', 'Manager'].includes(user?.role);

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

  const fetchTourPending = async () => {
    if (!canApproveTour) return;
    setTourLoading(true);
    try {
      const res = await axios.get(`${API}/attendance/tour-pending`, { headers: authHeader() });
      setTourPending(res.data);
    } catch {
      toast.error('Failed to load tour requests');
    } finally {
      setTourLoading(false);
    }
  };

  useEffect(() => {
    if (canApproveTour && activeTab === 'tour') fetchTourPending();
  }, [canApproveTour, activeTab]);

  const getLocation = () =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Location is not supported by your browser'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });

  const handlePunch = async (action) => {
    const employeeId = canManageAttendance ? selectedEmployee : user?.employee_id;
    if (!employeeId) {
      toast.error('Employee information not available');
      return;
    }
    let latitude = null;
    let longitude = null;
    if (!canManageAttendance) {
      setPunchLoading(true);
      try {
        const loc = await getLocation();
        latitude = loc.lat;
        longitude = loc.lng;
      } catch (err) {
        setPunchLoading(false);
        toast.error(err.message || 'Location is required to punch. Please enable location access.');
        return;
      }
    }
    setPunchLoading(true);
    try {
      const payload = { employee_id: employeeId, action };
      if (latitude != null) payload.latitude = latitude;
      if (longitude != null) payload.longitude = longitude;
      const res = await axios.post(`${API}/attendance/punch`, payload, { headers: authHeader() });
      const msg = res.data?.message || (action === 'punch_in' ? 'Punch In recorded' : 'Punch Out recorded');
      if (res.data?.is_tour) {
        toast.info(msg);
      } else {
        toast.success(msg);
      }
      fetchAttendance();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Punch failed');
    } finally {
      setPunchLoading(false);
    }
  };

  const handleTourApprove = async (attendanceId, status) => {
    try {
      await axios.post(
        `${API}/attendance/tour-approve`,
        { attendance_id: attendanceId, status },
        { headers: authHeader() }
      );
      toast.success(status === 'approved' ? 'Tour approved' : 'Tour rejected');
      fetchTourPending();
      fetchAttendance();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Action failed');
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
    <div className="space-y-4 sm:space-y-6" data-testid="attendance-page">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-gray-900">Attendance</h1>
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

      {/* Location notice for employees */}
      {!canManageAttendance && (
        <Card className="p-4 rounded-lg border border-amber-200 bg-amber-50 flex items-center gap-3">
          <MapPin className="h-6 w-6 text-amber-600 shrink-0" />
          <div>
            <p className="font-semibold text-amber-900">Location required</p>
            <p className="text-sm text-amber-800">
              Punch in/out uses your device location. Within <strong>50 m of office</strong> = regular attendance. Outside = recorded as <strong>Tour</strong> (official travel) and requires approval from Admin/Manager.
            </p>
          </div>
        </Card>
      )}

      {/* Tabs for Admin/HR and Tour for Admin/Manager */}
      {(canManageAttendance || canApproveTour) && (
        <Card className="p-2 rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex gap-2 flex-wrap [&_button]:min-h-[44px]">
            {[
              { id: 'punch', label: 'Mark Attendance', show: true },
              { id: 'tour', label: 'Tour Requests', show: canApproveTour },
              { id: 'report', label: 'Report (Date Range)', show: canManageAttendance },
              { id: 'late', label: 'Late Logins', show: canManageAttendance },
              { id: 'summary', label: 'Monthly Summary', show: true },
            ].filter((t) => t.show).map((tab) => (
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
      <Card className="p-4 sm:p-6 border border-gray-200 bg-white shadow-sm">
        <div className="flex justify-between items-center gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-1">Current Time</p>
            <p className="text-2xl sm:text-4xl font-bold font-mono text-gray-900">{format(currentTime, 'HH:mm:ss')}</p>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">{format(currentTime, 'EEEE, MMM d')}</p>
          </div>
          <Clock className="h-10 w-10 sm:h-14 sm:w-14 text-gray-300 flex-shrink-0" />
        </div>
      </Card>

      {/* Punch In/Out - show for punch tab or for employees (no tabs) */}
      {(activeTab === 'punch' || !(canManageAttendance || canApproveTour)) && (
        <Card className="p-4 sm:p-6 rounded-lg border border-gray-200 bg-white shadow-sm">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">Mark Attendance</h3>

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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <Button
              size="lg"
              className="h-14 sm:h-20 text-base sm:text-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 min-h-[48px]"
              onClick={() => handlePunch('punch_in')}
              disabled={todayAttendance !== null || punchLoading}
              data-testid="punch-in-button"
            >
              {punchLoading ? (
                <span className="flex items-center gap-2"><span className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" /> Getting location...</span>
              ) : (
                <>
                  <LogIn className="h-6 w-6 mr-2" />
                  Punch In
                </>
              )}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-14 sm:h-20 text-base sm:text-lg border-gray-300 text-gray-900 hover:bg-gray-50 font-semibold min-h-[48px]"
              onClick={() => handlePunch('punch_out')}
              disabled={!todayAttendance || todayAttendance.punch_out || punchLoading}
              data-testid="punch-out-button"
            >
              {punchLoading ? (
                <span className="flex items-center gap-2"><span className="animate-spin rounded-full h-5 w-5 border-2 border-gray-600 border-t-transparent" /> Getting location...</span>
              ) : (
                <>
                  <LogOut className="h-6 w-6 mr-2" />
                  Punch Out
                </>
              )}
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
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`inline-block px-2.5 py-1 rounded text-xs font-medium ${
                      todayAttendance.status === 'Present' ? 'bg-green-50 text-green-700' :
                      todayAttendance.status === 'Late' ? 'bg-amber-50 text-amber-700' :
                      'bg-gray-200 text-gray-700'
                    }`}
                  >
                    {todayAttendance.status}
                  </span>
                  {todayAttendance.is_tour === 1 && (
                    <span className={`inline-block px-2.5 py-1 rounded text-xs font-medium ${
                      todayAttendance.tour_approval_status === 'approved' ? 'bg-green-50 text-green-700' :
                      todayAttendance.tour_approval_status === 'rejected' ? 'bg-red-50 text-red-700' :
                      'bg-amber-50 text-amber-700'
                    }`}>
                      Tour ({todayAttendance.tour_approval_status || 'Pending'})
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Tour Requests - Admin/Manager */}
      {canApproveTour && activeTab === 'tour' && (
        <Card className="p-6 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-amber-600" />
            Tour Requests (Punch outside office)
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Employees who punched in/out outside 50 m of office. Approve to count as present.
          </p>
          {tourLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-600 border-t-transparent" />
            </div>
          ) : tourPending.length === 0 ? (
            <p className="text-center py-8 text-gray-500">No pending tour requests.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Date</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Employee</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Punch In</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Punch Out</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Hours</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tourPending.map((row) => (
                    <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                      <td className="py-3 px-4 font-medium text-gray-900">{row.date}</td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-gray-900">{row.employee_name}</span>
                        <span className="text-xs text-gray-500 block">{row.employee_id}</span>
                      </td>
                      <td className="py-3 px-4 font-mono text-gray-700">{row.punch_in || '–'}</td>
                      <td className="py-3 px-4 font-mono text-gray-700">{row.punch_out || '–'}</td>
                      <td className="py-3 px-4 font-mono text-gray-700">{row.work_hours?.toFixed(2) ?? '–'} hrs</td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white h-8"
                            onClick={() => handleTourApprove(row.id, 'approved')}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-300 text-red-700 hover:bg-red-50 h-8"
                            onClick={() => handleTourApprove(row.id, 'rejected')}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Reject
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                          row.status === 'Holiday' ? 'bg-slate-100 text-slate-700' :
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
                            record.status === 'Holiday' ? 'bg-slate-100 text-slate-700' :
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
