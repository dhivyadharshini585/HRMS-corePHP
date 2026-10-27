import React, { useState } from 'react';
import attendanceService from '../../services/attendanceService';

export default function CorrectionRequestModal({ isOpen, onClose, onSuccess, session }) {
  const [requestedCheckIn, setRequestedCheckIn] = useState('');
  const [requestedCheckOut, setRequestedCheckOut] = useState('');
  const [reason, setReason] = useState('');
  const [evidenceDetails, setEvidenceDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !session) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const trimmedReason = reason.trim();
    if (trimmedReason.length < 5) {
      setError('Reason is required and must be at least 5 characters.');
      return;
    }
    if (trimmedReason.length > 1000) {
      setError('Reason cannot exceed 1000 characters.');
      return;
    }

    if (!requestedCheckIn && !requestedCheckOut) {
      setError('At least one of requested check-in or requested check-out must be provided.');
      return;
    }

    if (requestedCheckIn && requestedCheckOut) {
      const inTime = new Date(requestedCheckIn).getTime();
      const outTime = new Date(requestedCheckOut).getTime();
      if (isNaN(inTime) || isNaN(outTime)) {
        setError('Please provide valid date and time values.');
        return;
      }
      if (outTime <= inTime) {
        setError('Requested check-out time must be chronologically after requested check-in time.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        attendance_id: session.id,
        reason: trimmedReason,
      };
      if (requestedCheckIn) {
        payload.requested_check_in = requestedCheckIn.replace('T', ' ') + ':00';
      }
      if (requestedCheckOut) {
        payload.requested_check_out = requestedCheckOut.replace('T', ' ') + ':00';
      }
      if (evidenceDetails.trim()) {
        payload.evidence_details = evidenceDetails.trim();
      }

      await attendanceService.submitAttendanceCorrection(payload);
      setSubmitting(false);
      onSuccess('Attendance correction request submitted successfully.');
      onClose();
    } catch (err) {
      setSubmitting(false);
      if (err.response?.status === 409) {
        setError(err.response?.data?.error || 'Conflict: An active correction request already exists for this attendance session.');
      } else if (err.response?.data?.errors) {
        const errMap = err.response.data.errors;
        const firstKey = Object.keys(errMap)[0];
        setError(errMap[firstKey] || 'Validation failed.');
      } else {
        setError(err.response?.data?.error || err.message || 'Failed to submit correction request.');
      }
    }
  };

  const formatDisplayTime = (dtStr) => {
    if (!dtStr) return '--:--';
    const d = new Date(dtStr);
    return isNaN(d.getTime()) ? dtStr : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
        maxWidth: '560px',
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
              Request Attendance Correction
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>
              Session Date: <strong>{session.attendance_date}</strong> (Record #{session.id})
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

        {/* Existing Session Reference Banner */}
        <div style={{
          padding: '0.75rem 1rem',
          backgroundColor: 'var(--bg-subtle, rgba(0,0,0,0.03))',
          borderRadius: 'var(--radius-md, 6px)',
          border: '1px solid var(--border-color)',
          marginBottom: '1rem',
          fontSize: '0.85rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '0.5rem',
        }}>
          <div>
            <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem' }}>Current Check-In</span>
            <strong style={{ color: 'var(--text-primary)' }}>{formatDisplayTime(session.check_in)}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem' }}>Current Check-Out</span>
            <strong style={{ color: 'var(--text-primary)' }}>{formatDisplayTime(session.check_out)}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem' }}>Current Status</span>
            <span className="badge badge-neutral" style={{ fontSize: '0.75rem' }}>{session.status || 'Recorded'}</span>
          </div>
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

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                Requested Check-In
              </label>
              <input
                type="datetime-local"
                className="form-control"
                value={requestedCheckIn}
                onChange={(e) => setRequestedCheckIn(e.target.value)}
                disabled={submitting}
              />
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Leave blank if unchanged</span>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                Requested Check-Out
              </label>
              <input
                type="datetime-local"
                className="form-control"
                value={requestedCheckOut}
                onChange={(e) => setRequestedCheckOut(e.target.value)}
                disabled={submitting}
              />
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Leave blank if unchanged</span>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              Reason for Correction <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <textarea
              className="form-control"
              rows={3}
              placeholder="Explain why correction is needed (e.g. system punch clock failure, on-site client meeting)..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={submitting}
              required
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              <span>Minimum 5 characters</span>
              <span>{reason.length} / 1000</span>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              Evidence / Reference Details (Optional)
            </label>
            <textarea
              className="form-control"
              rows={2}
              placeholder="Reference notes, email approvals, or ticket references (File uploads are deferred in this version)..."
              value={evidenceDetails}
              onChange={(e) => setEvidenceDetails(e.target.value)}
              disabled={submitting}
            />
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Note: File uploads are currently deferred; enter reference details in text.
            </span>
          </div>

          {/* Action Buttons */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            marginTop: '0.5rem',
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
              className="btn-primary"
              disabled={submitting}
            >
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
