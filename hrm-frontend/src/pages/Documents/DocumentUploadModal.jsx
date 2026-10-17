import { useState, useEffect } from 'react';
import { CATEGORY_OPTIONS, getTypesForCategory } from '../../constants/documentCategories';
import { uploadDocument } from '../../services/documentService';
import { getEmployees } from '../../services/employeeService';
import { useAuthContext } from '../../context/AuthContext';
import CustomSelect from '../../components/common/CustomSelect';

export default function DocumentUploadModal({ isOpen, onClose, onSuccess, defaultEmployeeId }) {
  const { user, hasRole } = useAuthContext();
  
  const isHRorAdmin = hasRole(['Super Admin', 'HR Admin', 'HR Executive']);

  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(defaultEmployeeId || '');
  const [category, setCategory] = useState('Identity');
  const [type, setType] = useState('Aadhaar');
  const [documentName, setDocumentName] = useState('');
  const [file, setFile] = useState(null);

  const [availableTypes, setAvailableTypes] = useState(getTypesForCategory('Identity'));
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isHRorAdmin && isOpen) {
      getEmployees()
        .then(data => {
          setEmployees(Array.isArray(data) ? data : data.data || []);
        })
        .catch(err => console.error('Failed to load employees:', err));
    }
  }, [isHRorAdmin, isOpen]);

  useEffect(() => {
    const types = getTypesForCategory(category);
    setAvailableTypes(types);
    if (types.length > 0) {
      setType(types[0]);
    } else {
      setType('');
    }
  }, [category]);

  useEffect(() => {
    if (defaultEmployeeId) {
      setSelectedEmployeeId(defaultEmployeeId);
    }
  }, [defaultEmployeeId]);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      if (selectedFile.size > 10 * 1024 * 1024) { // 10MB
        setError('File size must be 10MB or smaller.');
        setFile(null);
        return;
      }
      setError('');
      setFile(selectedFile);
      if (!documentName) {
        // Strip extension
        const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, "");
        setDocumentName(nameWithoutExt);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a file to upload.');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      if (isHRorAdmin && selectedEmployeeId) {
        formData.append('employee_id', selectedEmployeeId);
      }
      formData.append('document_category', category);
      formData.append('document_type', type);
      formData.append('document_name', documentName || file.name);
      formData.append('file', file);

      await uploadDocument(formData);
      setUploading(false);
      onSuccess();
      onClose();
    } catch (err) {
      setUploading(false);
      console.error(err);
      if (err.response?.data?.errors) {
        const firstErrKey = Object.keys(err.response.data.errors)[0];
        setError(err.response.data.errors[firstErrKey][0]);
      } else {
        setError(err.response?.data?.message || 'Failed to upload document.');
      }
    }
  };

  return (
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
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Upload Employee Document</h2>
          <button className="btn-secondary" style={{ padding: '0.25rem 0.5rem' }} onClick={onClose}>✕</button>
        </div>

        {error && (
          <div style={{ padding: '0.75rem', color: '#ef4444', backgroundColor: '#fee2e2', borderRadius: 'var(--radius-md)', marginBottom: '1rem', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {isHRorAdmin && (
            <div className="form-group">
              <label className="form-label" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                Employee <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <CustomSelect
                className="form-control"
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                required
                style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}
              >
                <option value="">Select Employee...</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.employee_code} — {emp.first_name} {emp.last_name}
                  </option>
                ))}
              </CustomSelect>
            </div>
          )}

          <div className="form-group">
            <label className="form-label" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              Document Category <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <CustomSelect
              className="form-control"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
              style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}
            >
              {CATEGORY_OPTIONS.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </CustomSelect>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              Document Type <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <CustomSelect
              className="form-control"
              value={type}
              onChange={(e) => setType(e.target.value)}
              required
              style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}
            >
              {availableTypes.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </CustomSelect>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              Document Display Name
            </label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Employee Passport 2026"
              value={documentName}
              onChange={(e) => setDocumentName(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}
            />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              Select File (PDF, DOC, DOCX, JPG, PNG, WEBP — Max 10MB) <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
              onChange={handleFileChange}
              required
              style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={uploading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={uploading}>
              {uploading ? 'Uploading...' : 'Upload Document'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
