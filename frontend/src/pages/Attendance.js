import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Clock, Calendar as CalendarIcon, LogIn, LogOut } from 'lucide-react';
import { format } from 'date-fns';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export const Attendance = () => {
  const { user } = useAuth();
  const [attendance, setAttendance] = useState([]);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [summaryMonth, setSummaryMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [attendanceSummary, setAttendanceSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const canManageAttendance = ['Admin', 'HR', 'Manager'].includes(user?.role);

  useEffect(() => {
    fetchEmployees();
    fetchAttendance();
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (user?.employee_id) {
      setSelectedEmployee(user.employee_id);
    }
  }, [user]);

  useEffect(() => {
    if (selectedEmployee || user?.employee_id) {
      fetchAttendance();
    }
  }, [selectedEmployee, user?.employee_id]);

  useEffect(() => {
    if (user) {
      fetchAttendanceSummary(summaryMonth);
    }
  }, [summaryMonth, user]);

  const fetchEmployees = async () => {
    try {
      const response = await axios.get(`${API}/employees`);
      setEmployees(response.data);
    } catch (error) {
      toast.error('Failed to load employees');
    }
  };

  const fetchAttendance = async () => {
    try {
      const today = format(new Date(), 'yyyy-MM');
      const response = await axios.get(`${API}/attendance`, { params: { month: today } });
      setAttendance(response.data);
      
      // Check today's attendance - use appropriate employee ID
      const employeeId = canManageAttendance ? selectedEmployee : user?.employee_id;
      if (employeeId) {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const todayRecord = response.data.find(
          record => record.employee_id === employeeId && record.date === todayStr
        );
        setTodayAttendance(todayRecord || null);
      }
    } catch (error) {
      toast.error('Failed to load attendance');
    } finally {
      setLoading(false);
    }
  };

  const fetchAttendanceSummary = async (month) => {
    try {
      const response = await axios.get(`${API}/attendance/summary`, { params: { month } });
      setAttendanceSummary(response.data);
    } catch (error) {
      toast.error('Failed to load attendance summary');
    }
  };

  const handlePunch = async (action) => {
    // For employees, always use their own employee_id
    // For admins/managers, use the selected employee
    const employeeId = canManageAttendance ? selectedEmployee : user?.employee_id;
    
    if (!employeeId) {
      toast.error('Employee information not available');
      return;
    }

    // Get the correct employee name
    let employeeName = user?.name;
    if (canManageAttendance && selectedEmployee) {
      const selectedEmp = employees.find(emp => emp.employee_id === selectedEmployee);
      employeeName = selectedEmp?.name || user?.name;
    }

    try {
      const response = await axios.post(`${API}/attendance/punch`, {
        employee_id: employeeId,
        action: action,
        employee_name: employeeName
      });
      toast.success(response.data.message);
      fetchAttendance();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Punch action failed');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="attendance-page">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Attendance</h1>
        <p className="text-gray-600 text-sm mt-1">Track daily attendance and work hours</p>
      </div>

      {/* Current Time */}
      <Card className="p-6 border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-600 uppercase tracking-widest mb-2">Current Time</p>
            <p className="text-5xl font-bold font-mono tracking-tight text-indigo-600">{format(currentTime, 'HH:mm:ss')}</p>
            <p className="text-sm text-gray-600 mt-2">{format(currentTime, 'EEEE, MMMM d, yyyy')}</p>
          </div>
          <Clock className="h-16 w-16 text-gray-300 opacity-50" />
        </div>
      </Card>

      {/* Punch In/Out */}
      <Card className="p-6 border border-gray-200 bg-white">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Mark Attendance</h3>
        
        {/* Employee Info Display for Non-Admin Users */}
        {!canManageAttendance && user && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-blue-900">Employee Information</p>
                <p className="text-base font-medium text-gray-900">{user.name}</p>
                <p className="text-sm text-gray-600">Employee ID: {user.employee_id}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-600">Department</p>
                <p className="text-sm font-medium text-gray-900">{user.department || 'N/A'}</p>
              </div>
            </div>
          </div>
        )}
        
        {canManageAttendance && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Employee</label>
            <select
              data-testid="employee-select"
              value={selectedEmployee || ''}
              onChange={(e) => setSelectedEmployee(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
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
            className="h-20 text-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold"
            variant="outline"
            onClick={() => handlePunch('punch_out')}
            disabled={!todayAttendance || todayAttendance.punch_out}
            data-testid="punch-out-button"
          >
            <LogOut className="h-6 w-6 mr-2" />
            Punch Out
          </Button>
        </div>

        {todayAttendance && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600 text-xs">Punch In</p>
                <p className="font-mono font-medium text-gray-900">{todayAttendance.punch_in || '-'}</p>
              </div>
              <div>
                <p className="text-gray-600 text-xs">Punch Out</p>
                <p className="font-mono font-medium text-gray-900">{todayAttendance.punch_out || '-'}</p>
              </div>
              <div>
                <p className="text-gray-600 text-xs">Work Hours</p>
                <p className="font-mono font-medium text-gray-900">{todayAttendance.work_hours?.toFixed(2) || 0} hrs</p>
              </div>
              <div>
                <p className="text-gray-600 text-xs mb-1">Status</p>
                <span className={`px-2.5 py-1 rounded text-xs font-medium ${
                  todayAttendance.status === 'Present' ? 'bg-emerald-50 text-emerald-700' :
                  todayAttendance.status === 'Late' ? 'bg-amber-50 text-amber-700' :
                  'bg-gray-200 text-gray-700'
                }`}>
                  {todayAttendance.status}
                </span>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Attendance History */}
      <Card className="p-6 border border-gray-200 bg-white overflow-hidden">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Attendance History</h3>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left p-3 text-xs uppercase tracking-wider text-gray-600 font-medium">Date</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider text-gray-600 font-medium">Employee</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider text-gray-600 font-medium">Punch In</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider text-gray-600 font-medium">Punch Out</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider text-gray-600 font-medium">Hours</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider text-gray-600 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {attendance
                .filter(record => canManageAttendance || record.employee_id === selectedEmployee)
                .slice(0, 20)
                .map((record) => (
                <tr key={record.id} className="border-b border-gray-200 hover:bg-gray-50 transition-colors" data-testid={`attendance-row-${record.id}`}>
                  <td className="p-3 font-mono text-sm text-gray-900">{record.date}</td>
                  <td className="p-3 text-sm text-gray-900">{record.employee_name}</td>
                  <td className="p-3 font-mono text-sm text-gray-900">{record.punch_in || '-'}</td>
                  <td className="p-3 font-mono text-sm text-gray-900">{record.punch_out || '-'}</td>
                  <td className="p-3 font-mono text-sm text-gray-900">{record.work_hours?.toFixed(2) || 0}</td>
                  <td className="p-3">
                    <span className={`px-2.5 py-1 rounded text-xs font-medium ${
                      record.status === 'Present' ? 'bg-emerald-50 text-emerald-700' :
                      record.status === 'Late' ? 'bg-amber-50 text-amber-700' :
                      record.status === 'Absent' ? 'bg-rose-50 text-rose-700' :
                      'bg-gray-200 text-gray-700'
                    }`}>
                      {record.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {attendance.length === 0 && (
          <div className="text-center py-12 text-gray-600">
            <CalendarIcon className="h-12 w-12 mx-auto mb-2 opacity-30" />
            <p>No attendance records found</p>
          </div>
        )}
      </Card>

      <Card className="p-6 border border-gray-200 bg-white overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Monthly Attendance Overview</h3>
            <p className="text-sm text-gray-600">
              {canManageAttendance
                ? 'Present vs absent summary for the selected month'
                : 'Your attendance summary for the selected month'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">Month</label>
            <input
              type="month"
              value={summaryMonth}
              onChange={(e) => setSummaryMonth(e.target.value)}
              className="h-10 rounded-lg border border-gray-300 px-3 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left p-3 text-xs uppercase tracking-wider text-gray-600 font-medium">
                  {canManageAttendance ? 'Employee' : 'Summary'}
                </th>
                <th className="text-left p-3 text-xs uppercase tracking-wider text-gray-600 font-medium">Present</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider text-gray-600 font-medium">Late</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider text-gray-600 font-medium">Half Day</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider text-gray-600 font-medium">Absent</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider text-gray-600 font-medium">Total Days</th>
              </tr>
            </thead>
            <tbody>
              {attendanceSummary.map((row) => (
                <tr key={row.employee_id} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                  <td className="p-3 text-sm text-gray-900">
                    <div className="font-medium">
                      {canManageAttendance ? row.employee_name : 'My Attendance'}
                    </div>
                    {canManageAttendance && (
                      <div className="text-xs text-gray-500">{row.employee_id}</div>
                    )}
                  </td>
                  <td className="p-3 text-sm text-emerald-700 font-medium">{row.present_days}</td>
                  <td className="p-3 text-sm text-amber-700 font-medium">{row.late_days}</td>
                  <td className="p-3 text-sm text-blue-700 font-medium">{row.half_day_days}</td>
                  <td className="p-3 text-sm text-rose-700 font-medium">{row.absent_days}</td>
                  <td className="p-3 text-sm text-gray-700 font-medium">{row.total_days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {attendanceSummary.length === 0 && (
          <div className="text-center py-8 text-gray-600">
            <p>No summary available for this month.</p>
          </div>
        )}
      </Card>
    </div>
  );
};