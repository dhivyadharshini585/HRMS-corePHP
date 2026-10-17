import React, { useState, useEffect, useCallback, useRef } from 'react';
import leaveService from '../../services/leaveService';
import { getEmployees } from '../../services/employeeService';
import { useAuthContext } from '../../context/AuthContext';
import CustomSelect from '../../components/common/CustomSelect';
import { formatDate } from '../../utils/dateUtils';

const Leave = () => {
  const { user } = useAuthContext();
  const [balances, setBalances] = useState([]);
  const [requests, setRequests] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Role checks
  const isHR = user?.roles?.some(r => ['Super Admin', 'HR Admin', 'HR Executive'].includes(r));
  const isManager = user?.roles?.includes('Manager');
  const canApprove = isHR || isManager;
  const canManageTypes = isHR;

  // Active Tab
  const [activeTab, setActiveTab] = useState('my_requests'); // 'my_requests' | 'approvals' | 'leave_types'

  // Apply Leave Modal State
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [isLeaveTypeDropdownOpen, setIsLeaveTypeDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsLeaveTypeDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => { document.removeEventListener("mousedown", handleClickOutside); };
  }, []);

  const [applyFormData, setApplyFormData] = useState({
    leave_type_id: '',
    from_date: '',
    to_date: '',
    reason: '',
  });

  // Adjust Balance Modal State
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [adjustFormData, setAdjustFormData] = useState({
    employee_id: '',
    leave_type_id: '',
    allocated_days: 0,
    used_days: 0,
  });

  // Leave Type Modal State
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [typeFormData, setTypeFormData] = useState({
    name: '',
    description: '',
    default_annual_allocation: 12,
    is_active: true,
    is_unpaid: false,
  });

  // Filter state for requests table
  const [statusFilter, setStatusFilter] = useState('');

  const fetchBalances = useCallback(async () => {
    try {
      const data = await leaveService.getLeaveBalances();
      setBalances(data.data || []);
    } catch (err) {
      console.error('Failed to fetch leave balances', err);
    }
  }, []);

  const fetchLeaveTypes = useCallback(async () => {
    try {
      const data = await leaveService.getLeaveTypes();
      setLeaveTypes(data.data || []);
    } catch (err) {
      console.error('Failed to fetch leave types', err);
    }
  }, []);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;

      const data = await leaveService.getLeaveRequests(params);
      setRequests(data.data || data.data?.data || []);
    } catch (err) {
      setError('Failed to fetch leave requests.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const fetchEmployees = useCallback(async () => {
    if (!isHR) return;
    try {
      const data = await getEmployees({ per_page: 100 });
      setEmployees(data.data || data || []);
    } catch (err) {
      console.error('Failed to fetch employees', err);
    }
  }, [isHR]);

  useEffect(() => {
    fetchBalances();
    fetchLeaveTypes();
    fetchRequests();
    fetchEmployees();
  }, [fetchBalances, fetchLeaveTypes, fetchRequests, fetchEmployees]);

  // Calculate days for apply leave modal
  const calculateDays = () => {
    if (!applyFormData.from_date || !applyFormData.to_date) return 0;
    const from = new Date(applyFormData.from_date);
    const to = new Date(applyFormData.to_date);
    if (to < from) return 0;
    const diffTime = Math.abs(to - from);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  // Get selected leave type balance
  const getSelectedTypeBalance = () => {
    if (!applyFormData.leave_type_id) return null;
    const bal = balances.find(b => b.leave_type_id === parseInt(applyFormData.leave_type_id, 10));
    return bal ? bal.remaining_days : null;
  };

  const handleOpenApplyModal = () => {
    setApplyFormData({
      leave_type_id: leaveTypes[0]?.id || '',
      from_date: new Date().toISOString().substring(0, 10),
      to_date: new Date().toISOString().substring(0, 10),
      reason: '',
    });
    setIsApplyModalOpen(true);
  };

  const handleSaveLeaveRequest = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    try {
      await leaveService.createLeaveRequest(applyFormData);
      setSuccessMessage('Leave request submitted successfully.');
      setIsApplyModalOpen(false);
      fetchRequests();
      fetchBalances();
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.errors?.from_date?.[0] || 'Failed to submit leave request.');
    }
  };

  const handleManagerApprove = async (requestId) => {
    setError('');
    setSuccessMessage('');
    try {
      await leaveService.managerApproveLeaveRequest(requestId, { manager_remarks: 'Approved by manager' });
      setSuccessMessage('Leave request approved by manager.');
      fetchRequests();
    } catch (err) {
      setError(err.response?.data?.message || 'Manager approval failed.');
    }
  };

  const handleHRApprove = async (requestId) => {
    setError('');
    setSuccessMessage('');
    try {
      await leaveService.hrApproveLeaveRequest(requestId, { hr_remarks: 'Final approval by HR' });
      setSuccessMessage('Leave request approved by HR and balance deducted.');
      fetchRequests();
      fetchBalances();
    } catch (err) {
      setError(err.response?.data?.message || 'HR approval failed.');
    }
  };

  const handleReject = async (requestId) => {
    const reason = window.prompt('Enter rejection reason:');
    if (reason === null) return;
    setError('');
    setSuccessMessage('');
    try {
      await leaveService.rejectLeaveRequest(requestId, { remarks: reason });
      setSuccessMessage('Leave request rejected.');
      fetchRequests();
    } catch (err) {
      setError(err.response?.data?.message || 'Rejection failed.');
    }
  };

  const handleCancel = async (requestId) => {
    if (!window.confirm('Are you sure you want to cancel this leave request?')) return;
    setError('');
    setSuccessMessage('');
    try {
      await leaveService.cancelLeaveRequest(requestId);
      setSuccessMessage('Leave request cancelled successfully.');
      fetchRequests();
    } catch (err) {
      setError(err.response?.data?.message || 'Cancellation failed.');
    }
  };

  const handleOpenAdjustModal = () => {
    setAdjustFormData({
      employee_id: employees[0]?.id || '',
      leave_type_id: leaveTypes[0]?.id || '',
      allocated_days: 12,
      used_days: 0,
    });
    setIsAdjustModalOpen(true);
  };

  const handleSaveAdjustBalance = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    try {
      await leaveService.adjustLeaveBalance(adjustFormData.employee_id, {
        leave_type_id: adjustFormData.leave_type_id,
        allocated_days: adjustFormData.allocated_days,
        used_days: adjustFormData.used_days,
      });
      setSuccessMessage('Employee leave balance adjusted successfully.');
      setIsAdjustModalOpen(false);
      fetchBalances();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to adjust leave balance.');
    }
  };

  const handleOpenTypeModal = (type = null) => {
    setEditingType(type);
    if (type) {
      setTypeFormData({
        name: type.name,
        description: type.description || '',
        default_annual_allocation: type.default_annual_allocation,
        is_active: type.is_active,
        is_unpaid: type.is_unpaid,
      });
    } else {
      setTypeFormData({
        name: '',
        description: '',
        default_annual_allocation: 12,
        is_active: true,
        is_unpaid: false,
      });
    }
    setIsTypeModalOpen(true);
  };

  const handleSaveType = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    try {
      if (editingType) {
        await leaveService.updateLeaveType(editingType.id, typeFormData);
        setSuccessMessage('Leave type updated successfully.');
      } else {
        await leaveService.createLeaveType(typeFormData);
        setSuccessMessage('Leave type created successfully.');
      }
      setIsTypeModalOpen(false);
      fetchLeaveTypes();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save leave type.');
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Approved':
        return <span className="badge badge-success">Approved</span>;
      case 'Manager Approved':
        return <span className="badge badge-info">Manager Approved</span>;
      case 'Pending':
        return <span className="badge badge-warning">Pending</span>;
      case 'Rejected':
        return <span className="badge badge-danger">Rejected</span>;
      case 'Cancelled':
        return <span className="badge badge-neutral">Cancelled</span>;
      default:
        return <span className="badge badge-neutral">{status}</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Leave Management</h1>
          <p className="page-subtitle">
            Apply for leave, track balances, and manage team leave requests.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {isHR && (
            <button className="btn-secondary" onClick={handleOpenAdjustModal}>
              ⚙ Adjust Employee Balance
            </button>
          )}
          <button className="btn-primary" onClick={handleOpenApplyModal}>
            + Apply Leave
          </button>
        </div>
      </div>

      {/* Messages */}
      {successMessage && (
        <div className="alert-banner success">
          {successMessage}
        </div>
      )}
      {error && (
        <div className="alert-banner error">
          {error}
        </div>
      )}

      {/* Leave Balance Cards Grid */}
      <div>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
          My Leave Balances (2026)
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
          {balances.map((bal) => (
            <div key={bal.id} className="detail-card" style={{ padding: '1rem', marginBottom: 0 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{bal.leave_type?.name}</span>
                {bal.leave_type?.is_unpaid && (
                  <span style={{ fontSize: '0.65rem', backgroundColor: '#fee2e2', color: '#991b1b', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>Unpaid</span>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.25rem', textAlign: 'center', backgroundColor: 'var(--bg-surface-hover)', padding: '0.5rem', borderRadius: 'var(--radius-md)' }}>
                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Allocated</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{bal.allocated_days}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Used</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#dc2626' }}>{bal.used_days}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Remaining</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--primary-color)' }}>{bal.remaining_days}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="tab-navigation">
        <button
          onClick={() => setActiveTab('my_requests')}
          className={`tab-btn ${activeTab === 'my_requests' ? 'active' : ''}`}
        >
          My Leave Requests
        </button>
        {canApprove && (
          <button
            onClick={() => setActiveTab('approvals')}
            className={`tab-btn ${activeTab === 'approvals' ? 'active' : ''}`}
          >
            Team Approvals
          </button>
        )}
        {canManageTypes && (
          <button
            onClick={() => setActiveTab('leave_types')}
            className={`tab-btn ${activeTab === 'leave_types' ? 'active' : ''}`}
          >
            Leave Types Configuration
          </button>
        )}
      </div>

      {/* Tab 1 & 2: Requests Table */}
      {(activeTab === 'my_requests' || activeTab === 'approvals') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Status Filter */}
          <div className="filters-bar" style={{ marginBottom: 0 }}>
            <div className="filter-group">
              <label className="filter-label">Filter Status</label>
              <CustomSelect
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="filter-select"
              >
                <option value="">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="Manager Approved">Manager Approved</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
                <option value="Cancelled">Cancelled</option>
              </CustomSelect>
            </div>
          </div>

          <div className="table-container">
            {loading ? (
              <div className="state-container">
                <h3>Loading leave requests...</h3>
              </div>
            ) : requests.length === 0 ? (
              <div className="state-container">
                <h3>No leave requests found</h3>
                <p>Click "+ Apply Leave" to submit a leave request.</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Leave Type</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Days</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((req) => (
                    <tr key={req.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{req.employee ? `${req.employee.first_name} ${req.employee.last_name}` : 'Self'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{req.employee?.employee_code}</div>
                      </td>
                      <td style={{ fontWeight: 500 }}>{req.leave_type?.name}</td>
                      <td style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>{formatDate(req.from_date)}</td>
                      <td style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>{formatDate(req.to_date)}</td>
                      <td style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{req.number_of_days}</td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {req.reason}
                      </td>
                      <td>{getStatusBadge(req.status)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                          {/* Manager Approval Button (Pending -> Manager Approved) */}
                          {canApprove && req.status === 'Pending' && req.employee_id !== user.employee?.id && (
                            <button
                              className="btn-secondary"
                              onClick={() => handleManagerApprove(req.id)}
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: '#2563eb', borderColor: '#bfdbfe' }}
                            >
                              Manager Approve
                            </button>
                          )}

                          {/* HR Final Approval Button (Manager Approved -> Approved) */}
                          {isHR && req.status === 'Manager Approved' && (
                            <button
                              className="btn-success"
                              onClick={() => handleHRApprove(req.id)}
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                            >
                              HR Final Approve
                            </button>
                          )}

                          {/* Reject Button */}
                          {canApprove && ['Pending', 'Manager Approved'].includes(req.status) && req.employee_id !== user.employee?.id && (
                            <button
                              className="btn-danger"
                              onClick={() => handleReject(req.id)}
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                            >
                              Reject
                            </button>
                          )}

                          {/* Cancel Button (Own pending request) */}
                          {req.employee_id === user.employee?.id && ['Pending', 'Manager Approved'].includes(req.status) && (
                            <button
                              className="btn-secondary"
                              onClick={() => handleCancel(req.id)}
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: '#64748b' }}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Leave Types Configuration (HR/Admin view) */}
      {activeTab === 'leave_types' && canManageTypes && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>System Leave Types</h3>
            <button className="btn-primary" onClick={() => handleOpenTypeModal()}>
              + Add Leave Type
            </button>
          </div>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Leave Type</th>
                  <th>Description</th>
                  <th>Default Annual Days</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {leaveTypes.map((type) => (
                  <tr key={type.id}>
                    <td style={{ fontWeight: 600 }}>{type.name}</td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{type.description || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{type.default_annual_allocation} days</td>
                    <td>
                      {type.is_unpaid ? (
                        <span className="badge badge-danger">Unpaid</span>
                      ) : (
                        <span className="badge badge-success">Paid</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${type.is_active ? 'active' : 'inactive'}`}>
                        {type.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn-secondary"
                        onClick={() => handleOpenTypeModal(type)}
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Apply Leave Modal */}
      {isApplyModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Apply for Leave</h3>
              <button className="btn-secondary" style={{ padding: '0.25rem 0.5rem' }} onClick={() => setIsApplyModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveLeaveRequest}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">
                    Leave Type <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  {/* Custom Leave Type Dropdown */}
                  <div className="custom-dropdown" ref={dropdownRef} style={{ position: 'relative' }}>
                    <div 
                      className="form-control" 
                      style={{ 
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', 
                        border: isLeaveTypeDropdownOpen ? '1px solid #075E4B' : '1px solid #E2E8E5',
                        boxShadow: isLeaveTypeDropdownOpen ? '0 0 0 2px rgba(7, 94, 75, 0.1)' : 'none',
                        backgroundColor: '#FFFFFF', color: '#064E3B', padding: '0.5rem 0.75rem'
                      }}
                      onClick={() => setIsLeaveTypeDropdownOpen(!isLeaveTypeDropdownOpen)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setIsLeaveTypeDropdownOpen(!isLeaveTypeDropdownOpen);
                        } else if (e.key === 'Escape') {
                          setIsLeaveTypeDropdownOpen(false);
                        }
                      }}
                    >
                      <span>
                        {applyFormData.leave_type_id 
                          ? (() => {
                              const sel = leaveTypes.find(t => t.id === Number(applyFormData.leave_type_id));
                              return sel ? `${sel.name} ${sel.is_unpaid ? '(Unpaid)' : ''}` : 'Select Leave Type';
                            })()
                          : 'Select Leave Type'
                        }
                      </span>
                      <span style={{ transform: isLeaveTypeDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
                    </div>
                    
                    {isLeaveTypeDropdownOpen && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                        backgroundColor: '#FFFFFF', border: '1px solid #E2E8E5', borderRadius: '8px',
                        marginTop: '4px', boxShadow: '0 4px 12px -1px rgba(0, 0, 0, 0.1)',
                        maxHeight: '200px', overflowY: 'auto'
                      }}>
                        {leaveTypes.filter(t => t.is_active).map(t => (
                          <div
                            key={t.id}
                            style={{
                              padding: '0.75rem 1rem', cursor: 'pointer',
                              backgroundColor: Number(applyFormData.leave_type_id) === t.id ? '#DDF7EC' : 'transparent',
                              color: Number(applyFormData.leave_type_id) === t.id ? '#064E3B' : 'inherit',
                              fontWeight: Number(applyFormData.leave_type_id) === t.id ? 600 : 400
                            }}
                            onMouseEnter={(e) => {
                              if (Number(applyFormData.leave_type_id) !== t.id) e.currentTarget.style.backgroundColor = '#f1f8f5';
                            }}
                            onMouseLeave={(e) => {
                              if (Number(applyFormData.leave_type_id) !== t.id) e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                            onClick={() => {
                              setApplyFormData({ ...applyFormData, leave_type_id: t.id });
                              setIsLeaveTypeDropdownOpen(false);
                            }}
                          >
                            {t.name} {t.is_unpaid ? '(Unpaid)' : ''}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {/* Hidden input for HTML5 required validation */}
                  <input 
                    type="text" 
                    required 
                    value={applyFormData.leave_type_id} 
                    onChange={() => {}} 
                    style={{ position: 'absolute', opacity: 0, height: 0, width: 0, pointerEvents: 'none' }} 
                  />
                  {getSelectedTypeBalance() !== null && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--primary-color)', fontWeight: 500, marginTop: '0.2rem' }}>
                      Available Balance: {getSelectedTypeBalance()} days
                    </span>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">
                      From Date <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={applyFormData.from_date}
                      onChange={(e) => setApplyFormData({ ...applyFormData, from_date: e.target.value })}
                      className="form-control"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">
                      To Date <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={applyFormData.to_date}
                      onChange={(e) => setApplyFormData({ ...applyFormData, to_date: e.target.value })}
                      className="form-control"
                    />
                  </div>
                </div>

                <div style={{ backgroundColor: 'var(--bg-surface-hover)', padding: '0.75rem', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>Duration:</span>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary-color)' }}>
                    {calculateDays()} {calculateDays() === 1 ? 'Day' : 'Days'}
                  </span>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Reason <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <textarea
                    rows="3"
                    required
                    value={applyFormData.reason}
                    onChange={(e) => setApplyFormData({ ...applyFormData, reason: e.target.value })}
                    placeholder="Reason for leave request..."
                    className="form-control"
                    style={{ resize: 'vertical' }}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setIsApplyModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Adjust Balance Modal (HR only) */}
      {isAdjustModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Adjust Employee Leave Balance</h3>
              <button className="btn-secondary" style={{ padding: '0.25rem 0.5rem' }} onClick={() => setIsAdjustModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveAdjustBalance}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">
                    Employee <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <CustomSelect
                    required
                    value={adjustFormData.employee_id}
                    onChange={(e) => setAdjustFormData({ ...adjustFormData, employee_id: e.target.value })}
                    className="form-control"
                  >
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.employee_code} — {emp.first_name} {emp.last_name}
                      </option>
                    ))}
                  </CustomSelect>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Leave Type <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <CustomSelect
                    required
                    value={adjustFormData.leave_type_id}
                    onChange={(e) => setAdjustFormData({ ...adjustFormData, leave_type_id: e.target.value })}
                    className="form-control"
                  >
                    {leaveTypes.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </CustomSelect>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">
                      Allocated Days <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      required
                      value={adjustFormData.allocated_days}
                      onChange={(e) => setAdjustFormData({ ...adjustFormData, allocated_days: parseFloat(e.target.value) || 0 })}
                      className="form-control"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">
                      Used Days
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={adjustFormData.used_days}
                      onChange={(e) => setAdjustFormData({ ...adjustFormData, used_days: parseFloat(e.target.value) || 0 })}
                      className="form-control"
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setIsAdjustModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Balance Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit / Add Leave Type Modal */}
      {isTypeModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>{editingType ? 'Edit Leave Type' : 'Add New Leave Type'}</h3>
              <button className="btn-secondary" style={{ padding: '0.25rem 0.5rem' }} onClick={() => setIsTypeModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveType}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">
                    Name <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={typeFormData.name}
                    onChange={(e) => setTypeFormData({ ...typeFormData, name: e.target.value })}
                    placeholder="e.g. Compensatory Off"
                    className="form-control"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Default Annual Allocation (Days) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    required
                    value={typeFormData.default_annual_allocation}
                    onChange={(e) => setTypeFormData({ ...typeFormData, default_annual_allocation: parseFloat(e.target.value) || 0 })}
                    className="form-control"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea
                    rows="2"
                    value={typeFormData.description}
                    onChange={(e) => setTypeFormData({ ...typeFormData, description: e.target.value })}
                    className="form-control"
                    style={{ resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                    <input
                      type="checkbox"
                      checked={typeFormData.is_unpaid}
                      onChange={(e) => setTypeFormData({ ...typeFormData, is_unpaid: e.target.checked })}
                    />
                    Is Unpaid Leave
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                    <input
                      type="checkbox"
                      checked={typeFormData.is_active}
                      onChange={(e) => setTypeFormData({ ...typeFormData, is_active: e.target.checked })}
                    />
                    Active
                  </label>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setIsTypeModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Leave Type
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Leave;
