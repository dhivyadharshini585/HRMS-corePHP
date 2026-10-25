import React, { useState, useEffect, useCallback, useMemo } from 'react';
import attendanceService from '../../services/attendanceService';
import { useAuthContext } from '../../context/AuthContext';
import CustomSelect from '../../components/common/CustomSelect';
import AlertBanner from '../../components/common/AlertBanner';
import useAutoDismiss from '../../hooks/useAutoDismiss';

const Attendance = () => {
  const { user } = useAuthContext();
  const [todayData, setTodayData] = useState(null);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage, clearMessage] = useAutoDismiss({ type: '', text: '' });
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());
  const [remarks, setRemarks] = useState('');

  // Role permissions
  const isManager = Boolean(user?.roles?.includes('Manager') || user?.role === 'Manager');
  const canReview = isManager;
  const canViewAll = Boolean(
    user?.roles?.some(r => ['Super Admin', 'HR Admin', 'HR Executive', 'Manager', 'Finance/Payroll Admin'].includes(r)) ||
    ['Super Admin', 'HR Admin', 'HR Executive', 'Manager', 'Finance/Payroll Admin'].includes(user?.role)
  );

  // Tabs: 'mine' | 'my_corrections' | 'all' | 'pending_corrections'
  const [activeTab, setActiveTab] = useState('mine');

  // Filters for attendance logs
  const [filters, setFilters] = useState({
    date_from: '',
    date_to: '',
    status: '',
  });

  const [pagination, setPagination] = useState({
    currentPage: 1,
    lastPage: 1,
    total: 0,
  });

  // Correction request states
  const [myCorrections, setMyCorrections] = useState([]);
  const [reviewCorrections, setReviewCorrections] = useState([]);
  const [reviewStatusFilter, setReviewStatusFilter] = useState('Pending');
  const [pendingReviewCount, setPendingReviewCount] = useState(0);

  // Modal states
  const [correctionModalOpen, setCorrectionModalOpen] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedCorrection, setSelectedCorrection] = useState(null);

  // Employee Submission Form State
  const [reportedCheckOut, setReportedCheckOut] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [evidenceDetails, setEvidenceDetails] = useState('');
  const [evidenceFile, setEvidenceFile] = useState(null);
  const [submitError, setSubmitError] = useState('');

  // Manager Review Form State
  const [approvedCheckOut, setApprovedCheckOut] = useState('');
  const [managerRemarks, setManagerRemarks] = useState('');
  const [reviewError, setReviewError] = useState('');

  // Live Digital Clock
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchTodayState = useCallback(async () => {
    try {
      const data = await attendanceService.getTodayState();
      setTodayData(data.today_attendance);
    } catch (err) {
      console.error('Failed to fetch today attendance state:', err);
    }
  }, []);

  const fetchMyCorrections = useCallback(async () => {
    try {
      const res = await attendanceService.getCorrectionRequests({ scope: 'mine' });
      setMyCorrections(res.data || []);
    } catch (err) {
      console.error('Failed to fetch personal corrections:', err);
    }
  }, []);

  const fetchReviewCorrections = useCallback(async (status = '') => {
    if (!canReview) return;
    try {
      const params = { scope: 'review' };
      if (status) params.status = status;
      const res = await attendanceService.getCorrectionRequests(params);
      setReviewCorrections(res.data || []);
      // Also update pending count if fetching without status filter or pending
      if (!status || status === 'Pending') {
        const pendingItems = (res.data || []).filter(item => item.status === 'Pending');
        setPendingReviewCount(pendingItems.length);
      }
    } catch (err) {
      console.error('Failed to fetch reviewer corrections queue:', err);
    }
  }, [canReview]);

  const fetchHistory = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = { page };
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;
      if (filters.status) params.status = filters.status;
      let data;
      if (activeTab === 'mine') {
        params.scope = 'mine';
        data = await attendanceService.getMyAttendance(params);
      } else {
        params.scope = 'all';
        data = await attendanceService.getAttendanceList(params);
      }

      setHistoryLogs(data.data || []);
      setPagination({
        currentPage: data.current_page || 1,
        lastPage: data.last_page || 1,
        total: data.total || 0,
      });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to fetch attendance history.' });
    } finally {
      setLoading(false);
    }
  }, [filters, activeTab]);

  // Ensure non-managers cannot stay on pending_corrections tab
  useEffect(() => {
    if (!canReview && activeTab === 'pending_corrections') {
      setActiveTab('mine');
    }
  }, [canReview, activeTab]);

  useEffect(() => {
    fetchTodayState();
    fetchMyCorrections();
    if (canReview) {
      fetchReviewCorrections();
    }
  }, [fetchTodayState, fetchMyCorrections, fetchReviewCorrections, canReview]);

  useEffect(() => {
    if (activeTab === 'mine' || activeTab === 'all') {
      fetchHistory(1);
    } else if (activeTab === 'my_corrections') {
      fetchMyCorrections();
    } else if (activeTab === 'pending_corrections') {
      fetchReviewCorrections(reviewStatusFilter);
    }
  }, [activeTab, fetchHistory, fetchMyCorrections, fetchReviewCorrections, reviewStatusFilter]);

  const getMetadata = async () => {
    return new Promise((resolve) => {
      const metadata = { device: navigator.userAgent };
      if (!navigator.geolocation) {
        resolve(metadata);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          metadata.latitude = position.coords.latitude;
          metadata.longitude = position.coords.longitude;
          resolve(metadata);
        },
        () => resolve(metadata), // Proceed without GPS if denied or error
        { timeout: 5000 }
      );
    });
  };

  const handleCheckIn = async () => {
    setActionLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const metadata = await getMetadata();
      const res = await attendanceService.checkIn({ remarks, ...metadata });
      setMessage({ type: 'success', text: res.message || 'Checked in successfully.' });
      setTodayData(res.attendance);
      fetchHistory(1);
      setRemarks('');
    } catch (err) {
      const resData = err.response?.data;
      if (resData?.requires_resolution) {
        setTodayData(resData.unresolved_attendance);
        setMessage({
          type: 'error',
          text: resData.message || 'Previous attendance session requires checkout correction resolution before checking in again.'
        });
      } else {
        setMessage({ type: 'error', text: resData?.message || 'Check-in failed.' });
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOut = async () => {
    setActionLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const metadata = await getMetadata();
      const res = await attendanceService.checkOut({ remarks, ...metadata });
      setMessage({ type: 'success', text: res.message || 'Checked out successfully.' });
      setTodayData(res.attendance);
      fetchHistory(1);
      setRemarks('');
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Check-out failed.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Open correction submission modal
  const openCorrectionModal = (prefillAttendance = null) => {
    setSubmitError('');
    const targetAtt = prefillAttendance || todayData;
    // Suggest a default checkout time: checkin + 8 hours formatted for datetime-local
    if (targetAtt?.check_in) {
      const checkInDate = new Date(targetAtt.check_in);
      checkInDate.setHours(checkInDate.getHours() + 8);
      // Format to YYYY-MM-DDTHH:mm
      const pad = (n) => String(n).padStart(2, '0');
      const formatted = `${checkInDate.getFullYear()}-${pad(checkInDate.getMonth() + 1)}-${pad(checkInDate.getDate())}T${pad(checkInDate.getHours())}:${pad(checkInDate.getMinutes())}`;
      setReportedCheckOut(formatted);
    } else {
      setReportedCheckOut('');
    }
    setCorrectionReason('');
    setEvidenceDetails('');
    setEvidenceFile(null);
    setCorrectionModalOpen(true);
  };

  // Handle employee submission
  const handleSubmitCorrection = async (e) => {
    e.preventDefault();
    setSubmitError('');

    if (!reportedCheckOut) {
      setSubmitError('Please specify your reported check-out date and time.');
      return;
    }
    if (!correctionReason.trim()) {
      setSubmitError('A reason for the missed check-out is mandatory.');
      return;
    }

    setActionLoading(true);
    try {
      const formData = new FormData();
      if (todayData?.id) {
        formData.append('attendance_id', todayData.id);
      }
      // Format reportedCheckOut to YYYY-MM-DD HH:mm:ss
      const formattedDateTime = reportedCheckOut.replace('T', ' ') + (reportedCheckOut.length === 16 ? ':00' : '');
      formData.append('requested_check_out', formattedDateTime);
      formData.append('reason', correctionReason.trim());
      if (evidenceDetails.trim()) {
        formData.append('evidence_details', evidenceDetails.trim());
      }
      if (evidenceFile) {
        formData.append('evidence_file', evidenceFile);
      }

      const res = await attendanceService.submitCorrectionRequest(formData);
      setMessage({ type: 'success', text: res.message || 'Correction request submitted for manager review.' });
      setCorrectionModalOpen(false);
      fetchTodayState();
      fetchMyCorrections();
    } catch (err) {
      setSubmitError(err.response?.data?.message || 'Failed to submit correction request.');
    } finally {
      setActionLoading(false);
    }
  };

  // Open manager review modal
  const openReviewModal = (correction) => {
    setSelectedCorrection(correction);
    setReviewError('');
    setManagerRemarks('');
    // Pre-fill manager's final checkout time with employee's requested time
    if (correction?.requested_check_out) {
      const d = new Date(correction.requested_check_out);
      const pad = (n) => String(n).padStart(2, '0');
      const formatted = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      setApprovedCheckOut(formatted);
    } else {
      setApprovedCheckOut('');
    }
    setReviewModalOpen(true);
  };

  // Handle manager approval
  const handleApproveCorrection = async () => {
    if (!selectedCorrection) return;
    setReviewError('');

    if (!approvedCheckOut) {
      setReviewError('Please confirm the final approved check-out datetime.');
      return;
    }

    setActionLoading(true);
    try {
      const formattedDateTime = approvedCheckOut.replace('T', ' ') + (approvedCheckOut.length === 16 ? ':00' : '');
      const res = await attendanceService.approveCorrectionRequest(selectedCorrection.id, {
        approved_check_out: formattedDateTime,
        remarks: managerRemarks.trim(),
      });
      setMessage({ type: 'success', text: res.message || 'Correction approved and attendance session updated.' });
      setReviewModalOpen(false);
      fetchTodayState();
      fetchReviewCorrections(reviewStatusFilter);
      fetchHistory(1);
    } catch (err) {
      setReviewError(err.response?.data?.message || 'Failed to approve correction request.');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle manager rejection
  const handleRejectCorrection = async () => {
    if (!selectedCorrection) return;
    setReviewError('');

    if (!managerRemarks.trim()) {
      setReviewError('A mandatory rejection explanation/reason is required.');
      return;
    }

    setActionLoading(true);
    try {
      const res = await attendanceService.rejectCorrectionRequest(selectedCorrection.id, {
        remarks: managerRemarks.trim(),
      });
      setMessage({ type: 'success', text: res.message || 'Correction request rejected. Session remains open for resubmission.' });
      setReviewModalOpen(false);
      fetchTodayState();
      fetchReviewCorrections(reviewStatusFilter);
    } catch (err) {
      setReviewError(err.response?.data?.message || 'Failed to reject correction request.');
    } finally {
      setActionLoading(false);
    }
  };

  const formatWorkingTime = (minutes) => {
    if (!minutes && minutes !== 0) return '-';
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hrs}h ${mins}m`;
  };

  const formatDateTime = (dtStr) => {
    if (!dtStr) return '--:--';
    const d = new Date(dtStr);
    return isNaN(d.getTime()) ? dtStr : d.toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  };

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'Present':
        return <span className="badge badge-success">Present</span>;
      case 'Late':
        return <span className="badge badge-warning">Late</span>;
      case 'Half Day':
        return <span className="badge badge-danger">Half Day</span>;
      default:
        return <span className="badge badge-neutral">{status || 'Not Checked In'}</span>;
    }
  };

  const renderCorrectionBadge = (status) => {
    switch (status) {
      case 'Pending':
        return (
          <span className="badge" style={{ backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>
            Pending Review
          </span>
        );
      case 'Approved':
        return (
          <span className="badge badge-success">
            Approved
          </span>
        );
      case 'Rejected':
        return (
          <span className="badge badge-danger">
            Rejected
          </span>
        );
      default:
        return null;
    }
  };

  // Computed preview of duration for the review modal
  const reviewDurationPreview = useMemo(() => {
    if (!selectedCorrection || !approvedCheckOut) return null;
    const checkInStr = selectedCorrection.original_check_in || selectedCorrection.attendance?.check_in;
    if (!checkInStr) return null;

    const inTime = new Date(checkInStr).getTime();
    const outTime = new Date(approvedCheckOut).getTime();
    if (isNaN(inTime) || isNaN(outTime) || outTime <= inTime) return null;

    const diffMinutes = Math.round((outTime - inTime) / (1000 * 60));
    return formatWorkingTime(diffMinutes);
  }, [selectedCorrection, approvedCheckOut]);

  // Determine if employee currently has an unresolved attendance session
  const hasUnresolvedSession = Boolean(
    todayData &&
    todayData.check_in !== null &&
    todayData.check_out === null &&
    todayData.requires_resolution
  );

  const activeCorrection = todayData?.correction_request;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Attendance Management</h1>
          <p className="page-subtitle">
            Track daily check-ins, check-outs, verified working hours, and missed checkout corrections.
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary-color)' }}>
            {currentTime}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>
      </div>

      {/* Alert Messages */}
      {message.text && (
        <AlertBanner
          type={message.type}
          message={message.text}
          onClose={clearMessage}
        />
      )}

      {/* Unresolved Session Resolution Banner */}
      {hasUnresolvedSession && (
        <div style={{
          padding: '1.25rem',
          borderRadius: 'var(--radius-md)',
          backgroundColor: activeCorrection?.status === 'Rejected' ? '#fff1f2' : '#fefce8',
          border: `1px solid ${activeCorrection?.status === 'Rejected' ? '#fecdd3' : '#fef08a'}`,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.25rem' }}>⚠️</span>
                <strong style={{ fontSize: '1rem', color: activeCorrection?.status === 'Rejected' ? '#9f1239' : '#854d0e' }}>
                  Unresolved Missed Check-Out Session
                </strong>
                {activeCorrection && renderCorrectionBadge(activeCorrection.status)}
              </div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                You have an unclosed attendance session from <strong>{formatDateTime(todayData.check_in)}</strong>.
                New check-ins are blocked until this previous session is verified and resolved.
              </p>
            </div>
            <div>
              {activeCorrection?.status === 'Pending' ? (
                <span className="badge" style={{ backgroundColor: '#fef3c7', color: '#92400e', padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}>
                  ⏳ Correction Request Pending Manager Review
                </span>
              ) : activeCorrection?.status === 'Rejected' ? (
                <button
                  onClick={() => openCorrectionModal(todayData)}
                  className="btn-danger"
                  style={{ padding: '0.5rem 1rem' }}
                >
                  Resubmit Correction Request
                </button>
              ) : (
                <button
                  onClick={() => openCorrectionModal(todayData)}
                  className="btn-primary"
                  style={{ padding: '0.5rem 1rem' }}
                >
                  Submit Missed Check-Out Correction
                </button>
              )}
            </div>
          </div>

          {/* If there's an active correction, show its details */}
          {activeCorrection && (
            <div style={{
              backgroundColor: 'rgba(255, 255, 255, 0.7)',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.85rem',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '0.75rem',
              border: '1px solid rgba(0,0,0,0.05)'
            }}>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem' }}>Reported Check-Out:</span>
                <strong>{formatDateTime(activeCorrection.requested_check_out)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem' }}>Reason Provided:</span>
                <span>{activeCorrection.reason}</span>
              </div>
              {activeCorrection.status === 'Rejected' && (
                <div style={{ gridColumn: '1 / -1', color: '#9f1239' }}>
                  <span style={{ fontWeight: 600, display: 'block', fontSize: '0.75rem' }}>Manager Rejection Reason:</span>
                  <span>{activeCorrection.remarks || 'No specific explanation provided'}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Today Action Card */}
      <div className="detail-card">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', alignItems: 'center' }}>
          {/* Status Column */}
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.5rem' }}>
              Today's Status
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {renderStatusBadge(todayData?.status)}
              {todayData?.correction_request && renderCorrectionBadge(todayData.correction_request.status)}
            </div>
            <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div>Check-In: <strong style={{ color: 'var(--text-primary)' }}>{todayData?.check_in ? formatDateTime(todayData.check_in) : '--:--'}</strong></div>
              <div>Check-Out: <strong style={{ color: 'var(--text-primary)' }}>{todayData?.check_out ? formatDateTime(todayData.check_out) : '--:--'}</strong></div>
              <div>Duration: <strong style={{ color: 'var(--primary-color)' }}>{formatWorkingTime(todayData?.working_minutes)}</strong></div>
            </div>
          </div>

          {/* Remarks Column */}
          <div className="form-group">
            <label className="form-label" htmlFor="attendance_remarks">
              Optional Remarks
            </label>
            <input
              id="attendance_remarks"
              type="text"
              placeholder="Work location, notes..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="form-control"
            />
          </div>

          {/* Actions Column */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'flex-end', alignItems: 'center' }}>
            <button
              onClick={handleCheckIn}
              disabled={actionLoading || Boolean(todayData && todayData.check_in !== null && todayData.check_out === null)}
              className="btn-success"
              style={{ padding: '0.6rem 1.25rem' }}
            >
              Check In
            </button>
            <button
              onClick={handleCheckOut}
              disabled={actionLoading || !todayData || todayData.check_in === null || todayData.check_out !== null}
              className="btn-primary"
              style={{ padding: '0.6rem 1.25rem' }}
            >
              Check Out
            </button>
            {/* Allow submitting missed checkout correction whenever an open session exists */}
            {todayData && todayData.check_in !== null && todayData.check_out === null && !activeCorrection && (
              <button
                onClick={() => openCorrectionModal(todayData)}
                className="btn-secondary"
                style={{ padding: '0.6rem 1rem', fontSize: '0.85rem' }}
              >
                Forgot to Check Out?
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="tab-navigation">
        <button
          onClick={() => setActiveTab('mine')}
          className={`tab-btn ${activeTab === 'mine' ? 'active' : ''}`}
        >
          My Attendance History
        </button>
        <button
          onClick={() => setActiveTab('my_corrections')}
          className={`tab-btn ${activeTab === 'my_corrections' ? 'active' : ''}`}
        >
          My Correction Requests {myCorrections.length > 0 && `(${myCorrections.length})`}
        </button>
        {canViewAll && (
          <button
            onClick={() => setActiveTab('all')}
            className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
          >
            All Attendance Directory
          </button>
        )}
        {canReview && (
          <button
            onClick={() => setActiveTab('pending_corrections')}
            className={`tab-btn ${activeTab === 'pending_corrections' ? 'active' : ''}`}
            style={{ position: 'relative' }}
          >
            Correction Approvals
            {pendingReviewCount > 0 && (
              <span style={{
                marginLeft: '0.5rem',
                backgroundColor: '#ef4444',
                color: 'white',
                borderRadius: '9999px',
                padding: '0.1rem 0.45rem',
                fontSize: '0.7rem',
                fontWeight: 700
              }}>
                {pendingReviewCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* TAB 1 & TAB 3: ATTENDANCE HISTORY (MINE OR ALL) */}
      {(activeTab === 'mine' || activeTab === 'all') && (
        <>
          {/* Filters Bar */}
          <div className="filters-bar">
            <div className="filter-group">
              <label className="filter-label">Status</label>
              <CustomSelect
                value={filters.status}
                onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                className="filter-select"
              >
                <option value="">All Statuses</option>
                <option value="Present">Present</option>
                <option value="Late">Late</option>
                <option value="Half Day">Half Day</option>
              </CustomSelect>
            </div>

            <div className="filter-group">
              <label className="filter-label">Date From</label>
              <input
                type="date"
                value={filters.date_from}
                onChange={(e) => setFilters(prev => ({ ...prev, date_from: e.target.value }))}
                className="filter-input"
              />
            </div>

            <div className="filter-group">
              <label className="filter-label">Date To</label>
              <input
                type="date"
                value={filters.date_to}
                onChange={(e) => setFilters(prev => ({ ...prev, date_to: e.target.value }))}
                className="filter-input"
              />
            </div>

            <div className="filter-group">
              <button
                onClick={() => setFilters({ date_from: '', date_to: '', status: '' })}
                className="btn-secondary"
                style={{ width: '100%' }}
              >
                Reset Filters
              </button>
            </div>
          </div>

          {/* History Table */}
          <div className="table-container" style={{ margin: 0 }}>
            {loading ? (
              <div className="state-container">
                <h3>Loading records...</h3>
                <p>Fetching attendance history logs</p>
              </div>
            ) : historyLogs.length === 0 ? (
              <div className="state-container">
                <h3>No attendance records found</h3>
                <p>No records match your selected criteria.</p>
              </div>
            ) : (
              <div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Employee</th>
                      <th>Check In</th>
                      <th>Check Out</th>
                      <th>Working Duration</th>
                      <th>Status & Correction</th>
                      <th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyLogs.map((log) => (
                      <tr key={log.id}>
                        <td style={{ fontWeight: 500 }}>
                          {log.attendance_date}
                        </td>
                        <td>
                          {log.employee ? (
                            <div>
                              <div style={{ fontWeight: 600 }}>{log.employee.first_name} {log.employee.last_name}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{log.employee.employee_code}</div>
                            </div>
                          ) : '-'}
                        </td>
                        <td style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                          {log.check_in ? formatDateTime(log.check_in) : '-'}
                        </td>
                        <td style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                          {log.check_out ? (
                            formatDateTime(log.check_out)
                          ) : (
                            <span style={{ color: '#dc2626', fontWeight: 500 }}>Not Checked Out</span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: 'var(--primary-color)', fontWeight: 600 }}>
                          {formatWorkingTime(log.working_minutes)}
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
                            {renderStatusBadge(log.status)}
                            {log.correction_status && renderCorrectionBadge(log.correction_status)}
                          </div>
                        </td>
                        <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          {log.remarks || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Pagination */}
                <div className="pagination-bar">
                  <span className="pagination-info">
                    Page {pagination.currentPage} of {pagination.lastPage} ({pagination.total} records total)
                  </span>
                  <div className="pagination-btns">
                    <button
                      disabled={pagination.currentPage <= 1}
                      onClick={() => fetchHistory(pagination.currentPage - 1)}
                      className="pagination-btn"
                    >
                      Previous
                    </button>
                    <button
                      disabled={pagination.currentPage >= pagination.lastPage}
                      onClick={() => fetchHistory(pagination.currentPage + 1)}
                      className="pagination-btn"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* TAB 2: MY CORRECTION REQUESTS */}
      {activeTab === 'my_corrections' && (
        <div className="table-container" style={{ margin: 0 }}>
          {myCorrections.length === 0 ? (
            <div className="state-container">
              <h3>No Correction Requests</h3>
              <p>You haven't submitted any missed check-out correction requests.</p>
              {hasUnresolvedSession && (
                <button
                  onClick={() => openCorrectionModal(todayData)}
                  className="btn-primary"
                  style={{ marginTop: '1rem' }}
                >
                  Submit Correction for Open Session
                </button>
              )}
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Session Date</th>
                  <th>Original Check-In</th>
                  <th>Reported Check-Out</th>
                  <th>Approved Check-Out</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Reviewer Comments</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {myCorrections.map((corr) => (
                  <tr key={corr.id}>
                    <td style={{ fontWeight: 500 }}>
                      {corr.attendance?.attendance_date || corr.attendance_date || '-'}
                    </td>
                    <td style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                      {formatDateTime(corr.requested_check_in || corr.original_check_in || corr.attendance?.check_in)}
                    </td>
                    <td style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                      {formatDateTime(corr.requested_check_out)}
                    </td>
                    <td style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: 'var(--primary-color)', fontWeight: 600 }}>
                      {corr.approved_check_out ? formatDateTime(corr.approved_check_out) : '—'}
                    </td>
                    <td style={{ fontSize: '0.85rem', maxWidth: '240px' }}>
                      {corr.reason}
                    </td>
                    <td>
                      {renderCorrectionBadge(corr.status)}
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {corr.remarks || '—'}
                    </td>
                    <td>
                      {corr.status === 'Rejected' && (
                        <button
                          onClick={() => openCorrectionModal(corr.attendance || { id: corr.attendance_id, check_in: corr.requested_check_in })}
                          className="btn-secondary"
                          style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem' }}
                        >
                          Resubmit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* TAB 4: MANAGER / HR CORRECTION VERIFICATION QUEUE */}
      {activeTab === 'pending_corrections' && canReview && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Filter sub-bar */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Filter by Status:</span>
            {['Pending', 'Approved', 'Rejected', ''].map((st) => (
              <button
                key={st || 'All'}
                onClick={() => setReviewStatusFilter(st)}
                className={`tab-btn ${reviewStatusFilter === st ? 'active' : ''}`}
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
              >
                {st || 'All'}
              </button>
            ))}
          </div>

          <div className="table-container" style={{ margin: 0 }}>
            {reviewCorrections.length === 0 ? (
              <div className="state-container">
                <h3>No Requests in Queue</h3>
                <p>There are no correction requests matching the selected filter.</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Original Check-In</th>
                    <th>Reported Check-Out</th>
                    <th>Reason</th>
                    <th>Evidence</th>
                    <th>History</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewCorrections.map((corr) => (
                    <tr key={corr.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>
                          {corr.employee?.first_name} {corr.employee?.last_name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {corr.employee?.employee_code} • {corr.employee?.department_name || 'General'}
                        </div>
                      </td>
                      <td style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                        {formatDateTime(corr.original_check_in || corr.requested_check_in || corr.attendance?.check_in)}
                      </td>
                      <td style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                        {formatDateTime(corr.requested_check_out)}
                      </td>
                      <td style={{ fontSize: '0.85rem', maxWidth: '220px' }}>
                        {corr.reason}
                      </td>
                      <td>
                        {corr.evidence_file ? (
                          <a
                            href={attendanceService.getEvidenceUrl(corr.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--primary-color)', textDecoration: 'underline', fontSize: '0.8rem', fontWeight: 600 }}
                          >
                            📎 View Evidence
                          </a>
                        ) : corr.evidence_details ? (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Note attached</span>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>None</span>
                        )}
                      </td>
                      <td>
                        {corr.review_history && corr.review_history.length > 0 ? (
                          <span style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: 600 }}>
                            ⚠️ {corr.review_history.length} prev. attempt(s)
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>First request</span>
                        )}
                      </td>
                      <td>
                        {renderCorrectionBadge(corr.status)}
                      </td>
                      <td>
                        <button
                          onClick={() => openReviewModal(corr)}
                          className={corr.status === 'Pending' ? 'btn-primary' : 'btn-secondary'}
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                        >
                          {corr.status === 'Pending' ? 'Review & Verify' : 'View Details'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* MODAL 1: EMPLOYEE CORRECTION SUBMISSION MODAL */}
      {correctionModalOpen && (
        <div className="modal-overlay" onClick={() => setCorrectionModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Submit Missed Check-Out Correction</h3>
              <button
                onClick={() => setCorrectionModalOpen(false)}
                style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-secondary)' }}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmitCorrection}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {submitError && (
                  <div className="alert-banner error" style={{ margin: 0 }}>
                    {submitError}
                  </div>
                )}

                {/* Session Reference Box */}
                <div style={{ backgroundColor: 'var(--bg-surface-secondary)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
                  <div>Original Check-In: <strong>{formatDateTime(todayData?.check_in)}</strong></div>
                  <div style={{ marginTop: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                    Please report the actual time you completed your work shift.
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="reported_checkout_input">
                    Reported Check-Out Date & Time <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    id="reported_checkout_input"
                    type="datetime-local"
                    value={reportedCheckOut}
                    onChange={(e) => setReportedCheckOut(e.target.value)}
                    required
                    className="form-control"
                  />
                  <small style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                    Must be after check-in time and not in the future.
                  </small>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="correction_reason_input">
                    Mandatory Reason for Missed Check-Out <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <textarea
                    id="correction_reason_input"
                    rows={3}
                    placeholder="Provide an explanation (e.g. power outage, emergency departure, technical issue...)"
                    value={correctionReason}
                    onChange={(e) => setCorrectionReason(e.target.value)}
                    required
                    className="form-control"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="evidence_details_input">
                    Supporting Evidence Notes (Optional)
                  </label>
                  <textarea
                    id="evidence_details_input"
                    rows={2}
                    placeholder="Reference emails, project manager confirmation, badge logs..."
                    value={evidenceDetails}
                    onChange={(e) => setEvidenceDetails(e.target.value)}
                    className="form-control"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="evidence_file_input">
                    Upload Supporting Evidence File (Optional)
                  </label>
                  <input
                    id="evidence_file_input"
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.txt"
                    onChange={(e) => setEvidenceFile(e.target.files[0] || null)}
                    className="form-control"
                    style={{ padding: '0.4rem' }}
                  />
                  <small style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                    Allowed: images, PDF, documents (Max 10MB). Stored securely outside public access.
                  </small>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setCorrectionModalOpen(false)}
                  className="btn-secondary"
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Submitting...' : 'Submit for Manager Approval'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: MANAGER / HR REVIEW & VERIFY MODAL */}
      {reviewModalOpen && selectedCorrection && (
        <div className="modal-overlay" onClick={() => setReviewModalOpen(false)}>
          <div className="modal-card" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Verify Missed Check-Out Request</h3>
              <button
                onClick={() => setReviewModalOpen(false)}
                style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-secondary)' }}
              >
                ✕
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {reviewError && (
                <div className="alert-banner error" style={{ margin: 0 }}>
                  {reviewError}
                </div>
              )}

              {/* Employee & Request Summary Box */}
              <div style={{ backgroundColor: 'var(--bg-surface-secondary)', padding: '1rem', borderRadius: 'var(--radius-md)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', fontSize: '0.85rem' }}>
                <div>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'block' }}>Employee</span>
                  <strong>{selectedCorrection.employee?.first_name} {selectedCorrection.employee?.last_name}</strong>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{selectedCorrection.employee?.employee_code} • {selectedCorrection.employee?.department_name || 'General'}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'block' }}>Original Check-In</span>
                  <strong>{formatDateTime(selectedCorrection.original_check_in || selectedCorrection.requested_check_in || selectedCorrection.attendance?.check_in)}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'block' }}>Employee-Reported Check-Out</span>
                  <strong style={{ color: 'var(--primary-color)' }}>{formatDateTime(selectedCorrection.requested_check_out)}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'block' }}>Current Request Status</span>
                  {renderCorrectionBadge(selectedCorrection.status)}
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'block' }}>Employee's Stated Reason</span>
                  <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-primary)' }}>{selectedCorrection.reason}</p>
                </div>
                {(selectedCorrection.evidence_details || selectedCorrection.evidence_file) && (
                  <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'block' }}>Supporting Evidence</span>
                    {selectedCorrection.evidence_details && (
                      <p style={{ margin: '0.2rem 0', color: 'var(--text-primary)' }}>{selectedCorrection.evidence_details}</p>
                    )}
                    {selectedCorrection.evidence_file && (
                      <a
                        href={attendanceService.getEvidenceUrl(selectedCorrection.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', padding: '0.35rem 0.75rem', marginTop: '0.35rem' }}
                      >
                        📎 Open Attached Evidence ({selectedCorrection.evidence_original_name || 'File'})
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* Previous Review History Timeline (if resubmitted) */}
              {selectedCorrection.review_history && selectedCorrection.review_history.length > 0 && (
                <div style={{ border: '1px solid #fed7aa', backgroundColor: '#fff7ed', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)' }}>
                  <strong style={{ fontSize: '0.85rem', color: '#c2410c', display: 'block', marginBottom: '0.5rem' }}>
                    Previous Review History
                  </strong>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {selectedCorrection.review_history.map((hist, idx) => (
                      <div key={hist.id || idx} style={{ fontSize: '0.8rem', paddingLeft: '0.5rem', borderLeft: '2px solid #ea580c' }}>
                        <div>
                          <strong>Attempt #{idx + 1} ({hist.status}):</strong> Reported checkout {formatDateTime(hist.requested_check_out)}
                        </div>
                        {hist.remarks && (
                          <div style={{ color: '#9a3412', marginTop: '0.15rem' }}>
                            Manager comment: "{hist.remarks}" by {hist.reviewer_name || 'Reviewer'} on {formatDateTime(hist.reviewed_at)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Reviewer Decision Controls (Enabled if status is Pending) */}
              {selectedCorrection.status === 'Pending' ? (
                <>
                  <div className="form-group">
                    <label className="form-label" htmlFor="approved_checkout_input">
                      Final Verified Check-Out Date & Time <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      id="approved_checkout_input"
                      type="datetime-local"
                      value={approvedCheckOut}
                      onChange={(e) => setApprovedCheckOut(e.target.value)}
                      className="form-control"
                      required
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem', fontSize: '0.75rem' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        You may approve the employee's reported time or select an adjusted verified time.
                      </span>
                      {reviewDurationPreview && (
                        <span style={{ color: 'var(--primary-color)', fontWeight: 600 }}>
                          Calculated Duration: {reviewDurationPreview}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="manager_remarks_input">
                      Manager Review Comments / Decision Explanation
                    </label>
                    <textarea
                      id="manager_remarks_input"
                      rows={3}
                      placeholder="Optional notes for approval; MANDATORY if rejecting..."
                      value={managerRemarks}
                      onChange={(e) => setManagerRemarks(e.target.value)}
                      className="form-control"
                    />
                    <small style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                      * Rejection strictly requires an explanation for the employee.
                    </small>
                  </div>
                </>
              ) : (
                <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
                  <div><strong>Review Decision:</strong> {selectedCorrection.status}</div>
                  {selectedCorrection.approved_check_out && (
                    <div>Final Approved Check-Out: <strong>{formatDateTime(selectedCorrection.approved_check_out)}</strong></div>
                  )}
                  {selectedCorrection.remarks && (
                    <div style={{ marginTop: '0.25rem' }}>Reviewer Remarks: <em>{selectedCorrection.remarks}</em></div>
                  )}
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    Reviewed by {selectedCorrection.reviewer?.name || selectedCorrection.reviewer_name || 'Reviewer'} on {formatDateTime(selectedCorrection.reviewed_at)}
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                onClick={() => setReviewModalOpen(false)}
                className="btn-secondary"
                disabled={actionLoading}
              >
                Close
              </button>

              {selectedCorrection.status === 'Pending' && (
                <>
                  <button
                    type="button"
                    onClick={handleRejectCorrection}
                    className="btn-danger"
                    disabled={actionLoading}
                  >
                    {actionLoading ? 'Processing...' : 'Reject Request'}
                  </button>
                  <button
                    type="button"
                    onClick={handleApproveCorrection}
                    className="btn-success"
                    disabled={actionLoading}
                  >
                    {actionLoading ? 'Processing...' : 'Approve with Selected Check-Out'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Attendance;
