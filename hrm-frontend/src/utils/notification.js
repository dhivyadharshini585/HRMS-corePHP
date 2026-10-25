import { toast } from 'react-toastify';
import { DISMISS_DURATIONS } from '../components/common/AlertBanner';

/**
 * Standard Toast Notification Utility
 * Defaults:
 * - Success: 3000ms
 * - Error: 5000ms
 * - Warning: 5000ms
 * - Info: 4000ms
 */
export const notify = {
  success: (msg, options = {}) =>
    toast.success(msg, {
      autoClose: DISMISS_DURATIONS.success,
      closeOnClick: true,
      pauseOnHover: true,
      ...options,
    }),

  error: (msg, options = {}) =>
    toast.error(msg, {
      autoClose: DISMISS_DURATIONS.error,
      closeOnClick: true,
      pauseOnHover: true,
      ...options,
    }),

  warning: (msg, options = {}) =>
    toast.warning(msg, {
      autoClose: DISMISS_DURATIONS.warning,
      closeOnClick: true,
      pauseOnHover: true,
      ...options,
    }),

  info: (msg, options = {}) =>
    toast.info(msg, {
      autoClose: DISMISS_DURATIONS.info,
      closeOnClick: true,
      pauseOnHover: true,
      ...options,
    }),
};

export default notify;
