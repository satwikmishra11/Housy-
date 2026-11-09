import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Check,
  CheckCheck,
  Clock,
  UserCheck,
  AlertTriangle,
  Info,
} from 'lucide-react';
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../lib/api.js';
import type { StaffNotification } from '@housy/shared';
import { formatTimeInKolkata } from '../lib/date.js';

export interface NotificationBellProps {
  align?: 'left' | 'right';
  className?: string;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  align = 'right',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<StaffNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const loadNotifications = async () => {
    try {
      const res = await fetchNotifications();
      if (res && Array.isArray(res.notifications)) {
        setNotifications(res.notifications);
        setUnreadCount(res.unreadCount);
      }
    } catch {
      // Ignore background network errors
    }
  };

  useEffect(() => {
    void loadNotifications();
    const interval = setInterval(() => {
      void loadNotifications();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Close on click outside or Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleMarkAsRead = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // Ignore error
    }
  };

  const handleMarkAllRead = async () => {
    setIsLoading(true);
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNotificationClick = async (notif: StaffNotification) => {
    if (!notif.isRead) {
      void markNotificationRead(notif.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    setIsOpen(false);
    if (notif.link) {
      navigate(notif.link);
    }
  };

  const getTypeIcon = (type: StaffNotification['type']) => {
    switch (type) {
      case 'handoff':
        return <UserCheck className="w-4 h-4 text-accent" />;
      case 'escalation':
        return <AlertTriangle className="w-4 h-4 text-danger" />;
      case 'visit_awaiting_outcome':
        return <Clock className="w-4 h-4 text-amber-600" />;
      default:
        return <Info className="w-4 h-4 text-muted" />;
    }
  };

  return (
    <div className={`relative inline-block ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl border border-hairline bg-surface hover:bg-background text-muted hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label={`Notifications (${unreadCount} unread)`}
        aria-expanded={isOpen}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 px-1.5 py-0.2 min-w-[18px] h-[18px] rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="region"
          aria-label="Staff Notifications"
          className={`absolute ${
            align === 'left' ? 'left-0 right-auto' : 'right-0 left-auto'
          } mt-2 w-80 sm:w-96 max-w-[calc(100vw-2rem)] rounded-2xl bg-surface border border-hairline shadow-card z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100`}
        >
          <div className="px-4 py-3 border-b border-hairline flex items-center justify-between bg-surface/80 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-ink">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-accent-soft text-accent text-xs font-semibold">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={isLoading}
                className="text-xs font-medium text-accent hover:underline flex items-center gap-1 focus-visible:outline-none"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all as read</span>
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-hairline">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted">
                No notifications right now.
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`p-3.5 flex gap-3 cursor-pointer transition-colors ${
                    n.isRead
                      ? 'bg-surface hover:bg-background/80'
                      : 'bg-accent-soft/20 hover:bg-accent-soft/40'
                  }`}
                >
                  <div className="mt-0.5 flex-shrink-0">{getTypeIcon(n.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={`text-xs font-semibold truncate ${
                          n.isRead ? 'text-ink' : 'text-accent'
                        }`}
                      >
                        {n.title}
                      </span>
                      <span className="text-[10px] text-muted flex-shrink-0">
                        {formatTimeInKolkata(n.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-muted mt-0.5 line-clamp-2 leading-relaxed">
                      {n.message}
                    </p>
                  </div>
                  {!n.isRead && (
                    <button
                      type="button"
                      onClick={(e) => handleMarkAsRead(e, n.id)}
                      className="self-center p-1 rounded-lg text-muted hover:text-accent hover:bg-surface transition-colors flex-shrink-0"
                      title="Mark as read"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
