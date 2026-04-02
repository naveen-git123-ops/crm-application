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
import Vehicles from '@/pages/Vehicles';
import Inventory from '@/pages/Inventory';
import LocationTracker from '@/pages/LocationTracker';

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
                <ProtectedRoute requiredPermission="dashboard">
                  <Layout>
                    <Dashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/leads"
              element={
                <ProtectedRoute requiredPermission="leads">
                  <Layout>
                    <Leads />
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/inventory"
              element={
                <ProtectedRoute requiredPermission="leads">
                  <Layout>
                    <Inventory />
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/employees"
              element={
                <ProtectedRoute requiredPermission="employees">
                  <Layout>
                    <Employees />
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/customers"
              element={
                <ProtectedRoute requiredPermission="customers">
                  <Layout>
                    <Customers />
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/tasks"
              element={
                <ProtectedRoute requiredPermission="tasks">
                  <Layout>
                    <Tasks />
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/attendance"
              element={
                <ProtectedRoute requiredPermission="attendance">
                  <Layout>
                    <Attendance />
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/leaves"
              element={
                <ProtectedRoute requiredPermission="leaves">
                  <Layout>
                    <Leaves />
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/expenses"
              element={
                <ProtectedRoute requiredPermission="expenses">
                  <Layout>
                    <Expenses />
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/vehicles"
              element={
                <ProtectedRoute requiredPermission="vehicles">
                  <Layout>
                    <Vehicles />
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/location-tracker"
              element={
                <ProtectedRoute requiredPermission="attendance">
                  <Layout>
                    <LocationTracker />
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/roles"
              element={
                <ProtectedRoute requiredPermission="roles">
                  <Layout>
                    <Roles />
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/workspace"
              element={
                <ProtectedRoute requiredPermission="workspace">
                  <Layout>
                    <Workspace />
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/documents"
              element={
                <ProtectedRoute requiredPermission="documents">
                  <Layout>
                    <Documents />
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/government-holidays"
              element={
                <ProtectedRoute requiredPermission="holidays">
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
                <ProtectedRoute requiredPermission="idcards">
                  <Layout>
                    <IDCards />
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/settings"
              element={
                <ProtectedRoute requiredPermission="settings">
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