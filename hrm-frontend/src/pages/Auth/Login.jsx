import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../../components/auth/AuthLayout';
import { ROUTES } from '../../constants/routes';
import { useAuthContext } from '../../context/AuthContext';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuthContext();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const validate = () => {
    const next = {};
    if (!email.trim()) next.email = 'Email is required';
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = 'Enter a valid email address';
    if (!password) next.password = 'Password is required';
    return next;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;

    const nextErrors = validate();
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    setLoading(true);
    setErrors({});
    setApiError('');

    try {
      await login({ email: email.trim(), password });
      const target = location.state?.from?.pathname || ROUTES.DASHBOARD;
      navigate(target, { replace: true });
    } catch (error) {
      const response = error.response;
      if (response?.status === 422) {
        setErrors(response.data?.errors || {});
        setApiError(response.data?.message || 'Please check your login details.');
      } else if (response?.status === 401) {
        setApiError('Invalid email or password.');
      } else if (error.message === 'The server returned an invalid login response.') {
        setApiError('The server login response is invalid. Please contact the administrator.');
      } else {
        setApiError('Unable to sign in right now. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const fieldError = (value) => Array.isArray(value) ? value[0] : value;

  return (
    <AuthLayout>
      <div className="auth-heading">
        <h2>Welcome back</h2>
        <p>Sign in to access your HRMS account.<br className="desktop-break" /> Use the credentials provided by your organization.</p>
      </div>

      {location.state?.message && <div className="auth-alert auth-alert-success">{location.state.message}</div>}
      {apiError && <div className="auth-alert auth-alert-error" role="alert">{apiError}</div>}

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <div className="auth-field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            placeholder="name@company.com"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (errors.email) setErrors((current) => ({ ...current, email: '' }));
            }}
            className={errors.email ? 'has-error' : ''}
          />
          {errors.email && <span className="auth-field-error">{fieldError(errors.email)}</span>}
        </div>

        <div className="auth-field">
          <label htmlFor="password">Password</label>
          <div className="password-field">
            <input
              id="password"
              type={passwordVisible ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (errors.password) setErrors((current) => ({ ...current, password: '' }));
              }}
              className={errors.password ? 'has-error' : ''}
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setPasswordVisible((visible) => !visible)}
              aria-label={passwordVisible ? 'Hide password' : 'Show password'}
            >
              {passwordVisible ? 'Hide' : 'Show'}
            </button>
          </div>
          {errors.password && <span className="auth-field-error">{fieldError(errors.password)}</span>}
        </div>

        <div className="auth-options">
          <label className="remember-option">
            <input type="checkbox" />
            <span>Remember me</span>
          </label>
          <Link to={ROUTES.FORGOT_PASSWORD}>Forgot password?</Link>
        </div>

        <button className="auth-submit" type="submit" disabled={loading}>
          {loading ? <span className="auth-spinner" aria-hidden="true" /> : null}
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>

      <p className="auth-footer">Need access? <strong>Contact your HR administrator.</strong></p>
    </AuthLayout>
  );
}
