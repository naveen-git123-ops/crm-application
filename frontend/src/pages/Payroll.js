import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Download, CreditCard } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export const Payroll = () => {
  const { user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');

  useEffect(() => {
    fetchEmployees();
    // Set current month
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(currentMonth);
  }, []);

  useEffect(() => {
    if (user?.employee_id && !selectedEmployee) {
      setSelectedEmployee(user.employee_id);
    }
  }, [user]);

  const fetchEmployees = async () => {
    try {
      const response = await axios.get(`${API}/employees`);
      setEmployees(response.data);
    } catch (error) {
      toast.error('Failed to load employees');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPayslip = async () => {
    if (!selectedEmployee || !selectedMonth) {
      toast.error('Please select employee and month');
      return;
    }

    try {
      const response = await axios.get(
        `${API}/payroll/payslip/${selectedEmployee}?month=${selectedMonth}`,
        { responseType: 'blob' }
      );
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `payslip_${selectedMonth}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Payslip downloaded successfully');
    } catch (error) {
      toast.error('Failed to generate payslip');
    }
  };

  const canManagePayroll = ['Admin', 'HR'].includes(user?.role);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  const selectedEmp = employees.find(emp => emp.employee_id === selectedEmployee);

  return (
    <div className="space-y-6" data-testid="payroll-page">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Payroll & Payslips</h1>
        <p className="text-gray-600 text-sm mt-1">Generate and download employee payslips</p>
      </div>

      {/* Payslip Generator */}
      <Card className="p-6 rounded-lg border border-gray-200 bg-white shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Generate Payslip</h3>
        <div className="space-y-4">
          {canManagePayroll && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Employee</label>
              <select
                data-testid="payroll-employee-select"
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Month</label>
            <Input
              type="month"
              data-testid="payroll-month-input"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="border border-gray-300 h-10 rounded-lg text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </div>

          {selectedEmp && (
            <Card className="p-4 rounded-lg bg-gray-50 border border-gray-200">
              <h4 className="font-semibold text-gray-900 mb-3">Salary Breakdown</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Employee Name:</span>
                  <span className="font-medium text-gray-900">{selectedEmp.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Employee ID:</span>
                  <span className="font-mono font-medium text-gray-900">{selectedEmp.employee_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Department:</span>
                  <span className="font-medium text-gray-900">{selectedEmp.department}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Job Role:</span>
                  <span className="font-medium text-gray-900">{selectedEmp.job_role}</span>
                </div>
                <div className="h-px bg-gray-200 my-3" />
                <div className="flex justify-between">
                  <span className="text-gray-600">Basic Salary (50%):</span>
                  <span className="font-mono font-medium text-gray-900">₹{(selectedEmp.salary * 0.5).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">HRA (20%):</span>
                  <span className="font-mono font-medium text-gray-900">₹{(selectedEmp.salary * 0.2).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Allowances (30%):</span>
                  <span className="font-mono font-medium text-gray-900">₹{(selectedEmp.salary * 0.3).toLocaleString()}</span>
                </div>
                <div className="h-px bg-gray-200 my-3" />
                <div className="flex justify-between text-base">
                  <span className="font-semibold text-gray-900">Gross Salary:</span>
                  <span className="font-mono font-bold text-blue-600">₹{selectedEmp.salary.toLocaleString()}</span>
                </div>
              </div>
            </Card>
          )}

          <Button
            className="w-full bg-blue-600 text-white font-medium hover:bg-blue-700 h-10"
            onClick={handleDownloadPayslip}
            disabled={!selectedEmployee || !selectedMonth}
            data-testid="download-payslip-button"
          >
            <Download className="h-4 w-4 mr-2" />
            Download Payslip (PDF)
          </Button>
        </div>
      </Card>

      {/* Info Card */}
      <Card className="p-6 rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex items-start gap-4">
          <CreditCard className="h-6 w-6 text-blue-600 mt-1" />
          <div>
            <h3 className="font-semibold mb-2 text-gray-900">About Payroll</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              Payslips are automatically generated based on employee attendance records for the selected month. 
              The calculation includes basic salary, HRA, and allowances. Working days and total hours are 
              derived from the attendance system.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
};

const Input = ({ className, ...props }) => {
  return (
    <input
      className={`flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 ${className || ''}`}
      {...props}
    />
  );
};