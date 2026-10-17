import api from './api';

export const helpdeskService = {
  getTickets: async () => {
    const response = await api.get('/support-tickets');
    return response.data.data || response.data; // Handles paginated or non-paginated
  },
  createTicket: async (data) => {
    const response = await api.post('/support-tickets', data);
    return response.data;
  },
  updateTicketStatus: async (id, status) => {
    const response = await api.patch(`/support-tickets/${id}/status`, { status });
    return response.data;
  },
  getStatusCounts: async () => {
    const response = await api.get('/support-tickets-status-counts');
    return response.data;
  }
};
