import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Search, Mail, Phone } from 'lucide-react';

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
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    department: '',
    job_role: '',
    joining_date: '',
    salary: '',
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
      address: '',
      emergency_contact: ''
    });
    setEditingEmployee(null);
  };

  const canManageEmployees = ['Admin', 'HR'].includes(user?.role);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="employees-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Employees</h1>
          <p className="text-gray-600 text-sm mt-1">{employees.length} total employees</p>
        </div>
        {canManageEmployees && (
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button className="bg-indigo-600 text-white font-medium hover:bg-indigo-700 h-10" data-testid="add-employee-button">
                <Plus className="h-4 w-4 mr-2" />
                Add Employee
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-gray-900">{editingEmployee ? 'Edit Employee' : 'Add New Employee'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm font-medium text-gray-700">Full Name *</Label>
                    <Input
                      id="name"
                      data-testid="employee-name-input"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      className="border border-gray-200 h-10"
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
                      className="border border-gray-200 h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm font-medium text-gray-700">Phone</Label>
                    <Input
                      id="phone"
                      data-testid="employee-phone-input"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="border border-gray-200 h-10"
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
                      className="border border-gray-200 h-10"
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
                      className="border border-gray-200 h-10"
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
                      className="border border-gray-200 h-10"
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
                      className="border border-gray-200 h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="emergency_contact" className="text-sm font-medium text-gray-700">Emergency Contact</Label>
                    <Input
                      id="emergency_contact"
                      data-testid="employee-emergency-input"
                      value={formData.emergency_contact}
                      onChange={(e) => setFormData({ ...formData, emergency_contact: e.target.value })}
                      className="border border-gray-200 h-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address" className="text-sm font-medium text-gray-700">Address</Label>
                  <Input
                    id="address"
                    data-testid="employee-address-input"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="border border-gray-200 h-10"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
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
      </div>

      {/* Search */}
      <Card className="p-4 border border-gray-200 bg-white">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            data-testid="employee-search-input"
            placeholder="Search by name, email, department, or employee ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 border border-gray-200 h-10"
          />
        </div>
      </Card>

      {/* Employees Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredEmployees.map((employee) => (
          <Card key={employee.id} className="p-6 border border-gray-200 bg-white hover:shadow-md transition-shadow" data-testid={`employee-card-${employee.employee_id}`}>
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-xs uppercase tracking-widest text-gray-600 mb-1">
                    {employee.employee_id}
                  </p>
                  <h3 className="text-lg font-semibold text-gray-900">{employee.name}</h3>
                  <p className="text-sm text-gray-600">{employee.job_role}</p>
                </div>
                <span className={`px-2.5 py-1 rounded text-xs font-medium ${
                  employee.status === 'Active'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-gray-100 text-gray-700'
                }`}>
                  {employee.status}
                </span>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <Mail className="h-4 w-4" />
                  <span className="truncate">{employee.email}</span>
                </div>
                {employee.phone && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Phone className="h-4 w-4" />
                    <span>{employee.phone}</span>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-gray-200 flex justify-between items-center">
                <div>
                  <p className="text-xs text-gray-600">Department</p>
                  <p className="text-sm font-medium text-gray-900">{employee.department}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-600">Salary</p>
                  <p className="text-sm font-mono font-medium text-gray-900">₹{employee.salary.toLocaleString()}</p>
                </div>
              </div>

              {canManageEmployees && (
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-9 border-gray-200 text-gray-700 hover:bg-gray-50"
                    onClick={() => handleEdit(employee)}
                    data-testid={`edit-employee-${employee.employee_id}`}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-9 border-gray-200 text-rose-600 hover:bg-rose-50"
                    onClick={() => handleDelete(employee.id)}
                    data-testid={`delete-employee-${employee.employee_id}`}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      {filteredEmployees.length === 0 && (
        <Card className="p-12 text-center border border-gray-200 bg-white">
          <p className="text-gray-600">No employees found</p>
        </Card>
      )}
    </div>
  );
};