import React, { useState, useEffect, useCallback } from 'react';
import reportService from '../../services/reportService';
import departmentService from '../../services/departmentService';
import { useAuthContext } from '../../context/AuthContext';
import { IconDownload, IconFilter } from '../../components/common/Icons';
import CustomSelect from '../../components/common/CustomSelect';

export default function AttendanceReport() {
  const { user } = useAuthContext();
  const [reportData, setReportData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  // Determine user scoping
  const isHR = user?.roles?.some(r => ['Super Admin', 'HR Admin', 'HR Executive'].includes(r));
  const isManager = user?.roles?.includes('Manager');
  const canFilterEmployeeOrDept = isHR || isManager;

  const [filters, setFilters] = useState({
    date_from: '',
    date_to: '',
    status: '',
    department_id: '',
    employee_id: '',
  });

  const [pagination, setPagination] = useState({
    currentPage: 1,
    lastPage: 1,
    total: 0,
    perPage: 15,
  });

  // Fetch departments for filter dropdown if authorized
  useEffect(() => {
    if (canFilterEmployeeOrDept) {
      departmentService.getDepartments?.()
        .then(res => setDepartments(res?.data || res || []))
        .catch(err => console.error('Failed to load departments:', err));
    }
  }, [canFilterEmployeeOrDept]);

  const fetchReport = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = { page, per_page: pagination.perPage };
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;
      if (filters.status) params.status = filters.status;
      if (filters.department_id) params.department_id = filters.department_id;
      if (filters.employee_id) params.employee_id = filters.employee_id;

      const res = await reportService.getAttendanceReport(params);
      setReportData(res.data || []);
      setSummary(res.summary || null);
      setPagination({
        currentPage: res.meta?.current_page || 1,
        lastPage: res.meta?.last_page || 1,
        total: res.meta?.total || 0,
        perPage: res.meta?.per_page || 15,
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load attendance report.');
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.perPage]);

  useEffect(() => {
    fetchReport(1);
  }, [fetchReport]);

  const handleExportCSV = async () => {
    setExporting(true);
    setError('');
    try {
      const params = {};
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;
      if (filters.status) params.status = filters.status;
      if (filters.department_id) params.department_id = filters.department_id;
      if (filters.employee_id) params.employee_id = filters.employee_id;

      const blob = await reportService.exportAttendanceReport(params);
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `attendance_report_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to export attendance report CSV.');
    } finally {
      setExporting(false);
    }
  };

  const formatWorkingHours = (minutes) => {
    if (!minutes && minutes !== 0) return '0h 0m';
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hrs}h ${mins}m`;
  };

  const renderStatusBadge = (status) => {
    const badgeClass =
      status === 'Present'
        ? 'badge-success'
        : status === 'Late'
        ? 'badge-warning'
        : status === 'Half Day'
        ? 'badge-warning'
        : 'badge-secondary';
    return <span className={`badge ${badgeClass}`}>{status}</span>;
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title">Attendance Reports</h1>
          <p className="page-subtitle">
            {isHR
              ? 'Company-wide attendance metrics, work durations, late tracking, and overtime analysis'
              : isManager
              ? 'Team attendance logs, work hours, and punctual status'
              : 'Personal attendance history, hours worked, and overtime records'}
          </p>
        </div>
        <div>
          <button
            onClick={handleExportCSV}
            disabled={exporting || loading}
            className="btn-primary"
            id="export-attendance-csv-btn"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <IconDownload style={{ width: '16px', height: '16px' }} />
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: '1.25rem' }}>
          {error}
        </div>
      )}

      {/* Summary Stat Cards */}
      {summary && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          <div className="dashboard-card" style={{ padding: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Total Logs
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
              {summary.total_records || 0}
            </div>
          </div>

          <div className="dashboard-card" style={{ padding: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Total Working Hours
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary-color)', marginTop: '0.25rem' }}>
              {summary.total_working_hours || 0} hrs
            </div>
          </div>

          <div className="dashboard-card" style={{ padding: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Present Days
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10b981', marginTop: '0.25rem' }}>
              {summary.present_count || 0}
            </div>
          </div>

          <div className="dashboard-card" style={{ padding: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Late Arrivals
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f59e0b', marginTop: '0.25rem' }}>
              {summary.late_count || 0}
            </div>
          </div>

          <div className="dashboard-card" style={{ padding: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Half Days
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#6366f1', marginTop: '0.25rem' }}>
              {summary.half_day_count || 0}
            </div>
          </div>

          <div className="dashboard-card" style={{ padding: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Overtime Hours
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#8b5cf6', marginTop: '0.25rem' }}>
              {summary.total_overtime_hours || 0} hrs
            </div>
          </div>
        </div>
      )}

      {/* Filters Card */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          <IconFilter style={{ width: '16px', height: '16px' }} />
          <span>Report Filters</span>
        </div>

        <div className="filters-bar" style={{ padding: 0, background: 'none' }}>
          <div className="filter-group">
            <label className="filter-label">Date From</label>
            <input
              type="date"
              value={filters.date_from}
              onChange={(e) => setFilters(prev => ({ ...prev, date_from: e.target.value }))}
              className="filter-input"
              id="filter-date-from"
            />
          </div>

          <div className="filter-group">
            <label className="filter-label">Date To</label>
            <input
              type="date"
              value={filters.date_to}
              onChange={(e) => setFilters(prev => ({ ...prev, date_to: e.target.value }))}
              className="filter-input"
              id="filter-date-to"
            />
          </div>

          <div className="filter-group">
            <label className="filter-label">Status</label>
            <CustomSelect
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
              className="filter-select"
              id="filter-status"
            >
              <option value="">All Statuses</option>
              <option value="Present">Present</option>
              <option value="Late">Late</option>
              <option value="Half Day">Half Day</option>
            </CustomSelect>
          </div>

          {canFilterEmployeeOrDept && (
            <div className="filter-group">
              <label className="filter-label">Department</label>
              <CustomSelect
                value={filters.department_id}
                onChange={(e) => setFilters(prev => ({ ...prev, department_id: e.target.value }))}
                className="filter-select"
                id="filter-department"
              >
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </CustomSelect>
            </div>
          )}

          <div className="filter-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              onClick={() => setFilters({ date_from: '', date_to: '', status: '', department_id: '', employee_id: '' })}
              className="btn-secondary"
              id="reset-filters-btn"
              style={{ width: '100%' }}
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* Report Table */}
      <div className="table-container" style={{ margin: 0 }}>
        {loading ? (
          <div className="state-container">
            <h3>Loading report records...</h3>
            <p>Fetching filtered attendance dataset</p>
          </div>
        ) : reportData.length === 0 ? (
          <div className="state-container">
            <h3>No attendance records found</h3>
            <p>No records match your selected criteria.</p>
          </div>
        ) : (
          <div>
            <table className="data-table" id="attendance-report-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Check In</th>
                  <th>Check Out</th>
                  <th>Working Duration</th>
                  <th>Overtime</th>
                  <th>Status</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {reportData.map((log) => (
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
                    <td>
                      {log.employee?.department?.name || '—'}
                    </td>
                    <td style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                      {log.check_in ? new Date(log.check_in).toLocaleTimeString() : '—'}
                    </td>
                    <td style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                      {log.check_out ? new Date(log.check_out).toLocaleTimeString() : '—'}
                    </td>
                    <td style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: 'var(--primary-color)', fontWeight: 600 }}>
                      {formatWorkingHours(log.working_minutes)}
                    </td>
                    <td style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: log.overtime_minutes > 0 ? '#8b5cf6' : 'var(--text-muted)', fontWeight: log.overtime_minutes > 0 ? 600 : 400 }}>
                      {log.overtime_minutes > 0 ? formatWorkingHours(log.overtime_minutes) : '—'}
                    </td>
                    <td>
                      {renderStatusBadge(log.status)}
                    </td>
                    <td style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
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
                  onClick={() => fetchReport(pagination.currentPage - 1)}
                  className="pagination-btn"
                  id="pagination-prev-btn"
                >
                  Previous
                </button>
                <button
                  disabled={pagination.currentPage >= pagination.lastPage}
                  onClick={() => fetchReport(pagination.currentPage + 1)}
                  className="pagination-btn"
                  id="pagination-next-btn"
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
}
