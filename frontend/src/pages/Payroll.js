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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const selectedEmp = employees.find(emp => emp.id === selectedEmployee);

  return (
    <div className="space-y-6" data-testid="payroll-page">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Payroll & Payslips</h1>
        <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">Generate and download employee payslips</p>
      </div>

      {/* Payslip Generator */}
      <Card className="p-6 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <h3 className="text-lg font-semibold mb-4 text-slate-900 dark:text-slate-50">Generate Payslip</h3>
        <div className="space-y-4">
          {canManagePayroll && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Select Employee</label>
              <select
                data-testid="payroll-employee-select"
                value={selectedEmployee}
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

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Select Month</label>
            <Input
              type="month"
              data-testid="payroll-month-input"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="border border-slate-200 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50 h-10"
            />
          </div>

          {selectedEmp && (
            <Card className="p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <h4 className="font-semibold mb-3 text-slate-900 dark:text-slate-50">Salary Breakdown</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Employee Name:</span>
                  <span className="font-medium text-slate-900 dark:text-slate-50">{selectedEmp.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Employee ID:</span>
                  <span className="font-mono font-medium text-slate-900 dark:text-slate-50">{selectedEmp.employee_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Department:</span>
                  <span className="font-medium text-slate-900 dark:text-slate-50">{selectedEmp.department}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Job Role:</span>
                  <span className="font-medium text-slate-900 dark:text-slate-50">{selectedEmp.job_role}</span>
                </div>
                <div className="h-px bg-slate-300 dark:bg-slate-600 my-3" />
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Basic Salary (50%):</span>
                  <span className="font-mono font-medium text-slate-900 dark:text-slate-50">₹{(selectedEmp.salary * 0.5).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">HRA (20%):</span>
                  <span className="font-mono font-medium text-slate-900 dark:text-slate-50">₹{(selectedEmp.salary * 0.2).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Allowances (30%):</span>
                  <span className="font-mono font-medium text-slate-900 dark:text-slate-50">₹{(selectedEmp.salary * 0.3).toLocaleString()}</span>
                </div>
                <div className="h-px bg-slate-300 dark:bg-slate-600 my-3" />
                <div className="flex justify-between text-base">
                  <span className="font-semibold text-slate-900 dark:text-slate-50">Gross Salary:</span>
                  <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">₹{selectedEmp.salary.toLocaleString()}</span>
                </div>
              </div>
            </Card>
          )}

          <Button
            className="w-full bg-indigo-600 text-white font-medium hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700 h-10"
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
      <Card className="p-6 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex items-start gap-4">
          <CreditCard className="h-6 w-6 text-indigo-600 dark:text-indigo-400 mt-1" />
          <div>
            <h3 className="font-semibold mb-2 text-slate-900 dark:text-slate-50">About Payroll</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
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
      className={`flex h-10 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-50 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400 ${className}`}
      {...props}
    />
  );
};