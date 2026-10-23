import React, { useState, useEffect, useCallback } from 'react';
import teamRequestService from '../../services/teamRequestService';
import departmentService from '../../services/departmentService';
import designationService from '../../services/designationService';
import { useAuthContext } from '../../context/AuthContext';
import CustomSelect from '../../components/common/CustomSelect';

const STATUS_OPTIONS = ['All', 'Pending', 'Needs Information', 'Approved', 'Rejected', 'Cancelled'];
const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship'];
const URGENCIES = ['Low', 'Medium', 'High', 'Critical'];

const initialFormData = {
  department_id: '',
  designation_id: '',
  openings_count: 1,
  employment_type: 'Full-time',
  experience_level: '',
  skills_required: '',
  business_justification: '',
  urgency: 'Medium',
};

const TeamRequests = () => {
  const { user, hasAnyRole } = useAuthContext();

  const isSuperOrHrAdmin = hasAnyRole(['Super Admin', 'HR Admin', 'Admin', 'admin', 'super admin', 'hr admin']);
  const isHrExecutive = hasAnyRole(['HR Executive', 'hr executive']);
  const isManager = hasAnyRole(['Manager', 'manager']);

  const [requests, setRequests] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    lastPage: 1,
    total: 0,
    perPage: 10,
  });

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createFormData, setCreateFormData] = useState(initialFormData);
  const [formErrors, setFormErrors] = useState({});

  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [viewingRequest, setViewingRequest] = useState(null);

  // Action Modals: Request-Info, Reject, Resubmit, Cancel, Approve Confirm
  const [actionModal, setActionModal] = useState({
    type: null, // 'request-info' | 'reject' | 'resubmit' | 'cancel' | 'approve'
    request: null,
    reason: '',
  });

  // Load departments and designations
  useEffect(() => {
    const loadLookups = async () => {
      try {
        const [deptRes, desigRes] = await Promise.allSettled([
          departmentService.getDepartments(),
          designationService.getDesignations(),
        ]);
        if (deptRes.status === 'fulfilled') {
          setDepartments(deptRes.value.data || deptRes.value || []);
        }
        if (desigRes.status === 'fulfilled') {
          setDesignations(desigRes.value.data || desigRes.value || []);
        }
      } catch (err) {
        console.error('Error fetching lookup data', err);
      }
    };
    loadLookups();
  }, []);

  // Fetch Team Requests List
  const fetchRequests = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = {
        page,
        limit: pagination.perPage,
      };
      if (statusFilter && statusFilter !== 'All') {
        params.status = statusFilter;
      }
      if (deptFilter) {
        params.department_id = deptFilter;
      }

      const res = await teamRequestService.getTeamRequests(params);
      let dataList = res.data || [];

      // Client-side text search
      if (search.trim()) {
        const term = search.toLowerCase();
        dataList = dataList.filter(r =>
          (r.request_code && r.request_code.toLowerCase().includes(term)) ||
          (r.department_name && r.department_name.toLowerCase().includes(term)) ||
          (r.designation_title && r.designation_title.toLowerCase().includes(term)) ||
          (r.manager_name && r.manager_name.toLowerCase().includes(term))
        );
      }

      setRequests(dataList);
      if (res.meta) {
        setPagination({
          currentPage: res.meta.page || 1,
          lastPage: res.meta.total_pages || 1,
          total: res.meta.total || dataList.length,
          perPage: res.meta.limit || 10,
        });
      }
    } catch (err) {
      if (err.response?.status === 401) {
        setError('Session expired or unauthenticated. Please log in.');
      } else if (err.response?.status === 403) {
        setError('Access denied. You do not have permission to view Team Requests.');
      } else {
        setError(err.response?.data?.message || err.response?.data?.error || 'Failed to load team requests.');
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter, deptFilter, search, pagination.perPage]);

  useEffect(() => {
    fetchRequests(1);
  }, [fetchRequests]);

  const handleResetFilters = () => {
    setSearch('');
    setStatusFilter('');
    setDeptFilter('');
  };

  const handleOpenDetail = (req) => {
    setViewingRequest(req);
    setIsDetailModalOpen(true);
  };

  const handleCloseDetail = () => {
    setViewingRequest(null);
    setIsDetailModalOpen(false);
  };

  // Open Create Request Modal (Strictly Managers only)
  const handleOpenCreateModal = () => {
    if (!isManager) {
      return;
    }
    setFormErrors({});
    setError('');
    setSuccessMessage('');
    setCreateFormData(initialFormData);
    setIsCreateModalOpen(true);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setCreateFormData(prev => ({
      ...prev,
      [name]: value,
    }));
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  // Submit New Request (Strictly Manager Only)
  const handleSaveRequest = async (e) => {
    e.preventDefault();
    if (!isManager) {
      setError('Only Managers are permitted to submit new team member requests.');
      return;
    }
    setActionLoading(true);
    setFormErrors({});
    setError('');
    setSuccessMessage('');

    // Client-side quick checks
    const errors = {};
    if (!createFormData.department_id) errors.department_id = 'Department is required';
    if (Number(createFormData.openings_count) < 1 || Number(createFormData.openings_count) > 50) {
      errors.openings_count = 'Openings count must be between 1 and 50';
    }
    if (!createFormData.business_justification.trim()) {
      errors.business_justification = 'Business justification is required';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      setActionLoading(false);
      return;
    }

    try {
      const payload = {
        department_id: Number(createFormData.department_id),
        designation_id: createFormData.designation_id ? Number(createFormData.designation_id) : null,
        openings_count: Number(createFormData.openings_count),
        employment_type: createFormData.employment_type,
        experience_level: createFormData.experience_level.trim() || null,
        skills_required: createFormData.skills_required.trim() || null,
        business_justification: createFormData.business_justification.trim(),
        urgency: createFormData.urgency,
      };

      const res = await teamRequestService.createTeamRequest(payload);
      setSuccessMessage(res.message || 'Team member request submitted successfully.');
      setIsCreateModalOpen(false);
      fetchRequests(1);
    } catch (err) {
      if (err.response?.status === 422 && err.response?.data?.errors) {
        setFormErrors(err.response.data.errors);
      } else {
        setError(err.response?.data?.message || 'Failed to submit team member request.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  // Open Action Modal
  const openActionModal = (type, req) => {
    setError('');
    setSuccessMessage('');
    setActionModal({
      type,
      request: req,
      reason: '',
    });
  };

  const closeActionModal = () => {
    setActionModal({
      type: null,
      request: null,
      reason: '',
    });
  };

  // Execute Action
  const handleExecuteAction = async () => {
    const { type, request, reason } = actionModal;
    if (!request) return;

    if (['request-info', 'reject', 'resubmit', 'cancel'].includes(type) && !reason.trim()) {
      alert('A message/reason is required to proceed.');
      return;
    }

    setActionLoading(true);
    setError('');
    setSuccessMessage('');

    try {
      let res;
      if (type === 'approve') {
        res = await teamRequestService.approveTeamRequest(request.id, reason.trim());
      } else if (type === 'reject') {
        res = await teamRequestService.rejectTeamRequest(request.id, reason.trim());
      } else if (type === 'request-info') {
        res = await teamRequestService.requestInfoTeamRequest(request.id, reason.trim());
      } else if (type === 'resubmit') {
        res = await teamRequestService.resubmitTeamRequest(request.id, reason.trim());
      } else if (type === 'cancel') {
        res = await teamRequestService.cancelTeamRequest(request.id, reason.trim());
      }

      setSuccessMessage(res?.message || 'Action executed successfully.');
      closeActionModal();
      if (isDetailModalOpen) {
        setIsDetailModalOpen(false);
      }
      fetchRequests(pagination.currentPage);
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Action failed.');
    } finally {
      setActionLoading(false);
    }
  };

  // Status Badge Class Resolver
  const getStatusBadge = (status) => {
    switch (status) {
      case 'Approved':
        return <span className="badge badge-success">Approved</span>;
      case 'Needs Information':
        return <span className="badge badge-info">Needs Information</span>;
      case 'Pending':
        return <span className="badge badge-warning">Pending</span>;
      case 'Rejected':
        return <span className="badge badge-danger">Rejected</span>;
      case 'Cancelled':
        return <span className="badge badge-neutral">Cancelled</span>;
      default:
        return <span className="badge badge-neutral">{status || 'Unknown'}</span>;
    }
  };

  // Check if current user is the owner of the requisition
  const isOwner = (req) => {
    if (!req) return false;
    if (user?.employee_id && (Number(user.employee_id) === Number(req.manager_employee_id))) {
      return true;
    }
    return isManager;
  };

  // Metric counts across current view
  const approvedCount = requests.filter(r => r.status === 'Approved').length;
  const pendingCount = requests.filter(r => r.status === 'Pending').length;
  const needsInfoCount = requests.filter(r => r.status === 'Needs Information').length;
  const terminalCount = requests.filter(r => ['Rejected', 'Cancelled'].includes(r.status)).length;

  return (
    <div className="team-requests-page" style={{ padding: '1.5rem' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#073B33' }}>Team Member Requests</h1>
          <p style={{ color: '#64748B', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Submit and review staffing requisitions with multi-stage approval workflows.
          </p>
        </div>

        {/* New Request Button: Visible strictly for Managers */}
        {isManager && (
          <button
            className="btn btn-primary"
            onClick={handleOpenCreateModal}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', fontSize: '0.875rem', fontWeight: 600 }}
          >
            <span>+ New Team Request</span>
          </button>
        )}
      </div>

      {/* Messages */}
      {error && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: '6px', background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
          {error}
        </div>
      )}
      {successMessage && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: '6px', background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>
          {successMessage}
        </div>
      )}

      {/* Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ padding: '1.25rem', borderRadius: '8px', borderLeft: '4px solid #075E4B', background: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Total Requisitions</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem', color: '#0f172a' }}>{pagination.total}</div>
        </div>
        <div className="card" style={{ padding: '1.25rem', borderRadius: '8px', borderLeft: '4px solid #10b981', background: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Approved</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem', color: '#10b981' }}>{approvedCount}</div>
        </div>
        <div className="card" style={{ padding: '1.25rem', borderRadius: '8px', borderLeft: '4px solid #f59e0b', background: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Pending</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem', color: '#f59e0b' }}>{pendingCount}</div>
        </div>
        <div className="card" style={{ padding: '1.25rem', borderRadius: '8px', borderLeft: '4px solid #3b82f6', background: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Needs Info</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem', color: '#3b82f6' }}>{needsInfoCount}</div>
        </div>
        <div className="card" style={{ padding: '1.25rem', borderRadius: '8px', borderLeft: '4px solid #ef4444', background: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Rejected / Cancelled</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem', color: '#ef4444' }}>{terminalCount}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ padding: '1rem', marginBottom: '1.5rem', background: '#ffffff', borderRadius: '8px', border: '1px solid #E2E8E5', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', alignItems: 'center' }}>
          <div>
            <input
              type="text"
              placeholder="Search code, designation, manager..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #E2E8E5',
                borderRadius: '6px',
                fontSize: '0.875rem'
              }}
            />
          </div>

          <div>
            <CustomSelect
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="">All Statuses</option>
              {STATUS_OPTIONS.filter(s => s !== 'All').map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </CustomSelect>
          </div>

          <div>
            <CustomSelect
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="">All Departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </CustomSelect>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn-secondary"
              onClick={handleResetFilters}
              style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
            >
              Reset
            </button>
            <button
              className="btn btn-primary"
              onClick={() => fetchRequests(pagination.currentPage)}
              style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="table-container" style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #E2E8E5', overflowX: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ padding: '0.75rem 1rem' }}>Request Code</th>
              <th style={{ padding: '0.75rem 1rem' }}>Department & Designation</th>
              <th style={{ padding: '0.75rem 1rem' }}>Openings</th>
              <th style={{ padding: '0.75rem 1rem' }}>Requester</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Status</th>
              <th style={{ padding: '0.75rem 1rem' }}>Reviewer Remarks</th>
              <th style={{ padding: '0.75rem 1rem' }}>Submitted On</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                  Loading team member requests...
                </td>
              </tr>
            ) : requests.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                  No team member requests found.
                </td>
              </tr>
            ) : (
              requests.map((req) => (
                <tr key={req.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.875rem 1rem', fontWeight: 600, color: '#073B33' }}>
                    {req.request_code}
                  </td>
                  <td style={{ padding: '0.875rem 1rem' }}>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{req.department_name || '—'}</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{req.designation_title || 'General Opening'}</div>
                  </td>
                  <td style={{ padding: '0.875rem 1rem', fontWeight: 600, color: '#334155' }}>
                    {req.openings_count} ({req.employment_type || 'Full-time'})
                  </td>
                  <td style={{ padding: '0.875rem 1rem', color: '#475569' }}>
                    <div>{req.manager_name || 'Manager'}</div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{req.manager_email || ''}</div>
                  </td>
                  <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}>
                    {getStatusBadge(req.status)}
                  </td>
                  <td style={{ padding: '0.875rem 1rem', color: '#475569', fontSize: '0.825rem', maxWidth: '250px' }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={req.reviewer_remarks || ''}>
                      {req.reviewer_remarks || '—'}
                    </div>
                  </td>
                  <td style={{ padding: '0.875rem 1rem', color: '#64748b', fontSize: '0.825rem', whiteSpace: 'nowrap' }}>
                    {req.created_at ? req.created_at.substring(0, 16) : '—'}
                  </td>
                  <td style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.35rem', alignItems: 'center' }}>
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleOpenDetail(req)}
                        style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                      >
                        Details
                      </button>

                      {/* Manager Resubmit Button (Only when Needs Information) */}
                      {isOwner(req) && req.status === 'Needs Information' && (
                        <button
                          className="btn btn-primary"
                          onClick={() => openActionModal('resubmit', req)}
                          style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                        >
                          Resubmit
                        </button>
                      )}

                      {/* Manager Cancel Button (When Pending or Needs Information) */}
                      {isOwner(req) && ['Pending', 'Needs Information'].includes(req.status) && (
                        <button
                          className="btn btn-secondary"
                          onClick={() => openActionModal('cancel', req)}
                          style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', color: '#b91c1c', borderColor: '#fca5a5' }}
                        >
                          Cancel
                        </button>
                      )}

                      {/* HR Actions: Request Info (HR Executive, HR Admin, Super Admin for Pending) */}
                      {(isSuperOrHrAdmin || isHrExecutive) && req.status === 'Pending' && (
                        <button
                          className="btn btn-secondary"
                          onClick={() => openActionModal('request-info', req)}
                          style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                        >
                          Request Info
                        </button>
                      )}

                      {/* HR Approver Actions: Approve & Reject (Super Admin & HR Admin for Pending or Needs Information) */}
                      {isSuperOrHrAdmin && ['Pending', 'Needs Information'].includes(req.status) && (
                        <>
                          <button
                            className="btn btn-success"
                            onClick={() => openActionModal('approve', req)}
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                          >
                            Approve
                          </button>
                          <button
                            className="btn btn-danger"
                            onClick={() => openActionModal('reject', req)}
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {pagination.total > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', fontSize: '0.875rem', color: '#64748b' }}>
          <div>
            Showing {requests.length} of {pagination.total} requests
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn-secondary"
              disabled={pagination.currentPage <= 1 || loading}
              onClick={() => fetchRequests(pagination.currentPage - 1)}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
            >
              Previous
            </button>
            <span style={{ display: 'flex', alignItems: 'center', padding: '0 0.5rem' }}>
              Page {pagination.currentPage} of {pagination.lastPage}
            </span>
            <button
              className="btn btn-secondary"
              disabled={pagination.currentPage >= pagination.lastPage || loading}
              onClick={() => fetchRequests(pagination.currentPage + 1)}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 1: Create Requisition (Strictly Manager Only)           */}
      {/* ------------------------------------------------------------- */}
      {isManager && isCreateModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            maxWidth: '680px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '1.75rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8E5', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#073B33' }}>
                New Team Member Request
              </h2>
              <button onClick={() => setIsCreateModalOpen(false)} style={{ fontSize: '1.25rem', color: '#64748b' }}>✕</button>
            </div>

            <form onSubmit={handleSaveRequest}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Department *</label>
                  <CustomSelect
                    name="department_id"
                    value={createFormData.department_id}
                    onChange={handleFormChange}
                    style={{ width: '100%' }}
                  >
                    <option value="">Select Department</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </CustomSelect>
                  {formErrors.department_id && <span style={{ color: '#ef4444', fontSize: '0.75rem' }}>{formErrors.department_id}</span>}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Designation</label>
                  <CustomSelect
                    name="designation_id"
                    value={createFormData.designation_id}
                    onChange={handleFormChange}
                    style={{ width: '100%' }}
                  >
                    <option value="">Select Designation (Optional)</option>
                    {designations.map(d => (
                      <option key={d.id} value={d.id}>{d.title}</option>
                    ))}
                  </CustomSelect>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Openings Count (1-50) *</label>
                  <input
                    type="number"
                    name="openings_count"
                    min="1"
                    max="50"
                    value={createFormData.openings_count}
                    onChange={handleFormChange}
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #E2E8E5', borderRadius: '6px' }}
                  />
                  {formErrors.openings_count && <span style={{ color: '#ef4444', fontSize: '0.75rem' }}>{formErrors.openings_count}</span>}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Employment Type *</label>
                  <CustomSelect
                    name="employment_type"
                    value={createFormData.employment_type}
                    onChange={handleFormChange}
                    style={{ width: '100%' }}
                  >
                    {EMPLOYMENT_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </CustomSelect>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Experience Level</label>
                  <input
                    type="text"
                    name="experience_level"
                    placeholder="e.g. 2-4 years, Entry-level"
                    value={createFormData.experience_level}
                    onChange={handleFormChange}
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #E2E8E5', borderRadius: '6px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Urgency *</label>
                  <CustomSelect
                    name="urgency"
                    value={createFormData.urgency}
                    onChange={handleFormChange}
                    style={{ width: '100%' }}
                  >
                    {URGENCIES.map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </CustomSelect>
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Skills Required</label>
                <input
                  type="text"
                  name="skills_required"
                  placeholder="e.g. React, PHP, MySQL, System Architecture"
                  value={createFormData.skills_required}
                  onChange={handleFormChange}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #E2E8E5', borderRadius: '6px' }}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Business Justification *</label>
                <textarea
                  name="business_justification"
                  rows="3"
                  placeholder="Explain the workload, project deliverable, or organizational need requiring this requisition..."
                  value={createFormData.business_justification}
                  onChange={handleFormChange}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #E2E8E5', borderRadius: '6px' }}
                ></textarea>
                {formErrors.business_justification && <span style={{ color: '#ef4444', fontSize: '0.75rem' }}>{formErrors.business_justification}</span>}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 2: Action Dialog (Approve, Reject, Request Info, etc.)  */}
      {/* ------------------------------------------------------------- */}
      {actionModal.type && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '1rem'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            maxWidth: '520px',
            width: '100%',
            padding: '1.5rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#073B33', marginBottom: '0.75rem' }}>
              {actionModal.type === 'approve' && 'Approve Requisition'}
              {actionModal.type === 'reject' && 'Reject Requisition'}
              {actionModal.type === 'request-info' && 'Request Information from Manager'}
              {actionModal.type === 'resubmit' && 'Resubmit Clarification'}
              {actionModal.type === 'cancel' && 'Cancel Requisition'}
            </h3>

            <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1rem' }}>
              Requisition: <strong>{actionModal.request?.request_code}</strong> ({actionModal.request?.department_name})
            </p>

            {actionModal.type === 'approve' ? (
              <div style={{ marginBottom: '1rem' }}>
                <p style={{ fontSize: '0.875rem', color: '#334155', marginBottom: '0.75rem' }}>
                  Are you sure you want to approve this requisition? This will mark the request as approved.
                </p>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                  Approval Remarks (Optional)
                </label>
                <textarea
                  rows="2"
                  placeholder="e.g. Approved within Q4 headcount budget..."
                  value={actionModal.reason}
                  onChange={(e) => setActionModal(prev => ({ ...prev, reason: e.target.value }))}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #E2E8E5', borderRadius: '6px' }}
                />
              </div>
            ) : (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                  {actionModal.type === 'reject' && 'Rejection Reason *'}
                  {actionModal.type === 'request-info' && 'Clarification Query *'}
                  {actionModal.type === 'resubmit' && 'Manager Clarification Response *'}
                  {actionModal.type === 'cancel' && 'Cancellation Reason *'}
                </label>
                <textarea
                  rows="3"
                  placeholder={
                    actionModal.type === 'reject' ? 'Explain the reason for rejection...' :
                    actionModal.type === 'request-info' ? 'State what details require clarification...' :
                    actionModal.type === 'resubmit' ? 'Provide your response to the HR query...' :
                    'State the reason for cancelling this request...'
                  }
                  value={actionModal.reason}
                  onChange={(e) => setActionModal(prev => ({ ...prev, reason: e.target.value }))}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #E2E8E5', borderRadius: '6px' }}
                />
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={closeActionModal}
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className={
                  actionModal.type === 'approve' ? 'btn btn-success' :
                  actionModal.type === 'reject' || actionModal.type === 'cancel' ? 'btn btn-danger' :
                  'btn btn-primary'
                }
                onClick={handleExecuteAction}
                disabled={actionLoading}
              >
                {actionLoading ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 3: Requisition Details & Audit History                  */}
      {/* ------------------------------------------------------------- */}
      {isDetailModalOpen && viewingRequest && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            maxWidth: '680px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '1.75rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8E5', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Requisition Details</div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#073B33', marginTop: '0.2rem' }}>
                  {viewingRequest.request_code}
                </h2>
              </div>
              <div>
                {getStatusBadge(viewingRequest.status)}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1.25rem', fontSize: '0.875rem' }}>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Department</span>
                <strong style={{ color: '#0f172a' }}>{viewingRequest.department_name || '—'}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Designation</span>
                <strong style={{ color: '#0f172a' }}>{viewingRequest.designation_title || 'General Opening'}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Openings & Employment Type</span>
                <strong style={{ color: '#0f172a' }}>{viewingRequest.openings_count} Openings ({viewingRequest.employment_type})</strong>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Urgency</span>
                <strong style={{ color: '#0f172a' }}>{viewingRequest.urgency || 'Medium'}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Salary Range</span>
                <strong style={{ color: '#0f172a' }}>
                  {viewingRequest.salary_min && viewingRequest.salary_max
                    ? `₹${Number(viewingRequest.salary_min).toLocaleString()} - ₹${Number(viewingRequest.salary_max).toLocaleString()}`
                    : 'Not specified'}
                </strong>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Requesting Manager</span>
                <strong style={{ color: '#0f172a' }}>{viewingRequest.manager_name}</strong>
              </div>
            </div>

            {viewingRequest.business_justification && (
              <div style={{ marginBottom: '1.25rem', padding: '0.75rem', background: '#F8FAF9', borderRadius: '6px', border: '1px solid #E2E8E5' }}>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem', fontWeight: 600 }}>Business Justification</span>
                <p style={{ color: '#334155', fontSize: '0.85rem', lineHeight: 1.5, margin: 0 }}>
                  {viewingRequest.business_justification}
                </p>
              </div>
            )}

            {viewingRequest.reviewer_remarks && (
              <div style={{ marginBottom: '1.25rem', padding: '0.75rem', background: '#F8FAF9', borderRadius: '6px', border: '1px solid #E2E8E5' }}>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem', fontWeight: 600 }}>Reviewer Remarks</span>
                <p style={{ color: '#075E4B', fontWeight: 500, fontSize: '0.85rem', lineHeight: 1.5, margin: 0 }}>
                  {viewingRequest.reviewer_remarks}
                </p>
                {viewingRequest.reviewed_at && (
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginTop: '0.35rem' }}>
                    Reviewed by {viewingRequest.reviewer_name || 'Admin'} on {viewingRequest.reviewed_at}
                  </span>
                )}
              </div>
            )}

            {viewingRequest.clarification_notes && (
              <div style={{ marginBottom: '1.25rem', padding: '0.75rem', background: '#EFF6FF', borderRadius: '6px', border: '1px solid #BFDBFE' }}>
                <span style={{ color: '#1D4ED8', display: 'block', fontSize: '0.75rem', marginBottom: '0.35rem', fontWeight: 600 }}>Clarification Audit Trail</span>
                <pre style={{
                  color: '#1E3A8A',
                  fontSize: '0.8rem',
                  fontFamily: 'inherit',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.5,
                  margin: 0
                }}>
                  {viewingRequest.clarification_notes}
                </pre>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #E2E8E5', paddingTop: '1rem' }}>
              <button
                className="btn btn-secondary"
                onClick={handleCloseDetail}
                style={{ padding: '0.5rem 1.25rem' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamRequests;
