import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getNotificationDuration,
  normalizeNotificationType,
} from '../utils/notificationConfig';
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconCheckCircle,
  IconInfo,
  IconX,
} from '../components/common/Icons';
import { NotificationContext } from './notificationStore';

const MAX_VISIBLE_TOASTS = 5;

function NotificationTypeIcon({ type }) {
  switch (type) {
    case 'success':
      return <IconCheckCircle width={18} height={18} aria-hidden="true" />;
    case 'warning':
      return <IconAlertTriangle width={18} height={18} aria-hidden="true" />;
    case 'error':
      return <IconAlertCircle width={18} height={18} aria-hidden="true" />;
    case 'info':
    default:
      return <IconInfo width={18} height={18} aria-hidden="true" />;
  }
}

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const timersRef = useRef(new Map());
  const nextIdRef = useRef(1);

  const clearTimer = useCallback((id) => {
    const existingTimer = timersRef.current.get(id);
    if (existingTimer !== undefined) {
      clearTimeout(existingTimer);
      timersRef.current.delete(id);
    }
  }, []);

  const dismissNotification = useCallback(
    (id) => {
      clearTimer(id);
      setNotifications((prev) => prev.filter((item) => item.id !== id));
    },
    [clearTimer]
  );

  const clearNotifications = useCallback(() => {
    timersRef.current.forEach((timerId) => clearTimeout(timerId));
    timersRef.current.clear();
    setNotifications([]);
  }, []);

  const addNotification = useCallback(
    ({ type = 'info', title = '', message = '', duration, replace = false } = {}) => {
      if (!message && !title) return null;

      const normalizedType = normalizeNotificationType(type);
      const effectiveDuration =
        typeof duration === 'number' ? duration : getNotificationDuration(normalizedType);
      const id = nextIdRef.current++;

      if (replace) {
        timersRef.current.forEach((timerId) => clearTimeout(timerId));
        timersRef.current.clear();
      }

      setNotifications((prev) => {
        if (replace) {
          return [{ id, type: normalizedType, title, message }];
        }

        // Prevent duplicate stacked identical messages while resetting the timer cleanly
        const filtered = prev.filter((item) => {
          const sameEntry = item.type === normalizedType && item.message === message && item.title === title;
          if (sameEntry) {
            clearTimer(item.id);
            return false;
          }
          return true;
        });

        const updated = [...filtered, { id, type: normalizedType, title, message }];
        if (updated.length > MAX_VISIBLE_TOASTS) {
          const evicted = updated.slice(0, updated.length - MAX_VISIBLE_TOASTS);
          evicted.forEach((item) => clearTimer(item.id));
          return updated.slice(-MAX_VISIBLE_TOASTS);
        }
        return updated;
      });

      if (effectiveDuration > 0) {
        const timerId = setTimeout(() => {
          timersRef.current.delete(id);
          setNotifications((prev) => prev.filter((item) => item.id !== id));
        }, effectiveDuration);
        timersRef.current.set(id, timerId);
      }

      return id;
    },
    [clearTimer]
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timerId) => clearTimeout(timerId));
      timers.clear();
    };
  }, []);

  const value = useMemo(
    () => ({
      notifications,
      addNotification,
      dismissNotification,
      clearNotifications,
      success: (message, options = {}) =>
        addNotification({ ...options, type: 'success', message }),
      error: (message, options = {}) =>
        addNotification({ ...options, type: 'error', message }),
      warning: (message, options = {}) =>
        addNotification({ ...options, type: 'warning', message }),
      info: (message, options = {}) =>
        addNotification({ ...options, type: 'info', message }),
    }),
    [notifications, addNotification, dismissNotification, clearNotifications]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {notifications.length > 0 && (
        <div
          className="bsmart-toast-container"
          role="region"
          aria-label="Notifications"
          aria-live="polite"
        >
          {notifications.map((item) => (
            <div
              key={item.id}
              className={`bsmart-toast bsmart-toast-${item.type}`}
              role={item.type === 'error' || item.type === 'warning' ? 'alert' : 'status'}
            >
              <span className="alert-icon">
                <NotificationTypeIcon type={item.type} />
              </span>
              <div className="alert-body">
                {item.title && <div className="alert-title">{item.title}</div>}
                {item.message && <div className="alert-message">{item.message}</div>}
              </div>
              <button
                type="button"
                className="alert-close-btn"
                onClick={() => dismissNotification(item.id)}
                aria-label="Close notification"
                title="Dismiss"
              >
                <IconX width={16} height={16} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </NotificationContext.Provider>
  );
}

