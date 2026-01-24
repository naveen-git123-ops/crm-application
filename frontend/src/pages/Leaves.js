import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Plus, Check, X, Clock } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export const Leaves = () => {
  const { user } = useAuth();
  const [leaves, setLeaves] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('All');
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
  }, []);

  useEffect(() => {
    // When dialog opens, if user is an employee, auto-fill their employee ID
    if (dialogOpen && user?.employee_id && !formData.employee_id) {
      setFormData(prev => ({
        ...prev,
        employee_id: user.employee_id,
        employee_name: user.name
      }));
    }
  }, [dialogOpen, user]);

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
    try {
      // Ensure employee_name is included
      const submitData = {
        ...formData,
        employee_name: formData.employee_name || user?.name
      };
      await axios.post(`${API}/leaves`, submitData, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      toast.success('Leave application submitted successfully');
      setDialogOpen(false);
      resetForm();
      fetchLeaves();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit leave');
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
  };

  const handleEmployeeChange = (selectedEmployeeId) => {
    const employee = employees.find(emp => emp.id === selectedEmployeeId);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const statusTabs = ['All', 'Pending', 'Approved', 'Rejected'];

  const filteredLeaves = leaves.filter(leave => {
    if (activeTab !== 'All' && leave.status !== activeTab) return false;
    if (!canApprove && leave.employee_id !== user?.employee_id) return false;
    return true;
  });

  return (
    <div className="space-y-6" data-testid="leaves-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Leave Management</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">Apply and manage leave requests</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-indigo-600 text-white font-medium hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700 h-10" data-testid="apply-leave-button">
              <Plus className="h-4 w-4 mr-2" />
              Apply Leave
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg dark:bg-slate-900 dark:border-slate-800">
            <DialogHeader>
              <DialogTitle className="text-slate-900 dark:text-slate-50">Apply for Leave</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              {canApprove ? (
                <div className="space-y-2">
                  <Label htmlFor="employee" className="text-sm font-medium text-slate-700 dark:text-slate-300">Employee *</Label>
                  <select
                    id="employee"
                    data-testid="leave-employee-select"
                    value={formData.employee_id}
                    onChange={(e) => handleEmployeeChange(e.target.value)}
                    className="flex h-10 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-50 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400 transition-all"
                    required
                  >
                    <option value="">Select employee</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.employee_id})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-2 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                  <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Employee</Label>
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-50">
                    {formData.employee_name} ({user?.employee_id})
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="leave_type" className="text-sm font-medium text-slate-700 dark:text-slate-300">Leave Type *</Label>
                <select
                  id="leave_type"
                  data-testid="leave-type-select"
                  value={formData.leave_type}
                  onChange={(e) => setFormData({ ...formData, leave_type: e.target.value })}
                  className="flex h-10 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-50 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                  required
                >
                  <option value="Casual">Casual Leave</option>
                  <option value="Sick">Sick Leave</option>
                  <option value="Paid">Paid Leave</option>
                  <option value="WFH">Work From Home</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start_date" className="text-sm font-medium text-slate-700 dark:text-slate-300">Start Date *</Label>
                  <Input
                    id="start_date"
                    type="date"
                    data-testid="leave-start-date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    required
                    className="border border-slate-200 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50 h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end_date" className="text-sm font-medium text-slate-700 dark:text-slate-300">End Date *</Label>
                  <Input
                    id="end_date"
                    type="date"
                    data-testid="leave-end-date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    required
                    className="border border-slate-200 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50 h-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Number of Days</Label>
                <Input
                  type="number"
                  value={formData.days}
                  readOnly
                  className="border border-slate-200 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-50 h-10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reason" className="text-sm font-medium text-slate-700 dark:text-slate-300">Reason *</Label>
                <Textarea
                  id="reason"
                  data-testid="leave-reason"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  required
                  placeholder="Reason for leave..."
                  rows={3}
                  className="border border-slate-200 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                  Cancel
                </Button>
                <Button type="submit" className="bg-indigo-600 text-white hover:bg-indigo-700 h-10" data-testid="submit-leave-button">
                  Submit Application
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Status Tabs */}
      <Card className="p-3 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex gap-2">
          {statusTabs.map((tab) => (
            <Button
              key={tab}
              variant={activeTab === tab ? 'default' : 'ghost'}
              size="sm"
              className={`h-9 ${
                activeTab === tab
                  ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-medium'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              onClick={() => setActiveTab(tab)}
              data-testid={`status-tab-${tab.toLowerCase()}`}
            >
              {tab}
            </Button>
          ))}
        </div>
      </Card>

      {/* Leaves List */}
      <div className="space-y-4">
        {filteredLeaves.map((leave) => (
          <Card key={leave.id} className="p-6 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900" data-testid={`leave-card-${leave.id}`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex-1 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">{leave.employee_name}</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                      {leave.leave_type} Leave • {leave.days} {leave.days === 1 ? 'day' : 'days'}
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded text-xs font-medium ${
                    leave.status === 'Pending' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300' :
                    leave.status === 'Approved' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' :
                    'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                  }`}>
                    {leave.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-slate-600 dark:text-slate-400">Start Date</p>
                    <p className="font-mono font-medium text-slate-900 dark:text-slate-50">{leave.start_date}</p>
                  </div>
                  <div>
                    <p className="text-slate-600 dark:text-slate-400">End Date</p>
                    <p className="font-mono font-medium text-slate-900 dark:text-slate-50">{leave.end_date}</p>
                  </div>
                  <div>
                    <p className="text-slate-600 dark:text-slate-400">Applied On</p>
                    <p className="font-mono text-xs text-slate-600 dark:text-slate-400">{new Date(leave.created_at).toLocaleDateString()}</p>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Reason:</p>
                  <p className="text-sm text-slate-900 dark:text-slate-50">{leave.reason}</p>
                </div>

                {leave.approver_name && (
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {leave.status} by {leave.approver_name}
                  </p>
                )}
              </div>

              {canApprove && leave.status === 'Pending' && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white h-9"
                    onClick={() => handleLeaveAction(leave.id, 'Approved')}
                    data-testid={`approve-leave-${leave.id}`}
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    className="bg-rose-600 hover:bg-rose-700 text-white h-9"
                    onClick={() => handleLeaveAction(leave.id, 'Rejected')}
                    data-testid={`reject-leave-${leave.id}`}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Reject
                  </Button>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      {filteredLeaves.length === 0 && (
        <Card className="p-12 text-center border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <Clock className="h-12 w-12 mx-auto mb-2 opacity-20" />
          <p className="text-slate-600 dark:text-slate-400">No leave requests found</p>
        </Card>
      )}
    </div>
  );
};