import { useContext } from 'react';
import { NotificationContext } from '../context/notificationStore';

export function useNotification() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return ctx;
}

