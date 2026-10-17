import api from './api';

export const timesheetService = {
  getTimesheets: async () => {
    const response = await api.get('/timesheets');
    return response.data.data || response.data; // Handles paginated or non-paginated
  },
  createTimesheet: async (data) => {
    const endpoint = data.entries ? '/timesheets/weekly' : '/timesheets';
    const response = await api.post(endpoint, data);
    return response.data;
  },
  getProjects: async (params = {}) => {
    const response = await api.get('/projects', { params });
    return Array.isArray(response.data?.data)
      ? response.data.data
      : (Array.isArray(response.data) ? response.data : []);
  },
  getUtilization: async () => {
    const response = await api.get('/projects-utilization');
    return response.data;
  }
};
