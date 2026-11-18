import { useEffect, useRef, useState } from 'react';
import {
  getNotificationDuration,
  normalizeNotificationType,
} from '../../utils/notificationConfig';
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconCheckCircle,
  IconInfo,
  IconX,
} from './Icons';

function BannerIcon({ type }) {
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

export default function AlertBanner({
  type = 'info',
  title = '',
  message = '',
  onClose,
  triggerKey,
  autoDismiss = true,
  duration,
  dismissible = true,
  className = '',
  style,
  children,
}) {
  const normalizedType = normalizeNotificationType(type);
  const currentToken = `${normalizedType}::${String(message ?? '')}::${String(triggerKey ?? '')}`;

  const [dismissed, setDismissed] = useState(false);
  const [prevToken, setPrevToken] = useState(currentToken);
  if (currentToken !== prevToken) {
    setPrevToken(currentToken);
    if (dismissed) {
      setDismissed(false);
    }
  }

  const onCloseRef = useRef(onClose);
  const timerRef = useRef(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const isVisible = Boolean(message) && !dismissed;

  useEffect(() => {
    if (!isVisible || !autoDismiss) return undefined;

    const effectiveDuration =
      typeof duration === 'number' ? duration : getNotificationDuration(normalizedType);

    if (effectiveDuration <= 0) return undefined;

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setDismissed(true);
      onCloseRef.current?.();
    }, effectiveDuration);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isVisible, autoDismiss, duration, normalizedType, currentToken]);

  if (!isVisible) return null;

  const handleClose = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setDismissed(true);
    onCloseRef.current?.();
  };

  return (
    <div
      className={`alert-banner ${normalizedType} alert-${normalizedType} ${className}`.trim()}
      style={style}
      role={normalizedType === 'error' || normalizedType === 'warning' ? 'alert' : 'status'}
      aria-live={normalizedType === 'error' ? 'assertive' : 'polite'}
    >
      <div className="alert-banner-row">
        <span className="alert-icon">
          <BannerIcon type={normalizedType} />
        </span>
        <div className="alert-body">
          {title && <div className="alert-title">{title}</div>}
          <div className="alert-message">{message}</div>
          {children && <div className="alert-extra">{children}</div>}
        </div>
        {dismissible && (
          <button
            type="button"
            className="alert-close-btn"
            onClick={handleClose}
            aria-label="Close notification"
            title="Dismiss"
          >
            <IconX width={16} height={16} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
