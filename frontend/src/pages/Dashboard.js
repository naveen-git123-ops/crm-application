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
  const [myLeaves, setMyLeaves] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    if (user?.employee_id) {
      fetchMyLeaves();
    }
  }, [user]);

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

  const fetchMyLeaves = async () => {
    try {
      const response = await axios.get(`${API}/leaves`);
      // Filter leaves for current employee only
      const employeeLeaves = response.data.filter(leave => leave.employee_id === user?.employee_id);
      setMyLeaves(employeeLeaves.slice(0, 5)); // Show last 5 leaves
    } catch (error) {
      console.error('Failed to load leaves');
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
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      testId: 'total-employees-card'
    },
    {
      title: 'Present Today',
      value: stats?.present_today || 0,
      icon: TrendingUp,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      testId: 'present-today-card'
    },
    {
      title: 'Absent Today',
      value: stats?.absent_today || 0,
      icon: TrendingDown,
      color: 'text-rose-600',
      bgColor: 'bg-rose-50',
      testId: 'absent-today-card'
    },
    {
      title: 'Pending Leaves',
      value: stats?.pending_leaves || 0,
      icon: FileText,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
      testId: 'pending-leaves-card'
    },
    {
      title: 'Departments',
      value: stats?.total_departments || 0,
      icon: Building2,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
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
      <div className="space-y-1 mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Welcome back, {user?.name}!</h1>
        <p className="text-gray-600 text-sm">Here's an overview of your organization.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="p-5 border border-gray-200 bg-white hover:shadow-md transition-shadow" data-testid={stat.testId}>
              <div className="flex items-start justify-between mb-3">
                <div className={`p-2.5 rounded-lg ${stat.bgColor} border border-gray-200`}>
                  <Icon className={`h-5 w-5 ${stat.color}`} />
                </div>
              </div>
              <p className="text-xs font-medium text-gray-600 uppercase tracking-wider">{stat.title}</p>
              <p className="text-2xl font-bold tracking-tight text-gray-900 mt-1">{stat.value}</p>
            </Card>
          );
        })}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Attendance Chart */}
        <Card className="p-6 border border-gray-200 bg-white">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Today's Attendance</h3>
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
        <Card className="p-6 border border-gray-200 bg-white">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Quick Overview</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg border border-gray-200">
              <span className="text-sm font-medium text-gray-700">Attendance Rate</span>
              <span className="text-lg font-semibold font-mono text-gray-900">
                {stats?.total_employees > 0
                  ? `${((stats.present_today / stats.total_employees) * 100).toFixed(1)}%`
                  : '0%'}
              </span>
            </div>
            <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg border border-gray-200">
              <span className="text-sm font-medium text-gray-700">Total Departments</span>
              <span className="text-lg font-semibold font-mono text-gray-900">{stats?.total_departments || 0}</span>
            </div>
            <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg border border-gray-200">
              <span className="text-sm font-medium text-gray-700">Pending Approvals</span>
              <span className="text-lg font-semibold font-mono text-gray-900">{stats?.pending_leaves || 0}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Employee Leave Applications */}
      {user?.role === 'Employee' && (
        <Card className="p-6 border border-gray-200 bg-white">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">My Leave Applications</h3>
          {myLeaves.length > 0 ? (
            <div className="space-y-3">
              {myLeaves.map((leave) => (
                <div key={leave.id} className="p-3 border border-gray-200 rounded-lg bg-gray-50">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{leave.leave_type} Leave</p>
                      <p className="text-sm text-gray-600">{leave.start_date} to {leave.end_date}</p>
                      <p className="text-xs text-gray-500 mt-1">{leave.reason}</p>
                    </div>
                    <span className={`px-3 py-1 rounded text-xs font-medium whitespace-nowrap ml-2 ${
                      leave.status === 'Pending' ? 'bg-amber-100 text-amber-700' :
                      leave.status === 'Approved' ? 'bg-green-100 text-green-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {leave.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-600">No leave applications yet</p>
          )}
        </Card>
      )}

      {/* Role-based Quick Actions */}
      {(user?.role === 'Admin' || user?.role === 'HR') && (
        <Card className="p-6 border border-gray-200 bg-white">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left bg-white">
              <Users className="h-5 w-5 mb-2 text-indigo-600" />
              <p className="font-medium text-sm text-gray-900">Add Employee</p>
              <p className="text-xs text-gray-600">Create new record</p>
            </button>
            <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left bg-white">
              <FileText className="h-5 w-5 mb-2 text-indigo-600" />
              <p className="font-medium text-sm text-gray-900">Review Leaves</p>
              <p className="text-xs text-gray-600">Approve requests</p>
            </button>
            <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left bg-white">
              <Calendar className="h-5 w-5 mb-2 text-indigo-600" />
              <p className="font-medium text-sm text-gray-900">View Reports</p>
              <p className="text-xs text-gray-600">Generate reports</p>
            </button>
          </div>
        </Card>
      )}
    </div>
  );
};