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

export const getOrganizationTree = async (options = {}) => {
  const response = await api.get('/organization/tree', options);
  return response.data;
};

export const getReportingChain = async (params = {}, options = {}) => {
  const response = await api.get('/organization/chain', { params, ...options });
  return response.data;
};

export const getManagerCandidates = async (employeeId, options = {}) => {
  const id = employeeId || 'new';
  const response = await api.get(`/organization/candidates/${id}`, options);
  return response.data;
};

export const getReportingManagerCandidates = async (employeeId, options = {}) => {
  const url = employeeId 
    ? `/organization/reporting-manager-candidates/${employeeId}` 
    : '/organization/reporting-manager-candidates';
  const response = await api.get(url, options);
  return response.data;
};

export const getManageableEmployees = async (options = {}) => {
  const response = await api.get('/organization/manageable-employees', options);
  return response.data;
};

export const updateReportingRelationship = async (payload, options = {}) => {
  const response = await api.put('/organization/reporting-relationship', payload, options);
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
  getOrganizationTree,
  getReportingChain,
  getManagerCandidates,
  getReportingManagerCandidates,
  getManageableEmployees,
  updateReportingRelationship,
};

