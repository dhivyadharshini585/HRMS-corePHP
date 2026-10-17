import React, { useState, useEffect, useCallback } from 'react';
import jobOpeningService from '../../services/jobOpeningService';
import departmentService from '../../services/departmentService';
import designationService from '../../services/designationService';
import { useAuthContext } from '../../context/AuthContext';
import CustomSelect from '../../components/common/CustomSelect';

const EMPLOYMENT_TYPES = ['Full Time', 'Part Time', 'Contract', 'Internship'];
const STATUSES = ['Draft', 'Open', 'Closed'];

const initialFormData = {
  title: '',
  job_code: '',
  department_id: '',
  designation_id: '',
  employment_type: 'Full Time',
  location: '',
  openings_count: 1,
  experience_min: 0,
  experience_max: '',
  salary_min: '',
  salary_max: '',
  application_deadline: '',
  status: 'Draft',
  description: '',
  requirements: '',
  responsibilities: '',
};

const Jobs = () => {
  const { user } = useAuthContext();

  const [jobs, setJobs] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    lastPage: 1,
    total: 0,
    perPage: 10,
  });

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Modals
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [viewingJob, setViewingJob] = useState(null);
  const [formData, setFormData] = useState(initialFormData);
  const [formErrors, setFormErrors] = useState({});

  // RBAC checks
  const canCreate = user?.roles?.some(r => ['Super Admin', 'HR Admin', 'HR Executive'].includes(r)) ||
                    user?.permissions?.includes('recruitment.jobs.create');
  const canUpdate = user?.roles?.some(r => ['Super Admin', 'HR Admin', 'HR Executive'].includes(r)) ||
                    user?.permissions?.includes('recruitment.jobs.update');
  const canDelete = user?.roles?.some(r => ['Super Admin', 'HR Admin'].includes(r)) ||
                    user?.permissions?.includes('recruitment.jobs.delete');

  // Load departments and designations for selects
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

  // Fetch Jobs List
  const fetchJobs = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = {
        page,
        per_page: pagination.perPage,
      };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (deptFilter) params.department_id = deptFilter;
      if (typeFilter) params.employment_type = typeFilter;

      const res = await jobOpeningService.getJobOpenings(params);
      const dataList = res.data || [];
      setJobs(dataList);
      setPagination({
        currentPage: res.current_page || 1,
        lastPage: res.last_page || 1,
        total: res.total || dataList.length,
        perPage: res.per_page || 10,
      });
    } catch (err) {
      if (err.response?.status === 403) {
        setError('Access denied. You do not have permission to view Job Openings.');
      } else {
        setError(err.response?.data?.message || 'Failed to load job openings.');
      }
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, deptFilter, typeFilter, pagination.perPage]);

  useEffect(() => {
    fetchJobs(1);
  }, [fetchJobs]);

  // Search & Filter handlers
  const handleResetFilters = () => {
    setSearch('');
    setStatusFilter('');
    setDeptFilter('');
    setTypeFilter('');
  };

  // Open Create / Edit Modal
  const handleOpenForm = (job = null) => {
    setFormErrors({});
    setError('');
    setSuccessMessage('');
    if (job) {
      setEditingJob(job);
      setFormData({
        title: job.title || '',
        job_code: job.job_code || '',
        department_id: job.department_id || '',
        designation_id: job.designation_id || '',
        employment_type: job.employment_type || 'Full Time',
        location: job.location || '',
        openings_count: job.openings_count ?? 1,
        experience_min: job.experience_min ?? 0,
        experience_max: job.experience_max ?? '',
        salary_min: job.salary_min ?? '',
        salary_max: job.salary_max ?? '',
        application_deadline: job.application_deadline ? job.application_deadline.substring(0, 10) : '',
        status: job.status || 'Draft',
        description: job.description || '',
        requirements: job.requirements || '',
        responsibilities: job.responsibilities || '',
      });
    } else {
      setEditingJob(null);
      setFormData(initialFormData);
    }
    setIsFormModalOpen(true);
  };

  // Open Detail Modal
  const handleOpenDetail = (job) => {
    setViewingJob(job);
    setIsDetailModalOpen(true);
  };

  // Form input changes
  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  // Save Job Opening
  const handleSave = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormErrors({});
    setError('');
    setSuccessMessage('');

    // Client-side quick checks
    const errors = {};
    if (!formData.title.trim()) errors.title = 'Title is required';
    if (!formData.department_id) errors.department_id = 'Department is required';
    if (!formData.location.trim()) errors.location = 'Location is required';
    if (Number(formData.openings_count) < 1) errors.openings_count = 'Openings count must be at least 1';
    if (!formData.description.trim()) errors.description = 'Description is required';

    if (formData.experience_max !== '' && Number(formData.experience_max) < Number(formData.experience_min || 0)) {
      errors.experience_max = 'Max experience must be greater than or equal to min experience';
    }
    if (formData.salary_max !== '' && Number(formData.salary_max) < Number(formData.salary_min || 0)) {
      errors.salary_max = 'Max salary must be greater than or equal to min salary';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      setSubmitting(false);
      return;
    }

    try {
      const payload = {
        ...formData,
        openings_count: Number(formData.openings_count),
        experience_min: formData.experience_min !== '' ? Number(formData.experience_min) : 0,
        experience_max: formData.experience_max !== '' ? Number(formData.experience_max) : null,
        salary_min: formData.salary_min !== '' ? Number(formData.salary_min) : null,
        salary_max: formData.salary_max !== '' ? Number(formData.salary_max) : null,
        designation_id: formData.designation_id || null,
        application_deadline: formData.application_deadline || null,
      };
      if (!payload.job_code) {
        delete payload.job_code;
      }

      if (editingJob) {
        await jobOpeningService.updateJobOpening(editingJob.id, payload);
        setSuccessMessage('Job opening updated successfully.');
      } else {
        await jobOpeningService.createJobOpening(payload);
        setSuccessMessage('Job opening created successfully.');
      }

      setIsFormModalOpen(false);
      fetchJobs(pagination.currentPage);
    } catch (err) {
      if (err.response?.status === 422 && err.response?.data?.errors) {
        setFormErrors(err.response.data.errors);
      } else {
        setError(err.response?.data?.message || 'Failed to save job opening.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Job Opening
  const handleDelete = async (job) => {
    if (!window.confirm(`Are you sure you want to delete job opening "${job.title}" (${job.job_code})?`)) {
      return;
    }
    setError('');
    setSuccessMessage('');
    try {
      await jobOpeningService.deleteJobOpening(job.id);
      setSuccessMessage('Job opening deleted successfully.');
      fetchJobs(pagination.currentPage);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete job opening.');
    }
  };

  // Helper badge color
  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'Open':
        return 'badge-active';
      case 'Draft':
        return 'badge-pending';
      case 'Closed':
        return 'badge-rejected';
      default:
        return 'badge-inactive';
    }
  };

  // Stats calculation
  const totalCount = pagination.total;
  const openCount = jobs.filter(j => j.status === 'Open').length;
  const draftCount = jobs.filter(j => j.status === 'Draft').length;
  const closedCount = jobs.filter(j => j.status === 'Closed').length;

  return (
    <div className="page-container" id="job-openings-page">
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title" style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700 }}>Job Openings</h1>
          <p style={{ margin: '0.25rem 0 0 0', color: 'var(--color-text-secondary, #64748b)' }}>
            Manage positions, recruitment status, and hiring requirements
          </p>
        </div>
        {canCreate && (
          <button
            id="btn-add-job-opening"
            className="btn btn-primary"
            onClick={() => handleOpenForm()}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <span>+ Add Job Opening</span>
          </button>
        )}
      </div>

      {/* Messages */}
      {error && (
        <div className="alert alert-error" style={{ marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: '6px', background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
          {error}
        </div>
      )}
      {successMessage && (
        <div className="alert alert-success" style={{ marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: '6px', background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>
          {successMessage}
        </div>
      )}

      {/* Stats Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ padding: '1.25rem', borderRadius: '8px', borderLeft: '4px solid #075E4B' }}>
          <div style={{ fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Openings</div>
          <div style={{ fontSize: '1.85rem', fontWeight: 700, marginTop: '0.25rem', color: '#0f172a' }}>{totalCount}</div>
        </div>
        <div className="card" style={{ padding: '1.25rem', borderRadius: '8px', borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Page Active (Open)</div>
          <div style={{ fontSize: '1.85rem', fontWeight: 700, marginTop: '0.25rem', color: '#10b981' }}>{openCount}</div>
        </div>
        <div className="card" style={{ padding: '1.25rem', borderRadius: '8px', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Page Drafts</div>
          <div style={{ fontSize: '1.85rem', fontWeight: 700, marginTop: '0.25rem', color: '#f59e0b' }}>{draftCount}</div>
        </div>
        <div className="card" style={{ padding: '1.25rem', borderRadius: '8px', borderLeft: '4px solid #ef4444' }}>
          <div style={{ fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Page Closed</div>
          <div style={{ fontSize: '1.85rem', fontWeight: 700, marginTop: '0.25rem', color: '#ef4444' }}>{closedCount}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', alignItems: 'center' }}>
          <div>
            <input
              id="job-search-input"
              type="text"
              placeholder="Search title, code, location..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-control"
              style={{ width: '100%', padding: '0.5rem 0.75rem' }}
            />
          </div>
          <div>
            <CustomSelect
              id="job-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="form-control"
              style={{ width: '100%', padding: '0.5rem 0.75rem' }}
            >
              <option value="">All Statuses</option>
              {STATUSES.map(st => (
                <option key={st} value={st}>{st}</option>
              ))}
            </CustomSelect>
          </div>
          <div>
            <CustomSelect
              id="job-dept-filter"
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="form-control"
              style={{ width: '100%', padding: '0.5rem 0.75rem' }}
            >
              <option value="">All Departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </CustomSelect>
          </div>
          <div>
            <CustomSelect
              id="job-type-filter"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="form-control"
              style={{ width: '100%', padding: '0.5rem 0.75rem' }}
            >
              <option value="">All Employment Types</option>
              {EMPLOYMENT_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </CustomSelect>
          </div>
          <div>
            <button
              id="btn-reset-filters"
              className="btn btn-secondary"
              onClick={handleResetFilters}
              style={{ width: '100%', padding: '0.5rem 0.75rem' }}
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" id="job-openings-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Code</th>
                <th style={{ padding: '0.75rem 1rem' }}>Title & Designation</th>
                <th style={{ padding: '0.75rem 1rem' }}>Department</th>
                <th style={{ padding: '0.75rem 1rem' }}>Type</th>
                <th style={{ padding: '0.75rem 1rem' }}>Location</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Openings</th>
                <th style={{ padding: '0.75rem 1rem' }}>Deadline</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                    Loading job openings...
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                    No job openings found matching your criteria.
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <tr key={job.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#334155' }}>
                      {job.job_code}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{job.title}</div>
                      {job.designation && (
                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{job.designation.title}</div>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#475569' }}>
                      {job.department?.name || '—'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#475569' }}>
                      {job.employment_type}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#475569' }}>
                      {job.location}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 600 }}>
                      {job.openings_count}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#475569', fontSize: '0.85rem' }}>
                      {job.application_deadline ? job.application_deadline.substring(0, 10) : 'None'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <span className={`badge ${getStatusBadgeClass(job.status)}`}>
                        {job.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleOpenDetail(job)}
                          title="View Details"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        >
                          View
                        </button>
                        {canUpdate && (
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleOpenForm(job)}
                            title="Edit Job"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          >
                            Edit
                          </button>
                        )}
                        {canDelete && (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDelete(job)}
                            title="Delete Job"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.total > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
            <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
              Showing {jobs.length} of {pagination.total} openings
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn btn-secondary btn-sm"
                disabled={pagination.currentPage <= 1 || loading}
                onClick={() => fetchJobs(pagination.currentPage - 1)}
              >
                Previous
              </button>
              <span style={{ display: 'flex', alignItems: 'center', padding: '0 0.5rem', fontSize: '0.85rem', fontWeight: 600 }}>
                {pagination.currentPage} / {pagination.lastPage}
              </span>
              <button
                className="btn btn-secondary btn-sm"
                disabled={pagination.currentPage >= pagination.lastPage || loading}
                onClick={() => fetchJobs(pagination.currentPage + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Form Modal */}
      {isFormModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="modal-container card" style={{ maxWidth: '750px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem', background: '#fff', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
                {editingJob ? 'Edit Job Opening' : 'Create New Job Opening'}
              </h2>
              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                {/* Title */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Job Title <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    name="title"
                    type="text"
                    required
                    value={formData.title}
                    onChange={handleFormChange}
                    className="form-control"
                    placeholder="e.g. Senior Frontend Engineer"
                    style={{ width: '100%', padding: '0.5rem' }}
                  />
                  {formErrors.title && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>{formErrors.title}</div>}
                </div>

                {/* Job Code */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Job Code (Reference)
                  </label>
                  <input
                    name="job_code"
                    type="text"
                    value={formData.job_code}
                    onChange={handleFormChange}
                    className="form-control"
                    placeholder="Auto-generated if left blank"
                    style={{ width: '100%', padding: '0.5rem' }}
                  />
                  {formErrors.job_code && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>{formErrors.job_code}</div>}
                </div>

                {/* Department */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Department <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <CustomSelect
                    name="department_id"
                    required
                    value={formData.department_id}
                    onChange={handleFormChange}
                    className="form-control"
                    style={{ width: '100%', padding: '0.5rem' }}
                  >
                    <option value="">Select Department</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </CustomSelect>
                  {formErrors.department_id && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>{formErrors.department_id}</div>}
                </div>

                {/* Designation */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Designation
                  </label>
                  <CustomSelect
                    name="designation_id"
                    value={formData.designation_id}
                    onChange={handleFormChange}
                    className="form-control"
                    style={{ width: '100%', padding: '0.5rem' }}
                  >
                    <option value="">Select Designation (Optional)</option>
                    {designations.map(ds => (
                      <option key={ds.id} value={ds.id}>{ds.title}</option>
                    ))}
                  </CustomSelect>
                  {formErrors.designation_id && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>{formErrors.designation_id}</div>}
                </div>

                {/* Employment Type */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Employment Type <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <CustomSelect
                    name="employment_type"
                    required
                    value={formData.employment_type}
                    onChange={handleFormChange}
                    className="form-control"
                    style={{ width: '100%', padding: '0.5rem' }}
                  >
                    {EMPLOYMENT_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </CustomSelect>
                  {formErrors.employment_type && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>{formErrors.employment_type}</div>}
                </div>

                {/* Location */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Location <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    name="location"
                    type="text"
                    required
                    value={formData.location}
                    onChange={handleFormChange}
                    className="form-control"
                    placeholder="e.g. Remote or Austin, TX"
                    style={{ width: '100%', padding: '0.5rem' }}
                  />
                  {formErrors.location && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>{formErrors.location}</div>}
                </div>

                {/* Openings Count */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Number of Openings <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    name="openings_count"
                    type="number"
                    min="1"
                    required
                    value={formData.openings_count}
                    onChange={handleFormChange}
                    className="form-control"
                    style={{ width: '100%', padding: '0.5rem' }}
                  />
                  {formErrors.openings_count && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>{formErrors.openings_count}</div>}
                </div>

                {/* Status */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Status <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <CustomSelect
                    name="status"
                    required
                    value={formData.status}
                    onChange={handleFormChange}
                    className="form-control"
                    style={{ width: '100%', padding: '0.5rem' }}
                  >
                    {STATUSES.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </CustomSelect>
                  {formErrors.status && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>{formErrors.status}</div>}
                </div>

                {/* Experience Min & Max */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Min Experience (Years)
                  </label>
                  <input
                    name="experience_min"
                    type="number"
                    min="0"
                    value={formData.experience_min}
                    onChange={handleFormChange}
                    className="form-control"
                    style={{ width: '100%', padding: '0.5rem' }}
                  />
                  {formErrors.experience_min && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>{formErrors.experience_min}</div>}
                </div>

                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Max Experience (Years)
                  </label>
                  <input
                    name="experience_max"
                    type="number"
                    min="0"
                    value={formData.experience_max}
                    onChange={handleFormChange}
                    className="form-control"
                    style={{ width: '100%', padding: '0.5rem' }}
                  />
                  {formErrors.experience_max && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>{formErrors.experience_max}</div>}
                </div>

                {/* Salary Min & Max */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Min Salary (₹)
                  </label>
                  <input
                    name="salary_min"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.salary_min}
                    onChange={handleFormChange}
                    className="form-control"
                    placeholder="e.g. 60000"
                    style={{ width: '100%', padding: '0.5rem' }}
                  />
                  {formErrors.salary_min && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>{formErrors.salary_min}</div>}
                </div>

                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Max Salary (₹)
                  </label>
                  <input
                    name="salary_max"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.salary_max}
                    onChange={handleFormChange}
                    className="form-control"
                    placeholder="e.g. 90000"
                    style={{ width: '100%', padding: '0.5rem' }}
                  />
                  {formErrors.salary_max && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>{formErrors.salary_max}</div>}
                </div>

                {/* Deadline */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Application Deadline
                  </label>
                  <input
                    name="application_deadline"
                    type="date"
                    value={formData.application_deadline}
                    onChange={handleFormChange}
                    className="form-control"
                    style={{ width: '100%', padding: '0.5rem' }}
                  />
                  {formErrors.application_deadline && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>{formErrors.application_deadline}</div>}
                </div>
              </div>

              {/* Description */}
              <div style={{ marginBottom: '1rem' }}>
                <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Job Description <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <textarea
                  name="description"
                  required
                  rows="4"
                  value={formData.description}
                  onChange={handleFormChange}
                  className="form-control"
                  placeholder="Provide an overview of the position, mission, and scope..."
                  style={{ width: '100%', padding: '0.5rem' }}
                />
                {formErrors.description && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>{formErrors.description}</div>}
              </div>

              {/* Responsibilities */}
              <div style={{ marginBottom: '1rem' }}>
                <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Responsibilities
                </label>
                <textarea
                  name="responsibilities"
                  rows="3"
                  value={formData.responsibilities}
                  onChange={handleFormChange}
                  className="form-control"
                  placeholder="Key responsibilities, day-to-day deliverables..."
                  style={{ width: '100%', padding: '0.5rem' }}
                />
              </div>

              {/* Requirements */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Requirements & Qualifications
                </label>
                <textarea
                  name="requirements"
                  rows="3"
                  value={formData.requirements}
                  onChange={handleFormChange}
                  className="form-control"
                  placeholder="Required skills, education, tools, years of background..."
                  style={{ width: '100%', padding: '0.5rem' }}
                />
              </div>

              {/* Modal Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsFormModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="btn-save-job"
                  className="btn btn-primary"
                  disabled={submitting}
                >
                  {submitting ? 'Saving...' : editingJob ? 'Update Job Opening' : 'Create Job Opening'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Job Details Modal */}
      {isDetailModalOpen && viewingJob && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="modal-container card" style={{ maxWidth: '650px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem', background: '#fff', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <span className={`badge ${getStatusBadgeClass(viewingJob.status)}`} style={{ marginBottom: '0.5rem', display: 'inline-block' }}>
                  {viewingJob.status}
                </span>
                <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>{viewingJob.title}</h2>
                <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.2rem' }}>
                  Code: <strong>{viewingJob.job_code}</strong> | Department: <strong>{viewingJob.department?.name || '—'}</strong>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDetailModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}
              >
                &times;
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', background: '#f8fafc', padding: '1rem', borderRadius: '6px', marginBottom: '1.25rem' }}>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Employment Type:</span>
                <div style={{ fontWeight: 600 }}>{viewingJob.employment_type}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Location:</span>
                <div style={{ fontWeight: 600 }}>{viewingJob.location}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Openings Count:</span>
                <div style={{ fontWeight: 600 }}>{viewingJob.openings_count} position(s)</div>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Application Deadline:</span>
                <div style={{ fontWeight: 600 }}>{viewingJob.application_deadline ? viewingJob.application_deadline.substring(0, 10) : 'Not Specified'}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Experience Range:</span>
                <div style={{ fontWeight: 600 }}>
                  {viewingJob.experience_min ?? 0} {viewingJob.experience_max ? `to ${viewingJob.experience_max}` : '+'} years
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Salary Range:</span>
                <div style={{ fontWeight: 600 }}>
                  {viewingJob.salary_min || viewingJob.salary_max ? (
                    `₹${Number(viewingJob.salary_min || 0).toLocaleString()} - ₹${Number(viewingJob.salary_max || 0).toLocaleString()}`
                  ) : (
                    'Not Specified'
                  )}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 600 }}>Description</h4>
              <p style={{ margin: 0, color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                {viewingJob.description}
              </p>
            </div>

            {viewingJob.responsibilities && (
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 600 }}>Responsibilities</h4>
                <p style={{ margin: 0, color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {viewingJob.responsibilities}
                </p>
              </div>
            )}

            {viewingJob.requirements && (
              <div style={{ marginBottom: '1.25rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 600 }}>Requirements</h4>
                <p style={{ margin: 0, color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {viewingJob.requirements}
                </p>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsDetailModalOpen(false)}
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

export default Jobs;
