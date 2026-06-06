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
import { Plus, Edit, Trash2, Search, Mail, Phone, Eye, EyeOff } from 'lucide-react';
import { isAdminOrHrUser } from '@/lib/permissions';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

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
    emergency_contact: ''
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
      emergency_contact: employee.emergency_contact || ''
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
      emergency_contact: ''
    });
    setEditingEmployee(null);
  };

  const canManageEmployees = isAdminOrHrUser(user);

  const pageHeaderActions = useMemo(
    () =>
      canManageEmployees ? (
        <Button
          className="bg-blue-600 text-white hover:bg-blue-700 h-9 sm:h-10 text-sm"
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
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
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-lg border border-gray-200 shadow-xl p-0">
              <div className="bg-blue-600 text-white p-6 rounded-t-lg">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold text-white">
                    {editingEmployee ? 'Edit Employee' : 'Add New Employee'}
                  </DialogTitle>
                  <p className="text-blue-100 text-sm mt-1">
                    {editingEmployee ? 'Update employee details and save changes' : 'Create a new employee profile'}
                  </p>
                </DialogHeader>
              </div>
              <form onSubmit={handleSubmit} className="space-y-6 p-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm font-medium text-gray-700">Full Name *</Label>
                    <Input
                      id="name"
                      data-testid="employee-name-input"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium text-gray-700">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      data-testid="employee-email-input"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                      className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm font-medium text-gray-700">Phone</Label>
                    <Input
                      id="phone"
                      data-testid="employee-phone-input"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="department" className="text-sm font-medium text-gray-700">Department *</Label>
                    <Input
                      id="department"
                      data-testid="employee-department-input"
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      required
                      className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="job_role" className="text-sm font-medium text-gray-700">Job Role *</Label>
                    <Input
                      id="job_role"
                      data-testid="employee-job-role-input"
                      value={formData.job_role}
                      onChange={(e) => setFormData({ ...formData, job_role: e.target.value })}
                      required
                      className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="joining_date" className="text-sm font-medium text-gray-700">Joining Date *</Label>
                    <Input
                      id="joining_date"
                      type="date"
                      data-testid="employee-joining-date-input"
                      value={formData.joining_date}
                      onChange={(e) => setFormData({ ...formData, joining_date: e.target.value })}
                      required
                      className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="salary" className="text-sm font-medium text-gray-700">Salary *</Label>
                    <Input
                      id="salary"
                      type="number"
                      data-testid="employee-salary-input"
                      value={formData.salary}
                      onChange={(e) => setFormData({ ...formData, salary: e.target.value })}
                      required
                      className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="emergency_contact" className="text-sm font-medium text-gray-700">Emergency Contact</Label>
                    <Input
                      id="emergency_contact"
                      data-testid="employee-emergency-input"
                      value={formData.emergency_contact}
                      onChange={(e) => setFormData({ ...formData, emergency_contact: e.target.value })}
                      className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status" className="text-sm font-medium text-gray-700">Status *</Label>
                    <select
                      id="status"
                      data-testid="employee-status-input"
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      required
                      className="w-full border border-gray-300 h-11 rounded-md px-3 text-sm text-gray-900 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address" className="text-sm font-medium text-gray-700">Address</Label>
                  <Input
                    id="address"
                    data-testid="employee-address-input"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="border-gray-300 text-gray-700 hover:bg-gray-50">
                    Cancel
                  </Button>
                  <Button type="submit" data-testid="save-employee-button" className="bg-blue-600 text-white hover:bg-blue-700">
                    {editingEmployee ? 'Update' : 'Add'} Employee
                  </Button>
                </div>
              </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Search */}
      <Card className="p-4 rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            data-testid="employee-search-input"
            placeholder="Search by name, email, department, or employee ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 border border-gray-300 h-10 rounded-lg text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
        </div>
      </Card>

      {/* Employees table grid */}
      <Card className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto table-scroll">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Employee ID</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Name</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Email</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Phone</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Department</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Job Role</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Joining Date</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700">Salary</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Status</th>
                {canManageEmployees && (
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((employee) => (
                <tr
                  key={employee.id}
                  className="border-b border-gray-100 hover:bg-gray-50/50"
                  data-testid={`employee-card-${employee.employee_id}`}
                >
                  <td className="py-3 px-4 font-mono text-gray-900">{employee.employee_id}</td>
                  <td className="py-3 px-4 font-medium text-gray-900">{employee.name}</td>
                  <td className="py-3 px-4 text-gray-600">
                    <span className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3 text-gray-400 shrink-0" />
                      <span className="truncate max-w-[180px]" title={employee.email}>{employee.email}</span>
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-600">
                    {employee.phone ? (
                      <span className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3 text-gray-400 shrink-0" />
                        {employee.phone}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-3 px-4 text-gray-600">{employee.department}</td>
                  <td className="py-3 px-4 text-gray-600">{employee.job_role}</td>
                  <td className="py-3 px-4 text-gray-600">{employee.joining_date}</td>
                  <td className="py-3 px-4 text-right">
                    <span className="inline-flex items-center gap-1.5 justify-end">
                      {user?.role === 'Admin' && visibleSalaries.has(employee.id) ? (
                        <span className="font-mono text-gray-900">₹{Number(employee.salary).toLocaleString('en-IN')}</span>
                      ) : (
                        <span className="font-mono text-gray-500 tracking-widest">****</span>
                      )}
                      {user?.role === 'Admin' && (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 min-h-0 min-w-0 bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100 hover:text-blue-800 shadow-sm"
                          onClick={() => setVisibleSalaries((prev) => {
                            const next = new Set(prev);
                            if (next.has(employee.id)) next.delete(employee.id);
                            else next.add(employee.id);
                            return next;
                          })}
                          aria-label={visibleSalaries.has(employee.id) ? 'Hide salary' : 'Show salary'}
                        >
                          {visibleSalaries.has(employee.id) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      )}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-medium ${
                      employee.status === 'Active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {employee.status}
                    </span>
                  </td>
                  {canManageEmployees && (
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 border-gray-200 text-gray-700 hover:bg-gray-50"
                          onClick={() => handleEdit(employee)}
                          data-testid={`edit-employee-${employee.employee_id}`}
                        >
                          <Edit className="h-3.5 w-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 border-gray-200 text-red-600 hover:bg-red-50"
                          onClick={() => handleDelete(employee.id)}
                          data-testid={`delete-employee-${employee.employee_id}`}
                        >
                          <Trash2 className="h-3.5 w-3 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {filteredEmployees.length === 0 && (
        <Card className="p-12 text-center rounded-lg border border-gray-200 bg-white shadow-sm">
          <p className="text-gray-600">No employees found</p>
        </Card>
      )}
    </div>
  );
};