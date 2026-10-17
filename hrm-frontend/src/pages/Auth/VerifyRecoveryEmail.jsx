import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import AuthLayout from '../../components/auth/AuthLayout';
import { ROUTES } from '../../constants/routes';
import { verifyRecoveryEmail } from '../../services/adminRecoveryService';

export default function VerifyRecoveryEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [verifying, setVerifying] = useState(true);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setVerifying(false);
      setSuccess(false);
      setErrorMessage('Missing verification token. Please check your verification link.');
      return;
    }

    const processVerification = async () => {
      setVerifying(true);
      setErrorMessage('');
      try {
        await verifyRecoveryEmail({ token });
        setSuccess(true);
      } catch (err) {
        setSuccess(false);
        setErrorMessage(err.response?.data?.message || 'Invalid, expired, or already used verification token.');
      } finally {
        setVerifying(false);
      }
    };

    processVerification();
  }, [token]);

  return (
    <AuthLayout>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '26px', lineHeight: '34px', fontWeight: 700, color: '#0a4d3a', letterSpacing: '-0.025em', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
          Recovery Email Verification
        </h2>
      </div>

      {verifying ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
          Verifying your recovery email address...
        </div>
      ) : success ? (
        <div style={{ textAlign: 'center', padding: '1.5rem', backgroundColor: '#ecfdf5', border: '1px solid #10b981', borderRadius: '0.5rem', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>✅</div>
          <h3 style={{ color: '#065f46', fontSize: '18px', fontWeight: 600, marginBottom: '0.5rem' }}>
            Recovery Email Verified!
          </h3>
          <p style={{ color: '#047857', fontSize: '14px', lineHeight: '1.5', marginBottom: '1.5rem' }}>
            Your admin recovery email has been verified successfully. You can now use this email to receive password recovery links.
          </p>
          <Link
            to={ROUTES.LOGIN}
            style={{
              display: 'inline-block',
              padding: '0.75rem 1.5rem',
              backgroundColor: '#0a4d3a',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 600,
              borderRadius: '0.5rem',
              textDecoration: 'none',
            }}
          >
            Go to Sign In
          </Link>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '1.5rem', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '0.5rem', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>⚠️</div>
          <h3 style={{ color: '#b91c1c', fontSize: '18px', fontWeight: 600, marginBottom: '0.5rem' }}>
            Verification Failed
          </h3>
          <p style={{ color: '#991b1b', fontSize: '14px', lineHeight: '1.5', marginBottom: '1.5rem' }}>
            {errorMessage}
          </p>
          <Link
            to={ROUTES.LOGIN}
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: '#0a4d3a',
              textDecoration: 'none',
            }}
          >
            ← Back to Sign In
          </Link>
        </div>
      )}
    </AuthLayout>
  );
}
