import React, { useState } from 'react';
import attendanceService from '../../services/attendanceService';

export default function ReviewerActionModal({ isOpen, onClose, onSuccess, actionType, correction }) {
  const [remarks, setRemarks] = useState('');
  const [escalationReason, setEscalationReason] = useState('');
  const [approvedCheckOut, setApprovedCheckOut] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !correction || !actionType) return null;

  const getTitle = () => {
    switch (actionType) {
      case 'approve':
        return 'Approve Attendance Correction';
      case 'reject':
        return 'Reject Attendance Correction';
      case 'escalate':
        return 'Escalate to Shared HR Review Queue';
      default:
        return 'Review Correction Request';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (actionType === 'reject') {
      const trimmedRemarks = remarks.trim();
      if (trimmedRemarks.length < 5) {
        setError('Reviewer remarks are required for rejection (minimum 5 characters).');
        return;
      }
      if (trimmedRemarks.length > 2000) {
        setError('Remarks cannot exceed 2000 characters.');
        return;
      }
    }

    if (actionType === 'escalate') {
      const trimmedReason = escalationReason.trim();
      if (trimmedReason.length < 5) {
        setError('Escalation reason is required (minimum 5 characters).');
        return;
      }
      if (trimmedReason.length > 2000) {
        setError('Escalation reason cannot exceed 2000 characters.');
        return;
      }
    }

    if (actionType === 'approve' && remarks && remarks.trim().length > 2000) {
      setError('Remarks cannot exceed 2000 characters.');
      return;
    }

    setSubmitting(true);
    try {
      if (actionType === 'approve') {
        const payload = {};
        if (remarks.trim()) {
          payload.remarks = remarks.trim();
        }
        if (approvedCheckOut) {
          payload.approved_check_out = approvedCheckOut.replace('T', ' ') + ':00';
        }
        await attendanceService.approveAttendanceCorrection(correction.id, payload);
        onSuccess('Attendance correction approved successfully.');
      } else if (actionType === 'reject') {
        await attendanceService.rejectAttendanceCorrection(correction.id, remarks.trim());
        onSuccess('Attendance correction rejected.');
      } else if (actionType === 'escalate') {
        await attendanceService.escalateAttendanceCorrection(correction.id, escalationReason.trim());
        onSuccess('Attendance correction escalated to HR queue.');
      }
      setSubmitting(false);
      onClose();
    } catch (err) {
      setSubmitting(false);
      if (err.response?.status === 403) {
        setError(err.response?.data?.error || 'Forbidden: You are not authorized to perform this action.');
      } else if (err.response?.status === 409) {
        setError(err.response?.data?.error || 'Conflict: This request has already been finalized or modified by another reviewer.');
      } else if (err.response?.data?.error) {
        setError(err.response.data.error);
      } else {
        setError(err.message || 'Action failed.');
      }
    }
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
        maxWidth: '540px',
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
              {getTitle()}
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>
              Employee: <strong>{correction.employee_name || `Employee #${correction.employee_id}`}</strong> &bull; Date: <strong>{correction.attendance_date}</strong>
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            style={{ padding: '0.25rem 0.5rem', fontSize: '1rem', lineHeight: 1 }}
            onClick={onClose}
            disabled={submitting}
          >
            &times;
          </button>
        </div>

        {/* Request Details Preview */}
        <div style={{
          padding: '0.75rem 1rem',
          backgroundColor: 'var(--bg-subtle, rgba(0,0,0,0.03))',
          borderRadius: 'var(--radius-md, 6px)',
          border: '1px solid var(--border-color)',
          marginBottom: '1rem',
          fontSize: '0.85rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.35rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Requested In / Out:</span>
            <span style={{ fontWeight: 500, fontFamily: 'var(--font-mono)' }}>
              {correction.requested_check_in ? correction.requested_check_in.substring(11, 16) : '-'} &rarr;{' '}
              {correction.requested_check_out ? correction.requested_check_out.substring(11, 16) : '-'}
            </span>
          </div>
          <div>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'block' }}>Reason:</span>
            <span style={{ color: 'var(--text-primary)' }}>{correction.reason}</span>
          </div>
          {correction.evidence_details && (
            <div>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'block' }}>Reference:</span>
              <span style={{ color: 'var(--text-primary)' }}>{correction.evidence_details}</span>
            </div>
          )}
        </div>

        {/* Error Alert */}
        {error && (
          <div style={{
            padding: '0.75rem',
            color: '#b91c1c',
            backgroundColor: '#fee2e2',
            borderRadius: 'var(--radius-md, 6px)',
            marginBottom: '1rem',
            fontSize: '0.875rem',
            border: '1px solid #fca5a5',
          }}>
            {error}
          </div>
        )}

        {/* Action Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {actionType === 'approve' && (
            <>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                  Adjusted Check-Out Time (Optional)
                </label>
                <input
                  type="datetime-local"
                  className="form-control"
                  value={approvedCheckOut}
                  onChange={(e) => setApprovedCheckOut(e.target.value)}
                  disabled={submitting}
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  Override check-out timestamp if different from employee requested time.
                </span>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                  Approval Remarks (Optional)
                </label>
                <textarea
                  className="form-control"
                  rows={2}
                  placeholder="Optional approval notes or audit remarks..."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </>
          )}

          {actionType === 'reject' && (
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                Rejection Remarks <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <textarea
                className="form-control"
                rows={3}
                placeholder="Explain the reason for rejecting this correction request (Required, min 5 chars)..."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                disabled={submitting}
                required
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                <span>Minimum 5 characters</span>
                <span>{remarks.length} / 2000</span>
              </div>
            </div>
          )}

          {actionType === 'escalate' && (
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                Escalation Reason <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <textarea
                className="form-control"
                rows={3}
                placeholder="Explain why this request is being escalated to the HR review queue (Required, min 5 chars)..."
                value={escalationReason}
                onChange={(e) => setEscalationReason(e.target.value)}
                disabled={submitting}
                required
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                <span>Minimum 5 characters</span>
                <span>{escalationReason.length} / 2000</span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            borderTop: '1px solid var(--border-color)',
            paddingTop: '0.75rem',
          }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={actionType === 'approve' ? 'btn-success' : actionType === 'reject' ? 'btn-danger' : 'btn-primary'}
              disabled={submitting}
            >
              {submitting
                ? 'Processing...'
                : actionType === 'approve'
                ? 'Confirm Approval'
                : actionType === 'reject'
                ? 'Confirm Rejection'
                : 'Confirm Escalation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
