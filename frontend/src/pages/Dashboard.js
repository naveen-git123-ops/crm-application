import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { Target, TrendingUp, TrendingDown, CheckCircle, XCircle, Clock, User, DollarSign, AlertCircle, Package, Briefcase } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

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
  const navigate = useNavigate();
  const [leadReport, setLeadReport] = useState(null);
  const [expiringSubscriptions, setExpiringSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingTasks, setPendingTasks] = useState([]);
  const [showTaskNotification, setShowTaskNotification] = useState(false);

  const canSeeLeads = ['Admin', 'HR', 'Manager'].includes(user?.role);

  useEffect(() => {
    if (canSeeLeads) {
      fetchLeadReport();
      fetchExpiringSubscriptions();
    } else {
      setLoading(false);
    }

    // Fetch pending tasks for employees
    if (user?.role === 'Employee') {
      fetchPendingTasks();
    }
  }, [user?.role]);

  const fetchPendingTasks = async () => {
    try {
      const response = await axios.get(`${API}/tasks`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const tasks = response.data || [];
      // Filter pending and in-progress tasks
      const pending = tasks.filter(t => ['Pending', 'In Progress'].includes(t.status));
      if (pending.length > 0) {
        setPendingTasks(pending);
        setShowTaskNotification(true);
      }
    } catch (err) {
      console.error('Failed to load pending tasks', err);
    }
  };

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

  const fetchExpiringSubscriptions = async () => {
    try {
      const response = await axios.get(`${API}/orders/search/expiring?days=30`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setExpiringSubscriptions(response.data || []);
    } catch (err) {
      console.error('Failed to load expiring subscriptions');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  // Task Notification Dialog (for employees)
  const taskNotificationDialog = (
    <Dialog open={showTaskNotification} onOpenChange={setShowTaskNotification}>
      <DialogContent className="max-w-md bg-white rounded-lg border border-gray-200 shadow-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <Briefcase className="h-5 w-5 text-blue-600" />
            You have assigned tasks!
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {pendingTasks.map((task) => (
            <div
              key={task.id}
              className="p-3 rounded-lg border border-blue-200 bg-blue-50"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <h4 className="font-semibold text-gray-900 text-sm">{task.title}</h4>
                <span className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${
                  task.status === 'In Progress' 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {task.status}
                </span>
              </div>
              {task.description && (
                <p className="text-xs text-gray-600 mb-2">{task.description}</p>
              )}
              <div className="flex items-center justify-between text-xs text-gray-600">
                <span>Due: {task.due_date}</span>
                {task.priority && (
                  <span className={`font-medium ${
                    task.priority === 'High' ? 'text-red-600' :
                    task.priority === 'Medium' ? 'text-yellow-600' :
                    'text-green-600'
                  }`}>
                    {task.priority} Priority
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-4 border-t border-gray-200">
          <Button
            variant="outline"
            onClick={() => setShowTaskNotification(false)}
            className="flex-1"
          >
            Later
          </Button>
          <Button
            onClick={() => {
              setShowTaskNotification(false);
              navigate('/tasks');
            }}
            className="flex-1 bg-blue-600 text-white hover:bg-blue-700"
          >
            View Tasks
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

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
    <div className="space-y-4 sm:space-y-6" data-testid="dashboard-page">
      {taskNotificationDialog}
      <div>
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-gray-900">Welcome back, {user?.name}!</h1>
        <p className="text-gray-600 text-sm mt-1">
          {canSeeLeads ? 'Sales & lead generation overview' : 'Dashboard'}
        </p>
      </div>

      {canSeeLeads && leadReport ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            <Card className="p-3 sm:p-5 rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center justify-between">
                <div className="p-2.5 rounded-lg bg-blue-50">
                  <Target className="h-5 w-5 text-blue-600" />
                </div>
              </div>
              <p className="text-xs font-medium text-gray-600 uppercase tracking-wider mt-2">Total Leads</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{leadReport.total}</p>
            </Card>
            <Card className="p-3 sm:p-5 rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="p-2.5 rounded-lg bg-green-50">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <p className="text-xs font-medium text-gray-600 uppercase tracking-wider mt-2">Won</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{wonCount}</p>
            </Card>
            <Card className="p-3 sm:p-5 rounded-lg border border-gray-200 bg-white shadow-sm col-span-2 lg:col-span-1">
              <div className="p-2.5 rounded-lg bg-red-50">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
              <p className="text-xs font-medium text-gray-600 uppercase tracking-wider mt-2">Lost</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{lostCount}</p>
            </Card>
            <Card className="p-3 sm:p-5 rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="p-2.5 rounded-lg bg-amber-50">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <p className="text-xs font-medium text-gray-600 uppercase tracking-wider mt-2">In Pipeline</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{pipelineCount}</p>
            </Card>
            <Card className="p-3 sm:p-5 rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="p-2.5 rounded-lg bg-green-50">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <p className="text-xs font-medium text-gray-600 uppercase tracking-wider mt-2">Value Won (₹)</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">
                {(leadReport.total_value_won ?? 0).toLocaleString('en-IN')}
              </p>
            </Card>
          </div>

          {/* Expiring Subscriptions Alert */}
          {expiringSubscriptions.length > 0 && (
            <Card className="p-4 sm:p-6 rounded-lg border-2 border-yellow-200 bg-yellow-50 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-lg bg-yellow-100">
                  <AlertCircle className="h-6 w-6 text-yellow-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-base sm:text-lg font-semibold text-yellow-900 mb-2">
                    Subscriptions Expiring Soon
                  </h3>
                  <p className="text-sm text-yellow-800 mb-3">
                    {expiringSubscriptions.length} customer subscription{expiringSubscriptions.length !== 1 ? 's' : ''} will expire within 30 days.
                    Consider reaching out to renew their service agreements.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {expiringSubscriptions.slice(0, 5).map((order) => (
                      <div key={order.id} className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                        <div className="font-medium">{order.customer_name}</div>
                        <div className="text-yellow-700">
                          {new Date(order.subscription_end_date).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                    {expiringSubscriptions.length > 5 && (
                      <div className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded font-medium">
                        +{expiringSubscriptions.length - 5} more
                      </div>
                    )}
                  </div>
                  <a
                    href="/leads"
                    className="inline-block mt-3 text-xs font-semibold text-yellow-700 hover:text-yellow-800 underline"
                  >
                    View all in Leads →
                  </a>
                </div>
              </div>
            </Card>
          )}

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <Card className="p-4 sm:p-6 rounded-lg border border-gray-200 bg-white shadow-sm">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">Leads by Outcome</h3>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
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
                <div className="h-[240px] flex items-center justify-center text-gray-500 text-sm">No lead data yet</div>
              )}
            </Card>

            <Card className="p-4 sm:p-6 rounded-lg border border-gray-200 bg-white shadow-sm">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">Monthly Lead Generation</h3>
              {barData.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
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
