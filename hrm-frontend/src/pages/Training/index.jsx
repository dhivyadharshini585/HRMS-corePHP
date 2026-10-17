import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { useAuthContext } from '../../context/AuthContext';
import '../../styles/common.css';
import CustomSelect from '../../components/common/CustomSelect';

function Training() {
  const { hasPermission } = useAuthContext();
  const [trainings, setTrainings] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // CRUD Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [currentTraining, setCurrentTraining] = useState(null);
  
  const initialForm = {
    training_name: '',
    trainer_employee_id: '',
    start_date: '',
    end_date: '',
    status: 'scheduled'
  };

  const [formData, setFormData] = useState(initialForm);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Attendees Modal State
  const [isAttendeeModalOpen, setIsAttendeeModalOpen] = useState(false);
  const [selectedTrainingForAttendees, setSelectedTrainingForAttendees] = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [isAttendeesLoading, setIsAttendeesLoading] = useState(false);
  
  const [enrollForm, setEnrollForm] = useState({ employee_id: '' });
  const [enrollError, setEnrollError] = useState('');
  const [isEnrolling, setIsEnrolling] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [trainingsRes, employeesRes] = await Promise.all([
        api.get('/trainings'),
        api.get('/employees').catch(() => ({ data: [] }))
      ]);
      
      let tData = trainingsRes.data;
      if (tData && !Array.isArray(tData) && Array.isArray(tData.data)) {
        tData = tData.data;
      }
      setTrainings(Array.isArray(tData) ? tData : []);
      
      let empData = employeesRes.data;
      if (empData && !Array.isArray(empData) && Array.isArray(empData.data)) {
        empData = empData.data;
      }
      if (!empData || !Array.isArray(empData) || empData.length === 0) {
        const empMap = new Map();
        (Array.isArray(tData) ? tData : []).forEach(t => {
          if (t.trainer) empMap.set(t.trainer.id, t.trainer);
        });
        empData = Array.from(empMap.values());
      }
      setEmployees(empData);
    } catch (err) {
      console.error(err);
      setError('Failed to load trainings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return dateString.split('T')[0];
  };

  // --- CRUD Handlers ---

  const handleOpenCreateModal = () => {
    setModalMode('create');
    setFormData(initialForm);
    setFormError('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (training) => {
    setModalMode('edit');
    setCurrentTraining(training);
    setFormData({
      training_name: training.training_name || '',
      trainer_employee_id: training.trainer_employee_id || '',
      start_date: formatDate(training.start_date),
      end_date: formatDate(training.end_date),
      status: training.status || 'scheduled'
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setCurrentTraining(null);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    
    if (new Date(formData.end_date) < new Date(formData.start_date)) {
      setFormError('End date cannot be before start date.');
      return;
    }

    setIsSubmitting(true);
    
    try {
      if (modalMode === 'edit') {
        await api.put(`/trainings/${currentTraining.id}`, formData);
        setSuccessMsg('Training updated successfully.');
      } else {
        await api.post('/trainings', formData);
        setSuccessMsg('Training created successfully.');
      }
      
      handleCloseModal();
      fetchData(); // Refresh list safely
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error(err);
      setFormError(err.response?.data?.message || 'An error occurred while saving.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this training?')) {
      try {
        await api.delete(`/trainings/${id}`);
        setSuccessMsg('Training deleted successfully.');
        fetchData();
        setTimeout(() => setSuccessMsg(''), 3000);
      } catch (err) {
        console.error(err);
        setError(err.response?.data?.message || 'Failed to delete training.');
        setTimeout(() => setError(''), 3000);
      }
    }
  };

  // --- Attendee Handlers ---

  const fetchAttendees = async (trainingId) => {
    setIsAttendeesLoading(true);
    try {
      const res = await api.get(`/training-attendees?training_id=${trainingId}`);
      let attData = res.data;
      if (attData && !Array.isArray(attData) && Array.isArray(attData.data)) {
        attData = attData.data;
      }
      setAttendees(Array.isArray(attData) ? attData : []);
    } catch (err) {
      console.error(err);
      setEnrollError('Failed to load attendees.');
    } finally {
      setIsAttendeesLoading(false);
    }
  };

  const handleOpenAttendeesModal = (training) => {
    setSelectedTrainingForAttendees(training);
    setEnrollError('');
    setEnrollForm({ employee_id: '' });
    setIsAttendeeModalOpen(true);
    fetchAttendees(training.id);
  };

  const handleCloseAttendeesModal = () => {
    setIsAttendeeModalOpen(false);
    setSelectedTrainingForAttendees(null);
    setAttendees([]);
  };

  const handleEnrollEmployee = async (e) => {
    e.preventDefault();
    setEnrollError('');
    if (!enrollForm.employee_id) {
      setEnrollError('Please select an employee.');
      return;
    }
    
    // Check duplicate locally to prevent unnecessary API call
    if (attendees.some(a => a.employee_id.toString() === enrollForm.employee_id.toString())) {
      setEnrollError('Employee is already enrolled in this training.');
      return;
    }

    setIsEnrolling(true);
    try {
      await api.post('/training-attendees', {
        training_id: selectedTrainingForAttendees.id,
        employee_id: enrollForm.employee_id
      });
      setSuccessMsg('Employee enrolled successfully.');
      setEnrollForm({ employee_id: '' });
      fetchAttendees(selectedTrainingForAttendees.id);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error(err);
      setEnrollError(err.response?.data?.message || 'Failed to enroll employee.');
    } finally {
      setIsEnrolling(false);
    }
  };

  const handleUpdateCompletionStatus = async (attendeeId, newStatus) => {
    try {
      await api.put(`/training-attendees/${attendeeId}`, {
        completion_status: newStatus
      });
      setSuccessMsg('Status updated successfully.');
      fetchAttendees(selectedTrainingForAttendees.id);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error(err);
      setEnrollError(err.response?.data?.message || 'Failed to update status.');
    }
  };

  const handleRemoveAttendee = async (attendeeId) => {
    if (window.confirm('Are you sure you want to remove this employee from the training?')) {
      try {
        await api.delete(`/training-attendees/${attendeeId}`);
        setSuccessMsg('Employee removed successfully.');
        fetchAttendees(selectedTrainingForAttendees.id);
        setTimeout(() => setSuccessMsg(''), 3000);
      } catch (err) {
        console.error(err);
        setEnrollError(err.response?.data?.message || 'Failed to remove employee.');
      }
    }
  };

  // --- UI Helpers ---

  const getStatusBadgeClass = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed': return 'badge-success';
      case 'ongoing': return 'badge-info';
      case 'scheduled': return 'badge-primary';
      case 'cancelled': return 'badge-danger';
      default: return 'badge-neutral';
    }
  };

  const canManage = hasPermission('training.manage');

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2 className="page-title">Training Management</h2>
          <p className="page-subtitle">Manage company trainings and schedules</p>
        </div>
        {canManage && (
          <button className="btn-primary" onClick={handleOpenCreateModal}>
            + Add Training
          </button>
        )}
      </div>

      {successMsg && <div className="alert-banner success" style={{ marginBottom: '1rem' }}>{successMsg}</div>}
      {error && <div className="alert-banner error" style={{ marginBottom: '1rem' }}>{error}</div>}

      <div className="table-container">
        {loading ? (
          <div className="state-container">
            <p>Loading trainings...</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Training Name</th>
                <th>Trainer</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Status</th>
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {trainings.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 6 : 5} style={{ textAlign: 'center', padding: '1rem' }}>No trainings found.</td>
                </tr>
              ) : (
                trainings.map(t => (
                  <tr key={t.id}>
                    <td><strong>{t.training_name}</strong></td>
                    <td>{t.trainer?.first_name} {t.trainer?.last_name}</td>
                    <td>{formatDate(t.start_date)}</td>
                    <td>{formatDate(t.end_date)}</td>
                    <td>
                      <span className={`badge ${getStatusBadgeClass(t.status)}`}>
                        {(t.status || '').toUpperCase()}
                      </span>
                    </td>
                    {canManage && (
                      <td>
                        <div className="actions-cell" style={{ display: 'flex', gap: '0.5rem' }}>
                          <button className="btn-primary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleOpenAttendeesModal(t)}>
                            Attendees
                          </button>
                          <button className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleOpenEditModal(t)}>
                            Edit
                          </button>
                          <button className="btn-danger" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleDelete(t.id)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* CRUD Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '600px', width: '90%' }}>
            <div className="modal-header">
              <h3>
                {modalMode === 'create' ? 'Create Training' : 'Edit Training'}
              </h3>
              <button onClick={handleCloseModal} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', lineHeight: 1 }}>&times;</button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                {formError && <div className="alert-banner error" style={{ marginBottom: '1rem' }}>{formError}</div>}
                
                <div className="filter-group" style={{ marginBottom: '1rem' }}>
                  <label className="filter-label">Training Name *</label>
                  <input
                    type="text"
                    name="training_name"
                    className="form-control"
                    value={formData.training_name}
                    onChange={handleInputChange}
                    placeholder="Enter training name"
                    required
                  />
                </div>

                <div className="filter-group" style={{ marginBottom: '1rem' }}>
                  <label className="filter-label">Trainer *</label>
                  <CustomSelect
                    name="trainer_employee_id"
                    className="form-control"
                    value={formData.trainer_employee_id}
                    onChange={handleInputChange}
                    required
                  >
                    <option value="">Select Trainer</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>
                    ))}
                  </CustomSelect>
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
                      min={formData.start_date}
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
                    <option value="scheduled">Scheduled</option>
                    <option value="ongoing">Ongoing</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </CustomSelect>
                </div>
              </div>
              
              <div className="modal-footer" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={handleCloseModal} disabled={isSubmitting}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Save Training'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Attendees Modal */}
      {isAttendeeModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '800px', width: '90%' }}>
            <div className="modal-header">
              <h3>Manage Attendees: {selectedTrainingForAttendees?.training_name}</h3>
              <button onClick={handleCloseAttendeesModal} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', lineHeight: 1 }}>&times;</button>
            </div>
            
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {enrollError && <div className="alert-banner error" style={{ marginBottom: '1rem' }}>{enrollError}</div>}
              {selectedTrainingForAttendees?.status === 'completed' && (
                <div className="alert-banner info" style={{ marginBottom: '1rem', backgroundColor: '#eef2ff', color: '#4338ca', padding: '0.75rem', borderRadius: '4px', border: '1px solid #c7d2fe' }}>
                  Enrollment is disabled because this training is completed.
                </div>
              )}
              
              <form onSubmit={handleEnrollEmployee} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', marginBottom: '2rem', background: '#f9fafb', padding: '1rem', borderRadius: '4px' }}>
                <div className="filter-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label className="filter-label">Enroll Employee</label>
                  <CustomSelect
                    className="form-control"
                    value={enrollForm.employee_id}
                    onChange={(e) => setEnrollForm({ employee_id: e.target.value })}
                    required
                    disabled={selectedTrainingForAttendees?.status === 'completed'}
                  >
                    <option value="">Select Employee</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name} ({emp.employee_code})</option>
                    ))}
                  </CustomSelect>
                </div>
                <button 
                  type="submit" 
                  className="btn-primary" 
                  disabled={isEnrolling || selectedTrainingForAttendees?.status === 'completed'}
                >
                  {isEnrolling ? 'Enrolling...' : '+ Enroll'}
                </button>
              </form>

              <h4>Enrolled Employees</h4>
              {isAttendeesLoading ? (
                <div style={{ padding: '2rem', textAlign: 'center' }}>Loading attendees...</div>
              ) : (
                <div className="table-container" style={{ marginTop: '1rem' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Employee Name</th>
                        <th>Employee ID</th>
                        <th>Completion Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendees.length === 0 ? (
                        <tr>
                          <td colSpan="4" style={{ textAlign: 'center', padding: '1rem' }}>No employees enrolled.</td>
                        </tr>
                      ) : (
                        attendees.map(a => (
                          <tr key={a.id}>
                            <td>{a.employee?.first_name} {a.employee?.last_name}</td>
                            <td>{a.employee?.employee_code}</td>
                            <td>
                              <CustomSelect 
                                className="form-control" 
                                style={{ width: 'auto', padding: '0.25rem 0.5rem' }}
                                value={a.completion_status || 'enrolled'}
                                onChange={(e) => handleUpdateCompletionStatus(a.id, e.target.value)}
                              >
                                <option value="enrolled">Enrolled</option>
                                <option value="completed">Completed</option>
                                <option value="failed">Failed</option>
                                <option value="dropped">Dropped</option>
                              </CustomSelect>
                            </td>
                            <td>
                              <button className="btn-danger" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleRemoveAttendee(a.id)}>
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={handleCloseAttendeesModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Training;
