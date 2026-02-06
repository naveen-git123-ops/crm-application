import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { Target, TrendingUp, TrendingDown, CheckCircle, XCircle, Clock, User, DollarSign } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

const STATUS_COLORS = {
  New: '#94a3b8',
  Contacted: '#60a5fa',
  Qualified: '#38bdf8',
  Proposal: '#818cf8',
  Negotiation: '#a78bfa',
  Won: '#22c55e',
  Lost: '#ef4444',
};

export const Dashboard = () => {
  const { user } = useAuth();
  const [leadReport, setLeadReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const canSeeLeads = ['Admin', 'HR', 'Manager'].includes(user?.role);

  useEffect(() => {
    if (canSeeLeads) {
      fetchLeadReport();
    } else {
      setLoading(false);
    }
  }, [user?.role]);

  const fetchLeadReport = async () => {
    try {
      const response = await axios.get(`${API}/leads/dashboard-report`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setLeadReport(response.data);
    } catch (err) {
      toast.error('Failed to load lead report');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  // Build pie data: Won, Lost, Pipeline (rest)
  const wonCount = leadReport?.by_status?.Won ?? 0;
  const lostCount = leadReport?.by_status?.Lost ?? 0;
  const pipelineCount = (leadReport?.total ?? 0) - wonCount - lostCount;
  const pieData = [
    { name: 'Won', value: wonCount, color: '#22c55e' },
    { name: 'Lost', value: lostCount, color: '#ef4444' },
    { name: 'Pipeline', value: pipelineCount, color: '#3b82f6' },
  ].filter((d) => d.value > 0);

  const barData = (leadReport?.monthly ?? []).map((m) => ({
    name: m.month,
    leads: m.count,
  }));

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Welcome back, {user?.name}!</h1>
        <p className="text-gray-600 text-sm mt-1">
          {canSeeLeads ? 'Sales & lead generation overview' : 'Dashboard'}
        </p>
      </div>

      {canSeeLeads && leadReport ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card className="p-5 rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center justify-between">
                <div className="p-2.5 rounded-lg bg-blue-50">
                  <Target className="h-5 w-5 text-blue-600" />
                </div>
              </div>
              <p className="text-xs font-medium text-gray-600 uppercase tracking-wider mt-2">Total Leads</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{leadReport.total}</p>
            </Card>
            <Card className="p-5 rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="p-2.5 rounded-lg bg-green-50">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <p className="text-xs font-medium text-gray-600 uppercase tracking-wider mt-2">Won</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{wonCount}</p>
            </Card>
            <Card className="p-5 rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="p-2.5 rounded-lg bg-red-50">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
              <p className="text-xs font-medium text-gray-600 uppercase tracking-wider mt-2">Lost</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{lostCount}</p>
            </Card>
            <Card className="p-5 rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="p-2.5 rounded-lg bg-amber-50">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <p className="text-xs font-medium text-gray-600 uppercase tracking-wider mt-2">In Pipeline</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{pipelineCount}</p>
            </Card>
            <Card className="p-5 rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="p-2.5 rounded-lg bg-green-50">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <p className="text-xs font-medium text-gray-600 uppercase tracking-wider mt-2">Value Won (₹)</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {(leadReport.total_value_won ?? 0).toLocaleString('en-IN')}
              </p>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-6 rounded-lg border border-gray-200 bg-white shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Leads by Outcome</h3>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      nameKey="name"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [value, 'Leads']} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-gray-500">No lead data yet</div>
              )}
            </Card>

            <Card className="p-6 rounded-lg border border-gray-200 bg-white shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Lead Generation</h3>
              {barData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={barData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="leads" name="Leads" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-gray-500">No monthly data yet</div>
              )}
            </Card>
          </div>

          {/* Leads by status breakdown */}
          <Card className="p-6 rounded-lg border border-gray-200 bg-white shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Leads by Status</h3>
            <div className="flex flex-wrap gap-3">
              {Object.entries(leadReport.by_status || {}).map(([status, count]) => (
                <div
                  key={status}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-gray-50"
                >
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: STATUS_COLORS[status] || '#94a3b8' }}
                  />
                  <span className="text-sm font-medium text-gray-700">{status}</span>
                  <span className="text-sm font-bold text-gray-900">{count}</span>
                </div>
              ))}
              {Object.keys(leadReport.by_status || {}).length === 0 && (
                <p className="text-gray-500 text-sm">No leads yet</p>
              )}
            </div>
          </Card>

          {/* Who generated how many leads (by assignee) */}
          <Card className="p-6 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Leads by Owner (Who Generated)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Owner</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-700">Total</th>
                    <th className="text-right py-3 px-4 font-medium text-green-700">Won</th>
                    <th className="text-right py-3 px-4 font-medium text-red-700">Lost</th>
                    <th className="text-right py-3 px-4 font-medium text-amber-700">Pipeline</th>
                  </tr>
                </thead>
                <tbody>
                  {(leadReport.by_assignee || []).map((row) => (
                    <tr key={row.employee_id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-gray-400" />
                          <span className="font-medium text-gray-900">{row.employee_name}</span>
                          {row.employee_id !== 'Unassigned' && (
                            <span className="text-xs text-gray-500">({row.employee_id})</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-gray-900">{row.total}</td>
                      <td className="py-3 px-4 text-right text-green-700 font-medium">{row.won}</td>
                      <td className="py-3 px-4 text-right text-red-700 font-medium">{row.lost}</td>
                      <td className="py-3 px-4 text-right text-amber-700 font-medium">{row.pipeline}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(!leadReport.by_assignee || leadReport.by_assignee.length === 0) && (
              <p className="text-center py-8 text-gray-500">No assignee data yet</p>
            )}
          </Card>
        </>
      ) : (
        <Card className="p-8 rounded-lg border border-gray-200 bg-white shadow-sm text-center">
          <Target className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Sales & Lead Reports</h3>
          <p className="text-sm text-gray-600">
            Lead generation and sales reports are available to Admin, HR, and Manager. Use the Leads section to manage your pipeline.
          </p>
        </Card>
      )}
    </div>
  );
};
