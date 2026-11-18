import { useState, useEffect } from 'react';
import { getRecoveryEmailStatus, setupRecoveryEmail } from '../../services/adminRecoveryService';
import { useAuthContext } from '../../context/AuthContext';
import AlertBanner from '../../components/common/AlertBanner';

export default function SecuritySettings() {
  const { user, hasAnyRole } = useAuthContext();
  const isAuthorized = hasAnyRole(['Super Admin', 'HR Admin']);

  const [status, setStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [statusError, setStatusError] = useState('');

  const [newRecoveryEmail, setNewRecoveryEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const fetchStatus = async (signal) => {
    setLoadingStatus(true);
    setStatusError('');
    try {
      const data = await getRecoveryEmailStatus({ signal });
      setStatus(data);
    } catch (err) {
      if (err.name !== 'CanceledError') {
        setStatusError(err.response?.data?.message || 'Failed to load recovery email status.');
      }
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    if (!isAuthorized) return;

    const controller = new AbortController();
    fetchStatus(controller.signal);

    return () => controller.abort();
  }, [isAuthorized]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    if (!newRecoveryEmail || !/\S+@\S+\.\S+/.test(newRecoveryEmail)) {
      setFormError('Please enter a valid email address.');
      return;
    }

    setSubmitting(true);
    setFormError('');
    setSuccessMessage('');

    try {
      const res = await setupRecoveryEmail({ recovery_email: newRecoveryEmail });
      setSuccessMessage(res.message || 'Verification link sent to recovery email. Please check your inbox to confirm.');
      setNewRecoveryEmail('');
      // Refresh status after setting up
      fetchStatus();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to request recovery email setup. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAuthorized) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#ef4444', backgroundColor: '#fee2e2', borderRadius: 'var(--radius-md)' }}>
        Unauthorized Access. Security settings are only available to Super Admin and HR Admin users.
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '1rem 0' }}>
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title">Security & Recovery Settings</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Configure admin password recovery preferences and secondary email verification.
          </p>
        </div>
      </div>

      {/* Recovery Email Status Card */}
      <div className="detail-card" style={{ marginBottom: '1.5rem', padding: '1.5rem', backgroundColor: '#FFFFFF', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--brand-navy)', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
          Configured Recovery Email Status
        </h3>

        {loadingStatus ? (
          <p style={{ color: '#64748B', fontSize: '14px' }}>Loading status...</p>
        ) : statusError ? (
          <p style={{ color: '#EF4444', fontSize: '14px' }}>{statusError}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontSize: '14px', fontWeight: 500, color: '#64748B', minWidth: '160px' }}>Recovery Email:</span>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {status?.recovery_email || 'Not Configured'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontSize: '14px', fontWeight: 500, color: '#64748B', minWidth: '160px' }}>Verification Status:</span>
              <span>
                {status?.is_verified ? (
                  <span style={{ padding: '0.25rem 0.75rem', backgroundColor: '#E6F6F5', color: '#0B7A7A', borderRadius: '9999px', fontSize: '12px', fontWeight: 600 }}>
                    ✓ Verified ({status.verified_at ? new Date(status.verified_at).toLocaleDateString() : 'Active'})
                  </span>
                ) : status?.recovery_email ? (
                  <span style={{ padding: '0.25rem 0.75rem', backgroundColor: '#FEF9C3', color: '#854D0E', borderRadius: '9999px', fontSize: '12px', fontWeight: 600 }}>
                    ⏳ Pending Verification
                  </span>
                ) : (
                  <span style={{ padding: '0.25rem 0.75rem', backgroundColor: '#F1F5F9', color: '#64748B', borderRadius: '9999px', fontSize: '12px', fontWeight: 600 }}>
                    Not Configured
                  </span>
                )}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Configure/Update Recovery Email Form Card */}
      <div className="detail-card" style={{ padding: '1.5rem', backgroundColor: '#FFFFFF', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--brand-navy)', marginBottom: '0.5rem' }}>
          {status?.recovery_email ? 'Change Recovery Email' : 'Set Recovery Email'}
        </h3>
        <p style={{ color: '#64748B', fontSize: '13px', marginBottom: '1.25rem', lineHeight: '1.4' }}>
          Enter a secondary email address to receive password reset links. A verification email will be sent to the address before it becomes active.
        </p>

        <AlertBanner
          type="success"
          message={successMessage}
          onClose={() => setSuccessMessage('')}
        />

        <AlertBanner
          type="error"
          message={formError}
          onClose={() => setFormError('')}
        />

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label htmlFor="recovery_email" style={{ fontSize: '13px', fontWeight: 500, color: '#18324B' }}>
              Secondary Recovery Email Address
            </label>
            <input
              id="recovery_email"
              type="email"
              placeholder="admin.personal@example.com"
              value={newRecoveryEmail}
              onChange={(e) => {
                setNewRecoveryEmail(e.target.value);
                if (formError) setFormError('');
              }}
              className="form-control"
              style={{ height: '2.875rem', padding: '0 1rem' }}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary"
              style={{ padding: '0.75rem 1.5rem' }}
            >
              {submitting ? 'Sending Verification...' : 'Send Verification Email'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
