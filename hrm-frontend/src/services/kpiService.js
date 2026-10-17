import api from './api';

export const kpiService = {
  getKPIs: async (params = {}) => {
    const response = await api.get('/performance-goals', { params });
    return response.data;
  },
  getKPI: async (id) => {
    const response = await api.get(`/performance-goals/${id}`);
    return response.data;
  },
  createKPI: async (data) => {
    const response = await api.post('/performance-goals', data);
    return response.data;
  },
  updateKPI: async (id, data) => {
    const response = await api.put(`/performance-goals/${id}`, data);
    return response.data;
  },
  deleteKPI: async (id) => {
    const response = await api.delete(`/performance-goals/${id}`);
    return response.data;
  }
};

export default kpiService;
