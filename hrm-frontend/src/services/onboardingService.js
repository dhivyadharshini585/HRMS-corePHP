import api from './api';

export const getOnboardings = async (params) => {
  return await api.get('/onboarding', { params });
};

export const getOnboardingDetails = async (id) => {
  return await api.get(`/onboarding/${id}`);
};

export const startOnboarding = async (offerLetterId) => {
  return await api.post('/onboarding', { offer_letter_id: offerLetterId });
};

export const cancelOnboarding = async (id) => {
  return await api.put(`/onboarding/${id}/cancel`);
};

export const submitChecklistDocument = async (id, itemId, file) => {
  const formData = new FormData();
  formData.append('document', file);
  return await api.post(`/onboarding/${id}/checklist/${itemId}/submit`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const verifyChecklistItem = async (id, itemId) => {
  return await api.put(`/onboarding/${id}/checklist/${itemId}/verify`);
};

export const rejectChecklistItem = async (id, itemId, remarks) => {
  return await api.put(`/onboarding/${id}/checklist/${itemId}/reject`, { remarks });
};

export const updateItAccountTracking = async (id, status, remarks) => {
  return await api.put(`/onboarding/${id}/it-account`, { status, remarks });
};

export const updateLaptopAllocationTracking = async (id, status, remarks) => {
  return await api.put(`/onboarding/${id}/laptop-allocation`, { status, remarks });
};

export const createEmployeeRecord = async (id) => {
  return await api.post(`/onboarding/${id}/create-employee`);
};

export const completeOnboarding = async (id) => {
  return await api.put(`/onboarding/${id}/complete`);
};

export const downloadChecklistDocument = async (id, itemId) => {
  const response = await api.get(`/onboarding/${id}/checklist/${itemId}/download`, {
    responseType: 'blob',
  });
  
  // Create a temporary link to download the blob
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  
  // Extract filename from content-disposition header if available
  const contentDisposition = response.headers['content-disposition'];
  let filename = 'document';
  if (contentDisposition) {
    const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
    if (filenameMatch && filenameMatch.length === 2) {
      filename = filenameMatch[1];
    }
  }
  
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

const onboardingService = {
  getOnboardings,
  getOnboardingDetails,
  startOnboarding,
  cancelOnboarding,
  submitChecklistDocument,
  verifyChecklistItem,
  rejectChecklistItem,
  updateItAccountTracking,
  updateLaptopAllocationTracking,
  createEmployeeRecord,
  completeOnboarding,
  downloadChecklistDocument
};

export default onboardingService;
