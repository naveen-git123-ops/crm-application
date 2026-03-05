import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

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
    const hasPermission = Array.isArray(user?.permissions) && user.permissions.includes(requiredPermission);
    if (!hasPermission) {
      const fallback = user?.role === 'Admin' ? '/dashboard' : '/leaves';
      return <Navigate to={fallback} replace />;
    }
  }
  // Fallback to role-based access (for backward compatibility)
  else if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    const fallback = user?.role === 'Admin' ? '/dashboard' : '/leaves';
    return <Navigate to={fallback} replace />;
  }

  return children;
};