import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../../components/auth/AuthLayout';
import AuthInput from '../../components/auth/AuthInput';
import PasswordInput from '../../components/auth/PasswordInput';
import { ROUTES } from '../../constants/routes';
import { useAuthContext } from '../../context/AuthContext';

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuthContext();
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    terms: false,
  });
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const newErrors = {};
    if (!formData.fullName) newErrors.fullName = 'Full name is required';
    if (!formData.email) newErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Invalid email address';
    if (!formData.password) newErrors.password = 'Password is required';
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    if (!formData.terms) newErrors.terms = 'You must agree to the Terms and Conditions';
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
      await register({
        name: formData.fullName,
        email: formData.email,
        password: formData.password,
        password_confirmation: formData.confirmPassword,
      });
      navigate(ROUTES.LOGIN, { state: { message: 'Account created successfully. Please sign in.' } });
    } catch (err) {
      if (err.response?.status === 422) {
        const backendErrors = err.response.data.errors || {};
        const mappedErrors = { ...backendErrors };
        if (mappedErrors.name) {
          mappedErrors.fullName = mappedErrors.name;
          delete mappedErrors.name;
        }
        setErrors(mappedErrors);
        
        if (err.response.data.message) {
            setApiError(err.response.data.message);
        }
      } else {
        setApiError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <h1 className="auth-title">Create your account</h1>
      <p className="auth-subtitle">Join us to manage your HR operations seamlessly.</p>

      {apiError && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#fef2f2', color: '#b91c1c', borderRadius: 'var(--radius-md)', fontSize: '0.875rem' }}>
          {apiError}
        </div>
      )}

      <form className="auth-form" onSubmit={handleSubmit}>
        <AuthInput
          label="Full name"
          id="fullName"
          type="text"
          placeholder="Jane Doe"
          value={formData.fullName}
          onChange={(e) => {
            setFormData({ ...formData, fullName: e.target.value });
            if (errors.fullName) setErrors({ ...errors, fullName: '' });
          }}
          error={errors.fullName ? errors.fullName[0] || errors.fullName : ''}
        />

        <AuthInput
          label="Work email"
          id="email"
          type="email"
          placeholder="name@company.com"
          value={formData.email}
          onChange={(e) => {
            setFormData({ ...formData, email: e.target.value });
            if (errors.email) setErrors({ ...errors, email: '' });
          }}
          error={errors.email ? errors.email[0] || errors.email : ''}
        />

        <PasswordInput
          label="Password"
          id="password"
          placeholder="••••••••"
          value={formData.password}
          onChange={(e) => {
            setFormData({ ...formData, password: e.target.value });
            if (errors.password) setErrors({ ...errors, password: '' });
          }}
          error={errors.password ? errors.password[0] || errors.password : ''}
        />

        <PasswordInput
          label="Confirm password"
          id="confirmPassword"
          placeholder="••••••••"
          value={formData.confirmPassword}
          onChange={(e) => {
            setFormData({ ...formData, confirmPassword: e.target.value });
            if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: '' });
          }}
          error={errors.confirmPassword ? errors.confirmPassword[0] || errors.confirmPassword : ''}
        />

        <div className="auth-options">
          <label className="auth-checkbox-label" style={{ alignItems: 'flex-start' }}>
            <input 
              type="checkbox" 
              checked={formData.terms}
              onChange={(e) => {
                setFormData({ ...formData, terms: e.target.checked });
                if (errors.terms) setErrors({ ...errors, terms: '' });
              }}
              style={{ marginTop: '0.2rem' }}
            />
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              I agree to the Terms and Conditions
              {errors.terms && <span className="auth-error-msg">{errors.terms}</span>}
            </span>
          </label>
        </div>

        <button type="submit" className="auth-btn-primary" disabled={loading}>
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <div className="auth-footer">
        Already have an account? <Link to={ROUTES.LOGIN} className="auth-link">Sign in</Link>
      </div>
    </AuthLayout>
  );
}
