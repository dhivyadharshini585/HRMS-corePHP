import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { useAuthContext } from '../../context/AuthContext';
import '../../styles/common.css';
import CustomSelect from '../../components/common/CustomSelect';

function Reviews() {
  const { hasPermission } = useAuthContext();
  const [reviews, setReviews] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create', 'edit'
  const [currentReview, setCurrentReview] = useState(null);
  
  const initialForm = {
    employee_id: '',
    cycle_id: '',
    reviewer_id: '',
    rating_technical_skills: 3,
    rating_communication: 3,
    rating_teamwork: 3,
    rating_leadership: 3,
    rating_productivity: 3,
    rating_problem_solving: 3,
    rating_attendance: 3,
    rating_goal_achievement: 3,
    comments: '',
    status: 'draft'
  };

  const [formData, setFormData] = useState(initialForm);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [reviewsRes, employeesRes, cyclesRes] = await Promise.all([
        api.get('/performance-reviews'),
        api.get('/employees').catch(() => ({ data: [] })),
        api.get('/performance-cycles')
      ]);
      setReviews(reviewsRes.data);
      
      let empData = employeesRes.data;
      if (empData && !Array.isArray(empData) && Array.isArray(empData.data)) {
        empData = empData.data;
      }
      if (!empData || !Array.isArray(empData) || empData.length === 0) {
        const empMap = new Map();
        reviewsRes.data.forEach(r => {
          if (r.employee) empMap.set(r.employee.id, r.employee);
          if (r.reviewer) empMap.set(r.reviewer.id, r.reviewer);
        });
        empData = Array.from(empMap.values());
      }
      setEmployees(empData);
      setCycles(cyclesRes.data);
    } catch (err) {
      console.error(err);
      setError('Failed to load performance reviews.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenCreateModal = () => {
    setModalMode('create');
    setFormData(initialForm);
    setFormError('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (review) => {
    setModalMode('edit');
    setCurrentReview(review);
    setFormData({
      employee_id: review.employee_id || '',
      cycle_id: review.cycle_id || '',
      reviewer_id: review.reviewer_id || '',
      rating_technical_skills: review.rating_technical_skills || 3,
      rating_communication: review.rating_communication || 3,
      rating_teamwork: review.rating_teamwork || 3,
      rating_leadership: review.rating_leadership || 3,
      rating_productivity: review.rating_productivity || 3,
      rating_problem_solving: review.rating_problem_solving || 3,
      rating_attendance: review.rating_attendance || 3,
      rating_goal_achievement: review.rating_goal_achievement || 3,
      comments: review.comments || '',
      status: review.status || 'draft'
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setCurrentReview(null);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    let finalValue = value;
    if (name.startsWith('rating_')) {
      finalValue = parseInt(value, 10);
    }
    setFormData(prev => ({ ...prev, [name]: finalValue }));
  };

  const handleSubmit = async (e, forcedStatus = null) => {
    e.preventDefault();
    setFormError('');
    setIsSubmitting(true);
    
    const payloadStatus = forcedStatus || formData.status;

    try {
      let payload = { ...formData, status: payloadStatus };
      
      if (modalMode === 'edit') {
        // Backend restricts changing employee_id, cycle_id, reviewer_id on update
        delete payload.employee_id;
        delete payload.cycle_id;
        delete payload.reviewer_id;
        
        await api.put(`/performance-reviews/${currentReview.id}`, payload);
        setSuccessMsg(`Review updated successfully (${payloadStatus}).`);
      } else {
        await api.post('/performance-reviews', payload);
        setSuccessMsg(`Review created successfully as ${payloadStatus}.`);
      }
      
      handleCloseModal();
      const res = await api.get('/performance-reviews');
      setReviews(res.data);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error(err);
      setFormError(err.response?.data?.message || 'An error occurred while saving the review.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAcknowledge = async (id) => {
    if (window.confirm('Are you sure you want to acknowledge this review?')) {
      try {
        await api.put(`/performance-reviews/${id}`, { status: 'acknowledged' });
        setSuccessMsg('Review acknowledged successfully.');
        const res = await api.get('/performance-reviews');
        setReviews(res.data);
        setTimeout(() => setSuccessMsg(''), 3000);
      } catch (err) {
        console.error(err);
        setError(err.response?.data?.message || 'Failed to acknowledge review. You may be unauthorized.');
        setTimeout(() => setError(''), 4000);
      }
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this review?')) {
      try {
        await api.delete(`/performance-reviews/${id}`);
        setSuccessMsg('Review deleted successfully.');
        const res = await api.get('/performance-reviews');
        setReviews(res.data);
        setTimeout(() => setSuccessMsg(''), 3000);
      } catch (err) {
        console.error(err);
        setError(err.response?.data?.message || 'Failed to delete review.');
        setTimeout(() => setError(''), 3000);
      }
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'acknowledged': return 'badge-success';
      case 'submitted': return 'badge-info';
      case 'draft': return 'badge-neutral';
      default: return 'badge-neutral';
    }
  };

  const calculateAverage = (review) => {
    const ratings = [
      review.rating_technical_skills,
      review.rating_communication,
      review.rating_teamwork,
      review.rating_leadership,
      review.rating_productivity,
      review.rating_problem_solving,
      review.rating_attendance,
      review.rating_goal_achievement
    ];
    const sum = ratings.reduce((a, b) => a + (b || 0), 0);
    return (sum / 8).toFixed(1);
  };

  const RATING_LABELS = {
    1: '1 - Poor',
    2: '2 - Needs Improvement',
    3: '3 - Meets Expectations',
    4: '4 - Very Good',
    5: '5 - Excellent'
  };

  const renderRatingSelect = (name, label) => (
    <div className="filter-group">
      <label className="filter-label">{label} *</label>
      <CustomSelect
        name={name}
        className="form-control"
        value={formData[name]}
        onChange={handleInputChange}
        required
      >
        {[1, 2, 3, 4, 5].map(val => (
          <option key={val} value={val}>{RATING_LABELS[val]}</option>
        ))}
      </CustomSelect>
    </div>
  );

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2 className="page-title">Performance Reviews</h2>
          <p className="page-subtitle">Manage employee performance reviews</p>
        </div>
        {hasPermission('performance.manage') && (
          <button className="btn-primary" onClick={handleOpenCreateModal}>
            + Create Review
          </button>
        )}
      </div>

      {successMsg && <div className="alert-banner success" style={{ marginBottom: '1rem' }}>{successMsg}</div>}
      {error && <div className="alert-banner error" style={{ marginBottom: '1rem' }}>{error}</div>}

      <div className="table-container">
        {loading ? (
          <div className="state-container">
            <p>Loading reviews...</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Reviewer</th>
                <th>Cycle</th>
                <th>Avg Rating</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reviews.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '1rem' }}>No reviews found.</td>
                </tr>
              ) : (
                reviews.map(r => (
                  <tr key={r.id}>
                    <td>{r.employee?.first_name} {r.employee?.last_name}</td>
                    <td>{r.reviewer?.first_name} {r.reviewer?.last_name}</td>
                    <td>{r.cycle?.name}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <strong style={{ fontSize: '1.1rem' }}>{calculateAverage(r)}</strong>
                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>/ 5.0</span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${getStatusBadgeClass(r.status)}`}>
                        {(r.status || 'draft').toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <div className="actions-cell" style={{ display: 'flex', gap: '0.5rem' }}>
                        {r.status === 'submitted' && (
                          <button className="btn-success" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleAcknowledge(r.id)}>
                            Acknowledge
                          </button>
                        )}
                        {(hasPermission('performance.manage') || r.status === 'draft') && (
                          <button className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleOpenEditModal(r)}>
                            Edit
                          </button>
                        )}
                        {hasPermission('performance.manage') && (
                          <button className="btn-danger" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleDelete(r.id)}>
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

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '800px', width: '90%' }}>
            <div className="modal-header">
              <h3>
                {modalMode === 'create' ? 'Create Performance Review' : 'Edit Performance Review'}
              </h3>
              <button onClick={handleCloseModal} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', lineHeight: 1 }}>&times;</button>
            </div>
            
            <form>
              <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                {formError && <div className="alert-banner error" style={{ marginBottom: '1rem' }}>{formError}</div>}
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px' }}>
                  <div className="filter-group">
                    <label className="filter-label">Employee *</label>
                    <CustomSelect
                      name="employee_id"
                      className="form-control"
                      value={formData.employee_id}
                      onChange={handleInputChange}
                      required
                      disabled={modalMode === 'edit'}
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
                      disabled={modalMode === 'edit'}
                    >
                      <option value="">Select Cycle</option>
                      {cycles.map(cycle => (
                        <option key={cycle.id} value={cycle.id}>{cycle.name}</option>
                      ))}
                    </CustomSelect>
                  </div>
                  <div className="filter-group">
                    <label className="filter-label">Reviewer *</label>
                    <CustomSelect
                      name="reviewer_id"
                      className="form-control"
                      value={formData.reviewer_id}
                      onChange={handleInputChange}
                      required
                      disabled={modalMode === 'edit'}
                    >
                      <option value="">Select Reviewer</option>
                      {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>
                      ))}
                    </CustomSelect>
                    <small style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>
                      (Backend may auto-assign logged-in user)
                    </small>
                  </div>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <h4 style={{ marginBottom: '0.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>Ratings</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                    {renderRatingSelect('rating_technical_skills', 'Technical Skills')}
                    {renderRatingSelect('rating_communication', 'Communication')}
                    {renderRatingSelect('rating_teamwork', 'Teamwork')}
                    {renderRatingSelect('rating_leadership', 'Leadership')}
                    {renderRatingSelect('rating_productivity', 'Productivity')}
                    {renderRatingSelect('rating_problem_solving', 'Problem Solving')}
                    {renderRatingSelect('rating_attendance', 'Attendance')}
                    {renderRatingSelect('rating_goal_achievement', 'Goal Achievement')}
                  </div>
                </div>

                <div className="filter-group" style={{ marginBottom: '1rem' }}>
                  <label className="filter-label">Comments</label>
                  <textarea
                    name="comments"
                    className="form-control"
                    value={formData.comments}
                    onChange={handleInputChange}
                    placeholder="Enter review comments (optional)"
                    rows="4"
                  />
                </div>
              </div>
              
              <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
                <div>
                  {formData.status === 'draft' && modalMode === 'edit' && (
                    <button type="button" className="btn-success" onClick={(e) => handleSubmit(e, 'submitted')} disabled={isSubmitting}>
                      {isSubmitting ? 'Submitting...' : 'Submit Review'}
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="btn-secondary" onClick={handleCloseModal} disabled={isSubmitting}>
                    Cancel
                  </button>
                  <button type="button" className="btn-primary" onClick={(e) => handleSubmit(e, 'draft')} disabled={isSubmitting}>
                    {isSubmitting ? 'Saving...' : 'Save as Draft'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Reviews;
