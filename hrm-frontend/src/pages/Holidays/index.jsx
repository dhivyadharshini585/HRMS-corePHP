import React, { useState, useEffect, useCallback } from 'react';
import holidayService from '../../services/holidayService';
import { useAuthContext } from '../../context/AuthContext';
import CustomSelect from '../../components/common/CustomSelect';

const Holidays = () => {
  const { user } = useAuthContext();
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    holiday_date: '',
    holiday_type: 'National',
    description: '',
    is_active: true,
  });

  const canManage = user?.roles?.some(r => ['Super Admin', 'HR Admin', 'HR Executive'].includes(r));

  const fetchHolidays = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await holidayService.getHolidays();
      setHolidays(data.data || []);
    } catch (err) {
      if (err.response?.status === 403) {
        setError('Unauthorized action. You do not have permission to view Holidays.');
      } else {
        setError('Failed to load holidays list.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHolidays();
  }, [fetchHolidays]);

  const handleOpenModal = (holiday = null) => {
    setEditingHoliday(holiday);
    if (holiday) {
      setFormData({
        name: holiday.name,
        holiday_date: holiday.holiday_date,
        holiday_type: holiday.holiday_type || 'National',
        description: holiday.description || '',
        is_active: holiday.is_active,
      });
    } else {
      setFormData({
        name: '',
        holiday_date: '',
        holiday_type: 'National',
        description: '',
        is_active: true,
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    try {
      if (editingHoliday) {
        await holidayService.updateHoliday(editingHoliday.id, formData);
        setSuccessMessage('Holiday updated successfully.');
      } else {
        await holidayService.createHoliday(formData);
        setSuccessMessage('Holiday created successfully.');
      }
      setIsModalOpen(false);
      fetchHolidays();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save holiday.');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this holiday?')) return;
    setError('');
    try {
      await holidayService.deleteHoliday(id);
      setSuccessMessage('Holiday deleted successfully.');
      fetchHolidays();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete holiday.');
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  };

  const getDaysUntil = (dateStr) => {
    if (!dateStr) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr + 'T00:00:00');
    target.setHours(0, 0, 0, 0);
    const diff = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff > 0) return `In ${diff} days`;
    return `${Math.abs(diff)} days ago`;
  };

  const getHolidayTypeBadge = (type) => {
    switch (type) {
      case 'National':
        return <span style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 500 }}>National</span>;
      case 'Company':
        return <span style={{ backgroundColor: '#e0e7ff', color: '#3730a3', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 500 }}>Company</span>;
      case 'Regional':
        return <span style={{ backgroundColor: '#fef3c7', color: '#92400e', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 500 }}>Regional</span>;
      case 'Optional':
        return <span style={{ backgroundColor: '#f3e8ff', color: '#6b21a8', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 500 }}>Optional</span>;
      default:
        return <span style={{ backgroundColor: '#f1f5f9', color: '#475569', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 500 }}>{type || 'National'}</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header Bar */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Holiday Calendar</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Company official holidays, national observances, and regional holidays.
          </p>
        </div>
        {canManage && (
          <button className="btn-primary" onClick={() => handleOpenModal()}>
            + Add New Holiday
          </button>
        )}
      </div>

      {/* Messages */}
      {successMessage && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: '#dcfce7', color: '#15803d', borderRadius: 'var(--radius-md)', fontSize: '0.875rem' }}>
          {successMessage}
        </div>
      )}
      {error && (
        <div style={{ padding: '0.75rem 1rem', color: '#ef4444', backgroundColor: '#fee2e2', borderRadius: 'var(--radius-md)', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      {/* Holidays Table */}
      <div className="detail-card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading holidays...
          </div>
        ) : holidays.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <p style={{ fontSize: '1rem', fontWeight: 500 }}>No holidays listed.</p>
            <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>Add company holidays and observances for the organization.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Holiday Date</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Holiday Name</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Type</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Countdown</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Description</th>
                  {canManage && <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {holidays.map((holiday) => {
                  const countdown = getDaysUntil(holiday.holiday_date);
                  const isPast = countdown && countdown.includes('ago');
                  return (
                    <tr key={holiday.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span>📅</span>
                          <span style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.8rem',
                            backgroundColor: '#eef2ff',
                            color: '#4338ca',
                            padding: '0.2rem 0.5rem',
                            borderRadius: 'var(--radius-md)',
                            fontWeight: 500,
                          }}>
                            {formatDate(holiday.holiday_date)}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>
                        {holiday.name}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {getHolidayTypeBadge(holiday.holiday_type)}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem' }}>
                        {countdown && (
                          <span style={{
                            padding: '0.2rem 0.5rem',
                            borderRadius: 'var(--radius-full)',
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            backgroundColor: isPast ? '#f1f5f9' : '#fef3c7',
                            color: isPast ? '#64748b' : '#92400e',
                          }}>
                            {countdown}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span className={`badge ${holiday.is_active ? 'active' : 'inactive'}`}>
                          {holiday.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {holiday.description || '—'}
                      </td>
                      {canManage && (
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                            <button
                              className="btn-secondary"
                              onClick={() => handleOpenModal(holiday)}
                              style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                            >
                              Edit
                            </button>
                            <button
                              className="btn-secondary"
                              onClick={() => handleDelete(holiday.id)}
                              style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem', color: '#ef4444', borderColor: '#fca5a5' }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Holiday Modal */}
      {isModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div className="detail-card" style={{ width: '100%', maxWidth: '540px', margin: '1rem', backgroundColor: 'var(--bg-surface)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                {editingHoliday ? 'Edit Holiday' : 'Add New Holiday'}
              </h2>
              <button className="btn-secondary" style={{ padding: '0.25rem 0.5rem' }} onClick={() => setIsModalOpen(false)}>✕</button>
            </div>

            {error && (
              <div style={{ padding: '0.75rem', color: '#ef4444', backgroundColor: '#fee2e2', borderRadius: 'var(--radius-md)', marginBottom: '1rem', fontSize: '0.875rem' }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                  Holiday Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  className="form-control"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Independence Day"
                  style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                    Holiday Date <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="date"
                    className="form-control"
                    required
                    value={formData.holiday_date}
                    onChange={(e) => setFormData({ ...formData, holiday_date: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                    Holiday Type <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <CustomSelect
                    className="form-control"
                    value={formData.holiday_type}
                    onChange={(e) => setFormData({ ...formData, holiday_type: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}
                  >
                    <option value="National">National</option>
                    <option value="Company">Company</option>
                    <option value="Regional">Regional</option>
                    <option value="Optional">Optional</option>
                  </CustomSelect>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                  Description
                </label>
                <textarea
                  rows="3"
                  className="form-control"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional holiday details..."
                  style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  id="holiday_is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  style={{ accentColor: 'var(--primary-color)' }}
                />
                <label htmlFor="holiday_is_active" style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                  Holiday is Active
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Holiday
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Holidays;
