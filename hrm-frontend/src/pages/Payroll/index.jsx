import React, { useState, useEffect, useContext } from 'react';
import { getPayrolls, approvePayroll, generatePayslip } from '../../services/payrollService';
import SalaryStructures from './SalaryStructures';
import PayrollProcessing from './PayrollProcessing';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ROUTES } from '../../constants/routes';
import { AuthContext } from '../../context/AuthContext';
import {
  IconDashboard, IconLayers, IconSettings, IconBarChart,
  IconDollar, IconEye, IconCheck, IconFileText
} from '../../components/common/Icons';

// Helper for dynamic initials
const getInitials = (firstName, lastName) => {
  return `${firstName?.charAt(0) || ''}${lastName?.charAt(0) || ''}`.toUpperCase();
};

function Payroll() {
  const [payrolls, setPayrolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  const getTabFromUrl = () => {
    const searchParams = new URLSearchParams(location.search);
    return searchParams.get('tab') || 'dashboard';
  };

  const [activeTab, setActiveTab] = useState(getTabFromUrl());

  useEffect(() => {
    fetchPayrolls();
  }, []);

  useEffect(() => {
    setActiveTab(getTabFromUrl());
  }, [location.search]);

  const handleTabChange = (id) => {
    navigate(`?tab=${id}`);
  };

  const fetchPayrolls = async () => {
    try {
      const { data } = await getPayrolls();
      setPayrolls(data);
    } catch (err) {
      setError('Failed to fetch payrolls');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      await approvePayroll(id);
      fetchPayrolls();
    } catch (err) {
      alert('Failed to approve payroll');
    }
  };

  const handleGeneratePayslip = async (id) => {
    try {
      await generatePayslip(id);
      fetchPayrolls();
      alert('Payslip generated successfully');
    } catch (err) {
      alert('Failed to generate payslip');
    }
  };

  if (loading) {
    return (
      <div className="state-container">
        <h3>Loading payroll data...</h3>
        <p>Please wait while we fetch the records.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="state-container">
        <div className="alert-banner error" style={{ maxWidth: '400px', margin: '0 auto var(--space-4)' }}>
          {error}
        </div>
        <button
          onClick={() => { setLoading(true); setError(null); fetchPayrolls(); }}
          className="btn-primary"
        >
          Try Again
        </button>
      </div>
    );
  }

  const renderTabButton = (id, label, icon) => {
    const isActive = activeTab === id;
    return (
      <button
        onClick={() => handleTabChange(id)}
        className={`tab-btn ${isActive ? 'active' : ''}`}
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
      >
        {icon}
        {label}
      </button>
    );
  };

  return (
    <div style={{ padding: 'var(--space-6)' }}>

      {/* 1. PAGE HEADER */}
      <div className="page-header" style={{ marginBottom: 'var(--space-6)' }}>
        <div>
          <h1 className="page-title">Payroll Management</h1>
          <p className="page-subtitle">Manage employee payroll, process payments and view payroll reports.</p>
        </div>
      </div>

      {/* 2. PAYROLL TAB NAVIGATION */}
      <div className="tab-navigation" style={{ overflowX: 'auto', whiteSpace: 'nowrap' }}>
        {renderTabButton('dashboard', 'Dashboard', <IconDashboard width="18" height="18" />)}
        {renderTabButton('structures', 'Salary Structures', <IconLayers width="18" height="18" />)}
        {renderTabButton('processing', 'Process Payroll', <IconSettings width="18" height="18" />)}

        <Link
          to={ROUTES.PAYROLL_REPORTS}
          className="tab-btn"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', textDecoration: 'none' }}
        >
          <IconBarChart width="18" height="18" />
          Payroll Reports
        </Link>
        {user?.roles?.some(r => ['Super Admin', 'Finance / Payroll Admin', 'Finance/Payroll Admin'].includes(r)) && (
          <Link
            to={ROUTES.PAYROLL_STATUTORY_RULES}
            className="tab-btn"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', textDecoration: 'none' }}
          >
            <IconSettings width="18" height="18" />
            Statutory Rules
          </Link>
        )}
      </div>

      {/* Tab Contents */}
      {activeTab === 'structures' && <SalaryStructures />}
      {activeTab === 'processing' && <PayrollProcessing onProcessed={fetchPayrolls} />}

      {activeTab === 'dashboard' && (
        <div className="detail-card">

          {/* 3. RECENT PAYROLLS CARD HEADER */}
          <div className="detail-card-header">
            <h2 style={{ fontSize: '1.125rem', fontWeight: '600', color: 'var(--text-primary)' }}>
              Recent Payrolls
            </h2>
            <button
              onClick={() => handleTabChange('processing')}
              className="btn-primary"
            >
              + Process Payroll
            </button>
          </div>

          {/* 7. TABLE DESIGN */}
          <div className="table-container">
            {payrolls.length === 0 ? (
              /* 8. EMPTY STATE */
              <div className="state-container">
                <IconDollar width="48" height="48" style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }} />
                <h3>No payroll records found</h3>
                <p style={{ marginBottom: 'var(--space-4)' }}>Process payroll for an employee to see their salary records here.</p>
                <button
                  onClick={() => handleTabChange('processing')}
                  className="btn-primary"
                >
                  Process Payroll
                </button>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Period</th>
                    <th style={{ textAlign: 'right' }}>Gross</th>
                    <th style={{ textAlign: 'right' }}>Net</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payrolls.map((payroll) => (
                    <tr key={payroll.id}>
                      {/* 4. EMPLOYEE DISPLAY */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                          <div style={{
                            width: '36px', height: '36px', borderRadius: '50%',
                            backgroundColor: 'var(--primary-color)', color: 'white',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 'bold', fontSize: '0.8rem', flexShrink: 0
                          }}>
                            {getInitials(payroll.employee?.first_name, payroll.employee?.last_name)}
                          </div>
                          <div>
                            <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                              {payroll.employee?.first_name} {payroll.employee?.last_name}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                              {payroll.employee?.email || 'No email provided'}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td style={{ fontWeight: '500' }}>
                        {payroll.month}/{payroll.year}
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        ₹{parseFloat(payroll.gross_earnings).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      <td style={{ textAlign: 'right', fontWeight: '600', color: 'var(--text-primary)' }}>
                        ₹{parseFloat(payroll.net_salary).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      <td style={{ textAlign: 'center' }}>
                        {/* 5. STATUS BADGE */}
                        <span className={`badge ${payroll.status === 'Approved' ? 'badge-success' : 'badge-warning'}`}>
                          {payroll.status === 'Approved' && <IconCheck width="14" height="14" style={{ marginRight: '4px' }} />}
                          {payroll.status}
                        </span>
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
                          {payroll.status !== 'Approved' && (
                            <button
                              onClick={() => handleApprove(payroll.id)}
                              className="btn-secondary"
                            >
                              Approve
                            </button>
                          )}

                          {payroll.status === 'Approved' && !payroll.payslip && (
                            <button
                              onClick={() => handleGeneratePayslip(payroll.id)}
                              className="btn-secondary"
                              style={{ color: 'var(--primary-color)', borderColor: 'var(--primary-color)' }}
                            >
                              Generate Payslip
                            </button>
                          )}

                          {/* 6. VIEW PAYSLIP ACTION */}
                          {payroll.payslip && (
                            <Link
                              to={ROUTES.PAYSLIP_VIEW.replace(':id', typeof payroll.payslip === 'object' ? payroll.payslip.id : payroll.payslip)}
                              className="btn-secondary"
                            >
                              <IconEye width="16" height="16" />
                              View Payslip
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* 11. PAGINATION / FOOTER */}
          {payrolls.length > 0 && (
            <div className="pagination-bar">
              <span className="pagination-info">Showing 1 to {payrolls.length} of {payrolls.length} records</span>
              <div className="pagination-btns">
                <button className="pagination-btn" disabled>&lt;</button>
                <button className="pagination-btn" style={{ backgroundColor: 'var(--primary-color)', color: 'white', borderColor: 'var(--primary-color)' }}>1</button>
                <button className="pagination-btn" disabled>&gt;</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Payroll;
