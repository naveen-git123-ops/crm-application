import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '@/contexts/AuthContext';
import { Target, CheckCircle, XCircle, Clock, User, DollarSign, AlertCircle, Briefcase } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { API_ENDPOINT, BACKEND_BASE_URL } from '@/lib/apiConfig';
import { EmptyState, LoadingState, Page, PageIntro, SectionHeader, StatCard, Surface } from '@/components/ui/page';

const BACKEND_URL = BACKEND_BASE_URL;
const API = API_ENDPOINT;

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
    return <LoadingState />;
  }

  const taskNotificationDialog = (
    <Dialog open={showTaskNotification} onOpenChange={setShowTaskNotification}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <Briefcase className="h-5 w-5 text-primary" />
            You have assigned tasks
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {pendingTasks.map((task) => (
            <div
              key={task.id}
              className="p-3 rounded-xl border border-border bg-muted/40"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <h4 className="font-semibold text-foreground text-sm">{task.title}</h4>
                <span className={`text-[11px] font-semibold px-2 py-1 rounded-md whitespace-nowrap ${
                  task.status === 'In Progress' 
                    ? 'bg-indigo-50 text-indigo-700' 
                    : 'bg-amber-50 text-amber-800'
                }`}>
                  {task.status}
                </span>
              </div>
              {task.description && (
                <p className="text-xs text-muted-foreground mb-2">{task.description}</p>
              )}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Due: {task.due_date}</span>
                {task.priority && (
                  <span className={`font-medium ${
                    task.priority === 'High' ? 'text-rose-600' :
                    task.priority === 'Medium' ? 'text-amber-600' :
                    'text-emerald-600'
                  }`}>
                    {task.priority} Priority
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-4 border-t border-border">
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
            className="flex-1"
          >
            View Tasks
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  const wonCount = leadReport?.by_status?.Won ?? 0;
  const lostCount = leadReport?.by_status?.Lost ?? 0;
  const pipelineCount = (leadReport?.total ?? 0) - wonCount - lostCount;
  const pieData = [
    { name: 'Won', value: wonCount, color: '#22c55e' },
    { name: 'Lost', value: lostCount, color: '#ef4444' },
    { name: 'Pipeline', value: pipelineCount, color: '#6366f1' },
  ].filter((d) => d.value > 0);

  const barData = (leadReport?.monthly ?? []).map((m) => ({
    name: m.month,
    leads: m.count,
  }));

  return (
    <Page data-testid="dashboard-page">
      {taskNotificationDialog}
      <PageIntro
        title={`Welcome back, ${user?.name}`}
        description={canSeeLeads ? 'Sales and pipeline snapshot for the current workspace.' : 'Your daily operating overview.'}
      />

      {canSeeLeads && leadReport ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            <StatCard icon={Target} label="Total Leads" value={leadReport.total} tone="default" />
            <StatCard icon={CheckCircle} label="Won" value={wonCount} tone="success" />
            <StatCard icon={XCircle} label="Lost" value={lostCount} tone="danger" className="col-span-2 lg:col-span-1" />
            <StatCard icon={Clock} label="In Pipeline" value={pipelineCount} tone="warning" />
            <StatCard
              icon={DollarSign}
              label="Value Won (₹)"
              value={(leadReport.total_value_won ?? 0).toLocaleString('en-IN')}
              tone="success"
            />
          </div>

          {expiringSubscriptions.length > 0 && (
            <Surface className="border-amber-200 bg-amber-50/70">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
                  <AlertCircle className="h-5 w-5 text-amber-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-amber-950">
                    Subscriptions expiring soon
                  </h3>
                  <p className="text-sm text-amber-800 mt-1">
                    {expiringSubscriptions.length} customer subscription{expiringSubscriptions.length !== 1 ? 's' : ''} will expire within 30 days.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {expiringSubscriptions.slice(0, 5).map((order) => (
                      <div key={order.id} className="text-xs bg-white/80 text-amber-900 px-2.5 py-1.5 rounded-md border border-amber-200">
                        <div className="font-medium">{order.customer_name}</div>
                        <div className="text-amber-700">
                          {new Date(order.subscription_end_date).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                    {expiringSubscriptions.length > 5 && (
                      <div className="text-xs bg-white/80 text-amber-900 px-2.5 py-1.5 rounded-md border border-amber-200 font-medium">
                        +{expiringSubscriptions.length - 5} more
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/leads')}
                    className="inline-block mt-3 text-xs font-semibold text-amber-800 hover:text-amber-950"
                  >
                    View all in Leads →
                  </button>
                </div>
              </div>
            </Surface>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
            <Surface>
              <SectionHeader title="Leads by outcome" />
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={96}
                      paddingAngle={3}
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
                <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">No lead data yet</div>
              )}
            </Surface>

            <Surface>
              <SectionHeader title="Monthly lead generation" />
              {barData.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={barData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#667085' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#667085' }} />
                    <Tooltip />
                    <Bar dataKey="leads" name="Leads" fill="#6366f1" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">No monthly data yet</div>
              )}
            </Surface>
          </div>

          <Surface>
            <SectionHeader title="Leads by status" />
            <div className="flex flex-wrap gap-2">
              {Object.entries(leadReport.by_status || {}).map(([status, count]) => (
                <div
                  key={status}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/40"
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: STATUS_COLORS[status] || '#94a3b8' }}
                  />
                  <span className="text-sm font-medium text-foreground">{status}</span>
                  <span className="text-sm font-semibold tabular-nums text-muted-foreground">{count}</span>
                </div>
              ))}
              {Object.keys(leadReport.by_status || {}).length === 0 && (
                <p className="text-muted-foreground text-sm">No leads yet</p>
              )}
            </div>
          </Surface>

          <Surface padded={false} className="overflow-hidden">
            <div className="px-5 pt-5">
              <SectionHeader title="Leads by owner" />
            </div>
            <div className="overflow-x-auto table-scroll">
              <table className="app-table">
                <thead>
                  <tr>
                    <th>Owner</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Won</th>
                    <th className="text-right">Lost</th>
                    <th className="text-right">Pipeline</th>
                  </tr>
                </thead>
                <tbody>
                  {(leadReport.by_assignee || []).map((row) => (
                    <tr key={row.employee_id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{row.employee_name}</span>
                          {row.employee_id !== 'Unassigned' && (
                            <span className="text-xs text-muted-foreground">({row.employee_id})</span>
                          )}
                        </div>
                      </td>
                      <td className="text-right font-medium tabular-nums">{row.total}</td>
                      <td className="text-right text-emerald-700 font-medium tabular-nums">{row.won}</td>
                      <td className="text-right text-rose-700 font-medium tabular-nums">{row.lost}</td>
                      <td className="text-right text-amber-700 font-medium tabular-nums">{row.pipeline}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(!leadReport.by_assignee || leadReport.by_assignee.length === 0) && (
              <p className="text-center py-8 text-muted-foreground text-sm">No assignee data yet</p>
            )}
          </Surface>
        </>
      ) : (
        <EmptyState
          icon={Target}
          title="Sales & lead reports"
          description="Lead generation and sales reports are available to Admin, HR, and Manager. Use the Leads section to manage your pipeline."
        />
      )}
    </Page>
  );
};
