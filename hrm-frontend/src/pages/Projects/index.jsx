import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { projectService } from '../../services/projectService';
import { getEmployees } from '../../services/employeeService';
import { useAuthContext } from '../../context/AuthContext';
import { IconFolder, IconPlus, IconSearch, IconClock, IconAlertCircle } from '../../components/common/Icons';
import CustomSelect from '../../components/common/CustomSelect';

export default function Projects() {
  const { user, hasPermission, hasRole } = useAuthContext();

  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  // Filters & Pagination
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);

  // Modals state
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [projectForm, setProjectForm] = useState({
    name: '',
    client: '',
    description: '',
    manager_id: '',
    status: 'Active',
    start_date: '',
    end_date: '',
  });

  const [selectedProject, setSelectedProject] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Task form state
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskForm, setTaskForm] = useState({ name: '', description: '', status: 'To Do' });
  const [editingTaskId, setEditingTaskId] = useState(null);

  const canManage = hasPermission ? (hasPermission('projects.manage') || hasRole('Super Admin') || hasRole('HR Admin')) : false;

  useEffect(() => {
    fetchProjects();
  }, [searchTerm, statusFilter, currentPage]);

  useEffect(() => {
    fetchEmployeeOptions();
  }, []);

  const fetchEmployeeOptions = async () => {
    try {
      const res = await getEmployees({ per_page: 100 });
      const empList = res.data || (Array.isArray(res) ? res : []);
      setEmployees(empList);
    } catch (err) {
      console.error('Failed to fetch employee options', err);
    }
  };

  const fetchProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page: currentPage, per_page: 15 };
      if (searchTerm) params.search = searchTerm;
      if (statusFilter) params.status = statusFilter;

      const res = await projectService.getProjects(params);
      if (res.data) {
        setProjects(res.data);
        setCurrentPage(res.current_page || 1);
        setLastPage(res.last_page || 1);
      } else if (Array.isArray(res)) {
        setProjects(res);
      }
    } catch (err) {
      console.error(err);
      if (err.response?.status === 403) {
        setError('Unauthorized to view projects.');
      } else {
        setError('Failed to load projects.');
      }
    } finally {
      setLoading(false);
    }
  };

  const openProjectModal = (proj = null) => {
    setError(null);
    setSuccessMsg('');
    if (proj) {
      setEditingProject(proj);
      setProjectForm({
        name: proj.name || '',
        client: proj.client || '',
        description: proj.description || '',
        manager_id: proj.manager_id || '',
        status: proj.status || 'Active',
        start_date: proj.start_date || '',
        end_date: proj.end_date || '',
      });
    } else {
      setEditingProject(null);
      setProjectForm({
        name: '',
        client: '',
        description: '',
        manager_id: user?.employee?.id || '',
        status: 'Active',
        start_date: '',
        end_date: '',
      });
    }
    setShowProjectModal(true);
  };

  const handleProjectSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const payload = { ...projectForm };
      if (!payload.manager_id) delete payload.manager_id;
      if (!payload.client) delete payload.client;
      if (!payload.description) delete payload.description;
      if (!payload.start_date) delete payload.start_date;
      if (!payload.end_date) delete payload.end_date;

      if (editingProject) {
        await projectService.updateProject(editingProject.id, payload);
        setSuccessMsg('Project updated successfully.');
      } else {
        await projectService.createProject(payload);
        setSuccessMsg('Project created successfully.');
      }
      setShowProjectModal(false);
      fetchProjects();
      if (selectedProject && editingProject && selectedProject.id === editingProject.id) {
        openProjectDetails(editingProject.id);
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to save project.');
    }
  };

  const handleDeleteProject = async (id) => {
    if (!window.confirm('Are you sure you want to delete this project?')) return;
    try {
      await projectService.deleteProject(id);
      setSuccessMsg('Project deleted.');
      if (selectedProject?.id === id) setSelectedProject(null);
      fetchProjects();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Failed to delete project.');
    }
  };

  const openProjectDetails = async (id) => {
    setLoadingDetails(true);
    try {
      const data = await projectService.getProject(id);
      setSelectedProject(data);
      setShowTaskForm(false);
      setEditingTaskId(null);
    } catch (err) {
      console.error(err);
      alert('Failed to load project details.');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleTaskSubmit = async (e) => {
    e.preventDefault();
    if (!selectedProject) return;
    try {
      if (editingTaskId) {
        await projectService.updateTask(selectedProject.id, editingTaskId, taskForm);
        setSuccessMsg('Task updated.');
      } else {
        await projectService.createTask(selectedProject.id, taskForm);
        setSuccessMsg('Task created.');
      }
      setShowTaskForm(false);
      setTaskForm({ name: '', description: '', status: 'To Do' });
      setEditingTaskId(null);
      openProjectDetails(selectedProject.id);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Failed to save task.');
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!selectedProject || !window.confirm('Delete this task?')) return;
    try {
      await projectService.deleteTask(selectedProject.id, taskId);
      setSuccessMsg('Task deleted.');
      openProjectDetails(selectedProject.id);
    } catch (err) {
      console.error(err);
      alert('Failed to delete task.');
    }
  };

  const startEditTask = (task) => {
    setEditingTaskId(task.id);
    setTaskForm({
      name: task.name || '',
      description: task.description || '',
      status: task.status || 'To Do'
    });
    setShowTaskForm(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Header */}
      <div className="detail-card">
        <div className="detail-card-header" style={{ flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>
              Projects & Tasks
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Track organizational projects, milestone tasks, and team utilization.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
            <Link to="/timesheets" className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}>
              <IconClock width="16" height="16" />
              <span>View Utilization</span>
            </Link>
            {canManage && (
              <button onClick={() => openProjectModal()} className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <IconPlus width="16" height="16" />
                <span>New Project</span>
              </button>
            )}
          </div>
        </div>

        {/* Notifications */}
        {error && (
          <div style={{ margin: 'var(--space-4) var(--space-6)', padding: 'var(--space-3)', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 'var(--radius-md)', color: '#991b1b', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}
        {successMsg && (
          <div style={{ margin: 'var(--space-4) var(--space-6)', padding: 'var(--space-3)', backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: 'var(--radius-md)', color: '#166534', fontSize: '0.875rem' }}>
            {successMsg}
          </div>
        )}

        {/* Filters */}
        <div style={{ padding: 'var(--space-4) var(--space-6)', display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', borderBottom: '1px solid var(--border-color)' }}>
          <div className="search-bar" style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
            <IconSearch width="16" height="16" style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="filter-input"
              style={{ paddingLeft: '32px', width: '100%' }}
            />
          </div>
          <CustomSelect
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ width: '180px' }}
          >
            <option value="">All Statuses</option>
            <option value="Active">Active</option>
            <option value="On Hold">On Hold</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
          </CustomSelect>
        </div>

        {/* Table */}
        <div className="table-container">
          {loading ? (
            <div className="state-container"><p>Loading projects...</p></div>
          ) : projects.length === 0 ? (
            <div className="state-container"><p>No projects found.</p></div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project Name</th>
                  <th>Client</th>
                  <th>Manager</th>
                  <th>Timeline</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((proj) => (
                  <tr key={proj.id}>
                    <td style={{ fontWeight: '600', color: 'var(--primary-color)' }}>{proj.name}</td>
                    <td>{proj.client || 'N/A'}</td>
                    <td>{proj.manager ? `${proj.manager.first_name} ${proj.manager.last_name}` : 'Unassigned'}</td>
                    <td style={{ fontSize: '0.8125rem' }}>
                      {proj.start_date || 'N/A'} — {proj.end_date || 'Ongoing'}
                    </td>
                    <td>
                      <span className={`badge badge-${proj.status === 'Active' ? 'success' : proj.status === 'On Hold' ? 'warning' : proj.status === 'Completed' ? 'info' : 'danger'}`}>
                        {proj.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => openProjectDetails(proj.id)}
                          className="btn-secondary"
                          style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                        >
                          Tasks / Details
                        </button>
                        {canManage && (
                          <>
                            <button
                              onClick={() => openProjectModal(proj)}
                              className="btn-secondary"
                              style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteProject(proj.id)}
                              className="btn-secondary"
                              style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', color: '#dc2626' }}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Project Details Panel Modal */}
      {selectedProject && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 'var(--space-4)' }}>
          <div className="detail-card" style={{ width: '100%', maxWidth: '750px', maxHeight: '90vh', overflowY: 'auto', backgroundColor: 'var(--bg-surface)' }}>
            <div className="detail-card-header">
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '600' }}>{selectedProject.name}</h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Client: {selectedProject.client || 'Internal'}</p>
              </div>
              <button onClick={() => setSelectedProject(null)} className="btn-secondary" style={{ padding: '0.25rem 0.5rem' }}>✕ Close</button>
            </div>

            <div style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', fontSize: '0.875rem' }}>
                <div><strong>Status:</strong> {selectedProject.status}</div>
                <div><strong>Manager:</strong> {selectedProject.manager ? `${selectedProject.manager.first_name} ${selectedProject.manager.last_name}` : 'Unassigned'}</div>
                <div><strong>Start Date:</strong> {selectedProject.start_date || 'N/A'}</div>
                <div><strong>End Date:</strong> {selectedProject.end_date || 'N/A'}</div>
              </div>
              {selectedProject.description && (
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-surface-hover)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)' }}>
                  {selectedProject.description}
                </div>
              )}

              {/* Tasks Subsection */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                  <h4 style={{ fontSize: '1rem', fontWeight: '600' }}>Project Tasks ({selectedProject.tasks?.length || 0})</h4>
                  {canManage && !showTaskForm && (
                    <button onClick={() => { setEditingTaskId(null); setTaskForm({ name: '', description: '', status: 'To Do' }); setShowTaskForm(true); }} className="btn-secondary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}>
                      + Add Task
                    </button>
                  )}
                </div>

                {/* Task Form inline */}
                {showTaskForm && (
                  <form onSubmit={handleTaskSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-4)', backgroundColor: 'var(--bg-surface-hover)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)' }}>
                    <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                      <input
                        type="text"
                        placeholder="Task name *"
                        required
                        className="filter-input"
                        style={{ flex: 2 }}
                        value={taskForm.name}
                        onChange={(e) => setTaskForm({ ...taskForm, name: e.target.value })}
                      />
                      <CustomSelect
                        className="filter-select"
                        style={{ flex: 1 }}
                        value={taskForm.status}
                        onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value })}
                      >
                        <option value="To Do">To Do</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Blocked">Blocked</option>
                        <option value="Done">Done</option>
                      </CustomSelect>
                    </div>
                    <input
                      type="text"
                      placeholder="Task description (optional)"
                      className="filter-input"
                      value={taskForm.description}
                      onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                    />
                    <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
                      <button type="button" onClick={() => setShowTaskForm(false)} className="btn-secondary" style={{ fontSize: '0.75rem' }}>Cancel</button>
                      <button type="submit" className="btn-primary" style={{ fontSize: '0.75rem' }}>{editingTaskId ? 'Save Task' : 'Create Task'}</button>
                    </div>
                  </form>
                )}

                {/* Tasks List */}
                {!selectedProject.tasks || selectedProject.tasks.length === 0 ? (
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>No tasks created for this project.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    {selectedProject.tasks.map(t => (
                      <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', fontSize: '0.875rem' }}>
                        <div>
                          <div style={{ fontWeight: '500' }}>{t.name}</div>
                          {t.description && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t.description}</div>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                          <span className={`badge badge-${t.status === 'Done' ? 'success' : t.status === 'In Progress' ? 'info' : t.status === 'Blocked' ? 'danger' : 'secondary'}`}>
                            {t.status}
                          </span>
                          {canManage && (
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button onClick={() => startEditTask(t)} className="btn-secondary" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>Edit</button>
                              <button onClick={() => handleDeleteTask(t.id)} className="btn-secondary" style={{ fontSize: '0.7rem', padding: '2px 6px', color: '#dc2626' }}>Delete</button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Project Modal */}
      {showProjectModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 'var(--space-4)' }}>
          <div className="detail-card" style={{ width: '100%', maxWidth: '550px', backgroundColor: 'var(--bg-surface)' }}>
            <div className="detail-card-header">
              <h3 style={{ fontSize: '1.125rem', fontWeight: '600' }}>
                {editingProject ? 'Edit Project' : 'New Project'}
              </h3>
              <button onClick={() => setShowProjectModal(false)} className="btn-secondary" style={{ padding: '0.25rem 0.5rem' }}>✕</button>
            </div>
            <form onSubmit={handleProjectSubmit} style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '4px' }}>Project Name *</label>
                <input
                  type="text"
                  required
                  className="filter-input"
                  style={{ width: '100%' }}
                  value={projectForm.name}
                  onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '4px' }}>Client</label>
                  <input
                    type="text"
                    className="filter-input"
                    style={{ width: '100%' }}
                    value={projectForm.client}
                    onChange={(e) => setProjectForm({ ...projectForm, client: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '4px' }}>Status</label>
                  <CustomSelect
                    className="filter-select"
                    style={{ width: '100%' }}
                    value={projectForm.status}
                    onChange={(e) => setProjectForm({ ...projectForm, status: e.target.value })}
                  >
                    <option value="Active">Active</option>
                    <option value="On Hold">On Hold</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </CustomSelect>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '4px' }}>Project Manager</label>
                <CustomSelect
                  className="filter-select"
                  style={{ width: '100%' }}
                  value={projectForm.manager_id}
                  onChange={(e) => setProjectForm({ ...projectForm, manager_id: e.target.value })}
                >
                  <option value="">Select Manager...</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name} ({emp.employee_id || emp.id})
                    </option>
                  ))}
                </CustomSelect>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '4px' }}>Start Date</label>
                  <input
                    type="date"
                    className="filter-input"
                    style={{ width: '100%' }}
                    value={projectForm.start_date}
                    onChange={(e) => setProjectForm({ ...projectForm, start_date: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '4px' }}>End Date</label>
                  <input
                    type="date"
                    className="filter-input"
                    style={{ width: '100%' }}
                    value={projectForm.end_date}
                    onChange={(e) => setProjectForm({ ...projectForm, end_date: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '4px' }}>Description</label>
                <textarea
                  className="filter-input"
                  rows="3"
                  style={{ width: '100%', resize: 'vertical' }}
                  value={projectForm.description}
                  onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
                <button type="button" onClick={() => setShowProjectModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">{editingProject ? 'Update Project' : 'Create Project'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
