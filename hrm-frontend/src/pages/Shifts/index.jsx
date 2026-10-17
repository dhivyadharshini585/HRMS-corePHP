import React, { useState, useEffect, useCallback } from 'react';
import shiftService from '../../services/shiftService';
import { getEmployees } from '../../services/employeeService';
import { useAuthContext } from '../../context/AuthContext';
import CustomSelect from '../../components/common/CustomSelect';

const Shifts = () => {
  const { user } = useAuthContext();
  const [activeTab, setActiveTab] = useState('shifts'); // 'shifts' | 'rotations'
  const [shifts, setShifts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [rotations, setRotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rotationsLoading, setRotationsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Shift Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    start_time: '09:00',
    end_time: '18:00',
    is_active: true,
    description: '',
    grace_period_minutes: 15,
    overtime_enabled: false,
    overtime_threshold_minutes: 60,
  });

  // Rotation Modal State
  const [isRotationModalOpen, setIsRotationModalOpen] = useState(false);
  const [rotationFormData, setRotationFormData] = useState({
    employee_id: '',
    shift_id: '',
    start_date: '',
    end_date: '',
  });

  const canManage = user?.roles?.some(r => ['Super Admin', 'HR Admin', 'HR Executive'].includes(r));

  const fetchShifts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await shiftService.getShifts();
      setShifts(data.data || []);
    } catch (err) {
      if (err.response?.status === 403) {
        setError('Unauthorized action. You do not have permission to view Shifts.');
      } else {
        setError('Failed to load shifts list.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEmployees = useCallback(async () => {
    try {
      const data = await getEmployees({ per_page: 100 });
      const list = data.data || data || [];
      setEmployees(list);
      if (list.length > 0 && !selectedEmployeeId) {
        setSelectedEmployeeId(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load employees for rotation', err);
    }
  }, [selectedEmployeeId]);

  const fetchRotations = useCallback(async (empId) => {
    if (!empId) return;
    setRotationsLoading(true);
    try {
      const data = await shiftService.getRotations(empId);
      setRotations(data.data || []);
    } catch (err) {
      console.error('Failed to load rotations', err);
      setRotations([]);
    } finally {
      setRotationsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShifts();
    if (canManage) {
      fetchEmployees();
    }
  }, [fetchShifts, fetchEmployees, canManage]);

  useEffect(() => {
    if (activeTab === 'rotations' && selectedEmployeeId) {
      fetchRotations(selectedEmployeeId);
    }
  }, [activeTab, selectedEmployeeId, fetchRotations]);

  const handleOpenModal = (shift = null) => {
    setEditingShift(shift);
    if (shift) {
      setFormData({
        name: shift.name,
        start_time: shift.start_time ? shift.start_time.substring(0, 5) : '09:00',
        end_time: shift.end_time ? shift.end_time.substring(0, 5) : '18:00',
        is_active: shift.is_active,
        description: shift.description || '',
        grace_period_minutes: shift.grace_period_minutes ?? 15,
        overtime_enabled: shift.overtime_enabled ?? false,
        overtime_threshold_minutes: shift.overtime_threshold_minutes ?? 60,
      });
    } else {
      setFormData({
        name: '',
        start_time: '09:00',
        end_time: '18:00',
        is_active: true,
        description: '',
        grace_period_minutes: 15,
        overtime_enabled: false,
        overtime_threshold_minutes: 60,
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    try {
      if (editingShift) {
        await shiftService.updateShift(editingShift.id, formData);
        setSuccessMessage('Shift updated successfully.');
      } else {
        await shiftService.createShift(formData);
        setSuccessMessage('Shift created successfully.');
      }
      setIsModalOpen(false);
      fetchShifts();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save shift.');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this shift?')) return;
    setError('');
    try {
      await shiftService.deleteShift(id);
      setSuccessMessage('Shift deleted successfully.');
      fetchShifts();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete shift.');
    }
  };

  const handleToggleStatus = async (shift) => {
    try {
      await shiftService.updateShift(shift.id, {
        ...shift,
        start_time: shift.start_time ? shift.start_time.substring(0, 5) : '09:00',
        end_time: shift.end_time ? shift.end_time.substring(0, 5) : '18:00',
        is_active: !shift.is_active,
      });
      fetchShifts();
    } catch (err) {
      setError('Failed to update shift status.');
    }
  };

  const handleOpenRotationModal = () => {
    setRotationFormData({
      employee_id: selectedEmployeeId || (employees[0]?.id || ''),
      shift_id: shifts[0]?.id || '',
      start_date: new Date().toISOString().substring(0, 10),
      end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10),
    });
    setIsRotationModalOpen(true);
  };

  const handleSaveRotation = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    try {
      await shiftService.createRotation(rotationFormData.employee_id, {
        shift_id: rotationFormData.shift_id,
        start_date: rotationFormData.start_date,
        end_date: rotationFormData.end_date,
      });
      setSuccessMessage('Shift rotation scheduled successfully.');
      setIsRotationModalOpen(false);
      fetchRotations(rotationFormData.employee_id);
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.errors?.date_range?.[0] || 'Failed to create shift rotation.');
    }
  };

  const handleDeleteRotation = async (rotationId) => {
    if (!window.confirm('Are you sure you want to delete this shift rotation?')) return;
    setError('');
    try {
      await shiftService.deleteRotation(rotationId);
      setSuccessMessage('Shift rotation deleted successfully.');
      fetchRotations(selectedEmployeeId);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete shift rotation.');
    }
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return '-';
    const [h, m] = timeStr.substring(0, 5).split(':');
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${m} ${ampm}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header Bar */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Shift Management</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Configure shift timings, grace periods, overtime rules, and employee rotations.
          </p>
        </div>
        {canManage && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {activeTab === 'shifts' ? (
              <button className="btn-primary" onClick={() => handleOpenModal()}>
                + Add New Shift
              </button>
            ) : (
              <button className="btn-primary" onClick={handleOpenRotationModal}>
                + Assign Shift Rotation
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
        <button
          onClick={() => setActiveTab('shifts')}
          style={{
            padding: '0.5rem 1rem',
            border: 'none',
            background: 'none',
            borderBottom: activeTab === 'shifts' ? '2px solid var(--primary-color)' : '2px solid transparent',
            color: activeTab === 'shifts' ? 'var(--primary-color)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'shifts' ? 600 : 400,
            cursor: 'pointer',
          }}
        >
          Shift Templates
        </button>
        {canManage && (
          <button
            onClick={() => setActiveTab('rotations')}
            style={{
              padding: '0.5rem 1rem',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === 'rotations' ? '2px solid var(--primary-color)' : '2px solid transparent',
              color: activeTab === 'rotations' ? 'var(--primary-color)' : 'var(--text-secondary)',
              fontWeight: activeTab === 'rotations' ? 600 : 400,
              cursor: 'pointer',
            }}
          >
            Shift Rotations
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

      {/* Tab 1: Shifts Table */}
      {activeTab === 'shifts' && (
        <div className="detail-card" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              Loading shifts...
            </div>
          ) : shifts.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <p style={{ fontSize: '1rem', fontWeight: 500 }}>No shifts configured.</p>
              <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>Create shifts to define working hours for employees.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Shift Name</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Timings</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Grace Period</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Overtime Rule</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Description</th>
                    {canManage && <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {shifts.map((shift) => (
                    <tr key={shift.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span>🕐</span>
                          <span>{shift.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.8rem',
                          backgroundColor: '#eef2ff',
                          color: '#4338ca',
                          padding: '0.2rem 0.5rem',
                          borderRadius: 'var(--radius-md)',
                        }}>
                          {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>
                        {shift.grace_period_minutes ? `${shift.grace_period_minutes} mins` : 'None'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>
                        {shift.overtime_enabled ? (
                          <span style={{ color: '#166534', backgroundColor: '#dcfce7', padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.75rem' }}>
                            Enabled ({shift.overtime_threshold_minutes || 60}m threshold)
                          </span>
                        ) : (
                          <span style={{ color: '#64748b' }}>Disabled</span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <button
                          disabled={!canManage}
                          onClick={() => handleToggleStatus(shift)}
                          className={`badge ${shift.is_active ? 'active' : 'inactive'}`}
                          style={{
                            cursor: canManage ? 'pointer' : 'default',
                            border: 'none',
                            background: shift.is_active ? '#dcfce7' : '#f1f5f9',
                            color: shift.is_active ? '#166534' : '#475569',
                          }}
                          title={canManage ? 'Click to toggle status' : ''}
                        >
                          {shift.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {shift.description || '—'}
                      </td>
                      {canManage && (
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                            <button
                              className="btn-secondary"
                              onClick={() => handleOpenModal(shift)}
                              style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                            >
                              Edit
                            </button>
                            <button
                              className="btn-secondary"
                              onClick={() => handleDelete(shift.id)}
                              style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem', color: '#ef4444', borderColor: '#fca5a5' }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Rotations Table */}
      {activeTab === 'rotations' && canManage && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Employee Selector */}
          <div className="detail-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem' }}>
            <label style={{ fontWeight: 500, fontSize: '0.875rem', whiteSpace: 'nowrap' }}>
              Select Employee:
            </label>
            <CustomSelect
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              style={{ padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', minWidth: '250px' }}
            >
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.employee_code} — {emp.first_name} {emp.last_name}
                </option>
              ))}
            </CustomSelect>
          </div>

          {/* Rotations List */}
          <div className="detail-card" style={{ padding: 0 }}>
            {rotationsLoading ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                Loading rotations...
              </div>
            ) : rotations.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <p style={{ fontSize: '1rem', fontWeight: 500 }}>No shift rotations scheduled for this employee.</p>
                <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>Click "+ Assign Shift Rotation" to schedule a shift for a date range.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      <th style={{ padding: '0.75rem 1rem' }}>Shift</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Start Date</th>
                      <th style={{ padding: '0.75rem 1rem' }}>End Date</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rotations.map((rot) => (
                      <tr key={rot.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>
                          {rot.shift?.name || 'Unknown Shift'} ({rot.shift?.start_time?.substring(0, 5)} - {rot.shift?.end_time?.substring(0, 5)})
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>{rot.start_date}</td>
                        <td style={{ padding: '0.75rem 1rem' }}>{rot.end_date}</td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span className="badge active">{rot.status || 'Scheduled'}</span>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                          <button
                            className="btn-secondary"
                            onClick={() => handleDeleteRotation(rot.id)}
                            style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem', color: '#ef4444', borderColor: '#fca5a5' }}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add / Edit Shift Modal */}
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
                {editingShift ? 'Edit Shift' : 'Add New Shift'}
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
                  Shift Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  className="form-control"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Morning Shift"
                  style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                    Start Time <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="time"
                    className="form-control"
                    required
                    value={formData.start_time}
                    onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                    End Time <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="time"
                    className="form-control"
                    required
                    value={formData.end_time}
                    onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                    Grace Period (minutes)
                  </label>
                  <input
                    type="number"
                    min="0"
                    className="form-control"
                    value={formData.grace_period_minutes}
                    onChange={(e) => setFormData({ ...formData, grace_period_minutes: parseInt(e.target.value, 10) || 0 })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                    Overtime Threshold (minutes)
                  </label>
                  <input
                    type="number"
                    min="0"
                    disabled={!formData.overtime_enabled}
                    className="form-control"
                    value={formData.overtime_threshold_minutes}
                    onChange={(e) => setFormData({ ...formData, overtime_threshold_minutes: parseInt(e.target.value, 10) || 0 })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    id="overtime_enabled"
                    checked={formData.overtime_enabled}
                    onChange={(e) => setFormData({ ...formData, overtime_enabled: e.target.checked })}
                    style={{ accentColor: 'var(--primary-color)' }}
                  />
                  <label htmlFor="overtime_enabled" style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                    Enable Overtime
                  </label>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    style={{ accentColor: 'var(--primary-color)' }}
                  />
                  <label htmlFor="is_active" style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                    Active
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                  Description
                </label>
                <textarea
                  rows="2"
                  className="form-control"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional shift details..."
                  style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Shift
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Rotation Modal */}
      {isRotationModalOpen && (
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
          <div className="detail-card" style={{ width: '100%', maxWidth: '500px', margin: '1rem', backgroundColor: 'var(--bg-surface)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Assign Shift Rotation</h2>
              <button className="btn-secondary" style={{ padding: '0.25rem 0.5rem' }} onClick={() => setIsRotationModalOpen(false)}>✕</button>
            </div>

            {error && (
              <div style={{ padding: '0.75rem', color: '#ef4444', backgroundColor: '#fee2e2', borderRadius: 'var(--radius-md)', marginBottom: '1rem', fontSize: '0.875rem' }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSaveRotation} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                  Employee <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <CustomSelect
                  required
                  value={rotationFormData.employee_id}
                  onChange={(e) => setRotationFormData({ ...rotationFormData, employee_id: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}
                >
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.employee_code} — {emp.first_name} {emp.last_name}
                    </option>
                  ))}
                </CustomSelect>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                  Shift Template <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <CustomSelect
                  required
                  value={rotationFormData.shift_id}
                  onChange={(e) => setRotationFormData({ ...rotationFormData, shift_id: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}
                >
                  {shifts.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({formatTime(s.start_time)} - {formatTime(s.end_time)})
                    </option>
                  ))}
                </CustomSelect>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                    Start Date <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={rotationFormData.start_date}
                    onChange={(e) => setRotationFormData({ ...rotationFormData, start_date: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                    End Date <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={rotationFormData.end_date}
                    onChange={(e) => setRotationFormData({ ...rotationFormData, end_date: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsRotationModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Assign Rotation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Shifts;
