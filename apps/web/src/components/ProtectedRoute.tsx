import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { LoadingState } from './LoadingState.js';
import { ErrorState } from './ErrorState.js';
import type { UserRole } from '@housy/shared';

export interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
}) => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <LoadingState message="Verifying session..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <ErrorState
            title="Access Restricted"
            message={`This view requires ${allowedRoles.join(' or ')} privileges. Your account (${user.name}) is assigned the ${user.role} role.`}
            onRetry={() => window.history.back()}
          />
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

