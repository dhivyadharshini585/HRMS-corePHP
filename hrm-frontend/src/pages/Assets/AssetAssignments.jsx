import React, { useEffect, useState } from 'react';
import { assetService } from '../../services/assetService';
import { useAuthContext } from '../../context/AuthContext';
import CustomSelect from '../../components/common/CustomSelect';

export default function AssetAssignments({ refreshKey, onRefresh }) {
  const { hasPermission, hasRole } = useAuthContext();
  const canManage = hasPermission
    ? (hasPermission('assets.manage') || hasRole('Super Admin') || hasRole('HR Admin') || hasRole('HR Executive'))
    : false;

  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [returnAssetModal, setReturnAssetModal] = useState(null);
  const [returnForm, setReturnForm] = useState({
    returned_date: new Date().toISOString().split('T')[0],
    condition_at_return: 'Good',
    notes: '',
  });

  useEffect(() => {
    fetchAssignments();
  }, [refreshKey]);

  const fetchAssignments = async () => {
    setLoading(true);
    try {
      const data = await assetService.getAssignments();
      const list = Array.isArray(data) ? data : (data.data || []);
      setAssignments(list.filter(a => a.status === 'Active'));
    } catch (err) {
      console.error('Failed to fetch asset assignments', err);
    } finally {
      setLoading(false);
    }
  };

  const openReturnModal = (assignment) => {
    setReturnAssetModal(assignment);
    setReturnForm({
      returned_date: new Date().toISOString().split('T')[0],
      condition_at_return: assignment.asset?.condition || 'Good',
      notes: '',
    });
  };

  const handleReturnSubmit = async (e) => {
    e.preventDefault();
    if (!returnAssetModal) return;
    try {
      await assetService.returnAsset(returnAssetModal.asset_id, returnForm);
      setReturnAssetModal(null);
      fetchAssignments();
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Failed to return asset.');
    }
  };

  return (
    <div className="detail-card">
      <div className="detail-card-header">
        <div>
          <h2 style={{ fontSize: '1.125rem', fontWeight: '600', color: 'var(--text-primary)' }}>Asset Assignments</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Track active employee asset allocations.</p>
        </div>
      </div>
      <div className="table-container">
        {loading ? (
          <div className="state-container"><p>Loading assignments...</p></div>
        ) : assignments.length === 0 ? (
          <div className="state-container"><p>No assets currently assigned.</p></div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Asset ID</th>
                <th>Asset Name</th>
                <th>Assigned To (Employee)</th>
                <th>Issue Date</th>
                {canManage && <th style={{ textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {assignments.map(a => (
                <tr key={a.id}>
                  <td style={{ fontWeight: '600', color: 'var(--primary-color)' }}>{a.asset?.asset_id}</td>
                  <td>{a.asset?.name}</td>
                  <td>{a.employee ? `${a.employee.first_name} ${a.employee.last_name}` : 'Unknown'}</td>
                  <td>{a.assigned_date || 'N/A'}</td>
                  {canManage && (
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => openReturnModal(a)}
                        className="btn-secondary"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                      >
                        Mark Returned
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Return Asset Modal */}
      {returnAssetModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 'var(--space-4)' }}>
          <div className="detail-card" style={{ width: '100%', maxWidth: '450px', backgroundColor: 'var(--bg-surface)' }}>
            <div className="detail-card-header">
              <h3 style={{ fontSize: '1.125rem', fontWeight: '600' }}>
                Return Asset: {returnAssetModal.asset?.asset_id}
              </h3>
              <button onClick={() => setReturnAssetModal(null)} className="btn-secondary" style={{ padding: '0.25rem 0.5rem' }}>✕</button>
            </div>
            <form onSubmit={handleReturnSubmit} style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '4px' }}>Return Date *</label>
                <input
                  type="date"
                  required
                  className="filter-input"
                  style={{ width: '100%' }}
                  value={returnForm.returned_date}
                  onChange={(e) => setReturnForm({ ...returnForm, returned_date: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '4px' }}>Condition at Return *</label>
                <CustomSelect
                  required
                  className="filter-select"
                  style={{ width: '100%' }}
                  value={returnForm.condition_at_return}
                  onChange={(e) => setReturnForm({ ...returnForm, condition_at_return: e.target.value })}
                >
                  <option value="New">New</option>
                  <option value="Good">Good</option>
                  <option value="Fair">Fair</option>
                  <option value="Damaged">Damaged</option>
                </CustomSelect>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '4px' }}>Notes</label>
                <input
                  type="text"
                  className="filter-input"
                  placeholder="Optional return notes"
                  style={{ width: '100%' }}
                  value={returnForm.notes}
                  onChange={(e) => setReturnForm({ ...returnForm, notes: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
                <button type="button" onClick={() => setReturnAssetModal(null)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Confirm Return</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
