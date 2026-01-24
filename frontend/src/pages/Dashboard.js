import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { Users, Calendar, FileText, Building2, TrendingUp, TrendingDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API}/dashboard/stats`);
      setStats(response.data);
    } catch (error) {
      toast.error('Failed to load dashboard stats');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const statCards = [
    {
      title: 'Total Employees',
      value: stats?.total_employees || 0,
      icon: Users,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50 dark:bg-blue-950',
      testId: 'total-employees-card'
    },
    {
      title: 'Present Today',
      value: stats?.present_today || 0,
      icon: TrendingUp,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-50 dark:bg-emerald-950',
      testId: 'present-today-card'
    },
    {
      title: 'Absent Today',
      value: stats?.absent_today || 0,
      icon: TrendingDown,
      color: 'text-rose-500',
      bgColor: 'bg-rose-50 dark:bg-rose-950',
      testId: 'absent-today-card'
    },
    {
      title: 'Pending Leaves',
      value: stats?.pending_leaves || 0,
      icon: FileText,
      color: 'text-amber-500',
      bgColor: 'bg-amber-50 dark:bg-amber-950',
      testId: 'pending-leaves-card'
    },
    {
      title: 'Departments',
      value: stats?.total_departments || 0,
      icon: Building2,
      color: 'text-purple-500',
      bgColor: 'bg-purple-50 dark:bg-purple-950',
      testId: 'departments-card'
    },
  ];

  const attendanceData = [
    { name: 'Present', value: stats?.present_today || 0, color: '#10B981' },
    { name: 'Absent', value: stats?.absent_today || 0, color: '#F43F5E' },
  ];

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      {/* Welcome Section */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Welcome back, {user?.name}!</h1>
        <p className="text-muted-foreground">Here's what's happening with your organization today.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="p-6 card-hover" data-testid={stat.testId}>
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground uppercase tracking-wider">{stat.title}</p>
                  <p className="text-3xl font-bold tracking-tight font-mono">{stat.value}</p>
                </div>
                <div className={`p-3 rounded-md ${stat.bgColor}`}>
                  <Icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Attendance Chart */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Today's Attendance</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={attendanceData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {attendanceData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        {/* Quick Stats */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Quick Overview</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-muted rounded-md">
              <span className="text-sm font-medium">Attendance Rate</span>
              <span className="text-lg font-bold font-mono">
                {stats?.total_employees > 0
                  ? `${((stats.present_today / stats.total_employees) * 100).toFixed(1)}%`
                  : '0%'}
              </span>
            </div>
            <div className="flex justify-between items-center p-4 bg-muted rounded-md">
              <span className="text-sm font-medium">Total Departments</span>
              <span className="text-lg font-bold font-mono">{stats?.total_departments || 0}</span>
            </div>
            <div className="flex justify-between items-center p-4 bg-muted rounded-md">
              <span className="text-sm font-medium">Pending Approvals</span>
              <span className="text-lg font-bold font-mono">{stats?.pending_leaves || 0}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Role-based Quick Actions */}
      {(user?.role === 'Admin' || user?.role === 'HR') && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button className="p-4 border border-border rounded-md hover:bg-accent transition-colors text-left">
              <Users className="h-5 w-5 mb-2 text-primary" />
              <p className="font-medium">Add Employee</p>
              <p className="text-sm text-muted-foreground">Create new employee record</p>
            </button>
            <button className="p-4 border border-border rounded-md hover:bg-accent transition-colors text-left">
              <FileText className="h-5 w-5 mb-2 text-primary" />
              <p className="font-medium">Review Leaves</p>
              <p className="text-sm text-muted-foreground">Approve pending requests</p>
            </button>
            <button className="p-4 border border-border rounded-md hover:bg-accent transition-colors text-left">
              <Calendar className="h-5 w-5 mb-2 text-primary" />
              <p className="font-medium">View Reports</p>
              <p className="text-sm text-muted-foreground">Generate attendance reports</p>
            </button>
          </div>
        </Card>
      )}
    </div>
  );
};