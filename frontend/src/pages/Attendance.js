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
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

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
      
      // Check today's attendance
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const todayRecord = response.data.find(
        record => record.employee_id === selectedEmployee && record.date === todayStr
      );
      setTodayAttendance(todayRecord || null);
    } catch (error) {
      toast.error('Failed to load attendance');
    } finally {
      setLoading(false);
    }
  };

  const handlePunch = async (action) => {
    if (!selectedEmployee) {
      toast.error('Please select an employee');
      return;
    }

    try {
      const response = await axios.post(`${API}/attendance/punch`, {
        employee_id: selectedEmployee,
        action: action
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

  const canManageAttendance = ['Admin', 'HR', 'Manager'].includes(user?.role);

  return (
    <div className="space-y-6" data-testid="attendance-page">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Attendance</h1>
        <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">Track daily attendance and work hours</p>
      </div>

      {/* Current Time */}
      <Card className="p-6 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-2">Current Time</p>
            <p className="text-5xl font-bold font-mono tracking-tight text-indigo-600 dark:text-indigo-400">{format(currentTime, 'HH:mm:ss')}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">{format(currentTime, 'EEEE, MMMM d, yyyy')}</p>
          </div>
          <Clock className="h-16 w-16 text-slate-300 dark:text-slate-700 opacity-50" />
        </div>
      </Card>

      {/* Punch In/Out */}
      <Card className="p-6 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-4">Mark Attendance</h3>
        
        {canManageAttendance && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Select Employee</label>
            <select
              data-testid="employee-select"
              value={selectedEmployee || ''}
              onChange={(e) => setSelectedEmployee(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-50 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400 transition-all"
            >
              <option value="">Select an employee</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.employee_id})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Button
            size="lg"
            className="h-20 text-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700"
            onClick={() => handlePunch('punch_in')}
            disabled={todayAttendance !== null}
            data-testid="punch-in-button"
          >
            <LogIn className="h-6 w-6 mr-2" />
            Punch In
          </Button>
          <Button
            size="lg"
            className="h-20 text-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold"
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
          <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-slate-600 dark:text-slate-400 text-xs">Punch In</p>
                <p className="font-mono font-medium text-slate-900 dark:text-slate-50">{todayAttendance.punch_in || '-'}</p>
              </div>
              <div>
                <p className="text-slate-600 dark:text-slate-400 text-xs">Punch Out</p>
                <p className="font-mono font-medium text-slate-900 dark:text-slate-50">{todayAttendance.punch_out || '-'}</p>
              </div>
              <div>
                <p className="text-slate-600 dark:text-slate-400 text-xs">Work Hours</p>
                <p className="font-mono font-medium text-slate-900 dark:text-slate-50">{todayAttendance.work_hours?.toFixed(2) || 0} hrs</p>
              </div>
              <div>
                <p className="text-slate-600 dark:text-slate-400 text-xs mb-1">Status</p>
                <span className={`px-2.5 py-1 rounded text-xs font-medium ${
                  todayAttendance.status === 'Present' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' :
                  todayAttendance.status === 'Late' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300' :
                  'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                }`}>
                  {todayAttendance.status}
                </span>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Attendance History */}
      <Card className="p-6 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-4">Attendance History</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="text-left p-3 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-400 font-medium">Date</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-400 font-medium">Employee</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-400 font-medium">Punch In</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-400 font-medium">Punch Out</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-400 font-medium">Hours</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-400 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {attendance
                .filter(record => canManageAttendance || record.employee_id === selectedEmployee)
                .slice(0, 20)
                .map((record) => (
                <tr key={record.id} className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" data-testid={`attendance-row-${record.id}`}>
                  <td className="p-3 font-mono text-sm text-slate-900 dark:text-slate-50">{record.date}</td>
                  <td className="p-3 text-sm text-slate-900 dark:text-slate-50">{record.employee_name}</td>
                  <td className="p-3 font-mono text-sm text-slate-900 dark:text-slate-50">{record.punch_in || '-'}</td>
                  <td className="p-3 font-mono text-sm text-slate-900 dark:text-slate-50">{record.punch_out || '-'}</td>
                  <td className="p-3 font-mono text-sm text-slate-900 dark:text-slate-50">{record.work_hours?.toFixed(2) || 0}</td>
                  <td className="p-3">
                    <span className={`px-2.5 py-1 rounded text-xs font-medium ${
                      record.status === 'Present' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' :
                      record.status === 'Late' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300' :
                      record.status === 'Absent' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300' :
                      'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
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
          <div className="text-center py-12 text-slate-600 dark:text-slate-400">
            <CalendarIcon className="h-12 w-12 mx-auto mb-2 opacity-30" />
            <p>No attendance records found</p>
          </div>
        )}
      </Card>
    </div>
  );
};