import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getEmployee, getMyProfile, createCredentials, changePassword } from '../../services/employeeService';
import { useAuthContext } from '../../context/AuthContext';
import { ROUTES } from '../../constants/routes';

export default function EmployeeView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission, hasRole } = useAuthContext();
  
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [credPassword, setCredPassword] = useState('');
  const [credPasswordConfirm, setCredPasswordConfirm] = useState('');
  const [credSubmitting, setCredSubmitting] = useState(false);
  const [credError, setCredError] = useState('');
  const [credSuccess, setCredSuccess] = useState('');

  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [changePasswordVal, setChangePasswordVal] = useState('');
  const [changePasswordConfirmVal, setChangePasswordConfirmVal] = useState('');
  const [changePasswordSubmitting, setChangePasswordSubmitting] = useState(false);
  const [changePasswordError, setChangePasswordError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    
    const fetchProfileData = async () => {
      setLoading(true);
      setError('');
      try {
        let data;
        if (id) {
          data = await getEmployee(id, { signal: controller.signal });
        } else {
          data = await getMyProfile({ signal: controller.signal });
        }
        setEmployee(data);
      } catch (err) {
        if (err.name !== 'CanceledError') {
          console.error(err);
          setError(err.response?.data?.message || 'Failed to load employee profile.');
        }
      } finally {
        setLoading(false);
      }
    };
    
    fetchProfileData();
    return () => { controller.abort(); };
  }, [id]);

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        Loading employee profile...
      </div>
    );
  }

  if (error) {
    return (
      <div className="employee-view-page">
        <div style={{ padding: '2rem', color: '#ef4444', backgroundColor: '#fee2e2', borderRadius: 'var(--radius-md)', marginBottom: '1rem' }}>
          {error}
        </div>
        {hasPermission('employees.view') && (
          <button className="btn-secondary" onClick={() => navigate(ROUTES.EMPLOYEES)}>
            Back to Employees
          </button>
        )}
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="employee-view-page">
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Employee record not found.
        </div>
        {hasPermission('employees.view') && (
          <button className="btn-secondary" onClick={() => navigate(ROUTES.EMPLOYEES)}>
            Back to Employees
          </button>
        )}
      </div>
    );
  }

  const handleCreateCredentialsSubmit = async (e) => {
    e.preventDefault();
    setCredSubmitting(true);
    setCredError('');

    if (credPassword !== credPasswordConfirm) {
      setCredError('Passwords do not match.');
      setCredSubmitting(false);
      return;
    }

    if (credPassword.length < 8) {
      setCredError('Password must be at least 8 characters long.');
      setCredSubmitting(false);
      return;
    }

    try {
      await createCredentials(employee.id, {
        password: credPassword,
        password_confirmation: credPasswordConfirm,
      });
      setCredSuccess('Login credentials created successfully.');
      setShowCredentialsModal(false);
      setCredPassword('');
      setCredPasswordConfirm('');

      // Reload employee details
      if (id) {
        const updated = await getEmployee(id);
        setEmployee(updated);
      } else {
        const updated = await getMyProfile();
        setEmployee(updated);
      }
    } catch (err) {
      if (err.response?.data?.errors) {
        const firstErr = Object.values(err.response.data.errors)[0][0];
        setCredError(firstErr);
      } else {
        setCredError(err.response?.data?.message || 'Failed to create login credentials.');
      }
    } finally {
      setCredSubmitting(false);
    }
  };

  const handleChangePasswordSubmit = async (e) => {
    e.preventDefault();
    setChangePasswordSubmitting(true);
    setChangePasswordError('');

    if (changePasswordVal !== changePasswordConfirmVal) {
      setChangePasswordError('Passwords do not match.');
      setChangePasswordSubmitting(false);
      return;
    }

    if (changePasswordVal.length < 8) {
      setChangePasswordError('Password must be at least 8 characters long.');
      setChangePasswordSubmitting(false);
      return;
    }

    try {
      await changePassword(employee.id, {
        password: changePasswordVal,
        password_confirmation: changePasswordConfirmVal,
      });
      setCredSuccess('Employee password changed successfully and active sessions were revoked.');
      setShowChangePasswordModal(false);
      setChangePasswordVal('');
      setChangePasswordConfirmVal('');

      if (id) {
        const updated = await getEmployee(id);
        setEmployee(updated);
      } else {
        const updated = await getMyProfile();
        setEmployee(updated);
      }
    } catch (err) {
      if (err.response?.data?.errors) {
        const firstErr = Object.values(err.response.data.errors)[0][0];
        setChangePasswordError(firstErr);
      } else {
        setChangePasswordError(err.response?.data?.message || 'Failed to change password.');
      }
    } finally {
      setChangePasswordSubmitting(false);
    }
  };

  const initials = `${employee.first_name?.charAt(0) || ''}${employee.last_name?.charAt(0) || ''}`;

  return (
    <div className="employee-view-page">
      {/* Top Bar Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Employee Profile</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Comprehensive employee details and history
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {hasPermission('employees.view') && (
            <button className="btn-secondary" onClick={() => navigate(ROUTES.EMPLOYEES)}>
              Back to Employees
            </button>
          )}
          {hasPermission('documents.view') && (
            <button className="btn-secondary" onClick={() => navigate(`${ROUTES.DOCUMENTS}?employee_id=${employee.id}`)}>
              📁 Documents
            </button>
          )}
          {hasPermission('employees.update') && (
            <button className="btn-primary" onClick={() => navigate(ROUTES.EMPLOYEE_EDIT.replace(':id', employee.id))}>
              Edit Profile
            </button>
          )}
        </div>
      </div>

      {credSuccess && (
        <div style={{ padding: '0.75rem 1rem', color: '#065f46', backgroundColor: '#d1fae5', borderRadius: 'var(--radius-md)', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{credSuccess}</span>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => setCredSuccess('')}>✕</button>
        </div>
      )}

      {/* Hero Header Card */}
      <div className="detail-card" style={{ marginBottom: '1.5rem' }}>
        <div className="detail-header" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 0 }}>
          <div className="detail-avatar">
            {initials}
          </div>
          <div className="detail-info" style={{ flexGrow: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>{employee.first_name} {employee.last_name}</h2>
              <span className={`badge ${employee.employment_status?.toLowerCase().replace(' ', '-')}`}>
                {employee.employment_status}
              </span>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '0.25rem 0' }}>
              {employee.employee_code} • {employee.designation?.title || 'No Designation'} ({employee.department?.name || 'No Department'})
            </p>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.75rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              <span>📧 {employee.email}</span>
              <span>📞 {employee.phone || 'N/A'}</span>
              <span>📍 {employee.work_location || 'Headquarters'}</span>
              <span>⏰ {employee.work_shift || 'Standard Day Shift'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2-Column Section Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
        
        {/* Personal Details */}
        <div className="detail-card">
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            Personal Details
          </h3>
          <div className="detail-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="detail-item">
              <span className="detail-label">Employee ID</span>
              <span className="detail-value">{employee.employee_code}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">First Name</span>
              <span className="detail-value">{employee.first_name}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Last Name</span>
              <span className="detail-value">{employee.last_name}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Date of Birth</span>
              <span className="detail-value">
                {employee.date_of_birth ? new Date(employee.date_of_birth).toLocaleDateString() : '-'}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Gender</span>
              <span className="detail-value">{employee.gender || '-'}</span>
            </div>
            <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
              <span className="detail-label">User Account</span>
              <div className="detail-value" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                {employee.user_id ? (
                  <>
                    <span style={{ color: '#059669', fontWeight: 600 }}>
                      Login Account: Linked ({employee.user?.email || employee.email})
                    </span>
                    {hasRole('Super Admin') && (
                      <button
                        className="btn-secondary"
                        style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}
                        onClick={() => {
                          setShowChangePasswordModal(true);
                          setChangePasswordError('');
                          setChangePasswordVal('');
                          setChangePasswordConfirmVal('');
                        }}
                      >
                        Change Password
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <span style={{ color: 'var(--text-secondary, #6b7280)' }}>
                      No Login Account
                    </span>
                    {hasRole('Super Admin') && (
                      <button
                        className="btn-primary"
                        style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}
                        onClick={() => {
                          setShowCredentialsModal(true);
                          setCredError('');
                          setCredPassword('');
                          setCredPasswordConfirm('');
                        }}
                      >
                        Create Login Account
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Contact Details */}
        <div className="detail-card">
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            Contact Information
          </h3>
          <div className="detail-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="detail-item">
              <span className="detail-label">Email Address</span>
              <span className="detail-value">{employee.email}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Phone Number</span>
              <span className="detail-value">{employee.phone || '-'}</span>
            </div>
            <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
              <span className="detail-label">Address</span>
              <span className="detail-value">
                {[employee.address, employee.city, employee.state, employee.country, employee.postal_code].filter(Boolean).join(', ') || '-'}
              </span>
            </div>
          </div>
        </div>

        {/* Emergency Contact */}
        <div className="detail-card">
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            Emergency Contact
          </h3>
          <div className="detail-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="detail-item">
              <span className="detail-label">Contact Name</span>
              <span className="detail-value">{employee.emergency_contact_name || '-'}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Relationship</span>
              <span className="detail-value">{employee.emergency_contact_relationship || '-'}</span>
            </div>
            <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
              <span className="detail-label">Emergency Phone</span>
              <span className="detail-value">{employee.emergency_contact_phone || '-'}</span>
            </div>
          </div>
        </div>

        {/* Job & Employment Details */}
        <div className="detail-card">
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            Job & Employment Details
          </h3>
          <div className="detail-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="detail-item">
              <span className="detail-label">Department</span>
              <span className="detail-value">{employee.department?.name || '-'}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Designation</span>
              <span className="detail-value">{employee.designation?.title || '-'}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Job Level</span>
              <span className="detail-value">{employee.job_level || 'Mid-Level'}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Reporting Manager</span>
              <span className="detail-value">
                {employee.manager ? `${employee.manager.first_name} ${employee.manager.last_name} (${employee.manager.designation?.title || 'Manager'})` : 'No Direct Manager'}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Date of Joining</span>
              <span className="detail-value">
                {employee.date_of_joining ? new Date(employee.date_of_joining).toLocaleDateString() : '-'}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Employment Type</span>
              <span className="detail-value">{employee.employment_type}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Work Location</span>
              <span className="detail-value">{employee.work_location || 'Headquarters'}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Assigned Shift</span>
              <span className="detail-value">
                {employee.current_shift ? `${employee.current_shift.name} (${employee.current_shift.start_time?.substring(0, 5)} - ${employee.current_shift.end_time?.substring(0, 5)})` : employee.shift ? `${employee.shift.name} (${employee.shift.start_time?.substring(0, 5)} - ${employee.shift.end_time?.substring(0, 5)})` : (employee.work_shift || 'Standard Day Shift')}
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Employment History Section */}
      <div className="detail-card" style={{ marginTop: '1.5rem' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
          Employment History
        </h3>
        {!employee.employment_histories || employee.employment_histories.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', fontStyle: 'italic', padding: '1rem 0' }}>
            No prior employment history records on file.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {employee.employment_histories.map(history => (
              <div key={history.id} style={{ padding: '1rem', backgroundColor: 'var(--bg-surface-hover)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <h4 style={{ fontWeight: 600, fontSize: '0.95rem' }}>{history.job_title} at {history.company_name}</h4>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {history.start_date ? new Date(history.start_date).toLocaleDateString() : 'N/A'} - {history.end_date ? new Date(history.end_date).toLocaleDateString() : 'Present'}
                  </span>
                </div>
                {history.responsibilities && (
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                    {history.responsibilities}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal for Super Admin creating credentials */}
      {showCredentialsModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: 'var(--bg-surface, #ffffff)',
            padding: '1.5rem',
            borderRadius: 'var(--radius-lg, 8px)',
            width: '100%',
            maxWidth: '450px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Create Login Credentials
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Creating login account for <strong>{employee.first_name} {employee.last_name}</strong> ({employee.email}). Role assigned: <strong>Employee</strong>.
            </p>

            {credError && (
              <div style={{ color: '#ef4444', backgroundColor: '#fee2e2', padding: '0.5rem 0.75rem', borderRadius: '4px', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {credError}
              </div>
            )}

            <form onSubmit={handleCreateCredentialsSubmit}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Password *</label>
                <input
                  type="password"
                  className="form-input"
                  value={credPassword}
                  onChange={(e) => setCredPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Min 8 characters"
                />
              </div>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label">Confirm Password *</label>
                <input
                  type="password"
                  className="form-input"
                  value={credPasswordConfirm}
                  onChange={(e) => setCredPasswordConfirm(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Re-enter password"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowCredentialsModal(false)}
                  disabled={credSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={credSubmitting}
                >
                  {credSubmitting ? 'Creating...' : 'Create Credentials'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal for Super Admin changing employee password */}
      {showChangePasswordModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: 'var(--bg-surface, #ffffff)',
            padding: '1.5rem',
            borderRadius: 'var(--radius-lg, 8px)',
            width: '100%',
            maxWidth: '450px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Change Employee Password
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Setting a new password for <strong>{employee.first_name} {employee.last_name}</strong> ({employee.user?.email || employee.email}). Active sessions will be terminated.
            </p>

            {changePasswordError && (
              <div style={{ color: '#ef4444', backgroundColor: '#fee2e2', padding: '0.5rem 0.75rem', borderRadius: '4px', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {changePasswordError}
              </div>
            )}

            <form onSubmit={handleChangePasswordSubmit}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">New Password *</label>
                <input
                  type="password"
                  className="form-input"
                  value={changePasswordVal}
                  onChange={(e) => setChangePasswordVal(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Min 8 characters"
                />
              </div>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label">Confirm New Password *</label>
                <input
                  type="password"
                  className="form-input"
                  value={changePasswordConfirmVal}
                  onChange={(e) => setChangePasswordConfirmVal(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Re-enter new password"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowChangePasswordModal(false)}
                  disabled={changePasswordSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={changePasswordSubmitting}
                >
                  {changePasswordSubmitting ? 'Updating...' : 'Change Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

