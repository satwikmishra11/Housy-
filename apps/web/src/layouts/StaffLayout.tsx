import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientContext, useQuery } from '@tanstack/react-query';
import { fetchHealth } from '../lib/api.js';
import { LanguageSwitcher } from '../components/LanguageSwitcher.js';
import {
  Users,
  Calendar,
  Clock,
  FileText,
  BarChart3,
  Activity,
  Palette,
  Menu,
  X,
  Building2,
  ShieldAlert,
  LogOut,
  UserCheck,
  Flag,
  Send,
  Sparkles,
  IndianRupee,
} from 'lucide-react';
import { Badge } from '../components/Badge.js';
import { NotificationBell } from '../components/NotificationBell.js';
import { DemoRibbon } from '../components/DemoRibbon.js';
import { useAuth } from '../context/AuthContext.js';

export interface StaffLayoutProps {
  children: React.ReactNode;
  userRole?: 'sales_head' | 'executive';
  userName?: string;
}

const fallbackQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      enabled: false,
    },
  },
});

export const StaffLayout: React.FC<StaffLayoutProps> = ({
  children,
  userRole: propUserRole,
  userName: propUserName,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Try using AuthContext, fallback safely if used outside provider (e.g. styleguide)
  let authContext: ReturnType<typeof useAuth> | null = null;
  try {
    authContext = useAuth();
  } catch {
    authContext = null;
  }

  const effectiveUserRole = authContext?.user?.role || propUserRole || 'executive';
  const effectiveUserName = authContext?.user?.name || propUserName || 'Sales Staff';
  const isSalesHead = effectiveUserRole === 'sales_head';

  const queryClient = React.useContext(QueryClientContext);
  const { data: health } = useQuery(
    {
      queryKey: ['system-health'],
      queryFn: fetchHealth,
      refetchInterval: 30000,
      staleTime: 15000,
      enabled: Boolean(queryClient),
    },
    queryClient ?? fallbackQueryClient,
  );

  const handleLogout = async (): Promise<void> => {
    if (authContext) {
      await authContext.logout();
      navigate('/login');
    }
  };

  const navItems = [
    {
      label: 'System Health',
      path: '/health',
      icon: <Activity className="w-4 h-4" />,
      adminOnly: true,
    },
    { label: 'Today', path: '/today', icon: <Clock className="w-4 h-4" /> },
    { label: 'Unified Leads', path: '/leads', icon: <Users className="w-4 h-4" /> },
    { label: 'Handoffs', path: '/handoffs', icon: <UserCheck className="w-4 h-4" /> },
    { label: 'Site Visits', path: '/visits', icon: <Calendar className="w-4 h-4" /> },
    {
      label: 'Daily Review',
      path: '/daily-review',
      icon: <FileText className="w-4 h-4" />,
      adminOnly: true,
    },
    {
      label: 'Flagged Chats',
      path: '/flagged-chats',
      icon: <Flag className="w-4 h-4" />,
      adminOnly: true,
    },
    {
      label: 'Fact Sheet',
      path: '/fact-sheet',
      icon: <FileText className="w-4 h-4" />,
      adminOnly: true,
    },
    {
      label: 'Slot Availability',
      path: '/slot-rules',
      icon: <Clock className="w-4 h-4" />,
      adminOnly: true,
    },
    {
      label: 'Sales Dashboard',
      path: '/analytics',
      icon: <BarChart3 className="w-4 h-4" />,
    },
    {
      label: 'Monthly Ad Spend',
      path: '/ad-spend',
      icon: <IndianRupee className="w-4 h-4" />,
      adminOnly: true,
    },
    {
      label: 'Message Outbox',
      path: '/outbox',
      icon: <Send className="w-4 h-4" />,
    },
    {
      label: 'Demo Controls',
      path: '/demo',
      icon: <Sparkles className="w-4 h-4" />,
      adminOnly: true,
    },
    {
      label: 'Design System',
      path: '/styleguide',
      icon: <Palette className="w-4 h-4" />,
      adminOnly: true,
    },
  ];

  const visibleNavItems = navItems.filter((item) => !item.adminOnly || isSalesHead);

  const roleLabel =
    effectiveUserRole === 'sales_head' ? 'Sales Head (Admin)' : 'Sales Executive';

  return (
    <div className="min-h-screen bg-background text-ink flex flex-col antialiased">
      <DemoRibbon />
      <div className="flex-1 flex flex-col md:flex-row min-w-0">
        {/* Desktop Sidebar (>= md) */}
        <aside className="hidden md:flex flex-col w-64 border-r border-hairline bg-surface p-5 flex-shrink-0 sticky top-0 h-screen overflow-y-auto">
          {/* Brand */}
          <div className="flex items-center justify-between mb-4 px-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-accent text-white flex items-center justify-center font-serif font-bold text-lg select-none shadow-subtle">
                H
              </div>
              <div>
                <h1 className="font-semibold text-ink text-base tracking-tight leading-none">Housy</h1>
                <p className="text-xs text-muted flex items-center gap-1 mt-1 font-medium">
                  <Building2 className="w-3 h-3 text-accent" />
                  Aaranya Realty · Ahmedabad
                </p>
              </div>
            </div>
            <NotificationBell />
          </div>

        {/* Ambient AI Health Status Chip (Admin only) */}
        {isSalesHead && health?.llm && (
          <div className="mb-6 px-2">
            <NavLink
              to="/health"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                health.llm.status === 'ok'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                  : health.llm.status === 'degraded'
                  ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                  : health.llm.status === 'unconfigured'
                  ? 'bg-stone-100 text-stone-700 border-stone-200 hover:bg-stone-200'
                  : 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
              }`}
              title={`LLM Provider: ${health.llm.provider} (${health.llm.model}) · Status: ${health.llm.status}`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  health.llm.status === 'ok'
                    ? 'bg-emerald-500'
                    : health.llm.status === 'degraded'
                    ? 'bg-amber-500'
                    : health.llm.status === 'unconfigured'
                    ? 'bg-stone-400'
                    : 'bg-rose-500'
                }`}
              />
              <span className="font-mono uppercase tracking-wider text-[10px] font-semibold">AI:</span>
              <span>{health.llm.status}</span>
              <span className="text-[10px] opacity-75">({health.llm.provider})</span>
            </NavLink>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 flex flex-col gap-1.5" aria-label="Staff navigation">
          {visibleNavItems.map((item) => {
            const isActive = location.pathname === item.path;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`min-h-[44px] px-3.5 py-2.5 rounded-xl text-sm font-medium flex items-center justify-between transition-colors ${
                  isActive
                    ? 'bg-accent-soft text-accent font-semibold'
                    : 'text-muted hover:text-ink hover:bg-background'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={isActive ? 'text-accent' : 'text-muted'}>{item.icon}</span>
                  <span>{item.label}</span>
                </div>
              </NavLink>
            );
          })}
        </nav>

        {/* User Card & Language */}
        <div className="pt-4 border-t border-hairline flex flex-col gap-3">
          <div className="p-3 rounded-xl bg-background border border-hairline flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink truncate">{effectiveUserName}</span>
              <Badge variant="accent">{roleLabel.split(' ')[0]}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted">{roleLabel}</span>
              {authContext && (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="text-xs text-danger hover:underline flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-danger rounded"
                  title="Sign out of staff account"
                >
                  <LogOut className="w-3 h-3" />
                  <span>Logout</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-xs text-muted">Locale</span>
            <LanguageSwitcher compact />
          </div>
        </div>
      </aside>

      {/* Mobile Header (< md) */}
      <header className="md:hidden sticky top-0 z-40 bg-surface/90 backdrop-blur-md border-b border-hairline px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center font-serif font-bold text-base">
            H
          </div>
          <div>
            <span className="font-semibold text-ink text-sm">Housy</span>
            <span className="text-xs text-muted ml-1.5">Aaranya Realty</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <NotificationBell />
          {isSalesHead && health?.llm && (
            <NavLink
              to="/health"
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                health.llm.status === 'ok'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : health.llm.status === 'degraded'
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : health.llm.status === 'unconfigured'
                  ? 'bg-stone-100 text-stone-700 border-stone-200'
                  : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  health.llm.status === 'ok' ? 'bg-emerald-500' : 'bg-rose-500'
                }`}
              />
              AI: {health.llm.status}
            </NavLink>
          )}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="min-h-[44px] min-w-[44px] p-2 rounded-xl border border-hairline text-ink hover:bg-background flex items-center justify-center"
            aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile Drawer */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col bg-surface p-6 overflow-y-auto">
          <div className="flex items-center justify-between pb-4 border-b border-hairline mb-6">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center font-serif font-bold text-base">
                H
              </div>
              <div>
                <span className="font-semibold text-ink">Housy</span>
                <span className="text-xs text-muted block">Staff Portal</span>
              </div>
            </div>
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="min-h-[44px] min-w-[44px] p-2 rounded-xl text-muted hover:text-ink flex items-center justify-center"
              aria-label="Close menu"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <nav className="flex flex-col gap-2">
            {visibleNavItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`min-h-[44px] px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-between ${
                    isActive ? 'bg-accent-soft text-accent font-semibold' : 'text-ink'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {item.icon}
                    <span>{item.label}</span>
                  </div>
                </NavLink>
              );
            })}
          </nav>

      <div className="mt-auto pt-6 border-t border-hairline flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-ink block">{effectiveUserName}</span>
            <span className="text-xs text-muted">{roleLabel}</span>
          </div>
          {authContext && (
            <button
              type="button"
              onClick={handleLogout}
              className="min-h-[44px] px-3 py-1.5 border border-hairline rounded-xl text-xs text-danger flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          )}
        </div>
        <LanguageSwitcher />
      </div>
    </div>
  )
}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 p-4 sm:p-8 max-w-6xl w-full mx-auto">{children}</main>

        <footer className="border-t border-hairline bg-surface py-4 px-6 text-xs text-muted flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Aaranya Realty, Ahmedabad · Internal Sales Management Platform</span>
          <span className="flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-accent" />
            RERA & DPDP Compliant Data Handling
          </span>
        </footer>
      </div>
      </div>
    </div>
  );
};

