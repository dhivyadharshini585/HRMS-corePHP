import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import '../../styles/common.css';
import CustomSelect from '../../components/common/CustomSelect';

export default function StatutoryRules() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState(null);

  const [formData, setFormData] = useState({
    rule_name: '',
    rule_type: 'Percentage',
    base_component: 'Basic Salary',
    percentage: '',
    fixed_amount: '',
    slabs: [],
    effective_from: '',
    is_active: true
  });

  const fetchRules = async () => {
    try {
      const response = await api.get('/payroll/statutory-rules');
      setRules(response.data);
    } catch (error) {
      console.error('Error fetching rules:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleAddSlab = () => {
    setFormData(prev => ({
      ...prev,
      slabs: [...prev.slabs, { min: '', max: '', amount: '' }]
    }));
  };

  const handleSlabChange = (index, field, value) => {
    const updatedSlabs = [...formData.slabs];
    updatedSlabs[index][field] = value === '' && field === 'max' ? null : value;
    setFormData(prev => ({
      ...prev,
      slabs: updatedSlabs
    }));
  };

  const handleRemoveSlab = (index) => {
    setFormData(prev => ({
      ...prev,
      slabs: prev.slabs.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingRule) {
        await api.put(`/payroll/statutory-rules/${editingRule.id}`, formData);
      } else {
        await api.post('/payroll/statutory-rules', formData);
      }
      setShowModal(false);
      fetchRules();
    } catch (error) {
      console.error('Error saving rule:', error);
      alert('Failed to save rule. Please check input values.');
    }
  };

  const openAddModal = () => {
    setEditingRule(null);
    setFormData({
      rule_name: '',
      rule_type: 'Percentage',
      base_component: 'Basic Salary',
      percentage: '',
      fixed_amount: '',
      slabs: [],
      effective_from: new Date().toISOString().split('T')[0],
      is_active: true
    });
    setShowModal(true);
  };

  const openEditModal = (rule) => {
    setEditingRule(rule);
    setFormData({
      rule_name: rule.rule_name,
      rule_type: rule.rule_type,
      base_component: rule.base_component || 'Basic Salary',
      percentage: rule.percentage || '',
      fixed_amount: rule.fixed_amount || '',
      slabs: rule.slabs || [],
      effective_from: rule.effective_from ? rule.effective_from.split('T')[0] : '',
      is_active: rule.is_active
    });
    setShowModal(true);
  };

  const toggleStatus = async (rule) => {
    try {
      if (rule.is_active) {
        await api.patch(`/payroll/statutory-rules/${rule.id}/deactivate`);
      } else {
        await api.patch(`/payroll/statutory-rules/${rule.id}/activate`);
      }
      fetchRules();
    } catch (error) {
      console.error('Error toggling status:', error);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2 className="page-title">Statutory Payroll Rules</h2>
          <p className="page-subtitle">Manage PF, ESI, PT, TDS, and statutory deduction rules</p>
        </div>
        <button className="btn-primary" onClick={openAddModal}>
          + Add Rule
        </button>
      </div>

      <div className="table-container">
        {loading ? (
          <div className="state-container">
            <p>Loading statutory rules...</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Rule Name</th>
                <th>Type</th>
                <th>Base Component</th>
                <th>Value</th>
                <th>Effective From</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{rule.rule_name}</div>
                  </td>
                  <td>{rule.rule_type}</td>
                  <td>{rule.base_component || 'N/A'}</td>
                  <td>
                    {rule.rule_type === 'Percentage' ? `${rule.percentage}%` :
                     rule.rule_type === 'Fixed' ? `₹${rule.fixed_amount}` : 'Slab Based'}
                  </td>
                  <td>
                    {rule.effective_from ? new Date(rule.effective_from).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                  </td>
                  <td>
                    <span className={`badge ${rule.is_active ? 'badge-success' : 'badge-neutral'}`}>
                      {rule.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => openEditModal(rule)}
                        className="btn-secondary"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => toggleStatus(rule)}
                        className={rule.is_active ? "btn-danger" : "btn-success"}
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                      >
                        {rule.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rules.length === 0 && (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>
                    No statutory rules configured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>{editingRule ? 'Edit Statutory Rule' : 'Add Statutory Rule'}</h3>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', lineHeight: 1, color: 'var(--text-secondary)' }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="filter-group">
                  <label className="filter-label">Rule Name * (e.g. PF, ESI, PT, TDS)</label>
                  <input
                    type="text"
                    name="rule_name"
                    required
                    value={formData.rule_name}
                    onChange={handleInputChange}
                    className="form-control"
                    placeholder="e.g. Provident Fund (PF)"
                  />
                </div>

                <div className="filter-group">
                  <label className="filter-label">Rule Type *</label>
                  <CustomSelect
                    name="rule_type"
                    value={formData.rule_type}
                    onChange={handleInputChange}
                    className="form-control"
                  >
                    <option value="Percentage">Percentage</option>
                    <option value="Fixed">Fixed Amount</option>
                    <option value="Slab">Slab Based</option>
                  </CustomSelect>
                </div>

                {formData.rule_type === 'Percentage' && (
                  <>
                    <div className="filter-group">
                      <label className="filter-label">Base Component *</label>
                      <CustomSelect
                        name="base_component"
                        value={formData.base_component}
                        onChange={handleInputChange}
                        className="form-control"
                      >
                        <option value="Basic Salary">Basic Salary</option>
                        <option value="Gross Earnings">Gross Earnings</option>
                      </CustomSelect>
                    </div>
                    <div className="filter-group">
                      <label className="filter-label">Percentage (%) *</label>
                      <input
                        type="number"
                        name="percentage"
                        step="0.01"
                        required
                        value={formData.percentage}
                        onChange={handleInputChange}
                        className="form-control"
                        placeholder="e.g. 12"
                      />
                    </div>
                  </>
                )}

                {formData.rule_type === 'Fixed' && (
                  <div className="filter-group">
                    <label className="filter-label">Fixed Amount (₹) *</label>
                    <input
                      type="number"
                      name="fixed_amount"
                      step="0.01"
                      required
                      value={formData.fixed_amount}
                      onChange={handleInputChange}
                      className="form-control"
                      placeholder="e.g. 200"
                    />
                  </div>
                )}

                {formData.rule_type === 'Slab' && (
                  <div className="filter-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <label className="filter-label">Slab Configuration</label>
                      <button
                        type="button"
                        onClick={handleAddSlab}
                        className="btn-secondary"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                      >
                        + Add Slab
                      </button>
                    </div>

                    {formData.slabs.map((slab, index) => (
                      <div key={index} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <input
                          type="number"
                          placeholder="Min (₹)"
                          step="0.01"
                          required
                          value={slab.min !== null ? slab.min : ''}
                          onChange={(e) => handleSlabChange(index, 'min', e.target.value)}
                          className="form-control"
                          style={{ flex: 1 }}
                        />
                        <span>-</span>
                        <input
                          type="number"
                          placeholder="Max (empty = ∞)"
                          step="0.01"
                          value={slab.max !== null ? slab.max : ''}
                          onChange={(e) => handleSlabChange(index, 'max', e.target.value)}
                          className="form-control"
                          style={{ flex: 1 }}
                        />
                        <span>=</span>
                        <input
                          type="number"
                          placeholder="Amount (₹)"
                          step="0.01"
                          required
                          value={slab.amount !== null ? slab.amount : ''}
                          onChange={(e) => handleSlabChange(index, 'amount', e.target.value)}
                          className="form-control"
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveSlab(index)}
                          className="btn-danger"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        >
                          &times;
                        </button>
                      </div>
                    ))}

                    {formData.slabs.length === 0 && (
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                        No slabs added yet. Click "+ Add Slab" to begin.
                      </p>
                    )}
                  </div>
                )}

                <div className="filter-group">
                  <label className="filter-label">Effective From *</label>
                  <input
                    type="date"
                    name="effective_from"
                    required
                    value={formData.effective_from}
                    onChange={handleInputChange}
                    className="form-control"
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <input
                    type="checkbox"
                    name="is_active"
                    id="is_active"
                    checked={formData.is_active}
                    onChange={handleInputChange}
                  />
                  <label htmlFor="is_active" style={{ fontSize: '0.875rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
                    Active immediately
                  </label>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editingRule ? 'Update Rule' : 'Save Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
