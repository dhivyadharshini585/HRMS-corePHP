import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDepartments, deleteDepartment } from '../../services/departmentService';
import { useAuthContext } from '../../context/AuthContext';
import { ROUTES } from '../../constants/routes';
import '../../styles/employees.css';

export default function Departments() {
  const navigate = useNavigate();
  const { hasPermission } = useAuthContext();
  
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const fetchDepartments = async (options = {}) => {
    setLoading(true);
    setError('');
    try {
      const data = await getDepartments({ search }, options);
      setDepartments(data);
    } catch (err) {
      if (err.name !== 'CanceledError') {
        console.error(err);
        setError('Failed to load departments');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    
    const timer = setTimeout(() => {
      fetchDepartments({ signal: controller.signal });
    }, 300);
    
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this department?')) {
      try {
        await deleteDepartment(id);
        fetchDepartments();
      } catch (err) {
        if (err.response && err.response.status === 422) {
          alert(err.response.data.message);
        } else {
          alert('Failed to delete department');
        }
      }
    }
  };

  return (
    <div className="employees-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Departments</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Manage company departments</p>
        </div>
        {hasPermission('departments.create') && (
          <button 
            className="btn-primary"
            onClick={() => navigate(ROUTES.DEPARTMENT_ADD)}
          >
            Add Department
          </button>
        )}
      </div>

      <div className="filters-bar" style={{ justifyContent: 'flex-start' }}>
        <input 
          type="text" 
          placeholder="Search by name..." 
          className="filter-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: '300px' }}
        />
      </div>

      {error && <div style={{ color: 'red', marginBottom: '1rem' }}>{error}</div>}

      <div className="table-container">
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>Loading departments...</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Department Name</th>
                <th>Description</th>
                <th>Employees</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {departments.length === 0 ? (
                <tr><td colSpan="4" style={{ textAlign: 'center' }}>No departments found.</td></tr>
              ) : (
                departments.map(dept => (
                  <tr key={dept.id}>
                    <td>{dept.name}</td>
                    <td>{dept.description || '-'}</td>
                    <td>{dept.employees_count || 0}</td>
                    <td>
                      <div className="actions-cell">
                        {hasPermission('departments.update') && (
                          <button 
                            className="btn-secondary"
                            onClick={() => navigate(ROUTES.DEPARTMENT_EDIT.replace(':id', dept.id))}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          >
                            Edit
                          </button>
                        )}
                        {hasPermission('departments.delete') && (
                          <button 
                            className="btn-danger"
                            onClick={() => handleDelete(dept.id)}
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
