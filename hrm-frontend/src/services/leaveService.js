import api from './api';

export const leaveService = {
  // Leave Types
  getLeaveTypes: async (params = {}) => {
    const response = await api.get('/leave-types', { params });
    return response.data;
  },

  createLeaveType: async (data) => {
    const response = await api.post('/leave-types', data);
    return response.data;
  },

  updateLeaveType: async (id, data) => {
    const response = await api.put(`/leave-types/${id}`, data);
    return response.data;
  },

  deleteLeaveType: async (id) => {
    const response = await api.delete(`/leave-types/${id}`);
    return response.data;
  },

  // Leave Balances
  getLeaveBalances: async (params = {}) => {
    const response = await api.get('/leave-balances', { params });
    return response.data;
  },

  adjustLeaveBalance: async (employeeId, data) => {
    const response = await api.post(`/employees/${employeeId}/leave-balances/adjust`, data);
    return response.data;
  },

  // Leave Requests
  getLeaveRequests: async (params = {}) => {
    const response = await api.get('/leave-requests', { params });
    return response.data;
  },

  getLeaveRequestById: async (id) => {
    const response = await api.get(`/leave-requests/${id}`);
    return response.data;
  },

  createLeaveRequest: async (data) => {
    const response = await api.post('/leave-requests', data);
    return response.data;
  },

  managerApproveLeaveRequest: async (id, data = {}) => {
    const response = await api.post(`/leave-requests/${id}/manager-approve`, data);
    return response.data;
  },

  hrApproveLeaveRequest: async (id, data = {}) => {
    const response = await api.post(`/leave-requests/${id}/hr-approve`, data);
    return response.data;
  },

  rejectLeaveRequest: async (id, data = {}) => {
    const response = await api.post(`/leave-requests/${id}/reject`, data);
    return response.data;
  },

  cancelLeaveRequest: async (id) => {
    const response = await api.post(`/leave-requests/${id}/cancel`);
    return response.data;
  },
};

export default leaveService;
