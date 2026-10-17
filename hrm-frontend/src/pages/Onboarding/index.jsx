import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../constants/routes';
import { getOnboardings, startOnboarding } from '../../services/onboardingService';
import { getOfferLetters } from '../../services/offerLetterService';
import { useAuthContext } from '../../context/AuthContext';
import CustomSelect from '../../components/common/CustomSelect';

const OnboardingList = () => {
  const navigate = useNavigate();
  const { user, hasRole, hasPermission } = useAuthContext();
  const canStartOnboarding = hasRole('Super Admin') || hasRole('HR Admin') || hasPermission('recruitment.onboarding.create');

  const [onboardings, setOnboardings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  // Start Onboarding Modal State
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  const [acceptedOffers, setAcceptedOffers] = useState([]);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [selectedOfferId, setSelectedOfferId] = useState('');
  const [startingOnboarding, setStartingOnboarding] = useState(false);
  const [startModalError, setStartModalError] = useState('');

  // Pagination
  const [pagination, setPagination] = useState({
    currentPage: 1,
    lastPage: 1,
    total: 0,
    perPage: 15,
  });

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [activeTab, setActiveTab] = useState('All');

  const fetchOnboardings = async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, per_page: pagination.perPage };
      if (search.trim()) params.search = search.trim();
      
      const appliedStatus = activeTab !== 'All' ? activeTab : statusFilter;
      if (appliedStatus) params.status = appliedStatus;

      const response = await getOnboardings(params);
      
      const dataList = response?.data?.data || [];
      setOnboardings(dataList);
      
      setPagination({
        currentPage: response?.data?.current_page || 1,
        lastPage: response?.data?.last_page || 1,
        total: response?.data?.total || 0,
        perPage: response?.data?.per_page || 15,
      });
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load onboarding records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOnboardings(1);
  }, [search, statusFilter, activeTab]);

  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => setSuccessMessage(''), 5000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.lastPage) {
      fetchOnboardings(newPage);
    }
  };

  const handleOpenStartModal = async () => {
    setIsStartModalOpen(true);
    setSelectedOfferId('');
    setStartModalError('');
    setLoadingOffers(true);
    try {
      const res = await getOfferLetters({ status: 'Accepted' });
      const offers = res?.data?.data || res?.data || [];
      setAcceptedOffers(Array.isArray(offers) ? offers : []);
    } catch (err) {
      setStartModalError(err?.response?.data?.message || 'Failed to load accepted offer letters.');
    } finally {
      setLoadingOffers(false);
    }
  };

  const selectedOffer = useMemo(() => {
    return acceptedOffers.find((o) => String(o.id) === String(selectedOfferId));
  }, [acceptedOffers, selectedOfferId]);

  const handleStartOnboardingSubmit = async (e) => {
    e.preventDefault();
    if (!selectedOfferId) {
      setStartModalError('Please select an Accepted Offer Letter.');
      return;
    }
    setStartingOnboarding(true);
    setStartModalError('');
    try {
      const response = await startOnboarding(selectedOfferId);
      const candName = selectedOffer?.candidate?.full_name || 
        (selectedOffer?.candidate?.first_name ? `${selectedOffer.candidate.first_name} ${selectedOffer.candidate.last_name || ''}`.trim() : 'Candidate');
      setSuccessMessage(response?.data?.message || `Onboarding started successfully for ${candName}.`);
      setIsStartModalOpen(false);
      fetchOnboardings(1);
    } catch (err) {
      setStartModalError(err?.response?.data?.message || 'Failed to start onboarding.');
    } finally {
      setStartingOnboarding(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Completed': return <span className="status-badge status-active">{status}</span>;
      case 'In Progress': return <span className="status-badge status-info">{status}</span>;
      case 'Cancelled': return <span className="status-badge status-inactive">{status}</span>;
      case 'Not Started':
      default: return <span className="status-badge status-warning">{status}</span>;
    }
  };

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="header-content">
          <h1>Employee Onboarding</h1>
          <p>Track new hires from accepted offer through active employee.</p>
        </div>
        {canStartOnboarding && (
          <button 
            className="btn btn-primary"
            onClick={handleOpenStartModal}
            id="start-onboarding-btn"
          >
            + Start Onboarding
          </button>
        )}
      </div>

      {successMessage && (
        <div style={{ backgroundColor: '#ecfdf5', color: '#065f46', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', border: '1px solid #a7f3d0' }}>
          {successMessage}
        </div>
      )}

      <div className="filters-bar" style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '240px', maxWidth: '400px' }}>
          <svg 
            width="18"
            height="18"
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
          >
            <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            className="filter-input"
            style={{ paddingLeft: '2.25rem', width: '100%' }}
            placeholder="Search candidate by name, code or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <CustomSelect
          className="filter-select"
          style={{ width: 'auto', minWidth: '160px' }}
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setActiveTab('All');
          }}
        >
          <option value="">All Statuses</option>
          <option value="Not Started">Not Started</option>
          <option value="In Progress">In Progress</option>
          <option value="Completed">Completed</option>
          <option value="Cancelled">Cancelled</option>
        </CustomSelect>
      </div>

      <div className="tab-navigation">
        {['All', 'Not Started', 'In Progress', 'Completed', 'Cancelled'].map((tab) => (
          <button
            key={tab}
            className={`tab-btn ${activeTab === tab && !statusFilter ? 'active' : ''}`}
            onClick={() => {
              setActiveTab(tab);
              setStatusFilter('');
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {error && <div className="alert-banner error">{error}</div>}

      <div className="table-container">
        {loading ? (
          <div className="state-container">
            <p>Loading records...</p>
          </div>
        ) : onboardings.length === 0 ? (
          <div className="state-container" style={{ padding: '3rem 1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
              <svg 
                width="48" 
                height="48" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="1.5" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                style={{ color: 'var(--text-muted)' }}
              >
                <path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <h3>No Onboarding Records Found</h3>
            <p>Start onboarding for a candidate by selecting an Accepted offer letter.</p>
            {canStartOnboarding && (
              <button 
                className="btn btn-primary"
                style={{ marginTop: '1rem' }}
                onClick={handleOpenStartModal}
              >
                + Start Onboarding
              </button>
            )}
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Offer / Job</th>
                  <th>Joining Date</th>
                  <th>Progress</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {onboardings.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <div className="font-medium">{record.candidate?.full_name}</div>
                      <div className="text-sm text-gray-500">{record.candidate?.email}</div>
                    </td>
                    <td>
                      <div className="font-medium">{record.offer_letter?.offer_code}</div>
                      <div className="text-sm text-gray-500">{record.offer_letter?.designation || record.offer_letter?.job_opening?.title}</div>
                    </td>
                    <td>
                      {new Date(record.joining_date).toLocaleDateString()}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '100px', backgroundColor: '#e2e8f0', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                           <div style={{ width: `${record.progress_percentage}%`, backgroundColor: record.progress_percentage === 100 ? '#10b981' : '#075E4B', height: '100%' }}></div>
                        </div>
                        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>{record.progress_percentage}%</span>
                      </div>
                    </td>
                    <td>{getStatusBadge(record.status)}</td>
                    <td>
                      <div className="action-buttons">
                        <button 
                          className="btn btn-secondary btn-sm"
                          onClick={() => navigate(ROUTES.ONBOARDING_DETAILS.replace(':id', record.id))}
                        >
                          Manage
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && onboardings.length > 0 && pagination.lastPage > 1 && (
          <div className="pagination-bar">
            <span className="pagination-info">
              Showing page {pagination.currentPage} of {pagination.lastPage} ({pagination.total} total)
            </span>
            <div className="pagination-btns">
              <button 
                className="pagination-btn" 
                disabled={pagination.currentPage === 1}
                onClick={() => handlePageChange(pagination.currentPage - 1)}
              >
                Previous
              </button>
              <button 
                className="pagination-btn" 
                disabled={pagination.currentPage === pagination.lastPage}
                onClick={() => handlePageChange(pagination.currentPage + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Start Onboarding Modal */}
      {isStartModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '560px' }}>
            <div className="modal-header">
              <h3>Start Onboarding</h3>
              <button 
                onClick={() => setIsStartModalOpen(false)}
                style={{ fontSize: '1.25rem', cursor: 'pointer', border: 'none', background: 'none', color: 'var(--text-muted)' }}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleStartOnboardingSubmit}>
              <div className="modal-body">
                {startModalError && (
                  <div style={{ backgroundColor: '#fef2f2', color: '#991b1b', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', border: '1px solid #fecaca', fontSize: '0.875rem' }}>
                    {startModalError}
                  </div>
                )}

                <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                    Select Accepted Offer Letter <span style={{ color: 'red' }}>*</span>
                  </label>
                  {loadingOffers ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Loading accepted offers...</p>
                  ) : acceptedOffers.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No accepted offer letters available for onboarding.</p>
                  ) : (
                    <CustomSelect
                      className="filter-select"
                      style={{ width: '100%', padding: '0.625rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)' }}
                      value={selectedOfferId}
                      onChange={(e) => setSelectedOfferId(e.target.value)}
                      required
                    >
                      <option value="">-- Choose an Accepted Offer --</option>
                      {acceptedOffers.map((offer) => {
                        const candName = offer.candidate?.full_name || `${offer.candidate?.first_name || ''} ${offer.candidate?.last_name || ''}`.trim();
                        const candCode = offer.candidate?.candidate_code || '';
                        const jobTitle = offer.job_opening?.title || offer.jobOpening?.title || offer.designation || '';
                        return (
                          <option key={offer.id} value={offer.id}>
                            {offer.offer_code} — {candName} {candCode ? `(${candCode})` : ''} [{jobTitle}]
                          </option>
                        );
                      })}
                    </CustomSelect>
                  )}
                </div>

                {selectedOffer && (
                  <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface-hover)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '0.5rem' }}>
                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Offer Details Preview
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.8125rem' }}>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Candidate: </span>
                        <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                          {selectedOffer.candidate?.full_name || `${selectedOffer.candidate?.first_name || ''} ${selectedOffer.candidate?.last_name || ''}`.trim()}
                        </span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Candidate Code: </span>
                        <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                          {selectedOffer.candidate?.candidate_code || '—'}
                        </span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Job Opening: </span>
                        <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                          {selectedOffer.job_opening?.title || selectedOffer.jobOpening?.title || '—'}
                        </span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Designation: </span>
                        <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                          {selectedOffer.designation || '—'}
                        </span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Joining Date: </span>
                        <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                          {selectedOffer.joining_date ? new Date(selectedOffer.joining_date).toLocaleDateString() : '—'}
                        </span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Department: </span>
                        <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                          {selectedOffer.department?.name || selectedOffer.job_opening?.department?.name || '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', padding: '1rem 1.25rem', borderTop: '1px solid var(--border-color)' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsStartModalOpen(false)}
                  disabled={startingOnboarding}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!selectedOfferId || startingOnboarding}
                >
                  {startingOnboarding ? 'Starting...' : 'Start Onboarding'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default OnboardingList;
