import api from './api';

export const holidayService = {
  getHolidays: async (params = {}) => {
    const response = await api.get('/holidays', { params });
    return response.data;
  },

  getHolidayById: async (id) => {
    const response = await api.get(`/holidays/${id}`);
    return response.data;
  },

  createHoliday: async (data) => {
    const response = await api.post('/holidays', data);
    return response.data;
  },

  updateHoliday: async (id, data) => {
    const response = await api.put(`/holidays/${id}`, data);
    return response.data;
  },

  deleteHoliday: async (id) => {
    const response = await api.delete(`/holidays/${id}`);
    return response.data;
  },
};

export default holidayService;
