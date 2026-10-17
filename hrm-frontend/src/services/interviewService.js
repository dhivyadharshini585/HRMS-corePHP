import api from './api';

export const getInterviews = async (params = {}, options = {}) => {
  const response = await api.get('/interviews', { params, ...options });
  return response.data;
};

export const getInterview = async (id, options = {}) => {
  const response = await api.get(`/interviews/${id}`, options);
  return response.data;
};

export const createInterview = async (data) => {
  const response = await api.post('/interviews', data);
  return response.data;
};

export const updateInterview = async (id, data) => {
  const response = await api.put(`/interviews/${id}`, data);
  return response.data;
};

export const deleteInterview = async (id) => {
  const response = await api.delete(`/interviews/${id}`);
  return response.data;
};

export default {
  getInterviews,
  getInterview,
  createInterview,
  updateInterview,
  deleteInterview,
};
