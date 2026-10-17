import React, { useState, useEffect, useCallback } from 'react';
import candidateService from '../../services/candidateService';
import jobOpeningService from '../../services/jobOpeningService';
import { aiService } from '../../services/aiService';
import { useAuthContext } from '../../context/AuthContext';
import CustomSelect from '../../components/common/CustomSelect';

const STATUS_LIST = ['New', 'Screening', 'Shortlisted', 'Rejected', 'Hired'];
const SOURCE_LIST = ['LinkedIn', 'Referral', 'Job Portal', 'Career Page', 'Agency', 'Other'];
const GENDER_LIST = ['Male', 'Female', 'Other'];

const ALLOWED_STATUS_TRANSITIONS = {
  New: ['Screening'],
  Screening: ['Shortlisted', 'Rejected', 'New'],
  Shortlisted: ['Hired', 'Rejected', 'Screening'],
  Rejected: ['Screening'],
  Hired: [],
};

const initialFormData = {
  first_name: '',
  last_name: '',
  candidate_code: '',
  email: '',
  phone: '',
  alternate_phone: '',
  date_of_birth: '',
  gender: '',
  current_location: '',
  address: '',
  highest_qualification: '',
  total_experience_years: 0,
  current_company: '',
  current_designation: '',
  expected_salary: '',
  notice_period_days: '',
  source: 'LinkedIn',
  job_opening_id: '',
  status: 'New',
  notes: '',
};

const Candidates = () => {
  const { user } = useAuthContext();

  const [candidates, setCandidates] = useState([]);
  const [jobOpenings, setJobOpenings] = useState([]);
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
  const [jobFilter, setJobFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');

  // Modals
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState(null);
  const [viewingCandidate, setViewingCandidate] = useState(null);
  const [formData, setFormData] = useState(initialFormData);
  const [formErrors, setFormErrors] = useState({});

  // Resume State
  const [isResumeModalOpen, setIsResumeModalOpen] = useState(false);
  const [resumeCandidate, setResumeCandidate] = useState(null);
  const [resumeFile, setResumeFile] = useState(null);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [resumeModalError, setResumeModalError] = useState('');
  const [resumeModalSuccess, setResumeModalSuccess] = useState('');
  const [extractedData, setExtractedData] = useState(null);
  const [selectedFieldsToApply, setSelectedFieldsToApply] = useState({});
  const [applyingFields, setApplyingFields] = useState(false);
  // AI Screening State
  const [isScreeningModalOpen, setIsScreeningModalOpen] = useState(false);
  const [screeningProgress, setScreeningProgress] = useState(0);
  const [screeningStage, setScreeningStage] = useState('');
  const [screeningError, setScreeningError] = useState('');
  const [isScreening, setIsScreening] = useState(false);
  const [screeningCandidate, setScreeningCandidate] = useState(null);

  const handleAIScreen = async (candidate) => {
    if (isScreening) return;
    setScreeningCandidate(candidate);
    setIsScreening(true);
    setIsScreeningModalOpen(true);
    setScreeningProgress(0);
    setScreeningStage('Preparing resume...');
    setScreeningError('');

    let currentProgress = 0;
    const progressInterval = setInterval(() => {
      currentProgress += Math.floor(Math.random() * 5) + 3; // increment by 3-7%
      if (currentProgress > 95) currentProgress = 95;

      setScreeningProgress(currentProgress);

      if (currentProgress < 15) setScreeningStage('Preparing resume...');
      else if (currentProgress < 35) setScreeningStage('Extracting resume content...');
      else if (currentProgress < 55) setScreeningStage('Analyzing candidate information...');
      else if (currentProgress < 75) setScreeningStage('Evaluating skills and experience...');
      else if (currentProgress < 90) setScreeningStage('Generating AI screening assessment...');
      else setScreeningStage('Finalizing screening result...');
    }, 1000);

    try {
      const res = await aiService.screenResume(candidate.id);
      clearInterval(progressInterval);
      setScreeningProgress(100);
      setScreeningStage('AI Screening completed');

      setTimeout(() => {
        setIsScreening(false);
        setIsScreeningModalOpen(false);
        alert(`Resume Screened!\nMatch Score: ${res.score}%\nSkills: ${res.skills}\nSummary: ${res.summary}`);
        
        // Update local state directly so UI reflects immediately
        if (viewingCandidate && viewingCandidate.id === candidate.id) {
          setViewingCandidate(prev => ({ ...prev, ai_match_score: res.score, ai_extracted_skills: res.skills, ai_extracted_experience: res.summary }));
        }
        if (resumeCandidate && resumeCandidate.id === candidate.id) {
          setResumeCandidate(prev => ({ ...prev, ai_match_score: res.score, ai_extracted_skills: res.skills, ai_extracted_experience: res.summary }));
        }
        
        fetchCandidates(pagination.currentPage);
        setIsResumeModalOpen(false);
      }, 700);
    } catch (e) {
      clearInterval(progressInterval);
      setScreeningError(e.response?.data?.error || 'Failed to screen resume via AI');
      setIsScreening(false);
    }
  };

  // Status Pipeline State
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [statusCandidate, setStatusCandidate] = useState(null);
  const [newStatus, setNewStatus] = useState('');
  const [statusRemarks, setStatusRemarks] = useState('');
  const [hiredConfirmed, setHiredConfirmed] = useState(false);
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const [statusModalError, setStatusModalError] = useState('');
  const [statusModalSuccess, setStatusModalSuccess] = useState('');

  // Status History Timeline State
  const [statusHistoryList, setStatusHistoryList] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState('');

  // RBAC checks
  const canCreate = user?.roles?.some(r => ['Super Admin', 'HR Admin', 'HR Executive'].includes(r)) ||
                    user?.permissions?.includes('recruitment.candidates.create');
  const canUpdate = user?.roles?.some(r => ['Super Admin', 'HR Admin', 'HR Executive'].includes(r)) ||
                    user?.permissions?.includes('recruitment.candidates.update');
  const canDelete = user?.roles?.some(r => ['Super Admin', 'HR Admin'].includes(r)) ||
                    user?.permissions?.includes('recruitment.candidates.delete');

  // Load Job Openings for dropdown
  useEffect(() => {
    const loadJobs = async () => {
      try {
        const res = await jobOpeningService.getJobOpenings({ per_page: 100 });
        setJobOpenings(res.data || []);
      } catch (err) {
        console.error('Error fetching job openings for dropdown', err);
      }
    };
    loadJobs();
  }, []);

  // Fetch Candidates List
  const fetchCandidates = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = {
        page,
        per_page: pagination.perPage,
      };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (jobFilter) params.job_opening_id = jobFilter;
      if (sourceFilter) params.source = sourceFilter;

      const res = await candidateService.getCandidates(params);
      const dataList = res.data || [];
      setCandidates(dataList);
      setPagination({
        currentPage: res.current_page || 1,
        lastPage: res.last_page || 1,
        total: res.total || dataList.length,
        perPage: res.per_page || 10,
      });
    } catch (err) {
      if (err.response?.status === 403) {
        setError('Access denied. You do not have permission to view Candidates.');
      } else {
        setError(err.response?.data?.message || 'Failed to load candidates.');
      }
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, jobFilter, sourceFilter, pagination.perPage]);

  useEffect(() => {
    fetchCandidates(1);
  }, [fetchCandidates]);

  // Reset Filters
  const handleResetFilters = () => {
    setSearch('');
    setStatusFilter('');
    setJobFilter('');
    setSourceFilter('');
  };

  // Open Create / Edit Modal
  const handleOpenForm = (candidate = null) => {
    setFormErrors({});
    setError('');
    setSuccessMessage('');
    if (candidate) {
      setEditingCandidate(candidate);
      setFormData({
        first_name: candidate.first_name || '',
        last_name: candidate.last_name || '',
        candidate_code: candidate.candidate_code || '',
        email: candidate.email || '',
        phone: candidate.phone || '',
        alternate_phone: candidate.alternate_phone || '',
        date_of_birth: candidate.date_of_birth ? candidate.date_of_birth.substring(0, 10) : '',
        gender: candidate.gender || '',
        current_location: candidate.current_location || '',
        address: candidate.address || '',
        highest_qualification: candidate.highest_qualification || '',
        total_experience_years: candidate.total_experience_years ?? 0,
        current_company: candidate.current_company || '',
        current_designation: candidate.current_designation || '',
        expected_salary: candidate.expected_salary ?? '',
        notice_period_days: candidate.notice_period_days ?? '',
        source: candidate.source || 'LinkedIn',
        job_opening_id: candidate.job_opening_id || '',
        status: candidate.status || 'New',
        notes: candidate.notes || '',
      });
    } else {
      setEditingCandidate(null);
      setFormData({
        ...initialFormData,
        job_opening_id: jobOpenings.length > 0 ? jobOpenings[0].id : '',
      });
    }
    setIsFormModalOpen(true);
  };

  // Fetch Candidate Status History Timeline
  const fetchStatusHistory = async (candidateId) => {
    setLoadingHistory(true);
    setHistoryError('');
    try {
      const res = await candidateService.getCandidateStatusHistory(candidateId);
      setStatusHistoryList(res.data || []);
    } catch (err) {
      setHistoryError(err.response?.data?.message || 'Failed to load status history.');
    } finally {
      setLoadingHistory(false);
    }
  };

  // Open Detail Modal
  const handleOpenDetail = (candidate) => {
    setViewingCandidate(candidate);
    setIsDetailModalOpen(true);
    fetchStatusHistory(candidate.id);
  };

  // Open Status Modal
  const handleOpenStatusModal = (candidate) => {
    setStatusCandidate(candidate);
    const allowed = ALLOWED_STATUS_TRANSITIONS[candidate.status] || [];
    setNewStatus(allowed.length > 0 ? allowed[0] : '');
    setStatusRemarks('');
    setHiredConfirmed(false);
    setStatusModalError('');
    setStatusModalSuccess('');
    setIsStatusModalOpen(true);
  };

  // Handle Candidate Status Transition Submit
  const handleStatusSubmit = async (e) => {
    e.preventDefault();
    if (!statusCandidate || !newStatus) return;

    if (newStatus === 'Rejected' && !statusRemarks.trim()) {
      setStatusModalError('Remarks / reason are required when rejecting a candidate.');
      return;
    }

    if (newStatus === 'Hired' && !hiredConfirmed) {
      setStatusModalError('Please verify and check the hiring prerequisites confirmation box.');
      return;
    }

    setStatusSubmitting(true);
    setStatusModalError('');
    setStatusModalSuccess('');

    try {
      const res = await candidateService.updateCandidateStatus(statusCandidate.id, {
        status: newStatus,
        remarks: statusRemarks.trim() || undefined,
      });

      const updated = res.data;
      setStatusModalSuccess(res.message || `Status updated to ${newStatus} successfully.`);
      setSuccessMessage(`Candidate status updated to ${newStatus} successfully.`);
      setCandidates(prev => prev.map(c => c.id === updated.id ? updated : c));

      if (viewingCandidate && viewingCandidate.id === updated.id) {
        setViewingCandidate(updated);
        fetchStatusHistory(updated.id);
      }

      setTimeout(() => {
        setIsStatusModalOpen(false);
        setStatusSubmitting(false);
        setStatusCandidate(null);
      }, 700);
    } catch (err) {
      setStatusSubmitting(false);
      setStatusModalError(err.response?.data?.message || 'Failed to update candidate status.');
    }
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

  // Save Candidate
  const handleSave = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormErrors({});
    setError('');
    setSuccessMessage('');

    // Quick client-side checks
    const errors = {};
    if (!formData.first_name.trim()) errors.first_name = 'First name is required';
    if (!formData.last_name.trim()) errors.last_name = 'Last name is required';
    if (!formData.email.trim()) errors.email = 'Email is required';
    if (!formData.phone.trim()) errors.phone = 'Phone number is required';
    if (!formData.job_opening_id) errors.job_opening_id = 'Job opening is required';
    if (formData.total_experience_years !== '' && Number(formData.total_experience_years) < 0) {
      errors.total_experience_years = 'Experience cannot be negative';
    }
    if (formData.expected_salary !== '' && Number(formData.expected_salary) < 0) {
      errors.expected_salary = 'Expected salary cannot be negative';
    }
    if (formData.notice_period_days !== '' && Number(formData.notice_period_days) < 0) {
      errors.notice_period_days = 'Notice period cannot be negative';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      setSubmitting(false);
      return;
    }

    try {
      const payload = {
        ...formData,
        job_opening_id: Number(formData.job_opening_id),
        total_experience_years: formData.total_experience_years !== '' ? Number(formData.total_experience_years) : 0,
        expected_salary: formData.expected_salary !== '' ? Number(formData.expected_salary) : null,
        notice_period_days: formData.notice_period_days !== '' ? Number(formData.notice_period_days) : null,
        gender: formData.gender || null,
        date_of_birth: formData.date_of_birth || null,
      };
      if (!payload.candidate_code) {
        delete payload.candidate_code;
      }

      if (editingCandidate) {
        await candidateService.updateCandidate(editingCandidate.id, payload);
        setSuccessMessage('Candidate updated successfully.');
      } else {
        await candidateService.createCandidate(payload);
        setSuccessMessage('Candidate created successfully.');
      }

      setIsFormModalOpen(false);
      fetchCandidates(pagination.currentPage);
    } catch (err) {
      if (err.response?.status === 422 && err.response?.data?.errors) {
        setFormErrors(err.response.data.errors);
      } else {
        setError(err.response?.data?.message || 'Failed to save candidate.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Candidate
  const handleDelete = async (candidate) => {
    if (!window.confirm(`Are you sure you want to delete candidate "${candidate.full_name || candidate.first_name}" (${candidate.candidate_code})?`)) {
      return;
    }
    setError('');
    setSuccessMessage('');
    try {
      await candidateService.deleteCandidate(candidate.id);
      setSuccessMessage('Candidate deleted successfully.');
      fetchCandidates(pagination.currentPage);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete candidate.');
    }
  };

  // Format File Size helper
  const formatFileSize = (bytes) => {
    if (!bytes || isNaN(bytes)) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Resume Modal Handlers
  const handleOpenResumeModal = (candidate) => {
    setResumeCandidate(candidate);
    setResumeFile(null);
    setResumeModalError('');
    setResumeModalSuccess('');
    setExtractedData(null);
    setSelectedFieldsToApply({});
    setIsResumeModalOpen(true);
  };

  const handleResumeFileChange = (e) => {
    const file = e.target.files[0];
    setResumeFile(file || null);
    setResumeModalError('');
    setResumeModalSuccess('');
    setExtractedData(null);
    setSelectedFieldsToApply({});
  };

  const handleUploadResumeSubmit = async (e) => {
    e.preventDefault();
    if (!resumeFile) {
      setResumeModalError('Please select a resume file (PDF, DOC, or DOCX).');
      return;
    }
    if (resumeFile.size > 10 * 1024 * 1024) {
      setResumeModalError('The resume file exceeds the maximum allowed size of 10 MB.');
      return;
    }

    setUploadingResume(true);
    setResumeModalError('');
    setResumeModalSuccess('');

    try {
      const formDataUpload = new FormData();
      formDataUpload.append('resume', resumeFile);

      const res = await candidateService.uploadResume(resumeCandidate.id, formDataUpload);
      setResumeModalSuccess(res.message || 'Resume uploaded successfully.');

      const updatedCand = res.data;
      setResumeCandidate(updatedCand);
      setCandidates(prev => prev.map(c => c.id === updatedCand.id ? updatedCand : c));
      if (viewingCandidate && viewingCandidate.id === updatedCand.id) {
        setViewingCandidate(updatedCand);
      }

      // Check extracted fields
      if (res.extraction && res.extraction.status === 'completed' && res.extraction.fields) {
        const fields = res.extraction.fields;
        const keys = Object.keys(fields);
        if (keys.length > 0) {
          setExtractedData(res.extraction);
          const initialSelection = {};
          keys.forEach(k => { initialSelection[k] = true; });
          setSelectedFieldsToApply(initialSelection);
        } else {
          setExtractedData({ status: 'unavailable', fields: {} });
        }
      } else {
        setExtractedData({ status: 'unavailable', fields: {} });
      }

      setResumeFile(null);
    } catch (err) {
      setResumeModalError(err.response?.data?.message || err.response?.data?.errors?.resume?.[0] || 'Failed to upload resume.');
    } finally {
      setUploadingResume(false);
    }
  };

  const handleApplyExtractedFields = async () => {
    if (!extractedData?.fields || !resumeCandidate) return;
    setApplyingFields(true);
    setResumeModalError('');

    try {
      const updatePayload = {};
      Object.keys(selectedFieldsToApply).forEach(k => {
        if (selectedFieldsToApply[k] && extractedData.fields[k] !== undefined) {
          updatePayload[k] = extractedData.fields[k];
        }
      });

      if (Object.keys(updatePayload).length === 0) {
        setResumeModalError('No fields selected to apply.');
        setApplyingFields(false);
        return;
      }

      const res = await candidateService.updateCandidate(resumeCandidate.id, updatePayload);
      const updatedCand = res.data;
      setResumeCandidate(updatedCand);
      setCandidates(prev => prev.map(c => c.id === updatedCand.id ? updatedCand : c));
      if (viewingCandidate && viewingCandidate.id === updatedCand.id) {
        setViewingCandidate(updatedCand);
      }
      setResumeModalSuccess('Selected suggestions applied to candidate profile successfully!');
      setExtractedData(null);
    } catch (err) {
      setResumeModalError(err.response?.data?.message || 'Failed to apply extracted fields.');
    } finally {
      setApplyingFields(false);
    }
  };

  const handleDownloadResume = async (candidate) => {
    try {
      const res = await candidateService.downloadResume(candidate.id);
      const blob = new Blob([res.data], {
        type: candidate.resume?.mime_type || 'application/octet-stream',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.setAttribute('download', candidate.resume?.original_name || `resume-${candidate.candidate_code}.pdf`);
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to download resume.');
    }
  };

  const handleDeleteResume = async (candidate) => {
    if (!window.confirm(`Are you sure you want to delete the resume for "${candidate.full_name || candidate.first_name}"?`)) {
      return;
    }
    try {
      const res = await candidateService.deleteResume(candidate.id);
      const updatedCand = res.data;
      setResumeCandidate(updatedCand);
      setCandidates(prev => prev.map(c => c.id === updatedCand.id ? updatedCand : c));
      if (viewingCandidate && viewingCandidate.id === updatedCand.id) {
        setViewingCandidate(updatedCand);
      }
      setSuccessMessage('Resume deleted successfully.');
      setIsResumeModalOpen(false);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete resume.');
    }
  };

  // Helper badge color
  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'New':
        return 'badge-secondary';
      case 'Screening':
        return 'badge-pending';
      case 'Shortlisted':
        return 'badge-primary';
      case 'Hired':
        return 'badge-active';
      case 'Rejected':
        return 'badge-rejected';
      default:
        return 'badge-inactive';
    }
  };

  // Stats calculation
  const totalCount = pagination.total;
  const screeningCount = candidates.filter(c => c.status === 'Screening').length;
  const shortlistedCount = candidates.filter(c => c.status === 'Shortlisted').length;
  const hiredCount = candidates.filter(c => c.status === 'Hired').length;
  const rejectedCount = candidates.filter(c => c.status === 'Rejected').length;

  return (
    <div className="page-container" id="candidates-page">
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title" style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700 }}>Candidates</h1>
          <p style={{ margin: '0.25rem 0 0 0', color: 'var(--color-text-secondary, #64748b)' }}>
            Track applicant profiles, screening statuses, and job assignments
          </p>
        </div>
        {canCreate && (
          <button
            id="btn-add-candidate"
            className="btn btn-primary"
            onClick={() => handleOpenForm()}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <span>+ Add Candidate</span>
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
          <div style={{ fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Candidates</div>
          <div style={{ fontSize: '1.85rem', fontWeight: 700, marginTop: '0.25rem', color: '#0f172a' }}>{totalCount}</div>
        </div>
        <div className="card" style={{ padding: '1.25rem', borderRadius: '8px', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Page Screening</div>
          <div style={{ fontSize: '1.85rem', fontWeight: 700, marginTop: '0.25rem', color: '#f59e0b' }}>{screeningCount}</div>
        </div>
        <div className="card" style={{ padding: '1.25rem', borderRadius: '8px', borderLeft: '4px solid #8b5cf6' }}>
          <div style={{ fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Page Shortlisted</div>
          <div style={{ fontSize: '1.85rem', fontWeight: 700, marginTop: '0.25rem', color: '#8b5cf6' }}>{shortlistedCount}</div>
        </div>
        <div className="card" style={{ padding: '1.25rem', borderRadius: '8px', borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Page Hired</div>
          <div style={{ fontSize: '1.85rem', fontWeight: 700, marginTop: '0.25rem', color: '#10b981' }}>{hiredCount}</div>
        </div>
        <div className="card" style={{ padding: '1.25rem', borderRadius: '8px', borderLeft: '4px solid #ef4444' }}>
          <div style={{ fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Page Rejected</div>
          <div style={{ fontSize: '1.85rem', fontWeight: 700, marginTop: '0.25rem', color: '#ef4444' }}>{rejectedCount}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', alignItems: 'center' }}>
          <div>
            <input
              id="candidate-search-input"
              type="text"
              placeholder="Search name, code, email, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-control"
              style={{ width: '100%', padding: '0.5rem 0.75rem' }}
            />
          </div>
          <div>
            <CustomSelect
              id="candidate-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="form-control"
              style={{ width: '100%', padding: '0.5rem 0.75rem' }}
            >
              <option value="">All Statuses</option>
              {STATUS_LIST.map(st => (
                <option key={st} value={st}>{st}</option>
              ))}
            </CustomSelect>
          </div>
          <div>
            <CustomSelect
              id="candidate-job-filter"
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
              id="candidate-source-filter"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="form-control"
              style={{ width: '100%', padding: '0.5rem 0.75rem' }}
            >
              <option value="">All Sources</option>
              {SOURCE_LIST.map(src => (
                <option key={src} value={src}>{src}</option>
              ))}
            </CustomSelect>
          </div>
          <div>
            <button
              id="btn-reset-candidate-filters"
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
          <table className="data-table" id="candidates-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Code</th>
                <th style={{ padding: '0.75rem 1rem' }}>Candidate</th>
                <th style={{ padding: '0.75rem 1rem' }}>Contact</th>
                <th style={{ padding: '0.75rem 1rem' }}>Applied Position</th>
                <th style={{ padding: '0.75rem 1rem' }}>Exp (Yrs)</th>
                <th style={{ padding: '0.75rem 1rem' }}>Expected Salary</th>
                <th style={{ padding: '0.75rem 1rem' }}>Source</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Resume</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="10" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                    Loading candidates...
                  </td>
                </tr>
              ) : candidates.length === 0 ? (
                <tr>
                  <td colSpan="10" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                    No candidates found matching your criteria.
                  </td>
                </tr>
              ) : (
                candidates.map((candidate) => (
                  <tr key={candidate.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#334155' }}>
                      {candidate.candidate_code}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{candidate.full_name}</div>
                      {candidate.current_designation && (
                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{candidate.current_designation}</div>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#475569', fontSize: '0.85rem' }}>
                      <div>{candidate.email}</div>
                      <div style={{ color: '#64748b' }}>{candidate.phone}</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#475569' }}>
                      <div style={{ fontWeight: 500 }}>{candidate.job_opening?.title || '—'}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{candidate.job_opening?.job_code}</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#475569' }}>
                      {candidate.total_experience_years ?? 0} yrs
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#475569' }}>
                      {candidate.expected_salary ? `₹${Number(candidate.expected_salary).toLocaleString()}` : '—'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#475569' }}>
                      {candidate.source || '—'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                        <span className={`badge ${getStatusBadgeClass(candidate.status)}`}>
                          {candidate.status}
                        </span>
                        {canUpdate && candidate.status !== 'Hired' && (
                          <button
                            type="button"
                            onClick={() => handleOpenStatusModal(candidate)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#2563eb',
                              fontSize: '0.72rem',
                              cursor: 'pointer',
                              textDecoration: 'underline',
                              padding: 0,
                            }}
                            title="Change Pipeline Status"
                          >
                            Change Status
                          </button>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      {candidate.resume?.exists ? (
                        <button
                          type="button"
                          className="badge badge-primary"
                          onClick={() => handleDownloadResume(candidate)}
                          title={`Download ${candidate.resume.original_name || 'Resume'}`}
                          style={{ cursor: 'pointer', border: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.25rem 0.5rem' }}
                        >
                          <span>📄</span>
                          <span>{candidate.resume.original_name ? candidate.resume.original_name.split('.').pop().toUpperCase() : 'PDF'}</span>
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>None</span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleOpenDetail(candidate)}
                          title="View Details"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        >
                          View
                        </button>
                        {canUpdate && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleOpenStatusModal(candidate)}
                            title={candidate.status === 'Hired' ? 'Candidate Hired (Terminal)' : 'Change Pipeline Status'}
                            disabled={candidate.status === 'Hired'}
                            style={{
                              padding: '0.25rem 0.5rem',
                              fontSize: '0.75rem',
                              background: candidate.status === 'Hired' ? '#f1f5f9' : '#fef3c7',
                              color: candidate.status === 'Hired' ? '#94a3b8' : '#92400e',
                              borderColor: candidate.status === 'Hired' ? '#e2e8f0' : '#fde68a',
                            }}
                          >
                            {candidate.status === 'Hired' ? 'Hired' : 'Status'}
                          </button>
                        )}
                        {canUpdate && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleOpenResumeModal(candidate)}
                            title={candidate.resume?.exists ? "Manage / Replace Resume" : "Upload Resume"}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#e0f2fe', color: '#0369a1', borderColor: '#bae6fd' }}
                          >
                            Resume
                          </button>
                        )}
                        {canUpdate && (
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleOpenForm(candidate)}
                            title="Edit Candidate"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          >
                            Edit
                          </button>
                        )}
                        {canDelete && (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDelete(candidate)}
                            title="Delete Candidate"
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
              Showing {candidates.length} of {pagination.total} candidates
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn btn-secondary btn-sm"
                disabled={pagination.currentPage <= 1 || loading}
                onClick={() => fetchCandidates(pagination.currentPage - 1)}
              >
                Previous
              </button>
              <span style={{ display: 'flex', alignItems: 'center', padding: '0 0.5rem', fontSize: '0.85rem', fontWeight: 600 }}>
                {pagination.currentPage} / {pagination.lastPage}
              </span>
              <button
                className="btn btn-secondary btn-sm"
                disabled={pagination.currentPage >= pagination.lastPage || loading}
                onClick={() => fetchCandidates(pagination.currentPage + 1)}
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
                {editingCandidate ? 'Edit Candidate Profile' : 'Add New Candidate'}
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
                {/* First Name */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    First Name <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    name="first_name"
                    type="text"
                    required
                    value={formData.first_name}
                    onChange={handleFormChange}
                    className="form-control"
                    placeholder="e.g. Jane"
                    style={{ width: '100%', padding: '0.5rem' }}
                  />
                  {formErrors.first_name && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>{formErrors.first_name}</div>}
                </div>

                {/* Last Name */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Last Name <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    name="last_name"
                    type="text"
                    required
                    value={formData.last_name}
                    onChange={handleFormChange}
                    className="form-control"
                    placeholder="e.g. Doe"
                    style={{ width: '100%', padding: '0.5rem' }}
                  />
                  {formErrors.last_name && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>{formErrors.last_name}</div>}
                </div>

                {/* Candidate Code */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Candidate Code (Reference)
                  </label>
                  <input
                    name="candidate_code"
                    type="text"
                    value={formData.candidate_code}
                    onChange={handleFormChange}
                    className="form-control"
                    placeholder="Auto-generated if left blank"
                    style={{ width: '100%', padding: '0.5rem' }}
                  />
                  {formErrors.candidate_code && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>{formErrors.candidate_code}</div>}
                </div>

                {/* Email */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Email Address <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    name="email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={handleFormChange}
                    className="form-control"
                    placeholder="e.g. jane.doe@example.com"
                    style={{ width: '100%', padding: '0.5rem' }}
                  />
                  {formErrors.email && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>{formErrors.email}</div>}
                </div>

                {/* Phone */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Phone Number <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    name="phone"
                    type="text"
                    required
                    value={formData.phone}
                    onChange={handleFormChange}
                    className="form-control"
                    placeholder="e.g. +1 555-0199"
                    style={{ width: '100%', padding: '0.5rem' }}
                  />
                  {formErrors.phone && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>{formErrors.phone}</div>}
                </div>

                {/* Alternate Phone */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Alternate Phone
                  </label>
                  <input
                    name="alternate_phone"
                    type="text"
                    value={formData.alternate_phone}
                    onChange={handleFormChange}
                    className="form-control"
                    placeholder="e.g. +1 555-0200"
                    style={{ width: '100%', padding: '0.5rem' }}
                  />
                </div>

                {/* Job Opening */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Applied Job Opening <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <CustomSelect
                    name="job_opening_id"
                    required
                    value={formData.job_opening_id}
                    onChange={handleFormChange}
                    className="form-control"
                    style={{ width: '100%', padding: '0.5rem' }}
                  >
                    <option value="">Select Job Opening</option>
                    {jobOpenings.map(j => (
                      <option key={j.id} value={j.id}>{j.title} ({j.job_code})</option>
                    ))}
                  </CustomSelect>
                  {formErrors.job_opening_id && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>{formErrors.job_opening_id}</div>}
                </div>

                {/* Status */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Candidate Status <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <CustomSelect
                    name="status"
                    required
                    value={formData.status}
                    onChange={handleFormChange}
                    className="form-control"
                    style={{ width: '100%', padding: '0.5rem' }}
                  >
                    {STATUS_LIST.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </CustomSelect>
                  {formErrors.status && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>{formErrors.status}</div>}
                </div>

                {/* Experience (Years) */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Total Experience (Years)
                  </label>
                  <input
                    name="total_experience_years"
                    type="number"
                    step="0.1"
                    min="0"
                    value={formData.total_experience_years}
                    onChange={handleFormChange}
                    className="form-control"
                    style={{ width: '100%', padding: '0.5rem' }}
                  />
                  {formErrors.total_experience_years && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>{formErrors.total_experience_years}</div>}
                </div>

                {/* Expected Salary */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Expected Salary (₹)
                  </label>
                  <input
                    name="expected_salary"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.expected_salary}
                    onChange={handleFormChange}
                    className="form-control"
                    placeholder="e.g. 110000"
                    style={{ width: '100%', padding: '0.5rem' }}
                  />
                  {formErrors.expected_salary && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>{formErrors.expected_salary}</div>}
                </div>

                {/* Notice Period (Days) */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Notice Period (Days)
                  </label>
                  <input
                    name="notice_period_days"
                    type="number"
                    min="0"
                    value={formData.notice_period_days}
                    onChange={handleFormChange}
                    className="form-control"
                    placeholder="e.g. 30"
                    style={{ width: '100%', padding: '0.5rem' }}
                  />
                  {formErrors.notice_period_days && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>{formErrors.notice_period_days}</div>}
                </div>

                {/* Source */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Candidate Source
                  </label>
                  <CustomSelect
                    name="source"
                    value={formData.source}
                    onChange={handleFormChange}
                    className="form-control"
                    style={{ width: '100%', padding: '0.5rem' }}
                  >
                    {SOURCE_LIST.map(src => (
                      <option key={src} value={src}>{src}</option>
                    ))}
                  </CustomSelect>
                </div>

                {/* Current Company */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Current Company
                  </label>
                  <input
                    name="current_company"
                    type="text"
                    value={formData.current_company}
                    onChange={handleFormChange}
                    className="form-control"
                    placeholder="e.g. Tech Solutions Inc."
                    style={{ width: '100%', padding: '0.5rem' }}
                  />
                </div>

                {/* Current Designation */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Current Designation
                  </label>
                  <input
                    name="current_designation"
                    type="text"
                    value={formData.current_designation}
                    onChange={handleFormChange}
                    className="form-control"
                    placeholder="e.g. Software Engineer"
                    style={{ width: '100%', padding: '0.5rem' }}
                  />
                </div>

                {/* Current Location */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Current Location
                  </label>
                  <input
                    name="current_location"
                    type="text"
                    value={formData.current_location}
                    onChange={handleFormChange}
                    className="form-control"
                    placeholder="e.g. Austin, TX"
                    style={{ width: '100%', padding: '0.5rem' }}
                  />
                </div>

                {/* Highest Qualification */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Highest Qualification
                  </label>
                  <input
                    name="highest_qualification"
                    type="text"
                    value={formData.highest_qualification}
                    onChange={handleFormChange}
                    className="form-control"
                    placeholder="e.g. Master of Computer Science"
                    style={{ width: '100%', padding: '0.5rem' }}
                  />
                </div>

                {/* Gender */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Gender
                  </label>
                  <CustomSelect
                    name="gender"
                    value={formData.gender}
                    onChange={handleFormChange}
                    className="form-control"
                    style={{ width: '100%', padding: '0.5rem' }}
                  >
                    <option value="">Select Gender (Optional)</option>
                    {GENDER_LIST.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </CustomSelect>
                </div>

                {/* Date of Birth */}
                <div>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Date of Birth
                  </label>
                  <input
                    name="date_of_birth"
                    type="date"
                    value={formData.date_of_birth}
                    onChange={handleFormChange}
                    className="form-control"
                    style={{ width: '100%', padding: '0.5rem' }}
                  />
                </div>
              </div>

              {/* Address */}
              <div style={{ marginBottom: '1rem' }}>
                <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Address
                </label>
                <textarea
                  name="address"
                  rows="2"
                  value={formData.address}
                  onChange={handleFormChange}
                  className="form-control"
                  placeholder="Street, City, State, Postal code..."
                  style={{ width: '100%', padding: '0.5rem' }}
                />
              </div>

              {/* Notes */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Recruitment / Screening Notes
                </label>
                <textarea
                  name="notes"
                  rows="3"
                  value={formData.notes}
                  onChange={handleFormChange}
                  className="form-control"
                  placeholder="Initial screening notes, impressions, strengths, skill highlights..."
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
                  id="btn-save-candidate"
                  className="btn btn-primary"
                  disabled={submitting}
                >
                  {submitting ? 'Saving...' : editingCandidate ? 'Update Candidate' : 'Add Candidate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Candidate Details Modal */}
      {isDetailModalOpen && viewingCandidate && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="modal-container card" style={{ maxWidth: '650px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem', background: '#fff', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <span className={`badge ${getStatusBadgeClass(viewingCandidate.status)}`} style={{ marginBottom: '0.5rem', display: 'inline-block' }}>
                  {viewingCandidate.status}
                </span>
                <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>{viewingCandidate.full_name}</h2>
                <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.2rem' }}>
                  Code: <strong>{viewingCandidate.candidate_code}</strong> | Source: <strong>{viewingCandidate.source || 'Direct'}</strong>
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

            {/* Recruitment Pipeline Progress Stepper */}
            <div style={{ marginBottom: '1.25rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Pipeline Stage
                </span>
                {viewingCandidate.status === 'Rejected' && (
                  <span className="badge badge-rejected" style={{ fontSize: '0.75rem' }}>
                    ⛔ Rejected (Reconsideration allowed)
                  </span>
                )}
                {viewingCandidate.status === 'Hired' && (
                  <span className="badge badge-active" style={{ fontSize: '0.75rem' }}>
                    🎉 Hired (Terminal Stage)
                  </span>
                )}
              </div>

              {/* Steps */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
                {['New', 'Screening', 'Shortlisted', 'Hired'].map((stage, idx, arr) => {
                  const stageOrder = ['New', 'Screening', 'Shortlisted', 'Hired'];
                  const currentIndex = stageOrder.indexOf(viewingCandidate.status);
                  const isCurrent = viewingCandidate.status === stage;
                  const isPassed = currentIndex !== -1 && currentIndex > idx;

                  let circleBg = '#e2e8f0';
                  let circleColor = '#64748b';
                  let borderColor = '#cbd5e1';

                  if (isPassed) {
                    circleBg = '#10b981';
                    circleColor = '#ffffff';
                    borderColor = '#10b981';
                  } else if (isCurrent) {
                    circleBg = stage === 'Hired' ? '#10b981' : '#2563eb';
                    circleColor = '#ffffff';
                    borderColor = stage === 'Hired' ? '#059669' : '#1d4ed8';
                  }

                  return (
                    <React.Fragment key={stage}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2, flex: 1 }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: circleBg,
                            color: circleColor,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            border: `2px solid ${borderColor}`,
                            boxShadow: isCurrent ? '0 0 0 4px rgba(37, 99, 235, 0.2)' : 'none',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          {isPassed ? '✓' : idx + 1}
                        </div>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            marginTop: '0.35rem',
                            fontWeight: isCurrent ? 700 : 500,
                            color: isCurrent ? '#0f172a' : isPassed ? '#10b981' : '#64748b',
                            textAlign: 'center',
                          }}
                        >
                          {stage}
                        </span>
                      </div>
                      {idx < arr.length - 1 && (
                        <div
                          style={{
                            flex: 1,
                            height: '3px',
                            background: isPassed ? '#10b981' : '#e2e8f0',
                            marginTop: '-18px',
                            zIndex: 1,
                          }}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', background: '#f8fafc', padding: '1rem', borderRadius: '6px', marginBottom: '1.25rem' }}>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Applied Position:</span>
                <div style={{ fontWeight: 600 }}>{viewingCandidate.job_opening?.title || '—'}</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{viewingCandidate.job_opening?.job_code}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Department:</span>
                <div style={{ fontWeight: 600 }}>{viewingCandidate.job_opening?.department?.name || '—'}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Email Address:</span>
                <div style={{ fontWeight: 600 }}>{viewingCandidate.email}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Phone Number:</span>
                <div style={{ fontWeight: 600 }}>{viewingCandidate.phone}</div>
                {viewingCandidate.alternate_phone && (
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Alt: {viewingCandidate.alternate_phone}</div>
                )}
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Current Location:</span>
                <div style={{ fontWeight: 600 }}>{viewingCandidate.current_location || 'Not Specified'}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Experience:</span>
                <div style={{ fontWeight: 600 }}>{viewingCandidate.total_experience_years ?? 0} years</div>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Current Role:</span>
                <div style={{ fontWeight: 600 }}>
                  {viewingCandidate.current_designation ? `${viewingCandidate.current_designation} at ${viewingCandidate.current_company || 'Current Company'}` : 'Not Specified'}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Expected Salary:</span>
                <div style={{ fontWeight: 600 }}>
                  {viewingCandidate.expected_salary ? `₹${Number(viewingCandidate.expected_salary).toLocaleString()}` : 'Not Specified'}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Notice Period:</span>
                <div style={{ fontWeight: 600 }}>
                  {viewingCandidate.notice_period_days != null ? `${viewingCandidate.notice_period_days} days` : 'Not Specified'}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Highest Qualification:</span>
                <div style={{ fontWeight: 600 }}>{viewingCandidate.highest_qualification || 'Not Specified'}</div>
              </div>
            </div>

            {viewingCandidate.address && (
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem', fontWeight: 600 }}>Address</h4>
                <p style={{ margin: 0, color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {viewingCandidate.address}
                </p>
              </div>
            )}

            {/* AI Analysis Block */}
            <div style={{ marginBottom: '1rem', padding: '1rem', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#4c1d95', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>✨</span> AI Analysis
                </h4>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => handleAIScreen(viewingCandidate)}
                  disabled={isScreening}
                  style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem', backgroundColor: isScreening ? '#cbd5e1' : '#8b5cf6', borderColor: isScreening ? '#94a3b8' : '#7c3aed', color: 'white', cursor: isScreening ? 'not-allowed' : 'pointer', borderRadius: '4px', border: '1px solid' }}
                >
                  {viewingCandidate.ai_match_score !== null && viewingCandidate.ai_match_score !== undefined ? '↻ Re-Screen' : '✨ Screen Now'}
                </button>
              </div>

              {viewingCandidate.ai_match_score !== null && viewingCandidate.ai_match_score !== undefined ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
                    <div>
                      <span style={{ fontSize: '0.8rem', color: '#6d28d9' }}>Match Score</span>
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#5b21b6' }}>
                        {viewingCandidate.ai_match_score}%
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.8rem', color: '#6d28d9' }}>Extracted Skills</span>
                      <div style={{ fontWeight: 500, color: '#4c1d95', fontSize: '0.9rem' }}>
                        {viewingCandidate.ai_extracted_skills || 'None detected'}
                      </div>
                    </div>
                  </div>
                  {viewingCandidate.ai_extracted_experience && (
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #ddd6fe' }}>
                      <span style={{ fontSize: '0.8rem', color: '#6d28d9' }}>Experience Summary</span>
                      <p style={{ margin: 0, marginTop: '0.25rem', color: '#4c1d95', fontSize: '0.85rem', lineHeight: 1.4 }}>
                        {viewingCandidate.ai_extracted_experience}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ color: '#6d28d9', fontSize: '0.85rem', fontStyle: 'italic' }}>
                  Candidate has not been screened by AI yet.
                </div>
              )}
            </div>

            {viewingCandidate.notes && (
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem', fontWeight: 600 }}>Screening Notes</h4>
                <p style={{ margin: 0, color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {viewingCandidate.notes}
                </p>
              </div>
            )}

            {/* Resume Details Section */}
            <div style={{ marginBottom: '1.25rem', padding: '1rem', background: '#f0f9ff', borderRadius: '6px', border: '1px solid #bae6fd' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '0.95rem', fontWeight: 600, color: '#0369a1' }}>
                    Candidate Resume
                  </h4>
                  {viewingCandidate.resume?.exists ? (
                    <div style={{ fontSize: '0.85rem', color: '#334155' }}>
                      <strong>{viewingCandidate.resume.original_name}</strong>
                      <span style={{ color: '#64748b', marginLeft: '0.5rem' }}>
                        ({formatFileSize(viewingCandidate.resume.size)})
                      </span>
                      {viewingCandidate.resume.uploaded_at && (
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
                          Uploaded on {new Date(viewingCandidate.resume.uploaded_at).toLocaleString()}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                      No resume uploaded yet.
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {viewingCandidate.resume?.exists && (
                    <button
                      type="button"
                      id="btn-detail-download-resume"
                      className="btn btn-primary btn-sm"
                      onClick={() => handleDownloadResume(viewingCandidate)}
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                    >
                      Download
                    </button>
                  )}
                  {canUpdate && (
                    <button
                      type="button"
                      id="btn-detail-manage-resume"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        handleOpenResumeModal(viewingCandidate);
                      }}
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                    >
                      {viewingCandidate.resume?.exists ? 'Replace' : 'Upload'}
                    </button>
                  )}
                  {viewingCandidate.resume?.exists && canDelete && (
                    <button
                      type="button"
                      id="btn-detail-delete-resume"
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDeleteResume(viewingCandidate)}
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Status History & Audit Trail Section */}
            <div style={{ marginBottom: '1.25rem', padding: '1rem', background: '#fafafa', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#1e293b' }}>
                  Status History & Audit Trail
                </h4>
                {canUpdate && viewingCandidate.status !== 'Hired' && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleOpenStatusModal(viewingCandidate)}
                    style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem', background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}
                  >
                    Change Status
                  </button>
                )}
              </div>

              {loadingHistory ? (
                <div style={{ color: '#64748b', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>
                  Loading status history...
                </div>
              ) : historyError ? (
                <div style={{ color: '#ef4444', fontSize: '0.85rem', padding: '0.5rem' }}>
                  {historyError}
                </div>
              ) : statusHistoryList.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: '0.85rem', fontStyle: 'italic', padding: '0.5rem' }}>
                  No status history records found.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {statusHistoryList.map((hist, idx) => (
                    <div
                      key={hist.id || idx}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.75rem',
                        padding: '0.6rem 0.75rem',
                        background: '#fff',
                        borderRadius: '6px',
                        border: '1px solid #e2e8f0',
                        fontSize: '0.85rem',
                      }}
                    >
                      <div style={{ marginTop: '0.15rem' }}>
                        <span style={{ fontSize: '1rem' }}>
                          {hist.to_status === 'Hired' ? '🎉' : hist.to_status === 'Rejected' ? '⛔' : hist.from_status ? '➡️' : '✨'}
                        </span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.25rem' }}>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>
                            {hist.from_status ? (
                              <>
                                <span className={`badge ${getStatusBadgeClass(hist.from_status)}`} style={{ fontSize: '0.75rem' }}>{hist.from_status}</span>
                                <span style={{ margin: '0 0.35rem', color: '#64748b' }}>&rarr;</span>
                                <span className={`badge ${getStatusBadgeClass(hist.to_status)}`} style={{ fontSize: '0.75rem' }}>{hist.to_status}</span>
                              </>
                            ) : (
                              <>
                                <span style={{ color: '#64748b', fontWeight: 500, marginRight: '0.4rem' }}>Initial:</span>
                                <span className={`badge ${getStatusBadgeClass(hist.to_status)}`} style={{ fontSize: '0.75rem' }}>{hist.to_status}</span>
                              </>
                            )}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {hist.changed_at ? new Date(hist.changed_at).toLocaleString() : '—'}
                          </div>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.2rem' }}>
                          Changed by: <strong>{hist.changed_by?.name || 'System / Initial'}</strong> {hist.changed_by?.email ? `(${hist.changed_by.email})` : ''}
                        </div>
                        {hist.remarks && (
                          <div style={{ marginTop: '0.35rem', padding: '0.4rem 0.6rem', background: '#f8fafc', borderRadius: '4px', borderLeft: '3px solid #cbd5e1', fontSize: '0.8rem', color: '#334155' }}>
                            “{hist.remarks}”
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
              <div>
                {canUpdate && viewingCandidate.status !== 'Hired' && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => handleOpenStatusModal(viewingCandidate)}
                    style={{ background: '#f59e0b', borderColor: '#d97706', color: '#fff' }}
                  >
                    Change Status
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

      {/* Resume Upload & Field Extraction Modal */}
      {isResumeModalOpen && resumeCandidate && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="modal-container card" style={{ maxWidth: '650px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem', background: '#fff', borderRadius: '8px' }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
                  {resumeCandidate.resume?.exists ? 'Manage / Replace Resume' : 'Upload Candidate Resume'}
                </h2>
                <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.2rem' }}>
                  Candidate: <strong>{resumeCandidate.full_name}</strong> ({resumeCandidate.candidate_code})
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsResumeModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}
              >
                &times;
              </button>
            </div>

            {/* Error and Success Alerts */}
            {resumeModalError && (
              <div className="alert alert-error" style={{ marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: '6px', background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
                {resumeModalError}
              </div>
            )}
            {resumeModalSuccess && (
              <div className="alert alert-success" style={{ marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: '6px', background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>
                {resumeModalSuccess}
              </div>
            )}

            {/* Existing Resume Overview */}
            {resumeCandidate.resume?.exists && (
              <div style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Active Resume</div>
                    <div style={{ fontSize: '1rem', fontWeight: 600, color: '#0f172a', marginTop: '0.25rem' }}>
                      📄 {resumeCandidate.resume.original_name}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem' }}>
                      Size: {formatFileSize(resumeCandidate.resume.size)} | Type: {resumeCandidate.resume.mime_type || 'PDF/Word'}
                      {resumeCandidate.resume.uploaded_at && ` | Uploaded: ${new Date(resumeCandidate.resume.uploaded_at).toLocaleDateString()}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => handleAIScreen(resumeCandidate)}
                      disabled={isScreening}
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', backgroundColor: isScreening ? '#cbd5e1' : '#8b5cf6', borderColor: isScreening ? '#94a3b8' : '#7c3aed', color: 'white', cursor: isScreening ? 'not-allowed' : 'pointer' }}
                    >
                      ✨ AI Screen
                    </button>
                    <button
                      type="button"
                      id="btn-resume-modal-download"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleDownloadResume(resumeCandidate)}
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                    >
                      Download
                    </button>
                    {canDelete && (
                      <button
                        type="button"
                        id="btn-resume-modal-delete"
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDeleteResume(resumeCandidate)}
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Upload Form */}
            <form onSubmit={handleUploadResumeSubmit} style={{ marginBottom: '1.5rem' }}>
              <div style={{ marginBottom: '1rem' }}>
                <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem' }}>
                  {resumeCandidate.resume?.exists ? 'Upload New File to Replace Resume' : 'Select Resume File'} <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  id="resume-file-input"
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={handleResumeFileChange}
                  className="form-control"
                  style={{ width: '100%', padding: '0.5rem', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                />
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.35rem' }}>
                  Accepted formats: <strong>PDF, DOC, DOCX</strong>. Maximum file size: <strong>10 MB</strong>.
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="submit"
                  id="btn-upload-resume"
                  className="btn btn-primary"
                  disabled={uploadingResume || !resumeFile}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  {uploadingResume ? 'Uploading & Extracting...' : resumeCandidate.resume?.exists ? 'Replace Resume' : 'Upload Resume'}
                </button>
              </div>
            </form>

            {/* Extracted Information Suggestions Panel */}
            {extractedData && (
              <div style={{ borderTop: '2px dashed #cbd5e1', paddingTop: '1.25rem', marginTop: '1rem' }}>
                {extractedData.status === 'completed' && extractedData.fields && Object.keys(extractedData.fields).length > 0 ? (
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1.2rem' }}>💡</span>
                        <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                          Suggested Candidate Information (Extracted)
                        </h4>
                      </div>
                      <span className="badge badge-active" style={{ fontSize: '0.75rem' }}>Auto-detected</span>
                    </div>

                    <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: '#64748b', lineHeight: 1.4 }}>
                      The following profile details were detected in the uploaded resume. Extracted values are suggestions only.
                      Select the fields you want to update on the candidate profile. Existing values will not be changed unless selected.
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
                      {Object.entries(extractedData.fields).map(([fieldName, val]) => {
                        const currentVal = resumeCandidate[fieldName] ?? 'Not Specified';
                        const labels = {
                          email: 'Email Address',
                          phone: 'Phone Number',
                          total_experience_years: 'Experience (Years)',
                          highest_qualification: 'Highest Qualification',
                          current_designation: 'Current Designation',
                          current_location: 'Current Location',
                        };
                        const label = labels[fieldName] || fieldName;

                        return (
                          <label
                            key={fieldName}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '0.75rem',
                              padding: '0.6rem 0.75rem',
                              background: '#fff',
                              border: selectedFieldsToApply[fieldName] ? '1px solid #075E4B' : '1px solid #e2e8f0',
                              borderRadius: '6px',
                              cursor: 'pointer',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={!!selectedFieldsToApply[fieldName]}
                              onChange={(e) => setSelectedFieldsToApply(prev => ({
                                ...prev,
                                [fieldName]: e.target.checked,
                              }))}
                              style={{ marginTop: '0.2rem' }}
                            />
                            <div style={{ flex: 1, fontSize: '0.85rem' }}>
                              <div style={{ fontWeight: 600, color: '#334155' }}>{label}</div>
                              <div style={{ color: '#0f172a', fontWeight: 500, marginTop: '0.1rem' }}>
                                Suggested: <span style={{ color: '#2563eb' }}>{String(val)}</span>
                              </div>
                              <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '0.1rem' }}>
                                Current: {String(currentVal)}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                      <button
                        type="button"
                        id="btn-apply-extraction"
                        className="btn btn-primary btn-sm"
                        disabled={applyingFields || Object.values(selectedFieldsToApply).filter(Boolean).length === 0}
                        onClick={handleApplyExtractedFields}
                      >
                        {applyingFields ? 'Applying...' : 'Apply Selected Suggestions to Profile'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '0.75rem 1rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.85rem', color: '#64748b' }}>
                    ℹ️ Resume uploaded successfully. Automatic field extraction was unavailable for this document format or structure.
                  </div>
                )}
              </div>
            )}

            {/* Modal Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: '1rem', marginTop: '1.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsResumeModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Change Modal */}
      {isStatusModalOpen && statusCandidate && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050, padding: '1rem' }}>
          <div className="modal-container card" style={{ maxWidth: '520px', width: '100%', padding: '1.5rem', background: '#fff', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Update Candidate Status</h3>
                <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.2rem' }}>
                  {statusCandidate.full_name} ({statusCandidate.candidate_code})
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsStatusModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}
              >
                &times;
              </button>
            </div>

            {statusModalError && (
              <div className="alert alert-danger" style={{ marginBottom: '1rem', padding: '0.75rem', fontSize: '0.85rem' }}>
                {statusModalError}
              </div>
            )}
            {statusModalSuccess && (
              <div className="alert alert-success" style={{ marginBottom: '1rem', padding: '0.75rem', fontSize: '0.85rem' }}>
                {statusModalSuccess}
              </div>
            )}

            <form onSubmit={handleStatusSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#64748b', marginBottom: '0.25rem' }}>
                  Current Status:
                </label>
                <div>
                  <span className={`badge ${getStatusBadgeClass(statusCandidate.status)}`} style={{ fontSize: '0.9rem', padding: '0.35rem 0.75rem' }}>
                    {statusCandidate.status}
                  </span>
                </div>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Select Next Status <span style={{ color: '#ef4444' }}>*</span>
                </label>
                {(ALLOWED_STATUS_TRANSITIONS[statusCandidate.status] || []).length === 0 ? (
                  <div style={{ color: '#64748b', fontStyle: 'italic', padding: '0.75rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    Candidate is in terminal status <strong>{statusCandidate.status}</strong>. No further status changes are allowed.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {(ALLOWED_STATUS_TRANSITIONS[statusCandidate.status] || []).map((target) => (
                      <label
                        key={target}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.6rem',
                          padding: '0.6rem 0.75rem',
                          border: newStatus === target ? '2px solid #2563eb' : '1px solid #e2e8f0',
                          borderRadius: '6px',
                          background: newStatus === target ? '#eff6ff' : '#fff',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="radio"
                          name="pipeline_status"
                          value={target}
                          checked={newStatus === target}
                          onChange={() => setNewStatus(target)}
                        />
                        <span className={`badge ${getStatusBadgeClass(target)}`} style={{ marginRight: '0.25rem' }}>
                          {target}
                        </span>
                        <span style={{ fontSize: '0.82rem', color: '#475569' }}>
                          {target === 'Screening' && statusCandidate.status === 'New' && 'Advance to resume & initial screening'}
                          {target === 'Shortlisted' && 'Candidate passed screening; ready for interview scheduling'}
                          {target === 'Hired' && 'Candidate selected; requires completed interview + feedback'}
                          {target === 'Rejected' && 'Decline candidate (reason required)'}
                          {target === 'New' && 'Revert to initial New status (admin reversal)'}
                          {target === 'Screening' && statusCandidate.status === 'Rejected' && 'Reconsider rejected candidate (re-enter screening)'}
                          {target === 'Screening' && statusCandidate.status === 'Shortlisted' && 'Revert candidate back to screening'}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Rejection required remarks */}
              {newStatus === 'Rejected' && (
                <div style={{ marginBottom: '1rem', background: '#fef2f2', padding: '0.75rem', borderRadius: '6px', border: '1px solid #fecaca' }}>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, color: '#991b1b', marginBottom: '0.25rem' }}>
                    Reason for Rejection <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <textarea
                    rows="3"
                    className="form-control"
                    placeholder="Specify the reason or feedback for candidate rejection..."
                    value={statusRemarks}
                    onChange={(e) => setStatusRemarks(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderColor: '#fca5a5' }}
                    required
                  />
                  <div style={{ fontSize: '0.75rem', color: '#b91c1c', marginTop: '0.25rem' }}>
                    Rejection remarks are mandatory and will be recorded in the audit trail.
                  </div>
                </div>
              )}

              {/* Hired Prerequisites Notice & Confirmation */}
              {newStatus === 'Hired' && (
                <div style={{ marginBottom: '1rem', background: '#ecfdf5', padding: '0.75rem', borderRadius: '6px', border: '1px solid #a7f3d0' }}>
                  <div style={{ fontWeight: 600, color: '#065f46', marginBottom: '0.35rem', fontSize: '0.9rem' }}>
                    📋 Hiring Prerequisites Check
                  </div>
                  <ul style={{ margin: '0 0 0.5rem 1.25rem', padding: 0, fontSize: '0.82rem', color: '#047857', lineHeight: 1.4 }}>
                    <li>Candidate must have at least one interview marked <strong>Completed</strong>.</li>
                    <li>At least one completed interview must have an associated <strong>Interview Feedback</strong> record.</li>
                  </ul>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: '#065f46', fontWeight: 500 }}>
                    <input
                      type="checkbox"
                      checked={hiredConfirmed}
                      onChange={(e) => setHiredConfirmed(e.target.checked)}
                      style={{ marginTop: '0.2rem' }}
                    />
                    <span>I confirm that the interview and feedback prerequisites have been satisfied.</span>
                  </label>
                </div>
              )}

              {/* Optional remarks for non-rejected statuses */}
              {newStatus && newStatus !== 'Rejected' && (
                <div style={{ marginBottom: '1rem' }}>
                  <label className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Transition Remarks (Optional)
                  </label>
                  <textarea
                    rows="2"
                    className="form-control"
                    placeholder="Add optional notes or context for this status change..."
                    value={statusRemarks}
                    onChange={(e) => setStatusRemarks(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem' }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsStatusModalOpen(false)}
                  disabled={statusSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="btn-submit-status-change"
                  className="btn btn-primary"
                  disabled={statusSubmitting || !newStatus || (ALLOWED_STATUS_TRANSITIONS[statusCandidate.status] || []).length === 0}
                >
                  {statusSubmitting ? 'Updating...' : `Transition to ${newStatus || 'Status'}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI Screening Progress Modal */}
      {isScreeningModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050 }}>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', width: '100%', maxWidth: '450px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: '#8b5cf6' }}>✨</span> AI Screening
              </h3>
              <button
                type="button"
                onClick={() => {
                  if (!isScreening) {
                    setIsScreeningModalOpen(false);
                  }
                }}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: isScreening ? 'not-allowed' : 'pointer', color: isScreening ? '#cbd5e1' : '#64748b' }}
                disabled={isScreening}
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Candidate</div>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: '#0f172a' }}>
                {screeningCandidate?.first_name} {screeningCandidate?.last_name}
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Resume</div>
              <div style={{ fontSize: '1rem', fontWeight: 500, color: '#334155', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                📄 {screeningCandidate?.resume?.original_name || 'No resume attached'}
              </div>
            </div>

            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1.25rem' }}>
              <div style={{ fontSize: '1.05rem', fontWeight: 600, color: '#0f172a', marginBottom: '1rem' }}>
                {screeningError ? 'AI Screening Failed' : 'AI Screening in Progress'}
              </div>

              {!screeningError ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#475569' }}>
                    <span>{screeningStage}</span>
                    <span style={{ fontWeight: 600, color: '#8b5cf6' }}>{screeningProgress}%</span>
                  </div>

                  <div
                    style={{ width: '100%', height: '8px', backgroundColor: '#e2e8f0', borderRadius: '9999px', overflow: 'hidden', marginBottom: '1rem' }}
                    role="progressbar"
                    aria-valuenow={screeningProgress}
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-busy={isScreening}
                  >
                    <div
                      style={{ height: '100%', backgroundColor: '#8b5cf6', width: `${screeningProgress}%`, transition: 'width 0.5s ease-out' }}
                    ></div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <div style={{ marginTop: '0.2rem' }}>
                      <span className="spinner-grow spinner-grow-sm" style={{ color: '#8b5cf6' }} role="status" aria-hidden="true"></span>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: '#334155', fontSize: '0.9rem' }}>● AI screening in progress</div>
                      <div style={{ color: '#64748b', fontSize: '0.85rem' }}>Please wait while we analyze the resume.</div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '1rem', borderRadius: '6px', color: '#991b1b', fontSize: '0.9rem', marginBottom: '1rem' }}>
                    {screeningError}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => handleAIScreen(screeningCandidate)}
                      style={{ backgroundColor: '#8b5cf6', borderColor: '#7c3aed' }}
                    >
                      Try Again
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Candidates;
