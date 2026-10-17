import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDesignations, deleteDesignation } from '../../services/designationService';
import { useAuthContext } from '../../context/AuthContext';
import { ROUTES } from '../../constants/routes';
import '../../styles/employees.css';

export default function Designations() {
  const navigate = useNavigate();
  const { hasPermission } = useAuthContext();
  
  const [designations, setDesignations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const fetchDesignations = async (options = {}) => {
    setLoading(true);
    setError('');
    try {
      const data = await getDesignations({ search }, options);
      setDesignations(data);
    } catch (err) {
      if (err.name !== 'CanceledError') {
        console.error(err);
        setError('Failed to load designations');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    
    const timer = setTimeout(() => {
      fetchDesignations({ signal: controller.signal });
    }, 300);
    
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this designation?')) {
      try {
        await deleteDesignation(id);
        fetchDesignations();
      } catch (err) {
        if (err.response && err.response.status === 422) {
          alert(err.response.data.message);
        } else {
          alert('Failed to delete designation');
        }
      }
    }
  };

  return (
    <div className="employees-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Designations</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Manage employee designations and job titles</p>
        </div>
        {hasPermission('designations.create') && (
          <button 
            className="btn-primary"
            onClick={() => navigate(ROUTES.DESIGNATION_ADD)}
          >
            Add Designation
          </button>
        )}
      </div>

      <div className="filters-bar" style={{ justifyContent: 'flex-start' }}>
        <input 
          type="text" 
          placeholder="Search by title..." 
          className="filter-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: '300px' }}
        />
      </div>

      {error && <div style={{ color: 'red', marginBottom: '1rem' }}>{error}</div>}

      <div className="table-container">
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>Loading designations...</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Designation Title</th>
                <th>Description</th>
                <th>Employees</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {designations.length === 0 ? (
                <tr><td colSpan="4" style={{ textAlign: 'center' }}>No designations found.</td></tr>
              ) : (
                designations.map(desig => (
                  <tr key={desig.id}>
                    <td>{desig.title}</td>
                    <td>{desig.description || '-'}</td>
                    <td>{desig.employees_count || 0}</td>
                    <td>
                      <div className="actions-cell">
                        {hasPermission('designations.update') && (
                          <button 
                            className="btn-secondary"
                            onClick={() => navigate(ROUTES.DESIGNATION_EDIT.replace(':id', desig.id))}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          >
                            Edit
                          </button>
                        )}
                        {hasPermission('designations.delete') && (
                          <button 
                            className="btn-danger"
                            onClick={() => handleDelete(desig.id)}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          >
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
    </div>
  );
}
