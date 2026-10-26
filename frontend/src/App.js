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
import ViewLead from '@/pages/ViewLead';
import { GovernmentHolidays } from '@/pages/GovernmentHolidays';
import Vehicles from '@/pages/Vehicles';
import LocationTracker from '@/pages/LocationTracker';
import CGWFlowMetre from '@/pages/CGWFlowMetre';
import StockShell from '@/pages/stock/StockShell';
import StockDashboard from '@/pages/stock/DashboardPage';
import StockProducts from '@/pages/stock/ProductsPage';
import StockProductDetail from '@/pages/stock/ProductDetailPage';
import StockWarehouses from '@/pages/stock/WarehousesPage';
import StockMovements from '@/pages/stock/MovementsPage';
import StockAdjustments from '@/pages/stock/AdjustmentsPage';
import StockTransfers from '@/pages/stock/TransfersPage';
import StockSuppliers from '@/pages/stock/SuppliersPage';
import StockPurchases from '@/pages/stock/PurchasesPage';
import StockPurchaseDetail from '@/pages/stock/PurchaseDetailPage';
import StockAlerts from '@/pages/stock/AlertsPage';
import StockReports from '@/pages/stock/ReportsPage';
import { BusinessPotential } from '@/pages/BusinessPotential';
import { BpoDesk } from '@/pages/BpoDesk';
import { BpoSiteVisit } from '@/pages/BpoSiteVisit';
import { Operations } from '@/pages/Operations';
import { OperationWorkspace } from '@/pages/OperationWorkspace';
import { ServiceMaintenance } from '@/pages/ServiceMaintenance';
import { ServiceRequestDetail } from '@/pages/ServiceRequestDetail';

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
                  path="/viewlead/:leadId"
                  element={
                    <ProtectedRoute requiredPermission="leads">
                      <ViewLead />
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
                  path="/create-cgwa/:id"
                  element={
                    <ProtectedRoute requiredPermission="cgw-flow-metre">
                      <CGWFlowMetre mode="create" />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/create-cgwa"
                  element={
                    <ProtectedRoute requiredPermission="cgw-flow-metre">
                      <CGWFlowMetre mode="create" />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/my-cgwa-drafts"
                  element={
                    <ProtectedRoute requiredPermission="cgw-flow-metre">
                      <CGWFlowMetre mode="drafts" />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/view-cgwa"
                  element={
                    <ProtectedRoute requiredPermission="cgw-flow-metre">
                      <CGWFlowMetre mode="view" />
                    </ProtectedRoute>
                  }
                />
                <Route path="/cgw-flow-metre" element={<Navigate to="/view-cgwa" replace />} />

                <Route
                  path="/stock-management"
                  element={
                    <ProtectedRoute requiredPermission="stock-management">
                      <StockShell />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<StockDashboard />} />
                  <Route path="products" element={<StockProducts />} />
                  <Route path="products/:itemId" element={<StockProductDetail />} />
                  <Route path="warehouses" element={<StockWarehouses />} />
                  <Route path="movements" element={<StockMovements />} />
                  <Route path="adjustments" element={<StockAdjustments />} />
                  <Route path="transfers" element={<StockTransfers />} />
                  <Route path="suppliers" element={<StockSuppliers />} />
                  <Route path="purchases" element={<StockPurchases />} />
                  <Route path="purchases/:poId" element={<StockPurchaseDetail />} />
                  <Route path="alerts" element={<StockAlerts />} />
                  <Route path="reports" element={<StockReports />} />
                </Route>

                <Route
                  path="/business-potential"
                  element={
                    <ProtectedRoute requiredPermission="business-potential">
                      <BusinessPotential />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/bpo-desk"
                  element={
                    <ProtectedRoute requiredPermission="bpo-desk">
                      <BpoDesk />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/bpo-site-visit"
                  element={
                    <ProtectedRoute requiredPermission="bpo-site-visit">
                      <BpoSiteVisit />
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
                  path="/operations"
                  element={
                    <ProtectedRoute requiredPermission="operations">
                      <Operations />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/operations/:operationId"
                  element={
                    <ProtectedRoute requiredPermission="operations">
                      <OperationWorkspace />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/service-maintenance"
                  element={
                    <ProtectedRoute requiredPermission="service-maintenance">
                      <ServiceMaintenance />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/service-maintenance/:serviceId"
                  element={
                    <ProtectedRoute requiredPermission="service-maintenance">
                      <ServiceRequestDetail />
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
                    <ProtectedRoute>
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
