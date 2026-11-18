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
        <h2 style={{ fontSize: '26px', lineHeight: '34px', fontWeight: 700, color: '#12345A', letterSpacing: '-0.025em', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
          Reset Admin Password
        </h2>
        <p style={{ fontSize: '13px', lineHeight: '20px', fontWeight: 400, color: '#64748B', marginTop: '0.5rem' }}>
          Choose a new secure password for your BSmartHR administrator account.
        </p>
      </div>

      {verifyingToken ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#64748B' }}>
          Validating password reset link...
        </div>
      ) : !tokenValid ? (
        <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '0.5rem', marginBottom: '1.5rem' }}>
          <p style={{ color: '#B91C1C', fontWeight: '500', fontSize: '14px', marginBottom: '1rem' }}>
            {tokenError || 'This password reset link is invalid or has expired.'}
          </p>
          <Link to={ROUTES.ADMIN_RECOVERY} className="auth-link" style={{ fontSize: '13px' }}>
            Request a new reset link →
          </Link>
        </div>
      ) : success ? (
        <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: '#E6F6F5', border: '1px solid #0FA6A6', borderRadius: '0.5rem', marginBottom: '1.5rem' }}>
          <p style={{ color: '#12345A', fontWeight: 600, fontSize: '15px', marginBottom: '0.5rem' }}>
            Password Reset Successful!
          </p>
          <p style={{ color: '#18324B', fontSize: '13px', marginBottom: '1.5rem', lineHeight: '1.4' }}>
            Your administrator password has been updated and all active sessions have been terminated. You may now log in with your new password.
          </p>
          <button
            onClick={() => navigate(ROUTES.LOGIN)}
            className="auth-submit"
          >
            Go to Sign In
          </button>
        </div>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {apiError && (
            <div style={{ padding: '0.75rem', backgroundColor: '#FEF2F2', color: '#B91C1C', borderRadius: '0.5rem', fontSize: '0.875rem' }}>
              {apiError}
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="password">New Password</label>
            <div className="password-field">
              <input
                id="password"
                type={passwordVisible ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password) setErrors({ ...errors, password: '' });
                }}
                className={errors.password ? 'has-error' : ''}
                required
              />
              <button
                type="button"
                onClick={() => setPasswordVisible(!passwordVisible)}
                className="password-toggle"
              >
                {passwordVisible ? 'Hide' : 'Show'}
              </button>
            </div>
            {errors.password && <div className="auth-field-error">{errors.password[0] || errors.password}</div>}
          </div>

          <div className="auth-field">
            <label htmlFor="password_confirmation">Confirm New Password</label>
            <input
              id="password_confirmation"
              type={passwordVisible ? 'text' : 'password'}
              placeholder="••••••••"
              value={passwordConfirmation}
              onChange={(e) => {
                setPasswordConfirmation(e.target.value);
                if (errors.password_confirmation) setErrors({ ...errors, password_confirmation: '' });
              }}
              className={errors.password_confirmation ? 'has-error' : ''}
              required
            />
            {errors.password_confirmation && <div className="auth-field-error">{errors.password_confirmation[0] || errors.password_confirmation}</div>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="auth-submit"
            style={{ marginTop: '0.75rem' }}
          >
            {loading ? 'Resetting Password...' : 'Reset Password'}
          </button>
        </form>
      )}

      <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
        <Link to={ROUTES.LOGIN} className="auth-link" style={{ fontSize: '13px' }}>
          ← Back to Sign In
        </Link>
      </div>
    </AuthLayout>
  );
}
