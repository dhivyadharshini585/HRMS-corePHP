import React, { useEffect, useRef } from 'react';

export const DISMISS_DURATIONS = {
  success: 3000,
  error: 5000,
  warning: 5000,
  info: 4000,
};

/**
 * Shared AlertBanner Component with Automatic Dismissal and Manual Close
 *
 * Defaults:
 * - Success: 3 seconds (3000ms)
 * - Error: 5 seconds (5000ms)
 * - Warning: 5 seconds (5000ms)
 * - Informational: 4 seconds (4000ms)
 */
export default function AlertBanner({
  type = 'info',
  message,
  children,
  onClose,
  autoDismiss = true,
  duration,
  dismissible = true,
  style = {},
  className = '',
}) {
  const content = message || children;
  const timerRef = useRef(null);

  // Normalize type
  const normalizedType = type === 'danger' ? 'error' : (type || 'info');
  const timeoutMs = duration !== undefined
    ? duration
    : (DISMISS_DURATIONS[normalizedType] || 4000);

  useEffect(() => {
    // Clear any previous timer whenever message or type changes
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!content || !autoDismiss) {
      return;
    }

    timerRef.current = setTimeout(() => {
      if (typeof onClose === 'function') {
        onClose();
      }
      timerRef.current = null;
    }, timeoutMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [content, normalizedType, timeoutMs, autoDismiss, onClose]);

  if (!content) return null;

  const handleManualClose = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (typeof onClose === 'function') {
      onClose();
    }
  };

  return (
    <div
      role="alert"
      className={`alert-banner ${normalizedType} ${className}`.trim()}
      style={style}
    >
      <div style={{ flex: 1 }}>{content}</div>
      {dismissible && typeof onClose === 'function' && (
        <button
          type="button"
          onClick={handleManualClose}
          className="alert-banner-close"
          aria-label="Close notification"
          title="Dismiss"
        >
          ✕
        </button>
      )}
    </div>
  );
}
