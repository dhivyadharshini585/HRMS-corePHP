import api from './api';

export const shiftService = {
  getShifts: async (params = {}) => {
    const response = await api.get('/shifts', { params });
    return response.data;
  },

  getShiftById: async (id) => {
    const response = await api.get(`/shifts/${id}`);
    return response.data;
  },

  createShift: async (data) => {
    const response = await api.post('/shifts', data);
    return response.data;
  },

  updateShift: async (id, data) => {
    const response = await api.put(`/shifts/${id}`, data);
    return response.data;
  },

  deleteShift: async (id) => {
    const response = await api.delete(`/shifts/${id}`);
    return response.data;
  },

  assignToEmployee: async (employeeId, shiftId) => {
    const response = await api.post(`/employees/${employeeId}/assign-shift`, { shift_id: shiftId });
    return response.data;
  },

  getRotations: async (employeeId) => {
    const response = await api.get(`/employees/${employeeId}/shift-rotations`);
    return response.data;
  },

  createRotation: async (employeeId, data) => {
    const response = await api.post(`/employees/${employeeId}/shift-rotations`, data);
    return response.data;
  },

  deleteRotation: async (rotationId) => {
    const response = await api.delete(`/shift-rotations/${rotationId}`);
    return response.data;
  },
};

export default shiftService;
