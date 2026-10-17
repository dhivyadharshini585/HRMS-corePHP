import React, { useState, useEffect } from 'react';
import { createPayroll, getPayrolls } from '../../services/payrollService';
import { getEmployees } from '../../services/employeeService';
import { IconUsers, IconCalendar, IconSettings, IconCheck, IconEye, IconAlertCircle } from '../../components/common/Icons';
import CustomSelect from '../../components/common/CustomSelect';

export default function PayrollProcessing({ onProcessed }) {
  const [employeeId, setEmployeeId] = useState('');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [employees, setEmployees] = useState([]);
  const [recentPayrolls, setRecentPayrolls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchingEmployees, setFetchingEmployees] = useState(true);
  const [fetchingPayrolls, setFetchingPayrolls] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedPayroll, setSelectedPayroll] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setFetchingEmployees(true);
        setFetchingPayrolls(true);
        
        const [empData, payrollData] = await Promise.all([
          getEmployees(),
          getPayrolls().catch(() => ({ data: [] }))
        ]);
        
        setEmployees(Array.isArray(empData) ? empData : empData.data || []);
        setRecentPayrolls(Array.isArray(payrollData) ? payrollData : payrollData.data || []);
      } catch (err) {
        setError('Failed to load initial data');
      } finally {
        setFetchingEmployees(false);
        setFetchingPayrolls(false);
      }
    };
    fetchData();
  }, []);

  const fetchRecentPayrolls = async () => {
    try {
      const data = await getPayrolls();
      setRecentPayrolls(Array.isArray(data) ? data : data.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleProcess = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await createPayroll({ employee_id: employeeId, month, year });
      setSuccess('Payroll processed successfully');
      setEmployeeId('');
      fetchRecentPayrolls();
      if (onProcessed) onProcessed();
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Failed to process payroll');
    } finally {
      setLoading(false);
    }
  };

  const months = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' }
  ];

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Approved':
        return <span className="badge badge-success"><IconCheck width="14" height="14" style={{ marginRight: '4px' }} /> Approved</span>;
      case 'Pending':
        return <span className="badge badge-warning">Pending</span>;
      case 'Rejected':
        return <span className="badge badge-danger">Rejected</span>;
      default:
        return <span className="badge badge-neutral">{status || 'Draft'}</span>;
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Process Payroll</h1>
          <p className="page-subtitle">
            Calculate and process payroll for employees based on their salary structure, attendance and applicable rules.
          </p>
        </div>
      </div>

      {success && (
        <div className="alert-banner success" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <IconCheck width="20" height="20" />
          <div>
            <h3 style={{ margin: 0, fontWeight: 600 }}>Success</h3>
            <p style={{ margin: 0, fontSize: '0.875rem' }}>{success}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="alert-banner error" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <IconAlertCircle width="20" height="20" />
          <div>
            <h3 style={{ margin: 0, fontWeight: 600 }}>Error processing payroll</h3>
            <p style={{ margin: 0, fontSize: '0.875rem' }}>{error}</p>
          </div>
        </div>
      )}

      <div className="filters-bar" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="filter-group">
          <label className="filter-label">Employee *</label>
          <CustomSelect
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="filter-select"
            required
            disabled={fetchingEmployees || loading}
          >
            <option value="">Select Employee</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.first_name} {emp.last_name} ({emp.employee_id})
              </option>
            ))}
          </CustomSelect>
        </div>

        <div className="filter-group">
          <label className="filter-label">Month *</label>
          <CustomSelect
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="filter-select"
            required
            disabled={loading}
          >
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </CustomSelect>
        </div>

        <div className="filter-group">
          <label className="filter-label">Year *</label>
          <input
            type="number"
            min="2000"
            max="2100"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="filter-input"
            required
            disabled={loading}
          />
        </div>

        <button
          onClick={handleProcess}
          disabled={loading || fetchingEmployees || !employeeId}
          className="btn-primary"
          style={{ height: 'fit-content' }}
        >
          <IconSettings width="16" height="16" />
          {loading ? 'Processing...' : 'Process Payroll'}
        </button>
      </div>


      <div className="detail-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="detail-card-header" style={{ padding: 'var(--space-4) var(--space-6)', margin: 0 }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>Recent Payroll Processing</h3>
        </div>
        
        <div className="table-container" style={{ margin: 0, border: 'none', borderRadius: 0, boxShadow: 'none' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Period</th>
                <th>Gross</th>
                <th>Net</th>
                <th>Status</th>
                <th>Processed On</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {fetchingPayrolls ? (
                <tr>
                  <td colSpan="7" className="state-container">
                    <p>Loading recent payrolls...</p>
                  </td>
                </tr>
              ) : recentPayrolls.length > 0 ? (
                recentPayrolls.slice(0, 5).map((payroll) => (
                  <tr key={payroll.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                        <div style={{
                          width: '36px', height: '36px', borderRadius: '50%',
                          backgroundColor: 'var(--primary-color)', color: 'white',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 'bold', fontSize: '0.8rem', flexShrink: 0
                        }}>
                          {payroll.employee?.first_name?.charAt(0) || 'U'}
                          {payroll.employee?.last_name?.charAt(0) || ''}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600 }}>
                            {payroll.employee?.first_name} {payroll.employee?.last_name}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{payroll.employee?.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {payroll.month}/{payroll.year}
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {formatCurrency(payroll.gross_earnings)}
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {formatCurrency(payroll.net_salary)}
                    </td>
                    <td>
                      {getStatusBadge(payroll.status)}
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {new Date(payroll.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button 
                        onClick={() => setSelectedPayroll(payroll)}
                        className="btn-secondary" 
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                      >
                        <IconEye width="14" height="14" /> View Details
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="state-container">
                    <p>No recent payroll records found.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedPayroll && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', 
          justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div className="detail-card" style={{ width: '500px', maxWidth: '90%', maxHeight: '90vh', overflowY: 'auto', padding: 'var(--space-6)', backgroundColor: 'var(--bg-surface, #ffffff)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', borderBottom: '1px solid var(--border-color, #e5e7eb)', paddingBottom: 'var(--space-4)' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Payroll Details</h3>
              <button onClick={() => setSelectedPayroll(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-secondary, #6b7280)' }}>&times;</button>
            </div>
            
            <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
              <div>
                <p style={{ margin: '0 0 var(--space-1, 0.25rem) 0', fontSize: '0.875rem', color: 'var(--text-secondary, #6b7280)' }}>Employee</p>
                <p style={{ margin: 0, fontWeight: 500 }}>{selectedPayroll.employee?.first_name} {selectedPayroll.employee?.last_name}</p>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                <div>
                  <p style={{ margin: '0 0 var(--space-1, 0.25rem) 0', fontSize: '0.875rem', color: 'var(--text-secondary, #6b7280)' }}>Period</p>
                  <p style={{ margin: 0, fontWeight: 500 }}>{selectedPayroll.month}/{selectedPayroll.year}</p>
                </div>
                <div>
                  <p style={{ margin: '0 0 var(--space-1, 0.25rem) 0', fontSize: '0.875rem', color: 'var(--text-secondary, #6b7280)' }}>Status</p>
                  <div>{getStatusBadge(selectedPayroll.status)}</div>
                </div>
              </div>
              
              <div style={{ backgroundColor: 'var(--bg-surface-hover, #f9fafb)', padding: 'var(--space-4)', borderRadius: '8px', marginTop: 'var(--space-2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                  <span style={{ color: 'var(--text-secondary, #6b7280)' }}>Gross Salary</span>
                  <span style={{ fontWeight: 500 }}>{formatCurrency(selectedPayroll.gross_earnings)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                  <span style={{ color: 'var(--text-secondary, #6b7280)' }}>Total Deductions</span>
                  <span style={{ fontWeight: 500, color: 'var(--danger-color, #dc2626)' }}>
                    -{formatCurrency(selectedPayroll.total_deductions || (selectedPayroll.gross_earnings - selectedPayroll.net_salary))}
                  </span>
                </div>
                <div style={{ borderTop: '1px solid var(--border-color, #e5e7eb)', margin: 'var(--space-2) 0', paddingTop: 'var(--space-2)', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600 }}>Net Salary</span>
                  <span style={{ fontWeight: 700, fontSize: '1.125rem', color: 'var(--success-color, #16a34a)' }}>{formatCurrency(selectedPayroll.net_salary)}</span>
                </div>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
                <button onClick={() => setSelectedPayroll(null)} className="btn-secondary">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
