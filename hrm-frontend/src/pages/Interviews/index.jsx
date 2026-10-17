import React, { useState, useEffect, useCallback } from 'react';
import interviewService from '../../services/interviewService';
import interviewFeedbackService from '../../services/interviewFeedbackService';
import candidateService from '../../services/candidateService';
import jobOpeningService from '../../services/jobOpeningService';
import employeeService from '../../services/employeeService';
import { useAuthContext } from '../../context/AuthContext';
import CustomSelect from '../../components/common/CustomSelect';

const INTERVIEW_TYPES = ['HR', 'Technical', 'Managerial', 'Final'];
const INTERVIEW_MODES = ['Online', 'In-person', 'Phone'];
const INTERVIEW_STATUSES = ['Scheduled', 'Completed', 'Cancelled', 'Rescheduled'];
const RECOMMENDATIONS = ['Strong Hire', 'Hire', 'Hold', 'No Hire'];

const initialFormData = {
  candidate_id: '',
  job_opening_id: '',
  interviewer_employee_id: '',
  interview_type: 'Technical',
  interview_round: 1,
  scheduled_at: '',
  duration_minutes: 45,
  mode: 'Online',
  location_or_link: '',
  status: 'Scheduled',
  remarks: '',
};

const initialFeedbackFormData = {
  overall_rating: 4,
  technical_rating: '',
  communication_rating: '',
  problem_solving_rating: '',
  cultural_fit_rating: '',
  recommendation: 'Hire',
  strengths: '',
  weaknesses: '',
  comments: '',
};

const Interviews = () => {
  const { user } = useAuthContext();

  const [interviews, setInterviews] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [jobOpenings, setJobOpenings] = useState([]);
  const [employees, setEmployees] = useState([]);
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
  const [typeFilter, setTypeFilter] = useState('');
  const [candidateFilter, setCandidateFilter] = useState('');
  const [jobFilter, setJobFilter] = useState('');
  const [interviewerFilter, setInterviewerFilter] = useState('');
  const [fromDateFilter, setFromDateFilter] = useState('');
  const [toDateFilter, setToDateFilter] = useState('');

  // Modals
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [editingInterview, setEditingInterview] = useState(null);
  const [viewingInterview, setViewingInterview] = useState(null);
  const [formData, setFormData] = useState(initialFormData);
  const [formErrors, setFormErrors] = useState({});

  // Interview Feedback Modals & State
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [isFeedbackViewModalOpen, setIsFeedbackViewModalOpen] = useState(false);
  const [activeFeedbackInterview, setActiveFeedbackInterview] = useState(null);
  const [activeFeedback, setActiveFeedback] = useState(null);
  const [feedbackFormData, setFeedbackFormData] = useState(initialFeedbackFormData);
  const [feedbackFormErrors, setFeedbackFormErrors] = useState({});
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  // Selected candidate's job opening preview
  const [selectedCandidateJob, setSelectedCandidateJob] = useState(null);

  // RBAC permissions for interviews
  const canCreate = user?.roles?.some(r => ['Super Admin', 'HR Admin', 'HR Executive'].includes(r)) ||
                    user?.permissions?.includes('recruitment.interviews.create');
  const canUpdate = user?.roles?.some(r => ['Super Admin', 'HR Admin', 'HR Executive'].includes(r)) ||
                    user?.permissions?.includes('recruitment.interviews.update');
  const canDelete = user?.roles?.some(r => ['Super Admin', 'HR Admin'].includes(r)) ||
                    user?.permissions?.includes('recruitment.interviews.delete');

  // RBAC permissions for interview feedback
  const canViewFeedback = (interview) => {
    if (!interview) return false;
    if (user?.roles?.some(r => ['Super Admin', 'HR Admin', 'HR Executive'].includes(r))) return true;
    if (user?.roles?.includes('Manager')) {
      const userEmpId = user.employee?.id;
      if (!userEmpId) return false;
      return Number(interview.interviewer_employee_id) === Number(userEmpId) ||
             Number(interview.interviewer?.manager_id) === Number(userEmpId);
    }
    return false;
  };

  const canSubmitFeedback = (interview) => {
    if (!interview || interview.status !== 'Completed' || interview.feedback) return false;
    if (user?.roles?.some(r => ['Super Admin', 'HR Admin', 'HR Executive'].includes(r))) return true;
    if (user?.roles?.includes('Manager')) {
      const userEmpId = user.employee?.id;
      return userEmpId && Number(interview.interviewer_employee_id) === Number(userEmpId);
    }
    return false;
  };

  const canEditFeedback = (interview) => {
    if (!interview || !interview.feedback) return false;
    if (user?.roles?.some(r => ['Super Admin', 'HR Admin', 'HR Executive'].includes(r))) return true;
    if (user?.roles?.includes('Manager')) {
      const userEmpId = user.employee?.id;
      return userEmpId && Number(interview.interviewer_employee_id) === Number(userEmpId);
    }
    return false;
  };

  const canDeleteFeedback = (interview) => {
    if (!interview || !interview.feedback) return false;
    return user?.roles?.some(r => ['Super Admin', 'HR Admin'].includes(r));
  };

  // Load candidates, job openings, and interviewers for dropdowns
  useEffect(() => {
    const loadDropdownData = async () => {
      try {
        const [candRes, jobsRes, empRes] = await Promise.all([
          candidateService.getCandidates({ per_page: 100 }),
          jobOpeningService.getJobOpenings({ per_page: 100 }),
          employeeService.getEmployees({ per_page: 100, employment_status: 'Active' }),
        ]);
        setCandidates(candRes.data || []);
        setJobOpenings(jobsRes.data || []);
        setEmployees(empRes.data || []);
      } catch (err) {
        console.error('Error fetching interview dropdown options', err);
      }
    };
    loadDropdownData();
  }, []);

  // Fetch Interviews list
  const fetchInterviews = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = {
        page,
        per_page: pagination.perPage,
      };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.interview_type = typeFilter;
      if (candidateFilter) params.candidate_id = candidateFilter;
      if (jobFilter) params.job_opening_id = jobFilter;
      if (interviewerFilter) params.interviewer_employee_id = interviewerFilter;
      if (fromDateFilter) params.from_date = fromDateFilter;
      if (toDateFilter) params.to_date = toDateFilter;

      const res = await interviewService.getInterviews(params);
      const dataList = res.data || [];
      setInterviews(dataList);
      setPagination({
        currentPage: res.current_page || 1,
        lastPage: res.last_page || 1,
        total: res.total || dataList.length,
        perPage: res.per_page || 10,
      });
    } catch (err) {
      if (err.response?.status === 403) {
        setError('Access denied. You do not have permission to view interviews.');
      } else {
        setError(err.response?.data?.message || 'Failed to load interviews.');
      }
    } finally {
      setLoading(false);
    }
  }, [
    search,
    statusFilter,
    typeFilter,
    candidateFilter,
    jobFilter,
    interviewerFilter,
    fromDateFilter,
    toDateFilter,
    pagination.perPage,
  ]);

  useEffect(() => {
    fetchInterviews(1);
  }, [fetchInterviews]);

  // Reset Filters
  const handleResetFilters = () => {
    setSearch('');
    setStatusFilter('');
    setTypeFilter('');
    setCandidateFilter('');
    setJobFilter('');
    setInterviewerFilter('');
    setFromDateFilter('');
    setToDateFilter('');
  };

  // Open Form Modal
  const handleOpenForm = (interview = null) => {
    setFormErrors({});
    if (interview) {
      setEditingInterview(interview);
      // Format scheduled_at for datetime-local input
      let formattedDate = '';
      if (interview.scheduled_at) {
        const d = new Date(interview.scheduled_at);
        formattedDate = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);
      }

      setFormData({
        candidate_id: interview.candidate_id,
        job_opening_id: interview.job_opening_id,
        interviewer_employee_id: interview.interviewer_employee_id,
        interview_type: interview.interview_type || 'Technical',
        interview_round: interview.interview_round || 1,
        scheduled_at: formattedDate,
        duration_minutes: interview.duration_minutes || 45,
        mode: interview.mode || 'Online',
        location_or_link: interview.location_or_link || '',
        status: interview.status || 'Scheduled',
        remarks: interview.remarks || '',
      });
      setSelectedCandidateJob(interview.job_opening || null);
    } else {
      setEditingInterview(null);
      setFormData(initialFormData);
      setSelectedCandidateJob(null);
    }
    setIsFormModalOpen(true);
  };

  // Handle Candidate Selection -> Auto-bind and lock Job Opening
  const handleCandidateChange = (e) => {
    const candId = e.target.value;
    const selectedCand = candidates.find(c => String(c.id) === String(candId));

    if (selectedCand) {
      const associatedJobId = selectedCand.job_opening_id;
      const associatedJob = jobOpenings.find(j => String(j.id) === String(associatedJobId)) || selectedCand.job_opening;

      setFormData(prev => ({
        ...prev,
        candidate_id: candId,
        job_opening_id: associatedJobId || '',
      }));
      setSelectedCandidateJob(associatedJob || null);
    } else {
      setFormData(prev => ({
        ...prev,
        candidate_id: '',
        job_opening_id: '',
      }));
      setSelectedCandidateJob(null);
    }
  };

  // Form Field Change
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

  // Save Interview
  const handleSave = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccessMessage('');
    setFormErrors({});

    try {
      if (editingInterview) {
        await interviewService.updateInterview(editingInterview.id, formData);
        setSuccessMessage('Interview updated successfully.');
      } else {
        await interviewService.createInterview(formData);
        setSuccessMessage('Interview scheduled successfully.');
      }
      setIsFormModalOpen(false);
      fetchInterviews(pagination.currentPage);
    } catch (err) {
      if (err.response?.status === 422 && err.response?.data?.errors) {
        setFormErrors(err.response.data.errors);
      } else {
        setError(err.response?.data?.message || 'Failed to save interview schedule.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Quick Cancel Interview
  const handleCancelInterview = async (interview) => {
    if (!window.confirm(`Are you sure you want to cancel the interview for ${interview.candidate?.full_name}?`)) {
      return;
    }
    setError('');
    setSuccessMessage('');
    try {
      await interviewService.updateInterview(interview.id, {
        status: 'Cancelled',
        remarks: interview.remarks ? `${interview.remarks} [Cancelled]` : 'Interview cancelled.',
      });
      setSuccessMessage('Interview cancelled successfully.');
      fetchInterviews(pagination.currentPage);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to cancel interview.');
    }
  };

  // Delete Interview
  const handleDelete = async (interview) => {
    if (!window.confirm(`Are you sure you want to delete this interview record for "${interview.candidate?.full_name}"?`)) {
      return;
    }
    setError('');
    setSuccessMessage('');
    try {
      await interviewService.deleteInterview(interview.id);
      setSuccessMessage('Interview deleted successfully.');
      fetchInterviews(pagination.currentPage);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete interview.');
    }
  };

  // Open Detail Modal
  const handleOpenDetail = (interview) => {
    setViewingInterview(interview);
    setIsDetailModalOpen(true);
  };

  // Open View Feedback Modal
  const handleOpenViewFeedback = async (interview) => {
    setActiveFeedbackInterview(interview);
    setFeedbackLoading(true);
    setIsFeedbackViewModalOpen(true);
    try {
      if (interview.feedback) {
        setActiveFeedback(interview.feedback);
      } else {
        const res = await interviewFeedbackService.getFeedback(interview.id);
        setActiveFeedback(res.data);
      }
    } catch (err) {
      console.error('Failed to load feedback', err);
      setError(err.response?.data?.message || 'Failed to load feedback details.');
    } finally {
      setFeedbackLoading(false);
    }
  };

  // Open Submit / Create Feedback Modal
  const handleOpenCreateFeedback = (interview) => {
    setActiveFeedbackInterview(interview);
    setActiveFeedback(null);
    setFeedbackFormData(initialFeedbackFormData);
    setFeedbackFormErrors({});
    setIsFeedbackModalOpen(true);
  };

  // Open Edit Feedback Modal
  const handleOpenEditFeedback = (interview) => {
    setActiveFeedbackInterview(interview);
    const fb = interview.feedback;
    setActiveFeedback(fb);
    setFeedbackFormData({
      overall_rating: fb?.overall_rating || 4,
      technical_rating: fb?.technical_rating ?? '',
      communication_rating: fb?.communication_rating ?? '',
      problem_solving_rating: fb?.problem_solving_rating ?? '',
      cultural_fit_rating: fb?.cultural_fit_rating ?? '',
      recommendation: fb?.recommendation || 'Hire',
      strengths: fb?.strengths || '',
      weaknesses: fb?.weaknesses || '',
      comments: fb?.comments || '',
    });
    setFeedbackFormErrors({});
    if (isFeedbackViewModalOpen) {
      setIsFeedbackViewModalOpen(false);
    }
    setIsFeedbackModalOpen(true);
  };

  // Feedback form field change
  const handleFeedbackFormChange = (e) => {
    const { name, value } = e.target;
    setFeedbackFormData(prev => ({
      ...prev,
      [name]: value,
    }));
    if (feedbackFormErrors[name]) {
      setFeedbackFormErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  // Save Feedback (Create or Update)
  const handleSaveFeedback = async (e) => {
    e.preventDefault();
    if (!activeFeedbackInterview) return;

    setFeedbackSubmitting(true);
    setError('');
    setSuccessMessage('');
    setFeedbackFormErrors({});

    try {
      const payload = {
        overall_rating: Number(feedbackFormData.overall_rating),
        technical_rating: feedbackFormData.technical_rating ? Number(feedbackFormData.technical_rating) : null,
        communication_rating: feedbackFormData.communication_rating ? Number(feedbackFormData.communication_rating) : null,
        problem_solving_rating: feedbackFormData.problem_solving_rating ? Number(feedbackFormData.problem_solving_rating) : null,
        cultural_fit_rating: feedbackFormData.cultural_fit_rating ? Number(feedbackFormData.cultural_fit_rating) : null,
        recommendation: feedbackFormData.recommendation,
        strengths: feedbackFormData.strengths || null,
        weaknesses: feedbackFormData.weaknesses || null,
        comments: feedbackFormData.comments || null,
      };

      if (activeFeedback) {
        await interviewFeedbackService.updateFeedback(activeFeedbackInterview.id, payload);
        setSuccessMessage('Interview feedback updated successfully.');
      } else {
        await interviewFeedbackService.createFeedback(activeFeedbackInterview.id, payload);
        setSuccessMessage('Interview feedback submitted successfully.');
      }
      setIsFeedbackModalOpen(false);
      fetchInterviews(pagination.currentPage);
    } catch (err) {
      if (err.response?.status === 422 && err.response?.data?.errors) {
        setFeedbackFormErrors(err.response.data.errors);
      } else {
        setError(err.response?.data?.message || 'Failed to submit interview feedback.');
      }
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  // Delete Feedback
  const handleDeleteFeedback = async (interview) => {
    if (!window.confirm(`Are you sure you want to delete feedback for ${interview.candidate?.full_name}'s interview?`)) {
      return;
    }
    setError('');
    setSuccessMessage('');
    try {
      await interviewFeedbackService.deleteFeedback(interview.id);
      setSuccessMessage('Interview feedback deleted successfully.');
      if (isFeedbackViewModalOpen) {
        setIsFeedbackViewModalOpen(false);
      }
      fetchInterviews(pagination.currentPage);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete interview feedback.');
    }
  };

  // Recommendation Styling Helper
  const getRecommendationColor = (rec) => {
    switch (rec) {
      case 'Strong Hire':
        return { bg: '#ecfdf5', text: '#065f46', border: '#a7f3d0' };
      case 'Hire':
        return { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe' };
      case 'Hold':
        return { bg: '#fffbeb', text: '#92400e', border: '#fde68a' };
      case 'No Hire':
        return { bg: '#fef2f2', text: '#991b1b', border: '#fecaca' };
      default:
        return { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' };
    }
  };

  // Status Badge Class
  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'Scheduled':
        return 'badge-primary';
      case 'Completed':
        return 'badge-active';
      case 'Rescheduled':
        return 'badge-pending';
      case 'Cancelled':
        return 'badge-rejected';
      default:
        return 'badge-inactive';
    }
  };

  // Stats calculation
  const totalCount = pagination.total;
  const scheduledCount = interviews.filter(i => i.status === 'Scheduled').length;
  const completedCount = interviews.filter(i => i.status === 'Completed').length;
  const rescheduledCount = interviews.filter(i => i.status === 'Rescheduled').length;
  const cancelledCount = interviews.filter(i => i.status === 'Cancelled').length;

  return (
    <div className="page-container" id="interviews-page">
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title" style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700 }}>Interviews</h1>
          <p style={{ margin: '0.25rem 0 0 0', color: 'var(--color-text-secondary, #64748b)' }}>
            Schedule and manage candidate interview rounds, interviewer assignments, and meeting details
          </p>
        </div>
        {canCreate && (
          <button
            id="btn-schedule-interview"
            className="btn btn-primary"
            onClick={() => handleOpenForm()}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <span>+ Schedule Interview</span>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ padding: '1.25rem', borderRadius: '8px', borderLeft: '4px solid #075E4B' }}>
          <div style={{ fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Interviews</div>
          <div style={{ fontSize: '1.85rem', fontWeight: 700, marginTop: '0.25rem', color: '#0f172a' }}>{totalCount}</div>
        </div>
        <div className="card" style={{ padding: '1.25rem', borderRadius: '8px', borderLeft: '4px solid #6366f1' }}>
          <div style={{ fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Page Scheduled</div>
          <div style={{ fontSize: '1.85rem', fontWeight: 700, marginTop: '0.25rem', color: '#6366f1' }}>{scheduledCount}</div>
        </div>
        <div className="card" style={{ padding: '1.25rem', borderRadius: '8px', borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Page Completed</div>
          <div style={{ fontSize: '1.85rem', fontWeight: 700, marginTop: '0.25rem', color: '#10b981' }}>{completedCount}</div>
        </div>
        <div className="card" style={{ padding: '1.25rem', borderRadius: '8px', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Page Rescheduled</div>
          <div style={{ fontSize: '1.85rem', fontWeight: 700, marginTop: '0.25rem', color: '#f59e0b' }}>{rescheduledCount}</div>
        </div>
        <div className="card" style={{ padding: '1.25rem', borderRadius: '8px', borderLeft: '4px solid #ef4444' }}>
          <div style={{ fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Page Cancelled</div>
          <div style={{ fontSize: '1.85rem', fontWeight: 700, marginTop: '0.25rem', color: '#ef4444' }}>{cancelledCount}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', alignItems: 'center' }}>
          <div>
            <input
              id="interview-search-input"
              type="text"
              placeholder="Search candidate, interviewer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-control"
              style={{ width: '100%', padding: '0.5rem 0.75rem' }}
            />
          </div>
          <div>
            <CustomSelect
              id="interview-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="form-control"
              style={{ width: '100%', padding: '0.5rem 0.75rem' }}
            >
              <option value="">All Statuses</option>
              {INTERVIEW_STATUSES.map(st => (
                <option key={st} value={st}>{st}</option>
              ))}
            </CustomSelect>
          </div>
          <div>
            <CustomSelect
              id="interview-type-filter"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="form-control"
              style={{ width: '100%', padding: '0.5rem 0.75rem' }}
            >
              <option value="">All Types</option>
              {INTERVIEW_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </CustomSelect>
          </div>
          <div>
            <CustomSelect
              id="interview-candidate-filter"
              value={candidateFilter}
              onChange={(e) => setCandidateFilter(e.target.value)}
              className="form-control"
              style={{ width: '100%', padding: '0.5rem 0.75rem' }}
            >
              <option value="">All Candidates</option>
              {candidates.map(c => (
                <option key={c.id} value={c.id}>{c.full_name} ({c.candidate_code})</option>
              ))}
            </CustomSelect>
          </div>
          <div>
            <CustomSelect
              id="interview-job-filter"
              value={jobFilter}
              onChange={(e) => setJobFilter(e.target.value)}
              className="form-control"
              style={{ width: '100%', padding: '0.5rem 0.75rem' }}
            >
              <option value="">All Job Openings</option>
              {jobOpenings.map(j => (
                <option key={j.id} value={j.id}>{j.title} ({j.job_code})</option>
              ))}
            </CustomSelect>
          </div>
          <div>
            <CustomSelect
              id="interview-interviewer-filter"
              value={interviewerFilter}
              onChange={(e) => setInterviewerFilter(e.target.value)}
              className="form-control"
              style={{ width: '100%', padding: '0.5rem 0.75rem' }}
            >
              <option value="">All Interviewers</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name} ({emp.employee_code})</option>
              ))}
            </CustomSelect>
          </div>
          <div>
            <button
              id="btn-reset-interview-filters"
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
          <table className="data-table" id="interviews-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Candidate</th>
                <th style={{ padding: '0.75rem 1rem' }}>Job Opening</th>
                <th style={{ padding: '0.75rem 1rem' }}>Type & Round</th>
                <th style={{ padding: '0.75rem 1rem' }}>Interviewer</th>
                <th style={{ padding: '0.75rem 1rem' }}>Date & Time</th>
                <th style={{ padding: '0.75rem 1rem' }}>Mode</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Feedback</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                    Loading interview schedules...
                  </td>
                </tr>
              ) : interviews.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                    No interview schedules found matching your criteria.
                  </td>
                </tr>
              ) : (
                interviews.map((interview) => (
                  <tr key={interview.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{interview.candidate?.full_name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{interview.candidate?.candidate_code}</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 500 }}>{interview.job_opening?.title || '—'}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{interview.job_opening?.job_code}</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 600, color: '#334155' }}>
                        Round {interview.interview_round} • {interview.interview_type}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{interview.duration_minutes} minutes</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 500, color: '#0f172a' }}>
                        {interview.interviewer ? `${interview.interviewer.first_name} ${interview.interviewer.last_name}` : '—'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{interview.interviewer?.employee_code}</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#334155', fontSize: '0.85rem' }}>
                      {interview.scheduled_at ? new Date(interview.scheduled_at).toLocaleString() : '—'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{interview.mode}</span>
                      {interview.location_or_link && (
                        <div style={{ fontSize: '0.75rem', color: '#2563eb', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '160px' }}>
                          {interview.location_or_link}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <span className={`badge ${getStatusBadgeClass(interview.status)}`}>
                        {interview.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      {interview.status === 'Completed' ? (
                        interview.feedback ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                            <span
                              style={{
                                background: getRecommendationColor(interview.feedback.recommendation).bg,
                                color: getRecommendationColor(interview.feedback.recommendation).text,
                                border: `1px solid ${getRecommendationColor(interview.feedback.recommendation).border}`,
                                fontWeight: 600,
                                fontSize: '0.72rem',
                                padding: '0.15rem 0.5rem',
                                borderRadius: '9999px',
                                display: 'inline-block',
                              }}
                            >
                              {interview.feedback.recommendation}
                            </span>
                            <div style={{ fontSize: '0.75rem', color: '#475569' }}>
                              Rating: <strong>{interview.feedback.overall_rating}/5</strong>
                            </div>
                            {canViewFeedback(interview) && (
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleOpenViewFeedback(interview)}
                                style={{ padding: '0.15rem 0.45rem', fontSize: '0.7rem', marginTop: '0.1rem' }}
                                title="View structured feedback"
                              >
                                View Feedback
                              </button>
                            )}
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                            <span style={{ fontSize: '0.75rem', color: '#d97706', fontWeight: 500 }}>
                              Pending Feedback
                            </span>
                            {canSubmitFeedback(interview) && (
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => handleOpenCreateFeedback(interview)}
                                style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}
                                title="Submit Interview Feedback"
                              >
                                + Add Feedback
                              </button>
                            )}
                          </div>
                        )
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                          —
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleOpenDetail(interview)}
                          title="View Details"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        >
                          View
                        </button>
                        {canUpdate && (
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleOpenForm(interview)}
                            title="Edit Interview"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          >
                            Edit
                          </button>
                        )}
                        {canUpdate && interview.status !== 'Cancelled' && interview.status !== 'Completed' && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleCancelInterview(interview)}
                            title="Cancel Interview"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: '#dc2626', borderColor: '#fecaca' }}
                          >
                            Cancel
                          </button>
                        )}
                        {canDelete && (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDelete(interview)}
                            title="Delete Interview"
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
              Showing {interviews.length} of {pagination.total} interview schedules
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn btn-secondary btn-sm"
                disabled={pagination.currentPage <= 1 || loading}
                onClick={() => fetchInterviews(pagination.currentPage - 1)}
              >
                Previous
              </button>
              <span style={{ display: 'flex', alignItems: 'center', padding: '0 0.5rem', fontSize: '0.85rem', fontWeight: 600 }}>
                {pagination.currentPage} / {pagination.lastPage}
              </span>
              <button
                className="btn btn-secondary btn-sm"
                disabled={pagination.currentPage >= pagination.lastPage || loading}
                onClick={() => fetchInterviews(pagination.currentPage + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Schedule / Edit Form Modal */}
      {isFormModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="modal-container card" style={{ maxWidth: '650px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem', background: '#fff', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
                {editingInterview ? 'Edit Interview Schedule' : 'Schedule New Interview'}
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                {/* Candidate Selection */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Candidate <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <CustomSelect
                    name="candidate_id"
                    id="candidate-select"
                    required
                    value={formData.candidate_id}
                    onChange={handleCandidateChange}
                    className="form-control"
                    style={{ width: '100%', padding: '0.5rem' }}
                  >
                    <option value="">Select Candidate</option>
                    {candidates.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.full_name} ({c.candidate_code})
                      </option>
                    ))}
                  </CustomSelect>
                  {formErrors.candidate_id && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>{formErrors.candidate_id}</div>}
                </div>

                {/* Job Opening (Auto-populated and Locked) */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Applied Job Opening <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    readOnly
                    disabled
                    value={selectedCandidateJob ? `${selectedCandidateJob.title} (${selectedCandidateJob.job_code})` : 'Auto-populated on candidate selection'}
                    className="form-control"
                    style={{ width: '100%', padding: '0.5rem', background: '#f1f5f9', cursor: 'not-allowed' }}
                  />
                  {formErrors.job_opening_id && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>{formErrors.job_opening_id}</div>}
                </div>

                {/* Interviewer */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Interviewer Employee <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <CustomSelect
                    name="interviewer_employee_id"
                    id="interviewer-select"
                    required
                    value={formData.interviewer_employee_id}
                    onChange={handleFormChange}
                    className="form-control"
                    style={{ width: '100%', padding: '0.5rem' }}
                  >
                    <option value="">Select Interviewer</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.first_name} {emp.last_name} ({emp.employee_code}) - {emp.department?.name || 'Staff'}
                      </option>
                    ))}
                  </CustomSelect>
                  {formErrors.interviewer_employee_id && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>{formErrors.interviewer_employee_id}</div>}
                </div>

                {/* Interview Type */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Interview Type <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <CustomSelect
                    name="interview_type"
                    required
                    value={formData.interview_type}
                    onChange={handleFormChange}
                    className="form-control"
                    style={{ width: '100%', padding: '0.5rem' }}
                  >
                    {INTERVIEW_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </CustomSelect>
                </div>

                {/* Interview Round */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Round Number <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    name="interview_round"
                    type="number"
                    min="1"
                    max="20"
                    required
                    value={formData.interview_round}
                    onChange={handleFormChange}
                    className="form-control"
                    style={{ width: '100%', padding: '0.5rem' }}
                  />
                  {formErrors.interview_round && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>{formErrors.interview_round}</div>}
                </div>

                {/* Schedule Date & Time */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Scheduled Date & Time <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    name="scheduled_at"
                    type="datetime-local"
                    required
                    value={formData.scheduled_at}
                    onChange={handleFormChange}
                    className="form-control"
                    style={{ width: '100%', padding: '0.5rem' }}
                  />
                  {formErrors.scheduled_at && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>{formErrors.scheduled_at}</div>}
                </div>

                {/* Duration */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Duration (Minutes) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <CustomSelect
                    name="duration_minutes"
                    required
                    value={formData.duration_minutes}
                    onChange={handleFormChange}
                    className="form-control"
                    style={{ width: '100%', padding: '0.5rem' }}
                  >
                    <option value="15">15 Minutes</option>
                    <option value="30">30 Minutes</option>
                    <option value="45">45 Minutes</option>
                    <option value="60">60 Minutes (1 hour)</option>
                    <option value="90">90 Minutes (1.5 hours)</option>
                    <option value="120">120 Minutes (2 hours)</option>
                  </CustomSelect>
                </div>

                {/* Mode */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Interview Mode <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <CustomSelect
                    name="mode"
                    required
                    value={formData.mode}
                    onChange={handleFormChange}
                    className="form-control"
                    style={{ width: '100%', padding: '0.5rem' }}
                  >
                    {INTERVIEW_MODES.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </CustomSelect>
                </div>

                {/* Status (When Editing) */}
                {editingInterview && (
                  <div>
                    <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                      Status <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <CustomSelect
                      name="status"
                      value={formData.status}
                      onChange={handleFormChange}
                      className="form-control"
                      style={{ width: '100%', padding: '0.5rem' }}
                    >
                      {INTERVIEW_STATUSES.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </CustomSelect>
                  </div>
                )}
              </div>

              {/* Location or Meeting Link */}
              <div style={{ marginBottom: '1rem' }}>
                <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Location or Meeting Link
                </label>
                <input
                  name="location_or_link"
                  type="text"
                  value={formData.location_or_link}
                  onChange={handleFormChange}
                  className="form-control"
                  placeholder="e.g. https://meet.google.com/xyz-abcd-efg or Conference Room 302"
                  style={{ width: '100%', padding: '0.5rem' }}
                />
              </div>

              {/* Remarks */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Interview Notes / Remarks
                </label>
                <textarea
                  name="remarks"
                  rows="3"
                  value={formData.remarks}
                  onChange={handleFormChange}
                  className="form-control"
                  placeholder="Preparation instructions, technical focus areas, candidate questions..."
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
                  id="btn-save-interview"
                  className="btn btn-primary"
                  disabled={submitting}
                >
                  {submitting ? 'Saving...' : editingInterview ? 'Update Interview' : 'Schedule Interview'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Interview Details Modal */}
      {isDetailModalOpen && viewingInterview && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="modal-container card" style={{ maxWidth: '650px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem', background: '#fff', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <span className={`badge ${getStatusBadgeClass(viewingInterview.status)}`} style={{ marginBottom: '0.5rem', display: 'inline-block' }}>
                  {viewingInterview.status}
                </span>
                <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700 }}>
                  Round {viewingInterview.interview_round}: {viewingInterview.interview_type} Interview
                </h2>
                <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.2rem' }}>
                  Scheduled for: <strong>{new Date(viewingInterview.scheduled_at).toLocaleString()}</strong> ({viewingInterview.duration_minutes} mins)
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
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Candidate:</span>
                <div style={{ fontWeight: 600 }}>{viewingInterview.candidate?.full_name}</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{viewingInterview.candidate?.candidate_code} • {viewingInterview.candidate?.email}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Job Opening:</span>
                <div style={{ fontWeight: 600 }}>{viewingInterview.job_opening?.title}</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{viewingInterview.job_opening?.job_code} • {viewingInterview.job_opening?.department?.name}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Interviewer:</span>
                <div style={{ fontWeight: 600 }}>
                  {viewingInterview.interviewer?.first_name} {viewingInterview.interviewer?.last_name}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{viewingInterview.interviewer?.employee_code} • {viewingInterview.interviewer?.email}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Mode & Location:</span>
                <div style={{ fontWeight: 600 }}>{viewingInterview.mode}</div>
                {viewingInterview.location_or_link ? (
                  <div style={{ fontSize: '0.75rem', color: '#2563eb', wordBreak: 'break-all' }}>{viewingInterview.location_or_link}</div>
                ) : (
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Not specified</div>
                )}
              </div>
            </div>

            {viewingInterview.remarks && (
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem', fontWeight: 600 }}>Remarks & Instructions</h4>
                <p style={{ margin: 0, color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.5, background: '#f8fafc', padding: '0.75rem', borderRadius: '4px' }}>
                  {viewingInterview.remarks}
                </p>
              </div>
            )}

            {/* Feedback Section inside Interview Details */}
            {viewingInterview.feedback && (
              <div style={{ marginTop: '1rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                    Interview Feedback & Evaluation
                  </h4>
                  <span
                    style={{
                      background: getRecommendationColor(viewingInterview.feedback.recommendation).bg,
                      color: getRecommendationColor(viewingInterview.feedback.recommendation).text,
                      border: `1px solid ${getRecommendationColor(viewingInterview.feedback.recommendation).border}`,
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      padding: '0.2rem 0.6rem',
                      borderRadius: '9999px',
                    }}
                  >
                    {viewingInterview.feedback.recommendation}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.5rem', marginBottom: '1rem' }}>
                  <div style={{ background: '#f8fafc', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Overall Rating</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                      ★ {viewingInterview.feedback.overall_rating} <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>/ 5</span>
                    </div>
                  </div>
                  {viewingInterview.feedback.technical_rating && (
                    <div style={{ background: '#f8fafc', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Technical</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                        {viewingInterview.feedback.technical_rating} <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>/ 5</span>
                      </div>
                    </div>
                  )}
                  {viewingInterview.feedback.communication_rating && (
                    <div style={{ background: '#f8fafc', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Communication</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                        {viewingInterview.feedback.communication_rating} <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>/ 5</span>
                      </div>
                    </div>
                  )}
                  {viewingInterview.feedback.problem_solving_rating && (
                    <div style={{ background: '#f8fafc', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Problem Solving</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                        {viewingInterview.feedback.problem_solving_rating} <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>/ 5</span>
                      </div>
                    </div>
                  )}
                  {viewingInterview.feedback.cultural_fit_rating && (
                    <div style={{ background: '#f8fafc', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Cultural Fit</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                        {viewingInterview.feedback.cultural_fit_rating} <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>/ 5</span>
                      </div>
                    </div>
                  )}
                </div>

                {viewingInterview.feedback.strengths && (
                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#166534', marginBottom: '0.2rem' }}>Strengths</div>
                    <div style={{ fontSize: '0.85rem', color: '#334155', background: '#f0fdf4', padding: '0.5rem 0.75rem', borderRadius: '4px', border: '1px solid #bbf7d0', whiteSpace: 'pre-wrap' }}>
                      {viewingInterview.feedback.strengths}
                    </div>
                  </div>
                )}

                {viewingInterview.feedback.weaknesses && (
                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#991b1b', marginBottom: '0.2rem' }}>Areas for Improvement</div>
                    <div style={{ fontSize: '0.85rem', color: '#334155', background: '#fef2f2', padding: '0.5rem 0.75rem', borderRadius: '4px', border: '1px solid #fecaca', whiteSpace: 'pre-wrap' }}>
                      {viewingInterview.feedback.weaknesses}
                    </div>
                  </div>
                )}

                {viewingInterview.feedback.comments && (
                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.2rem' }}>Comments</div>
                    <div style={{ fontSize: '0.85rem', color: '#334155', background: '#f8fafc', padding: '0.5rem 0.75rem', borderRadius: '4px', border: '1px solid #e2e8f0', whiteSpace: 'pre-wrap' }}>
                      {viewingInterview.feedback.comments}
                    </div>
                  </div>
                )}

                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>
                  Submitted: {viewingInterview.feedback.submitted_at ? new Date(viewingInterview.feedback.submitted_at).toLocaleString() : '—'}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '1rem', marginTop: '1rem' }}>
              <div>
                {viewingInterview.status === 'Completed' && !viewingInterview.feedback && canSubmitFeedback(viewingInterview) && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setIsDetailModalOpen(false);
                      handleOpenCreateFeedback(viewingInterview);
                    }}
                  >
                    + Submit Feedback
                  </button>
                )}
                {viewingInterview.feedback && canEditFeedback(viewingInterview) && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setIsDetailModalOpen(false);
                      handleOpenEditFeedback(viewingInterview);
                    }}
                  >
                    Edit Feedback
                  </button>
                )}
              </div>
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

      {/* Standalone View Feedback Modal */}
      {isFeedbackViewModalOpen && activeFeedbackInterview && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="modal-container card" style={{ maxWidth: '650px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem', background: '#fff', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <span
                  style={{
                    background: activeFeedback ? getRecommendationColor(activeFeedback.recommendation).bg : '#f1f5f9',
                    color: activeFeedback ? getRecommendationColor(activeFeedback.recommendation).text : '#475569',
                    border: `1px solid ${activeFeedback ? getRecommendationColor(activeFeedback.recommendation).border : '#cbd5e1'}`,
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '9999px',
                    display: 'inline-block',
                    marginBottom: '0.4rem',
                  }}
                >
                  {activeFeedback ? activeFeedback.recommendation : 'Evaluation'}
                </span>
                <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700 }}>
                  Interview Feedback — Round {activeFeedbackInterview.interview_round}
                </h2>
                <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.2rem' }}>
                  Candidate: <strong>{activeFeedbackInterview.candidate?.full_name}</strong> ({activeFeedbackInterview.candidate?.candidate_code}) • {activeFeedbackInterview.job_opening?.title}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFeedbackViewModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}
              >
                &times;
              </button>
            </div>

            {feedbackLoading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                Loading feedback details...
              </div>
            ) : activeFeedback ? (
              <div>
                {/* Ratings Breakdown Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' }}>Overall Rating</div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a' }}>
                      ★ {activeFeedback.overall_rating} <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>/ 5</span>
                    </div>
                  </div>
                  {activeFeedback.technical_rating && (
                    <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' }}>Technical</div>
                      <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a' }}>
                        {activeFeedback.technical_rating} <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>/ 5</span>
                      </div>
                    </div>
                  )}
                  {activeFeedback.communication_rating && (
                    <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' }}>Communication</div>
                      <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a' }}>
                        {activeFeedback.communication_rating} <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>/ 5</span>
                      </div>
                    </div>
                  )}
                  {activeFeedback.problem_solving_rating && (
                    <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' }}>Problem Solving</div>
                      <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a' }}>
                        {activeFeedback.problem_solving_rating} <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>/ 5</span>
                      </div>
                    </div>
                  )}
                  {activeFeedback.cultural_fit_rating && (
                    <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' }}>Cultural Fit</div>
                      <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a' }}>
                        {activeFeedback.cultural_fit_rating} <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>/ 5</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Qualitative Feedback */}
                {activeFeedback.strengths && (
                  <div style={{ marginBottom: '1rem' }}>
                    <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '0.9rem', fontWeight: 600, color: '#166534' }}>
                      Strengths
                    </h4>
                    <div style={{ fontSize: '0.85rem', color: '#334155', background: '#f0fdf4', padding: '0.75rem', borderRadius: '6px', border: '1px solid #bbf7d0', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                      {activeFeedback.strengths}
                    </div>
                  </div>
                )}

                {activeFeedback.weaknesses && (
                  <div style={{ marginBottom: '1rem' }}>
                    <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '0.9rem', fontWeight: 600, color: '#991b1b' }}>
                      Areas for Improvement
                    </h4>
                    <div style={{ fontSize: '0.85rem', color: '#334155', background: '#fef2f2', padding: '0.75rem', borderRadius: '6px', border: '1px solid #fecaca', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                      {activeFeedback.weaknesses}
                    </div>
                  </div>
                )}

                {activeFeedback.comments && (
                  <div style={{ marginBottom: '1rem' }}>
                    <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '0.9rem', fontWeight: 600, color: '#334155' }}>
                      Additional Feedback & Notes
                    </h4>
                    <div style={{ fontSize: '0.85rem', color: '#334155', background: '#f8fafc', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                      {activeFeedback.comments}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '6px', fontSize: '0.8rem', color: '#64748b', marginTop: '1rem' }}>
                  <div>
                    Interviewer: <strong>{activeFeedback.interviewer ? `${activeFeedback.interviewer.first_name} ${activeFeedback.interviewer.last_name}` : activeFeedbackInterview.interviewer?.first_name}</strong> ({activeFeedback.interviewer?.employee_code || activeFeedbackInterview.interviewer?.employee_code})
                  </div>
                  <div>
                    Submitted: <strong>{activeFeedback.submitted_at ? new Date(activeFeedback.submitted_at).toLocaleString() : '—'}</strong>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                No feedback record found for this interview.
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '1rem', marginTop: '1.25rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {canEditFeedback(activeFeedbackInterview) && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => handleOpenEditFeedback(activeFeedbackInterview)}
                  >
                    Edit Feedback
                  </button>
                )}
                {canDeleteFeedback(activeFeedbackInterview) && (
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDeleteFeedback(activeFeedbackInterview)}
                  >
                    Delete Feedback
                  </button>
                )}
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsFeedbackViewModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submit / Edit Feedback Form Modal */}
      {isFeedbackModalOpen && activeFeedbackInterview && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="modal-container card" style={{ maxWidth: '650px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem', background: '#fff', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700 }}>
                  {activeFeedback ? 'Edit Interview Feedback' : 'Submit Interview Feedback'}
                </h2>
                <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.2rem' }}>
                  Round {activeFeedbackInterview.interview_round}: {activeFeedbackInterview.interview_type} • {activeFeedbackInterview.candidate?.full_name} ({activeFeedbackInterview.candidate?.candidate_code})
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFeedbackModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveFeedback}>
              {/* Interview context summary card */}
              <div style={{ background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '1.25rem', fontSize: '0.85rem', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                <div>
                  <span style={{ color: '#64748b' }}>Candidate:</span> <strong>{activeFeedbackInterview.candidate?.full_name}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Job:</span> <strong>{activeFeedbackInterview.job_opening?.title}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Interviewer:</span> <strong>{activeFeedbackInterview.interviewer?.first_name} {activeFeedbackInterview.interviewer?.last_name}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Scheduled:</span> {new Date(activeFeedbackInterview.scheduled_at).toLocaleDateString()}
                </div>
              </div>

              {/* Core Evaluation: Recommendation & Overall Rating */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Recommendation <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <CustomSelect
                    name="recommendation"
                    id="feedback-recommendation"
                    required
                    value={feedbackFormData.recommendation}
                    onChange={handleFeedbackFormChange}
                    className="form-control"
                    style={{ width: '100%', padding: '0.5rem' }}
                  >
                    {RECOMMENDATIONS.map(rec => (
                      <option key={rec} value={rec}>{rec}</option>
                    ))}
                  </CustomSelect>
                  {feedbackFormErrors.recommendation && (
                    <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                      {feedbackFormErrors.recommendation}
                    </div>
                  )}
                </div>

                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Overall Rating (1 to 5) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <CustomSelect
                    name="overall_rating"
                    id="feedback-overall-rating"
                    required
                    value={feedbackFormData.overall_rating}
                    onChange={handleFeedbackFormChange}
                    className="form-control"
                    style={{ width: '100%', padding: '0.5rem' }}
                  >
                    <option value="5">5 — Exceptional</option>
                    <option value="4">4 — Exceeds Expectations</option>
                    <option value="3">3 — Meets Requirements</option>
                    <option value="2">2 — Below Expectations</option>
                    <option value="1">1 — Unsatisfactory</option>
                  </CustomSelect>
                  {feedbackFormErrors.overall_rating && (
                    <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                      {feedbackFormErrors.overall_rating}
                    </div>
                  )}
                </div>
              </div>

              {/* Detailed Category Ratings (Optional) */}
              <div style={{ marginBottom: '1.25rem', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '1rem', background: '#fafafa' }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.75rem', color: '#0f172a' }}>
                  Dimension Ratings (Optional, 1–5 Scale)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.2rem' }}>
                      Technical Competency
                    </label>
                    <CustomSelect
                      name="technical_rating"
                      id="feedback-technical-rating"
                      value={feedbackFormData.technical_rating}
                      onChange={handleFeedbackFormChange}
                      className="form-control"
                      style={{ width: '100%', padding: '0.4rem' }}
                    >
                      <option value="">Not evaluated</option>
                      <option value="5">5 — Expert</option>
                      <option value="4">4 — Advanced</option>
                      <option value="3">3 — Competent</option>
                      <option value="2">2 — Developing</option>
                      <option value="1">1 — Insufficient</option>
                    </CustomSelect>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.2rem' }}>
                      Communication Skills
                    </label>
                    <CustomSelect
                      name="communication_rating"
                      id="feedback-communication-rating"
                      value={feedbackFormData.communication_rating}
                      onChange={handleFeedbackFormChange}
                      className="form-control"
                      style={{ width: '100%', padding: '0.4rem' }}
                    >
                      <option value="">Not evaluated</option>
                      <option value="5">5 — Excellent</option>
                      <option value="4">4 — Clear & Articulate</option>
                      <option value="3">3 — Adequate</option>
                      <option value="2">2 — Needs Polish</option>
                      <option value="1">1 — Ineffective</option>
                    </CustomSelect>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.2rem' }}>
                      Problem Solving / Analytical
                    </label>
                    <CustomSelect
                      name="problem_solving_rating"
                      id="feedback-problem-solving-rating"
                      value={feedbackFormData.problem_solving_rating}
                      onChange={handleFeedbackFormChange}
                      className="form-control"
                      style={{ width: '100%', padding: '0.4rem' }}
                    >
                      <option value="">Not evaluated</option>
                      <option value="5">5 — Innovative & Sharp</option>
                      <option value="4">4 — Structured & Sound</option>
                      <option value="3">3 — Standard Approach</option>
                      <option value="2">2 — Struggled</option>
                      <option value="1">1 — Unable to solve</option>
                    </CustomSelect>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.2rem' }}>
                      Cultural & Team Fit
                    </label>
                    <CustomSelect
                      name="cultural_fit_rating"
                      id="feedback-cultural-fit-rating"
                      value={feedbackFormData.cultural_fit_rating}
                      onChange={handleFeedbackFormChange}
                      className="form-control"
                      style={{ width: '100%', padding: '0.4rem' }}
                    >
                      <option value="">Not evaluated</option>
                      <option value="5">5 — Outstanding Match</option>
                      <option value="4">4 — Positive Alignment</option>
                      <option value="3">3 — Neutral / Acceptable</option>
                      <option value="2">2 — Slight Concerns</option>
                      <option value="1">1 — Cultural Mismatch</option>
                    </CustomSelect>
                  </div>
                </div>
              </div>

              {/* Strengths */}
              <div style={{ marginBottom: '1rem' }}>
                <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Key Strengths
                </label>
                <textarea
                  name="strengths"
                  id="feedback-strengths"
                  rows="3"
                  value={feedbackFormData.strengths}
                  onChange={handleFeedbackFormChange}
                  className="form-control"
                  placeholder="Specific achievements, solid answers, technical mastery observed..."
                  style={{ width: '100%', padding: '0.5rem' }}
                />
                {feedbackFormErrors.strengths && (
                  <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    {feedbackFormErrors.strengths}
                  </div>
                )}
              </div>

              {/* Weaknesses */}
              <div style={{ marginBottom: '1rem' }}>
                <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Areas for Improvement / Concerns
                </label>
                <textarea
                  name="weaknesses"
                  id="feedback-weaknesses"
                  rows="3"
                  value={feedbackFormData.weaknesses}
                  onChange={handleFeedbackFormChange}
                  className="form-control"
                  placeholder="Knowledge gaps, hesitation, areas requiring training or further evaluation..."
                  style={{ width: '100%', padding: '0.5rem' }}
                />
                {feedbackFormErrors.weaknesses && (
                  <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    {feedbackFormErrors.weaknesses}
                  </div>
                )}
              </div>

              {/* Comments */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Summary Comments & Final Recommendation Justification
                </label>
                <textarea
                  name="comments"
                  id="feedback-comments"
                  rows="3"
                  value={feedbackFormData.comments}
                  onChange={handleFeedbackFormChange}
                  className="form-control"
                  placeholder="Overall impression and rationale behind hire/no-hire decision..."
                  style={{ width: '100%', padding: '0.5rem' }}
                />
                {feedbackFormErrors.comments && (
                  <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    {feedbackFormErrors.comments}
                  </div>
                )}
              </div>

              {/* Modal Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsFeedbackModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="btn-save-feedback"
                  className="btn btn-primary"
                  disabled={feedbackSubmitting}
                >
                  {feedbackSubmitting ? 'Saving...' : activeFeedback ? 'Update Feedback' : 'Submit Feedback'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Interviews;
