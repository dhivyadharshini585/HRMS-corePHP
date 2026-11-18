export const NOTIFICATION_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
};

export const NOTIFICATION_DURATIONS = {
  [NOTIFICATION_TYPES.SUCCESS]: 4000,
  [NOTIFICATION_TYPES.INFO]: 4000,
  [NOTIFICATION_TYPES.WARNING]: 6000,
  [NOTIFICATION_TYPES.ERROR]: 6000,
};

export function normalizeNotificationType(type) {
  const normalized = String(type || '').toLowerCase();
  if (normalized === 'danger' || normalized === 'error') {
    return NOTIFICATION_TYPES.ERROR;
  }
  if (normalized === 'warn' || normalized === 'warning') {
    return NOTIFICATION_TYPES.WARNING;
  }
  if (normalized === 'success') {
    return NOTIFICATION_TYPES.SUCCESS;
  }
  return NOTIFICATION_TYPES.INFO;
}

export function getNotificationDuration(type) {
  const normalized = normalizeNotificationType(type);
  return NOTIFICATION_DURATIONS[normalized] ?? 4000;
}

