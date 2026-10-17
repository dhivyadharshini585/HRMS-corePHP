import React, { useState, useEffect, useCallback, useMemo } from 'react';
import offerLetterService from '../../services/offerLetterService';
import candidateService from '../../services/candidateService';
import jobOpeningService from '../../services/jobOpeningService';
import departmentService from '../../services/departmentService';
import { useAuthContext } from '../../context/AuthContext';
import CustomSelect from '../../components/common/CustomSelect';

const OFFER_STATUSES = ['Draft', 'Sent', 'Accepted', 'Rejected', 'Withdrawn', 'Expired'];
const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship'];
const SALARY_FREQUENCIES = ['Annual', 'Monthly', 'Bi-weekly', 'Weekly', 'Hourly'];
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD'];

const initialFormData = {
  candidate_id: '',
  job_opening_id: '',
  department_id: '',
  designation: '',
  employment_type: 'Full-time',
  work_location: '',
  salary_amount: '',
  salary_currency: 'INR',
  salary_frequency: 'Monthly',
  offer_date: new Date().toISOString().split('T')[0],
  joining_date: '',
  expiry_date: '',
  probation_period_months: '',
  notice_period_days: '',
  benefits: '',
  terms_and_conditions: '',
};

/* ---- helpers ---- */
const fmtDate = (d) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return d; }
};

const fmtSalary = (amt, curr) => {
  if (!amt && amt !== 0) return '—';
  const n = Number(amt);
  return `${curr || 'INR'} ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const candidateName = (c) => c ? `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown' : 'Unknown';

/* ---- status badge ---- */
const getStatusBadgeClass = (status) => {
  switch (status) {
    case 'Draft': return 'badge-neutral';
    case 'Sent': return 'badge-info';
    case 'Accepted': return 'badge-success';
    case 'Rejected': return 'badge-danger';
    case 'Withdrawn': return 'badge-warning';
    case 'Expired': return 'badge-danger';
    default: return 'badge-neutral';
  }
};

const StatusBadge = ({ status }) => (
  <span className={`badge ${getStatusBadgeClass(status)}`}>
    {status}
  </span>
);

/* ============================================= */
/*              MAIN COMPONENT                   */
/* ============================================= */
const OfferLetters = () => {
  const { user } = useAuthContext();

  const [offerLetters, setOfferLetters] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [jobOpenings, setJobOpenings] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [pagination, setPagination] = useState({ currentPage: 1, lastPage: 1, total: 0, perPage: 15 });

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [fromDateFilter, setFromDateFilter] = useState('');
  const [toDateFilter, setToDateFilter] = useState('');

  // Modals
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [isRespondModalOpen, setIsRespondModalOpen] = useState(false);
  const [respondAction, setRespondAction] = useState('');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const [activeOffer, setActiveOffer] = useState(null);
  const [formData, setFormData] = useState(initialFormData);
  const [formErrors, setFormErrors] = useState({});
  const [remarks, setRemarks] = useState('');
  const [remarksError, setRemarksError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);

  /* ---- RBAC ---- */
  const hasRole = (...roles) => user?.roles?.some(r => roles.includes(r));
  const hasPerm = (p) => user?.permissions?.includes(p);
  const canCreate   = hasRole('Super Admin', 'HR Admin', 'HR Executive') || hasPerm('recruitment.offer_letters.create');
  const canUpdate   = hasRole('Super Admin', 'HR Admin', 'HR Executive') || hasPerm('recruitment.offer_letters.update');
  const canDelete   = hasRole('Super Admin', 'HR Admin') || hasPerm('recruitment.offer_letters.delete');
  const canSend     = hasRole('Super Admin', 'HR Admin', 'HR Executive') || hasPerm('recruitment.offer_letters.send');
  const canRespond  = hasRole('Super Admin', 'HR Admin', 'HR Executive') || hasPerm('recruitment.offer_letters.respond');
  const canDownload = hasRole('Super Admin', 'HR Admin', 'HR Executive') || hasPerm('recruitment.offer_letters.download') || hasPerm('recruitment.offer_letters.view');

  /* ---- Summary stats ---- */
  const stats = useMemo(() => {
    const counts = { Total: offerLetters.length, Draft: 0, Sent: 0, Accepted: 0, Rejected: 0, Expired: 0 };
    offerLetters.forEach(o => { if (counts[o.offer_status] !== undefined) counts[o.offer_status]++; });
    if (pagination.total > offerLetters.length) counts.Total = pagination.total;
    return counts;
  }, [offerLetters, pagination.total]);

  /* ---- Data Fetching ---- */
  const fetchOfferLetters = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = { page, per_page: pagination.perPage };
      if (search.trim()) params.search = search.trim();
      if (statusFilter) params.offer_status = statusFilter;
      if (fromDateFilter) params.offer_date_from = fromDateFilter;
      if (toDateFilter) params.offer_date_to = toDateFilter;
      const response = await offerLetterService.getOfferLetters(params);
      const dataList = response?.data || [];
      setOfferLetters(dataList);
      setPagination({
        currentPage: response?.current_page || 1,
        lastPage: response?.last_page || 1,
        total: response?.total || 0,
        perPage: response?.per_page || 15,
      });
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load offer letters.');
    } finally {
      setLoading(false);
    }
  }, [pagination.perPage, search, statusFilter, fromDateFilter, toDateFilter]);

  const fetchCandidates = useCallback(async () => {
    try {
      const res = await candidateService.getCandidates({ per_page: 500 });
      setCandidates(res?.data?.data || res?.data || []);
    } catch { /* silent */ }
  }, []);
  const fetchJobOpenings = useCallback(async () => {
    try {
      const res = await jobOpeningService.getJobOpenings({ per_page: 500 });
      setJobOpenings(res?.data?.data || res?.data || []);
    } catch { /* silent */ }
  }, []);
  const fetchDepartments = useCallback(async () => {
    try {
      const res = await departmentService.getDepartments({ per_page: 500 });
      setDepartments(res?.data?.data || res?.data || []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchOfferLetters(1); fetchCandidates(); fetchJobOpenings(); fetchDepartments(); }, [fetchOfferLetters, fetchCandidates, fetchJobOpenings, fetchDepartments]);

  useEffect(() => { if (!successMessage) return; const t = setTimeout(() => setSuccessMessage(''), 5000); return () => clearTimeout(t); }, [successMessage]);

  const handleResetFilters = () => {
    setSearch('');
    setStatusFilter('');
    setFromDateFilter('');
    setToDateFilter('');
  };

  /* ---- Candidate auto-bind ---- */
  const hiredCandidates = useMemo(() => candidates.filter(c => c.status === 'Hired'), [candidates]);

  const handleCandidateChange = (e) => {
    const candId = e.target.value;
    const selected = candidates.find(c => String(c.id) === String(candId));
    if (selected) {
      setFormData(prev => ({
        ...prev,
        candidate_id: candId,
        job_opening_id: selected.job_opening_id || '',
        department_id: selected.job_opening?.department_id || selected.job_opening?.department?.id || '',
        designation: selected.job_opening?.title || prev.designation,
      }));
    } else {
      setFormData(prev => ({ ...prev, candidate_id: candId, job_opening_id: '', department_id: '' }));
    }
  };

  /* ---- Modal openers ---- */
  const openCreateModal = () => { setActiveOffer(null); setFormData(initialFormData); setFormErrors({}); setError(''); setIsFormModalOpen(true); };
  const openEditModal = (offer) => {
    if (offer.offer_status !== 'Draft') { setError("Only Draft offer letters can be edited."); return; }
    setActiveOffer(offer);
    setFormData({
      candidate_id: offer.candidate_id, job_opening_id: offer.job_opening_id,
      department_id: offer.department_id || offer.job_opening?.department_id || '',
      designation: offer.designation || '', employment_type: offer.employment_type || 'Full-time',
      work_location: offer.work_location || '',
      salary_amount: offer.salary_amount || '', salary_currency: offer.salary_currency || 'INR', salary_frequency: offer.salary_frequency || 'Monthly',
      offer_date: offer.offer_date ? offer.offer_date.split('T')[0] : '',
      joining_date: offer.joining_date ? offer.joining_date.split('T')[0] : '',
      expiry_date: offer.expiry_date ? offer.expiry_date.split('T')[0] : '',
      probation_period_months: offer.probation_period_months ?? '', notice_period_days: offer.notice_period_days ?? '',
      benefits: offer.benefits || '', terms_and_conditions: offer.terms_and_conditions || '',
    });
    setFormErrors({}); setError(''); setIsFormModalOpen(true);
  };
  const openDetailModal = (offer) => { setActiveOffer(offer); setIsDetailModalOpen(true); };
  const openSendModal = (offer) => { setActiveOffer(offer); setIsSendModalOpen(true); };
  const openRespondModal = (offer, action) => { setActiveOffer(offer); setRespondAction(action); setRemarks(''); setRemarksError(''); setIsRespondModalOpen(true); };
  const openDeleteModal = (offer) => { setActiveOffer(offer); setIsDeleteModalOpen(true); };

  /* ---- Form Submit ---- */
  const handleFormSubmit = async (e) => {
    e.preventDefault(); setSubmitting(true); setFormErrors({}); setError('');
    try {
      if (activeOffer) {
        const res = await offerLetterService.updateOfferLetter(activeOffer.id, formData);
        setSuccessMessage(`Offer letter '${res.data?.offer_code || activeOffer.offer_code}' updated successfully.`);
        setIsFormModalOpen(false); 
        fetchOfferLetters(pagination.currentPage);
      } else {
        const res = await offerLetterService.createOfferLetter(formData);
        setSuccessMessage(`Offer letter '${res.data?.offer_code || ''}' created successfully.`);
        setIsFormModalOpen(false); 
        // Reset filters and go to first page so the new item is clearly visible
        setSearch('');
        setStatusFilter('');
        setFromDateFilter('');
        setToDateFilter('');
        fetchOfferLetters(1);
      }
    } catch (err) {
      if (err.response?.status === 422 && err.response?.data?.errors) setFormErrors(err.response.data.errors);
      else setError(err.response?.data?.message || 'Failed to save offer letter.');
    } finally { setSubmitting(false); }
  };

  /* ---- Send ---- */
  const handleSend = async () => {
    if (!activeOffer) return; setActionLoading(true); setError('');
    try {
      const res = await offerLetterService.sendOfferLetter(activeOffer.id);
      setSuccessMessage(res.message || `Offer letter '${activeOffer.offer_code}' sent successfully.`);
      setIsSendModalOpen(false);
      if (isDetailModalOpen && activeOffer?.id === res.data?.id) setActiveOffer(res.data);
      fetchOfferLetters(pagination.currentPage);
    } catch (err) { setError(err.response?.data?.message || 'Failed to send offer letter.'); }
    finally { setActionLoading(false); }
  };

  /* ---- Respond ---- */
  const handleRespond = async () => {
    if (!activeOffer) return;
    if (respondAction === 'reject' && !remarks.trim()) { setRemarksError('Remarks are required when rejecting.'); return; }
    setActionLoading(true); setError('');
    try {
      let res;
      if (respondAction === 'accept') res = await offerLetterService.acceptOfferLetter(activeOffer.id, remarks.trim());
      else if (respondAction === 'reject') res = await offerLetterService.rejectOfferLetter(activeOffer.id, remarks.trim());
      else if (respondAction === 'withdraw') res = await offerLetterService.withdrawOfferLetter(activeOffer.id, remarks.trim());
      setSuccessMessage(res?.message || 'Offer letter status updated.');
      setIsRespondModalOpen(false);
      if (isDetailModalOpen && activeOffer?.id === res?.data?.id) setActiveOffer(res.data);
      fetchOfferLetters(pagination.currentPage);
    } catch (err) { setError(err.response?.data?.message || 'Failed to update offer status.'); }
    finally { setActionLoading(false); }
  };

  /* ---- Delete ---- */
  const handleDelete = async () => {
    if (!activeOffer) return; setActionLoading(true); setError('');
    try {
      const res = await offerLetterService.deleteOfferLetter(activeOffer.id);
      setSuccessMessage(res.message || `Offer letter deleted.`);
      setIsDeleteModalOpen(false); fetchOfferLetters(pagination.currentPage);
    } catch (err) { setError(err.response?.data?.message || 'Failed to delete offer letter.'); }
    finally { setActionLoading(false); }
  };

  /* ---- Download ---- */
  const handleDownload = async (offer) => {
    setDownloadingId(offer.id); setError('');
    try {
      const response = await offerLetterService.downloadOfferLetter(offer.id);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${offer.offer_code || 'Offer_Letter'}.pdf`);
      document.body.appendChild(link); link.click(); link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      if (err.response?.status === 403) setError('You are not authorized to download this document.');
      else if (err.response?.status === 404) setError('Offer letter document not found.');
      else setError(err.response?.data?.message || 'Failed to download PDF.');
    } finally { setDownloadingId(null); }
  };

  return (
    <div className="page-container" id="offer-letters-page">
      {/* PAGE HEADER */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Offer Letters</h1>
          <p className="page-subtitle">
            Create, send, and manage candidate offer letters.
          </p>
        </div>
        {canCreate && (
          <button className="btn-primary" onClick={openCreateModal}>
            + Create Offer Letter
          </button>
        )}
      </div>

      {/* ALERTS */}
      {error && (
        <div className="alert-banner error">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="alert-banner success">
          {successMessage}
        </div>
      )}

      {/* SUMMARY CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="detail-card" style={{ marginBottom: 0, padding: '1.25rem', borderLeft: '4px solid #075E4B' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Offers</div>
          <div style={{ fontSize: '1.85rem', fontWeight: 700, marginTop: '0.25rem', color: 'var(--text-primary)' }}>{stats.Total}</div>
        </div>
        <div className="detail-card" style={{ marginBottom: 0, padding: '1.25rem', borderLeft: '4px solid #475569' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Draft</div>
          <div style={{ fontSize: '1.85rem', fontWeight: 700, marginTop: '0.25rem', color: '#475569' }}>{stats.Draft}</div>
        </div>
        <div className="detail-card" style={{ marginBottom: 0, padding: '1.25rem', borderLeft: '4px solid #3730a3' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sent</div>
          <div style={{ fontSize: '1.85rem', fontWeight: 700, marginTop: '0.25rem', color: '#3730a3' }}>{stats.Sent}</div>
        </div>
        <div className="detail-card" style={{ marginBottom: 0, padding: '1.25rem', borderLeft: '4px solid #16a34a' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Accepted</div>
          <div style={{ fontSize: '1.85rem', fontWeight: 700, marginTop: '0.25rem', color: '#16a34a' }}>{stats.Accepted}</div>
        </div>
        <div className="detail-card" style={{ marginBottom: 0, padding: '1.25rem', borderLeft: '4px solid #ef4444' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rejected</div>
          <div style={{ fontSize: '1.85rem', fontWeight: 700, marginTop: '0.25rem', color: '#ef4444' }}>{stats.Rejected}</div>
        </div>
        <div className="detail-card" style={{ marginBottom: 0, padding: '1.25rem', borderLeft: '4px solid #f97316' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Expired</div>
          <div style={{ fontSize: '1.85rem', fontWeight: 700, marginTop: '0.25rem', color: '#f97316' }}>{stats.Expired}</div>
        </div>
      </div>

      {/* FILTERS */}
      <div className="filters-bar">
        <div className="filter-group">
          <label className="filter-label">Search offers</label>
          <input 
            type="text" 
            placeholder="Offer code, candidate name..." 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            className="filter-input" 
          />
        </div>
        <div className="filter-group">
          <label className="filter-label">Status</label>
          <CustomSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="filter-select">
            <option value="">All Statuses</option>
            {OFFER_STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
          </CustomSelect>
        </div>
        <div className="filter-group">
          <label className="filter-label">Offer Date From</label>
          <input type="date" value={fromDateFilter} onChange={(e) => setFromDateFilter(e.target.value)} className="filter-input" />
        </div>
        <div className="filter-group">
          <label className="filter-label">Offer Date To</label>
          <input type="date" value={toDateFilter} onChange={(e) => setToDateFilter(e.target.value)} className="filter-input" />
        </div>
        <div className="filter-group" style={{ display: 'flex', justifyContent: 'flex-end', height: '100%', alignItems: 'end' }}>
          <button className="btn-secondary" onClick={handleResetFilters} style={{ width: '100%' }}>
            Clear All
          </button>
        </div>
      </div>

      {/* TABLE */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Offer Code</th>
              <th>Candidate</th>
              <th>Designation</th>
              <th>Salary</th>
              <th>Joining Date</th>
              <th style={{ textAlign: 'center' }}>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="7">
                  <div className="state-container">
                    <p>Loading offer letters...</p>
                  </div>
                </td>
              </tr>
            ) : offerLetters.length === 0 ? (
              <tr>
                <td colSpan="7">
                  <div className="state-container">
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}>
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                      </svg>
                    </div>
                    <h3>No offer letters found</h3>
                    <p>Get started by creating an offer for a Hired candidate.</p>
                  </div>
                </td>
              </tr>
            ) : (
              offerLetters.map(offer => {
                const isDraft = offer.offer_status === 'Draft';
                const isSent  = offer.offer_status === 'Sent';
                return (
                  <tr key={offer.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{offer.offer_code}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{fmtDate(offer.offer_date)}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{candidateName(offer.candidate)}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{offer.candidate?.email || '—'}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{offer.designation || '—'}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{offer.employment_type}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{fmtSalary(offer.salary_amount, offer.salary_currency)}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{offer.salary_frequency}</div>
                    </td>
                    <td>
                      <div style={{ color: 'var(--text-primary)' }}>{fmtDate(offer.joining_date)}</div>
                      {offer.expiry_date && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Exp: {fmtDate(offer.expiry_date)}</div>}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <StatusBadge status={offer.offer_status} />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => openDetailModal(offer)}>
                          View
                        </button>
                        {canDownload && (
                          <button className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} disabled={downloadingId === offer.id} onClick={() => handleDownload(offer)}>
                            {downloadingId === offer.id ? '...' : 'PDF'}
                          </button>
                        )}
                        {isDraft && canUpdate && (
                          <button className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => openEditModal(offer)}>
                            Edit
                          </button>
                        )}
                        {isDraft && canSend && (
                          <button className="btn-primary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => openSendModal(offer)}>
                            Send
                          </button>
                        )}
                        {isSent && canRespond && (
                          <button className="btn-success" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => openRespondModal(offer, 'accept')}>
                            Accept
                          </button>
                        )}
                        {isSent && canRespond && (
                          <button className="btn-danger" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => openRespondModal(offer, 'reject')}>
                            Reject
                          </button>
                        )}
                        {isSent && canRespond && (
                          <button className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => openRespondModal(offer, 'withdraw')}>
                            Withdraw
                          </button>
                        )}
                        {isDraft && canDelete && (
                          <button className="btn-danger" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => openDeleteModal(offer)}>
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        
        {/* Pagination */}
        {pagination.total > 0 && (
          <div className="pagination-bar">
            <div className="pagination-info">
              Showing {((pagination.currentPage - 1) * pagination.perPage) + 1} to {Math.min(pagination.currentPage * pagination.perPage, pagination.total)} of {pagination.total} offers
            </div>
            <div className="pagination-btns">
              <button className="pagination-btn" disabled={pagination.currentPage <= 1} onClick={() => fetchOfferLetters(pagination.currentPage - 1)}>
                Previous
              </button>
              <button className="pagination-btn" disabled={pagination.currentPage >= pagination.lastPage} onClick={() => fetchOfferLetters(pagination.currentPage + 1)}>
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CREATE / EDIT MODAL */}
      {isFormModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '800px' }}>
            <div className="modal-header">
              <h3>{activeOffer ? `Edit Draft Offer - ${activeOffer.offer_code}` : 'Create Offer Letter'}</h3>
              <button onClick={() => setIsFormModalOpen(false)} style={{ fontSize: '1.25rem', cursor: 'pointer', border: 'none', background: 'none' }}>&times;</button>
            </div>
            <div className="modal-body">
              <form id="offerForm" onSubmit={handleFormSubmit}>
                
                <h4 style={{ marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 600 }}>Candidate & Job Information</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div className="filter-group">
                    <label className="filter-label">Candidate *</label>
                    {activeOffer ? (
                      <input type="text" disabled value={`${candidateName(activeOffer.candidate)} (${activeOffer.candidate?.candidate_code || ''})`} className="form-control" style={{ backgroundColor: 'var(--bg-surface-hover)' }} />
                    ) : (
                      <CustomSelect value={formData.candidate_id} onChange={handleCandidateChange} required className="form-control">
                        <option value="">Select a Hired candidate...</option>
                        {hiredCandidates.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name} — {c.job_opening?.title || 'N/A'}</option>)}
                      </CustomSelect>
                    )}
                    {formErrors.candidate_id && <span style={{ color: 'red', fontSize: '0.75rem' }}>{formErrors.candidate_id[0]}</span>}
                  </div>
                  <div className="filter-group">
                    <label className="filter-label">Job Opening *</label>
                    <CustomSelect value={formData.job_opening_id} disabled className="form-control" style={{ backgroundColor: 'var(--bg-surface-hover)' }}>
                      <option value="">Auto-bound from candidate</option>
                      {jobOpenings.map(j => <option key={j.id} value={j.id}>{j.title} ({j.job_code})</option>)}
                    </CustomSelect>
                  </div>
                  <div className="filter-group">
                    <label className="filter-label">Designation *</label>
                    <input type="text" required value={formData.designation} onChange={(e) => setFormData({ ...formData, designation: e.target.value })} className="form-control" />
                    {formErrors.designation && <span style={{ color: 'red', fontSize: '0.75rem' }}>{formErrors.designation[0]}</span>}
                  </div>
                  <div className="filter-group">
                    <label className="filter-label">Department</label>
                    <CustomSelect value={formData.department_id} disabled className="form-control" style={{ backgroundColor: 'var(--bg-surface-hover)' }}>
                      <option value="">Auto-bound</option>
                      {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </CustomSelect>
                  </div>
                </div>

                <h4 style={{ marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 600 }}>Employment Details</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div className="filter-group">
                    <label className="filter-label">Employment Type *</label>
                    <CustomSelect value={formData.employment_type} onChange={(e) => setFormData({ ...formData, employment_type: e.target.value })} className="form-control">
                      {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </CustomSelect>
                  </div>
                  <div className="filter-group">
                    <label className="filter-label">Work Location</label>
                    <input type="text" value={formData.work_location} onChange={(e) => setFormData({ ...formData, work_location: e.target.value })} className="form-control" />
                  </div>
                  <div className="filter-group">
                    <label className="filter-label">Offer Date *</label>
                    <input type="date" required value={formData.offer_date} onChange={(e) => setFormData({ ...formData, offer_date: e.target.value })} className="form-control" />
                    {formErrors.offer_date && <span style={{ color: 'red', fontSize: '0.75rem' }}>{formErrors.offer_date[0]}</span>}
                  </div>
                  <div className="filter-group">
                    <label className="filter-label">Joining Date *</label>
                    <input type="date" required value={formData.joining_date} onChange={(e) => setFormData({ ...formData, joining_date: e.target.value })} className="form-control" />
                    {formErrors.joining_date && <span style={{ color: 'red', fontSize: '0.75rem' }}>{formErrors.joining_date[0]}</span>}
                  </div>
                  <div className="filter-group">
                    <label className="filter-label">Probation (months)</label>
                    <input type="number" min="0" value={formData.probation_period_months} onChange={(e) => setFormData({ ...formData, probation_period_months: e.target.value })} className="form-control" />
                  </div>
                  <div className="filter-group">
                    <label className="filter-label">Notice Period (days)</label>
                    <input type="number" min="0" value={formData.notice_period_days} onChange={(e) => setFormData({ ...formData, notice_period_days: e.target.value })} className="form-control" />
                  </div>
                </div>

                <h4 style={{ marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 600 }}>Compensation</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div className="filter-group">
                    <label className="filter-label">Salary Amount *</label>
                    <input type="number" step="0.01" min="0" required value={formData.salary_amount} onChange={(e) => setFormData({ ...formData, salary_amount: e.target.value })} className="form-control" />
                    {formErrors.salary_amount && <span style={{ color: 'red', fontSize: '0.75rem' }}>{formErrors.salary_amount[0]}</span>}
                  </div>
                  <div className="filter-group">
                    <label className="filter-label">Currency *</label>
                    <CustomSelect value={formData.salary_currency} onChange={(e) => setFormData({ ...formData, salary_currency: e.target.value })} className="form-control">
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </CustomSelect>
                  </div>
                  <div className="filter-group">
                    <label className="filter-label">Frequency *</label>
                    <CustomSelect value={formData.salary_frequency} onChange={(e) => setFormData({ ...formData, salary_frequency: e.target.value })} className="form-control">
                      {SALARY_FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
                    </CustomSelect>
                  </div>
                </div>

                <h4 style={{ marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 600 }}>Benefits & Terms</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div className="filter-group">
                    <label className="filter-label">Benefits</label>
                    <textarea rows="3" value={formData.benefits} onChange={(e) => setFormData({ ...formData, benefits: e.target.value })} className="form-control" />
                  </div>
                  <div className="filter-group">
                    <label className="filter-label">Terms & Conditions</label>
                    <textarea rows="4" value={formData.terms_and_conditions} onChange={(e) => setFormData({ ...formData, terms_and_conditions: e.target.value })} className="form-control" />
                  </div>
                </div>

              </form>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setIsFormModalOpen(false)}>Cancel</button>
              <button form="offerForm" type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Saving...' : (activeOffer ? 'Update Draft' : 'Create Offer')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DETAILS MODAL */}
      {isDetailModalOpen && activeOffer && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '800px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <h3 style={{ margin: 0 }}>Offer Details - {activeOffer.offer_code}</h3>
                <StatusBadge status={activeOffer.offer_status} />
              </div>
              <button onClick={() => setIsDetailModalOpen(false)} style={{ fontSize: '1.25rem', cursor: 'pointer', border: 'none', background: 'none' }}>&times;</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                
                {/* Candidate & Position */}
                <div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 600, borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Candidate & Position</h4>
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    <div>
                      <div className="filter-label">Candidate</div>
                      <div style={{ fontSize: '0.95rem' }}>{candidateName(activeOffer.candidate)}</div>
                    </div>
                    <div>
                      <div className="filter-label">Job Opening</div>
                      <div style={{ fontSize: '0.95rem' }}>{activeOffer.job_opening?.title || '—'}</div>
                    </div>
                    <div>
                      <div className="filter-label">Designation</div>
                      <div style={{ fontSize: '0.95rem' }}>{activeOffer.designation || '—'}</div>
                    </div>
                    <div>
                      <div className="filter-label">Department</div>
                      <div style={{ fontSize: '0.95rem' }}>{activeOffer.department?.name || activeOffer.job_opening?.department?.name || '—'}</div>
                    </div>
                  </div>
                </div>

                {/* Employment Details */}
                <div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 600, borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Employment Details</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <div className="filter-label">Employment Type</div>
                      <div style={{ fontSize: '0.95rem' }}>{activeOffer.employment_type}</div>
                    </div>
                    <div>
                      <div className="filter-label">Work Location</div>
                      <div style={{ fontSize: '0.95rem' }}>{activeOffer.work_location || '—'}</div>
                    </div>
                    <div>
                      <div className="filter-label">Probation Period</div>
                      <div style={{ fontSize: '0.95rem' }}>{activeOffer.probation_period_months ? `${activeOffer.probation_period_months} months` : '—'}</div>
                    </div>
                    <div>
                      <div className="filter-label">Notice Period</div>
                      <div style={{ fontSize: '0.95rem' }}>{activeOffer.notice_period_days ? `${activeOffer.notice_period_days} days` : '—'}</div>
                    </div>
                  </div>
                </div>

                {/* Compensation */}
                <div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 600, borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Compensation</h4>
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    <div>
                      <div className="filter-label">Salary</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary-color)' }}>{fmtSalary(activeOffer.salary_amount, activeOffer.salary_currency)}</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>per {activeOffer.salary_frequency.toLowerCase()}</div>
                    </div>
                    <div>
                      <div className="filter-label">Benefits</div>
                      <div style={{ fontSize: '0.95rem', whiteSpace: 'pre-wrap' }}>{activeOffer.benefits || '—'}</div>
                    </div>
                  </div>
                </div>

                {/* Timeline & Response */}
                <div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 600, borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Timeline & Response</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <div className="filter-label">Offer Date</div>
                      <div style={{ fontSize: '0.95rem' }}>{fmtDate(activeOffer.offer_date)}</div>
                    </div>
                    <div>
                      <div className="filter-label">Joining Date</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{fmtDate(activeOffer.joining_date)}</div>
                    </div>
                    <div>
                      <div className="filter-label">Sent Date</div>
                      <div style={{ fontSize: '0.95rem' }}>{fmtDate(activeOffer.sent_at)}</div>
                    </div>
                    <div>
                      <div className="filter-label">Responded Date</div>
                      <div style={{ fontSize: '0.95rem' }}>{fmtDate(activeOffer.responded_at)}</div>
                    </div>
                    {activeOffer.expiry_date && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div className="filter-label" style={{ color: 'var(--badge-danger)' }}>Expiry Date</div>
                        <div style={{ fontSize: '0.95rem' }}>{fmtDate(activeOffer.expiry_date)}</div>
                      </div>
                    )}
                    {activeOffer.response_remarks && (
                      <div style={{ gridColumn: '1 / -1', marginTop: '0.5rem', padding: '0.75rem', backgroundColor: 'var(--bg-surface-hover)', borderRadius: 'var(--radius-md)' }}>
                        <div className="filter-label">Response Remarks</div>
                        <div style={{ fontSize: '0.95rem', fontStyle: 'italic', marginTop: '0.25rem' }}>"{activeOffer.response_remarks}"</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Terms */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <h4 style={{ fontSize: '1rem', fontWeight: 600, borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Terms & Conditions</h4>
                  <div style={{ fontSize: '0.95rem', whiteSpace: 'pre-wrap', backgroundColor: 'var(--bg-surface-hover)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                    {activeOffer.terms_and_conditions || 'Standard company terms apply.'}
                  </div>
                </div>

              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setIsDetailModalOpen(false)}>Close</button>
              {canDownload && (
                <button className="btn-secondary" disabled={downloadingId === activeOffer.id} onClick={() => handleDownload(activeOffer)}>
                  {downloadingId === activeOffer.id ? 'Downloading...' : 'Download PDF'}
                </button>
              )}
              {activeOffer.offer_status === 'Draft' && canSend && (
                <button className="btn-primary" onClick={() => { setIsDetailModalOpen(false); openSendModal(activeOffer); }}>Send Offer</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ACTION MODALS */}
      {/* Send Modal */}
      {isSendModalOpen && activeOffer && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3>Send Offer Letter</h3>
              <button onClick={() => setIsSendModalOpen(false)} style={{ fontSize: '1.25rem', cursor: 'pointer', border: 'none', background: 'none' }}>&times;</button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to send offer <strong>{activeOffer.offer_code}</strong> to <strong>{candidateName(activeOffer.candidate)}</strong>?</p>
              <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>The offer status will change to "Sent" and an email notification will be triggered.</p>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setIsSendModalOpen(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSend} disabled={actionLoading}>{actionLoading ? 'Sending...' : 'Confirm Send'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Respond Modal */}
      {isRespondModalOpen && activeOffer && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3>{respondAction === 'accept' ? 'Accept Offer' : respondAction === 'reject' ? 'Reject Offer' : 'Withdraw Offer'}</h3>
              <button onClick={() => setIsRespondModalOpen(false)} style={{ fontSize: '1.25rem', cursor: 'pointer', border: 'none', background: 'none' }}>&times;</button>
            </div>
            <div className="modal-body">
              <p>Record {respondAction} for offer <strong>{activeOffer.offer_code}</strong>.</p>
              <div className="filter-group" style={{ marginTop: '1rem' }}>
                <label className="filter-label">Remarks {respondAction === 'reject' && '*'}</label>
                <textarea rows="3" value={remarks} onChange={(e) => setRemarks(e.target.value)} className="form-control" placeholder={`Reason for ${respondAction}...`} />
                {remarksError && <p style={{ color: 'red', fontSize: '0.75rem', marginTop: '0.25rem' }}>{remarksError}</p>}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setIsRespondModalOpen(false)}>Cancel</button>
              <button className={respondAction === 'accept' ? 'btn-success' : respondAction === 'reject' ? 'btn-danger' : 'btn-secondary'} onClick={handleRespond} disabled={actionLoading}>
                {actionLoading ? 'Processing...' : `Confirm ${respondAction}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {isDeleteModalOpen && activeOffer && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3 style={{ color: 'var(--badge-danger)' }}>Delete Offer Letter</h3>
              <button onClick={() => setIsDeleteModalOpen(false)} style={{ fontSize: '1.25rem', cursor: 'pointer', border: 'none', background: 'none' }}>&times;</button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to permanently delete offer <strong>{activeOffer.offer_code}</strong>?</p>
              <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>This action cannot be undone.</p>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setIsDeleteModalOpen(false)}>Cancel</button>
              <button className="btn-danger" onClick={handleDelete} disabled={actionLoading}>{actionLoading ? 'Deleting...' : 'Delete Permanently'}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default OfferLetters;
