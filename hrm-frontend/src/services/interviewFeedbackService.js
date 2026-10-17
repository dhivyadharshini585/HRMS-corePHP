import api from './api';

export const getFeedback = async (interviewId, options = {}) => {
  const response = await api.get(`/interviews/${interviewId}/feedback`, options);
  return response.data;
};

export const createFeedback = async (interviewId, data) => {
  const response = await api.post(`/interviews/${interviewId}/feedback`, data);
  return response.data;
};

export const updateFeedback = async (interviewId, data) => {
  const response = await api.put(`/interviews/${interviewId}/feedback`, data);
  return response.data;
};

export const deleteFeedback = async (interviewId) => {
  const response = await api.delete(`/interviews/${interviewId}/feedback`);
  return response.data;
};

export default {
  getFeedback,
  createFeedback,
  updateFeedback,
  deleteFeedback,
};
