import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from '../../components/auth/AuthLayout';
import AuthInput from '../../components/auth/AuthInput';
import { ROUTES } from '../../constants/routes';
import { requestPasswordReset } from '../../services/adminRecoveryService';

export default function AdminRecovery() {
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const validate = () => {
    const newErrors = {};
    if (!email) newErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = 'Invalid email address';
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
      await requestPasswordReset({ email });
      setSubmitted(true);
    } catch (err) {
      if (err.response?.status === 422) {
        setErrors(err.response.data.errors || {});
      } else {
        setApiError('An unexpected error occurred. Please try again.');
      }
      // Note: Always show generic message if 200 response returned
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '26px', lineHeight: '34px', fontWeight: 700, color: '#12345A', letterSpacing: '-0.025em', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
          Admin Password Recovery
        </h2>
        <p style={{ fontSize: '13px', lineHeight: '20px', fontWeight: 400, color: '#64748B', marginTop: '0.5rem' }}>
          Enter your BSmartHR login email address below to receive password recovery instructions.
        </p>
      </div>

      {apiError && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#FEF2F2', color: '#B91C1C', borderRadius: '0.5rem', fontSize: '0.875rem' }}>
          {apiError}
        </div>
      )}

      {submitted ? (
        <div style={{ textAlign: 'center', marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#E6F6F5', border: '1px solid #0FA6A6', borderRadius: '0.5rem' }}>
          <p style={{ color: '#12345A', fontWeight: '500', fontSize: '14px', margin: 0, lineHeight: '1.5' }}>
            If an eligible account with a verified recovery email exists, password reset instructions have been sent.
          </p>
          <p style={{ color: '#64748B', fontSize: '13px', marginTop: '0.5rem', marginBottom: 0 }}>
            Please check your verified recovery email inbox and follow the link to reset your password.
          </p>
        </div>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <AuthInput
            label="BSmartHR Login Email"
            id="email"
            type="email"
            placeholder="admin@company.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (errors.email) setErrors({ ...errors, email: '' });
            }}
            error={errors.email ? (Array.isArray(errors.email) ? errors.email[0] : errors.email) : ''}
            required
          />

          <button
            type="submit"
            disabled={loading}
            className="auth-submit"
            style={{ marginTop: '0.75rem' }}
          >
            {loading ? 'Sending Instructions...' : 'Send Reset Link'}
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
