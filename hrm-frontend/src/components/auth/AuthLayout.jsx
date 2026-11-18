import '../../styles/auth.css';

export default function AuthLayout({ children }) {
  return (
    <div className="auth-page">
      <main className="auth-card" aria-label="BSmartHR by BENIEVA authentication">
        <section className="auth-brand-panel">
          <div className="auth-brand-glow auth-brand-glow-one" />
          <div className="auth-brand-glow auth-brand-glow-two" />
          <div className="auth-brand-content">
            <div className="auth-logo-card">
              <img
                src="/assets/bsmarthr-logo.jpg"
                alt="BSmartHR by BENIEVA"
                className="auth-logo-img"
              />
            </div>
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
