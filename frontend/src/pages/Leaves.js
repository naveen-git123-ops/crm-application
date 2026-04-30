import React, { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import {
  StandardAppDialogContent,
  StandardAppDialogHeader,
  StandardAppDialogBody,
  StandardAppDialogFooter,
  standardCancelButtonClass,
  standardPrimaryButtonClass,
} from '@/components/StandardAppDialog';
import FilePreviewSimple from '@/components/FilePreviewSimple';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  Plus,
  Check,
  X,
  Clock,
  Calendar,
  Settings2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  User,
  Image as ImageIcon,
  Eye
} from 'lucide-react';
import {
  format,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isWithinInterval,
  parseISO
} from 'date-fns';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

const formatLeaveRange = (start, end, days) => {
  try {
    const s = parseISO(String(start));
    const e = parseISO(String(end));
    const same = format(s, 'MMM d') === format(e, 'MMM d');
    if (same) return `${format(s, 'MMM d')} (${days} ${days === 1 ? 'Day' : 'Days'})`;
    return `${format(s, 'MMM d')} – ${format(e, 'MMM d')} (${days} ${days === 1 ? 'Day' : 'Days'})`;
  } catch {
    return `${start} → ${end}`;
  }
};

const leaveTypeLabel = (t) => {
  const map = { Casual: 'Casual leave', Sick: 'Sick leave', Paid: 'Annual leave', WFH: 'Work from home', 'Half Day': 'Half day' };
  return map[t] || `${t} leave`;
};

const attachmentDisplayNameFromPath = (path) => {
  if (!path || typeof path !== 'string') return 'Attachment';
  try {
    if (path.includes('://')) {
      const u = new URL(path);
      const seg = u.pathname.split('/').pop() || 'Attachment';
      return decodeURIComponent(seg.split('?')[0]);
    }
    const seg = path.split('/').pop() || 'Attachment';
    return decodeURIComponent(seg.split('?')[0]);
  } catch {
    return 'Attachment';
  }
};

export const Leaves = () => {
  const { user } = useAuth();
  const [leaves, setLeaves] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('All');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [balance, setBalance] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [policyInput, setPolicyInput] = useState('');
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [attachment, setAttachment] = useState(null);
  const attachmentFileRef = useRef(null);
  const [leaveAttachmentPreview, setLeaveAttachmentPreview] = useState({
    open: false,
    url: '',
    name: 'Attachment'
  });
  const [calendarMonth, setCalendarMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [holidayDates, setHolidayDates] = useState([]);
  const [formData, setFormData] = useState({
    employee_id: '',
    employee_name: '',
    leave_type: 'Casual',
    start_date: '',
    end_date: '',
    days: 1,
    reason: ''
  });

  useEffect(() => {
    fetchEmployees();
    fetchLeaves();
    fetchLeaveBalance();
    fetchLeavePolicy();
  }, []);

  useEffect(() => {
    const year = parseInt(String(calendarMonth).split('-')[0], 10);
    if (!year) return;
    axios
      .get(`${API}/government-holidays`, { params: { year }, ...authHeaders() })
      .then((res) => setHolidayDates((res.data || []).map((h) => h.date)))
      .catch(() => setHolidayDates([]));
  }, [calendarMonth]);

  const fetchLeaveBalance = async () => {
    try {
      const res = await axios.get(`${API}/leave-balance`, authHeaders());
      setBalance(res.data);
    } catch {
      setBalance({ allowed: 0, taken: 0, pending: 0, balance: 0 });
    }
  };

  const fetchLeavePolicy = async () => {
    try {
      const res = await axios.get(`${API}/leave-policy`, authHeaders());
      setPolicy(res.data);
      if (res.data.paid_leaves_per_year != null) setPolicyInput(String(res.data.paid_leaves_per_year));
    } catch {
      setPolicy({ paid_leaves_per_year: 12 });
      setPolicyInput('12');
    }
  };

  const saveLeavePolicy = async () => {
    const num = parseInt(policyInput, 10);
    if (isNaN(num) || num < 0) {
      toast.error('Enter a valid non-negative number');
      return;
    }
    setSavingPolicy(true);
    try {
      await axios.put(`${API}/leave-policy`, { paid_leaves_per_year: num }, authHeaders());
      setPolicy({ paid_leaves_per_year: num });
      toast.success('Leave policy updated');
      fetchLeaveBalance();
    } catch (e) {
      // Handle Pydantic validation errors
      let errorMsg = 'Failed to update policy';
      
      if (e.response?.data?.detail) {
        if (Array.isArray(e.response.data.detail)) {
          errorMsg = e.response.data.detail
            .map(err => err.msg || JSON.stringify(err))
            .join(', ');
        } else if (typeof e.response.data.detail === 'string') {
          errorMsg = e.response.data.detail;
        } else if (typeof e.response.data.detail === 'object') {
          errorMsg = e.response.data.detail.msg || JSON.stringify(e.response.data.detail);
        }
      } else if (e.response?.data?.message) {
        errorMsg = e.response.data.message;
      }
      
      toast.error(errorMsg);
    } finally {
      setSavingPolicy(false);
    }
  };

  const closeLeaveAttachmentPreview = () => {
    setLeaveAttachmentPreview((prev) => {
      if (prev.url?.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(prev.url);
        } catch {
          /* ignore */
        }
      }
      return { open: false, url: '', name: 'Attachment' };
    });
  };

  const openLeaveAttachmentPreview = (url, name) => {
    if (!url) return;
    setLeaveAttachmentPreview((prev) => {
      if (prev.url?.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(prev.url);
        } catch {
          /* ignore */
        }
      }
      return { open: true, url, name: name || 'Attachment' };
    });
  };

  const prevApplyDialogOpenRef = useRef(false);

  useEffect(() => {
    if (dialogOpen && user?.employee_id && !formData.employee_id) {
      setFormData((prev) => ({
        ...prev,
        employee_id: user.employee_id,
        employee_name: user.name
      }));
    }
  }, [dialogOpen, user?.employee_id, user?.name, formData.employee_id]);

  useEffect(() => {
    if (prevApplyDialogOpenRef.current && !dialogOpen) {
      closeLeaveAttachmentPreview();
      setAttachment(null);
      if (attachmentFileRef.current) {
        attachmentFileRef.current.value = '';
      }
    }
    prevApplyDialogOpenRef.current = dialogOpen;
  }, [dialogOpen]);

  const fetchEmployees = async () => {
    try {
      const response = await axios.get(`${API}/employees`);
      setEmployees(response.data);
    } catch (error) {
      toast.error('Failed to load employees');
    }
  };

  const fetchLeaves = async () => {
    try {
      const response = await axios.get(`${API}/leaves`);
      setLeaves(response.data);
    } catch (error) {
      toast.error('Failed to load leaves');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate required fields
    if (!formData.employee_id) {
      toast.error('Please select an employee');
      return;
    }
    if (!formData.leave_type) {
      toast.error('Please select a leave type');
      return;
    }
    if (!formData.start_date) {
      toast.error('Please select a start date');
      return;
    }
    if (!formData.end_date) {
      toast.error('Please select an end date');
      return;
    }
    if (!formData.reason || formData.reason.trim() === '') {
      toast.error('Please provide a reason for the leave');
      return;
    }
    
    try {
      // Use FormData to handle file upload
      const formDataToSend = new FormData();
      formDataToSend.append('employee_id', formData.employee_id);
      formDataToSend.append('employee_name', formData.employee_name || user?.name);
      formDataToSend.append('leave_type', formData.leave_type);
      formDataToSend.append('start_date', formData.start_date);
      formDataToSend.append('end_date', formData.end_date);
      formDataToSend.append('days', String(formData.days));
      formDataToSend.append('reason', formData.reason);
      
      // Append file if present (attachment is completely optional)
      if (attachment) {
        formDataToSend.append('file', attachment);
      }
      
      await axios.post(`${API}/leaves`, formDataToSend, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      toast.success('Leave application submitted successfully');
      setDialogOpen(false);
      resetForm();
      fetchLeaves();
      fetchLeaveBalance();
    } catch (error) {
      // Handle Pydantic validation errors (array of error objects)
      let errorMsg = 'Failed to submit leave';
      
      if (error.response?.data?.detail) {
        // If detail is an array of error objects (Pydantic validation)
        if (Array.isArray(error.response.data.detail)) {
          errorMsg = error.response.data.detail
            .map(e => e.msg || JSON.stringify(e))
            .join(', ');
        } else if (typeof error.response.data.detail === 'string') {
          errorMsg = error.response.data.detail;
        } else if (typeof error.response.data.detail === 'object') {
          errorMsg = error.response.data.detail.msg || JSON.stringify(error.response.data.detail);
        }
      } else if (error.response?.data?.message) {
        errorMsg = error.response.data.message;
      }
      
      toast.error(errorMsg);
    }
  };

  const handleLeaveAction = async (leaveId, status) => {
    try {
      await axios.put(`${API}/leaves/${leaveId}/action`, {
        status: status,
        approver_id: user.id,
        approver_name: user.name
      });
      toast.success(`Leave ${status.toLowerCase()} successfully`);
      fetchLeaves();
      fetchLeaveBalance();
    } catch (error) {
      toast.error('Failed to update leave status');
    }
  };

  const resetForm = () => {
    setFormData({
      employee_id: '',
      employee_name: '',
      leave_type: 'Casual',
      start_date: '',
      end_date: '',
      days: 1,
      reason: ''
    });
    setAttachment(null);
    if (attachmentFileRef.current) {
      attachmentFileRef.current.value = '';
    }
  };

  const handleEmployeeChange = (selectedEmployeeId) => {
    const employee = employees.find(emp => emp.employee_id === selectedEmployeeId);
    if (employee) {
      setFormData({
        ...formData,
        employee_id: employee.employee_id,
        employee_name: employee.name
      });
    }
  };

  const calculateDays = () => {
    if (formData.start_date && formData.end_date) {
      const start = new Date(formData.start_date);
      const end = new Date(formData.end_date);
      const diffTime = Math.abs(end - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      setFormData({ ...formData, days: diffDays });
    }
  };

  useEffect(() => {
    calculateDays();
  }, [formData.start_date, formData.end_date]);

  const canApprove = ['Admin', 'HR', 'Manager'].includes(user?.role);

  const statusTabs = ['All', 'Pending', 'Approved', 'Rejected'];

  const filteredLeaves = leaves.filter((leave) => {
    if (activeTab !== 'All' && leave.status !== activeTab) return false;
    if (!canApprove) {
      return (
        leave.employee_id === user?.employee_id ||
        String(leave.employee_id) === String(user?.employee_id) ||
        Number(leave.employee_id) === Number(user?.employee_id) ||
        (leave.employee_id &&
          user?.employee_id &&
          leave.employee_id.toString().trim() === user?.employee_id.toString().trim())
      );
    }
    if (employeeFilter !== 'all' && String(leave.employee_id) !== String(employeeFilter)) return false;
    return true;
  });

  const ownLeavesForCalendar = useMemo(() => {
    if (!user?.employee_id) return [];
    return leaves.filter(
      (l) =>
        String(l.employee_id) === String(user.employee_id) &&
        (l.status === 'Pending' || l.status === 'Approved')
    );
  }, [leaves, user?.employee_id]);

  const pendingRequestCount = useMemo(
    () =>
      leaves.filter(
        (l) =>
          l.status === 'Pending' &&
          (!canApprove
            ? String(l.employee_id) === String(user?.employee_id)
            : employeeFilter === 'all' || String(l.employee_id) === String(employeeFilter))
      ).length,
    [leaves, canApprove, user?.employee_id, employeeFilter]
  );

  const calendarGridCells = useMemo(() => {
    const [y, m] = String(calendarMonth).split('-').map((x) => parseInt(x, 10));
    if (!y || !m) return [];
    const ms = new Date(y, m - 1, 1);
    const pad = ms.getDay();
    const end = endOfMonth(ms);
    const days = eachDayOfInterval({ start: ms, end });
    return [...Array(pad).fill(null), ...days];
  }, [calendarMonth]);

  const dayMeta = (dateStr) => {
    const isHol = holidayDates.includes(dateStr);
    let leavePending = false;
    let leaveApproved = false;
    ownLeavesForCalendar.forEach((lv) => {
      try {
        const a = parseISO(String(lv.start_date));
        const b = parseISO(String(lv.end_date));
        const d = parseISO(dateStr);
        if (isWithinInterval(d, { start: a, end: b })) {
          if (lv.status === 'Pending') leavePending = true;
          if (lv.status === 'Approved') leaveApproved = true;
        }
      } catch {
        /* ignore */
      }
    });
    return { isHol, leavePending, leaveApproved };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div
      className="relative space-y-5 pb-32 text-slate-800 antialiased md:pb-8 [font-family:ui-sans-serif,system-ui,-apple-system,Segoe_UI,Roboto,Inter,sans-serif]"
      data-testid="leaves-page"
    >
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <StandardAppDialogContent size="md">
            <StandardAppDialogHeader
              title="Apply Leave"
              subtitle="Submit the details below. Your request will be sent for approval."
              icon={Calendar}
            />

            <form onSubmit={handleSubmit} className="flex max-h-[min(72dvh,34rem)] flex-col">
              <StandardAppDialogBody>
                {canApprove ? (
                  <div className="space-y-2">
                    <Label htmlFor="employee" className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">
                      Select employee *
                    </Label>
                    <div className="relative">
                      <select
                        id="employee"
                        data-testid="leave-employee-select"
                        value={formData.employee_id}
                        onChange={(e) => handleEmployeeChange(e.target.value)}
                        className="flex h-12 w-full appearance-none rounded-xl border border-slate-200/90 bg-white px-4 py-2 pr-10 text-sm font-medium text-slate-900 shadow-sm transition-all hover:border-slate-300 hover:shadow-md focus:border-red-500 focus:outline-none focus:ring-4 focus:ring-red-500/12"
                        required
                      >
                        <option value="">Select employee</option>
                        {employees.map((emp) => (
                          <option key={emp.employee_id} value={emp.employee_id}>
                            {emp.name} ({emp.employee_id})
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    </div>
                  </div>
                ) : (
                  <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm ring-1 ring-slate-100">
                    <div className="absolute left-0 top-0 h-full w-1 rounded-l-2xl bg-gradient-to-b from-red-500 to-rose-500" aria-hidden />
                    <div className="pl-3">
                      <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-slate-500">
                        <User className="h-3.5 w-3.5 text-red-500" aria-hidden />
                        Employee
                      </div>
                      <div className="mt-1.5 text-base font-semibold text-slate-900">
                        {formData.employee_name || user?.name}
                      </div>
                      <div className="mt-0.5 text-sm text-slate-600">ID {user?.employee_id}</div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="leave_type" className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">
                    Leave type *
                  </Label>
                  <div className="relative">
                    <select
                      id="leave_type"
                      data-testid="leave-type-select"
                      value={formData.leave_type}
                      onChange={(e) => setFormData({ ...formData, leave_type: e.target.value })}
                      className="flex h-12 w-full appearance-none rounded-xl border border-slate-200/90 bg-white px-4 py-2 pr-10 text-sm font-medium text-slate-900 shadow-sm transition-all hover:border-slate-300 hover:shadow-md focus:border-red-500 focus:outline-none focus:ring-4 focus:ring-red-500/12"
                      required
                    >
                      <option value="Casual">Casual Leave</option>
                      <option value="Sick">Sick Leave</option>
                      <option value="Paid">Paid Leave</option>
                      <option value="WFH">Work From Home</option>
                      <option value="Half Day">Half Day</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>

                <div className="grid gap-5 sm:grid-cols-2 sm:gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="start_date" className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">
                      From date *
                    </Label>
                    <div className="relative">
                      <Input
                        id="start_date"
                        type="date"
                        data-testid="leave-start-date"
                        value={formData.start_date}
                        onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                        required
                        className="h-12 rounded-xl border-slate-200/90 bg-white pr-10 text-sm font-medium text-slate-900 shadow-sm transition-all hover:border-slate-300 hover:shadow-md focus-visible:border-red-500 focus-visible:ring-4 focus-visible:ring-red-500/12"
                      />
                      <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-red-400/80" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="end_date" className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">
                      To date *
                    </Label>
                    <div className="relative">
                      <Input
                        id="end_date"
                        type="date"
                        data-testid="leave-end-date"
                        value={formData.end_date}
                        onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                        required
                        className="h-12 rounded-xl border-slate-200/90 bg-white pr-10 text-sm font-medium text-slate-900 shadow-sm transition-all hover:border-slate-300 hover:shadow-md focus-visible:border-red-500 focus-visible:ring-4 focus-visible:ring-red-500/12"
                      />
                      <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-red-400/80" />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">
                    Number of days
                  </Label>
                  <div className="flex h-12 items-center justify-between rounded-xl border border-slate-200/90 bg-gradient-to-r from-slate-50/90 to-white px-4 shadow-inner ring-1 ring-slate-100/80">
                    <span className="text-lg font-bold tabular-nums tracking-tight text-slate-800">
                      {formData.days}
                    </span>
                    <span className="text-xs font-medium uppercase tracking-wider text-slate-400">days</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reason" className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">
                    Reason *
                  </Label>
                  <textarea
                    id="reason"
                    data-testid="leave-reason"
                    value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    required
                    placeholder="e.g. Personal work"
                    rows={4}
                    className="min-h-[6.5rem] w-full resize-y rounded-xl border border-slate-200/90 bg-white px-4 py-3 text-sm leading-relaxed text-slate-900 shadow-sm transition-all placeholder:text-slate-400 hover:border-slate-300 focus:border-red-500 focus:outline-none focus:ring-4 focus:ring-red-500/12"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="attachment" className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">
                    Attachment (optional)
                  </Label>
                  <div className="rounded-xl border border-dashed border-slate-200/90 bg-slate-50/40 p-3 ring-1 ring-inset ring-slate-100/60 transition-colors hover:border-red-200/80 hover:bg-red-50/20">
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        id="attachment"
                        type="file"
                        ref={attachmentFileRef}
                        onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                        className="h-10 flex-1 min-w-[8rem] cursor-pointer border-0 bg-transparent p-0 text-sm shadow-none file:mr-2 file:rounded-lg file:border-0 file:bg-gradient-to-br file:from-red-500 file:to-rose-600 file:px-3.5 file:py-2 file:text-sm file:font-semibold file:text-white file:shadow-md file:shadow-red-500/20"
                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.msg,.eml,.ics"
                      />
                      {attachment && (
                        <>
                          <span
                            className="max-w-[160px] truncate rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200/80 sm:max-w-[200px]"
                            title={attachment.name}
                          >
                            ✓ {attachment.name}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 shrink-0 gap-1 rounded-lg border-red-200 px-2.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                            onClick={() =>
                              openLeaveAttachmentPreview(
                                URL.createObjectURL(attachment),
                                attachment.name
                              )
                            }
                          >
                            <Eye className="h-3.5 w-3.5" aria-hidden />
                            Preview
                          </Button>
                        </>
                      )}
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-slate-500">
                      Images, PDF, documents, Outlook (.msg, .eml)
                    </p>
                  </div>
                </div>
              </StandardAppDialogBody>

              <StandardAppDialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  className="h-12 rounded-xl border-2 border-red-500/90 bg-white font-semibold text-red-600 shadow-sm transition-all hover:border-red-600 hover:bg-red-50 hover:shadow-md active:scale-[0.98]"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="h-12 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 font-semibold text-white shadow-lg shadow-red-500/30 transition-all hover:from-red-600 hover:to-rose-700 hover:shadow-xl hover:shadow-red-500/35 active:scale-[0.98]"
                  data-testid="submit-leave-button"
                >
                  Apply
                </Button>
              </StandardAppDialogFooter>
            </form>
          </StandardAppDialogContent>
      </Dialog>

      <Dialog
        open={leaveAttachmentPreview.open}
        onOpenChange={(open) => {
          if (!open) closeLeaveAttachmentPreview();
        }}
      >
        <StandardAppDialogContent
          size="xl"
          className="max-h-[min(90dvh,85vh)]"
          data-testid="leave-attachment-preview-dialog"
        >
          <StandardAppDialogHeader
            title="Attachment preview"
            subtitle={leaveAttachmentPreview.name}
            icon={ImageIcon}
          />
          <StandardAppDialogBody className="min-h-0 flex-1 py-4">
            {leaveAttachmentPreview.url ? (
              <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-slate-50/50 shadow-inner ring-1 ring-slate-100">
                <FilePreviewSimple
                  fileUrl={leaveAttachmentPreview.url}
                  fileName={leaveAttachmentPreview.name}
                />
              </div>
            ) : null}
          </StandardAppDialogBody>
          <StandardAppDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeLeaveAttachmentPreview}
              className={standardCancelButtonClass}
            >
              Close
            </Button>
            {leaveAttachmentPreview.url ? (
              <Button asChild className={standardPrimaryButtonClass}>
                <a
                  href={leaveAttachmentPreview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open in new tab
                </a>
              </Button>
            ) : (
              <Button type="button" disabled className={standardPrimaryButtonClass}>
                Open in new tab
              </Button>
            )}
          </StandardAppDialogFooter>
        </StandardAppDialogContent>
      </Dialog>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        {/* <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Leave Management</h1>
          <p className="mt-1 text-sm text-slate-500">Apply and manage leave requests</p>
        </div> */}
        {/* <div className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 sm:flex">
          <User className="h-6 w-6" />
        </div> */}
      </div>

      {balance != null && (
        <Card className="overflow-hidden rounded-2xl border-0 bg-white shadow-[0_4px_24px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/70">
          <div className="flex flex-col lg:flex-row lg:items-stretch">
            <div className="grid flex-1 grid-cols-2 divide-x divide-slate-100 border-b border-slate-100 sm:grid-cols-4 lg:border-b-0">
              <div className="flex flex-col justify-center px-4 py-4 sm:py-5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total annual balance</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                  {balance.allowed}{' '}
                  <span className="text-base font-semibold text-slate-600">Days</span>
                </p>
                <p className="mt-0.5 text-xs text-slate-400">{balance.year || new Date().getFullYear()} policy</p>
              </div>
              <div className="flex flex-col justify-center px-4 py-4 sm:flex-row sm:items-center sm:gap-3 sm:py-5">
                <div
                  className="relative mx-auto mb-2 h-14 w-14 shrink-0 rounded-full sm:mx-0 sm:mb-0"
                  style={{
                    background: (() => {
                      const a = Math.max(Number(balance.allowed) || 0, 1);
                      const r = Math.min(1, Math.max(0, (Number(balance.balance) || 0) / a));
                      const deg = r * 360;
                      return `conic-gradient(rgb(34 197 94) 0deg ${deg}deg, rgb(226 232 240) ${deg}deg 360deg)`;
                    })()
                  }}
                  title="Remaining vs annual balance"
                >
                  <div className="absolute inset-1 flex items-center justify-center rounded-full bg-white text-[10px] font-bold text-emerald-700">
                    {balance.balance}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Remaining</p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">
                    {balance.balance} <span className="text-sm font-medium text-slate-600">Days</span>
                  </p>
                </div>
              </div>
              <div className="flex flex-col justify-center border-t border-slate-100 px-4 py-4 sm:border-t-0 sm:py-5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Used</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                  {balance.taken} <span className="text-base font-semibold text-slate-600">Days</span>
                </p>
              </div>
              <div className="flex flex-col justify-center border-t border-slate-100 px-4 py-4 sm:border-t-0 sm:py-5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Pending</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-amber-700">
                  {pendingRequestCount}{' '}
                  <span className="text-base font-semibold text-amber-600/90">Requests</span>
                </p>
                <p className="mt-0.5 text-[11px] text-amber-700/80">Awaiting approval</p>
              </div>
            </div>
            <div className="hidden items-center justify-center border-t border-slate-100 p-4 md:flex lg:w-52 lg:border-l lg:border-t-0 lg:px-5">
              <Button
                type="button"
                className="h-11 w-full rounded-xl bg-sky-600 px-5 text-sm font-semibold text-white shadow-md shadow-sky-600/25 hover:bg-sky-700 lg:w-auto"
                data-testid="apply-leave-button"
                onClick={() => setDialogOpen(true)}
              >
                Apply for leave
                <Plus className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {user?.role === 'Admin' && (
        <Card className="rounded-2xl border-0 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.05)] ring-1 ring-slate-200/70">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <Settings2 className="h-4 w-4" />
            </div>
            <h2 className="text-base font-bold text-slate-900">Leave policy</h2>
          </div>
          <p className="mb-4 text-sm text-slate-600">
            Paid leaves allowed per employee per year. This applies to all employees.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              type="number"
              min={0}
              value={policyInput}
              onChange={(e) => setPolicyInput(e.target.value)}
              className="h-10 w-28 rounded-xl border-slate-200"
              placeholder="e.g. 12"
            />
            <Button
              onClick={saveLeavePolicy}
              disabled={savingPolicy}
              className="rounded-xl bg-sky-600 px-4 text-white hover:bg-sky-700"
            >
              {savingPolicy ? 'Saving…' : 'Save'}
            </Button>
            {policy?.paid_leaves_per_year != null && (
              <span className="text-sm text-slate-500">Current: {policy.paid_leaves_per_year} days/year</span>
            )}
          </div>
        </Card>
      )}

      <Card className="rounded-2xl border-0 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/70">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-1">
            {statusTabs.map((tab) => (
              <Button
                key={tab}
                variant="ghost"
                size="sm"
                className={`h-9 rounded-xl px-4 text-sm font-semibold ${
                  activeTab === tab
                    ? 'bg-sky-50 text-sky-800 ring-1 ring-sky-100'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
                onClick={() => setActiveTab(tab)}
                data-testid={`status-tab-${tab.toLowerCase()}`}
              >
                {tab}
              </Button>
            ))}
          </div>
          {canApprove && (
            <div className="w-full md:w-72">
              <select
                value={employeeFilter}
                onChange={(e) => setEmployeeFilter(e.target.value)}
                className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-500/20"
              >
                <option value="all">All employees</option>
                {employees.map((emp) => (
                  <option key={emp.employee_id} value={emp.employee_id}>
                    {emp.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card className="overflow-hidden rounded-2xl border-0 bg-white shadow-[0_4px_24px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/60 lg:col-span-7">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-lg font-bold text-slate-900">My requests (current & past)</h2>
            {canApprove && (
              <p className="mt-1 text-xs text-slate-500">Showing requests for the selected filters.</p>
            )}
          </div>
          {filteredLeaves.length > 0 ? (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      {canApprove && <th className="px-4 py-3">Employee</th>}
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Dates</th>
                      <th className="px-4 py-3">Days</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Approver</th>
                      {canApprove && <th className="px-4 py-3 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeaves.map((leave) => (
                      <tr
                        key={leave.id}
                        className="border-b border-slate-50 transition-colors hover:bg-slate-50/60"
                        data-testid={`leave-card-${leave.id}`}
                      >
                        {canApprove && (
                          <td className="px-4 py-3 font-medium text-slate-900">
                            <div>{leave.employee_name}</div>
                            <div className="text-xs font-normal text-slate-500">{leave.employee_id}</div>
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{leaveTypeLabel(leave.leave_type)}</div>
                          <div className="mt-0.5 line-clamp-2 max-w-[220px] text-xs text-slate-500">{leave.reason}</div>
                          {leave.attachment_path && (
                            <button
                              type="button"
                              onClick={() =>
                                openLeaveAttachmentPreview(
                                  leave.attachment_path,
                                  attachmentDisplayNameFromPath(leave.attachment_path)
                                )
                              }
                              className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline"
                            >
                              <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              Preview attachment
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {formatLeaveRange(leave.start_date, leave.end_date, leave.days)}
                        </td>
                        <td className="px-4 py-3 font-medium tabular-nums text-slate-900">
                          {leave.days} {leave.days === 1 ? 'day' : 'days'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                              leave.status === 'Pending'
                                ? 'bg-amber-100 text-amber-800'
                                : leave.status === 'Approved'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {leave.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{leave.approver_name || '—'}</td>
                        {canApprove && (
                          <td className="px-4 py-3 text-right">
                            {leave.status === 'Pending' ? (
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  className="h-8 rounded-lg bg-emerald-600 px-3 text-white hover:bg-emerald-700"
                                  onClick={() => handleLeaveAction(leave.id, 'Approved')}
                                  data-testid={`approve-leave-${leave.id}`}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 rounded-lg border-rose-200 text-rose-700 hover:bg-rose-50"
                                  onClick={() => handleLeaveAction(leave.id, 'Rejected')}
                                  data-testid={`reject-leave-${leave.id}`}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-slate-100 md:hidden">
                {filteredLeaves.map((leave) => (
              <div key={leave.id} className="flex items-center gap-3 px-4 py-4" data-testid={`leave-card-${leave.id}`}>
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    leave.status === 'Pending'
                      ? 'bg-amber-100 text-amber-700'
                      : leave.status === 'Approved'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {leave.status === 'Approved' ? <Check className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">
                    {leaveTypeLabel(leave.leave_type)}{' '}
                    <span className="text-slate-500">({leave.status})</span>
                  </p>
                  {canApprove && (
                    <p className="truncate text-xs text-slate-500">{leave.employee_name}</p>
                  )}
                  <p className="text-sm text-slate-600">{formatLeaveRange(leave.start_date, leave.end_date, leave.days)}</p>
                  {leave.attachment_path && (
                    <button
                      type="button"
                      onClick={() =>
                        openLeaveAttachmentPreview(
                          leave.attachment_path,
                          attachmentDisplayNameFromPath(leave.attachment_path)
                        )
                      }
                      className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline"
                    >
                      <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      Preview attachment
                    </button>
                  )}
                  {canApprove && leave.status === 'Pending' && (
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        className="h-8 flex-1 rounded-lg bg-emerald-600 text-white"
                        onClick={() => handleLeaveAction(leave.id, 'Approved')}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 flex-1 rounded-lg border-rose-200 text-rose-700"
                        onClick={() => handleLeaveAction(leave.id, 'Rejected')}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" aria-hidden />
                </div>
              ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Clock className="mb-3 h-12 w-12 text-slate-200" />
              <p className="text-sm font-medium text-slate-600">No leave requests found</p>
            </div>
          )}

          {canApprove && (
            <div className="hidden border-t border-slate-100 bg-slate-50/50 px-4 py-3 text-xs text-slate-500 md:block">
              Use row actions to approve or reject pending requests.
            </div>
          )}
        </Card>

        <Card className="overflow-hidden rounded-2xl border-0 bg-white shadow-[0_4px_24px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/60 lg:col-span-5">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-9 w-9 rounded-xl text-slate-600"
              onClick={() => setCalendarMonth(format(subMonths(new Date(`${calendarMonth}-01`), 1), 'yyyy-MM'))}
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-sky-600" />
              <input
                type="month"
                value={calendarMonth}
                onChange={(e) => setCalendarMonth(e.target.value)}
                className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-sm font-bold text-slate-900 shadow-sm"
              />
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-9 w-9 rounded-xl text-slate-600"
              onClick={() => setCalendarMonth(format(addMonths(new Date(`${calendarMonth}-01`), 1), 'yyyy-MM'))}
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="p-4">
            <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendarGridCells.map((day, idx) => {
                if (!day) return <div key={`e-${idx}`} className="aspect-square" />;
                const dateStr = format(day, 'yyyy-MM-dd');
                const wd = day.getDay();
                const weekend = wd === 0 || wd === 6;
                const meta = dayMeta(dateStr);
                let cellClass = 'text-slate-800 hover:bg-slate-50';
                if (meta.leavePending) {
                  cellClass = 'bg-amber-100 font-semibold text-amber-900 ring-1 ring-amber-200/80';
                } else if (meta.leaveApproved) {
                  cellClass = 'bg-emerald-50 font-medium text-emerald-900 ring-1 ring-emerald-200/70';
                } else if (meta.isHol) {
                  cellClass = 'bg-sky-100 font-semibold text-sky-900 ring-1 ring-sky-200/80';
                } else if (weekend) {
                  cellClass = 'text-slate-400 ring-1 ring-slate-200/80 bg-slate-50';
                }
                return (
                  <div
                    key={dateStr}
                    className={`flex aspect-square items-center justify-center rounded-lg text-xs font-medium ${cellClass}`}
                    title={dateStr}
                  >
                    {format(day, 'd')}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-100 pt-3 text-xs text-slate-600">
              <span className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded bg-sky-200 ring-1 ring-sky-300/80" />
                Upcoming holiday
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded bg-amber-100 ring-1 ring-amber-200/80" />
                Your leave (pending)
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded bg-emerald-50 ring-1 ring-emerald-200/70" />
                Your leave (approved)
              </span>
            </div>
          </div>
        </Card>
      </div>

      <Button
        type="button"
        className="fixed right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-sky-600 text-white shadow-lg shadow-sky-600/30 md:hidden bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))]"
        onClick={() => setDialogOpen(true)}
        aria-label="Apply for leave"
      >
        <Plus className="h-7 w-7" />
      </Button>
    </div>
  );
};