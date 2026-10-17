export default function AuthInput({
  label,
  id,
  error,
  ...props
}) {
  return (
    <div className="auth-field">
      {label && (
        <label htmlFor={id} className="auth-label">
          {label}
        </label>
      )}
      <div className="auth-input-wrapper">
        <input
          id={id}
          className={`auth-input ${error ? 'error' : ''}`}
          {...props}
        />
      </div>
      {error && <span className="auth-error-msg">{error}</span>}
    </div>
  );
}
