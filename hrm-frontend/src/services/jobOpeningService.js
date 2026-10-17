import api from './api';

export const getJobOpenings = async (params = {}, options = {}) => {
  const response = await api.get('/job-openings', { params, ...options });
  return response.data;
};

export const getJobOpening = async (id, options = {}) => {
  const response = await api.get(`/job-openings/${id}`, options);
  return response.data;
};

export const createJobOpening = async (data) => {
  const response = await api.post('/job-openings', data);
  return response.data;
};

export const updateJobOpening = async (id, data) => {
  const response = await api.put(`/job-openings/${id}`, data);
  return response.data;
};

export const deleteJobOpening = async (id) => {
  const response = await api.delete(`/job-openings/${id}`);
  return response.data;
};

export default {
  getJobOpenings,
  getJobOpening,
  createJobOpening,
  updateJobOpening,
  deleteJobOpening,
};
