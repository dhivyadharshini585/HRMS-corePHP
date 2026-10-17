import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import '../../styles/common.css';
import CustomSelect from '../../components/common/CustomSelect';

function Goals() {
  const [goals, setGoals] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create', 'edit', 'progress'
  const [currentGoal, setCurrentGoal] = useState(null);
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

  const fetchData = async () => {
    setLoading(true);
    try {
      const [goalsRes, employeesRes, cyclesRes] = await Promise.all([
        api.get('/performance-goals'),
        api.get('/employees').catch(() => ({ data: [] })), // Graceful degradation if no permission
        api.get('/performance-cycles')
      ]);
      setGoals(goalsRes.data);
      
      // If employee API fails, we fallback to extracting unique employees from the goals list
      let empData = employeesRes.data;
      if (empData && !Array.isArray(empData) && Array.isArray(empData.data)) {
        empData = empData.data;
      }
      
      if (!empData || !Array.isArray(empData) || empData.length === 0) {
        const empMap = new Map();
        goalsRes.data.forEach(g => {
          if (g.employee) empMap.set(g.employee.id, g.employee);
        });
        empData = Array.from(empMap.values());
      }
      setEmployees(empData);
      setCycles(cyclesRes.data);
    } catch (err) {
      console.error(err);
      setError('Failed to load goals.');
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
      cycle_id: '',
      goal: '',
      target: '',
      deadline: '',
      progress: 0,
      status: 'pending'
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (goal) => {
    setModalMode('edit');
    setCurrentGoal(goal);
    setFormData({
      employee_id: goal.employee_id || '',
      cycle_id: goal.cycle_id || '',
      goal: goal.goal,
      target: goal.target,
      deadline: goal.deadline ? goal.deadline.split('T')[0] : '',
      progress: goal.progress || 0,
      status: goal.status || 'pending'
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleOpenProgressModal = (goal) => {
    setModalMode('progress');
    setCurrentGoal(goal);
    setFormData({
      employee_id: goal.employee_id || '',
      cycle_id: goal.cycle_id || '',
      goal: goal.goal,
      target: goal.target,
      deadline: goal.deadline ? goal.deadline.split('T')[0] : '',
      progress: goal.progress || 0,
      status: goal.status || 'pending'
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setCurrentGoal(null);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    let newValue = value;
    
    if (name === 'progress') {
      newValue = parseInt(value, 10);
      if (isNaN(newValue)) newValue = 0;
      if (newValue < 0) newValue = 0;
      if (newValue > 100) newValue = 100;
      
      // Auto update status if progress reaches 100
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
    
    // Validation
    if (modalMode === 'create') {
      if (!formData.employee_id || !formData.cycle_id || !formData.goal || !formData.target || !formData.deadline || !formData.status) {
        setFormError('Please fill in all required fields.');
        return;
      }
    } else if (modalMode === 'edit') {
      if (!formData.goal || !formData.target || !formData.deadline || !formData.status) {
        setFormError('Please fill in all required fields.');
        return;
      }
    }
    
    if (formData.progress < 0 || formData.progress > 100) {
      setFormError('Progress must be between 0 and 100.');
      return;
    }

    setIsSubmitting(true);
    try {
      let payload = { ...formData };
      
      if (modalMode === 'edit' || modalMode === 'progress') {
        // Backend doesn't support updating employee_id and cycle_id on edit
        delete payload.employee_id;
        delete payload.cycle_id;
        
        if (modalMode === 'progress') {
          payload = { progress: formData.progress, status: formData.status };
        }
        
        await api.put(`/performance-goals/${currentGoal.id}`, payload);
        setSuccessMsg(modalMode === 'progress' ? 'Progress updated successfully.' : 'Goal updated successfully.');
      } else {
        await api.post('/performance-goals', payload);
        setSuccessMsg('Goal created successfully.');
      }
      
      handleCloseModal();
      
      // Refresh only goals
      const res = await api.get('/performance-goals');
      setGoals(res.data);
      
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error(err);
      setFormError(err.response?.data?.message || 'An error occurred while saving the goal.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this goal?')) {
      try {
        await api.delete(`/performance-goals/${id}`);
        setSuccessMsg('Goal deleted successfully.');
        const res = await api.get('/performance-goals');
        setGoals(res.data);
        setTimeout(() => setSuccessMsg(''), 3000);
      } catch (err) {
        console.error(err);
        setError('Failed to delete goal.');
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

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2 className="page-title">Performance Goals</h2>
          <p className="page-subtitle">Manage employee performance goals (Manager/HR View)</p>
        </div>
        <button className="btn-primary" onClick={handleOpenCreateModal}>
          + Add Goal
        </button>
      </div>

      {successMsg && <div className="alert-banner success" style={{ marginBottom: '1rem' }}>{successMsg}</div>}
      {error && <div className="alert-banner error" style={{ marginBottom: '1rem' }}>{error}</div>}

      <div className="table-container">
        {loading ? (
          <div className="state-container">
            <p>Loading goals...</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Goal</th>
                <th>Target</th>
                <th>Deadline</th>
                <th style={{ width: '150px' }}>Progress</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {goals.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '1rem' }}>No goals found.</td>
                </tr>
              ) : (
                goals.map(g => (
                  <tr key={g.id}>
                    <td>{g.employee?.first_name} {g.employee?.last_name}</td>
                    <td>{g.goal}</td>
                    <td>{g.target}</td>
                    <td>{formatDate(g.deadline)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ flex: 1, backgroundColor: '#e2e8f0', borderRadius: '9999px', height: '0.5rem', overflow: 'hidden' }}>
                          <div style={{ backgroundColor: g.progress === 100 ? '#16a34a' : 'var(--primary-color)', height: '100%', width: `${g.progress || 0}%`, transition: 'width 0.3s ease' }}></div>
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, minWidth: '2.5rem' }}>{g.progress || 0}%</span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${getStatusBadgeClass(g.status)}`}>
                        {(g.status || 'pending').replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <div className="actions-cell" style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn-success" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleOpenProgressModal(g)}>
                          Progress
                        </button>
                        <button className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleOpenEditModal(g)}>
                          Edit
                        </button>
                        <button className="btn-danger" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleDelete(g.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>
                {modalMode === 'create' && 'Create Performance Goal'}
                {modalMode === 'edit' && 'Edit Performance Goal'}
                {modalMode === 'progress' && 'Update Goal Progress'}
              </h3>
              <button onClick={handleCloseModal} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', lineHeight: 1 }}>&times;</button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {formError && <div className="alert-banner error" style={{ marginBottom: '1rem' }}>{formError}</div>}
                
                {modalMode === 'create' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div className="filter-group">
                      <label className="filter-label">Employee *</label>
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
                        {cycles.map(cycle => (
                          <option key={cycle.id} value={cycle.id}>{cycle.name}</option>
                        ))}
                      </CustomSelect>
                    </div>
                  </div>
                )}

                {(modalMode === 'create' || modalMode === 'edit') && (
                  <>
                    <div className="filter-group" style={{ marginBottom: '1rem' }}>
                      <label className="filter-label">Goal *</label>
                      <input
                        type="text"
                        name="goal"
                        className="form-control"
                        value={formData.goal}
                        onChange={handleInputChange}
                        placeholder="E.g., Complete React Certification"
                        required
                      />
                    </div>
                    
                    <div className="filter-group" style={{ marginBottom: '1rem' }}>
                      <label className="filter-label">Target *</label>
                      <input
                        type="text"
                        name="target"
                        className="form-control"
                        value={formData.target}
                        onChange={handleInputChange}
                        placeholder="E.g., Pass exam with > 80%"
                        required
                      />
                    </div>

                    <div className="filter-group" style={{ marginBottom: '1rem' }}>
                      <label className="filter-label">Deadline *</label>
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
                    <label className="filter-label">Progress (%) *</label>
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
                  {isSubmitting ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Goals;
