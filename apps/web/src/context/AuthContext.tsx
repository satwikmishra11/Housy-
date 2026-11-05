import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { AuthUser, LoginRequest } from '@housy/shared';
import { fetchMe, loginStaff, logoutStaff } from '../lib/api.js';
import { useToast } from '../components/Toast.js';

export interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginRequest) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { showToast } = useToast();

  const refetchUser = useCallback(async () => {
    try {
      const response = await fetchMe();
      setUser(response.user);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refetchUser();
  }, [refetchUser]);

  // Listen for session expiration events dispatched by apiFetch
  useEffect(() => {
    const handleSessionExpired = (): void => {
      setUser(null);
      showToast({
        type: 'warning',
        title: 'Session Expired',
        message: 'Your staff session has expired. Please log in again.',
      });
    };

    window.addEventListener('housy:session-expired', handleSessionExpired);
    return () => {
      window.removeEventListener('housy:session-expired', handleSessionExpired);
    };
  }, [showToast]);

  const login = useCallback(async (credentials: LoginRequest): Promise<AuthUser> => {
    const res = await loginStaff(credentials);
    setUser(res.user);
    showToast({
      type: 'success',
      title: 'Welcome Back',
      message: `Signed in as ${res.user.name} (${res.user.role === 'sales_head' ? 'Sales Head' : 'Sales Executive'})`,
    });
    return res.user;
  }, [showToast]);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await logoutStaff();
    } finally {
      setUser(null);
      showToast({
        type: 'info',
        title: 'Signed Out',
        message: 'You have been successfully logged out.',
      });
    }
  }, [showToast]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: Boolean(user),
        login,
        logout,
        refetchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
