import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { LogOut, FileText, Calendar } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

export const Workspace = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [employees, setEmployees] = useState([]);
  const [filterEmployeeId, setFilterEmployeeId] = useState('');

  const canViewAll = ['Admin', 'HR', 'Manager'].includes(user?.role);

  useEffect(() => {
    fetchLogs();
    if (canViewAll) fetchEmployees();
  }, [selectedMonth, filterEmployeeId]);

  const fetchEmployees = async () => {
    try {
      const res = await axios.get(`${API}/employees`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setEmployees(res.data);
    } catch {
      // ignore
    }
  };

  const fetchLogs = async () => {
    try {
      const params = new URLSearchParams({ month: selectedMonth });
      if (canViewAll && filterEmployeeId) params.append('employee_id', filterEmployeeId);
      const response = await axios.get(`${API}/daily-work-logs?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setLogs(response.data);
    } catch (error) {
      toast.error('Failed to load work logs');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!summary.trim()) {
      toast.error('Please enter your day summary');
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    setSubmitting(true);
    try {
      await axios.post(
        `${API}/daily-work-logs`,
        {
          employee_id: user.employee_id,
          employee_name: user.name,
          log_date: today,
          summary: summary.trim()
        },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      toast.success('Daily work log submitted successfully');
      setSummary('');
      fetchLogs();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit work log');
    } finally {
      setSubmitting(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  if (loading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="workspace-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Workspace</h1>
        <p className="text-gray-600 text-sm mt-1">Log your day&apos;s work before you log off</p>
      </div>

      {/* Submit today's work log - only for users with employee_id */}
      {user?.employee_id && (
        <Card className="p-6 border border-gray-200 bg-white">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <LogOut className="h-5 w-5 text-amber-600" />
            End of Day Summary
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="summary" className="text-sm font-semibold text-gray-700">
                What did you work on today? (Brief summary)
              </Label>
              <textarea
                id="summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="e.g. Completed API for reports, fixed login bug, attended standup..."
                rows={4}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
              />
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="submit"
                disabled={submitting}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {submitting ? 'Submitting...' : 'Submit Work Log'}
              </Button>
              <span className="text-xs text-gray-500">Date: {today}</span>
            </div>
          </form>
        </Card>
      )}

      {/* Past logs */}
      <Card className="p-6 border border-gray-200 bg-white">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Work Log History
          </h2>
          <div className="flex gap-2 items-center">
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            {canViewAll && (
              <select
                value={filterEmployeeId}
                onChange={(e) => setFilterEmployeeId(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm min-w-[160px]"
              >
                <option value="">All employees</option>
                {employees.map((emp) => (
                  <option key={emp.employee_id} value={emp.employee_id}>
                    {emp.name} ({emp.employee_id})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {logs.map((log) => (
            <div
              key={log.id}
              className="border border-gray-100 rounded-lg p-4 bg-gray-50/50 hover:bg-gray-50"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="font-medium text-gray-900">{log.employee_name}</span>
                <span className="text-sm text-gray-500 flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {log.log_date}
                </span>
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{log.summary}</p>
            </div>
          ))}
        </div>

        {logs.length === 0 && (
          <div className="py-12 text-center text-gray-500">
            <FileText className="h-12 w-12 mx-auto mb-2 opacity-20" />
            <p>No work logs for this period</p>
          </div>
        )}
      </Card>
    </div>
  );
};
