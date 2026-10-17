import React, { useState, useEffect, useCallback } from 'react';
import auditLogService from '../../services/auditLogService';
import CustomSelect from '../../components/common/CustomSelect';

const AuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters state
  const [filters, setFilters] = useState({
    action: '',
    date_from: '',
    date_to: '',
  });

  // Pagination state
  const [pagination, setPagination] = useState({
    currentPage: 1,
    lastPage: 1,
    total: 0,
  });

  // Detail Modal state
  const [selectedLog, setSelectedLog] = useState(null);

  const fetchLogs = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = { page };
      if (filters.action) params.action = filters.action;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;

      const data = await auditLogService.getLogs(params);
      setLogs(data.data || []);
      setPagination({
        currentPage: data.current_page || 1,
        lastPage: data.last_page || 1,
        total: data.total || 0,
      });
    } catch (err) {
      if (err.response?.status === 403) {
        setError('Unauthorized action. You do not have permission to view Audit Logs.');
      } else {
        setError(err.response?.data?.message || 'Failed to fetch audit logs.');
      }
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchLogs(1);
  }, [fetchLogs]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleResetFilters = () => {
    setFilters({ action: '', date_from: '', date_to: '' });
  };

  const renderActionBadge = (action) => {
    if (!action) return <span className="badge badge-neutral">—</span>;

    if (action.includes('deleted') || action.includes('terminated')) {
      return <span className="badge badge-danger">{action}</span>;
    }
    if (action.includes('created') || action.includes('uploaded')) {
      return <span className="badge badge-success">{action}</span>;
    }
    if (action.includes('updated') || action.includes('changed')) {
      return <span className="badge badge-info">{action}</span>;
    }
    if (action.includes('downloaded')) {
      return <span className="badge badge-purple">{action}</span>;
    }
    return <span className="badge badge-neutral">{action}</span>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Logs</h1>
          <p className="page-subtitle">
            System activity, employee updates, and document operations audit trail.
          </p>
        </div>
        <div>
          <button
            onClick={() => fetchLogs(pagination.currentPage)}
            className="btn-primary"
          >
            Refresh Logs
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="filters-bar">
        <div className="filter-group">
          <label className="filter-label">Action Event</label>
          <CustomSelect
            name="action"
            value={filters.action}
            onChange={handleFilterChange}
            className="filter-select"
          >
            <option value="">All Actions</option>
            <option value="employee.created">Employee Created</option>
            <option value="employee.updated">Employee Updated</option>
            <option value="employee.status_changed">Employee Status Changed</option>
            <option value="employee.deleted">Employee Deleted</option>
            <option value="document.uploaded">Document Uploaded</option>
            <option value="document.downloaded">Document Downloaded</option>
            <option value="document.deleted">Document Deleted</option>
            <option value="shift.created">Shift Created</option>
            <option value="shift.updated">Shift Updated</option>
            <option value="shift.deleted">Shift Deleted</option>
            <option value="holiday.created">Holiday Created</option>
            <option value="holiday.updated">Holiday Updated</option>
            <option value="holiday.deleted">Holiday Deleted</option>
          </CustomSelect>
        </div>

        <div className="filter-group">
          <label className="filter-label">Date From</label>
          <input
            type="date"
            name="date_from"
            value={filters.date_from}
            onChange={handleFilterChange}
            className="filter-input"
          />
        </div>

        <div className="filter-group">
          <label className="filter-label">Date To</label>
          <input
            type="date"
            name="date_to"
            value={filters.date_to}
            onChange={handleFilterChange}
            className="filter-input"
          />
        </div>

        <div className="filter-group">
          <button
            onClick={handleResetFilters}
            className="btn-secondary"
            style={{ width: '100%' }}
          >
            Reset Filters
          </button>
        </div>
      </div>

      {/* Audit Logs Content */}
      <div className="table-container" style={{ margin: 0 }}>
        {loading ? (
          <div className="state-container">
            <h3>Loading audit logs...</h3>
            <p>Fetching audit trail events from server</p>
          </div>
        ) : error ? (
          <div className="alert-banner error" style={{ margin: '1.5rem' }}>
            {error}
          </div>
        ) : logs.length === 0 ? (
          <div className="state-container">
            <h3>No audit logs found</h3>
            <p>No activity logs match your filter criteria.</p>
          </div>
        ) : (
          <div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Performer</th>
                  <th>Entity</th>
                  <th>IP Address</th>
                  <th style={{ textAlign: 'right' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td>
                      {renderActionBadge(log.action)}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {log.user ? log.user.name : 'System'}
                      </div>
                      {log.user?.email && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{log.user.email}</div>
                      )}
                    </td>
                    <td style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                      {log.entity_type ? `${log.entity_type.split('\\').pop()} #${log.entity_id}` : '—'}
                    </td>
                    <td style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      {log.ip_address || '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="btn-secondary"
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem', color: 'var(--primary-color)' }}
                      >
                        View Payload
                      </button>
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
                  onClick={() => fetchLogs(pagination.currentPage - 1)}
                  className="pagination-btn"
                >
                  Previous
                </button>
                <button
                  disabled={pagination.currentPage >= pagination.lastPage}
                  onClick={() => fetchLogs(pagination.currentPage + 1)}
                  className="pagination-btn"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Details Modal */}
      {selectedLog && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Audit Event Details</h3>
                <div style={{ marginTop: '0.35rem' }}>
                  {renderActionBadge(selectedLog.action)}
                </div>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="btn-secondary"
                style={{ padding: '0.25rem 0.5rem' }}
              >
                ✕
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.85rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', backgroundColor: 'var(--bg-surface-hover)', padding: '0.875rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div>
                  <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase' }}>Performer</span>
                  <span style={{ fontWeight: 600 }}>
                    {selectedLog.user ? `${selectedLog.user.name} (${selectedLog.user.email})` : 'System'}
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase' }}>Timestamp</span>
                  <span style={{ fontWeight: 600 }}>
                    {new Date(selectedLog.created_at).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase' }}>IP Address</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{selectedLog.ip_address || 'N/A'}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase' }}>User Agent</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{selectedLog.user_agent || 'N/A'}</span>
                </div>
              </div>

              {selectedLog.old_values && Object.keys(selectedLog.old_values).length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <h4 style={{ fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Previous Values (Before)</h4>
                  <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <tbody>
                        {Object.entries(selectedLog.old_values).map(([key, value]) => (
                          <tr key={key} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '0.5rem 0.75rem', backgroundColor: '#f8faf9', fontWeight: 500, width: '35%', color: 'var(--text-secondary)' }}>
                              {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </td>
                            <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                              {value === null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {selectedLog.new_values && Object.keys(selectedLog.new_values).length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <h4 style={{ fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>New Values (After)</h4>
                  <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <tbody>
                        {Object.entries(selectedLog.new_values).map(([key, value]) => (
                          <tr key={key} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '0.5rem 0.75rem', backgroundColor: '#f0fdf4', fontWeight: 500, width: '35%', color: '#166534' }}>
                              {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </td>
                            <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                              {value === null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                onClick={() => setSelectedLog(null)}
                className="btn-secondary"
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

export default AuditLogs;
