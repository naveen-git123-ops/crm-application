import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  Plus,
  CheckCircle2,
  Clock,
  AlertCircle,
  Filter,
  Search,
  Edit2,
  Trash2,
  Play,
  Check,
  ChevronRight,
  Flag,
  User,
  Calendar,
  FileText,
  Send
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const PRIORITY_COLORS = {
  Low: 'bg-blue-50 text-blue-700 border-blue-200',
  Medium: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  High: 'bg-red-50 text-red-700 border-red-200',
};

const STATUS_COLORS = {
  Pending: 'bg-gray-50 text-gray-700',
  'In Progress': 'bg-blue-50 text-blue-700',
  Completed: 'bg-green-50 text-green-700',
  Overdue: 'bg-red-50 text-red-700',
  'Approval Pending': 'bg-purple-50 text-purple-700',
};

export const Tasks = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [filteredTasks, setFilteredTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [detailsSheetOpen, setDetailsSheetOpen] = useState(false);
  const [approvalsSheetOpen, setApprovalsSheetOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [filterType, setFilterType] = useState('my_tasks');
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'Medium',
    assigned_to_employee_id: '',
    due_date: '',
    estimated_time_minutes: '',
  });
  const [completionForm, setCompletionForm] = useState({
    completion_notes: '',
    actual_time_minutes: '',
  });
  const [editDetailsForm, setEditDetailsForm] = useState({
    completion_notes: '',
    actual_time_minutes: '',
  });
  const [carryForwardForm, setCarryForwardForm] = useState({
    reason: '',
  });
  const [editDetailsOpen, setEditDetailsOpen] = useState(false);

  useEffect(() => {
    console.log('🚀 Effect 1: user?.role or filterType changed');
    console.log('User role:', user?.role);
    console.log('User employee_id:', user?.employee_id);
    console.log('filterType:', filterType);
    
    fetchTasks();
    if (user?.role !== 'Employee') {
      fetchEmployees();
    }
    if (user?.role !== 'Employee') {
      fetchApprovals();
    }
  }, [user?.role, filterType]);

  useEffect(() => {
    console.log('🚀 Effect 2: tasks/filterType/searchTerm changed');
    console.log('Tasks count:', tasks?.length);
    console.log('filterType:', filterType);
    applyFilter();
  }, [tasks, filterType, searchTerm]);

  const fetchTasks = async () => {
    try {
      // For employees, always fetch their assigned tasks
      // For managers/admins, apply the filter if specified
      const params = {};
      if (filterType && filterType !== 'my_tasks') {
        params.filter_type = filterType;
      }
      
      console.log('🔍 Fetching tasks with params:', params);
      console.log('📍 User role:', user?.role);
      console.log('📍 User employee_id:', user?.employee_id);
      
      const response = await axios.get(`${API}/tasks`, {
        params,
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      
      console.log('✅ Tasks fetched:', response.data);
      console.log('📊 Total tasks:', response.data?.length || 0);
      
      setTasks(response.data || []);
      setLoading(false);
    } catch (error) {
      console.error('❌ Error fetching tasks:', error?.response?.data || error?.message);
      toast.error('Failed to load tasks');
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      const response = await axios.get(`${API}/employees`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setEmployees(response.data);
    } catch (error) {
      toast.error('Failed to load employees');
    }
  };

  const fetchApprovals = async () => {
    try {
      const response = await axios.get(`${API}/tasks/approvals/pending`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setApprovals(response.data);
    } catch (error) {
      console.error('Failed to load approvals');
    }
  };

  const applyFilter = () => {
    let filtered = tasks;
    
    console.log('🔄 Applying filter...');
    console.log('📌 Original tasks:', tasks?.length || 0);
    console.log('🏷️ Filter type:', filterType);
    console.log('🔍 Search term:', searchTerm);
    console.log('👤 User role:', user?.role);

    if (searchTerm) {
      filtered = filtered.filter(t =>
        t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      console.log('After search filter:', filtered?.length || 0);
    }

    // Only apply additional filter for managers/admins
    if (filterType === 'my_tasks' && user?.role !== 'Employee') {
      filtered = filtered.filter(t => t.created_by_employee_id === user?.employee_id);
      console.log('After creator filter:', filtered?.length || 0);
    }

    console.log('✨ Final filtered tasks:', filtered?.length || 0);
    setFilteredTasks(filtered);
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();

    if (!formData.title || !formData.assigned_to_employee_id || !formData.due_date) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      await axios.post(`${API}/tasks`, formData, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      toast.success('Task created successfully');
      setCreateDialogOpen(false);
      resetForm();
      fetchTasks();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create task');
    }
  };

  const handleUpdateStatus = async (taskId, newStatus) => {
    try {
      const endpoint =
        newStatus === 'In Progress'
          ? `/tasks/${taskId}/mark-in-progress`
          : `/tasks/${taskId}/complete`;

      // For completion, prepare the data
      const data = newStatus === 'Completed' ? {
        completion_notes: completionForm.completion_notes || '',
        actual_time_minutes: completionForm.actual_time_minutes ? parseInt(completionForm.actual_time_minutes) : null
      } : {};

      await axios.post(`${API}${endpoint}`, data, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      toast.success(`Task marked as ${newStatus}`);
      fetchTasks();
      setDetailsSheetOpen(false);
      setCompletionForm({ completion_notes: '', actual_time_minutes: '' });
    } catch (error) {
      console.error('Error updating task status:', error);
      toast.error(error.response?.data?.detail || 'Operation failed');
    }
  };

  const handleCarryForward = async (taskId) => {
    try {
      await axios.post(`${API}/tasks/${taskId}/request-carryforward`, carryForwardForm, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      toast.success('Carry forward request submitted');
      fetchTasks();
      setDetailsSheetOpen(false);
      setCarryForwardForm({ reason: '' });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to request carry forward');
    }
  };

  const handleApproveTask = async (approvalId, approved) => {
    try {
      await axios.post(`${API}/task-approvals/${approvalId}/decide`, {
        status: approved ? 'Approved' : 'Rejected',
        approval_comment: ''
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      toast.success(`Task ${approved ? 'approved' : 'rejected'}`);
      fetchApprovals();
      fetchTasks();
    } catch (error) {
      toast.error('Failed to process approval');
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    try {
      await axios.delete(`${API}/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      toast.success('Task deleted');
      fetchTasks();
    } catch (error) {
      toast.error('Failed to delete task');
    }
  };

  const handleOpenEditDetails = (task) => {
    setEditDetailsForm({
      completion_notes: task.completion_notes || '',
      actual_time_minutes: task.actual_time_minutes ? String(task.actual_time_minutes) : ''
    });
    setEditDetailsOpen(true);
  };

  const handleSaveEditDetails = async () => {
    if (!selectedTask) return;
    
    try {
      const data = {
        completion_notes: editDetailsForm.completion_notes || null,
        actual_time_minutes: editDetailsForm.actual_time_minutes ? parseInt(editDetailsForm.actual_time_minutes) : null
      };

      await axios.post(`${API}/tasks/${selectedTask.id}/update-completion`, data, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      
      toast.success('Task details updated');
      setEditDetailsOpen(false);
      fetchTasks();
      
      // Update selectedTask to reflect changes
      setSelectedTask({
        ...selectedTask,
        completion_notes: editDetailsForm.completion_notes,
        actual_time_minutes: editDetailsForm.actual_time_minutes ? parseInt(editDetailsForm.actual_time_minutes) : null
      });
    } catch (error) {
      console.error('Error updating task details:', error);
      toast.error(error.response?.data?.detail || 'Failed to update task details');
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      priority: 'Medium',
      assigned_to_employee_id: '',
      due_date: '',
      estimated_time_minutes: '',
    });
  };

  const canCreateTasks = ['Admin', 'Manager'].includes(user?.role);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4 h-full flex flex-col" data-testid="tasks-page">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-gray-900">Tasks</h1>
          <p className="text-gray-600 text-sm mt-1">
            {user?.role === 'Employee' 
              ? `${filteredTasks.length} task(s)` 
              : `${filteredTasks.length} task(s) ${approvals.length > 0 ? `• ${approvals.length} pending approval` : ''}`}
          </p>
        </div>
        <div className="flex gap-2">
          {approvals.length > 0 && user?.role !== 'Employee' && (
            <Button
              onClick={() => setApprovalsSheetOpen(true)}
              className="bg-purple-600 text-white hover:bg-purple-700"
            >
              <AlertCircle className="h-4 w-4 mr-2" />
              Approvals {approvals.length}
            </Button>
          )}
          {canCreateTasks && (
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-blue-600 text-white hover:bg-blue-700">
                  <Plus className="h-4 w-4 mr-2" />
                  New Task
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg bg-white rounded-lg border border-gray-200 shadow-xl p-0 max-h-[90vh] overflow-y-auto">
                <div className="bg-blue-600 text-white p-6 rounded-t-lg">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-bold text-white">Create New Task</DialogTitle>
                    <p className="text-blue-100 text-sm mt-1">Assign a task to an employee</p>
                  </DialogHeader>
                </div>
                <form onSubmit={handleCreateTask} className="space-y-4 p-6">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-gray-700">Task Title *</Label>
                    <Input
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="e.g., Prepare Q1 Report"
                      className="h-10 border border-gray-300"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-gray-700">Description</Label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Task details..."
                      rows={3}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-gray-700">Priority *</Label>
                      <select
                        value={formData.priority}
                        onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                        className="w-full h-10 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-gray-700">Due Date *</Label>
                      <Input
                        type="date"
                        value={formData.due_date}
                        onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                        className="h-10 border border-gray-300"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-gray-700">Assign To *</Label>
                    <select
                      value={formData.assigned_to_employee_id}
                      onChange={(e) => setFormData({ ...formData, assigned_to_employee_id: e.target.value })}
                      className="w-full h-10 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
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

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-gray-700">Estimated Time (minutes)</Label>
                    <Input
                      type="number"
                      value={formData.estimated_time_minutes}
                      onChange={(e) => setFormData({ ...formData, estimated_time_minutes: e.target.value })}
                      placeholder="e.g., 60"
                      className="h-10 border border-gray-300"
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCreateDialogOpen(false)}
                      className="border-gray-300 text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </Button>
                    <Button type="submit" className="bg-blue-600 text-white hover:bg-blue-700">
                      Create Task
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4 rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search tasks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 border border-gray-300 h-10 rounded-lg"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {['my_tasks', 'today', 'tomorrow', 'overdue', 'completed'].map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                  filterType === type
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {type === 'my_tasks' ? 'My Tasks' : type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-2 pb-4">
          {filteredTasks.length === 0 ? (
            <Card className="p-12 text-center rounded-lg border border-gray-200 bg-white shadow-sm">
              <p className="text-gray-600">No tasks found</p>
            </Card>
          ) : (
            filteredTasks.map((task) => (
              <Card
                key={task.id}
                className="p-4 rounded-lg border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => {
                  setSelectedTask(task);
                  setDetailsSheetOpen(true);
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-3 mb-2">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 truncate">{task.title}</h3>
                        <p className="text-sm text-gray-600 truncate">{task.description}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${PRIORITY_COLORS[task.priority]}`}>
                        <Flag className="h-3 w-3 mr-1" />
                        {task.priority}
                      </span>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[task.status]}`}>
                        {task.status === 'In Progress' && <Play className="h-3 w-3 mr-1" />}
                        {task.status === 'Completed' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                        {task.status === 'Overdue' && <AlertCircle className="h-3 w-3 mr-1" />}
                        {task.status}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {task.due_date}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {task.assigned_to_name}
                      </span>
                      {task.created_by_name && (
                        <span className="text-gray-400">by {task.created_by_name}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-1 flex-shrink-0">
                    {canCreateTasks && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0 border-gray-200 hover:bg-gray-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTask(task.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </>
                    )}
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Task Details Sheet */}
      <Sheet open={detailsSheetOpen} onOpenChange={setDetailsSheetOpen}>
        <SheetContent className="w-full sm:w-[500px] bg-white border-l border-gray-200">
          {selectedTask && (
            <div className="space-y-6 mt-8">
              <div>
                <SheetHeader>
                  <SheetTitle className="text-2xl font-bold text-gray-900">
                    {selectedTask.title}
                  </SheetTitle>
                  <p className="text-sm text-gray-600 mt-2">{selectedTask.description}</p>
                </SheetHeader>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-600 font-medium uppercase">Priority</p>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${PRIORITY_COLORS[selectedTask.priority]}`}>
                      {selectedTask.priority}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 font-medium uppercase">Status</p>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[selectedTask.status]}`}>
                      {selectedTask.status}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 font-medium uppercase">Due Date</p>
                    <p className="text-sm font-medium text-gray-900">{selectedTask.due_date}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 font-medium uppercase">Assigned To</p>
                    <p className="text-sm font-medium text-gray-900">{selectedTask.assigned_to_name}</p>
                  </div>
                </div>

                {selectedTask.estimated_time_minutes && (
                  <div>
                    <p className="text-xs text-gray-600 font-medium uppercase">Estimated Time</p>
                    <p className="text-sm font-medium text-gray-900">{selectedTask.estimated_time_minutes} minutes</p>
                  </div>
                )}

                {selectedTask.completed_at && (
                  <div>
                    <p className="text-xs text-gray-600 font-medium uppercase">Completed At</p>
                    <p className="text-sm font-medium text-gray-900">{new Date(selectedTask.completed_at).toLocaleString()}</p>
                  </div>
                )}

                {selectedTask.completion_notes && (
                  <div>
                    <p className="text-xs text-gray-600 font-medium uppercase">Completion Notes</p>
                    <p className="text-sm font-medium text-gray-900 whitespace-pre-wrap">{selectedTask.completion_notes}</p>
                  </div>
                )}

                {selectedTask.actual_time_minutes && (
                  <div>
                    <p className="text-xs text-gray-600 font-medium uppercase">Actual Time Spent</p>
                    <p className="text-sm font-medium text-gray-900">{selectedTask.actual_time_minutes} minutes</p>
                  </div>
                )}
              </div>

              {/* Edit Details Button for Employees */}
              {selectedTask.assigned_to_employee_id === user?.employee_id && 
               (selectedTask.status === 'Completed' || selectedTask.status === 'In Progress') && (
                <div className="pt-4">
                  <Dialog open={editDetailsOpen} onOpenChange={setEditDetailsOpen}>
                    <DialogTrigger asChild>
                      <Button
                        onClick={() => handleOpenEditDetails(selectedTask)}
                        variant="outline"
                        className="w-full border-blue-300 text-blue-700 hover:bg-blue-50"
                      >
                        <Edit2 className="h-4 w-4 mr-2" />
                        Edit Notes & Hours
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md bg-white rounded-lg border border-gray-200 shadow-xl">
                      <DialogHeader>
                        <DialogTitle className="text-lg font-bold text-gray-900">Edit Task Details</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-gray-700">Completion Notes</Label>
                          <textarea
                            value={editDetailsForm.completion_notes}
                            onChange={(e) => setEditDetailsForm({ ...editDetailsForm, completion_notes: e.target.value })}
                            placeholder="What did you accomplish?"
                            rows={4}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-gray-700">Actual Time (minutes)</Label>
                          <Input
                            type="number"
                            value={editDetailsForm.actual_time_minutes}
                            onChange={(e) => setEditDetailsForm({ ...editDetailsForm, actual_time_minutes: e.target.value })}
                            placeholder="e.g., 45"
                          />
                        </div>
                        <div className="flex gap-2 pt-4">
                          <Button
                            variant="outline"
                            onClick={() => setEditDetailsOpen(false)}
                            className="flex-1"
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={handleSaveEditDetails}
                            className="flex-1 bg-blue-600 text-white hover:bg-blue-700"
                          >
                            Save Changes
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              )}

              {/* Employee Actions */}
              {selectedTask.assigned_to_employee_id === user?.employee_id && selectedTask.status !== 'Completed' && (
                <div className="pt-4 border-t border-gray-200 space-y-3">
                  {selectedTask.status === 'Pending' && (
                    <Button
                      onClick={() => handleUpdateStatus(selectedTask.id, 'In Progress')}
                      className="w-full bg-blue-600 text-white hover:bg-blue-700"
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Start Task
                    </Button>
                  )}

                  {selectedTask.status === 'In Progress' && (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-gray-700">Completion Notes</Label>
                        <textarea
                          value={completionForm.completion_notes}
                          onChange={(e) => setCompletionForm({ ...completionForm, completion_notes: e.target.value })}
                          placeholder="What did you accomplish?"
                          rows={3}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-gray-700">Actual Time (minutes)</Label>
                        <Input
                          type="number"
                          value={completionForm.actual_time_minutes}
                          onChange={(e) => setCompletionForm({ ...completionForm, actual_time_minutes: e.target.value })}
                          placeholder="e.g., 45"
                        />
                      </div>
                      <Button
                        onClick={() => handleUpdateStatus(selectedTask.id, 'Completed')}
                        className="w-full bg-green-600 text-white hover:bg-green-700"
                      >
                        <Check className="h-4 w-4 mr-2" />
                        Mark as Completed
                      </Button>
                    </div>
                  )}

                  {(selectedTask.status === 'Pending' || selectedTask.status === 'In Progress') && (
                    <div className="pt-2 space-y-2">
                      <Label className="text-sm font-medium text-gray-700">Need more time?</Label>
                      <textarea
                        value={carryForwardForm.reason}
                        onChange={(e) => setCarryForwardForm({ ...carryForwardForm, reason: e.target.value })}
                        placeholder="Why can't you complete this today?"
                        rows={2}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none"
                      />
                      <Button
                        onClick={() => handleCarryForward(selectedTask.id)}
                        variant="outline"
                        className="w-full border-orange-300 text-orange-700 hover:bg-orange-50"
                      >
                        <AlertCircle className="h-4 w-4 mr-2" />
                        Request Carry Forward
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Approvals Sheet */}
      <Sheet open={approvalsSheetOpen} onOpenChange={setApprovalsSheetOpen}>
        <SheetContent className="w-full sm:w-[500px] bg-white border-l border-gray-200">
          <SheetHeader className="mt-8">
            <SheetTitle>Pending Approvals</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            {approvals.length === 0 ? (
              <p className="text-gray-600 text-center py-8">No pending approvals</p>
            ) : (
              approvals.map((approval) => (
                <Card key={approval.id} className="p-4 border border-gray-200 rounded-lg">
                  <div className="space-y-2 mb-3">
                    <p className="font-semibold text-gray-900">{approval.requested_by_name}</p>
                    <p className="text-xs text-gray-600">{approval.task_id}</p>
                    {approval.reason && (
                      <p className="text-sm text-gray-700 italic">"{approval.reason}"</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleApproveTask(approval.id, true)}
                      className="flex-1 bg-green-600 text-white hover:bg-green-700 h-9"
                      size="sm"
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                    <Button
                      onClick={() => handleApproveTask(approval.id, false)}
                      variant="outline"
                      className="flex-1 border-red-300 text-red-700 hover:bg-red-50 h-9"
                      size="sm"
                    >
                      <AlertCircle className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};
