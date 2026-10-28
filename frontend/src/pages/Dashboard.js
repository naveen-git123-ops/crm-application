import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '@/contexts/AuthContext';
import { Target, CheckCircle, XCircle, Clock, DollarSign, AlertCircle, Briefcase, CheckSquare, CalendarCheck, ArrowRight, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { API_ENDPOINT, BACKEND_BASE_URL } from '@/lib/apiConfig';
import { EmptyState, HeroAction, HeroBanner, LoadingState, Page, SectionHeader, StatCard, Surface } from '@/components/ui/page';

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

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

const AVATAR_GRADIENTS = [
  'from-indigo-500 to-violet-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-sky-500 to-cyan-500',
  'from-rose-500 to-pink-500',
];

function ChartTooltip({ active, payload, label, unit = 'Leads' }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3.5 py-2.5 shadow-lift">
      {label ? <p className="text-xs font-semibold text-muted-foreground">{label}</p> : null}
      {payload.map((p) => (
        <p key={p.name} className="mt-0.5 flex items-center gap-2 text-sm font-bold text-foreground">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.payload?.color || p.color || p.fill }} />
          {p.name}: <span className="tabular-nums">{p.value}</span> <span className="font-medium text-muted-foreground">{unit.toLowerCase()}</span>
        </p>
      ))}
    </div>
  );
}

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
                <span className={`text-xs font-semibold px-2 py-1 rounded-md whitespace-nowrap ${
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
  const winRate = wonCount + lostCount > 0 ? Math.round((wonCount / (wonCount + lostCount)) * 100) : 0;
  const pieData = [
    { name: 'Won', value: wonCount, color: '#22c55e' },
    { name: 'Lost', value: lostCount, color: '#ef4444' },
    { name: 'Open', value: pipelineCount, color: '#6366f1' },
  ].filter((d) => d.value > 0);

  const barData = (leadReport?.monthly ?? []).map((m) => ({
    name: m.month,
    leads: m.count,
  }));

  return (
    <Page data-testid="dashboard-page">
      {taskNotificationDialog}
      <HeroBanner
        eyebrow={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
        title={`${greeting()}, ${String(user?.name || '').split(' ')[0] || 'there'}`}
        description={
          canSeeLeads
            ? `You have ${pipelineCount} leads in the pipeline and ${wonCount} won so far. Here is the latest snapshot of your workspace.`
            : 'Your daily operating overview. Jump straight into the work that matters today.'
        }
        actions={
          <>
            <HeroAction icon={Target} onClick={() => navigate('/leads')}>Open leads</HeroAction>
            <HeroAction icon={CheckSquare} onClick={() => navigate('/tasks')}>My tasks</HeroAction>
            <HeroAction icon={CalendarCheck} onClick={() => navigate('/attendance')}>Attendance</HeroAction>
          </>
        }
      />

      {canSeeLeads && leadReport ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
            <StatCard icon={Target} label="Total leads" value={leadReport.total} tone="default" hint="All time" />
            <StatCard
              icon={CheckCircle}
              label="Won"
              value={wonCount}
              tone="success"
              hint={wonCount + lostCount > 0 ? `${winRate}% win rate` : 'No closed deals yet'}
            />
            <StatCard icon={Clock} label="In pipeline" value={pipelineCount} tone="warning" hint="Open opportunities" />
            <StatCard
              icon={DollarSign}
              label="Value won"
              value={`₹${(leadReport.total_value_won ?? 0).toLocaleString('en-IN')}`}
              tone="info"
              hint={`${lostCount} lost`}
            />
          </div>

          {expiringSubscriptions.length > 0 && (
            <Surface className="relative overflow-hidden border-amber-200/80 bg-gradient-to-r from-amber-50 via-amber-50/60 to-white">
              <div aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-amber-400 to-orange-500" />
              <div className="flex flex-col gap-4 pl-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4 min-w-0">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-500/30">
                    <AlertCircle className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-amber-950">Subscriptions expiring soon</h3>
                    <p className="mt-0.5 text-sm text-amber-900/80">
                      {expiringSubscriptions.length} customer subscription{expiringSubscriptions.length !== 1 ? 's' : ''} will expire within 30 days.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {expiringSubscriptions.slice(0, 5).map((order) => (
                        <div key={order.id} className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs shadow-sm">
                          <div className="font-semibold text-amber-950">{order.customer_name}</div>
                          <div className="mt-0.5 text-amber-800">
                            Ends {new Date(order.subscription_end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>
                        </div>
                      ))}
                      {expiringSubscriptions.length > 5 && (
                        <div className="flex items-center rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-900 shadow-sm">
                          +{expiringSubscriptions.length - 5} more
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <Button type="button" variant="outline" className="shrink-0 border-amber-300 bg-white text-amber-900 hover:bg-amber-100" onClick={() => navigate('/leads')}>
                  Review in Leads
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </Surface>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-5">
            <Surface className="lg:col-span-2">
              <SectionHeader title="Leads by outcome" description="Won, lost and still open" />
              {pieData.length > 0 ? (
                <>
                  <div className="relative">
                    <ResponsiveContainer width="100%" height={230}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={72}
                          outerRadius={102}
                          paddingAngle={4}
                          cornerRadius={6}
                          dataKey="value"
                          nameKey="name"
                          stroke="none"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-extrabold tracking-tight text-foreground tabular-nums">{leadReport.total}</span>
                      <span className="text-xs font-semibold text-muted-foreground">total leads</span>
                    </div>
                  </div>
                  <ul className="mt-2 grid grid-cols-3 gap-2">
                    {pieData.map((d) => (
                      <li key={d.name} className="rounded-xl bg-muted/70 px-3 py-2.5 text-center">
                        <span className="mx-auto mb-1 block h-1.5 w-8 rounded-full" style={{ backgroundColor: d.color }} />
                        <span className="block text-lg font-bold tabular-nums text-foreground">{d.value}</span>
                        <span className="block text-xs font-medium text-muted-foreground">{d.name}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">No lead data yet</div>
              )}
            </Surface>

            <Surface className="lg:col-span-3">
              <SectionHeader title="Monthly lead generation" description="New leads created per month" />
              {barData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={barData} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="leadBar" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" />
                        <stop offset="100%" stopColor="#a78bfa" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 4" stroke="#e8eaf3" vertical={false} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#5b6178', fontWeight: 600 }} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#5b6178' }} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(99,102,241,0.08)', radius: 8 }} />
                    <Bar dataKey="leads" name="Leads" fill="url(#leadBar)" radius={[8, 8, 0, 0]} maxBarSize={44} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">No monthly data yet</div>
              )}
            </Surface>
          </div>

          <Surface>
            <SectionHeader title="Pipeline by stage" description="Where every lead currently sits" />
            {Object.keys(leadReport.by_status || {}).length > 0 ? (
              <>
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label="Share of leads by stage">
                  {Object.entries(leadReport.by_status || {}).map(([status, count]) => (
                    <div
                      key={status}
                      title={`${status}: ${count}`}
                      style={{ width: `${(count / Math.max(1, leadReport.total)) * 100}%`, backgroundColor: STATUS_COLORS[status] || '#94a3b8' }}
                    />
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
                  {Object.entries(leadReport.by_status || {}).map(([status, count]) => (
                    <div key={status} className="rounded-xl border border-border bg-muted/40 px-3.5 py-3 transition-colors hover:bg-accent/60">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS[status] || '#94a3b8' }} />
                        <span className="truncate text-xs font-semibold text-muted-foreground">{status}</span>
                      </div>
                      <p className="mt-1.5 text-2xl font-extrabold tabular-nums tracking-tight text-foreground">{count}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">No leads yet</p>
            )}
          </Surface>

          <Surface padded={false} className="overflow-hidden">
            <div className="px-5 pt-5 sm:px-6 sm:pt-6">
              <SectionHeader title="Leads by owner" description="Who is carrying the pipeline" />
            </div>
            <div className="overflow-x-auto table-scroll">
              <table className="app-table min-w-[560px]">
                <thead>
                  <tr>
                    <th>Owner</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Won</th>
                    <th className="text-right">Lost</th>
                    <th className="text-right">Pipeline</th>
                    <th className="w-48">Win rate</th>
                  </tr>
                </thead>
                <tbody>
                  {(leadReport.by_assignee || []).map((row, idx) => {
                    const closed = (row.won || 0) + (row.lost || 0);
                    const rate = closed > 0 ? Math.round((row.won / closed) * 100) : 0;
                    return (
                      <tr key={row.employee_id}>
                        <td>
                          <div className="flex items-center gap-3">
                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white shadow-sm ${AVATAR_GRADIENTS[idx % AVATAR_GRADIENTS.length]}`}>
                              {row.employee_id === 'Unassigned' ? <Users className="h-4 w-4" aria-hidden="true" /> : initials(row.employee_name)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-foreground">{row.employee_name}</p>
                              {row.employee_id !== 'Unassigned' && (
                                <p className="text-xs text-muted-foreground">{row.employee_id}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="text-right font-bold tabular-nums">{row.total}</td>
                        <td className="text-right tabular-nums"><span className="rounded-md bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">{row.won}</span></td>
                        <td className="text-right tabular-nums"><span className="rounded-md bg-rose-50 px-2 py-0.5 font-bold text-rose-700">{row.lost}</span></td>
                        <td className="text-right tabular-nums"><span className="rounded-md bg-amber-50 px-2 py-0.5 font-bold text-amber-700">{row.pipeline}</span></td>
                        <td>
                          <div className="flex items-center gap-2.5">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500" style={{ width: `${rate}%` }} />
                            </div>
                            <span className="w-9 text-right text-xs font-bold tabular-nums text-muted-foreground">{closed > 0 ? `${rate}%` : '—'}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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
