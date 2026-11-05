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
  const { addToast } = useToast();

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
      addToast({
        title: 'Session Expired',
        message: 'Your staff session has expired. Please log in again.',
        variant: 'warning',
      });
    };

    window.addEventListener('housy:session-expired', handleSessionExpired);
    return () => {
      window.removeEventListener('housy:session-expired', handleSessionExpired);
    };
  }, [addToast]);

  const login = useCallback(async (credentials: LoginRequest): Promise<AuthUser> => {
    const res = await loginStaff(credentials);
    setUser(res.user);
    addToast({
      title: 'Welcome Back',
      message: `Signed in as ${res.user.name} (${res.user.role === 'sales_head' ? 'Sales Head' : 'Sales Executive'})`,
      variant: 'success',
    });
    return res.user;
  }, [addToast]);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await logoutStaff();
    } finally {
      setUser(null);
      addToast({
        title: 'Signed Out',
        message: 'You have been successfully logged out.',
        variant: 'neutral',
      });
    }
  }, [addToast]);

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
