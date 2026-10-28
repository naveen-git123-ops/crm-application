import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Download, CreditCard } from 'lucide-react';

import { API_ENDPOINT, BACKEND_BASE_URL } from '@/lib/apiConfig';

const BACKEND_URL = BACKEND_BASE_URL;
const API = API_ENDPOINT;

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
        <div role="status" aria-label="Loading" className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    );
  }

  const selectedEmp = employees.find(emp => emp.employee_id === selectedEmployee);

  return (
    <div className="space-y-6" data-testid="payroll-page">
      {/* Header */}
      <div>
        <h1 className="text-[1.35rem] sm:text-2xl font-semibold tracking-tight text-foreground">Payroll & Payslips</h1>
        <p className="text-muted-foreground text-sm mt-1">Generate and download employee payslips</p>
      </div>

      {/* Payslip Generator */}
      <Card className="p-5 sm:p-6">
        <h3 className="text-sm font-semibold tracking-tight text-foreground mb-4">Generate Payslip</h3>
        <div className="space-y-4">
          {canManagePayroll && (
            <div>
              <label htmlFor="payroll-field-1" className="block text-sm font-medium text-foreground mb-2">Select Employee</label>
              <select id="payroll-field-1"
                data-testid="payroll-employee-select"
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-input bg-white px-3 py-2 text-sm text-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-ring/30"
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
            <label htmlFor="payroll-field-2" className="block text-sm font-medium text-foreground mb-2">Select Month</label>
            <Input id="payroll-field-2"
              type="month"
              data-testid="payroll-month-input"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="border border-input h-10 rounded-lg text-foreground focus:border-primary/60 focus:ring-2 focus:ring-ring/30"
            />
          </div>

          {selectedEmp && (
            <Card className="p-4 rounded-lg bg-muted border border-border">
              <h4 className="font-semibold text-foreground mb-3">Salary Breakdown</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Employee Name:</span>
                  <span className="font-medium text-foreground">{selectedEmp.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Employee ID:</span>
                  <span className="font-mono font-medium text-foreground">{selectedEmp.employee_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Department:</span>
                  <span className="font-medium text-foreground">{selectedEmp.department}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Job Role:</span>
                  <span className="font-medium text-foreground">{selectedEmp.job_role}</span>
                </div>
                <div className="h-px bg-gray-200 my-3" />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Basic Salary (50%):</span>
                  <span className="font-mono font-medium text-foreground">₹{(selectedEmp.salary * 0.5).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">HRA (20%):</span>
                  <span className="font-mono font-medium text-foreground">₹{(selectedEmp.salary * 0.2).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Allowances (30%):</span>
                  <span className="font-mono font-medium text-foreground">₹{(selectedEmp.salary * 0.3).toLocaleString()}</span>
                </div>
                <div className="h-px bg-gray-200 my-3" />
                <div className="flex justify-between text-base">
                  <span className="font-semibold text-foreground">Gross Salary:</span>
                  <span className="font-mono font-bold text-accent-foreground">₹{selectedEmp.salary.toLocaleString()}</span>
                </div>
              </div>
            </Card>
          )}

          <Button
            className="w-full bg-primary text-white font-medium hover:bg-primary/90 h-10"
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
      <Card className="p-6 rounded-lg border border-border bg-white shadow-sm">
        <div className="flex items-start gap-4">
          <CreditCard className="h-6 w-6 text-accent-foreground mt-1" />
          <div>
            <h3 className="font-semibold mb-2 text-foreground">About Payroll</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
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
      className={`flex h-10 w-full rounded-lg border border-input bg-white px-3 py-2 text-sm text-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-ring/30 ${className || ''}`}
      {...props}
    />
  );
};