import api from './api';

export const auditLogService = {
  getLogs: async (params = {}) => {
    const response = await api.get('/audit-logs', { params });
    return response.data;
  },

  getLogById: async (id) => {
    const response = await api.get(`/audit-logs/${id}`);
    return response.data;
  },
};

export default auditLogService;
