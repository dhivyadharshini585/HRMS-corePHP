import api from './api';

export const getEmployees = async (params = {}, options = {}) => {
  const response = await api.get('/employees', { params, ...options });
  return response.data;
};

export const getEmployee = async (id, options = {}) => {
  const response = await api.get(`/employees/${id}`, options);
  return response.data;
};

export const getMyProfile = async (options = {}) => {
  const response = await api.get('/me/profile', options);
  return response.data;
};

export const createEmployee = async (data) => {
  const response = await api.post('/employees', data);
  return response.data;
};

export const updateEmployee = async (id, data) => {
  const response = await api.put(`/employees/${id}`, data);
  return response.data;
};

export const deleteEmployee = async (id) => {
  const response = await api.delete(`/employees/${id}`);
  return response.data;
};

export const getDepartments = async (options = {}) => {
  const response = await api.get('/departments', options);
  return response.data;
};

export const getDesignations = async (options = {}) => {
  const response = await api.get('/designations', options);
  return response.data;
};

export const createCredentials = async (employeeId, credentialData) => {
  const response = await api.post(`/employees/${employeeId}/credentials`, credentialData);
  return response.data;
};

export const changePassword = async (employeeId, passwordData) => {
  const response = await api.post(`/employees/${employeeId}/password`, passwordData);
  return response.data;
};

export default {
  getEmployees,
  getEmployee,
  getMyProfile,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getDepartments,
  getDesignations,
  createCredentials,
  changePassword,
};
