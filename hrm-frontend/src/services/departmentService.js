import api from './api';

export const getDepartments = async (params = {}, options = {}) => {
  const response = await api.get('/departments', { params, ...options });
  return response.data;
};

export const getDepartment = async (id, options = {}) => {
  const response = await api.get(`/departments/${id}`, options);
  return response.data;
};

export const createDepartment = async (data) => {
  const response = await api.post('/departments', data);
  return response.data;
};

export const updateDepartment = async (id, data) => {
  const response = await api.put(`/departments/${id}`, data);
  return response.data;
};

export const deleteDepartment = async (id) => {
  const response = await api.delete(`/departments/${id}`);
  return response.data;
};

export default {
  getDepartments,
  getDepartment,
  createDepartment,
  updateDepartment,
  deleteDepartment,
};

