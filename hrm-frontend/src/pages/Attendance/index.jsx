import React, { useState, useEffect, useCallback, useRef } from 'react';
import attendanceService from '../../services/attendanceService';
import { useAuthContext } from '../../context/AuthContext';
import CustomSelect from '../../components/common/CustomSelect';
import AlertBanner from '../../components/common/AlertBanner';
import { mapAttendanceError } from '../../utils/attendanceErrorMapper';
import CorrectionRequestModal from './CorrectionRequestModal';
import CorrectionHistoryModal from './CorrectionHistoryModal';
import ReviewerActionModal from './ReviewerActionModal';

const Attendance = () => {
  const { user, employeeId } = useAuthContext();
  const [todayData, setTodayData] = useState(null);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const messageIdRef = useRef(0);
  const [message, setMessage] = useState({ id: 0, type: '', text: '' });

  const showBanner = useCallback((type, text) => {
    setMessage({ id: ++messageIdRef.current, type, text });
  }, []);

  const clearBanner = useCallback(() => {
    setMessage({ id: 0, type: '', text: '' });
  }, []);
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());
  const [remarks, setRemarks] = useState('');

  // Role permissions
  const canViewAll = user?.roles?.some(r => ['Super Admin', 'HR Admin', 'HR Executive', 'Manager', 'Finance/Payroll Admin'].includes(r));
  const isReviewer = user?.roles?.some(r => ['Super Admin', 'HR Admin', 'HR Executive', 'Manager'].includes(r));
  const isHRReviewer = user?.roles?.some(r => ['Super Admin', 'HR Admin', 'HR Executive'].includes(r));

  // Tabs: 'mine' | 'all' | 'my_corrections' | 'reviewer_queue'
  const [activeTab, setActiveTab] = useState('mine');

  // Attendance History Filters
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

  // Correction Request State
  const [selectedSessionForCorrection, setSelectedSessionForCorrection] = useState(null);
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);

  // My Corrections State
  const [myCorrections, setMyCorrections] = useState([]);
  const [myCorrectionsLoading, setMyCorrectionsLoading] = useState(false);
  const [myCorrectionsStatusFilter, setMyCorrectionsStatusFilter] = useState('');

  // Reviewer Queue State
  const [reviewerQueue, setReviewerQueue] = useState([]);
  const [reviewerQueueLoading, setReviewerQueueLoading] = useState(false);
  const [reviewerQueueStatusFilter, setReviewerQueueStatusFilter] = useState('');

  // History Detail Modal
  const [selectedCorrectionForHistory, setSelectedCorrectionForHistory] = useState(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  // Reviewer Action Modal
  const [activeReviewerAction, setActiveReviewerAction] = useState(null); // { type: 'approve'|'reject'|'escalate', correction }

  // Authoritative linked employee identity from user context (if present)
  const currentEmployeeId = employeeId ?? user?.employee_id ?? user?.employee?.id ?? null;

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

  const fetchHistory = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const params = { page };
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;
      if (filters.status) params.status = filters.status;
      if (activeTab === 'all' && canViewAll) {
        params.scope = 'all';
      } else {
        params.scope = 'mine';
      }

      const data = await attendanceService.getAttendanceList(params);
      setHistoryLogs(data.data || []);
      setPagination({
        currentPage: data.current_page || 1,
        lastPage: data.last_page || 1,
        total: data.total || 0,
      });
    } catch (err) {
      showBanner('error', mapAttendanceError(err, { action: 'fetch', fallback: 'Failed to fetch attendance history.' }));
    } finally {
      setLoading(false);
    }
  }, [filters, activeTab, canViewAll, showBanner]);

  const fetchMyCorrections = useCallback(async () => {
    setMyCorrectionsLoading(true);
    try {
      const params = {};
      if (myCorrectionsStatusFilter) {
        params.status = myCorrectionsStatusFilter;
      }
      const res = await attendanceService.getMyAttendanceCorrections(params);
      setMyCorrections(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      showBanner('error', mapAttendanceError(err, { action: 'fetch', fallback: 'Failed to fetch correction requests.' }));
    } finally {
      setMyCorrectionsLoading(false);
    }
  }, [myCorrectionsStatusFilter, showBanner]);

  const fetchReviewerQueue = useCallback(async () => {
    setReviewerQueueLoading(true);
    try {
      const params = {};
      if (reviewerQueueStatusFilter) {
        params.status = reviewerQueueStatusFilter;
      }
      const res = await attendanceService.getPendingAttendanceCorrections(params);
      setReviewerQueue(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      if (err.response?.status === 403) {
        setReviewerQueue([]);
      } else {
        showBanner('error', mapAttendanceError(err, { action: 'fetch', fallback: 'Failed to fetch reviewer queue.' }));
      }
    } finally {
      setReviewerQueueLoading(false);
    }
  }, [reviewerQueueStatusFilter, showBanner]);

  useEffect(() => {
    fetchTodayState();
  }, [fetchTodayState]);

  useEffect(() => {
    if (activeTab === 'mine' || activeTab === 'all') {
      fetchHistory(1);
    } else if (activeTab === 'my_corrections') {
      fetchMyCorrections();
    } else if (activeTab === 'reviewer_queue' && isReviewer) {
      fetchReviewerQueue();
    }
  }, [activeTab, fetchHistory, fetchMyCorrections, fetchReviewerQueue, isReviewer]);

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
        () => resolve(metadata),
        { timeout: 5000 }
      );
    });
  };

  const handleCheckIn = async () => {
    setActionLoading(true);
    clearBanner();
    try {
      const metadata = await getMetadata();
      const res = await attendanceService.checkIn({ remarks, ...metadata });
      showBanner('success', res.message || 'Checked in successfully.');
      setTodayData(res.attendance);
      fetchHistory(1);
      setRemarks('');
    } catch (err) {
      let latestToday = todayData;
      if (!latestToday) {
        try {
          const refreshed = await attendanceService.getTodayState();
          latestToday = refreshed?.today_attendance ?? null;
          if (latestToday) setTodayData(latestToday);
        } catch {
          // Keep existing state when fallback refresh fails
        }
      }
      showBanner(
        'error',
        mapAttendanceError(err, {
          action: 'check_in',
          attendanceState: latestToday,
          fallback: 'Check-in failed.',
        })
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOut = async () => {
    setActionLoading(true);
    clearBanner();
    try {
      const metadata = await getMetadata();
      const res = await attendanceService.checkOut({ remarks, ...metadata });
      showBanner('success', res.message || 'Checked out successfully.');
      setTodayData(res.attendance);
      fetchHistory(1);
      setRemarks('');
    } catch (err) {
      let latestToday = todayData;
      if (!latestToday) {
        try {
          const refreshed = await attendanceService.getTodayState();
          latestToday = refreshed?.today_attendance ?? null;
          if (latestToday) setTodayData(latestToday);
        } catch {
          // Keep existing state when fallback refresh fails
        }
      }
      showBanner(
        'error',
        mapAttendanceError(err, {
          action: 'check_out',
          attendanceState: latestToday,
          fallback: 'Check-out failed.',
        })
      );
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

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'Present':
        return <span className="badge badge-success">Present</span>;
      case 'Late':
        return <span className="badge badge-warning">Late</span>;
      case 'Half Day':
        return <span className="badge badge-warning">Half Day</span>;
      case 'On Leave':
        return <span className="badge badge-info">On Leave</span>;
      case 'Holiday':
        return <span className="badge badge-neutral">Holiday</span>;
      case 'Weekly Off':
        return <span className="badge badge-neutral">Weekly Off</span>;
      case 'Absent':
        return <span className="badge badge-danger">Absent</span>;
      default:
        return <span className="badge badge-neutral">{status || 'Not Marked'}</span>;
    }
  };

  const renderCorrectionStatusBadge = (status) => {
    switch (status) {
      case 'Approved':
        return <span className="badge badge-success">Approved</span>;
      case 'Rejected':
        return <span className="badge badge-danger">Rejected</span>;
      case 'Escalated':
        return <span className="badge badge-warning">Escalated to HR</span>;
      case 'Pending':
      default:
        return <span className="badge badge-info">Pending Review</span>;
    }
  };

  const handleOpenCorrection = (session) => {
    setSelectedSessionForCorrection(session);
    setIsCorrectionModalOpen(true);
  };

  const handleCorrectionSuccess = (successMsg) => {
    showBanner('success', successMsg);
    fetchMyCorrections();
    fetchHistory(pagination.currentPage || 1);
  };

  const handleReviewerActionSuccess = (successMsg) => {
    showBanner('success', successMsg);
    fetchReviewerQueue();
    fetchHistory(pagination.currentPage || 1);
    fetchTodayState();
    if (activeTab === 'my_corrections') {
      fetchMyCorrections();
    }
  };

  const formatDateTimeDisplay = (dtStr) => {
    if (!dtStr) return '-';
    const d = new Date(dtStr);
    return isNaN(d.getTime()) ? dtStr : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Attendance Management</h1>
          <p className="page-subtitle">
            Track daily check-ins, check-outs, working duration, attendance logs, and correction workflows.
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
      <AlertBanner
        type={message.type || 'info'}
        message={message.text}
        triggerKey={message.id}
        onClose={clearBanner}
        style={{ marginBottom: 0 }}
      />

      {/* Daily Punch Card */}
      <div className="detail-card">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem', alignItems: 'center' }}>
          {/* Status Column */}
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.5rem' }}>
              Today's Status
            </span>
            <div>
              {renderStatusBadge(todayData?.status)}
            </div>
            <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div>Check-In: <strong style={{ color: 'var(--text-primary)' }}>{todayData?.check_in ? new Date(todayData.check_in).toLocaleTimeString() : '--:--'}</strong></div>
              <div>Check-Out: <strong style={{ color: 'var(--text-primary)' }}>{todayData?.check_out ? new Date(todayData.check_out).toLocaleTimeString() : '--:--'}</strong></div>
              <div>Duration: <strong style={{ color: 'var(--primary-color)' }}>{formatWorkingTime(todayData?.working_minutes)}</strong></div>
            </div>
            {todayData?.id && (
              <div style={{ marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                  onClick={() => handleOpenCorrection(todayData)}
                >
                  Request Correction for Today
                </button>
              </div>
            )}
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
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', alignItems: 'center' }}>
            <button
              onClick={handleCheckIn}
              disabled={actionLoading || Boolean(todayData && todayData.check_in !== null && todayData.check_out === null)}
              className="btn-success"
              style={{ minWidth: '130px' }}
            >
              {actionLoading ? 'Processing...' : 'Punch In'}
            </button>
            <button
              onClick={handleCheckOut}
              disabled={actionLoading || !todayData || !todayData.check_in || todayData.check_out !== null}
              className="btn-danger"
              style={{ minWidth: '130px' }}
            >
              {actionLoading ? 'Processing...' : 'Punch Out'}
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="tabs-container">
        <button
          className={`tab-item ${activeTab === 'mine' ? 'active' : ''}`}
          onClick={() => setActiveTab('mine')}
        >
          My Attendance
        </button>

        <button
          className={`tab-item ${activeTab === 'my_corrections' ? 'active' : ''}`}
          onClick={() => setActiveTab('my_corrections')}
        >
          My Correction Requests
          {myCorrections.length > 0 && (
            <span style={{
              marginLeft: '0.5rem',
              backgroundColor: 'var(--primary-color)',
              color: 'white',
              borderRadius: '9999px',
              padding: '0.1rem 0.45rem',
              fontSize: '0.7rem',
              fontWeight: 600,
            }}>
              {myCorrections.length}
            </span>
          )}
        </button>

        {canViewAll && (
          <button
            className={`tab-item ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All Employees Attendance
          </button>
        )}

        {isReviewer && (
          <button
            className={`tab-item ${activeTab === 'reviewer_queue' ? 'active' : ''}`}
            onClick={() => setActiveTab('reviewer_queue')}
          >
            Reviewer Queue
            {reviewerQueue.length > 0 && (
              <span style={{
                marginLeft: '0.5rem',
                backgroundColor: '#ef4444',
                color: 'white',
                borderRadius: '9999px',
                padding: '0.1rem 0.45rem',
                fontSize: '0.7rem',
                fontWeight: 600,
              }}>
                {reviewerQueue.length}
              </span>
            )}
          </button>
        )}
      </div>

      {/* TAB 1 & 2: ATTENDANCE HISTORY (MINE & ALL) */}
      {(activeTab === 'mine' || activeTab === 'all') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Filters Bar */}
          <div className="filters-bar">
            <div className="filter-group">
              <label className="filter-label">From Date</label>
              <input
                type="date"
                value={filters.date_from}
                onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
                className="filter-input"
              />
            </div>

            <div className="filter-group">
              <label className="filter-label">To Date</label>
              <input
                type="date"
                value={filters.date_to}
                onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
                className="filter-input"
              />
            </div>

            <div className="filter-group">
              <label className="filter-label">Status</label>
              <CustomSelect
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="filter-select"
              >
                <option value="">All Statuses</option>
                <option value="Present">Present</option>
                <option value="Late">Late</option>
                <option value="Half Day">Half Day</option>
                <option value="On Leave">On Leave</option>
                <option value="Holiday">Holiday</option>
                <option value="Weekly Off">Weekly Off</option>
                <option value="Absent">Absent</option>
              </CustomSelect>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', alignSelf: 'flex-end', marginBottom: '0.25rem' }}>
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: '0.85rem' }}
                onClick={() => setFilters({ date_from: '', date_to: '', status: '' })}
              >
                Reset
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="table-container" style={{ margin: 0 }}>
            {loading ? (
              <div className="state-container">
                <h3>Loading attendance records...</h3>
                <p>Please wait while we fetch your attendance history.</p>
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
                      <th>Status</th>
                      <th>Remarks</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
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
                          {log.check_in ? new Date(log.check_in).toLocaleTimeString() : '-'}
                        </td>
                        <td style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                          {log.check_out ? new Date(log.check_out).toLocaleTimeString() : '-'}
                        </td>
                        <td style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: 'var(--primary-color)', fontWeight: 600 }}>
                          {formatWorkingTime(log.working_minutes)}
                        </td>
                        <td>
                          {renderStatusBadge(log.status)}
                        </td>
                        <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          {log.remarks || '-'}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {activeTab === 'mine' ? (
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                              onClick={() => handleOpenCorrection(log)}
                              title="Request attendance correction for this session"
                            >
                              Request Correction
                            </button>
                          ) : currentEmployeeId !== null && Number(log.employee_id) === Number(currentEmployeeId) ? (
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                              onClick={() => handleOpenCorrection(log)}
                              title="Request attendance correction for this session"
                            >
                              Request Correction
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>-</span>
                          )}
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
        </div>
      )}

      {/* TAB 3: MY CORRECTIONS */}
      {activeTab === 'my_corrections' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* My Corrections Filters */}
          <div className="filters-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <div className="filter-group" style={{ margin: 0 }}>
                <label className="filter-label">Filter by Status</label>
                <CustomSelect
                  value={myCorrectionsStatusFilter}
                  onChange={(e) => setMyCorrectionsStatusFilter(e.target.value)}
                  className="filter-select"
                >
                  <option value="">All Statuses</option>
                  <option value="Pending">Pending</option>
                  <option value="Escalated">Escalated</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                </CustomSelect>
              </div>
            </div>
            <div>
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: '0.85rem' }}
                onClick={fetchMyCorrections}
                disabled={myCorrectionsLoading}
              >
                {myCorrectionsLoading ? 'Refreshing...' : 'Refresh List'}
              </button>
            </div>
          </div>

          {/* Corrections Table */}
          <div className="table-container" style={{ margin: 0 }}>
            {myCorrectionsLoading ? (
              <div className="state-container">
                <h3>Loading correction requests...</h3>
                <p>Fetching your attendance correction history</p>
              </div>
            ) : myCorrections.length === 0 ? (
              <div className="state-container">
                <h3>No correction requests found</h3>
                <p>You have not submitted any attendance correction requests matching this filter.</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Original Times</th>
                    <th>Requested Times</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Reviewer Remarks</th>
                    <th>Submitted At</th>
                    <th style={{ textAlign: 'right' }}>Audit</th>
                  </tr>
                </thead>
                <tbody>
                  {myCorrections.map((corr) => (
                    <tr key={corr.id}>
                      <td style={{ fontWeight: 600 }}>
                        {corr.attendance_date || '-'}
                      </td>
                      <td style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                        {formatDateTimeDisplay(corr.original_check_in)} &rarr; {formatDateTimeDisplay(corr.original_check_out)}
                      </td>
                      <td style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: 'var(--primary-color)', fontWeight: 600 }}>
                        {formatDateTimeDisplay(corr.requested_check_in)} &rarr; {formatDateTimeDisplay(corr.requested_check_out)}
                      </td>
                      <td style={{ fontSize: '0.85rem', maxWidth: '240px' }}>
                        <div>{corr.reason}</div>
                        {corr.evidence_details && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                            Ref: {corr.evidence_details}
                          </div>
                        )}
                      </td>
                      <td>
                        {renderCorrectionStatusBadge(corr.status)}
                      </td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {corr.hr_remarks || corr.manager_remarks || (corr.escalation_reason ? `Escalated: ${corr.escalation_reason}` : '-')}
                      </td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {corr.created_at ? new Date(corr.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                          onClick={() => {
                            setSelectedCorrectionForHistory(corr);
                            setIsHistoryModalOpen(true);
                          }}
                        >
                          View History
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

      {/* TAB 4: REVIEWER QUEUE */}
      {activeTab === 'reviewer_queue' && isReviewer && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Reviewer Queue Filters & Controls */}
          <div className="filters-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <div className="filter-group" style={{ margin: 0 }}>
                <label className="filter-label">Filter Actionable Status</label>
                <CustomSelect
                  value={reviewerQueueStatusFilter}
                  onChange={(e) => setReviewerQueueStatusFilter(e.target.value)}
                  className="filter-select"
                >
                  <option value="">All Actionable (Pending & Escalated)</option>
                  <option value="Pending">Pending Only</option>
                  <option value="Escalated">Escalated Only</option>
                </CustomSelect>
              </div>
            </div>
            <div>
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: '0.85rem' }}
                onClick={fetchReviewerQueue}
                disabled={reviewerQueueLoading}
              >
                {reviewerQueueLoading ? 'Refreshing...' : 'Refresh Queue'}
              </button>
            </div>
          </div>

          {/* Reviewer Queue Table */}
          <div className="table-container" style={{ margin: 0 }}>
            {reviewerQueueLoading ? (
              <div className="state-container">
                <h3>Loading reviewer queue...</h3>
                <p>Fetching actionable attendance correction requests</p>
              </div>
            ) : reviewerQueue.length === 0 ? (
              <div className="state-container">
                <h3>Reviewer queue is empty</h3>
                <p>No actionable attendance correction requests require your review.</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Attendance Date</th>
                    <th>Original Times</th>
                    <th>Requested Times</th>
                    <th>Reason / Details</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Review Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewerQueue.map((item) => {
                    const isSelf = currentEmployeeId !== null && Number(item.employee_id) === Number(currentEmployeeId);
                    const canEscalate = item.status === 'Pending' && !isHRReviewer && !isSelf;

                    return (
                      <tr key={item.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{item.employee_name || `Employee #${item.employee_id}`}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {item.employee_code} &bull; {item.department_name || `Dept #${item.department_id || '-'}`}
                          </div>
                        </td>
                        <td style={{ fontWeight: 500 }}>
                          {item.attendance_date}
                        </td>
                        <td style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                          {formatDateTimeDisplay(item.original_check_in)} &rarr; {formatDateTimeDisplay(item.original_check_out)}
                        </td>
                        <td style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: 'var(--primary-color)', fontWeight: 600 }}>
                          {formatDateTimeDisplay(item.requested_check_in)} &rarr; {formatDateTimeDisplay(item.requested_check_out)}
                        </td>
                        <td style={{ fontSize: '0.85rem', maxWidth: '240px' }}>
                          <div>{item.reason}</div>
                          {item.evidence_details && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                              Ref: {item.evidence_details}
                            </div>
                          )}
                          {item.status === 'Escalated' && item.escalation_reason && (
                            <div style={{ fontSize: '0.75rem', color: '#b45309', marginTop: '0.25rem', fontStyle: 'italic' }}>
                              Escalation Note: {item.escalation_reason}
                            </div>
                          )}
                        </td>
                        <td>
                          {renderCorrectionStatusBadge(item.status)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {isSelf ? (
                            <span className="badge badge-neutral" style={{ fontSize: '0.75rem' }}>
                              Self Request (Action Disabled)
                            </span>
                          ) : (
                            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                              <button
                                type="button"
                                className="btn-success"
                                style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                                onClick={() => setActiveReviewerAction({ type: 'approve', correction: item })}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className="btn-danger"
                                style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                                onClick={() => setActiveReviewerAction({ type: 'reject', correction: item })}
                              >
                                Reject
                              </button>
                              {canEscalate && (
                                <button
                                  type="button"
                                  className="btn-warning"
                                  style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                                  onClick={() => setActiveReviewerAction({ type: 'escalate', correction: item })}
                                >
                                  Escalate
                                </button>
                              )}
                              <button
                                type="button"
                                className="btn-secondary"
                                style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem' }}
                                onClick={() => {
                                  setSelectedCorrectionForHistory(item);
                                  setIsHistoryModalOpen(true);
                                }}
                                title="View History Timeline"
                              >
                                Audit
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* MODALS */}
      <CorrectionRequestModal
        isOpen={isCorrectionModalOpen}
        onClose={() => {
          setIsCorrectionModalOpen(false);
          setSelectedSessionForCorrection(null);
        }}
        onSuccess={handleCorrectionSuccess}
        session={selectedSessionForCorrection}
      />

      <CorrectionHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => {
          setIsHistoryModalOpen(false);
          setSelectedCorrectionForHistory(null);
        }}
        correction={selectedCorrectionForHistory}
      />

      <ReviewerActionModal
        isOpen={Boolean(activeReviewerAction)}
        onClose={() => setActiveReviewerAction(null)}
        onSuccess={handleReviewerActionSuccess}
        actionType={activeReviewerAction?.type}
        correction={activeReviewerAction?.correction}
      />
    </div>
  );
};

export default Attendance;
