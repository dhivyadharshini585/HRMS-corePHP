import { useState, useEffect } from 'react';
import { getRecoveryEmailStatus, setupRecoveryEmail } from '../../services/adminRecoveryService';
import { useAuthContext } from '../../context/AuthContext';

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
      <div className="detail-card" style={{ marginBottom: '1.5rem', padding: '1.5rem', backgroundColor: '#ffffff', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#0f172a', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
          Configured Recovery Email Status
        </h3>

        {loadingStatus ? (
          <p style={{ color: '#64748b', fontSize: '14px' }}>Loading status...</p>
        ) : statusError ? (
          <p style={{ color: '#ef4444', fontSize: '14px' }}>{statusError}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontSize: '14px', fontWeight: 500, color: '#475569', minWidth: '160px' }}>Recovery Email:</span>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>
                {status?.recovery_email || 'Not Configured'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontSize: '14px', fontWeight: 500, color: '#475569', minWidth: '160px' }}>Verification Status:</span>
              <span>
                {status?.is_verified ? (
                  <span style={{ padding: '0.25rem 0.75rem', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '9999px', fontSize: '12px', fontWeight: 600 }}>
                    ✓ Verified ({status.verified_at ? new Date(status.verified_at).toLocaleDateString() : 'Active'})
                  </span>
                ) : status?.recovery_email ? (
                  <span style={{ padding: '0.25rem 0.75rem', backgroundColor: '#fef9c3', color: '#854d0e', borderRadius: '9999px', fontSize: '12px', fontWeight: 600 }}>
                    ⏳ Pending Verification
                  </span>
                ) : (
                  <span style={{ padding: '0.25rem 0.75rem', backgroundColor: '#f1f5f9', color: '#64748b', borderRadius: '9999px', fontSize: '12px', fontWeight: 600 }}>
                    Not Configured
                  </span>
                )}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Configure/Update Recovery Email Form Card */}
      <div className="detail-card" style={{ padding: '1.5rem', backgroundColor: '#ffffff', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.5rem' }}>
          {status?.recovery_email ? 'Change Recovery Email' : 'Set Recovery Email'}
        </h3>
        <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '1.25rem', lineHeight: '1.4' }}>
          Enter a secondary email address to receive password reset links. A verification email will be sent to the address before it becomes active.
        </p>

        {successMessage && (
          <div style={{ padding: '0.75rem 1rem', backgroundColor: '#ecfdf5', color: '#065f46', border: '1px solid #10b981', borderRadius: '0.375rem', fontSize: '14px', marginBottom: '1rem' }}>
            {successMessage}
          </div>
        )}

        {formError && (
          <div style={{ padding: '0.75rem 1rem', backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fca5a5', borderRadius: '0.375rem', fontSize: '14px', marginBottom: '1rem' }}>
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label htmlFor="recovery_email" style={{ fontSize: '13px', fontWeight: 500, color: '#334155' }}>
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
              style={{ width: '100%', height: '2.875rem', padding: '0 1rem', backgroundColor: '#ffffff', color: '#0f172a', fontSize: '14px', borderRadius: '0.5rem', border: '1px solid #cbd5e1', outline: 'none' }}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#0a4d3a',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: 600,
                borderRadius: '0.5rem',
                border: 'none',
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Sending Verification...' : 'Send Verification Email'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
