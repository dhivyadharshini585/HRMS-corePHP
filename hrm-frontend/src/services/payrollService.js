import api from './api';

export const getSalaryStructures = () => api.get('/salary-structures');
export const getSalaryStructure = (id) => api.get(`/salary-structures/${id}`);
export const createSalaryStructure = (data) => api.post('/salary-structures', data);
export const updateSalaryStructure = (id, data) => api.put(`/salary-structures/${id}`, data);
export const deleteSalaryStructure = (id) => api.delete(`/salary-structures/${id}`);

export const getPayrolls = () => api.get('/payrolls');
export const getPayroll = (id) => api.get(`/payrolls/${id}`);
export const createPayroll = (data) => api.post('/payrolls', data);
export const approvePayroll = (id) => api.post(`/payrolls/${id}/approve`);

export const generatePayslip = (payrollId) => api.post(`/payrolls/${payrollId}/payslips`);
export const getPayslip = (id) => api.get(`/payslips/${id}`);

export const getPayrollSummary = (params) => api.get('/reports/payroll/summary', { params });
export const getDepartmentPayroll = (params) => api.get('/reports/payroll/department', { params });
export const getDeductionReport = (params) => api.get('/reports/payroll/deductions', { params });
export const getEmployeePayrollReport = (params) => api.get('/reports/payroll/employee', { params });
