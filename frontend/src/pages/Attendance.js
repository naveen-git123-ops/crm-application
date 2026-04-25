import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Clock, Calendar, LogIn, LogOut, AlertCircle, User, TrendingDown, MapPin, Briefcase, Check, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths, addMonths, eachDayOfInterval, getDate, isToday as isTodayDate, isWeekend } from 'date-fns';
import { formatISTDate, formatISTDateTime } from '@/utils/date';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;
const LOGIN_START = '10:00';
const LOGIN_END = '10:30';

/** Wall-clock hour/minute in office attendance timezone (matches server default). */
const getAttendanceWallClockHM = (date, timeZone = 'Asia/Kolkata') => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  return { hour, minute };
};

const isLatePunchInNow = (date = new Date()) => {
  const { hour, minute } = getAttendanceWallClockHM(date);
  return hour > 10 || (hour === 10 && minute > 30);
};

const isLatePunchOutNow = (date = new Date()) => {
  const { hour, minute } = getAttendanceWallClockHM(date);
  return hour > 19 || (hour === 19 && minute > 0);
};

// Helper function to format punch times in IST (HH:MM:SS format)
const formatPunchTime = (punchTimeStr) => {
  if (!punchTimeStr) return '–';
  
  // If it's a full ISO timestamp, parse it and convert to IST
  if (punchTimeStr.includes('T')) {
    try {
      const date = new Date(punchTimeStr);
      // Format using Intl with IST timezone
      const istTime = new Intl.DateTimeFormat('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Asia/Kolkata'
      }).format(date);
      return istTime + ' IST';
    } catch {
      return punchTimeStr;
    }
  }
  
  // If it's just HH:MM:SS format, display as is (assuming already in IST)
  if (punchTimeStr.match(/^\d{2}:\d{2}:\d{2}$/)) {
    return punchTimeStr + ' IST';
  }
  
  // If it's HH:MM format, add seconds
  if (punchTimeStr.match(/^\d{2}:\d{2}$/)) {
    return punchTimeStr + ':00 IST';
  }
  
  return punchTimeStr;
};

// Helper function to format current time in IST (HH:MM:SS format)
const formatCurrentTimeIST = (date) => {
  if (!date) return '';
  const istTime = new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  }).format(date);
  return istTime;
};

// Helper function to format current date in IST
const formatCurrentDateIST = (date) => {
  if (!date) return '';
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(date);
};

export const Attendance = () => {
  const { user, checkTodayWorkLog } = useAuth();
  const [attendance, setAttendance] = useState([]);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [todaySessions, setTodaySessions] = useState([]);
  const [totalWorkHours, setTotalWorkHours] = useState(0);
  const [isPunchedIn, setIsPunchedIn] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [summaryMonth, setSummaryMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [attendanceSummary, setAttendanceSummary] = useState([]);
  const [report, setReport] = useState([]);
  const [lateDetails, setLateDetails] = useState([]);
  const [latePunchInRequests, setLatePunchInRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [activeTab, setActiveTab] = useState('punch'); // punch | report | late | summary | tour | grid | latepunchin
  const [reportLoading, setReportLoading] = useState(false);
  const [lateLoading, setLateLoading] = useState(false);
  const [punchLoading, setPunchLoading] = useState(false);
  const [tourPending, setTourPending] = useState([]);
  const [tourLoading, setTourLoading] = useState(false);
  const [tourStatusFilter, setTourStatusFilter] = useState('Pending');
  const [tourEmployeeFilter, setTourEmployeeFilter] = useState('');
  const [latePunchInLoading, setLatePunchInLoading] = useState(false);
  const [latePunchOutRequests, setLatePunchOutRequests] = useState([]);
  const [latePunchOutLoading, setLatePunchOutLoading] = useState(false);
  const [latePunchInStatusFilter, setLatePunchInStatusFilter] = useState('Pending');
  const [latePunchOutStatusFilter, setLatePunchOutStatusFilter] = useState('Pending');
  const [latePunchInEmployeeFilter, setLatePunchInEmployeeFilter] = useState('');
  const [latePunchOutEmployeeFilter, setLatePunchOutEmployeeFilter] = useState('');
  const [showPunchOutWorkLogDialog, setShowPunchOutWorkLogDialog] = useState(false);
  const [workLogSummary, setWorkLogSummary] = useState('');
  const [isSubmittingWorkLog, setIsSubmittingWorkLog] = useState(false);
  const [pendingPunchAction, setPendingPunchAction] = useState(null);
  const [showLateReasonDialog, setShowLateReasonDialog] = useState(false);
  const [lateReasonText, setLateReasonText] = useState('');
  const [pendingLatePunch, setPendingLatePunch] = useState(null); // { action, employeeId }

  // Grid view states
  const [gridMonth, setGridMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [gridData, setGridData] = useState({});
  const [lateLogins, setLateLogins] = useState({});  // {empId: {count: X}}
  const [gridLoading, setGridLoading] = useState(false);
  const [gridViewMode, setGridViewMode] = useState('month'); // 'today' or 'month'
  
  // Regularize states
  const [regularizeEmployee, setRegularizeEmployee] = useState('');
  const [regularizeDate, setRegularizeDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [regularizeAction, setRegularizeAction] = useState('present');
  const [regularizeLoading, setRegularizeLoading] = useState(false);
  
  // Holidays
  const [holidays, setHolidays] = useState([]);

  // Attendance permissions:
  // - Admin/HR: full attendance management (grid, regularize, report, late)
  // - Accountant: limited (grid + punch in/out only)
  const canManageAttendance = ['Admin', 'HR', 'Accountant'].includes(user?.role); // legacy flag used in logic below
  const canManageAttendanceFull = ['Admin', 'HR'].includes(user?.role);
  const canManageAttendanceGrid = ['Admin', 'HR', 'Accountant'].includes(user?.role);
  /** Employees (and others not on the admin grid) can open a personal month grid with only their rows */
  const canViewOwnAttendanceGrid = !canManageAttendanceGrid && !!user?.employee_id;
  const canApproveTour = ['Admin', 'Manager'].includes(user?.role);
  const showAttendanceTabs = canManageAttendance || canApproveTour || canViewOwnAttendanceGrid;

  const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  useEffect(() => {
    fetchEmployees();
    fetchAttendance();
    if (!canManageAttendance) {
      fetchTodayAttendanceWithSessions();
    }
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

  // Set grid view as default for admin users
  useEffect(() => {
    if (canManageAttendanceGrid) {
      setActiveTab('grid');
    }
  }, [canManageAttendanceGrid]);

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
      const year = parseInt((month || '').split('-')[0], 10);
      const [attRes, holidayRes] = await Promise.all([
        axios.get(`${API}/attendance`, { params: { month }, headers: authHeader() }),
        axios.get(`${API}/government-holidays`, { params: { year }, headers: authHeader() })
      ]);

      const records = Array.isArray(attRes.data) ? attRes.data : [];
      const holidaySet = new Set((holidayRes.data || []).map((h) => h.date));
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const allDays = eachDayOfInterval({
        start: new Date(`${month}-01`),
        end: endOfMonth(new Date(`${month}-01`))
      });

      const byEmployee = {};
      records.forEach((r) => {
        if (!byEmployee[r.employee_id]) {
          byEmployee[r.employee_id] = {
            employee_id: r.employee_id,
            employee_name:
              r.employee_name ||
              employees.find((e) => e.employee_id === r.employee_id)?.name ||
              r.employee_id,
            records: {}
          };
        }
        byEmployee[r.employee_id].records[r.date] = r;
      });

      const lateThresholdMinutes = 10 * 60 + 30;
      const rows = Object.values(byEmployee).map((emp) => {
        let totalDays = 0;
        let presentDays = 0;
        let lateDays = 0;

        allDays.forEach((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isSunday = day.getDay() === 0;
          const isHoliday = holidaySet.has(dateStr);
          const dayDate = new Date(day);
          dayDate.setHours(0, 0, 0, 0);
          const isFutureDate = dayDate > today;

          if (!isFutureDate && !isSunday && !isHoliday) {
            totalDays += 1;
            const rec = emp.records[dateStr];
            const countsAsPresent =
              (rec?.is_tour === 1 && rec?.tour_approval_status === 'approved') ||
              rec?.status === 'Present';
            if (countsAsPresent) presentDays += 1;
          }
        });

        Object.values(emp.records).forEach((rec) => {
          if (rec?.is_tour === 1) return;
          const punchIn = rec?.punch_in;
          if (!punchIn || typeof punchIn !== 'string') return;
          const parts = punchIn.split(':');
          const h = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10) || 0;
          if (Number.isNaN(h)) return;
          if (h * 60 + m > lateThresholdMinutes) lateDays += 1;
        });

        return {
          employee_id: emp.employee_id,
          employee_name: emp.employee_name,
          present_days: presentDays,
          late_days: lateDays,
          half_day_days: 0,
          absent_days: Math.max(totalDays - presentDays, 0),
          total_days: totalDays
        };
      });

      const visibleRows = canManageAttendance
        ? rows
        : rows.filter((r) => r.employee_id === user?.employee_id);
      setAttendanceSummary(visibleRows);
    } catch {
      toast.error('Failed to load summary');
    }
  };

  const fetchTodayAttendanceWithSessions = async () => {
    try {
      const res = await axios.get(`${API}/attendance/today`, { headers: authHeader() });
      const data = res.data;
      setTodayAttendance(data.attendance);
      setTodaySessions(data.sessions || []);
      setTotalWorkHours(data.total_work_hours || 0);
      setIsPunchedIn(data.is_punched_in || false);
    } catch (err) {
      console.error('Failed to fetch today attendance:', err);
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

  const fetchTourPending = async (status = tourStatusFilter) => {
    if (!canApproveTour) return;
    setTourLoading(true);
    try {
      const res = await axios.get(`${API}/attendance/tour-pending`, {
        params: { status: (status || 'Pending').toLowerCase() },
        headers: authHeader()
      });
      setTourPending(res.data);
    } catch {
      toast.error('Failed to load tour requests');
    } finally {
      setTourLoading(false);
    }
  };

  const fetchLatePunchInRequests = async (status = latePunchInStatusFilter) => {
    if (!canManageAttendanceFull) return;
    setLatePunchInLoading(true);
    try {
      const res = await axios.get(`${API}/attendance/late-punch-in-requests?status=${encodeURIComponent(status)}`, { headers: authHeader() });
      setLatePunchInRequests(res.data || []);
    } catch (err) {
      console.error('Failed to load late punch-in requests:', err);
      toast.error('Failed to load late punch-in requests');
    } finally {
      setLatePunchInLoading(false);
    }
  };

  const handleApproveLatePunchIn = async (requestId, status, reason = '') => {
    try {
      const res = await axios.post(
        `${API}/attendance/late-punch-in-approve`,
        { request_id: requestId, status, reason },
        { headers: authHeader() }
      );
      toast.success(res.data.message);
      fetchLatePunchInRequests(latePunchInStatusFilter);
      fetchAttendance();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to process request');
    }
  };

  const fetchLatePunchOutRequests = async (status = latePunchOutStatusFilter) => {
    if (!canManageAttendanceFull) return;
    setLatePunchOutLoading(true);
    try {
      const res = await axios.get(`${API}/attendance/late-punch-out-requests?status=${encodeURIComponent(status)}`, { headers: authHeader() });
      setLatePunchOutRequests(res.data || []);
    } catch (err) {
      console.error('Failed to load late punch-out requests:', err);
      toast.error('Failed to load late punch-out requests');
    } finally {
      setLatePunchOutLoading(false);
    }
  };

  const handleApproveLatePunchOut = async (requestId, status, reason = '') => {
    try {
      const res = await axios.post(
        `${API}/attendance/late-punch-out-approve`,
        { request_id: requestId, status, reason },
        { headers: authHeader() }
      );
      toast.success(res.data.message);
      fetchLatePunchOutRequests(latePunchOutStatusFilter);
      fetchAttendance();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to process request');
    }
  };

  const handleApproveAllLatePunchIn = async () => {
    const pendingRows = (latePunchInRequests || []).filter(
      (req) =>
        (req.status || req.request_status || latePunchInStatusFilter) === 'Pending' &&
        (!latePunchInEmployeeFilter || req.employee_name === latePunchInEmployeeFilter)
    );
    if (!pendingRows.length) {
      toast.error('No pending late punch-in requests to approve');
      return;
    }
    if (!window.confirm(`Approve all ${pendingRows.length} pending late punch-in request(s)?`)) return;
    setLatePunchInLoading(true);
    try {
      await Promise.all(
        pendingRows.map((req) =>
          axios.post(
            `${API}/attendance/late-punch-in-approve`,
            { request_id: req.id, status: 'Approved', reason: '' },
            { headers: authHeader() }
          )
        )
      );
      toast.success(`Approved ${pendingRows.length} late punch-in request(s)`);
      fetchLatePunchInRequests(latePunchInStatusFilter);
      fetchAttendance();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to approve all late punch-in requests');
    } finally {
      setLatePunchInLoading(false);
    }
  };

  const handleApproveAllLatePunchOut = async () => {
    const pendingRows = (latePunchOutRequests || []).filter(
      (req) =>
        (req.status || req.request_status || latePunchOutStatusFilter) === 'Pending' &&
        (!latePunchOutEmployeeFilter || req.employee_name === latePunchOutEmployeeFilter)
    );
    if (!pendingRows.length) {
      toast.error('No pending late punch-out requests to approve');
      return;
    }
    if (!window.confirm(`Approve all ${pendingRows.length} pending late punch-out request(s)?`)) return;
    setLatePunchOutLoading(true);
    try {
      await Promise.all(
        pendingRows.map((req) =>
          axios.post(
            `${API}/attendance/late-punch-out-approve`,
            { request_id: req.id, status: 'Approved', reason: '' },
            { headers: authHeader() }
          )
        )
      );
      toast.success(`Approved ${pendingRows.length} late punch-out request(s)`);
      fetchLatePunchOutRequests(latePunchOutStatusFilter);
      fetchAttendance();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to approve all late punch-out requests');
    } finally {
      setLatePunchOutLoading(false);
    }
  };

  const fetchMonthlyAttendanceGrid = async (monthStr) => {
    if (!canManageAttendanceGrid && !canViewOwnAttendanceGrid) return;
    setGridLoading(true);
    try {
      const month = monthStr || gridMonth;
      const year = parseInt(month.split('-')[0]);
      
      // Fetch attendance records
      const res = await axios.get(`${API}/attendance`, { params: { month }, headers: authHeader() });
      const gridRecords = canViewOwnAttendanceGrid && user?.employee_id
        ? res.data.filter((r) => r.employee_id === user.employee_id)
        : res.data;

      // Count late logins per employee for this month (punched in after 10:30 AM)
      const lateThresholdMinutes = 10 * 60 + 30;
      const lateLoginMap = {};
      gridRecords.forEach((record) => {
        // Tour punches are handled separately on the grid (do not count as "late logins")
        if (record.is_tour === 1) return;

        const punchIn = record.punch_in;
        if (!punchIn || typeof punchIn !== 'string') return;

        const parts = punchIn.split(':');
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) || 0;
        if (Number.isNaN(h)) return;

        const punchMinutes = h * 60 + m;
        if (punchMinutes > lateThresholdMinutes) {
          if (!lateLoginMap[record.employee_id]) {
            lateLoginMap[record.employee_id] = { count: 0 };
          }
          lateLoginMap[record.employee_id].count += 1;
        }
      });

      // Organize attendance records by employee_id and date
      const gridMap = {};
      gridRecords.forEach((record) => {
        if (!gridMap[record.employee_id]) {
          gridMap[record.employee_id] = {
            employee_id: record.employee_id,
            employee_name: record.employee_name || employees.find(e => e.employee_id === record.employee_id)?.name || record.employee_id,
            records: {}
          };
        }
        gridMap[record.employee_id].records[record.date] = record;
      });

      setLateLogins(lateLoginMap);
      
      setGridData(gridMap);
      fetchHolidays(year);
    } catch (err) {
      console.error('Failed to load monthly attendance grid:', err);
      toast.error('Failed to load attendance grid');
    } finally {
      setGridLoading(false);
    }
  };

  const fetchHolidays = async (year) => {
    try {
      const res = await axios.get(`${API}/government-holidays`, { params: { year }, headers: authHeader() });
      setHolidays(res.data.map(h => h.date));
    } catch (err) {
      console.error('Failed to load holidays:', err);
    }
  };

  const handleRegularizeAttendance = async () => {
    if (!regularizeEmployee || !regularizeDate) {
      toast.error('Please select both employee and date');
      return;
    }

    setRegularizeLoading(true);
    try {
      const payload = {
        employee_id: regularizeEmployee,
        date: regularizeDate,
        action: regularizeAction
      };
      const res = await axios.post(`${API}/attendance/regularize`, payload, { headers: authHeader() });
      toast.success(res.data?.message || 'Attendance regularized successfully');
      fetchMonthlyAttendanceGrid(gridMonth);
      setRegularizeEmployee('');
      setRegularizeDate(format(new Date(), 'yyyy-MM-dd'));
      setRegularizeAction('present');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to regularize attendance');
    } finally {
      setRegularizeLoading(false);
    }
  };

  useEffect(() => {
    if (canApproveTour && activeTab === 'tour') fetchTourPending(tourStatusFilter);
    if (canManageAttendanceFull && activeTab === 'latepunchin') fetchLatePunchInRequests(latePunchInStatusFilter);
    if (canManageAttendanceFull && activeTab === 'latepunchout') fetchLatePunchOutRequests(latePunchOutStatusFilter);
  }, [canApproveTour, canManageAttendanceFull, activeTab, user?.role, latePunchInStatusFilter, latePunchOutStatusFilter, tourStatusFilter]);

  // Auto-load report on tab open and whenever report filters change.
  useEffect(() => {
    if (canManageAttendanceFull && activeTab === 'report') {
      fetchReport();
    }
  }, [canManageAttendanceFull, activeTab, startDate, endDate, selectedEmployee]);

  useEffect(() => {
    if ((canManageAttendanceGrid || canViewOwnAttendanceGrid) && activeTab === 'grid') {
      fetchMonthlyAttendanceGrid(gridMonth);
    }
  }, [gridMonth, activeTab, canManageAttendanceGrid, canViewOwnAttendanceGrid]);

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

    // For punch_out by employees (non-admins), require work log first
    if (action === 'punch_out' && !canManageAttendance) {
      try {
        const workLogStatus = await checkTodayWorkLog();
        if (!workLogStatus?.has_logged_today) {
          // Work log not submitted, show dialog to force submission
          setWorkLogSummary('');
          setPendingPunchAction(action); // Store that we need to punch out after work log
          setShowPunchOutWorkLogDialog(true);
          return; // Stop here, don't punch out yet
        }
      } catch (err) {
        console.error('Failed to check work log:', err);
        toast.error('Unable to verify work log status');
        return;
      }
    }

    // Late punch-in / late punch-out: require reason in a dialog before calling API (all roles)
    const now = new Date();
    if (action === 'punch_in' && isLatePunchInNow(now)) {
      setPendingLatePunch({ action, employeeId });
      setLateReasonText('');
      setShowLateReasonDialog(true);
      return;
    }
    if (action === 'punch_out' && isLatePunchOutNow(now)) {
      setPendingLatePunch({ action, employeeId });
      setLateReasonText('');
      setShowLateReasonDialog(true);
      return;
    }

    await executePunch(action, employeeId, '');
  };

  const handleSubmitLateReasonAndPunch = async () => {
    const reason = lateReasonText.trim();
    if (!reason) {
      toast.error('Please enter a reason before submitting for admin approval');
      return;
    }
    if (!pendingLatePunch?.action || !pendingLatePunch?.employeeId) {
      setShowLateReasonDialog(false);
      return;
    }
    setShowLateReasonDialog(false);
    const { action, employeeId } = pendingLatePunch;
    setPendingLatePunch(null);
    setLateReasonText('');
    await executePunch(action, employeeId, reason);
  };

  const handleCancelLateReasonDialog = () => {
    setShowLateReasonDialog(false);
    setPendingLatePunch(null);
    setLateReasonText('');
  };

  const executePunch = async (action, employeeId, lateReason = '') => {
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
      if (lateReason) payload.late_reason = lateReason;
      const res = await axios.post(`${API}/attendance/punch`, payload, { headers: authHeader() });
      const msg = res.data?.message || (action === 'punch_in' ? 'Punch In recorded' : 'Punch Out recorded');
      if (res.data?.is_tour) {
        toast.info(msg);
      } else {
        toast.success(msg);
      }
      fetchAttendance();
      if (!canManageAttendance) {
        fetchTodayAttendanceWithSessions();
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Punch failed');
    } finally {
      setPunchLoading(false);
    }
  };

  const handleSubmitPunchOutWorkLog = async () => {
    if (!workLogSummary.trim()) {
      toast.error('Please enter your work summary');
      return;
    }

    setIsSubmittingWorkLog(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await axios.post(
        `${API}/daily-work-logs`,
        {
          employee_id: user.employee_id,
          employee_name: user.name,
          log_date: today,
          summary: workLogSummary.trim()
        },
        { headers: authHeader() }
      );
      toast.success('Work log submitted successfully');
      setWorkLogSummary('');
      setShowPunchOutWorkLogDialog(false);
      
      // Now execute the pending punch action (usually punch_out)
      if (pendingPunchAction) {
        const employeeId = user?.employee_id;
        setPendingPunchAction(null);
        const now = new Date();
        if (pendingPunchAction === 'punch_out' && isLatePunchOutNow(now)) {
          setPendingLatePunch({ action: 'punch_out', employeeId });
          setLateReasonText('');
          setShowLateReasonDialog(true);
        } else {
          await executePunch(pendingPunchAction, employeeId, '');
        }
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit work log');
    } finally {
      setIsSubmittingWorkLog(false);
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
      fetchTourPending(tourStatusFilter);
      fetchAttendance();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Action failed');
    }
  };

  const handleApproveAllTours = async () => {
    const pendingRows = (tourPending || []).filter(
      (row) =>
        (row.tour_approval_status || 'pending') === 'pending' &&
        (!tourEmployeeFilter || row.employee_name === tourEmployeeFilter)
    );
    if (!pendingRows.length) {
      toast.error('No pending tour requests to approve');
      return;
    }
    if (!window.confirm(`Approve all ${pendingRows.length} pending tour request(s)?`)) return;
    setTourLoading(true);
    try {
      await Promise.all(
        pendingRows.map((row) =>
          axios.post(
            `${API}/attendance/tour-approve`,
            { attendance_id: row.id, status: 'approved' },
            { headers: authHeader() }
          )
        )
      );
      toast.success(`Approved ${pendingRows.length} tour request(s)`);
      fetchTourPending(tourStatusFilter);
      fetchAttendance();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to approve all tour requests');
    } finally {
      setTourLoading(false);
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

      {/* Tabs: admin/HR/accountant full set; employees get punch + personal grid + summary */}
      {showAttendanceTabs && (
        <Card className="p-2 rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex gap-2 flex-wrap [&_button]:min-h-[44px]">
            {[
              { id: 'punch', label: 'Mark Attendance', show: true },
              { id: 'grid', label: canViewOwnAttendanceGrid ? 'My Attendance Grid' : 'Attendance Grid', show: canManageAttendanceGrid || canViewOwnAttendanceGrid },
              { id: 'regularize', label: 'Regularize', show: canManageAttendanceFull },
              { id: 'tour', label: 'Tour Requests', show: canApproveTour },
              { id: 'latepunchin', label: 'Late Punch-In Approvals', show: canManageAttendanceFull },
              { id: 'latepunchout', label: 'Late Punch-Out Approvals', show: canManageAttendanceFull },
              { id: 'report', label: 'Report (Date Range)', show: canManageAttendanceFull },
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

      {/* Attendance Grid: all staff (admin) or personal rows only (employee) */}
      {(canManageAttendanceGrid || canViewOwnAttendanceGrid) && activeTab === 'grid' && (
        <Card className="p-6 rounded-lg border border-gray-200 bg-white shadow-sm overflow-x-auto">
          <div className="mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {canViewOwnAttendanceGrid ? 'My Attendance Grid' : 'Attendance Grid'}
                </h3>
                <p className="text-sm text-gray-600">
                  {canViewOwnAttendanceGrid
                    ? 'Your month at a glance: present, late logins, tours, leave, and pending approvals.'
                    : "View all employees' attendance for the month at a glance"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={gridViewMode === 'today' ? 'default' : 'outline'}
                  onClick={() => setGridViewMode('today')}
                  className={gridViewMode === 'today' ? 'bg-blue-600 text-white' : 'border-gray-300'}
                >
                  Today
                </Button>
                <Button
                  size="sm"
                  variant={gridViewMode === 'month' ? 'default' : 'outline'}
                  onClick={() => setGridViewMode('month')}
                  className={gridViewMode === 'month' ? 'bg-blue-600 text-white' : 'border-gray-300'}
                >
                  This Month
                </Button>
              </div>
            </div>

            {/* Month Navigation */}
            {gridViewMode === 'month' && (
              <div className="flex items-center justify-between gap-4 mb-4">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setGridMonth(format(subMonths(new Date(gridMonth + '-01'), 1), 'yyyy-MM'))}
                  className="border-gray-300"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">Month:</label>
                  <input
                    type="month"
                    value={gridMonth}
                    onChange={(e) => setGridMonth(e.target.value)}
                    className="h-10 rounded-lg border border-gray-300 px-3 text-sm text-gray-900"
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setGridMonth(format(addMonths(new Date(gridMonth + '-01'), 1), 'yyyy-MM'))}
                  className="border-gray-300"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Color Legend */}
            <div className="flex flex-wrap gap-4 text-sm mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-500 rounded"></div>
                <span className="text-gray-700">Present</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-yellow-500 rounded"></div>
                <span className="text-gray-700">Late Login</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-pink-400 rounded"></div>
                <span className="text-gray-700">Approved Tour</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-500 rounded"></div>
                <span className="text-gray-700">Absent</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-400 rounded"></div>
                <span className="text-gray-700">On Leave</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-300 rounded"></div>
                <span className="text-gray-700">Sunday / Holiday</span>
              </div>
            </div>
          </div>

          {gridLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-600 border-t-transparent" />
            </div>
          ) : gridViewMode === 'today' ? (
            // Today's attendance view
            <div className="space-y-3">
              {(canManageAttendanceGrid ? employees : user?.employee_id ? [{ employee_id: user.employee_id, name: user.name }] : []).length === 0 ? (
                <p className="text-center py-8 text-gray-500">No employee data available.</p>
              ) : (
                (canManageAttendanceGrid ? employees : [{ employee_id: user.employee_id, name: user.name }]).map((emp) => {
                  const todayStr = format(new Date(), 'yyyy-MM-dd');
                  const todayRecord = gridData[emp.employee_id]?.records[todayStr];
                  let bgColor = 'bg-red-500';
                  if (todayRecord) {
                    if (todayRecord.is_tour === 1 && todayRecord.tour_approval_status === 'approved') {
                      bgColor = 'bg-pink-400';
                    } else if (todayRecord.status === 'Present') {
                      bgColor = 'bg-green-500';
                    } else if (todayRecord.status === 'Late') {
                      bgColor = 'bg-yellow-500';
                    } else if (todayRecord.status === 'Incomplete') {
                      bgColor = 'bg-orange-400';
                    } else if (todayRecord.status === 'Pending Approval') {
                      bgColor = 'bg-purple-500';
                    } else if (todayRecord.status === 'Leave') {
                      bgColor = 'bg-blue-400';
                    } else if (todayRecord.is_tour === 1) {
                      // Non-approved or rejected tour
                      bgColor = 'bg-red-500';
                    } else {
                      bgColor = 'bg-red-500';
                    }
                  }
                  const textColor = ['bg-yellow-500', 'bg-orange-400'].includes(bgColor) ? 'text-gray-800' : 'text-white';
                  return (
                    <div key={emp.employee_id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex-shrink-0 w-48">
                        <p className="text-sm font-medium text-gray-900">{emp.name}</p>
                        <p className="text-xs text-gray-500">{emp.employee_id}</p>
                      </div>
                      <div className={`flex-1 h-10 rounded flex items-center justify-center font-semibold ${bgColor} ${textColor} text-sm`}>
                        {todayRecord?.is_tour === 1 ? (todayRecord?.tour_approval_status === 'approved' ? 'Tour (Approved)' : 'Tour (Pending)') : (todayRecord?.status || 'Absent')}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            // Month grid view
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-gray-100 p-2 text-left font-semibold text-gray-700 border border-gray-200 min-w-[150px]">Employee</th>
                    {(() => {
                      const year = parseInt(gridMonth.split('-')[0]);
                      const month = parseInt(gridMonth.split('-')[1]);
                      const monthStart = new Date(year, month - 1, 1);
                      const monthEnd = endOfMonth(monthStart);
                      const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
                      return days.map((day) => {
                        const dateStr = format(day, 'yyyy-MM-dd');
                        const isSunday = day.getDay() === 0;
                        const isHoliday = holidays.includes(dateStr);
                        return (
                          <th
                            key={dateStr}
                            className={`p-1 sm:p-2 text-center font-medium border border-gray-200 min-w-[40px] ${
                              isSunday || isHoliday ? 'bg-blue-200 text-blue-700' :
                              isWeekend(day) ? 'bg-gray-100 text-gray-500' : 'bg-white text-gray-700'
                            }`}
                            title={format(day, 'EEEE, MMM dd')}
                          >
                            <div className="text-xs">{getDate(day)}</div>
                          </th>
                        );
                      });
                    })()}
                    <th className="bg-gray-100 p-2 text-center font-semibold text-gray-700 border border-gray-200 min-w-[120px]">
                      Present / Days
                    </th>
                    <th className="bg-gray-100 p-2 text-center font-semibold text-gray-700 border border-gray-200 min-w-[100px]">
                      Tours
                    </th>
                    <th className="bg-gray-100 p-2 text-center font-semibold text-gray-700 border border-gray-200 min-w-[140px]">
                      Late Logins
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(gridData).length === 0 ? (
                    <tr>
                      <td colSpan="40" className="p-4 text-center text-gray-500">
                        No attendance data yet for this month.
                      </td>
                    </tr>
                  ) : (
                    Object.values(gridData).map((empData) => (
                      <tr key={empData.employee_id}>
                        <td className="sticky left-0 z-10 bg-gray-50 p-3 text-left font-medium text-gray-900 border border-gray-200 min-w-[150px]">
                          <div>{empData.employee_name}</div>
                        </td>
                        {(() => {
                          const year = parseInt(gridMonth.split('-')[0]);
                          const month = parseInt(gridMonth.split('-')[1]);
                          const monthStart = new Date(year, month - 1, 1);
                          const monthEnd = endOfMonth(monthStart);
                          const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
                          let totalWorkingDays = 0;
                          let presentDays = 0;
                          let tourCount = 0;
                          let lateLoginCount = 0;

                          const cells = days.map((day) => {
                            const dateStr = format(day, 'yyyy-MM-dd');
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            const dayDate = new Date(day);
                            dayDate.setHours(0, 0, 0, 0);
                            const isFutureDate = dayDate > today;
                            const isSunday = day.getDay() === 0;
                            const isHoliday = holidays.includes(dateStr);
                            const record = empData.records[dateStr];
                            
                            let bgColor = 'bg-gray-300';
                            let statusText = '';
                            
                            // Check for Sunday or Holiday first
                            if (isSunday || isHoliday) {
                              bgColor = 'bg-blue-300';
                              statusText = isSunday ? 'Sunday' : 'Holiday';
                            } else if (record) {
                              // Check for tour status
                              if (record.is_tour === 1) {
                                if (record.tour_approval_status === 'approved') {
                                  statusText = 'Tour (Approved)';
                                  bgColor = 'bg-pink-400';
                                } else {
                                  // Non-approved or rejected tour
                                  statusText = 'Tour (Pending)';
                                  bgColor = 'bg-red-500';
                                }
                              } else if (record.status === 'Leave') {
                                statusText = 'Leave';
                                bgColor = 'bg-blue-400';
                              } else if (record.status === 'Present') {
                                statusText = 'Present';
                                bgColor = 'bg-green-500';
                              } else if (record.status === 'Late') {
                                statusText = 'Late (approval pending)';
                                bgColor = 'bg-yellow-500';
                              } else if (record.status === 'Incomplete') {
                                statusText = 'Checked in (no punch-out yet)';
                                bgColor = 'bg-orange-400';
                              } else if (record.status === 'Pending Approval') {
                                statusText = 'Pending approval';
                                bgColor = 'bg-purple-500';
                              } else {
                                statusText = record.status;
                                bgColor = 'bg-red-500';
                              }
                            } else if (isFutureDate) {
                              statusText = 'No Data';
                              bgColor = 'bg-gray-300';
                            } else {
                              statusText = 'Absent';
                              bgColor = 'bg-red-500';
                            }

                            // Summary calculation:
                            // Count working days as non-future, non-sunday, non-holiday days.
                            if (!isFutureDate && !isSunday && !isHoliday) {
                              totalWorkingDays += 1;
                              const countsAsPresent =
                                (record?.is_tour === 1 && record?.tour_approval_status === 'approved') ||
                                record?.status === 'Present';
                              if (countsAsPresent) presentDays += 1;
                              
                              // Count tours
                              if (record?.is_tour === 1 && record?.tour_approval_status === 'approved') {
                                tourCount += 1;
                              }
                            }
                          
                          // Get late login count for this employee for this month
                          lateLoginCount = lateLogins[empData.employee_id]?.count || 0;
                            
                            return (
                              <td
                                key={dateStr}
                                className={`p-2 border border-gray-200 text-center cursor-default hover:opacity-80 transition-opacity ${
                                  isWeekend(day) ? 'bg-gray-50' : 'bg-white'
                                }`}
                                title={`${empData.employee_name} - ${format(day, 'EEEE, MMM dd')}: ${statusText}`}
                              >
                                <div className={`w-8 h-8 rounded mx-auto ${bgColor}`}></div>
                              </td>
                            );
                          });

                          return (
                            <>
                              {cells}
                              <td className="p-2 border border-gray-200 text-center bg-gray-50 font-semibold text-gray-900 whitespace-nowrap">
                                {presentDays} / {totalWorkingDays}
                              </td>
                              <td className="p-2 border border-gray-200 text-center bg-gray-50 font-semibold text-pink-600 whitespace-nowrap">
                                {tourCount}
                              </td>
                              <td className="p-2 border border-gray-200 text-center bg-gray-50 font-semibold text-green-600 whitespace-nowrap">
                                {lateLoginCount}
                              </td>
                            </>
                          );
                        })()}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Regularize Attendance - Admin only */}
      {canManageAttendanceFull && activeTab === 'regularize' && (
        <Card className="p-6 rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Regularize Attendance</h3>
            <p className="text-sm text-gray-600 mt-1">Mark an employee as present for a specific date with standard office hours (10:00 AM - 6:00 PM)</p>
          </div>

          <div className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Employee*</label>
              <select
                value={regularizeEmployee}
                onChange={(e) => setRegularizeEmployee(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              >
                <option value="">Choose an employee</option>
                {employees.map((emp) => (
                  <option key={emp.employee_id} value={emp.employee_id}>
                    {emp.name} ({emp.employee_id})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Date*</label>
              <input
                type="date"
                value={regularizeDate}
                onChange={(e) => setRegularizeDate(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Action*</label>
              <select
                value={regularizeAction}
                onChange={(e) => setRegularizeAction(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              >
                <option value="present">Mark Present</option>
                <option value="absent">Mark Absent</option>
              </select>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
              <p className="text-blue-900">
                <strong>Note:</strong>{' '}
                {regularizeAction === 'present'
                  ? 'Mark Present sets standard office timings:'
                  : 'Mark Absent clears punch-in/out and sets work hours to 0.'}
              </p>
              {regularizeAction === 'present' && (
                <ul className="text-blue-800 mt-2 list-disc list-inside space-y-1">
                  <li>Punch In: 10:00 AM</li>
                  <li>Punch Out: 6:00 PM</li>
                </ul>
              )}
            </div>

            <Button
              size="lg"
              className={`w-full h-12 text-white font-semibold min-h-[48px] ${
                regularizeAction === 'present'
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
              onClick={handleRegularizeAttendance}
              disabled={!regularizeEmployee || !regularizeDate || regularizeLoading}
            >
              {regularizeLoading ? (
                <span className="flex items-center gap-2 justify-center">
                  <span className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                  Regularizing...
                </span>
              ) : (
                regularizeAction === 'present' ? 'Mark Present' : 'Mark Absent'
              )}
            </Button>
          </div>
        </Card>
      )}

      {/* Punch In/Out - punch tab when tabs shown; always when no tab bar */}
      {(activeTab === 'punch' || !showAttendanceTabs) && (
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
              disabled={canManageAttendance ? (todayAttendance?.is_active_session === 1 || punchLoading) : (isPunchedIn || punchLoading)}
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
              disabled={canManageAttendance ? (!todayAttendance || todayAttendance.is_active_session !== 1 || punchLoading) : (!isPunchedIn || punchLoading)}
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
            <div className="mt-6 space-y-4">
              {/* Summary Cards */}
              <div className="p-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg border border-blue-200 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-gray-600 text-xs uppercase font-semibold">First Punch In</p>
                  <p className="font-mono font-bold text-blue-900 text-lg">{formatPunchTime(todayAttendance.punch_in)}</p>
                </div>
                <div>
                  <p className="text-gray-600 text-xs uppercase font-semibold">Last Punch Out</p>
                  <p className="font-mono font-bold text-blue-900 text-lg">{formatPunchTime(todayAttendance.punch_out)}</p>
                </div>
                <div>
                  <p className="text-gray-600 text-xs uppercase font-semibold">Total Work Hours</p>
                  <p className="font-mono font-bold text-blue-900 text-lg">{totalWorkHours?.toFixed(2) ?? 0} hrs</p>
                </div>
                <div>
                  <p className="text-gray-600 text-xs uppercase font-semibold">Status</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                        todayAttendance.status === 'Present' ? 'bg-green-100 text-green-700' :
                        todayAttendance.status === 'Late' ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-200 text-gray-700'
                      }`}
                    >
                      {todayAttendance.status}
                    </span>
                    {isPunchedIn && <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-700"><span className="h-2 w-2 bg-green-600 rounded-full animate-pulse"></span>Active</span>}
                  </div>
                </div>
              </div>

              {/* Sessions History */}
              {todaySessions.length > 0 && (
                <div className="p-4 bg-white rounded-lg border border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Work Sessions ({todaySessions.length})</h4>
                  <div className="space-y-2">
                    {todaySessions.map((session, idx) => (
                      <div key={session.id} className="flex items-start justify-between p-3 bg-gray-50 rounded border border-gray-200 text-sm">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">Session {session.session_number}</p>
                          <p className="text-gray-600 text-xs">
                            <span className="font-mono">{formatPunchTime(session.punch_in)}</span>
                            {session.punch_out && <> → <span className="font-mono">{formatPunchTime(session.punch_out)}</span></>}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-gray-900">{session.work_hours.toFixed(2)} hrs</p>
                          {session.is_tour === 1 && <p className="text-xs text-amber-600">Tour</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {todayAttendance.is_tour === 1 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-900">Tour (Official Travel)</p>
                    <p className="text-xs text-amber-700">Status: <span className="font-semibold capitalize">{todayAttendance.tour_approval_status || 'Pending'}</span></p>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Tour Requests - Admin/Manager */}
      {canApproveTour && activeTab === 'tour' && (
        <Card className="p-6 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-amber-600" />
                Tour Requests (Punch outside office)
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Employees who punched in/out outside 50 m of office. View pending/approved/rejected history.
              </p>
            </div>
            <Button
              size="sm"
              className="bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => fetchTourPending(tourStatusFilter)}
              disabled={tourLoading}
            >
              {tourLoading ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>

          <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex gap-2">
              {['Pending', 'Approved', 'Rejected'].map((status) => (
                <Button
                  key={status}
                  size="sm"
                  variant={tourStatusFilter === status ? 'default' : 'outline'}
                  className={tourStatusFilter === status ? 'bg-blue-600 text-white' : 'border-gray-300'}
                  onClick={() => setTourStatusFilter(status)}
                >
                  {status}
                </Button>
              ))}
            </div>
            <div className="sm:ml-auto flex items-center gap-2">
              <select
                value={tourEmployeeFilter}
                onChange={(e) => setTourEmployeeFilter(e.target.value)}
                className="h-9 rounded-lg border border-gray-300 px-3 text-sm text-gray-900 bg-white min-w-[220px]"
              >
                <option value="">All employees</option>
                {Array.from(new Set((tourPending || []).map((r) => r.employee_name).filter(Boolean))).sort().map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              {tourStatusFilter === 'Pending' && (
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={handleApproveAllTours}
                  disabled={tourLoading}
                >
                  Approve All Pending
                </Button>
              )}
            </div>
          </div>

          {tourLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-600 border-t-transparent" />
            </div>
          ) : tourPending.filter((row) => !tourEmployeeFilter || row.employee_name === tourEmployeeFilter).length === 0 ? (
            <p className="text-center py-8 text-gray-500">No {tourStatusFilter.toLowerCase()} tour requests.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Date</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Employee</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Punch In (IST)</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Punch Out (IST)</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Hours</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Approval Status</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tourPending
                    .filter((row) => !tourEmployeeFilter || row.employee_name === tourEmployeeFilter)
                    .map((row) => (
                    (() => {
                      const effectiveTourStatus = (row.tour_approval_status || tourStatusFilter || 'Pending').toLowerCase();
                      return (
                    <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                      <td className="py-3 px-4 font-medium text-gray-900">{row.date}</td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-gray-900">{row.employee_name}</span>
                        <span className="text-xs text-gray-500 block">{row.employee_id}</span>
                      </td>
                      <td className="py-3 px-4 font-mono text-gray-700">{formatPunchTime(row.punch_in)}</td>
                      <td className="py-3 px-4 font-mono text-gray-700">{formatPunchTime(row.punch_out)}</td>
                      <td className="py-3 px-4 font-mono text-gray-700">{row.work_hours?.toFixed(2) ?? '–'} hrs</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                            effectiveTourStatus === 'approved'
                              ? 'bg-green-100 text-green-700'
                              : effectiveTourStatus === 'rejected'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-yellow-100 text-yellow-700'
                          }`}
                        >
                          {effectiveTourStatus.charAt(0).toUpperCase() + effectiveTourStatus.slice(1)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {effectiveTourStatus === 'pending' ? (
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
                        ) : (
                          <span className="text-xs text-gray-500">Already processed</span>
                        )}
                      </td>
                    </tr>
                      );
                    })()
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Late Punch-In Requests - Admin / HR */}
      {canManageAttendanceFull && activeTab === 'latepunchin' && (
        <Card className="p-6 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Late Punch-In Approval Requests</h3>
              <p className="text-sm text-gray-600">
                Employees who punched in after 10:30 AM. Each request includes the <strong>reason</strong> they entered before punching.
              </p>
            </div>
            <Button 
              size="sm" 
              className="bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => fetchLatePunchInRequests(latePunchInStatusFilter)}
              disabled={latePunchInLoading}
            >
              {latePunchInLoading ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>

          <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex gap-2">
              {['Pending', 'Approved', 'Rejected'].map((status) => (
                <Button
                  key={status}
                  size="sm"
                  variant={latePunchInStatusFilter === status ? 'default' : 'outline'}
                  className={latePunchInStatusFilter === status ? 'bg-blue-600 text-white' : 'border-gray-300'}
                  onClick={() => setLatePunchInStatusFilter(status)}
                >
                  {status}
                </Button>
              ))}
            </div>
            <div className="sm:ml-auto">
              <div className="flex items-center gap-2">
                <select
                  value={latePunchInEmployeeFilter}
                  onChange={(e) => setLatePunchInEmployeeFilter(e.target.value)}
                  className="h-9 rounded-lg border border-gray-300 px-3 text-sm text-gray-900 bg-white min-w-[220px]"
                >
                  <option value="">All employees</option>
                  {Array.from(new Set((latePunchInRequests || []).map((r) => r.employee_name).filter(Boolean))).sort().map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                {latePunchInStatusFilter === 'Pending' && (
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={handleApproveAllLatePunchIn}
                    disabled={latePunchInLoading}
                  >
                    Approve All Pending
                  </Button>
                )}
              </div>
            </div>
          </div>

          {latePunchInLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : latePunchInRequests.filter((req) => !latePunchInEmployeeFilter || req.employee_name === latePunchInEmployeeFilter).length === 0 ? (
            <p className="text-center py-8 text-gray-500">No {latePunchInStatusFilter.toLowerCase()} late punch-in requests.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Date</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Employee</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 min-w-[220px]">Employee reason</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Punch In Time</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Minutes Late</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Status</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Requested</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {latePunchInRequests
                    .filter((req) => !latePunchInEmployeeFilter || req.employee_name === latePunchInEmployeeFilter)
                    .map((req) => {
                    const employeeReason = (req.employee_reason || req.employeeReason || '').trim();
                    const status = req.status || req.request_status || latePunchInStatusFilter;
                    return (
                    <tr key={req.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                      <td className="py-3 px-4 font-mono text-gray-900">{req.punch_in_date}</td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-gray-900">{req.employee_name}</span>
                        <span className="text-xs text-gray-500 block">{req.employee_id}</span>
                      </td>
                      <td className="py-3 px-4 align-top max-w-[360px]">
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 whitespace-pre-wrap break-words">
                          {employeeReason || <span className="text-amber-700 font-medium">No reason on file — contact employee or check app version.</span>}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-gray-900">{formatPunchTime(req.punch_in_time)}</td>
                      <td className="py-3 px-4">
                        <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-700">
                          {req.minutes_late !== null && req.minutes_late !== undefined ? req.minutes_late : '0'} min
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                          status === 'Approved'
                            ? 'bg-green-100 text-green-700'
                            : status === 'Rejected'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-500">
                        {new Date(req.requested_at).toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        {status === 'Pending' ? (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 text-white h-8"
                              onClick={() => handleApproveLatePunchIn(req.id, 'Approved')}
                            >
                              <Check className="h-4 w-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-red-300 text-red-700 hover:bg-red-50 h-8"
                              onClick={() => handleApproveLatePunchIn(req.id, 'Rejected')}
                            >
                              <X className="h-4 w-4 mr-1" />
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500">Already processed</span>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Late Punch-Out Requests - Admin / HR */}
      {canManageAttendanceFull && activeTab === 'latepunchout' && (
        <Card className="p-6 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Late Punch-Out Approval Requests</h3>
              <p className="text-sm text-gray-600">
                Employees who punched out after 7:00 PM. Each request includes the <strong>reason</strong> they entered before punching out.
              </p>
            </div>
            <Button 
              size="sm" 
              className="bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => fetchLatePunchOutRequests(latePunchOutStatusFilter)}
              disabled={latePunchOutLoading}
            >
              {latePunchOutLoading ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>

          <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex gap-2">
              {['Pending', 'Approved', 'Rejected'].map((status) => (
                <Button
                  key={status}
                  size="sm"
                  variant={latePunchOutStatusFilter === status ? 'default' : 'outline'}
                  className={latePunchOutStatusFilter === status ? 'bg-blue-600 text-white' : 'border-gray-300'}
                  onClick={() => setLatePunchOutStatusFilter(status)}
                >
                  {status}
                </Button>
              ))}
            </div>
            <div className="sm:ml-auto">
              <div className="flex items-center gap-2">
                <select
                  value={latePunchOutEmployeeFilter}
                  onChange={(e) => setLatePunchOutEmployeeFilter(e.target.value)}
                  className="h-9 rounded-lg border border-gray-300 px-3 text-sm text-gray-900 bg-white min-w-[220px]"
                >
                  <option value="">All employees</option>
                  {Array.from(new Set((latePunchOutRequests || []).map((r) => r.employee_name).filter(Boolean))).sort().map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                {latePunchOutStatusFilter === 'Pending' && (
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={handleApproveAllLatePunchOut}
                    disabled={latePunchOutLoading}
                  >
                    Approve All Pending
                  </Button>
                )}
              </div>
            </div>
          </div>

          {latePunchOutLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : latePunchOutRequests.filter((req) => !latePunchOutEmployeeFilter || req.employee_name === latePunchOutEmployeeFilter).length === 0 ? (
            <p className="text-center py-8 text-gray-500">No {latePunchOutStatusFilter.toLowerCase()} late punch-out requests.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Date</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Employee</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 min-w-[220px]">Employee reason</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Punch Out Time</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Minutes Late</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Status</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Requested</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {latePunchOutRequests
                    .filter((req) => !latePunchOutEmployeeFilter || req.employee_name === latePunchOutEmployeeFilter)
                    .map((req) => {
                    const employeeReason = (req.employee_reason || req.employeeReason || '').trim();
                    const status = req.status || req.request_status || latePunchOutStatusFilter;
                    return (
                    <tr key={req.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                      <td className="py-3 px-4 font-mono text-gray-900">{req.punch_out_date}</td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-gray-900">{req.employee_name}</span>
                        <span className="text-xs text-gray-500 block">{req.employee_id}</span>
                      </td>
                      <td className="py-3 px-4 align-top max-w-[360px]">
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 whitespace-pre-wrap break-words">
                          {employeeReason || <span className="text-amber-700 font-medium">No reason on file — contact employee or check app version.</span>}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-gray-700">{req.punch_out_time}</td>
                      <td className="py-3 px-4">
                        <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-orange-100 text-orange-700">
                          {req.minutes_late} min
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                          status === 'Approved'
                            ? 'bg-green-100 text-green-700'
                            : status === 'Rejected'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-500">
                        {new Date(req.requested_at).toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        {status === 'Pending' ? (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 text-white h-8"
                              onClick={() => handleApproveLatePunchOut(req.id, 'Approved')}
                            >
                              <Check className="h-4 w-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-red-300 text-red-700 hover:bg-red-50 h-8"
                              onClick={() => handleApproveLatePunchOut(req.id, 'Rejected')}
                            >
                              <X className="h-4 w-4 mr-1" />
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500">Already processed</span>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Report by date range - Admin/HR */}
      {canManageAttendanceFull && activeTab === 'report' && (
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
                  <th className="text-left p-3 font-medium text-gray-700">Punch In (IST)</th>
                  <th className="text-left p-3 font-medium text-gray-700">Punch Out (IST)</th>
                  <th className="text-left p-3 font-medium text-gray-700">Hours</th>
                  <th className="text-left p-3 font-medium text-gray-700">Status</th>
                </tr>
              </thead>
              <tbody>
                {report.map((row, idx) => (
                  <tr key={`${row.date}-${row.employee_id}-${idx}`} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-3 font-mono text-gray-900">{row.date}</td>
                    <td className="p-3 text-gray-900">{row.employee_name}</td>
                    <td className="p-3 font-mono text-gray-700">{formatPunchTime(row.punch_in)}</td>
                    <td className="p-3 font-mono text-gray-700">{formatPunchTime(row.punch_out)}</td>
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

      {/* Monthly summary - summary tab when tabs shown; always for employees without tab bar */}
      {(activeTab === 'summary' || (!showAttendanceTabs && !canManageAttendance)) && (
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

      {/* Recent attendance history - employees: only on punch tab when tab bar exists */}
      {!canManageAttendance && (!showAttendanceTabs || activeTab === 'punch') && (
        <Card className="p-6 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent History</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left p-3 text-gray-600 font-medium">Date</th>
                  <th className="text-left p-3 text-gray-600 font-medium">Punch In (IST)</th>
                  <th className="text-left p-3 text-gray-600 font-medium">Punch Out (IST)</th>
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
                      <td className="p-3 font-mono text-gray-700">{formatPunchTime(record.punch_in)}</td>
                      <td className="p-3 font-mono text-gray-700">{formatPunchTime(record.punch_out)}</td>
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

      {/* Punch Out Work Log Dialog - MANDATORY */}
      {/* Late punch-in / punch-out reason — required before admin approval request */}
      <Dialog open={showLateReasonDialog} onOpenChange={(open) => { if (!open) handleCancelLateReasonDialog(); }}>
        <DialogContent className="sm:max-w-md bg-white rounded-lg border border-gray-200 shadow-xl p-0 pointer-events-auto">
          <div className="bg-blue-600 text-white p-5 rounded-t-lg">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                {pendingLatePunch?.action === 'punch_out' ? 'Late punch-out' : 'Late punch-in'}
              </DialogTitle>
              <DialogDescription className="text-blue-100 text-sm mt-1">
                Enter a reason below. Your request is sent to admin only after you submit this form.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="space-y-3 p-5">
            <Label htmlFor="late-reason-text" className="text-sm font-semibold text-gray-900">
              Reason (required) *
            </Label>
            <textarea
              id="late-reason-text"
              value={lateReasonText}
              onChange={(e) => setLateReasonText(e.target.value)}
              rows={4}
              placeholder="e.g. Client meeting ran over, production issue, traffic, approved overtime…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-2 justify-end p-5 border-t border-gray-200 bg-gray-50">
            <Button type="button" variant="outline" className="border-gray-300" onClick={handleCancelLateReasonDialog} disabled={punchLoading}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-blue-600 text-white hover:bg-blue-700"
              onClick={handleSubmitLateReasonAndPunch}
              disabled={punchLoading || !lateReasonText.trim()}
            >
              {punchLoading ? 'Submitting…' : 'Submit for approval'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showPunchOutWorkLogDialog} onOpenChange={() => {}} >
        <DialogContent className="sm:max-w-md bg-white rounded-lg border border-gray-200 shadow-xl p-0 pointer-events-auto">
          <div className="bg-amber-600 text-white p-6 rounded-t-lg">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Work Log Required Before Punch Out
              </DialogTitle>
              <DialogDescription className="text-amber-100 text-sm mt-1">
                You must submit your work summary before you can punch out. This is mandatory.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-4 p-6">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              <p className="font-semibold">📋 Please describe what you worked on today</p>
              <p className="text-xs text-amber-700 mt-1">Include tasks completed, achievements, and any blockers or challenges faced.</p>
            </div>
            <div>
              <Label htmlFor="punch-work-summary" className="text-sm font-semibold text-gray-900 block mb-2">
                Today's Work Summary *
              </Label>
              <textarea
                id="punch-work-summary"
                value={workLogSummary}
                onChange={(e) => setWorkLogSummary(e.target.value)}
                placeholder="E.g., Completed bug fixes for feature X, attended team meeting, started documentation for API..."
                rows={4}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">{workLogSummary.trim().length} characters entered</p>
            </div>
          </div>

          <div className="flex gap-3 justify-end p-6 border-t border-gray-200 bg-gray-50">
            <Button
              className="bg-amber-600 text-white hover:bg-amber-700 px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleSubmitPunchOutWorkLog}
              disabled={isSubmittingWorkLog || !workLogSummary.trim()}
            >
              {isSubmittingWorkLog ? (
                <>
                  <span className="inline-block animate-spin mr-2">⏳</span>
                  Submitting...
                </>
              ) : (
                'Submit & Punch Out'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

