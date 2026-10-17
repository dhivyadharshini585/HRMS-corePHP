import '../../styles/auth.css';

export default function AuthLayout({ children }) {
  return (
    <div className="auth-page">
      <main className="auth-card" aria-label="HRMS authentication">
        <section className="auth-brand-panel">
          <div className="auth-brand-glow auth-brand-glow-one" />
          <div className="auth-brand-glow auth-brand-glow-two" />
          <div className="auth-brand-content">
            <div className="auth-logo" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2 2 7l10 5 10-5-10-5Z" />
                <path d="m2 17 10 5 10-5" />
                <path d="m2 12 10 5 10-5" />
              </svg>
            </div>
            <h1>HRMS</h1>
            <p className="auth-brand-subtitle">HUMAN RESOURCE<br />MANAGEMENT SYSTEM</p>
            <span className="auth-brand-divider" />
            <p className="auth-brand-tagline">People • Processes • Productivity<br />for a Better Tomorrow</p>
          </div>
        </section>

        <section className="auth-form-panel">
          <div className="auth-form-container">{children}</div>
        </section>
      </main>
    </div>
  );
}
