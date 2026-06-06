import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminUser, userHasPermission } from '@/lib/permissions';

/** Auth gate for layout routes — renders child routes via Outlet. */
export const RequireAuth = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

export const ProtectedRoute = ({ children, allowedRoles = [], requiredPermission = null }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Check permission-based access (preferred, fully dynamic)
  if (requiredPermission) {
    const hasPermission = userHasPermission(user, requiredPermission);
    if (!hasPermission) {
      const fallback = isAdminUser(user) ? '/dashboard' : '/leaves';
      return <Navigate to={fallback} replace />;
    }
  }
  // Fallback to role-based access (for backward compatibility)
  else if (allowedRoles.length > 0 && !allowedRoles.map((r) => r.toLowerCase()).includes((user.role || '').trim().toLowerCase())) {
    const fallback = isAdminUser(user) ? '/dashboard' : '/leaves';
    return <Navigate to={fallback} replace />;
  }

  return children;
};