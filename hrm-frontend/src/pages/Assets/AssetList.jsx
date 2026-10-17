import React, { useEffect, useState } from 'react';
import { assetService } from '../../services/assetService';
import { getEmployees } from '../../services/employeeService';
import { useAuthContext } from '../../context/AuthContext';
import { IconPlus, IconSearch } from '../../components/common/Icons';
import CustomSelect from '../../components/common/CustomSelect';

export default function AssetList({ refreshKey, onRefresh }) {
  const { hasPermission, hasRole } = useAuthContext();
  const canManage = hasPermission
    ? (hasPermission('assets.manage') || hasRole('Super Admin') || hasRole('HR Admin') || hasRole('HR Executive'))
    : false;

  const [assets, setAssets] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [assigningAsset, setAssigningAsset] = useState(null);

  // Form states
  const [assetForm, setAssetForm] = useState({
    asset_id: '',
    type: 'Laptop',
    name: '',
    serial_number: '',
    purchase_date: '',
    condition: 'Good',
    status: 'Unassigned',
  });

  const [assignForm, setAssignForm] = useState({
    employee_id: '',
    assigned_date: new Date().toISOString().split('T')[0],
    condition_at_assignment: 'Good',
    notes: '',
  });

  useEffect(() => {
    loadAssets();
  }, [refreshKey, searchTerm, typeFilter, statusFilter]);

  useEffect(() => {
    if (canManage) {
      loadEmployeeOptions();
    }
  }, [canManage]);

  const loadEmployeeOptions = async () => {
    try {
      const res = await getEmployees({ per_page: 100 });
      const list = res.data || (Array.isArray(res) ? res : []);
      setEmployees(list);
    } catch (err) {
      console.error('Failed to load employee list', err);
    }
  };

  const loadAssets = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await assetService.getAssets();
      let list = Array.isArray(data) ? data : (data.data || []);

      if (searchTerm) {
        list = list.filter(a =>
          a.asset_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          a.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          a.serial_number?.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }
      if (typeFilter) {
        list = list.filter(a => a.type === typeFilter);
      }
      if (statusFilter) {
        list = list.filter(a => a.status === statusFilter);
      }
      setAssets(list);
    } catch (err) {
      console.error('Failed to load assets', err);
      setError('Failed to load assets.');
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setError(null);
    setSuccessMsg('');
    setEditingAsset(null);
    setAssetForm({
      asset_id: `AST-${Math.floor(1000 + Math.random() * 9000)}`,
      type: 'Laptop',
      name: '',
      serial_number: '',
      purchase_date: '',
      condition: 'Good',
      status: 'Unassigned',
    });
    setShowCreateModal(true);
  };

  const openEditModal = (asset) => {
    setError(null);
    setSuccessMsg('');
    setEditingAsset(asset);
    setAssetForm({
      asset_id: asset.asset_id || '',
      type: asset.type || 'Laptop',
      name: asset.name || '',
      serial_number: asset.serial_number || '',
      purchase_date: asset.purchase_date || '',
      condition: asset.condition || 'Good',
      status: asset.status || 'Unassigned',
    });
    setShowCreateModal(true);
  };

  const openAssignModal = (asset) => {
    setError(null);
    setSuccessMsg('');
    setAssigningAsset(asset);
    setAssignForm({
      employee_id: employees.length > 0 ? employees[0].id : '',
      assigned_date: new Date().toISOString().split('T')[0],
      condition_at_assignment: asset.condition || 'Good',
      notes: '',
    });
  };

  const handleAssetSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      if (editingAsset) {
        const payload = {
          type: assetForm.type,
          name: assetForm.name,
          serial_number: assetForm.serial_number || null,
          purchase_date: assetForm.purchase_date || null,
          condition: assetForm.condition,
          status: assetForm.status,
        };
        await assetService.updateAsset(editingAsset.id, payload);
        setSuccessMsg('Asset updated successfully.');
      } else {
        const payload = {
          asset_id: assetForm.asset_id,
          type: assetForm.type,
          name: assetForm.name,
          serial_number: assetForm.serial_number || null,
          purchase_date: assetForm.purchase_date || null,
          condition: assetForm.condition,
        };
        await assetService.createAsset(payload);
        setSuccessMsg('Asset created successfully.');
      }
      setShowCreateModal(false);
      loadAssets();
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to save asset.');
    }
  };

  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    if (!assigningAsset) return;
    setError(null);
    try {
      await assetService.assignAsset(assigningAsset.id, assignForm);
      setSuccessMsg(`Asset ${assigningAsset.asset_id} assigned successfully.`);
      setAssigningAsset(null);
      loadAssets();
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to assign asset.');
    }
  };

  const handleDeleteAsset = async (id) => {
    if (!window.confirm('Delete this asset?')) return;
    try {
      await assetService.deleteAsset(id);
      setSuccessMsg('Asset deleted.');
      loadAssets();
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Failed to delete asset.');
    }
  };

  return (
    <div className="detail-card">
      <div className="detail-card-header" style={{ flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h2 style={{ fontSize: '1.125rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>
            Company Assets
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Inventory tracking for hardware, monitors, and devices.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {canManage && (
            <button onClick={openCreateModal} className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <IconPlus width="16" height="16" />
              <span>Add Asset</span>
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div style={{ margin: 'var(--space-3) var(--space-6)', padding: 'var(--space-3)', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 'var(--radius-md)', color: '#991b1b', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}
      {successMsg && (
        <div style={{ margin: 'var(--space-3) var(--space-6)', padding: 'var(--space-3)', backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: 'var(--radius-md)', color: '#166534', fontSize: '0.875rem' }}>
          {successMsg}
        </div>
      )}

      {/* Filters */}
      <div style={{ padding: 'var(--space-4) var(--space-6)', display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', borderBottom: '1px solid var(--border-color)' }}>
        <div className="search-bar" style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <IconSearch width="16" height="16" style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search asset ID or name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="filter-input"
            style={{ paddingLeft: '32px', width: '100%' }}
          />
        </div>
        <CustomSelect className="filter-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ width: '160px' }}>
          <option value="">All Types</option>
          <option value="Laptop">Laptop</option>
          <option value="Desktop">Desktop</option>
          <option value="Monitor">Monitor</option>
          <option value="Keyboard">Keyboard</option>
          <option value="Mouse">Mouse</option>
          <option value="Mobile">Mobile</option>
          <option value="ID Card">ID Card</option>
          <option value="Software License">Software License</option>
        </CustomSelect>
        <CustomSelect className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: '160px' }}>
          <option value="">All Statuses</option>
          <option value="Unassigned">Unassigned</option>
          <option value="Assigned">Assigned</option>
          <option value="In Maintenance">In Maintenance</option>
          <option value="Retired">Retired</option>
        </CustomSelect>
      </div>

      <div className="table-container">
        {loading ? (
          <div className="state-container"><p>Loading assets...</p></div>
        ) : assets.length === 0 ? (
          <div className="state-container"><p>No assets found.</p></div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Asset ID</th>
                <th>Name / Model</th>
                <th>Type</th>
                <th>Condition</th>
                <th>Status</th>
                {canManage && <th style={{ textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {assets.map(asset => (
                <tr key={asset.id}>
                  <td style={{ fontWeight: '600', color: 'var(--primary-color)' }}>{asset.asset_id}</td>
                  <td>{asset.name}</td>
                  <td>{asset.type || asset.category}</td>
                  <td>{asset.condition}</td>
                  <td>
                    <span className={`badge badge-${asset.status === 'Assigned' ? 'info' : asset.status === 'Unassigned' || asset.status === 'Available' ? 'success' : 'warning'}`}>
                      {asset.status}
                    </span>
                  </td>
                  {canManage && (
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        {asset.status !== 'Assigned' && (
                          <button
                            onClick={() => openAssignModal(asset)}
                            className="btn-primary"
                            style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                          >
                            Assign
                          </button>
                        )}
                        <button
                          onClick={() => openEditModal(asset)}
                          className="btn-secondary"
                          style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteAsset(asset.id)}
                          className="btn-secondary"
                          style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', color: '#dc2626' }}
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
        )}
      </div>

      {/* Create / Edit Asset Modal */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 'var(--space-4)' }}>
          <div className="detail-card" style={{ width: '100%', maxWidth: '520px', backgroundColor: 'var(--bg-surface)' }}>
            <div className="detail-card-header">
              <h3 style={{ fontSize: '1.125rem', fontWeight: '600' }}>
                {editingAsset ? 'Edit Asset' : 'Add New Asset'}
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="btn-secondary" style={{ padding: '0.25rem 0.5rem' }}>✕</button>
            </div>
            <form onSubmit={handleAssetSubmit} style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {!editingAsset && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '4px' }}>Asset ID *</label>
                  <input
                    type="text"
                    required
                    className="filter-input"
                    style={{ width: '100%' }}
                    value={assetForm.asset_id}
                    onChange={(e) => setAssetForm({ ...assetForm, asset_id: e.target.value })}
                  />
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '4px' }}>Type *</label>
                  <CustomSelect
                    className="filter-select"
                    style={{ width: '100%' }}
                    value={assetForm.type}
                    onChange={(e) => setAssetForm({ ...assetForm, type: e.target.value })}
                  >
                    <option value="Laptop">Laptop</option>
                    <option value="Desktop">Desktop</option>
                    <option value="Monitor">Monitor</option>
                    <option value="Keyboard">Keyboard</option>
                    <option value="Mouse">Mouse</option>
                    <option value="Mobile">Mobile</option>
                    <option value="ID Card">ID Card</option>
                    <option value="Software License">Software License</option>
                  </CustomSelect>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '4px' }}>Condition</label>
                  <CustomSelect
                    className="filter-select"
                    style={{ width: '100%' }}
                    value={assetForm.condition}
                    onChange={(e) => setAssetForm({ ...assetForm, condition: e.target.value })}
                  >
                    <option value="New">New</option>
                    <option value="Good">Good</option>
                    <option value="Fair">Fair</option>
                    <option value="Damaged">Damaged</option>
                  </CustomSelect>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '4px' }}>Asset Name / Model *</label>
                <input
                  type="text"
                  required
                  className="filter-input"
                  style={{ width: '100%' }}
                  value={assetForm.name}
                  onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '4px' }}>Serial Number</label>
                  <input
                    type="text"
                    className="filter-input"
                    style={{ width: '100%' }}
                    value={assetForm.serial_number}
                    onChange={(e) => setAssetForm({ ...assetForm, serial_number: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '4px' }}>Purchase Date</label>
                  <input
                    type="date"
                    className="filter-input"
                    style={{ width: '100%' }}
                    value={assetForm.purchase_date}
                    onChange={(e) => setAssetForm({ ...assetForm, purchase_date: e.target.value })}
                  />
                </div>
              </div>

              {editingAsset && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '4px' }}>Status</label>
                  <CustomSelect
                    className="filter-select"
                    style={{ width: '100%' }}
                    value={assetForm.status}
                    onChange={(e) => setAssetForm({ ...assetForm, status: e.target.value })}
                  >
                    <option value="Unassigned">Unassigned</option>
                    <option value="Assigned">Assigned</option>
                    <option value="In Maintenance">In Maintenance</option>
                    <option value="Retired">Retired</option>
                  </CustomSelect>
                </div>
              )}

              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">{editingAsset ? 'Save Asset' : 'Create Asset'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Asset Modal */}
      {assigningAsset && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 'var(--space-4)' }}>
          <div className="detail-card" style={{ width: '100%', maxWidth: '500px', backgroundColor: 'var(--bg-surface)' }}>
            <div className="detail-card-header">
              <h3 style={{ fontSize: '1.125rem', fontWeight: '600' }}>
                Assign Asset: {assigningAsset.asset_id}
              </h3>
              <button onClick={() => setAssigningAsset(null)} className="btn-secondary" style={{ padding: '0.25rem 0.5rem' }}>✕</button>
            </div>
            <form onSubmit={handleAssignSubmit} style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '4px' }}>Employee *</label>
                <CustomSelect
                  required
                  className="filter-select"
                  style={{ width: '100%' }}
                  value={assignForm.employee_id}
                  onChange={(e) => setAssignForm({ ...assignForm, employee_id: e.target.value })}
                >
                  <option value="">Select Employee...</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name} ({emp.employee_id || emp.id})
                    </option>
                  ))}
                </CustomSelect>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '4px' }}>Assigned Date *</label>
                  <input
                    type="date"
                    required
                    className="filter-input"
                    style={{ width: '100%' }}
                    value={assignForm.assigned_date}
                    onChange={(e) => setAssignForm({ ...assignForm, assigned_date: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '4px' }}>Condition</label>
                  <CustomSelect
                    className="filter-select"
                    style={{ width: '100%' }}
                    value={assignForm.condition_at_assignment}
                    onChange={(e) => setAssignForm({ ...assignForm, condition_at_assignment: e.target.value })}
                  >
                    <option value="New">New</option>
                    <option value="Good">Good</option>
                    <option value="Fair">Fair</option>
                    <option value="Damaged">Damaged</option>
                  </CustomSelect>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '4px' }}>Notes</label>
                <input
                  type="text"
                  className="filter-input"
                  placeholder="Optional notes or remarks"
                  style={{ width: '100%' }}
                  value={assignForm.notes}
                  onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
                <button type="button" onClick={() => setAssigningAsset(null)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Confirm Assignment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
