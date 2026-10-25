import api from './api';

export const attendanceService = {
  getTodayState: async () => {
    const response = await api.get('/attendance/today');
    return response.data;
  },

  getAttendanceList: async (params = {}) => {
    const response = await api.get('/attendance', { params });
    return response.data;
  },

  getMyAttendance: async (params = {}) => {
    const response = await api.get('/attendance/mine', { params });
    return response.data;
  },

  checkIn: async (data = {}) => {
    const response = await api.post('/attendance/check-in', data);
    return response.data;
  },

  checkOut: async (data = {}) => {
    const response = await api.post('/attendance/check-out', data);
    return response.data;
  },

  submitCorrectionRequest: async (data) => {
    const isFormData = data instanceof FormData;
    const config = isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {};
    const response = await api.post('/attendance/correction-requests', data, config);
    return response.data;
  },

  getCorrectionRequests: async (params = {}) => {
    const response = await api.get('/attendance/correction-requests', { params });
    return response.data;
  },

  getReviewCorrectionRequests: async (params = {}) => {
    const response = await api.get('/attendance/correction-requests/review', { params });
    return response.data;
  },

  getCorrectionRequestById: async (id) => {
    const response = await api.get(`/attendance/correction-requests/${id}`);
    return response.data;
  },

  approveCorrectionRequest: async (id, data) => {
    const response = await api.post(`/attendance/correction-requests/${id}/approve`, data);
    return response.data;
  },

  rejectCorrectionRequest: async (id, data) => {
    const response = await api.post(`/attendance/correction-requests/${id}/reject`, data);
    return response.data;
  },

  getEvidenceUrl: (id) => `/api/attendance/correction-requests/${id}/evidence`,
};

export default attendanceService;
