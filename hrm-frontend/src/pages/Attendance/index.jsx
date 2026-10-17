import React, { useState, useEffect, useCallback } from 'react';
import attendanceService from '../../services/attendanceService';
import { useAuthContext } from '../../context/AuthContext';
import CustomSelect from '../../components/common/CustomSelect';

const Attendance = () => {
  const { user } = useAuthContext();
  const [todayData, setTodayData] = useState(null);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());
  const [remarks, setRemarks] = useState('');

  // Tab for HR/Admin/Manager users: 'mine' or 'all'
  const canViewAll = user?.roles?.some(r => ['Super Admin', 'HR Admin', 'HR Executive', 'Manager', 'Finance/Payroll Admin'].includes(r));
  const [activeTab, setActiveTab] = useState('mine');

  // Filters
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
      const params = { page };
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;
      if (filters.status) params.status = filters.status;
      if (activeTab === 'mine') {
        params.scope = 'mine';
      } else {
        params.scope = 'all';
      }

      const data = await attendanceService.getAttendanceList(params);
      setHistoryLogs(data.data || []);
      setPagination({
        currentPage: data.current_page || 1,
        lastPage: data.last_page || 1,
        total: data.total || 0,
      });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to fetch attendance history.' });
    }
  }, [filters, activeTab]);

  useEffect(() => {
    fetchTodayState();
  }, [fetchTodayState]);

  useEffect(() => {
    fetchHistory(1);
  }, [fetchHistory]);

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
      setMessage({ type: 'error', text: err.response?.data?.message || 'Check-in failed.' });
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

  const formatWorkingTime = (minutes) => {
    if (!minutes) return '-';
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
        return <span className="badge badge-danger">Half Day</span>;
      default:
        return <span className="badge badge-neutral">{status || 'Not Checked In'}</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Attendance Management</h1>
          <p className="page-subtitle">
            Track daily check-ins, check-outs, working duration, and attendance logs.
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
        <div className={`alert-banner ${message.type === 'success' ? 'success' : 'error'}`}>
          {message.text}
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
            <div>
              {renderStatusBadge(todayData?.status)}
            </div>
            <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div>Check-In: <strong style={{ color: 'var(--text-primary)' }}>{todayData?.check_in ? new Date(todayData.check_in).toLocaleTimeString() : '--:--'}</strong></div>
              <div>Check-Out: <strong style={{ color: 'var(--text-primary)' }}>{todayData?.check_out ? new Date(todayData.check_out).toLocaleTimeString() : '--:--'}</strong></div>
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
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', alignItems: 'center' }}>
            <button
              onClick={handleCheckIn}
              disabled={actionLoading || (todayData && todayData.check_in !== null)}
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
          </div>
        </div>
      </div>

      {/* Tabs */}
      {canViewAll && (
        <div className="tab-navigation">
          <button
            onClick={() => setActiveTab('mine')}
            className={`tab-btn ${activeTab === 'mine' ? 'active' : ''}`}
          >
            My Attendance History
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
          >
            All Attendance Directory
          </button>
        </div>
      )}

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
                  <th>Status</th>
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
    </div>
  );
};

export default Attendance;
