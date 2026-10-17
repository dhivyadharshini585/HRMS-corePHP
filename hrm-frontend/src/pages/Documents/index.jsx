import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getDocuments, downloadDocument, deleteDocument } from '../../services/documentService';
import { getEmployees } from '../../services/employeeService';
import { useAuthContext } from '../../context/AuthContext';
import { CATEGORY_OPTIONS } from '../../constants/documentCategories';
import DocumentUploadModal from './DocumentUploadModal';
import CustomSelect from '../../components/common/CustomSelect';

export default function Documents() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialEmployeeId = searchParams.get('employee_id') || '';

  const { hasPermission, hasRole } = useAuthContext();
  const isHRorAdmin = hasRole(['Super Admin', 'HR Admin', 'HR Executive', 'Manager']);

  const [documents, setDocuments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(initialEmployeeId);

  // Modal & Actions state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  const fetchDocuments = async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (selectedCategory) params.category = selectedCategory;
      if (selectedEmployeeId) params.employee_id = selectedEmployeeId;

      const data = await getDocuments(params);
      setDocuments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to load documents.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [selectedCategory, selectedEmployeeId]);

  useEffect(() => {
    if (isHRorAdmin) {
      getEmployees()
        .then(data => setEmployees(Array.isArray(data) ? data : data.data || []))
        .catch(err => console.error('Failed to load employees for filter:', err));
    }
  }, [isHRorAdmin]);

  const handleDownload = async (doc) => {
    setDownloadingId(doc.id);
    try {
      await downloadDocument(doc.id, doc.document_name);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Failed to download document.');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (doc) => {
    if (!window.confirm(`Are you sure you want to delete "${doc.document_name}"?`)) {
      return;
    }
    setDeletingId(doc.id);
    try {
      await deleteDocument(doc.id);
      setSuccessMessage(`Document "${doc.document_name}" deleted successfully.`);
      fetchDocuments();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Failed to delete document.');
    } finally {
      setDeletingId(null);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="documents-page" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header Bar */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Employee Documents</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Securely store, view, and manage sensitive employee documents
          </p>
        </div>
        {hasPermission('documents.create') && (
          <button className="btn-primary" onClick={() => setIsUploadModalOpen(true)}>
            + Upload Document
          </button>
        )}
      </div>

      {successMessage && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: '#dcfce7', color: '#15803d', borderRadius: 'var(--radius-md)', fontSize: '0.875rem' }}>
          {successMessage}
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="detail-card" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', flexGrow: 1 }}>
          <button
            className={`btn-secondary ${selectedCategory === '' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('')}
            style={{ fontWeight: selectedCategory === '' ? 600 : 400 }}
          >
            All Categories
          </button>
          {CATEGORY_OPTIONS.map(cat => (
            <button
              key={cat}
              className={`btn-secondary ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
              style={{ fontWeight: selectedCategory === cat ? 600 : 400 }}
            >
              {cat}
            </button>
          ))}
        </div>

        {isHRorAdmin && (
          <div style={{ minWidth: '220px' }}>
            <CustomSelect
              className="form-control"
              value={selectedEmployeeId}
              onChange={(e) => {
                setSelectedEmployeeId(e.target.value);
                if (e.target.value) {
                  setSearchParams({ employee_id: e.target.value });
                } else {
                  setSearchParams({});
                }
              }}
              style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}
            >
              <option value="">All Authorized Employees</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.employee_code} — {emp.first_name} {emp.last_name}
                </option>
              ))}
            </CustomSelect>
          </div>
        )}
      </div>

      {/* Documents Table Container */}
      <div className="detail-card">
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading documents...
          </div>
        ) : error ? (
          <div style={{ padding: '1.5rem', color: '#ef4444', backgroundColor: '#fee2e2', borderRadius: 'var(--radius-md)' }}>
            {error}
          </div>
        ) : documents.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <p style={{ fontSize: '1rem', fontWeight: 500 }}>No documents found.</p>
            <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>Upload employee documents to manage identity, education, and employment records.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Document Name</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Category / Type</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Employee</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Upload Date</th>
                  <th style={{ padding: '0.75rem 1rem' }}>File Size</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>📄</span>
                        <span>{doc.document_name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span className="badge" style={{ backgroundColor: 'var(--bg-surface-hover)', color: 'var(--text-primary)', marginRight: '0.5rem' }}>
                        {doc.document_category}
                      </span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {doc.document_type}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>
                      {doc.employee ? `${doc.employee.first_name} ${doc.employee.last_name} (${doc.employee.employee_code})` : '-'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {new Date(doc.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {formatFileSize(doc.file_size)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                        <button
                          className="btn-secondary"
                          onClick={() => handleDownload(doc)}
                          disabled={downloadingId === doc.id}
                          style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                        >
                          {downloadingId === doc.id ? 'Downloading...' : 'Download'}
                        </button>
                        {hasPermission('documents.delete') && (
                          <button
                            className="btn-secondary"
                            onClick={() => handleDelete(doc)}
                            disabled={deletingId === doc.id}
                            style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem', color: '#ef4444', borderColor: '#fca5a5' }}
                          >
                            {deletingId === doc.id ? 'Deleting...' : 'Delete'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DocumentUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onSuccess={() => {
          setSuccessMessage('Document uploaded successfully.');
          fetchDocuments();
        }}
        defaultEmployeeId={selectedEmployeeId}
      />
    </div>
  );
}
