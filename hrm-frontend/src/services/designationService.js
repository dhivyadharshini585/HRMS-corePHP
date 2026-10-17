import api from './api';

export const getDesignations = async (params = {}, options = {}) => {
  const response = await api.get('/designations', { params, ...options });
  return response.data;
};

export const getDesignation = async (id, options = {}) => {
  const response = await api.get(`/designations/${id}`, options);
  return response.data;
};

export const createDesignation = async (data) => {
  const response = await api.post('/designations', data);
  return response.data;
};

export const updateDesignation = async (id, data) => {
  const response = await api.put(`/designations/${id}`, data);
  return response.data;
};

export const deleteDesignation = async (id) => {
  const response = await api.delete(`/designations/${id}`);
  return response.data;
};

export default {
  getDesignations,
  getDesignation,
  createDesignation,
  updateDesignation,
  deleteDesignation,
};
