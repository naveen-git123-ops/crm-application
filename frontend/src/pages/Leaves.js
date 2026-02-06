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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const statusTabs = ['All', 'Pending', 'Approved', 'Rejected'];

  const filteredLeaves = leaves.filter(leave => {
    // First filter by status if not "All"
    if (activeTab !== 'All' && leave.status !== activeTab) return false;
    
    // For non-approver users, only show their own leaves
    if (!canApprove) {
      // Enhanced debugging - remove in production
      console.log('Leave Filtering Debug:', {
        leaveData: leave,
        userData: user,
        comparison: {
          leaveEmployeeId: leave.employee_id,
          userEmployeeId: user?.employee_id,
          leaveIdType: typeof leave.employee_id,
          userIdType: typeof user?.employee_id,
          directMatch: leave.employee_id === user?.employee_id,
          stringMatch: String(leave.employee_id) === String(user?.employee_id),
          numberMatch: Number(leave.employee_id) === Number(user?.employee_id)
        }
      });
      
      // Try multiple comparison methods to handle different data types
      const isOwnLeave = 
        leave.employee_id === user?.employee_id ||
        String(leave.employee_id) === String(user?.employee_id) ||
        Number(leave.employee_id) === Number(user?.employee_id) ||
        (leave.employee_id && user?.employee_id && 
         leave.employee_id.toString().trim() === user?.employee_id.toString().trim());
      
      console.log('Is Own Leave:', isOwnLeave);
      return isOwnLeave;
    }
    
    // For approvers, show all leaves
    return true;
  });

  return (
    <div className="space-y-6" data-testid="leaves-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Leave Management</h1>
          <p className="text-gray-600 text-sm mt-1">Apply and manage leave requests</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 text-white font-medium hover:bg-blue-700 h-10" data-testid="apply-leave-button">
              <Plus className="h-4 w-4 mr-2" />
              Apply Leave
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg bg-white border-0 shadow-2xl p-0">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold text-white">
                  Apply for Leave
                </DialogTitle>
                <p className="text-blue-100 text-sm">
                  Submit your leave request for approval
                </p>
              </DialogHeader>
            </div>
            <form onSubmit={handleSubmit} className="space-y-6 p-6">
              {canApprove ? (
                <div className="space-y-3">
                  <Label htmlFor="employee" className="text-sm font-semibold text-gray-700">Select Employee *</Label>
                  <select
                    id="employee"
                    data-testid="leave-employee-select"
                    value={formData.employee_id}
                    onChange={(e) => handleEmployeeChange(e.target.value)}
                    className="flex h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all"
                    required
                  >
                    <option value="">Select employee</option>
                    {employees.map((emp) => (
                      <option key={emp.employee_id} value={emp.employee_id}>
                        {emp.name} ({emp.employee_id})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <Label className="text-sm font-semibold text-blue-900">Employee Information</Label>
                  <div className="text-base font-medium text-gray-900">
                    {formData.employee_name || user?.name}
                  </div>
                  <div className="text-sm text-gray-600">
                    Employee ID: {user?.employee_id}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <Label htmlFor="leave_type" className="text-sm font-semibold text-gray-700">Leave Type *</Label>
                <select
                  id="leave_type"
                  data-testid="leave-type-select"
                  value={formData.leave_type}
                  onChange={(e) => setFormData({ ...formData, leave_type: e.target.value })}
                  className="flex h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all"
                  required
                >
                  <option value="Casual">Casual Leave</option>
                  <option value="Sick">Sick Leave</option>
                  <option value="Paid">Paid Leave</option>
                  <option value="WFH">Work From Home</option>
                  <option value="Half Day">Half Day</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <Label htmlFor="start_date" className="text-sm font-semibold text-gray-700">Start Date *</Label>
                  <Input
                    id="start_date"
                    type="date"
                    data-testid="leave-start-date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    required
                    className="h-11 border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div className="space-y-3">
                  <Label htmlFor="end_date" className="text-sm font-semibold text-gray-700">End Date *</Label>
                  <Input
                    id="end_date"
                    type="date"
                    data-testid="leave-end-date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    required
                    className="h-11 border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-semibold text-gray-700">Number of Days</Label>
                <Input
                  type="number"
                  value={formData.days}
                  readOnly
                  className="h-11 border border-gray-300 bg-gray-50"
                />
              </div>

              <div className="space-y-3">
                <Label htmlFor="reason" className="text-sm font-semibold text-gray-700">Reason for Leave *</Label>
                <textarea
                  id="reason"
                  data-testid="leave-reason"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  required
                  placeholder="Please provide a reason for your leave request..."
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setDialogOpen(false)} 
                  className="px-6 py-2 border-gray-300 text-gray-700 hover:bg-gray-50 font-medium"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="px-6 py-2 bg-blue-600 text-white hover:bg-blue-700 font-medium"
                  data-testid="submit-leave-button"
                >
                  Submit Application
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Status Tabs */}
      <Card className="p-3 border border-gray-200 bg-white">
        <div className="flex gap-2">
          {statusTabs.map((tab) => (
            <Button
              key={tab}
              variant={activeTab === tab ? 'default' : 'ghost'}
              size="sm"
              className={`h-9 ${
                activeTab === tab
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
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
          <Card key={leave.id} className="p-6 border border-gray-200 bg-white" data-testid={`leave-card-${leave.id}`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex-1 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{leave.employee_name}</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {leave.leave_type} Leave • {leave.days} {leave.days === 1 ? 'day' : 'days'}
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded text-xs font-medium ${
                    leave.status === 'Pending' ? 'bg-amber-50 text-amber-700' :
                    leave.status === 'Approved' ? 'bg-emerald-50 text-emerald-700' :
                    'bg-rose-50 text-rose-700'
                  }`}>
                    {leave.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Start Date</p>
                    <p className="font-mono font-medium text-gray-900">{leave.start_date}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">End Date</p>
                    <p className="font-mono font-medium text-gray-900">{leave.end_date}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Applied On</p>
                    <p className="font-mono text-xs text-gray-600">{new Date(leave.created_at).toLocaleDateString()}</p>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-gray-600 mb-1">Reason:</p>
                  <p className="text-sm text-gray-900">{leave.reason}</p>
                </div>

                {leave.approver_name && (
                  <p className="text-xs text-gray-600">
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
        <Card className="p-12 text-center border border-gray-200 bg-white">
          <Clock className="h-12 w-12 mx-auto mb-2 opacity-20" />
          <p className="text-gray-600">No leave requests found</p>
        </Card>
      )}
    </div>
  );
};