import api from './api';

export const getTeamRequests = async (params = {}, options = {}) => {
  const response = await api.get('/team-requests', { params, ...options });
  return response.data;
};

export const getTeamRequest = async (id, options = {}) => {
  const response = await api.get(`/team-requests/${id}`, options);
  return response.data;
};

export const createTeamRequest = async (data) => {
  const response = await api.post('/team-requests', data);
  return response.data;
};

export const requestInfoTeamRequest = async (id, clarification_notes) => {
  const response = await api.put(`/team-requests/${id}/request-info`, { clarification_notes });
  return response.data;
};

export const approveTeamRequest = async (id, reviewer_remarks = '') => {
  const response = await api.put(`/team-requests/${id}/approve`, { reviewer_remarks });
  return response.data;
};

export const rejectTeamRequest = async (id, reviewer_remarks) => {
  const response = await api.put(`/team-requests/${id}/reject`, { reviewer_remarks });
  return response.data;
};

export const resubmitTeamRequest = async (id, clarification_response) => {
  const response = await api.put(`/team-requests/${id}/resubmit`, { clarification_response });
  return response.data;
};

export const cancelTeamRequest = async (id, reason) => {
  const response = await api.put(`/team-requests/${id}/cancel`, { reason });
  return response.data;
};

export default {
  getTeamRequests,
  getTeamRequest,
  createTeamRequest,
  requestInfoTeamRequest,
  approveTeamRequest,
  rejectTeamRequest,
  resubmitTeamRequest,
  cancelTeamRequest,
};
