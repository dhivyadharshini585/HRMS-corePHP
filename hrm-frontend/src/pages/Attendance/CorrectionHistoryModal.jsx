import React from 'react';

export default function CorrectionHistoryModal({ isOpen, onClose, correction }) {
  if (!isOpen || !correction) return null;

  const history = Array.isArray(correction.history)
    ? correction.history
    : (Array.isArray(correction.timeline) ? correction.timeline : []);

  const getActionBadgeClass = (action) => {
    switch (action?.toLowerCase()) {
      case 'submitted':
      case 'resubmitted':
        return 'badge-info';
      case 'escalated':
        return 'badge-warning';
      case 'approved':
        return 'badge-success';
      case 'rejected':
        return 'badge-danger';
      default:
        return 'badge-neutral';
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'Approved':
        return 'badge-success';
      case 'Rejected':
        return 'badge-danger';
      case 'Escalated':
        return 'badge-warning';
      case 'Pending':
      default:
        return 'badge-info';
    }
  };

  const formatDateTime = (dtStr) => {
    if (!dtStr) return '-';
    const d = new Date(dtStr);
    return isNaN(d.getTime()) ? dtStr : d.toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.55)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1050,
      padding: '1rem',
    }}>
      <div className="detail-card" style={{
        width: '100%',
        maxWidth: '620px',
        maxHeight: '90vh',
        overflowY: 'auto',
        backgroundColor: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg, 8px)',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: '0.75rem',
        }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Correction Audit Timeline
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>
              Request #{correction.id} &bull; Attendance Date: <strong>{correction.attendance_date}</strong>
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            style={{ padding: '0.25rem 0.5rem', fontSize: '1rem', lineHeight: 1 }}
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        {/* Current State Summary */}
        <div style={{
          padding: '0.85rem 1rem',
          backgroundColor: 'var(--bg-subtle, rgba(0,0,0,0.02))',
          borderRadius: 'var(--radius-md, 6px)',
          border: '1px solid var(--border-color)',
          marginBottom: '1.25rem',
          fontSize: '0.85rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Current Status:</span>
            <span className={`badge ${getStatusBadgeClass(correction.status)}`}>
              {correction.status}
            </span>
          </div>
          <div>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'block' }}>Submission Reason:</span>
            <span style={{ color: 'var(--text-primary)' }}>{correction.reason}</span>
          </div>
          {correction.manager_remarks && (
            <div>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'block' }}>Manager Remarks:</span>
              <span style={{ color: 'var(--text-primary)' }}>{correction.manager_remarks}</span>
            </div>
          )}
          {correction.hr_remarks && (
            <div>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'block' }}>HR Remarks:</span>
              <span style={{ color: 'var(--text-primary)' }}>{correction.hr_remarks}</span>
            </div>
          )}
          {correction.escalation_reason && (
            <div>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'block' }}>Escalation Reason:</span>
              <span style={{ color: 'var(--text-primary)' }}>{correction.escalation_reason}</span>
            </div>
          )}
        </div>

        {/* Timeline Events */}
        <div style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-primary)' }}>
            Workflow History Events ({history.length})
          </h3>

          {history.length === 0 ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No audit records available for this request.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {history.map((event, idx) => (
                <div key={event.id || idx} style={{
                  padding: '0.75rem 1rem',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md, 6px)',
                  backgroundColor: 'var(--bg-surface)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem',
                  fontSize: '0.85rem',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className={`badge ${getActionBadgeClass(event.action)}`} style={{ textTransform: 'capitalize' }}>
                        {event.action || 'Updated'}
                      </span>
                      {event.to_status && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          &rarr; {event.to_status}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {formatDateTime(event.created_at)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    <span>Actor: <strong style={{ color: 'var(--text-primary)' }}>{event.actor_name || `User #${event.actor_user_id || 'System'}`}</strong></span>
                  </div>

                  {event.remarks && (
                    <div style={{
                      marginTop: '0.25rem',
                      padding: '0.4rem 0.6rem',
                      backgroundColor: 'var(--bg-subtle, rgba(0,0,0,0.03))',
                      borderRadius: 'var(--radius-sm, 4px)',
                      fontSize: '0.8rem',
                      color: 'var(--text-primary)',
                      fontStyle: 'italic',
                    }}>
                      "{event.remarks}"
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
