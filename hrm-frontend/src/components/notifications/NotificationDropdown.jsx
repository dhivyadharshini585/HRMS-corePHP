import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconBell, IconCheck } from '../common/Icons';
import notificationService from '../../services/notificationService';
import { ROUTES } from '../../constants/routes';

export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  const fetchUnreadCount = async () => {
    try {
      const res = await notificationService.getUnreadCount();
      setUnreadCount(res.unread_count || 0);
    } catch (err) {
      console.error('Failed to fetch unread notification count:', err);
    }
  };

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await notificationService.getNotifications({ per_page: 15 });
      setNotifications(res.data || []);
      setUnreadCount(res.unread_count || 0);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000); // 30s background poll
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  // Handle outside click to close dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = () => {
    setIsOpen((prev) => !prev);
  };

  const handleMarkAsRead = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      await notificationService.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await notificationService.markAllAsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const handleNotificationClick = (item) => {
    if (!item.read_at) {
      handleMarkAsRead(item.id);
    }
    setIsOpen(false);
    // If it's a leave notification, navigate to leave page
    if (item.data?.action_url) {
      navigate(item.data.action_url);
    } else {
      navigate(ROUTES.LEAVE);
    }
  };

  const formatTimestamp = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="notification-dropdown-wrapper" ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        className="icon-btn"
        onClick={handleToggle}
        aria-label="Notifications"
        id="notification-bell-btn"
        style={{ position: 'relative' }}
      >
        <IconBell />
        {unreadCount > 0 && (
          <span
            id="notification-badge"
            style={{
              position: 'absolute',
              top: '2px',
              right: '2px',
              background: '#ef4444',
              color: '#ffffff',
              fontSize: '0.65rem',
              fontWeight: '700',
              borderRadius: '9999px',
              padding: '0.1rem 0.35rem',
              minWidth: '16px',
              height: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          id="notification-popover"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 8px)',
            width: '360px',
            maxWidth: '90vw',
            background: 'var(--bg-surface, #ffffff)',
            borderRadius: 'var(--radius-lg, 8px)',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            border: '1px solid var(--border-color, #e2e8f0)',
            zIndex: 1000,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.875rem 1rem',
              borderBottom: '1px solid var(--border-color, #e2e8f0)',
              background: 'var(--bg-subtle, #f8fafc)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontWeight: 600, fontSize: '0.925rem', color: 'var(--text-primary, #0f172a)' }}>
                Notifications
              </span>
              {unreadCount > 0 && (
                <span
                  style={{
                    background: 'var(--primary-light, #e0e7ff)',
                    color: 'var(--primary-color, #064E3B)',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    padding: '0.15rem 0.5rem',
                    borderRadius: '9999px',
                  }}
                >
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                id="mark-all-read-btn"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--primary-color, #064E3B)',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  padding: '0.25rem 0.5rem',
                  borderRadius: 'var(--radius-sm, 4px)',
                }}
              >
                <IconCheck style={{ width: '14px', height: '14px' }} />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div
            style={{
              maxHeight: '380px',
              overflowY: 'auto',
            }}
          >
            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted, #64748b)', fontSize: '0.875rem' }}>
                Loading notifications...
              </div>
            ) : notifications.length === 0 ? (
              <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-muted, #64748b)' }}>
                <IconBell style={{ width: '28px', height: '28px', margin: '0 auto 0.5rem', opacity: 0.4 }} />
                <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>No notifications yet</div>
                <div style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>We will notify you about important updates</div>
              </div>
            ) : (
              notifications.map((item) => {
                const isUnread = !item.read_at;
                const data = item.data || {};
                const title = data.title || 'Notification';
                const message = data.message || '';

                return (
                  <div
                    key={item.id}
                    onClick={() => handleNotificationClick(item)}
                    style={{
                      padding: '0.75rem 1rem',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.75rem',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border-color, #f1f5f9)',
                      background: isUnread ? 'var(--bg-active, #f0f9ff)' : 'transparent',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!isUnread) e.currentTarget.style.background = 'var(--bg-hover, #f8fafc)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isUnread) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {/* Unread indicator dot */}
                    <div style={{ paddingTop: '0.35rem' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: isUnread ? 'var(--primary-color, #064E3B)' : 'transparent',
                        }}
                      />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '0.825rem',
                          fontWeight: isUnread ? 600 : 500,
                          color: 'var(--text-primary, #0f172a)',
                          lineHeight: 1.3,
                        }}
                      >
                        {title}
                      </div>
                      <div
                        style={{
                          fontSize: '0.775rem',
                          color: 'var(--text-secondary, #475569)',
                          marginTop: '0.2rem',
                          lineHeight: 1.4,
                          wordBreak: 'break-word',
                        }}
                      >
                        {message}
                      </div>
                      <div
                        style={{
                          fontSize: '0.7rem',
                          color: 'var(--text-muted, #94a3b8)',
                          marginTop: '0.3rem',
                        }}
                      >
                        {formatTimestamp(item.created_at)}
                      </div>
                    </div>

                    {isUnread && (
                      <button
                        onClick={(e) => handleMarkAsRead(item.id, e)}
                        title="Mark as read"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '0.2rem',
                          cursor: 'pointer',
                          color: 'var(--text-muted, #94a3b8)',
                          borderRadius: 'var(--radius-sm, 4px)',
                        }}
                      >
                        <IconCheck style={{ width: '14px', height: '14px' }} />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
