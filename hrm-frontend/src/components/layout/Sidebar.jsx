import { NavLink } from 'react-router-dom';
import { ROUTES } from '../../constants/routes';
import { 
  IconDashboard, IconUsers, IconFolder, IconBriefcase,
  IconCalendar, IconClock, IconFileText, IconDollar, IconRupee,
  IconTrendingUp, IconBarChart, IconBook, IconPackage, IconHelp, IconShield,
  IconChevronLeft, IconChevronRight
} from '../common/Icons';
import { useAuthContext } from '../../context/AuthContext';
import { ROLE_NAVIGATION } from '../../config/roleConfig';

const ICONS = {
  IconDashboard: <IconDashboard />,
  IconUsers: <IconUsers />,
  IconFolder: <IconFolder />,
  IconBriefcase: <IconBriefcase />,
  IconCalendar: <IconCalendar />,
  IconClock: <IconClock />,
  IconFileText: <IconFileText />,
  IconDollar: <IconRupee />,
  IconRupee: <IconRupee />,
  IconTrendingUp: <IconTrendingUp />,
  IconBarChart: <IconBarChart />,
  IconBook: <IconBook />,
  IconPackage: <IconPackage />,
  IconHelp: <IconHelp />,
  IconShield: <IconShield />,
};

export default function Sidebar({ collapsed, setCollapsed, mobileOpen, setMobileOpen }) {
  const { getPrimaryRole } = useAuthContext();
  const primaryRole = getPrimaryRole();
  const navItems = ROLE_NAVIGATION[primaryRole] || ROLE_NAVIGATION['Employee'];

  const handleNavClick = () => {
    // Close mobile menu when a link is clicked
    if (mobileOpen) {
      setMobileOpen(false);
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      <div 
        className={`sidebar-backdrop ${mobileOpen ? 'visible' : ''}`}
        onClick={() => setMobileOpen(false)}
      ></div>

      <aside className={`app-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-logo">
          <div className="sidebar-brand-box">
            <img
              src="/assets/bsmarthr-logo.jpg"
              alt="BSmartHR by BENIEVA"
              className="sidebar-brand-img"
            />
          </div>
        </div>
        
        <div className="sidebar-section-label">
          PLATFORM NAVIGATION
        </div>
        
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink 
              key={item.path} 
              to={item.path} 
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              onClick={handleNavClick}
            >
              <div className="nav-link-icon">
                {ICONS[item.iconName]}
              </div>
              <span className="nav-link-text">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button 
            className="collapse-btn" 
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <IconChevronRight /> : <IconChevronLeft />}
          </button>
        </div>
      </aside>
    </>
  );
}
