import React, { useState, useEffect, useCallback } from 'react';
import reportService from '../../services/reportService';
import leaveService from '../../services/leaveService';
import departmentService from '../../services/departmentService';
import { useAuthContext } from '../../context/AuthContext';
import { IconDownload, IconFilter } from '../../components/common/Icons';
import CustomSelect from '../../components/common/CustomSelect';
import { formatDate } from '../../utils/dateUtils';


export default function LeaveReport() {
  const { user } = useAuthContext();
  const [reportData, setReportData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  // Determine role scoping
  const isHR = user?.roles?.some(r => ['Super Admin', 'HR Admin', 'HR Executive'].includes(r));
  const isManager = user?.roles?.includes('Manager');
  const canFilterEmployeeOrDept = isHR || isManager;

  const [filters, setFilters] = useState({
    from_date: '',
    to_date: '',
    status: '',
    leave_type_id: '',
    department_id: '',
    employee_id: '',
  });

  const [pagination, setPagination] = useState({
    currentPage: 1,
    lastPage: 1,
    total: 0,
    perPage: 15,
  });

  // Load Leave Types and Departments
  useEffect(() => {
    const fetchDropdowns = async () => {
      try {
        const promises = [
          leaveService.getLeaveTypes?.().catch(err => {
            console.error('Failed to load leave types:', err);
            return [];
          }),
        ];

        if (canFilterEmployeeOrDept) {
          promises.push(
            departmentService.getDepartments?.().catch(err => {
              console.error('Failed to load departments:', err);
              return [];
            })
          );
        }

        const [typesRes, deptsRes] = await Promise.all(promises);

        if (typesRes) {
          setLeaveTypes(typesRes?.data || typesRes || []);
        }
        if (deptsRes) {
          setDepartments(deptsRes?.data || deptsRes || []);
        }
      } catch (err) {
        console.error('Failed to load dropdown options:', err);
      }
    };

    fetchDropdowns();
  }, [canFilterEmployeeOrDept]);

  const fetchReport = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = { page, per_page: pagination.perPage };
      if (filters.from_date) params.from_date = filters.from_date;
      if (filters.to_date) params.to_date = filters.to_date;
      if (filters.status) params.status = filters.status;
      if (filters.leave_type_id) params.leave_type_id = filters.leave_type_id;
      if (filters.department_id) params.department_id = filters.department_id;
      if (filters.employee_id) params.employee_id = filters.employee_id;

      const res = await reportService.getLeaveReport(params);
      setReportData(res.data || []);
      setSummary(res.summary || null);
      setPagination({
        currentPage: res.meta?.current_page || 1,
        lastPage: res.meta?.last_page || 1,
        total: res.meta?.total || 0,
        perPage: res.meta?.per_page || 15,
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load leave report.');
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
      if (filters.from_date) params.from_date = filters.from_date;
      if (filters.to_date) params.to_date = filters.to_date;
      if (filters.status) params.status = filters.status;
      if (filters.leave_type_id) params.leave_type_id = filters.leave_type_id;
      if (filters.department_id) params.department_id = filters.department_id;
      if (filters.employee_id) params.employee_id = filters.employee_id;

      const blob = await reportService.exportLeaveReport(params);
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `leave_report_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to export leave report CSV.');
    } finally {
      setExporting(false);
    }
  };

  const renderStatusBadge = (status) => {
    let badgeClass = 'badge-secondary';
    if (status === 'Approved') badgeClass = 'badge-success';
    else if (status === 'Manager Approved') badgeClass = 'badge-info';
    else if (status === 'Pending') badgeClass = 'badge-warning';
    else if (status === 'Rejected') badgeClass = 'badge-danger';
    else if (status === 'Cancelled') badgeClass = 'badge-secondary';

    return <span className={`badge ${badgeClass}`}>{status}</span>;
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title">Leave Reports</h1>
          <p className="page-subtitle">
            {isHR
              ? 'Organization-wide leave analytics, application statuses, leave type distributions, and balances'
              : isManager
              ? 'Team leave requests, approvals tracking, and duration reports'
              : 'Personal leave applications history, approved days, and balances'}
          </p>
        </div>
        <div>
          <button
            onClick={handleExportCSV}
            disabled={exporting || loading}
            className="btn-primary"
            id="export-leave-csv-btn"
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
              Total Requests
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
              {summary.total_requests || 0}
            </div>
          </div>

          <div className="dashboard-card" style={{ padding: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Approved Requests
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10b981', marginTop: '0.25rem' }}>
              {summary.approved_requests || 0}
            </div>
          </div>

          <div className="dashboard-card" style={{ padding: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Pending / In-Review
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f59e0b', marginTop: '0.25rem' }}>
              {(summary.pending_requests || 0) + (summary.manager_approved_requests || 0)}
            </div>
          </div>

          <div className="dashboard-card" style={{ padding: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Rejected Requests
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ef4444', marginTop: '0.25rem' }}>
              {summary.rejected_requests || 0}
            </div>
          </div>

          <div className="dashboard-card" style={{ padding: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Total Days Taken
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary-color)', marginTop: '0.25rem' }}>
              {summary.total_days_taken || 0} days
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
              value={filters.from_date}
              onChange={(e) => setFilters(prev => ({ ...prev, from_date: e.target.value }))}
              className="filter-input"
              id="filter-leave-from-date"
            />
          </div>

          <div className="filter-group">
            <label className="filter-label">Date To</label>
            <input
              type="date"
              value={filters.to_date}
              onChange={(e) => setFilters(prev => ({ ...prev, to_date: e.target.value }))}
              className="filter-input"
              id="filter-leave-to-date"
            />
          </div>

          <div className="filter-group">
            <label className="filter-label">Status</label>
            <CustomSelect
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
              className="filter-select"
              id="filter-leave-status"
            >
              <option value="">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Manager Approved">Manager Approved</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
              <option value="Cancelled">Cancelled</option>
            </CustomSelect>
          </div>

          <div className="filter-group">
            <label className="filter-label">Leave Type</label>
            <CustomSelect
              value={filters.leave_type_id}
              onChange={(e) => setFilters(prev => ({ ...prev, leave_type_id: e.target.value }))}
              className="filter-select"
              id="filter-leave-type"
            >
              <option value="">All Leave Types</option>
              {leaveTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </CustomSelect>
          </div>

          {canFilterEmployeeOrDept && (
            <div className="filter-group">
              <label className="filter-label">Department</label>
              <CustomSelect
                value={filters.department_id}
                onChange={(e) => setFilters(prev => ({ ...prev, department_id: e.target.value }))}
                className="filter-select"
                id="filter-leave-department"
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
              onClick={() => setFilters({ from_date: '', to_date: '', status: '', leave_type_id: '', department_id: '', employee_id: '' })}
              className="btn-secondary"
              id="reset-leave-filters-btn"
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
            <h3>Loading leave records...</h3>
            <p>Fetching filtered leave report dataset</p>
          </div>
        ) : reportData.length === 0 ? (
          <div className="state-container">
            <h3>No leave records found</h3>
            <p>No leave applications match your selected criteria.</p>
          </div>
        ) : (
          <div>
            <table className="data-table" id="leave-report-table">
              <thead>
                <tr>
                  <th>Request ID</th>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Leave Type</th>
                  <th>Dates (From - To)</th>
                  <th>Days</th>
                  <th>Status</th>
                  <th>Manager Review</th>
                  <th>HR Review</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {reportData.map((req) => (
                  <tr key={req.id}>
                    <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                      #{req.id}
                    </td>
                    <td>
                      {req.employee ? (
                        <div>
                          <div style={{ fontWeight: 600 }}>{req.employee.first_name} {req.employee.last_name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{req.employee.employee_code}</div>
                        </div>
                      ) : '-'}
                    </td>
                    <td>
                      {req.employee?.department?.name || '—'}
                    </td>
                    <td>
                      <span style={{ fontWeight: 500 }}>{req.leave_type?.name || '—'}</span>
                    </td>
                    <td style={{ fontSize: '0.825rem', whiteSpace: 'nowrap' }}>
                      {formatDate(req.from_date)} <span style={{ color: 'var(--text-muted)' }}>to</span> {formatDate(req.to_date)}
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--primary-color)' }}>
                      {req.number_of_days} {req.number_of_days === 1 ? 'day' : 'days'}
                    </td>
                    <td>
                      {renderStatusBadge(req.status)}
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>
                      {req.manager ? (
                        <div>
                          <div style={{ fontWeight: 500 }}>{req.manager.first_name} {req.manager.last_name}</div>
                          {req.manager_remarks && <div style={{ fontSize: '0.725rem', color: 'var(--text-secondary)' }}>"{req.manager_remarks}"</div>}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>
                      {req.reviewer ? (
                        <div>
                          <div style={{ fontWeight: 500 }}>{req.reviewer.name}</div>
                          {req.hr_remarks && <div style={{ fontSize: '0.725rem', color: 'var(--text-secondary)' }}>"{req.hr_remarks}"</div>}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', maxWidth: '200px' }}>
                      {req.reason || '—'}
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
                  id="leave-pagination-prev-btn"
                >
                  Previous
                </button>
                <button
                  disabled={pagination.currentPage >= pagination.lastPage}
                  onClick={() => fetchReport(pagination.currentPage + 1)}
                  className="pagination-btn"
                  id="leave-pagination-next-btn"
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
