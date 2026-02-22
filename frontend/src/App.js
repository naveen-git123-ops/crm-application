import React, { useEffect } from 'react';
import '@/App.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { Toaster } from 'sonner';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Layout } from '@/components/Layout';
import { Login } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';
import { Employees } from '@/pages/Employees';
import { Customers } from '@/pages/Customers';
import { Tasks } from '@/pages/Tasks';
import { Attendance } from '@/pages/Attendance';
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
import Inventory from '@/pages/Inventory';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Toaster position="top-right" richColors />
          <Routes>
            <Route path="/login" element={<Login />} />
            
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute allowedRoles={['Admin']}>
                  <Layout>
                    <Dashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/leads"
              element={
                <ProtectedRoute allowedRoles={['Admin', 'Manager', 'Sales']}>
                  <Layout>
                    <Leads />
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/inventory"
              element={
                <ProtectedRoute allowedRoles={['Admin', 'Manager', 'Sales']}>
                  <Layout>
                    <Inventory />
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/employees"
              element={
                <ProtectedRoute allowedRoles={['Admin', 'HR', 'Manager']}>
                  <Layout>
                    <Employees />
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/customers"
              element={
                <ProtectedRoute allowedRoles={['Admin', 'HR', 'Manager']}>
                  <Layout>
                    <Customers />
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/tasks"
              element={
                <ProtectedRoute allowedRoles={['Admin', 'Manager', 'Employee']}>
                  <Layout>
                    <Tasks />
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/attendance"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Attendance />
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/leaves"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Leaves />
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/expenses"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Expenses />
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/roles"
              element={
                <ProtectedRoute allowedRoles={['Admin']}>
                  <Layout>
                    <Roles />
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/workspace"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Workspace />
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/documents"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Documents />
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/government-holidays"
              element={
                <ProtectedRoute>
                  <Layout>
                    <GovernmentHolidays />
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/payroll"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Payroll />
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/idcards"
              element={
                <ProtectedRoute allowedRoles={['Admin', 'HR', 'Manager']}>
                  <Layout>
                    <IDCards />
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Settings />
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;