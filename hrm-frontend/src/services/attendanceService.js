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

  checkIn: async (data = {}) => {
    const response = await api.post('/attendance/check-in', data);
    return response.data;
  },

  checkOut: async (data = {}) => {
    const response = await api.post('/attendance/check-out', data);
    return response.data;
  },
};

export default attendanceService;
