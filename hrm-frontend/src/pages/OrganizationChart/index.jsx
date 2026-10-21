import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  getOrganizationTree, 
  getReportingChain, 
  getManageableEmployees, 
  getReportingManagerCandidates, 
  updateReportingRelationship 
} from '../../services/employeeService';
import { useAuthContext } from '../../context/AuthContext';
import { ROUTES } from '../../constants/routes';
import './OrganizationChart.css';

// Single Node in the Tree Canvas
const TreeNode = ({ node, collapsedMap, toggleCollapse, onInspectChain, canManageHierarchy, onReassign }) => {
  const isLeaf = !node.children || node.children.length === 0;
  const isCollapsed = collapsedMap[node.id] || false;
  const initials = (node.first_name?.[0] || '') + (node.last_name?.[0] || '');

  const nodeClass = node.manager_id === null
    ? 'root-node'
    : (isLeaf ? 'leaf-node' : 'manager-node');

  return (
    <div className="tree-branch-container">
      <div className={`tree-card-node ${nodeClass}`} id={`org-node-${node.id}`}>
        <div className="node-header">
          <div className="node-avatar">{initials || 'EM'}</div>
          <div className="node-name-block">
            <h4 className="node-name" title={node.name}>{node.name}</h4>
            <span className="node-code">{node.employee_code}</span>
          </div>
        </div>

        <div className="node-body">
          <div className="node-designation">
            {node.designation?.title || 'No Designation'}
          </div>
          <div className="node-meta">
            {node.department?.name && (
              <span className="badge-dept">{node.department.name}</span>
            )}
            <span className={`badge-status ${node.employment_status?.toLowerCase() === 'active' ? 'active' : 'inactive'}`}>
              {node.employment_status || 'Active'}
            </span>
            {node.manager_invalid && (
              <span className="badge-status inactive" title="Assigned manager is missing or inactive">
                Unlinked Manager
              </span>
            )}
          </div>
        </div>

        <div className="node-footer">
          {node.direct_reports_count > 0 ? (
            <span className="reports-count-pill">
              👥 {node.direct_reports_count} {node.direct_reports_count === 1 ? 'report' : 'reports'}
            </span>
          ) : (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)' }}>Individual Contributor</span>
          )}

          <div style={{ display: 'flex', gap: '0.35rem' }}>
            <button
              type="button"
              className="toggle-branch-btn"
              onClick={() => onInspectChain(node.id)}
              title="View upward reporting chain"
            >
              🔍 Chain
            </button>
            {canManageHierarchy && (
              <button
                type="button"
                className="reassign-node-btn"
                onClick={() => onReassign(node.id)}
                title="Reassign reporting manager"
              >
                🔗 Reassign
              </button>
            )}
            {!isLeaf && (
              <button
                type="button"
                className="toggle-branch-btn"
                onClick={() => toggleCollapse(node.id)}
                aria-label={isCollapsed ? 'Expand branch' : 'Collapse branch'}
              >
                {isCollapsed ? `+ (${node.children.length})` : '−'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Render Subordinates Row if expanded */}
      {!isLeaf && !isCollapsed && (
        <div className="children-container">
          <div className="children-row">
            {node.children.map(child => (
              <div key={child.id} className="child-branch">
                <TreeNode
                  node={child}
                  collapsedMap={collapsedMap}
                  toggleCollapse={toggleCollapse}
                  onInspectChain={onInspectChain}
                  canManageHierarchy={canManageHierarchy}
                  onReassign={onReassign}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default function OrganizationChart() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasRole } = useAuthContext();

  const canManageHierarchy = hasRole('Super Admin') || hasRole('HR Admin') || hasRole('Manager');
  const isAdmin = hasRole('Super Admin') || hasRole('HR Admin');

  const [treeData, setTreeData] = useState({ roots: [], orphans: [], total_employees: 0, active_employees: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Expand / Collapse State Map: { [nodeId]: boolean }
  const [collapsedMap, setCollapsedMap] = useState({});

  // Chain Search State
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [chainResult, setChainResult] = useState(null);
  const [chainLoading, setChainLoading] = useState(false);
  const [chainError, setChainError] = useState('');

  // Manage Reporting Relationships Modal State
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [manageableEmployees, setManageableEmployees] = useState([]);
  const [loadingManageable, setLoadingManageable] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [managerCandidates, setManagerCandidates] = useState([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [selectedManagerId, setSelectedManagerId] = useState('');
  const [manageSubmitting, setManageSubmitting] = useState(false);
  const [manageError, setManageError] = useState('');
  const [manageSuccess, setManageSuccess] = useState('');

  // Fetch Tree
  const fetchTree = useCallback(async (options = {}) => {
    setLoading(true);
    setError('');
    try {
      const data = await getOrganizationTree(options);
      setTreeData(data);
    } catch (err) {
      if (err.name !== 'CanceledError') {
        console.error(err);
        setError(err.response?.data?.message || 'Failed to load organization hierarchy.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchTree({ signal: controller.signal });
    return () => controller.abort();
  }, [fetchTree]);

  // Inspect Upward Chain by employee ID or search query
  const executeSearch = useCallback(async (queryOrId) => {
    if (!queryOrId) return;
    setChainLoading(true);
    setChainError('');
    try {
      const params = typeof queryOrId === 'number'
        ? { employee_id: queryOrId }
        : { search: queryOrId };

      const res = await getReportingChain(params);
      setChainResult(res);
    } catch (err) {
      console.error(err);
      setChainError(err.response?.data?.message || 'Employee not found or reporting chain unavailable.');
      setChainResult(null);
    } finally {
      setChainLoading(false);
    }
  }, []);

  // Initial trigger if URL has ?search=
  useEffect(() => {
    const query = searchParams.get('search');
    if (query) {
      setSearchQuery(query);
      executeSearch(query);
    }
  }, [searchParams, executeSearch]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setSearchParams({ search: searchQuery.trim() });
      executeSearch(searchQuery.trim());
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setChainResult(null);
    setChainError('');
    setSearchParams({});
  };

  const toggleCollapse = (nodeId) => {
    setCollapsedMap(prev => ({
      ...prev,
      [nodeId]: !prev[nodeId]
    }));
  };

  const handleExpandAll = () => {
    setCollapsedMap({});
  };

  const handleCollapseAll = () => {
    const newCollapsed = {};
    const traverse = (node) => {
      if (node.children && node.children.length > 0) {
        newCollapsed[node.id] = true;
        node.children.forEach(traverse);
      }
    };
    treeData.roots.forEach(traverse);
    setCollapsedMap(newCollapsed);
  };

  // Open modal and load candidates
  const loadCandidatesForEmployee = async (empId) => {
    if (!empId) {
      setManagerCandidates([]);
      return;
    }
    setLoadingCandidates(true);
    setManageError('');
    try {
      const res = await getReportingManagerCandidates(empId);
      setManagerCandidates(res?.data || res || []);
    } catch (err) {
      console.error(err);
      setManageError(err.response?.data?.message || 'Failed to load eligible managers.');
      setManagerCandidates([]);
    } finally {
      setLoadingCandidates(false);
    }
  };

  const openManageModal = async (preselectedId = null) => {
    setIsManageModalOpen(true);
    setManageError('');
    setManageSuccess('');
    setLoadingManageable(true);
    setSelectedEmployeeId(preselectedId ? String(preselectedId) : '');
    setSelectedManagerId('');
    setManagerCandidates([]);

    try {
      const res = await getManageableEmployees();
      const emps = res?.data || res || [];
      setManageableEmployees(emps);

      if (preselectedId) {
        const found = emps.find(e => String(e.id) === String(preselectedId));
        if (found) {
          setSelectedManagerId(found.manager_id !== null ? String(found.manager_id) : '');
          loadCandidatesForEmployee(found.id);
        } else {
          setManageError('You are not authorized to manage reporting relationships for this employee.');
        }
      }
    } catch (err) {
      console.error(err);
      setManageError(err.response?.data?.message || 'Failed to load manageable employees.');
    } finally {
      setLoadingManageable(false);
    }
  };

  const handleEmployeeChange = (e) => {
    const empId = e.target.value;
    setSelectedEmployeeId(empId);
    setManageError('');
    setManageSuccess('');
    if (empId) {
      const found = manageableEmployees.find(emp => String(emp.id) === String(empId));
      setSelectedManagerId(found && found.manager_id !== null ? String(found.manager_id) : '');
      loadCandidatesForEmployee(empId);
    } else {
      setSelectedManagerId('');
      setManagerCandidates([]);
    }
  };

  const handleSaveRelationship = async (e) => {
    e.preventDefault();
    if (!selectedEmployeeId) {
      setManageError('Please select an employee.');
      return;
    }
    if (!isAdmin && (selectedManagerId === '' || selectedManagerId === null)) {
      setManageError('Please select a new reporting manager.');
      return;
    }

    setManageSubmitting(true);
    setManageError('');
    setManageSuccess('');

    try {
      const payload = {
        employee_id: parseInt(selectedEmployeeId, 10),
        manager_id: selectedManagerId !== '' ? parseInt(selectedManagerId, 10) : null
      };

      const res = await updateReportingRelationship(payload);
      setManageSuccess(res?.message || 'Reporting relationship updated successfully.');

      // Refresh tree and upward reporting chain
      fetchTree();
      if (chainResult && String(chainResult.employee?.id) === String(selectedEmployeeId)) {
        executeSearch(parseInt(selectedEmployeeId, 10));
      }

      // Auto close after brief moment
      setTimeout(() => {
        setIsManageModalOpen(false);
        setManageSuccess('');
      }, 1200);
    } catch (err) {
      console.error(err);
      if (err.response?.data?.errors?.manager_id) {
        setManageError(err.response.data.errors.manager_id[0]);
      } else {
        setManageError(err.response?.data?.message || 'Failed to update reporting relationship.');
      }
    } finally {
      setManageSubmitting(false);
    }
  };

  return (
    <div className="org-chart-page">
      {/* Page Header */}
      <div className="org-chart-header">
        <div>
          <h1 className="org-chart-title">Organization Chart</h1>
          <p className="org-chart-subtitle">
            Company reporting hierarchy, leadership structures, and chain of command.
          </p>
          <div className="org-metrics-row">
            <span className="org-metric-pill">
              Total Employees: <strong>{treeData.total_employees}</strong>
            </span>
            <span className="org-metric-pill">
              Active: <strong>{treeData.active_employees}</strong>
            </span>
            <span className="org-metric-pill">
              Executive Roots: <strong>{treeData.roots.length}</strong>
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {canManageHierarchy && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => openManageModal()}
              style={{ fontSize: '0.85rem', padding: '0.4rem 0.85rem' }}
            >
              🔗 Manage Reporting Relationships
            </button>
          )}
          <button
            type="button"
            className="btn-secondary"
            onClick={handleExpandAll}
            style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
          >
            Expand All
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleCollapseAll}
            style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
          >
            Collapse All
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate(ROUTES.EMPLOYEES)}
            style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
          >
            Employee Directory
          </button>
        </div>
      </div>

      {/* Upward Chain Search Bar */}
      <div className="org-search-container">
        <form onSubmit={handleSearchSubmit} className="org-search-form">
          <input
            type="text"
            className="org-search-input"
            placeholder="Search employee name, code, or email to view reporting chain..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button type="submit" className="btn-primary" style={{ padding: '0.5rem 1rem' }} disabled={chainLoading}>
            {chainLoading ? 'Searching...' : 'Inspect Chain'}
          </button>
          {(searchQuery || chainResult || chainError) && (
            <button
              type="button"
              className="btn-secondary"
              onClick={clearSearch}
              style={{ padding: '0.5rem 0.85rem' }}
            >
              Clear
            </button>
          )}
        </form>

        {chainError && (
          <div style={{ marginTop: '0.75rem', color: '#b91c1c', fontSize: '0.85rem' }}>
            ⚠️ {chainError}
          </div>
        )}
      </div>

      {/* Upward Reporting Chain Visualizer */}
      {chainResult && (
        <div className="reporting-chain-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, color: '#1e3a8a' }}>
              Reporting Chain for: {chainResult.employee.name} ({chainResult.employee.employee_code})
            </h3>
            <button
              type="button"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: '#64748b' }}
              onClick={() => setChainResult(null)}
              title="Close chain view"
            >
              ✕
            </button>
          </div>

          <p style={{ fontSize: '0.825rem', color: '#475569', margin: '0 0 0.5rem 0' }}>
            Upward chain of command from selected employee to highest-level executive:
          </p>

          <div className="chain-steps-container">
            {/* Target Employee */}
            <div className="chain-step-node is-target">
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase' }}>
                Selected Employee
              </span>
              <div style={{ fontWeight: 600, fontSize: '0.92rem', color: '#1e293b' }}>
                {chainResult.employee.name}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                {chainResult.employee.designation} • {chainResult.employee.department}
              </div>
            </div>

            {chainResult.chain.length === 0 ? (
              <>
                <span className="chain-arrow">→</span>
                <div className="chain-step-node is-root">
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#059669', textTransform: 'uppercase' }}>
                    Top Level (Root)
                  </span>
                  <div style={{ fontWeight: 600, fontSize: '0.92rem', color: '#065f46' }}>
                    No Superior Manager
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    Directly reports to Board / Independent
                  </div>
                </div>
              </>
            ) : (
              chainResult.chain.map((m, idx) => (
                <React.Fragment key={m.id}>
                  <span className="chain-arrow">→</span>
                  <div className={`chain-step-node ${idx === chainResult.chain.length - 1 ? 'is-root' : ''}`}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: idx === chainResult.chain.length - 1 ? '#059669' : '#475569', textTransform: 'uppercase' }}>
                      {m.relationship}
                    </span>
                    <div style={{ fontWeight: 600, fontSize: '0.92rem', color: '#1e293b' }}>
                      {m.name} ({m.employee_code})
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                      {m.designation} • {m.department}
                    </div>
                  </div>
                </React.Fragment>
              ))
            )}
          </div>
        </div>
      )}

      {/* Main Hierarchy Canvas */}
      {loading ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Loading organization chart...
        </div>
      ) : error ? (
        <div style={{ padding: '2rem', backgroundColor: '#fee2e2', color: '#b91c1c', borderRadius: '8px', textAlign: 'center' }}>
          {error}
          <div style={{ marginTop: '1rem' }}>
            <button className="btn-primary" onClick={() => fetchTree()}>Retry</button>
          </div>
        </div>
      ) : treeData.roots.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          No active employees or hierarchy data available.
        </div>
      ) : (
        <div className="org-tree-canvas">
          <div className="roots-flex-container">
            {treeData.roots.map(rootNode => (
              <TreeNode
                key={rootNode.id}
                node={rootNode}
                collapsedMap={collapsedMap}
                toggleCollapse={toggleCollapse}
                onInspectChain={(id) => executeSearch(id)}
                canManageHierarchy={canManageHierarchy}
                onReassign={(id) => openManageModal(id)}
              />
            ))}
          </div>

          {/* Unattached / Cyclic Orphans Section if any legacy data exists */}
          {treeData.orphans && treeData.orphans.length > 0 && (
            <div style={{ marginTop: '3rem', borderTop: '2px dashed #fca5a5', paddingTop: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#dc2626', marginBottom: '0.5rem' }}>
                ⚠️ Detached / Cyclic Employee Nodes ({treeData.orphans.length})
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                These employees have self-referential or corrupted reporting relationships in legacy data.
              </p>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                {treeData.orphans.map(orphan => (
                  <TreeNode
                    key={orphan.id}
                    node={orphan}
                    collapsedMap={collapsedMap}
                    toggleCollapse={toggleCollapse}
                    onInspectChain={(id) => executeSearch(id)}
                    canManageHierarchy={canManageHierarchy}
                    onReassign={(id) => openManageModal(id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manage Reporting Relationships Modal */}
      {isManageModalOpen && (
        <div className="manage-relationship-modal-overlay" onClick={() => !manageSubmitting && setIsManageModalOpen(false)}>
          <div className="manage-relationship-modal" onClick={e => e.stopPropagation()}>
            <div className="manage-modal-header">
              <h3 className="manage-modal-title">Manage Reporting Relationship</h3>
              <button
                type="button"
                className="manage-modal-close"
                onClick={() => !manageSubmitting && setIsManageModalOpen(false)}
                title="Close modal"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveRelationship}>
              <div className="manage-modal-body">
                {manageSuccess && (
                  <div style={{ backgroundColor: '#dcfce7', color: '#15803d', padding: '0.75rem 1rem', borderRadius: '6px', fontSize: '0.875rem' }}>
                    ✓ {manageSuccess}
                  </div>
                )}

                {manageError && (
                  <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '0.75rem 1rem', borderRadius: '6px', fontSize: '0.875rem' }}>
                    ⚠️ {manageError}
                  </div>
                )}

                {/* Select Employee */}
                <div className="manage-field-group">
                  <label className="manage-field-label">Select Employee *</label>
                  {loadingManageable ? (
                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Loading manageable team members...</div>
                  ) : manageableEmployees.length === 0 ? (
                    <div style={{ padding: '0.75rem', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.85rem', color: '#64748b' }}>
                      No subordinates available to manage in your reporting scope.
                    </div>
                  ) : (
                    <select
                      className="manage-field-select"
                      value={selectedEmployeeId}
                      onChange={handleEmployeeChange}
                      required
                    >
                      <option value="">-- Choose an employee --</option>
                      {manageableEmployees.map(emp => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} ({emp.employee_code}) - {emp.designation}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Current Reporting Manager Details */}
                {selectedEmployeeId && (
                  <div className="current-manager-card">
                    <div className="current-manager-title">Current Reporting Manager</div>
                    <div className="current-manager-value">
                      {(() => {
                        const selected = manageableEmployees.find(e => String(e.id) === String(selectedEmployeeId));
                        if (!selected) return 'N/A';
                        if (!selected.manager_id) {
                          return <span style={{ color: '#059669' }}>🏛️ None (Top-Level Executive / Independent)</span>;
                        }
                        if (selected.current_manager) {
                          return `👤 ${selected.current_manager.name} (${selected.current_manager.employee_code})`;
                        }
                        return `Manager ID: #${selected.manager_id}`;
                      })()}
                    </div>
                  </div>
                )}

                {/* Assign New Reporting Manager */}
                {selectedEmployeeId && (
                  <div className="manage-field-group">
                    <label className="manage-field-label">New Reporting Manager *</label>
                    {loadingCandidates ? (
                      <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Loading eligible manager candidates...</div>
                    ) : managerCandidates.length === 0 ? (
                      <div style={{ padding: '0.75rem', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.85rem', color: '#64748b' }}>
                        No eligible reporting managers available in the organization.
                      </div>
                    ) : (
                      <select
                        className="manage-field-select"
                        value={selectedManagerId}
                        onChange={(e) => setSelectedManagerId(e.target.value)}
                      >
                        {isAdmin && (
                          <option value="">🏛️ No Manager (Top-Level Executive)</option>
                        )}
                        {!isAdmin && (
                          <option value="" disabled>-- Select a reporting manager --</option>
                        )}
                        {managerCandidates.map(c => (
                          <option key={c.id} value={c.id}>
                            👤 {c.name} ({c.employee_code}) - {c.designation} ({c.department})
                          </option>
                        ))}
                      </select>
                    )}
                    <small style={{ color: '#64748b', fontSize: '0.78rem', marginTop: '0.2rem' }}>
                      {isAdmin
                        ? 'Administrators can assign to any active manager across the organization or designate as top-level.'
                        : 'Managers can select eligible reporting managers from across the entire organization.'}
                    </small>
                  </div>
                )}
              </div>

              <div className="manage-modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsManageModalOpen(false)}
                  disabled={manageSubmitting}
                  style={{ padding: '0.5rem 1rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-manage-primary"
                  disabled={manageSubmitting || !selectedEmployeeId || (!isAdmin && selectedManagerId === '')}
                >
                  {manageSubmitting ? 'Saving Relationship...' : 'Save Relationship'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
