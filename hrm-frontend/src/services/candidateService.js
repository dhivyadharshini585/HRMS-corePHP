import api from './api';

export const getCandidates = async (params = {}, options = {}) => {
  const response = await api.get('/candidates', { params, ...options });
  return response.data;
};

export const getCandidate = async (id, options = {}) => {
  const response = await api.get(`/candidates/${id}`, options);
  return response.data;
};

export const createCandidate = async (data) => {
  const response = await api.post('/candidates', data);
  return response.data;
};

export const updateCandidate = async (id, data) => {
  const response = await api.put(`/candidates/${id}`, data);
  return response.data;
};

export const deleteCandidate = async (id) => {
  const response = await api.delete(`/candidates/${id}`);
  return response.data;
};

export const uploadResume = async (id, formData) => {
  const response = await api.post(`/candidates/${id}/resume`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const downloadResume = async (id) => {
  const response = await api.get(`/candidates/${id}/resume`, {
    responseType: 'blob',
  });
  return response;
};

export const deleteResume = async (id) => {
  const response = await api.delete(`/candidates/${id}/resume`);
  return response.data;
};

export const updateCandidateStatus = async (id, data) => {
  const response = await api.patch(`/candidates/${id}/status`, data);
  return response.data;
};

export const getCandidateStatusHistory = async (id) => {
  const response = await api.get(`/candidates/${id}/status-history`);
  return response.data;
};

export default {
  getCandidates,
  getCandidate,
  createCandidate,
  updateCandidate,
  deleteCandidate,
  uploadResume,
  downloadResume,
  deleteResume,
  updateCandidateStatus,
  getCandidateStatusHistory,
};
