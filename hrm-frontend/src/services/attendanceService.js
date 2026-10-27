import api from './api';

export const getTodayState = async () => {
  const response = await api.get('/attendance/today');
  return response.data;
};

export const getAttendanceList = async (params = {}) => {
  const response = await api.get('/attendance', { params });
  return response.data;
};

export const checkIn = async (data = {}) => {
  const response = await api.post('/attendance/check-in', data);
  return response.data;
};

export const checkOut = async (data = {}) => {
  const response = await api.post('/attendance/check-out', data);
  return response.data;
};

export const submitAttendanceCorrection = async (data) => {
  const response = await api.post('/attendance/corrections', data);
  return response.data;
};

export const getMyAttendanceCorrections = async (params = {}) => {
  const response = await api.get('/attendance/corrections/my', { params });
  return response.data;
};

export const getPendingAttendanceCorrections = async (params = {}) => {
  const response = await api.get('/attendance/corrections/pending', { params });
  return response.data;
};

export const getAttendanceCorrectionDetail = async (id, options = {}) => {
  const response = await api.get(`/attendance/corrections/${id}`, options);
  return response.data;
};

export const approveAttendanceCorrection = async (id, remark = '') => {
  const payload = typeof remark === 'object' && remark !== null
    ? remark
    : { remarks: remark };
  const response = await api.put(`/attendance/corrections/${id}/approve`, payload);
  return response.data;
};

export const rejectAttendanceCorrection = async (id, remark) => {
  const payload = typeof remark === 'object' && remark !== null
    ? remark
    : { remarks: remark };
  const response = await api.put(`/attendance/corrections/${id}/reject`, payload);
  return response.data;
};

export const escalateAttendanceCorrection = async (id, reason) => {
  const payload = typeof reason === 'object' && reason !== null
    ? (reason.escalation_reason !== undefined ? reason : { escalation_reason: reason.reason || '' })
    : { escalation_reason: reason };
  const response = await api.put(`/attendance/corrections/${id}/escalate`, payload);
  return response.data;
};

export const attendanceService = {
  getTodayState,
  getAttendanceList,
  checkIn,
  checkOut,
  submitAttendanceCorrection,
  getMyAttendanceCorrections,
  getPendingAttendanceCorrections,
  getAttendanceCorrectionDetail,
  approveAttendanceCorrection,
  rejectAttendanceCorrection,
  escalateAttendanceCorrection,
};

export default attendanceService;
