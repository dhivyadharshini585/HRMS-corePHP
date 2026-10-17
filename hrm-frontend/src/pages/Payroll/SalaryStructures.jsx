import React, { useState, useEffect } from 'react';
import { getSalaryStructures, createSalaryStructure, deleteSalaryStructure } from '../../services/payrollService';
import { getEmployees } from '../../services/employeeService';
import { IconCheck, IconTrash, IconLayers, IconPlus, IconEye, IconX } from '../../components/common/Icons';
import CustomSelect from '../../components/common/CustomSelect';

// Helper for dynamic initials
const getInitials = (firstName, lastName) => {
  return `${firstName?.charAt(0) || ''}${lastName?.charAt(0) || ''}`.toUpperCase();
};

export default function SalaryStructures() {
  const [structures, setStructures] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState(new Set());

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [formData, setFormData] = useState({
    employee_id: '',
    effective_from: new Date().toISOString().split('T')[0],
    status: 'Active',
    components: [
      { id: Date.now(), name: 'Basic', type: 'Earning', calculation_type: 'fixed', amount: '' }
    ]
  });

  useEffect(() => {
    fetchStructures();
    fetchEmployees();
  }, []);

  const fetchStructures = async () => {
    try {
      const { data } = await getSalaryStructures();
      setStructures(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      const data = await getEmployees();
      // data might be array directly depending on backend response, usually { data: [...] }
      if (Array.isArray(data)) {
        setEmployees(data);
      } else if (data && Array.isArray(data.data)) {
        setEmployees(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch employees', err);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this salary structure?')) return;
    try {
      await deleteSalaryStructure(id);
      fetchStructures();
    } catch (err) {
      alert('Failed to delete');
    }
  };

  const handleAddStructure = () => {
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setFormError(null);
    setFormData({
      employee_id: '',
      effective_from: new Date().toISOString().split('T')[0],
      status: 'Active',
      components: [
        { id: Date.now(), name: 'Basic', type: 'Earning', calculation_type: 'fixed', amount: '' }
      ]
    });
  };

  const handleAddComponent = () => {
    setFormData(prev => ({
      ...prev,
      components: [
        ...prev.components,
        { id: Date.now(), name: '', type: 'Earning', calculation_type: 'fixed', amount: '' }
      ]
    }));
  };

  const handleRemoveComponent = (idToRemove) => {
    setFormData(prev => ({
      ...prev,
      components: prev.components.filter(c => c.id !== idToRemove)
    }));
  };

  const handleComponentChange = (id, field, value) => {
    setFormData(prev => ({
      ...prev,
      components: prev.components.map(c => 
        c.id === id ? { ...c, [field]: value } : c
      )
    }));
  };

  const calculateFormTotals = () => {
    const basicComponent = formData.components.find(c => c.name.toLowerCase() === 'basic' && c.calculation_type === 'fixed');
    const basicAmount = basicComponent ? parseFloat(basicComponent.amount) || 0 : 0;

    let earnings = 0;
    let deductions = 0;

    formData.components.forEach(c => {
      let val = 0;
      const rawAmount = parseFloat(c.amount) || 0;
      if (c.calculation_type === 'percentage') {
        val = (rawAmount / 100) * basicAmount;
      } else {
        val = rawAmount;
      }

      if (c.type === 'Earning') earnings += val;
      else if (c.type === 'Deduction') deductions += val;
    });

    return { earnings, deductions, net: earnings - deductions };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.employee_id) return setFormError('Employee is required.');
    if (!formData.effective_from) return setFormError('Effective From date is required.');
    if (formData.components.length === 0) return setFormError('At least one salary component is required.');

    for (let c of formData.components) {
      if (!c.name.trim()) return setFormError('Component name is required for all components.');
      if (c.amount === '' || isNaN(parseFloat(c.amount)) || parseFloat(c.amount) < 0) {
        return setFormError(`Valid amount is required for component: ${c.name || 'Unnamed'}`);
      }
    }

    setSaving(true);
    try {
      const payload = {
        employee_id: formData.employee_id,
        effective_from: formData.effective_from,
        status: formData.status,
        components: formData.components.map(({ id, ...rest }) => ({
          ...rest,
          amount: parseFloat(rest.amount),
          percentage_basis: rest.calculation_type === 'percentage' ? 'Basic' : null
        }))
      };

      await createSalaryStructure(payload);
      handleCloseModal();
      fetchStructures();
    } catch (err) {
      setFormError(err.response?.data?.message || err.response?.data?.error || 'Failed to create salary structure.');
    } finally {
      setSaving(false);
    }
  };

  const toggleRow = (id) => {
    const newSet = new Set(expandedRows);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedRows(newSet);
  };

  const formatDate = (isoString) => {
    if (!isoString) return 'N/A';
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  };

  const calculateTotals = (components) => {
    if (!components) return { earnings: 0, deductions: 0, net: 0, basicAmount: 0 };
    
    // Find fixed basic to use as basis for percentage
    const basicComponent = components.find(c => c.name.toLowerCase().includes('basic') && c.calculation_type !== 'percentage');
    const basicAmount = basicComponent ? parseFloat(basicComponent.amount) : 0;

    let totalEarning = 0;
    let totalDeduction = 0;

    components.forEach(c => {
      let val = 0;
      if (c.calculation_type === 'percentage') {
        const percentage = parseFloat(c.amount);
        val = (percentage / 100) * basicAmount;
      } else {
        val = parseFloat(c.amount);
      }
      
      if (c.type === 'Earning') totalEarning += val;
      else if (c.type === 'Deduction') totalDeduction += val;
    });

    return {
      earnings: totalEarning,
      deductions: totalDeduction,
      net: totalEarning - totalDeduction,
      basicAmount
    };
  };

  if (loading) {
    return (
      <div className="state-container">
        <h3>Loading Salary Structures...</h3>
        <p>Please wait while we fetch the records.</p>
      </div>
    );
  }

  const formTotals = calculateFormTotals();

  return (
    <div className="detail-card">
      <div className="detail-card-header" style={{ flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h2 style={{ fontSize: '1.125rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>
            Salary Structures
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Manage employee salary components and configurations.
          </p>
        </div>
        <button 
          onClick={handleAddStructure}
          className="btn-primary"
        >
          <IconPlus width="16" height="16" /> Add Structure
        </button>
      </div>

      <div className="table-container">
        {structures.length === 0 ? (
          <div className="state-container">
            <IconLayers width="48" height="48" style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }} />
            <h3>No salary structures found</h3>
            <p style={{ marginBottom: 'var(--space-4)' }}>Create a salary structure to configure employee compensation.</p>
            <button onClick={handleAddStructure} className="btn-primary">
              <IconPlus width="16" height="16" /> Add Structure
            </button>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Effective From</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th>Components</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {structures.map((s) => {
                const isExpanded = expandedRows.has(s.id);
                const totals = calculateTotals(s.components);

                return (
                  <React.Fragment key={s.id}>
                    <tr>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                          <div style={{
                            width: '36px', height: '36px', borderRadius: '50%',
                            backgroundColor: 'var(--primary-color)', color: 'white',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 'bold', fontSize: '0.8rem', flexShrink: 0
                          }}>
                            {getInitials(s.employee?.first_name, s.employee?.last_name)}
                          </div>
                          <div>
                            <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                              {s.employee?.first_name} {s.employee?.last_name}
                            </div>
                            {s.employee?.email && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                {s.employee?.email}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      
                      <td style={{ fontWeight: '500', color: 'var(--text-secondary)' }}>
                        {formatDate(s.effective_from)}
                      </td>
                      
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${s.status === 'Active' ? 'badge-success' : 'badge-neutral'}`}>
                          {s.status === 'Active' && <IconCheck width="14" height="14" style={{ marginRight: '4px' }} />}
                          {s.status}
                        </span>
                      </td>
                      
                      <td>
                        <span className="badge badge-info">
                          {s.components?.length || 0} Components
                        </span>
                      </td>
                      
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
                          <button 
                            onClick={() => toggleRow(s.id)} 
                            className="btn-secondary"
                            style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                          >
                            <IconEye width="14" height="14" /> {isExpanded ? 'Hide Components' : 'View Components'}
                          </button>
                          <button 
                            onClick={() => handleDelete(s.id)} 
                            className="btn-danger"
                            style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                          >
                            <IconTrash width="14" height="14" /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* EXPANDED COMPONENTS ROW */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={5} style={{ padding: '0', backgroundColor: 'var(--bg-surface-hover)' }}>
                          <div style={{ padding: 'var(--space-4) var(--space-6)', borderBottom: '1px solid var(--border-color)' }}>
                            <h4 style={{ marginBottom: 'var(--space-3)', fontWeight: '600', color: 'var(--text-primary)' }}>Salary Components</h4>
                            <div className="table-container" style={{ marginBottom: '0', boxShadow: 'none' }}>
                              <table className="data-table">
                                <thead>
                                  <tr>
                                    <th>Component</th>
                                    <th>Type</th>
                                    <th>Calculation</th>
                                    <th style={{ textAlign: 'right' }}>Amount</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {s.components?.length > 0 ? (
                                    s.components.map(c => {
                                      let displayAmount = '';
                                      if (c.calculation_type === 'percentage') {
                                        const calculated = (parseFloat(c.amount) / 100) * totals.basicAmount;
                                        displayAmount = `₹${calculated.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (est)`;
                                      } else {
                                        displayAmount = `₹${parseFloat(c.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
                                      }

                                      return (
                                        <tr key={c.id}>
                                          <td style={{ fontWeight: '500' }}>{c.name}</td>
                                          <td>
                                            <span className={`badge ${c.type === 'Earning' ? 'badge-success' : 'badge-danger'}`}>
                                              {c.type}
                                            </span>
                                          </td>
                                          <td style={{ color: 'var(--text-secondary)' }}>
                                            {c.calculation_type === 'percentage' 
                                              ? `${parseFloat(c.amount)}% of ${c.percentage_basis || 'Basic'}`
                                              : 'Fixed'}
                                          </td>
                                          <td style={{ textAlign: 'right', fontWeight: '500' }}>
                                            {displayAmount}
                                          </td>
                                        </tr>
                                      );
                                    })
                                  ) : (
                                    <tr>
                                      <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                                        No components configured.
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                            
                            {/* TOTALS PANEL */}
                            {s.components?.length > 0 && (
                              <div style={{ 
                                display: 'flex', 
                                justifyContent: 'flex-end', 
                                gap: 'var(--space-6)', 
                                marginTop: 'var(--space-4)', 
                                padding: 'var(--space-3)',
                                backgroundColor: 'white',
                                border: '1px solid var(--border-color)',
                                borderRadius: 'var(--radius-md)'
                              }}>
                                <div>
                                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Total Earnings: </span>
                                  <span style={{ fontWeight: '600', color: '#16a34a' }}>
                                    ₹{totals.earnings.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                                <div>
                                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Total Deductions: </span>
                                  <span style={{ fontWeight: '600', color: '#ef4444' }}>
                                    ₹{totals.deductions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                                <div>
                                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Estimated Net: </span>
                                  <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>
                                    ₹{totals.net.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Structure Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '800px' }}>
            <div className="modal-header">
              <h3>Add Salary Structure</h3>
              <button onClick={handleCloseModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <IconX width="20" height="20" />
              </button>
            </div>
            <div className="modal-body">
              {formError && (
                <div className="alert-banner error">
                  {formError}
                </div>
              )}
              <form onSubmit={handleSubmit} id="add-structure-form">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
                  <div className="filter-group">
                    <label className="filter-label">Employee *</label>
                    <CustomSelect 
                      className="filter-select"
                      value={formData.employee_id}
                      onChange={(e) => setFormData({...formData, employee_id: e.target.value})}
                      required
                    >
                      <option value="">Select Employee</option>
                      {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>
                      ))}
                    </CustomSelect>
                  </div>
                  <div className="filter-group">
                    <label className="filter-label">Effective From *</label>
                    <input 
                      type="date" 
                      className="filter-input"
                      value={formData.effective_from}
                      onChange={(e) => setFormData({...formData, effective_from: e.target.value})}
                      required
                    />
                  </div>
                  <div className="filter-group">
                    <label className="filter-label">Status</label>
                    <CustomSelect 
                      className="filter-select"
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value})}
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </CustomSelect>
                  </div>
                </div>

                <div style={{ marginBottom: 'var(--space-4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ fontWeight: '600', color: 'var(--text-primary)' }}>Salary Components</h4>
                  <button type="button" onClick={handleAddComponent} className="btn-secondary" style={{ padding: '0.25rem 0.75rem' }}>
                    <IconPlus width="14" height="14" /> Add Component
                  </button>
                </div>

                <div className="table-container" style={{ marginBottom: 'var(--space-4)' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Calculation</th>
                        <th>Amount/Percentage</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.components.map((c, idx) => (
                        <tr key={c.id}>
                          <td>
                            <input 
                              type="text" 
                              className="filter-input" 
                              placeholder="e.g. Basic"
                              value={c.name}
                              onChange={(e) => handleComponentChange(c.id, 'name', e.target.value)}
                              required
                            />
                          </td>
                          <td>
                            <CustomSelect 
                              className="filter-select"
                              value={c.type}
                              onChange={(e) => handleComponentChange(c.id, 'type', e.target.value)}
                            >
                              <option value="Earning">Earning</option>
                              <option value="Deduction">Deduction</option>
                            </CustomSelect>
                          </td>
                          <td>
                            <CustomSelect 
                              className="filter-select"
                              value={c.calculation_type}
                              onChange={(e) => handleComponentChange(c.id, 'calculation_type', e.target.value)}
                            >
                              <option value="fixed">Fixed</option>
                              <option value="percentage">Percentage (of Basic)</option>
                            </CustomSelect>
                          </td>
                          <td>
                            <input 
                              type="number" 
                              step="0.01"
                              className="filter-input" 
                              placeholder={c.calculation_type === 'percentage' ? '%' : '₹'}
                              value={c.amount}
                              onChange={(e) => handleComponentChange(c.id, 'amount', e.target.value)}
                              required
                            />
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button 
                              type="button" 
                              onClick={() => handleRemoveComponent(c.id)} 
                              className="btn-danger"
                              style={{ padding: '0.4rem' }}
                              disabled={formData.components.length === 1}
                              title={formData.components.length === 1 ? 'At least one component is required' : 'Remove Component'}
                            >
                              <IconTrash width="14" height="14" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'flex-end', 
                  gap: 'var(--space-6)', 
                  padding: 'var(--space-3)',
                  backgroundColor: 'var(--bg-surface-hover)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)'
                }}>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Total Earnings: </span>
                    <span style={{ fontWeight: '600', color: '#16a34a' }}>
                      ₹{formTotals.earnings.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Total Deductions: </span>
                    <span style={{ fontWeight: '600', color: '#ef4444' }}>
                      ₹{formTotals.deductions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Estimated Net: </span>
                    <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>
                      ₹{formTotals.net.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </form>
            </div>
            <div className="modal-footer">
              <button onClick={handleCloseModal} className="btn-secondary" disabled={saving}>
                Cancel
              </button>
              <button type="submit" form="add-structure-form" className="btn-primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save Structure'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
