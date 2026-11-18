import { IconMenu } from '../common/Icons';
import NotificationDropdown from '../notifications/NotificationDropdown';
import GlobalSearch from './GlobalSearch';
import { useAuthContext } from '../../context/AuthContext';

export default function Header({ toggleMobileMenu }) {
  const { user, logout, getPrimaryRole } = useAuthContext();

  return (
    <header className="app-header">
      <div className="header-left">
        <button className="icon-btn mobile-menu-btn" onClick={toggleMobileMenu} aria-label="Open navigation menu">
          <IconMenu />
        </button>
        <div className="header-brand-box">
          <img
            src="/assets/bsmarthr-logo.jpg"
            alt="BSmartHR by BENIEVA"
            className="header-brand-img"
          />
        </div>
        <div className="header-divider" aria-hidden="true" />
        <div className="header-title">BSmartHR Portal</div>
        <GlobalSearch />
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
