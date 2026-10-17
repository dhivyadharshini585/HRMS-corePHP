import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import kpiService from '../../services/kpiService';
import { useAuthContext } from '../../context/AuthContext';
import '../../styles/common.css';
import CustomSelect from '../../components/common/CustomSelect';

function KPIs() {
  const { user, hasPermission, hasAnyRole } = useAuthContext();

  const [kpis, setKpis] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [selectedCycle, setSelectedCycle] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create', 'edit', 'progress', 'view'
  const [currentKpi, setCurrentKpi] = useState(null);
  const [formData, setFormData] = useState({
    employee_id: '',
    cycle_id: '',
    goal: '',
    target: '',
    deadline: '',
    progress: 0,
    status: 'pending'
  });
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canManage = hasPermission('performance.manage') || hasAnyRole(['Super Admin', 'HR Admin', 'Manager']);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [kpiData, employeesRes, cyclesRes] = await Promise.all([
        kpiService.getKPIs(),
        api.get('/employees').catch(() => ({ data: [] })),
        api.get('/performance-cycles').catch(() => ({ data: [] }))
      ]);

      const kpiList = Array.isArray(kpiData) ? kpiData : (kpiData?.data || []);
      setKpis(kpiList);

      let empData = employeesRes.data;
      if (empData && !Array.isArray(empData) && Array.isArray(empData.data)) {
        empData = empData.data;
      }
      if (!empData || !Array.isArray(empData) || empData.length === 0) {
        const empMap = new Map();
        kpiList.forEach(k => {
          if (k.employee) empMap.set(k.employee.id, k.employee);
        });
        empData = Array.from(empMap.values());
      }
      setEmployees(empData);

      const cycleList = Array.isArray(cyclesRes.data) ? cyclesRes.data : (cyclesRes.data?.data || []);
      setCycles(cycleList);
    } catch (err) {
      console.error(err);
      setError('Failed to load KPI performance data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const handleOpenCreateModal = () => {
    setModalMode('create');
    setFormData({
      employee_id: '',
      cycle_id: cycles.length > 0 ? cycles[0].id : '',
      goal: '',
      target: '',
      deadline: '',
      progress: 0,
      status: 'pending'
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (kpi) => {
    setModalMode('edit');
    setCurrentKpi(kpi);
    setFormData({
      employee_id: kpi.employee_id || '',
      cycle_id: kpi.cycle_id || '',
      goal: kpi.goal || '',
      target: kpi.target || '',
      deadline: kpi.deadline ? kpi.deadline.split('T')[0] : '',
      progress: kpi.progress || 0,
      status: kpi.status || 'pending'
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleOpenProgressModal = (kpi) => {
    setModalMode('progress');
    setCurrentKpi(kpi);
    setFormData({
      employee_id: kpi.employee_id || '',
      cycle_id: kpi.cycle_id || '',
      goal: kpi.goal || '',
      target: kpi.target || '',
      deadline: kpi.deadline ? kpi.deadline.split('T')[0] : '',
      progress: kpi.progress || 0,
      status: kpi.status || 'pending'
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleOpenViewModal = (kpi) => {
    setModalMode('view');
    setCurrentKpi(kpi);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setCurrentKpi(null);
    setFormError('');
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    let newValue = value;

    if (name === 'progress') {
      newValue = parseInt(value, 10);
      if (isNaN(newValue)) newValue = 0;
      if (newValue < 0) newValue = 0;
      if (newValue > 100) newValue = 100;

      if (newValue === 100) {
        setFormData(prev => ({ ...prev, [name]: newValue, status: 'completed' }));
        return;
      } else if (formData.status === 'completed' && newValue < 100) {
        setFormData(prev => ({ ...prev, [name]: newValue, status: 'in_progress' }));
        return;
      }
    }

    setFormData(prev => ({ ...prev, [name]: newValue }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (modalMode === 'create') {
      if (!formData.employee_id || !formData.cycle_id || !formData.goal || !formData.target || !formData.deadline) {
        setFormError('Please fill in all required fields marked with *.');
        return;
      }
    } else if (modalMode === 'edit') {
      if (!formData.goal || !formData.target || !formData.deadline) {
        setFormError('Please fill in all required fields marked with *.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (modalMode === 'edit' || modalMode === 'progress') {
        const payload = {
          goal: formData.goal,
          target: formData.target,
          deadline: formData.deadline,
          progress: formData.progress,
          status: formData.status
        };

        if (modalMode === 'progress') {
          delete payload.goal;
          delete payload.target;
          delete payload.deadline;
        }

        await kpiService.updateKPI(currentKpi.id, payload);
        setSuccessMsg(modalMode === 'progress' ? 'KPI progress updated successfully.' : 'KPI updated successfully.');
      } else {
        await kpiService.createKPI(formData);
        setSuccessMsg('Key Performance Indicator (KPI) created successfully.');
      }

      handleCloseModal();
      const updatedList = await kpiService.getKPIs();
      setKpis(Array.isArray(updatedList) ? updatedList : (updatedList?.data || []));
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error(err);
      setFormError(err.response?.data?.message || 'Failed to save KPI record.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this Key Performance Indicator (KPI)?')) {
      try {
        await kpiService.deleteKPI(id);
        setSuccessMsg('KPI deleted successfully.');
        const updatedList = await kpiService.getKPIs();
        setKpis(Array.isArray(updatedList) ? updatedList : (updatedList?.data || []));
        setTimeout(() => setSuccessMsg(''), 3000);
      } catch (err) {
        console.error(err);
        setError('Failed to delete KPI.');
        setTimeout(() => setError(''), 3000);
      }
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'completed': return 'badge-success';
      case 'in_progress': return 'badge-info';
      case 'cancelled': return 'badge-danger';
      default: return 'badge-neutral';
    }
  };

  // Filter Logic
  const filteredKpis = kpis.filter(item => {
    const matchesSearch = !searchTerm ||
      item.goal?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.target?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `${item.employee?.first_name} ${item.employee?.last_name}`.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesEmployee = !selectedEmployee || String(item.employee_id) === String(selectedEmployee);
    const matchesCycle = !selectedCycle || String(item.cycle_id) === String(selectedCycle);
    const matchesStatus = !selectedStatus || item.status === selectedStatus;

    return matchesSearch && matchesEmployee && matchesCycle && matchesStatus;
  });

  // Calculate Summary Metrics
  const totalKpis = kpis.length;
  const completedKpis = kpis.filter(k => k.status === 'completed').length;
  const inProgressKpis = kpis.filter(k => k.status === 'in_progress').length;
  const avgProgress = totalKpis > 0 ? Math.round(kpis.reduce((acc, k) => acc + (k.progress || 0), 0) / totalKpis) : 0;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2 className="page-title">Key Performance Indicators (KPIs)</h2>
          <p className="page-subtitle">Track, measure, and evaluate organizational & employee performance targets</p>
        </div>
        {canManage && (
          <button className="btn-primary" onClick={handleOpenCreateModal}>
            + Add KPI
          </button>
        )}
      </div>

      {successMsg && <div className="alert-banner success" style={{ marginBottom: '1rem' }}>{successMsg}</div>}
      {error && <div className="alert-banner error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {/* KPI Metrics Dashboard Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="detail-card" style={{ padding: '1rem', marginBottom: 0 }}>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Total KPIs</span>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>{totalKpis}</div>
        </div>
        <div className="detail-card" style={{ padding: '1rem', marginBottom: 0 }}>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#16a34a', fontWeight: 600 }}>Completed</span>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#16a34a', marginTop: '0.25rem' }}>{completedKpis}</div>
        </div>
        <div className="detail-card" style={{ padding: '1rem', marginBottom: 0 }}>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#075E4B', fontWeight: 600 }}>In Progress</span>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#075E4B', marginTop: '0.25rem' }}>{inProgressKpis}</div>
        </div>
        <div className="detail-card" style={{ padding: '1rem', marginBottom: 0 }}>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--primary-color)', fontWeight: 600 }}>Avg Completion</span>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--primary-color)', marginTop: '0.25rem' }}>{avgProgress}%</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="filters-bar">
        <div className="filter-group">
          <label className="filter-label">Search KPI / Target / Employee</label>
          <input
            type="text"
            className="filter-input"
            placeholder="Type to search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        {employees.length > 0 && (
          <div className="filter-group">
            <label className="filter-label">Employee</label>
            <CustomSelect className="filter-select" value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)}>
              <option value="">All Employees</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>
              ))}
            </CustomSelect>
          </div>
        )}
        {cycles.length > 0 && (
          <div className="filter-group">
            <label className="filter-label">Performance Cycle</label>
            <CustomSelect className="filter-select" value={selectedCycle} onChange={(e) => setSelectedCycle(e.target.value)}>
              <option value="">All Cycles</option>
              {cycles.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </CustomSelect>
          </div>
        )}
        <div className="filter-group">
          <label className="filter-label">Status</label>
          <CustomSelect className="filter-select" value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </CustomSelect>
        </div>
      </div>

      {/* KPI Table Container */}
      <div className="table-container">
        {loading ? (
          <div className="state-container">
            <p>Loading Key Performance Indicators...</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Cycle</th>
                <th>KPI Description</th>
                <th>Target Metric</th>
                <th>Deadline</th>
                <th style={{ width: '160px' }}>Progress</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredKpis.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '2rem' }}>
                    <div className="state-container" style={{ padding: 0 }}>
                      <h3>No KPIs Found</h3>
                      <p>No Key Performance Indicators match the specified filters.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredKpis.map(item => (
                  <tr key={item.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{item.employee?.first_name} {item.employee?.last_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>ID: {item.employee?.employee_id || item.employee_id}</div>
                    </td>
                    <td>{item.cycle?.name || '-'}</td>
                    <td style={{ fontWeight: 500 }}>{item.goal}</td>
                    <td><span className="badge badge-purple">{item.target}</span></td>
                    <td>{formatDate(item.deadline)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ flex: 1, backgroundColor: '#e2e8f0', borderRadius: '9999px', height: '0.5rem', overflow: 'hidden' }}>
                          <div style={{
                            backgroundColor: item.progress === 100 ? '#16a34a' : 'var(--primary-color)',
                            height: '100%',
                            width: `${item.progress || 0}%`,
                            transition: 'width 0.3s ease'
                          }}></div>
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, minWidth: '2.5rem' }}>{item.progress || 0}%</span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${getStatusBadgeClass(item.status)}`}>
                        {(item.status || 'pending').replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="actions-cell" style={{ display: 'inline-flex', gap: '0.35rem' }}>
                        <button className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleOpenViewModal(item)}>
                          View
                        </button>
                        <button className="btn-success" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleOpenProgressModal(item)}>
                          Progress
                        </button>
                        {canManage && (
                          <>
                            <button className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleOpenEditModal(item)}>
                              Edit
                            </button>
                            <button className="btn-danger" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleDelete(item.id)}>
                              Delete
                            </button>
                          </>
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

      {/* Modal Dialog */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>
                {modalMode === 'create' && 'Create Key Performance Indicator (KPI)'}
                {modalMode === 'edit' && 'Edit KPI Definition'}
                {modalMode === 'progress' && 'Update KPI Progress & Status'}
                {modalMode === 'view' && 'KPI Details'}
              </h3>
              <button onClick={handleCloseModal} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', lineHeight: 1 }}>&times;</button>
            </div>

            {modalMode === 'view' ? (
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label className="filter-label">Employee</label>
                    <div style={{ fontWeight: 600 }}>{currentKpi?.employee?.first_name} {currentKpi?.employee?.last_name}</div>
                  </div>
                  <div>
                    <label className="filter-label">Performance Cycle</label>
                    <div style={{ fontWeight: 600 }}>{currentKpi?.cycle?.name || '-'}</div>
                  </div>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label className="filter-label">KPI Title / Description</label>
                  <div style={{ fontSize: '1rem', fontWeight: 500 }}>{currentKpi?.goal}</div>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label className="filter-label">Target Metric / Measurement</label>
                  <div><span className="badge badge-purple" style={{ fontSize: '0.875rem' }}>{currentKpi?.target}</span></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label className="filter-label">Deadline</label>
                    <div>{formatDate(currentKpi?.deadline)}</div>
                  </div>
                  <div>
                    <label className="filter-label">Progress</label>
                    <div style={{ fontWeight: 600 }}>{currentKpi?.progress || 0}%</div>
                  </div>
                  <div>
                    <label className="filter-label">Status</label>
                    <div>
                      <span className={`badge ${getStatusBadgeClass(currentKpi?.status)}`}>
                        {(currentKpi?.status || 'pending').replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="modal-footer" style={{ margin: '-1.25rem -1.25rem -1.25rem -1.25rem', marginTop: '1.5rem' }}>
                  <button type="button" className="btn-secondary" onClick={handleCloseModal}>Close</button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="modal-body">
                  {formError && <div className="alert-banner error" style={{ marginBottom: '1rem' }}>{formError}</div>}

                  {modalMode === 'create' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                      <div className="filter-group">
                        <label className="filter-label">Assigned Employee *</label>
                        <CustomSelect
                          name="employee_id"
                          className="form-control"
                          value={formData.employee_id}
                          onChange={handleInputChange}
                          required
                        >
                          <option value="">Select Employee</option>
                          {employees.map(emp => (
                            <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>
                          ))}
                        </CustomSelect>
                      </div>
                      <div className="filter-group">
                        <label className="filter-label">Performance Cycle *</label>
                        <CustomSelect
                          name="cycle_id"
                          className="form-control"
                          value={formData.cycle_id}
                          onChange={handleInputChange}
                          required
                        >
                          <option value="">Select Cycle</option>
                          {cycles.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </CustomSelect>
                      </div>
                    </div>
                  )}

                  {(modalMode === 'create' || modalMode === 'edit') && (
                    <>
                      <div className="filter-group" style={{ marginBottom: '1rem' }}>
                        <label className="filter-label">KPI Description / Goal *</label>
                        <input
                          type="text"
                          name="goal"
                          className="form-control"
                          value={formData.goal}
                          onChange={handleInputChange}
                          placeholder="e.g. Maintain 99.9% API Uptime / Resolve 50 Tickets"
                          required
                        />
                      </div>

                      <div className="filter-group" style={{ marginBottom: '1rem' }}>
                        <label className="filter-label">Target Metric / Measurement *</label>
                        <input
                          type="text"
                          name="target"
                          className="form-control"
                          value={formData.target}
                          onChange={handleInputChange}
                          placeholder="e.g. 99.9% uptime / < 2hr average response time"
                          required
                        />
                      </div>

                      <div className="filter-group" style={{ marginBottom: '1rem' }}>
                        <label className="filter-label">Completion Deadline *</label>
                        <input
                          type="date"
                          name="deadline"
                          className="form-control"
                          value={formData.deadline}
                          onChange={handleInputChange}
                          required
                        />
                      </div>
                    </>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div className="filter-group">
                      <label className="filter-label">Progress Percentage (0 - 100%) *</label>
                      <input
                        type="number"
                        name="progress"
                        className="form-control"
                        value={formData.progress}
                        onChange={handleInputChange}
                        min="0"
                        max="100"
                        required
                      />
                    </div>

                    <div className="filter-group">
                      <label className="filter-label">Status *</label>
                      <CustomSelect
                        name="status"
                        className="form-control"
                        value={formData.status}
                        onChange={handleInputChange}
                        required
                      >
                        <option value="pending">Pending</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </CustomSelect>
                    </div>
                  </div>
                </div>

                <div className="modal-footer">
                  <button type="button" className="btn-secondary" onClick={handleCloseModal} disabled={isSubmitting}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? 'Saving...' : 'Save KPI'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default KPIs;
