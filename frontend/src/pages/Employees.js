import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useRegisterPageHeader } from '@/contexts/PageHeaderContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Search, Mail, Phone, Eye, EyeOff, Users, SearchX } from 'lucide-react';
import { Avatar, EmptyState, MiniStat, RowAction, StatusPill } from '@/components/ui/page';
import { isAdminOrHrUser } from '@/lib/permissions';

import { API_ENDPOINT, BACKEND_BASE_URL } from '@/lib/apiConfig';

const BACKEND_URL = BACKEND_BASE_URL;
const API = API_ENDPOINT;

export const Employees = () => {
  const { user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [filteredEmployees, setFilteredEmployees] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [visibleSalaries, setVisibleSalaries] = useState(() => new Set());
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    department: '',
    job_role: '',
    joining_date: '',
    salary: '',
    status: 'Active',
    address: '',
    emergency_contact: '',
    telegram_chat_id: '',
  });

  useEffect(() => {
    fetchEmployees();
  }, []);

  useEffect(() => {
    const filtered = employees.filter(emp =>
      emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.employee_id.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredEmployees(filtered);
  }, [searchTerm, employees]);

  const fetchEmployees = async () => {
    try {
      const response = await axios.get(`${API}/employees`);
      setEmployees(response.data);
      setFilteredEmployees(response.data);
    } catch (error) {
      toast.error('Failed to load employees');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingEmployee) {
        await axios.put(`${API}/employees/${editingEmployee.id}`, formData);
        toast.success('Employee updated successfully');
      } else {
        await axios.post(`${API}/employees`, formData);
        toast.success('Employee added successfully');
      }
      setDialogOpen(false);
      resetForm();
      fetchEmployees();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this employee?')) return;
    try {
      await axios.delete(`${API}/employees/${id}`);
      toast.success('Employee deleted successfully');
      fetchEmployees();
    } catch (error) {
      toast.error('Failed to delete employee');
    }
  };

  const handleEdit = (employee) => {
    setEditingEmployee(employee);
    setFormData({
      name: employee.name,
      email: employee.email,
      phone: employee.phone || '',
      department: employee.department,
      job_role: employee.job_role,
      joining_date: employee.joining_date,
      salary: employee.salary,
      status: employee.status || 'Active',
      address: employee.address || '',
      emergency_contact: employee.emergency_contact || '',
      telegram_chat_id: employee.telegram_chat_id || '',
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      department: '',
      job_role: '',
      joining_date: '',
      salary: '',
      status: 'Active',
      address: '',
      emergency_contact: '',
      telegram_chat_id: '',
    });
    setEditingEmployee(null);
  };

  const canManageEmployees = isAdminOrHrUser(user);

  const pageHeaderActions = useMemo(
    () =>
      canManageEmployees ? (
        <Button
          data-testid="add-employee-button"
          onClick={() => {
            resetForm();
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Employee
        </Button>
      ) : null,
    [canManageEmployees, resetForm],
  );

  useRegisterPageHeader({
    subtitle: `${employees.length} total employees`,
    actions: pageHeaderActions,
    enabled: !loading,
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div role="status" aria-label="Loading" className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="employees-page">
      {canManageEmployees && (
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
              <div className="border-b border-border px-6 py-5">
                <DialogHeader>
                  <DialogTitle className="text-xl font-semibold text-foreground">
                    {editingEmployee ? 'Edit Employee' : 'Add New Employee'}
                  </DialogTitle>
                  <p className="text-muted-foreground text-sm mt-1">
                    {editingEmployee ? 'Update employee details and save changes' : 'Create a new employee profile'}
                  </p>
                </DialogHeader>
              </div>
              <form onSubmit={handleSubmit} className="space-y-6 p-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm font-medium text-foreground">Full Name *</Label>
                    <Input
                      id="name"
                      data-testid="employee-name-input"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      className="border border-input h-11 focus:border-primary/60 focus:ring-2 focus:ring-ring/30"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium text-foreground">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      data-testid="employee-email-input"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                      className="border border-input h-11 focus:border-primary/60 focus:ring-2 focus:ring-ring/30"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm font-medium text-foreground">Phone</Label>
                    <Input
                      id="phone"
                      data-testid="employee-phone-input"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="border border-input h-11 focus:border-primary/60 focus:ring-2 focus:ring-ring/30"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="department" className="text-sm font-medium text-foreground">Department *</Label>
                    <Input
                      id="department"
                      data-testid="employee-department-input"
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      required
                      className="border border-input h-11 focus:border-primary/60 focus:ring-2 focus:ring-ring/30"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="job_role" className="text-sm font-medium text-foreground">Job Role *</Label>
                    <Input
                      id="job_role"
                      data-testid="employee-job-role-input"
                      value={formData.job_role}
                      onChange={(e) => setFormData({ ...formData, job_role: e.target.value })}
                      required
                      className="border border-input h-11 focus:border-primary/60 focus:ring-2 focus:ring-ring/30"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="joining_date" className="text-sm font-medium text-foreground">Joining Date *</Label>
                    <Input
                      id="joining_date"
                      type="date"
                      data-testid="employee-joining-date-input"
                      value={formData.joining_date}
                      onChange={(e) => setFormData({ ...formData, joining_date: e.target.value })}
                      required
                      className="border border-input h-11 focus:border-primary/60 focus:ring-2 focus:ring-ring/30"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="salary" className="text-sm font-medium text-foreground">Salary *</Label>
                    <Input
                      id="salary"
                      type="number"
                      data-testid="employee-salary-input"
                      value={formData.salary}
                      onChange={(e) => setFormData({ ...formData, salary: e.target.value })}
                      required
                      className="border border-input h-11 focus:border-primary/60 focus:ring-2 focus:ring-ring/30"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="emergency_contact" className="text-sm font-medium text-foreground">Emergency Contact</Label>
                    <Input
                      id="emergency_contact"
                      data-testid="employee-emergency-input"
                      value={formData.emergency_contact}
                      onChange={(e) => setFormData({ ...formData, emergency_contact: e.target.value })}
                      className="border border-input h-11 focus:border-primary/60 focus:ring-2 focus:ring-ring/30"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="telegram_chat_id" className="text-sm font-medium text-foreground">Telegram Chat ID</Label>
                    <Input
                      id="telegram_chat_id"
                      data-testid="employee-telegram-input"
                      value={formData.telegram_chat_id}
                      onChange={(e) => setFormData({ ...formData, telegram_chat_id: e.target.value })}
                      placeholder="Optional — e.g. 123456789"
                      className="border border-input h-11 focus:border-primary/60 focus:ring-2 focus:ring-ring/30"
                    />
                    <p className="text-xs text-muted-foreground">
                      Optional. Must be the numeric Chat ID (not your @username) — easiest way is Settings → Connect to Telegram, or leave empty and add later.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status" className="text-sm font-medium text-foreground">Status *</Label>
                    <select
                      id="status"
                      data-testid="employee-status-input"
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      required
                      className="w-full border border-input h-11 rounded-md px-3 text-sm text-foreground bg-white focus:border-primary/60 focus:ring-2 focus:ring-ring/30"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address" className="text-sm font-medium text-foreground">Address</Label>
                  <Input
                    id="address"
                    data-testid="employee-address-input"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="border border-input h-11 focus:border-primary/60 focus:ring-2 focus:ring-ring/30"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="border-input text-foreground hover:bg-muted">
                    Cancel
                  </Button>
                  <Button type="submit" data-testid="save-employee-button">
                    {editingEmployee ? 'Update' : 'Add'} Employee
                  </Button>
                </div>
              </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <MiniStat label="Total employees" value={employees.length} tone="brand" />
        <MiniStat label="Active" value={employees.filter((e) => e.status === 'Active').length} tone="success" />
        <MiniStat label="Inactive" value={employees.filter((e) => e.status !== 'Active').length} tone="neutral" />
        <MiniStat label="Departments" value={new Set(employees.map((e) => e.department).filter(Boolean)).size} tone="info" />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="relative w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              aria-label="Search employees"
              data-testid="employee-search-input"
              type="search"
              autoComplete="off"
              placeholder="Search name, email, department or ID"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-11 bg-muted/50 pl-10 [&::-webkit-search-cancel-button]:appearance-none"
            />
          </div>
          <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
            Showing <span className="font-bold text-foreground tabular-nums">{filteredEmployees.length}</span> of{' '}
            <span className="tabular-nums">{employees.length}</span>
          </p>
        </div>

        {filteredEmployees.length > 0 ? (
          <div className="overflow-x-auto table-scroll">
            <table className="app-table min-w-[820px]">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Contact</th>
                  <th>Department</th>
                  <th>Joined</th>
                  <th className="text-right">Salary</th>
                  <th>Status</th>
                  {canManageEmployees && <th className="text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((employee) => (
                  <tr key={employee.id} data-testid={`employee-card-${employee.employee_id}`}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Avatar name={employee.name} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">{employee.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            <span className="font-mono">{employee.employee_id}</span>
                            {employee.job_role ? ` · ${employee.job_role}` : ''}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="space-y-1 text-sm">
                        <span className="flex items-center gap-2 text-foreground">
                          <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                          <span className="max-w-[200px] truncate" title={employee.email}>{employee.email}</span>
                        </span>
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          {employee.phone || '—'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="inline-flex rounded-lg bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">
                        {employee.department || '—'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-muted-foreground">
                      {employee.joining_date
                        ? new Date(employee.joining_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—'}
                    </td>
                    <td className="text-right">
                      <span className="inline-flex items-center justify-end gap-1.5">
                        {user?.role === 'Admin' && visibleSalaries.has(employee.id) ? (
                          <span className="font-semibold tabular-nums text-foreground">₹{Number(employee.salary).toLocaleString('en-IN')}</span>
                        ) : (
                          <span className="font-mono tracking-widest text-muted-foreground" aria-label="Hidden">••••••</span>
                        )}
                        {user?.role === 'Admin' && (
                          <RowAction
                            label={visibleSalaries.has(employee.id) ? 'Hide salary' : 'Show salary'}
                            icon={visibleSalaries.has(employee.id) ? EyeOff : Eye}
                            onClick={() => setVisibleSalaries((prev) => {
                              const next = new Set(prev);
                              if (next.has(employee.id)) next.delete(employee.id);
                              else next.add(employee.id);
                              return next;
                            })}
                          />
                        )}
                      </span>
                    </td>
                    <td>
                      <StatusPill tone={employee.status === 'Active' ? 'success' : 'neutral'}>{employee.status}</StatusPill>
                    </td>
                    {canManageEmployees && (
                      <td>
                        <div className="flex justify-end gap-1">
                          <RowAction
                            label={`Edit ${employee.name}`}
                            icon={Edit}
                            onClick={() => handleEdit(employee)}
                            data-testid={`edit-employee-${employee.employee_id}`}
                          />
                          <RowAction
                            label={`Delete ${employee.name}`}
                            icon={Trash2}
                            tone="danger"
                            onClick={() => handleDelete(employee.id)}
                            data-testid={`delete-employee-${employee.employee_id}`}
                          />
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={searchTerm ? SearchX : Users}
            title={searchTerm ? 'No employees match your search' : 'No employees yet'}
            description={searchTerm ? 'Try a different name, email, department or ID.' : 'Add your first employee to get started.'}
            action={
              searchTerm ? (
                <Button type="button" variant="outline" onClick={() => setSearchTerm('')}>Clear search</Button>
              ) : null
            }
            className="rounded-none border-0 shadow-none"
          />
        )}
      </Card>
    </div>
  );
};