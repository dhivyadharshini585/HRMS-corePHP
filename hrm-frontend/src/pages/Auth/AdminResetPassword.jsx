import { useState, useEffect } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../../components/auth/AuthLayout';
import { ROUTES } from '../../constants/routes';
import { verifyResetToken, resetPassword } from '../../services/adminRecoveryService';

export default function AdminResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [verifyingToken, setVerifyingToken] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState('');

  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setVerifyingToken(false);
      setTokenValid(false);
      setTokenError('Missing password reset token. Please request a new link.');
      return;
    }

    const checkToken = async () => {
      setVerifyingToken(true);
      setTokenError('');
      try {
        const res = await verifyResetToken({ token });
        if (res.valid) {
          setTokenValid(true);
        } else {
          setTokenValid(false);
          setTokenError(res.message || 'Invalid or expired password reset token.');
        }
      } catch (err) {
        setTokenValid(false);
        setTokenError(err.response?.data?.message || 'Invalid or expired password reset token.');
      } finally {
        setVerifyingToken(false);
      }
    };

    checkToken();
  }, [token]);

  const validate = () => {
    const newErrors = {};
    if (!password) newErrors.password = 'New password is required';
    else if (password.length < 8) newErrors.password = 'Password must be at least 8 characters';
    
    if (!passwordConfirmation) newErrors.password_confirmation = 'Please confirm your new password';
    else if (password !== passwordConfirmation) newErrors.password_confirmation = 'Passwords do not match';
    
    return newErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setLoading(true);
    setApiError('');
    setErrors({});

    try {
      await resetPassword({
        token,
        password,
        password_confirmation: passwordConfirmation,
      });
      setSuccess(true);
    } catch (err) {
      if (err.response?.status === 422) {
        setErrors(err.response.data.errors || {});
      } else {
        setApiError(err.response?.data?.message || 'Failed to reset password. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '26px', lineHeight: '34px', fontWeight: 700, color: '#0a4d3a', letterSpacing: '-0.025em', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
          Reset Admin Password
        </h2>
        <p style={{ fontSize: '13px', lineHeight: '20px', fontWeight: 400, color: '#64748b', marginTop: '0.5rem' }}>
          Choose a new secure password for your HRMS administrator account.
        </p>
      </div>

      {verifyingToken ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
          Validating password reset link...
        </div>
      ) : !tokenValid ? (
        <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '0.5rem', marginBottom: '1.5rem' }}>
          <p style={{ color: '#b91c1c', fontWeight: '500', fontSize: '14px', marginBottom: '1rem' }}>
            {tokenError || 'This password reset link is invalid or has expired.'}
          </p>
          <Link to={ROUTES.ADMIN_RECOVERY} style={{ fontSize: '13px', fontWeight: 600, color: '#0a4d3a', textDecoration: 'none' }}>
            Request a new reset link →
          </Link>
        </div>
      ) : success ? (
        <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: '#ecfdf5', border: '1px solid #10b981', borderRadius: '0.5rem', marginBottom: '1.5rem' }}>
          <p style={{ color: '#065f46', fontWeight: 600, fontSize: '15px', marginBottom: '0.5rem' }}>
            Password Reset Successful!
          </p>
          <p style={{ color: '#047857', fontSize: '13px', marginBottom: '1.5rem', lineHeight: '1.4' }}>
            Your administrator password has been updated and all active sessions have been terminated. You may now log in with your new password.
          </p>
          <button
            onClick={() => navigate(ROUTES.LOGIN)}
            style={{
              width: '100%',
              height: '2.875rem',
              backgroundColor: '#0a4d3a',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 600,
              borderRadius: '0.5rem',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Go to Sign In
          </button>
        </div>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {apiError && (
            <div style={{ padding: '0.75rem', backgroundColor: '#fef2f2', color: '#b91c1c', borderRadius: '0.5rem', fontSize: '0.875rem' }}>
              {apiError}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label htmlFor="password" style={{ fontSize: '13px', fontWeight: 500, color: '#334155' }}>New Password</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                id="password"
                type={passwordVisible ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password) setErrors({ ...errors, password: '' });
                }}
                style={{ width: '100%', height: '2.875rem', padding: '0 2.5rem 0 1rem', backgroundColor: '#ffffff', color: '#0f172a', fontSize: '14px', borderRadius: '0.5rem', outline: 'none', border: errors.password ? '1px solid #ef4444' : '1px solid #e2e8f0' }}
                required
              />
              <button
                type="button"
                onClick={() => setPasswordVisible(!passwordVisible)}
                style={{ position: 'absolute', right: '0.75rem', color: '#94a3b8', background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                {passwordVisible ? 'Hide' : 'Show'}
              </button>
            </div>
            {errors.password && <div style={{ fontSize: '0.75rem', color: '#ef4444' }}>{errors.password[0] || errors.password}</div>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label htmlFor="password_confirmation" style={{ fontSize: '13px', fontWeight: 500, color: '#334155' }}>Confirm New Password</label>
            <input
              id="password_confirmation"
              type={passwordVisible ? 'text' : 'password'}
              placeholder="••••••••"
              value={passwordConfirmation}
              onChange={(e) => {
                setPasswordConfirmation(e.target.value);
                if (errors.password_confirmation) setErrors({ ...errors, password_confirmation: '' });
              }}
              style={{ width: '100%', height: '2.875rem', padding: '0 1rem', backgroundColor: '#ffffff', color: '#0f172a', fontSize: '14px', borderRadius: '0.5rem', outline: 'none', border: errors.password_confirmation ? '1px solid #ef4444' : '1px solid #e2e8f0' }}
              required
            />
            {errors.password_confirmation && <div style={{ fontSize: '0.75rem', color: '#ef4444' }}>{errors.password_confirmation[0] || errors.password_confirmation}</div>}
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              height: '3rem',
              backgroundColor: '#0a4d3a',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 600,
              borderRadius: '0.5rem',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: '0.75rem',
            }}
          >
            {loading ? 'Resetting Password...' : 'Reset Password'}
          </button>
        </form>
      )}

      <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
        <Link to={ROUTES.LOGIN} style={{ fontSize: '13px', fontWeight: 600, color: '#0a4d3a', textDecoration: 'none' }}>
          ← Back to Sign In
        </Link>
      </div>
    </AuthLayout>
  );
}
