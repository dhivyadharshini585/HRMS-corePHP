import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import '../../styles/common.css';
import CustomSelect from '../../components/common/CustomSelect';

function Performance() {
  const [cycles, setCycles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' or 'edit'
  const [currentId, setCurrentId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    start_date: '',
    end_date: '',
    status: 'active'
  });
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchCycles = async () => {
    setLoading(true);
    try {
      const res = await api.get('/performance-cycles');
      setCycles(res.data);
    } catch (err) {
      console.error(err);
      setError('Failed to load performance cycles.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCycles();
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
    setFormData({ name: '', start_date: '', end_date: '', status: 'active' });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (cycle) => {
    setModalMode('edit');
    setCurrentId(cycle.id);
    setFormData({
      name: cycle.name,
      start_date: cycle.start_date ? cycle.start_date.split('T')[0] : '',
      end_date: cycle.end_date ? cycle.end_date.split('T')[0] : '',
      status: cycle.status
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setFormData({ name: '', start_date: '', end_date: '', status: 'active' });
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    
    if (!formData.name || !formData.start_date || !formData.end_date || !formData.status) {
      setFormError('All fields are required.');
      return;
    }

    if (new Date(formData.end_date) < new Date(formData.start_date)) {
      setFormError('End date cannot be before start date.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (modalMode === 'create') {
        await api.post('/performance-cycles', formData);
        setSuccessMsg('Performance cycle created successfully.');
      } else {
        await api.put(`/performance-cycles/${currentId}`, formData);
        setSuccessMsg('Performance cycle updated successfully.');
      }
      handleCloseModal();
      fetchCycles();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error(err);
      setFormError(err.response?.data?.message || 'Failed to save performance cycle.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this performance cycle?')) {
      try {
        await api.delete(`/performance-cycles/${id}`);
        setSuccessMsg('Performance cycle deleted successfully.');
        fetchCycles();
        setTimeout(() => setSuccessMsg(''), 3000);
      } catch (err) {
        console.error(err);
        setError('Failed to delete performance cycle.');
        setTimeout(() => setError(''), 3000);
      }
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2 className="page-title">Performance Cycles</h2>
          <p className="page-subtitle">Manage performance review cycles</p>
        </div>
        <button className="btn-primary" onClick={handleOpenCreateModal}>
          + Add Cycle
        </button>
      </div>

      {successMsg && <div className="alert-banner success" style={{ marginBottom: '1rem' }}>{successMsg}</div>}
      {error && <div className="alert-banner error" style={{ marginBottom: '1rem' }}>{error}</div>}

      <div className="table-container">
        {loading ? (
          <div className="state-container">
            <p>Loading cycles...</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {cycles.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '1rem' }}>No performance cycles found.</td>
                </tr>
              ) : (
                cycles.map(c => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{formatDate(c.start_date)}</td>
                    <td>{formatDate(c.end_date)}</td>
                    <td>
                      <span className={`badge ${c.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>
                        {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                      </span>
                    </td>
                    <td>
                      <div className="actions-cell" style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleOpenEditModal(c)}>
                          Edit
                        </button>
                        <button className="btn-danger" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleDelete(c.id)}>
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
              <h3>{modalMode === 'create' ? 'Create Performance Cycle' : 'Edit Performance Cycle'}</h3>
              <button onClick={handleCloseModal} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', lineHeight: 1 }}>&times;</button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {formError && <div className="alert-banner error" style={{ marginBottom: '1rem' }}>{formError}</div>}
                
                <div className="filter-group" style={{ marginBottom: '1rem' }}>
                  <label className="filter-label">Name *</label>
                  <input
                    type="text"
                    name="name"
                    className="form-control"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="e.g. 2026 Annual Performance Cycle"
                    required
                  />
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div className="filter-group">
                    <label className="filter-label">Start Date *</label>
                    <input
                      type="date"
                      name="start_date"
                      className="form-control"
                      value={formData.start_date}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  
                  <div className="filter-group">
                    <label className="filter-label">End Date *</label>
                    <input
                      type="date"
                      name="end_date"
                      className="form-control"
                      value={formData.end_date}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                </div>
                
                <div className="filter-group" style={{ marginBottom: '1rem' }}>
                  <label className="filter-label">Status *</label>
                  <CustomSelect
                    name="status"
                    className="form-control"
                    value={formData.status}
                    onChange={handleInputChange}
                    required
                  >
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="planned">Planned</option>
                  </CustomSelect>
                </div>
              </div>
              
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={handleCloseModal} disabled={isSubmitting}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Save Cycle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Performance;
