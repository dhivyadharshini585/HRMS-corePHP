import api from './api';

export const getOfferLetters = async (params = {}, options = {}) => {
  const response = await api.get('/offer-letters', { params, ...options });
  return response.data;
};

export const getOfferLetter = async (id, options = {}) => {
  const response = await api.get(`/offer-letters/${id}`, options);
  return response.data;
};

export const createOfferLetter = async (data) => {
  const response = await api.post('/offer-letters', data);
  return response.data;
};

export const updateOfferLetter = async (id, data) => {
  const response = await api.put(`/offer-letters/${id}`, data);
  return response.data;
};

export const deleteOfferLetter = async (id) => {
  const response = await api.delete(`/offer-letters/${id}`);
  return response.data;
};

export const sendOfferLetter = async (id) => {
  const response = await api.patch(`/offer-letters/${id}/send`);
  return response.data;
};

export const acceptOfferLetter = async (id, response_remarks = '') => {
  const response = await api.patch(`/offer-letters/${id}/accept`, { response_remarks });
  return response.data;
};

export const rejectOfferLetter = async (id, response_remarks) => {
  const response = await api.post(`/offer-letters/${id}/reject`, { response_remarks });
  return response.data;
};

export const withdrawOfferLetter = async (id, response_remarks = '') => {
  const response = await api.post(`/offer-letters/${id}/withdraw`, { response_remarks });
  return response.data;
};

export const expireOfferLetter = async (id, response_remarks = '') => {
  const response = await api.post(`/offer-letters/${id}/expire`, { response_remarks });
  return response.data;
};

export const downloadOfferLetter = async (id) => {
  const response = await api.get(`/offer-letters/${id}/download`, {
    responseType: 'blob',
  });
  return response;
};

export default {
  getOfferLetters,
  getOfferLetter,
  createOfferLetter,
  updateOfferLetter,
  deleteOfferLetter,
  sendOfferLetter,
  acceptOfferLetter,
  rejectOfferLetter,
  withdrawOfferLetter,
  expireOfferLetter,
  downloadOfferLetter,
};
