import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../../context/AuthContext';
import { ROLE_NAVIGATION } from '../../config/roleConfig';
import { getEmployees } from '../../services/employeeService';
import {
  IconSearch,
  IconX,
  IconUsers,
  IconFolder,
  IconBriefcase,
  IconCalendar,
  IconClock,
  IconFileText,
  IconRupee,
  IconTrendingUp,
  IconBarChart,
  IconBook,
  IconPackage,
  IconHelp,
  IconShield,
  IconDashboard
} from '../common/Icons';

const ICON_COMPONENTS = {
  IconDashboard: <IconDashboard width="16" height="16" />,
  IconUsers: <IconUsers width="16" height="16" />,
  IconFolder: <IconFolder width="16" height="16" />,
  IconBriefcase: <IconBriefcase width="16" height="16" />,
  IconCalendar: <IconCalendar width="16" height="16" />,
  IconClock: <IconClock width="16" height="16" />,
  IconFileText: <IconFileText width="16" height="16" />,
  IconDollar: <IconRupee width="16" height="16" />,
  IconRupee: <IconRupee width="16" height="16" />,
  IconTrendingUp: <IconTrendingUp width="16" height="16" />,
  IconBarChart: <IconBarChart width="16" height="16" />,
  IconBook: <IconBook width="16" height="16" />,
  IconPackage: <IconPackage width="16" height="16" />,
  IconHelp: <IconHelp width="16" height="16" />,
  IconShield: <IconShield width="16" height="16" />,
};

// Keyword synonym mapping for enhanced navigation discovery
const MODULE_KEYWORDS = {
  'Attendance': ['checkin', 'check in', 'checkout', 'check out', 'punch', 'correction', 'attendance correction'],
  'My Attendance': ['checkin', 'check in', 'checkout', 'check out', 'punch', 'correction'],
  'Leave': ['vacation', 'time off', 'holiday leave', 'leave request', 'sick leave'],
  'Leave Approvals': ['leave request', 'vacation approval', 'pending leave'],
  'My Leave': ['vacation', 'time off', 'apply leave'],
  'Team Requests': ['requisition', 'hiring request', 'team headcount', 'team request'],
  'Employees': ['staff', 'directory', 'people', 'team', 'worker'],
  'My Team': ['subordinates', 'direct reports', 'team members'],
  'Payroll': ['salary', 'payslip', 'compensation', 'wages', 'earnings'],
  'Performance': ['appraisal', 'review', 'rating', 'feedback'],
  'Jobs': ['openings', 'vacancies', 'careers', 'hiring', 'recruitment'],
  'Candidates': ['applicants', 'resumes', 'job applicants'],
  'Helpdesk': ['tickets', 'support', 'issues', 'help'],
  'Policies': ['guidelines', 'rules', 'handbook', 'policy'],
  'Documents': ['files', 'contracts', 'letters', 'forms'],
  'Timesheets': ['hours', 'weekly log', 'time entry'],
};

export default function GlobalSearch() {
  const { getPrimaryRole } = useAuthContext();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [employeeResults, setEmployeeResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const primaryRole = getPrimaryRole() || 'Employee';
  const authorizedNavItems = useMemo(() => {
    return ROLE_NAVIGATION[primaryRole] || ROLE_NAVIGATION['Employee'] || [];
  }, [primaryRole]);

  // Can this role search employee records? (Super Admin, HR Admin, HR Executive, Manager, Finance/Payroll Admin)
  const canSearchEmployees = useMemo(() => {
    return ['Super Admin', 'HR Admin', 'HR Executive', 'Manager', 'Finance/Payroll Admin'].includes(primaryRole);
  }, [primaryRole]);

  // Filter matching navigation items
  const matchedNavItems = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return [];

    return authorizedNavItems.filter((item) => {
      const labelMatch = item.label.toLowerCase().includes(trimmed);
      const pathMatch = item.path.toLowerCase().includes(trimmed);
      const keywords = MODULE_KEYWORDS[item.label] || [];
      const keywordMatch = keywords.some((kw) => kw.includes(trimmed) || trimmed.includes(kw));
      return labelMatch || pathMatch || keywordMatch;
    });
  }, [authorizedNavItems, query]);

  // Search employee records asynchronously
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || !canSearchEmployees) {
      setEmployeeResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const response = await getEmployees({ search: trimmed }, { signal: controller.signal });
        const list = Array.isArray(response)
          ? response
          : (Array.isArray(response?.data) ? response.data : (response?.employees || []));
        setEmployeeResults(list.slice(0, 5)); // Limit to top 5 matching records
      } catch (err) {
        if (err.name !== 'CanceledError') {
          setEmployeeResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, canSearchEmployees]);

  // Combine results for keyboard navigation
  const allResults = useMemo(() => {
    const list = [];
    matchedNavItems.forEach((item) => {
      list.push({ type: 'page', data: item });
    });
    employeeResults.forEach((emp) => {
      list.push({ type: 'employee', data: emp });
    });
    return list;
  }, [matchedNavItems, employeeResults]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setSelectedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectResult = useCallback((item) => {
    if (item.type === 'page') {
      navigate(item.data.path);
    } else if (item.type === 'employee') {
      navigate(`/employees/${item.data.id}`);
    }
    setIsOpen(false);
    setQuery('');
    setSelectedIndex(-1);
  }, [navigate]);

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setSelectedIndex(-1);
      inputRef.current?.blur();
      return;
    }

    if (!isOpen || allResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < allResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : allResults.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < allResults.length) {
        handleSelectResult(allResults[selectedIndex]);
      }
    }
  };

  const handleClear = () => {
    setQuery('');
    setIsOpen(false);
    setSelectedIndex(-1);
    setEmployeeResults([]);
    inputRef.current?.focus();
  };

  const hasQuery = query.trim().length > 0;
  const hasResults = allResults.length > 0;

  return (
    <div className="header-search-container" ref={containerRef} style={{ position: 'relative' }}>
      <div className="header-search">
        <IconSearch width="14" height="14" aria-hidden="true" style={{ color: 'var(--text-muted, #94a3b8)', flexShrink: 0 }} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setSelectedIndex(-1);
          }}
          onFocus={() => {
            if (query.trim()) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search modules, pages, employees..."
          aria-label="Search"
          autoComplete="off"
        />

        {loading && (
          <div
            className="search-spinner"
            style={{
              width: '14px',
              height: '14px',
              border: '2px solid rgba(0,0,0,0.1)',
              borderTopColor: 'var(--primary-color, #064E3B)',
              borderRadius: '50%',
              animation: 'spin 0.6s linear infinite',
              flexShrink: 0,
            }}
          />
        )}

        {hasQuery && !loading && (
          <button
            type="button"
            onClick={handleClear}
            className="search-clear-btn"
            aria-label="Clear search query"
            style={{
              background: 'transparent',
              border: 'none',
              padding: '2px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted, #94a3b8)',
              borderRadius: '50%',
            }}
          >
            <IconX width="14" height="14" />
          </button>
        )}
      </div>

      {/* Search Dropdown */}
      {isOpen && hasQuery && (
        <div
          className="search-dropdown"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            width: 'max(100%, 340px)',
            maxHeight: '380px',
            overflowY: 'auto',
            background: 'var(--bg-surface, #ffffff)',
            borderRadius: '12px',
            border: '1px solid var(--border-color, #e2e8f0)',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            zIndex: 1000,
            padding: '6px 0',
          }}
        >
          {loading && allResults.length === 0 ? (
            <div
              style={{
                padding: '16px 20px',
                textAlign: 'center',
                color: 'var(--text-muted, #64748b)',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <div
                style={{
                  width: '14px',
                  height: '14px',
                  border: '2px solid rgba(0,0,0,0.1)',
                  borderTopColor: 'var(--primary-color, #064E3B)',
                  borderRadius: '50%',
                  animation: 'spin 0.6s linear infinite',
                }}
              />
              Searching...
            </div>
          ) : !hasResults ? (
            <div
              style={{
                padding: '18px 20px',
                textAlign: 'center',
                color: 'var(--text-muted, #64748b)',
                fontSize: '13px',
              }}
            >
              No results found for &ldquo;<strong>{query}</strong>&rdquo;
            </div>
          ) : (
            <>
              {/* Pages & Modules Section */}
              {matchedNavItems.length > 0 && (
                <div>
                  <div
                    style={{
                      padding: '6px 14px 4px',
                      fontSize: '11px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--text-muted, #94a3b8)',
                    }}
                  >
                    Pages & Modules
                  </div>
                  {matchedNavItems.map((item) => {
                    const idx = allResults.findIndex((r) => r.type === 'page' && r.data.path === item.path);
                    const isSelected = idx === selectedIndex;
                    return (
                      <div
                        key={item.path}
                        onClick={() => handleSelectResult({ type: 'page', data: item })}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        style={{
                          padding: '8px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          cursor: 'pointer',
                          background: isSelected ? 'var(--bg-surface-hover, #f1f5f9)' : 'transparent',
                          transition: 'background 0.12s ease',
                        }}
                      >
                        <div
                          style={{
                            color: isSelected ? 'var(--primary-color, #064E3B)' : 'var(--text-secondary, #64748b)',
                            display: 'flex',
                            alignItems: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {ICON_COMPONENTS[item.iconName] || <IconFolder width="16" height="16" />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: '13px',
                              fontWeight: isSelected ? 600 : 500,
                              color: 'var(--text-primary, #0f172a)',
                            }}
                          >
                            {item.label}
                          </div>
                          <div
                            style={{
                              fontSize: '11px',
                              color: 'var(--text-muted, #94a3b8)',
                            }}
                          >
                            {item.path}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Employee Records Section */}
              {employeeResults.length > 0 && (
                <div style={{ borderTop: matchedNavItems.length > 0 ? '1px solid var(--border-color, #e2e8f0)' : 'none', marginTop: '4px', paddingTop: '4px' }}>
                  <div
                    style={{
                      padding: '6px 14px 4px',
                      fontSize: '11px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--text-muted, #94a3b8)',
                    }}
                  >
                    Employees
                  </div>
                  {employeeResults.map((emp) => {
                    const idx = allResults.findIndex((r) => r.type === 'employee' && r.data.id === emp.id);
                    const isSelected = idx === selectedIndex;
                    const fullName = `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || emp.name || 'Unnamed Employee';
                    const subText = [emp.employee_code, emp.designation?.title || emp.department?.name].filter(Boolean).join(' • ');

                    return (
                      <div
                        key={emp.id}
                        onClick={() => handleSelectResult({ type: 'employee', data: emp })}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        style={{
                          padding: '8px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          cursor: 'pointer',
                          background: isSelected ? 'var(--bg-surface-hover, #f1f5f9)' : 'transparent',
                          transition: 'background 0.12s ease',
                        }}
                      >
                        <div
                          style={{
                            width: '26px',
                            height: '26px',
                            borderRadius: '50%',
                            background: 'var(--primary-color, #064E3B)',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '11px',
                            fontWeight: 600,
                            flexShrink: 0,
                          }}
                        >
                          {fullName.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: '13px',
                              fontWeight: isSelected ? 600 : 500,
                              color: 'var(--text-primary, #0f172a)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {fullName}
                          </div>
                          <div
                            style={{
                              fontSize: '11px',
                              color: 'var(--text-muted, #94a3b8)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {subText || emp.email}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

