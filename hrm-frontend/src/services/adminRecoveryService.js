import api from './api';

export const setupRecoveryEmail = async (data) => {
  const response = await api.post('/admin/recovery-email/setup', data);
  return response.data;
};

export const verifyRecoveryEmail = async (data) => {
  const response = await api.post('/admin/recovery-email/verify', data);
  return response.data;
};

export const getRecoveryEmailStatus = async () => {
  const response = await api.get('/admin/recovery-email/status');
  return response.data;
};

export const requestPasswordReset = async (data) => {
  const response = await api.post('/admin/password-recovery/request', data);
  return response.data;
};

export const verifyResetToken = async (data) => {
  const response = await api.post('/admin/password-recovery/verify-token', data);
  return response.data;
};

export const resetPassword = async (data) => {
  const response = await api.post('/admin/password-recovery/reset', data);
  return response.data;
};
