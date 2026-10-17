import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from '../../components/auth/AuthLayout';
import AuthInput from '../../components/auth/AuthInput';
import { ROUTES } from '../../constants/routes';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);

  const validate = () => {
    const newErrors = {};
    if (!email) newErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = 'Invalid email address';
    return newErrors;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    // Frontend placeholder interaction
    console.log('Sending reset link to', email);
    setSubmitted(true);
  };

  return (
    <AuthLayout>
      <h1 className="auth-title">Forgot your password?</h1>
      <p className="auth-subtitle">
        Enter your work email and we'll send you instructions to reset your password.
      </p>

      {submitted ? (
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
          <p style={{ color: 'var(--primary-color)', fontWeight: '500', marginBottom: 'var(--space-4)' }}>
            Reset instructions have been sent to your email.
          </p>
        </div>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit}>
          <AuthInput
            label="Work email"
            id="email"
            type="email"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (errors.email) setErrors({ ...errors, email: '' });
            }}
            error={errors.email}
            required
          />

          <button type="submit" className="auth-btn-primary">
            Send reset link
          </button>
        </form>
      )}

      <div className="auth-footer">
        <Link to={ROUTES.LOGIN} className="auth-link">
          ← Back to Sign In
        </Link>
      </div>
    </AuthLayout>
  );
}
