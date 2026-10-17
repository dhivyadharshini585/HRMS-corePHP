import { IconMenu } from '../common/Icons';
import NotificationDropdown from '../notifications/NotificationDropdown';
import { useAuthContext } from '../../context/AuthContext';

export default function Header({ toggleMobileMenu }) {
  const { user, logout, getPrimaryRole } = useAuthContext();

  return (
    <header className="app-header">
      <div className="header-left">
        <button className="icon-btn mobile-menu-btn" onClick={toggleMobileMenu} aria-label="Open navigation menu">
          <IconMenu />
        </button>
        <div className="header-title">HRMS Portal</div>
        <div className="header-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input type="search" placeholder="Search employees, payroll, policies..." aria-label="Search" />
        </div>
      </div>

      <div className="header-right">
        <NotificationDropdown />
        <div className="user-profile">
          <div className="avatar" aria-hidden="true">{user?.name?.charAt(0)?.toUpperCase() || 'U'}</div>
          <div className="user-info">
            <span className="user-name">{user?.name || 'User'}</span>
            <span className="user-role">{getPrimaryRole()}</span>
          </div>
          <button className="header-logout" onClick={logout}>Logout</button>
        </div>
      </div>
    </header>
  );
}
