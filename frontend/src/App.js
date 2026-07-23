import React from 'react';
import '@/App.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { Toaster } from 'sonner';
import { ProtectedRoute, RequireAuth } from '@/components/ProtectedRoute';
import { Layout } from '@/components/Layout';
import { Login } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';
import { Employees } from '@/pages/Employees';
import { Customers } from '@/pages/Customers';
import { Tasks } from '@/pages/Tasks';
import { Attendance } from '@/pages/Attendance';
import { MonthlyReport } from '@/pages/MonthlyReport';
import { Leaves } from '@/pages/Leaves';
import { Documents } from '@/pages/Documents';
import { Payroll } from '@/pages/Payroll';
import { IDCards } from '@/pages/IDCards';
import { Settings } from '@/pages/Settings';
import { Expenses } from '@/pages/Expenses';
import { Roles } from '@/pages/Roles';
import { Workspace } from '@/pages/Workspace';
import { Leads } from '@/pages/Leads';
import { GovernmentHolidays } from '@/pages/GovernmentHolidays';
import Vehicles from '@/pages/Vehicles';
import LocationTracker from '@/pages/LocationTracker';
import CGWFlowMetre from '@/pages/CGWFlowMetre';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Toaster position="top-right" richColors />
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route element={<RequireAuth />}>
              <Route element={<Layout />}>
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute requiredPermission="dashboard">
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/leads"
                  element={
                    <ProtectedRoute requiredPermission="leads">
                      <Leads />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/employees"
                  element={
                    <ProtectedRoute requiredPermission="employees">
                      <Employees />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/customers"
                  element={
                    <ProtectedRoute requiredPermission="customers">
                      <Customers />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/cgw-flow-metre"
                  element={
                    <ProtectedRoute requiredPermission="cgw-flow-metre">
                      <CGWFlowMetre />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/tasks"
                  element={
                    <ProtectedRoute requiredPermission="tasks">
                      <Tasks />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/attendance"
                  element={
                    <ProtectedRoute requiredPermission="attendance">
                      <Attendance />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/monthly-report"
                  element={
                    <ProtectedRoute requiredPermission="monthly-report">
                      <MonthlyReport />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/leaves"
                  element={
                    <ProtectedRoute requiredPermission="leaves">
                      <Leaves />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/expenses"
                  element={
                    <ProtectedRoute requiredPermission="expenses">
                      <Expenses />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/vehicles"
                  element={
                    <ProtectedRoute requiredPermission="vehicles">
                      <Vehicles />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/location-tracker"
                  element={
                    <ProtectedRoute allowedRoles={['Admin']}>
                      <LocationTracker />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/roles"
                  element={
                    <ProtectedRoute requiredPermission="roles">
                      <Roles />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/workspace"
                  element={
                    <ProtectedRoute requiredPermission="workspace">
                      <Workspace />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/documents"
                  element={
                    <ProtectedRoute requiredPermission="documents">
                      <Documents />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/government-holidays"
                  element={
                    <ProtectedRoute requiredPermission="holidays">
                      <GovernmentHolidays />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/payroll"
                  element={
                    <ProtectedRoute>
                      <Payroll />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/idcards"
                  element={
                    <ProtectedRoute requiredPermission="idcards">
                      <IDCards />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute requiredPermission="settings">
                      <Settings />
                    </ProtectedRoute>
                  }
                />
              </Route>
            </Route>

            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
