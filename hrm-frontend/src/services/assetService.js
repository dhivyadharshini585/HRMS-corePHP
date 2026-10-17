import api from './api';

export const assetService = {
  getAssets: async () => {
    const response = await api.get('/assets');
    return response.data.data || response.data; // Handles paginated or non-paginated
  },
  createAsset: async (data) => {
    const response = await api.post('/assets', data);
    return response.data;
  },
  updateAsset: async (id, data) => {
    const response = await api.put(`/assets/${id}`, data);
    return response.data;
  },
  deleteAsset: async (id) => {
    const response = await api.delete(`/assets/${id}`);
    return response.data;
  },
  assignAsset: async (id, data) => {
    const response = await api.post(`/assets/${id}/assign`, data);
    return response.data;
  },
  returnAsset: async (id, data) => {
    const response = await api.post(`/assets/${id}/return`, data);
    return response.data;
  },
  getAssignments: async () => {
    const response = await api.get('/asset-assignments');
    return response.data.data || response.data;
  }
};
