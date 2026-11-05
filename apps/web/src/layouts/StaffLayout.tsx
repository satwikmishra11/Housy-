import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LanguageSwitcher } from '../components/LanguageSwitcher.js';
import {
  Users,
  Calendar,
  FileText,
  BarChart3,
  Activity,
  Palette,
  Menu,
  X,
  Building2,
  ShieldAlert,
  LogOut,
} from 'lucide-react';
import { Badge } from '../components/Badge.js';
import { useAuth } from '../context/AuthContext.js';

export interface StaffLayoutProps {
  children: React.ReactNode;
  userRole?: 'sales_head' | 'executive';
  userName?: string;
}

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

  const effectiveUserRole = authContext?.user?.role || propUserRole || 'sales_head';
  const effectiveUserName = authContext?.user?.name || propUserName || 'Harshil Mehta';

  const handleLogout = async (): Promise<void> => {
    if (authContext) {
      await authContext.logout();
      navigate('/login');
    }
  };

  const navItems = [
    { label: 'System Health', path: '/', icon: <Activity className="w-4 h-4" /> },
    { label: 'Unified Leads', path: '/leads', icon: <Users className="w-4 h-4" /> },
    { label: 'Site Visits', path: '/visits', icon: <Calendar className="w-4 h-4" /> },
    {
      label: 'Fact Sheet',
      path: '/fact-sheet',
      icon: <FileText className="w-4 h-4" />,
      adminOnly: true,
    },
    {
      label: 'Source Analytics',
      path: '/analytics',
      icon: <BarChart3 className="w-4 h-4" />,
      adminOnly: true,
    },
    { label: 'Design System', path: '/styleguide', icon: <Palette className="w-4 h-4" /> },
  ];

  const roleLabel =
    effectiveUserRole === 'sales_head' ? 'Sales Head (Admin)' : 'Sales Executive';

  return (
    <div className="min-h-screen bg-background text-ink flex flex-col md:flex-row antialiased">
      {/* Desktop Sidebar (>= md) */}
      <aside className="hidden md:flex flex-col w-64 border-r border-hairline bg-surface p-5 flex-shrink-0 sticky top-0 h-screen overflow-y-auto">
        {/* Brand */}
        <div className="flex items-center gap-3 mb-8 px-2">
          <div className="w-9 h-9 rounded-xl bg-accent text-white flex items-center justify-center font-serif font-bold text-lg select-none shadow-subtle">
            H
          </div>
          <div>
            <h1 className="font-semibold text-ink text-base tracking-tight leading-none">Housy</h1>
            <p className="text-xs text-muted flex items-center gap-1 mt-1 font-medium">
              <Building2 className="w-3 h-3 text-accent" />
              Company A · Ahmedabad
            </p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 flex flex-col gap-1.5" aria-label="Staff navigation">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const isRestrictedForUser =
              item.adminOnly && effectiveUserRole === 'executive';

            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`min-h-[44px] px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-between select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  isActive
                    ? 'bg-accent-soft text-accent font-semibold'
                    : 'text-muted hover:text-ink hover:bg-background'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={isActive ? 'text-accent' : 'text-muted'}>{item.icon}</span>
                  <span>{item.label}</span>
                </div>
                {isRestrictedForUser && (
                  <Badge variant="neutral" className="text-[10px] px-1.5 py-0">
                    Admin
                  </Badge>
                )}
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
            <span className="text-xs text-muted ml-1.5">Company A</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
            {navItems.map((item) => {
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
                  {item.adminOnly && effectiveUserRole === 'executive' && (
                    <Badge variant="neutral" className="text-[10px] px-1.5 py-0">
                      Admin
                    </Badge>
                  )}
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
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 p-4 sm:p-8 max-w-6xl w-full mx-auto">{children}</main>

        <footer className="border-t border-hairline bg-surface py-4 px-6 text-xs text-muted flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Company A Ahmedabad · Internal Sales Management Platform</span>
          <span className="flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-accent" />
            RERA & DPDP Compliant Data Handling
          </span>
        </footer>
      </div>
    </div>
  );
};

