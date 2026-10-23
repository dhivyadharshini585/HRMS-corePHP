import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getEmployees,
  getDepartments,
  getDesignations,
  deleteEmployee,
  getReportingChain,
  getOrganizationTree,
  getManageableEmployees
} from '../../services/employeeService';
import { useAuthContext } from '../../context/AuthContext';
import { ROUTES } from '../../constants/routes';
import '../../styles/employees.css';
import CustomSelect from '../../components/common/CustomSelect';

export default function Employees() {
  const navigate = useNavigate();
  const { user, hasPermission, hasAnyRole } = useAuthContext();

  const isSuperOrHrAdmin = hasAnyRole(['Super Admin', 'HR Admin', 'Admin', 'admin', 'super admin', 'hr admin']);
  const isHrExecutive = hasAnyRole(['HR Executive', 'hr executive']);
  const isManager = hasAnyRole(['Manager', 'manager']);
  const canSelectAnyManager = isSuperOrHrAdmin || isHrExecutive;

  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [managersList, setManagersList] = useState([]);

  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [designationId, setDesignationId] = useState('');
  const [status, setStatus] = useState('');

  // Reporting Hierarchy Side-Panel / Modal State
  const [isHierarchyOpen, setIsHierarchyOpen] = useState(false);
  const [hierarchyLoading, setHierarchyLoading] = useState(false);
  const [hierarchyError, setHierarchyError] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [upwardChain, setUpwardChain] = useState([]);
  const [downwardReports, setDownwardReports] = useState([]);

  // Fetch full employee directory
  const fetchEmployees = async (options = {}) => {
    setLoading(true);
    try {
      const data = await getEmployees({
        search,
        department_id: departmentId,
        designation_id: designationId,
        employment_status: status
      }, options);
      setEmployees(data.data || []);
    } catch (err) {
      if (err.name !== 'CanceledError') {
        console.error(err);
      }
    } finally {
      setLoading(false);
    }
  };

  // Load dropdowns and manager selector list
  useEffect(() => {
    const controller = new AbortController();

    const fetchLookups = async () => {
      try {
        const [depts, desigs] = await Promise.all([
          getDepartments({ signal: controller.signal }),
          getDesignations({ signal: controller.signal })
        ]);
        setDepartments(depts || []);
        setDesignations(desigs || []);

        // Load managers for selector if Super Admin, HR, or Manager
        if (canSelectAnyManager || isManager) {
          try {
            const manageableRes = await getManageableEmployees({ signal: controller.signal });
            const manageableList = manageableRes.data || [];

            if (canSelectAnyManager) {
              // Extract unique managers who have direct reports or manager designations
              const managerMap = new Map();
              manageableList.forEach(emp => {
                if (emp.manager_id && emp.manager_first_name) {
                  const mName = `${emp.manager_first_name} ${emp.manager_last_name || ''}`.trim();
                  managerMap.set(emp.manager_id, {
                    id: emp.manager_id,
                    name: mName,
                    code: emp.manager_code
                  });
                }
              });
              setManagersList(Array.from(managerMap.values()).sort((a, b) => a.name.localeCompare(b.name)));
            }
          } catch (e) {
            // Non-blocking lookup
          }
        }
      } catch (err) {
        if (err.name !== 'CanceledError') {
          console.error(err);
        }
      }
    };

    fetchLookups();
    return () => { controller.abort(); };
  }, [canSelectAnyManager, isManager]);

  useEffect(() => {
    const controller = new AbortController();

    const timer = setTimeout(() => {
      fetchEmployees({ signal: controller.signal });
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, departmentId, designationId, status]);

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this employee?')) {
      try {
        await deleteEmployee(id);
        fetchEmployees();
      } catch (err) {
        alert('Failed to delete employee');
      }
    }
  };

  // Helper to locate an employee node and its children in the organization tree
  const findNodeAndChildrenInTree = (nodes, targetId) => {
    if (!nodes || !Array.isArray(nodes)) return null;
    for (const node of nodes) {
      if (Number(node.id) === Number(targetId)) {
        return node;
      }
      if (node.children && node.children.length > 0) {
        const found = findNodeAndChildrenInTree(node.children, targetId);
        if (found) return found;
      }
    }
    return null;
  };

  // Open hierarchy for a given employee ID
  const handleOpenHierarchy = async (employeeId) => {
    if (!employeeId) return;
    setIsHierarchyOpen(true);
    setHierarchyLoading(true);
    setHierarchyError('');
    setSelectedEmployee(null);
    setUpwardChain([]);
    setDownwardReports([]);

    try {
      // 1. Fetch upward reporting chain using GET /api/organization/chain
      const chainPromise = getReportingChain({ employee_id: employeeId });
      // 2. Fetch full tree or manageable list to obtain direct/indirect downward reports
      const treePromise = getOrganizationTree();

      const [chainRes, treeRes] = await Promise.allSettled([chainPromise, treePromise]);

      if (chainRes.status === 'fulfilled' && chainRes.value?.employee) {
        setSelectedEmployee(chainRes.value.employee);
        setUpwardChain(chainRes.value.chain || []);
      } else {
        throw new Error(chainRes.reason?.response?.data?.message || 'Failed to load employee reporting chain.');
      }

      if (treeRes.status === 'fulfilled') {
        const treeRoots = treeRes.value?.roots || treeRes.value?.tree || (Array.isArray(treeRes.value) ? treeRes.value : []);
        const treeNode = findNodeAndChildrenInTree(treeRoots, employeeId);
        if (treeNode && treeNode.children) {
          setDownwardReports(treeNode.children);
        } else {
          setDownwardReports([]);
        }
      }
    } catch (err) {
      setHierarchyError(err.message || 'Unable to retrieve reporting hierarchy.');
    } finally {
      setHierarchyLoading(false);
    }
  };

  const handleCloseHierarchy = () => {
    setIsHierarchyOpen(false);
    setSelectedEmployee(null);
    setUpwardChain([]);
    setDownwardReports([]);
    setHierarchyError('');
  };

  return (
    <div className="employees-page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title">Employees</h1>
          <p style={{ color: '#64748B', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            {isManager && !isSuperOrHrAdmin ? 'Manage your team members and inspect reporting structures.' : 'Manage employee directory and organization reporting hierarchies.'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {/* Manager Quick Team Hierarchy Action */}
          {isManager && user?.employee_id && (
            <button
              className="btn btn-secondary"
              onClick={() => handleOpenHierarchy(user.employee_id)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem', fontWeight: 600 }}
              title="View your direct reporting chain and team hierarchy"
            >
              <span>👥 View My Team Hierarchy</span>
            </button>
          )}

          {hasPermission('employees.create') && (
            <button
              className="btn-primary"
              onClick={() => navigate(ROUTES.EMPLOYEE_ADD)}
            >
              Add Employee
            </button>
          )}
        </div>
      </div>

      <div className="filters-bar">
        <input
          type="text"
          placeholder="Search by name, email, or code..."
          className="filter-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <CustomSelect
          className="filter-select"
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
        >
          <option value="">All Departments</option>
          {departments.map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </CustomSelect>
        <CustomSelect
          className="filter-select"
          value={designationId}
          onChange={(e) => setDesignationId(e.target.value)}
        >
          <option value="">All Designations</option>
          {designations.map(d => (
            <option key={d.id} value={d.id}>{d.title}</option>
          ))}
        </CustomSelect>
        <CustomSelect
          className="filter-select"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
          <option value="Terminated">Terminated</option>
          <option value="On Leave">On Leave</option>
        </CustomSelect>

        {/* Manager/Team Hierarchy Selector for Super Admin and HR roles */}
        {canSelectAnyManager && managersList.length > 0 && (
          <CustomSelect
            className="filter-select"
            value=""
            onChange={(e) => {
              if (e.target.value) {
                handleOpenHierarchy(Number(e.target.value));
              }
            }}
          >
            <option value="">Select Manager Hierarchy...</option>
            {managersList.map(m => (
              <option key={m.id} value={m.id}>{m.name} ({m.code})</option>
            ))}
          </CustomSelect>
        )}
      </div>

      <div className="table-container">
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>Loading employees...</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Email</th>
                <th>Department</th>
                <th>Designation</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 ? (
                <tr><td colSpan="7" style={{ textAlign: 'center' }}>No employees found.</td></tr>
              ) : (
                employees.map(emp => (
                  <tr key={emp.id}>
                    <td>{emp.employee_code}</td>
                    <td style={{ fontWeight: 600, color: '#073B33' }}>{emp.first_name} {emp.last_name}</td>
                    <td>{emp.email}</td>
                    <td>{emp.department?.name || '-'}</td>
                    <td>{emp.designation?.title || '-'}</td>
                    <td>
                      <span className={`badge ${emp.employment_status.toLowerCase().replace(' ', '-')}`}>
                        {emp.employment_status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="actions-cell" style={{ display: 'inline-flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                        {/* Explicit Reporting Hierarchy Action */}
                        <button
                          className="btn-secondary"
                          onClick={() => handleOpenHierarchy(emp.id)}
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderColor: '#075E4B', color: '#075E4B' }}
                          title="View reporting chain & direct reports"
                        >
                          Hierarchy
                        </button>
                        <button
                          className="btn-secondary"
                          onClick={() => navigate(ROUTES.EMPLOYEE_VIEW.replace(':id', emp.id))}
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        >
                          View
                        </button>
                        {hasPermission('employees.update') && (
                          <button
                            className="btn-secondary"
                            onClick={() => navigate(ROUTES.EMPLOYEE_EDIT.replace(':id', emp.id))}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          >
                            Edit
                          </button>
                        )}
                        {hasPermission('employees.delete') && (
                          <button
                            className="btn-danger"
                            onClick={() => handleDelete(emp.id)}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* REPORTING-CHAIN SLIDE-OVER MODAL / PANEL                      */}
      {/* ------------------------------------------------------------- */}
      {isHierarchyOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            maxWidth: '720px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '1.75rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8E5', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                  Reporting Structure
                </span>
                <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#073B33', marginTop: '0.2rem' }}>
                  {selectedEmployee ? `${selectedEmployee.name} (${selectedEmployee.employee_code})` : 'Employee Hierarchy'}
                </h2>
              </div>
              <button
                onClick={handleCloseHierarchy}
                style={{ fontSize: '1.25rem', color: '#64748b', cursor: 'pointer', padding: '0.25rem 0.5rem' }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Error Message */}
            {hierarchyError && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: '6px', background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
                {hierarchyError}
              </div>
            )}

            {/* Loading State */}
            {hierarchyLoading ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>
                Loading reporting chain and team relationships...
              </div>
            ) : selectedEmployee ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                {/* 1. Target Employee Card */}
                <div style={{ background: '#F8FAF9', padding: '1rem', borderRadius: '8px', border: '1px solid #E2E8E5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#073B33' }}>
                      {selectedEmployee.name}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '0.15rem' }}>
                      {selectedEmployee.designation || 'No Designation'} • {selectedEmployee.department || 'No Department'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#94A3B8', marginTop: '0.15rem' }}>
                      {selectedEmployee.email}
                    </div>
                  </div>
                  <span className={`badge ${selectedEmployee.employment_status?.toLowerCase().replace(' ', '-') || 'active'}`}>
                    {selectedEmployee.employment_status || 'Active'}
                  </span>
                </div>

                {/* 2. Upward Reporting Chain (Supervisors) */}
                <div>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#073B33', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                    Upward Reporting Chain (Supervisors)
                  </h3>

                  {upwardChain.length === 0 ? (
                    <div style={{ padding: '1rem', background: '#F8FAF9', borderRadius: '6px', border: '1px solid #E2E8E5', color: '#64748B', fontSize: '0.875rem' }}>
                      ℹ️ <strong>Top-Level Executive:</strong> This employee does not report to any supervisor.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {upwardChain.map((mgr) => (
                        <div
                          key={mgr.id}
                          style={{
                            background: '#FFFFFF',
                            border: '1px solid #E2E8E5',
                            borderLeft: '4px solid #075E4B',
                            borderRadius: '6px',
                            padding: '0.75rem 1rem',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            cursor: 'pointer',
                            transition: 'background-color 0.15s ease'
                          }}
                          onClick={() => handleOpenHierarchy(mgr.id)}
                          title="Click to inspect this manager's hierarchy"
                        >
                          <div>
                            <span style={{ fontSize: '0.7rem', color: '#075E4B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              Level {mgr.level} • {mgr.relationship}
                            </span>
                            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0F172A', marginTop: '0.1rem' }}>
                              {mgr.name} <span style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 400 }}>({mgr.employee_code})</span>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
                              {mgr.designation} • {mgr.department}
                            </div>
                          </div>
                          <button
                            className="btn-secondary"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenHierarchy(mgr.id);
                            }}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          >
                            Inspect
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. Downward Hierarchy (Direct Reports / Team) */}
                <div>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#073B33', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                    Direct Team Reports ({downwardReports.length})
                  </h3>

                  {downwardReports.length === 0 ? (
                    <div style={{ padding: '1rem', background: '#F8FAF9', borderRadius: '6px', border: '1px solid #E2E8E5', color: '#64748B', fontSize: '0.875rem' }}>
                      No direct reports assigned to this employee.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
                      {downwardReports.map((sub) => (
                        <div
                          key={sub.id}
                          style={{
                            background: '#FFFFFF',
                            border: '1px solid #E2E8E5',
                            borderRadius: '6px',
                            padding: '0.75rem',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                        >
                          <div>
                            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0F172A' }}>
                              {sub.name} <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 400 }}>({sub.employee_code})</span>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
                              {sub.designation?.title || 'No Designation'}
                            </div>
                            {sub.children && sub.children.length > 0 && (
                              <div style={{ fontSize: '0.75rem', color: '#075E4B', fontWeight: 600, marginTop: '0.2rem' }}>
                                ↳ Manages {sub.children.length} direct report(s)
                              </div>
                            )}
                          </div>
                          <button
                            className="btn-secondary"
                            onClick={() => handleOpenHierarchy(sub.id)}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                            title="Inspect reporting chain for this team member"
                          >
                            Drill Down
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            ) : null}

            {/* Modal Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #E2E8E5', paddingTop: '1rem', marginTop: '1.5rem' }}>
              <button
                className="btn btn-secondary"
                onClick={handleCloseHierarchy}
                style={{ padding: '0.5rem 1.25rem' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
