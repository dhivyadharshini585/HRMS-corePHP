import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getDepartment, createDepartment, updateDepartment } from '../../services/departmentService';
import { ROUTES } from '../../constants/routes';

export default function DepartmentForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEdit);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');

  useEffect(() => {
    if (isEdit) {
      const controller = new AbortController();
      
      const fetchDepartment = async () => {
        try {
          const data = await getDepartment(id, { signal: controller.signal });
          setFormData({
            name: data.name || '',
            description: data.description || '',
          });
        } catch (err) {
          if (err.name !== 'CanceledError') {
            console.error(err);
            setApiError('Failed to load department details.');
          }
        } finally {
          setInitialLoading(false);
        }
      };
      
      fetchDepartment();
      return () => { controller.abort(); };
    }
  }, [id, isEdit]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});
    setApiError('');

    try {
      if (isEdit) {
        await updateDepartment(id, formData);
      } else {
        await createDepartment(formData);
      }
      navigate(ROUTES.DEPARTMENTS);
    } catch (err) {
      if (err.response && err.response.data && err.response.data.errors) {
        setErrors(err.response.data.errors);
      } else {
        setApiError('Failed to save department. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading department data...</div>;
  }

  return (
    <div className="employees-page">
      <div className="page-header">
        <h1 className="page-title">{isEdit ? 'Edit Department' : 'Add Department'}</h1>
        <button 
          className="btn-secondary"
          onClick={() => navigate(ROUTES.DEPARTMENTS)}
        >
          Cancel
        </button>
      </div>

      {apiError && <div style={{ color: 'red', marginBottom: '1rem' }}>{apiError}</div>}

      <div className="form-card" style={{ maxWidth: '600px', margin: '0 auto', background: 'var(--bg-card)', padding: '2rem', borderRadius: '0.5rem', boxShadow: 'var(--shadow-sm)' }}>
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Department Name *</label>
            <input 
              type="text"
              name="name"
              className="form-control"
              value={formData.name}
              onChange={handleChange}
              required
              style={{ width: '100%', padding: '0.75rem', borderRadius: '0.25rem', border: '1px solid var(--border-color)' }}
            />
            {errors.name && <span style={{ color: 'red', fontSize: '0.875rem' }}>{errors.name[0]}</span>}
          </div>

          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Description</label>
            <textarea 
              name="description"
              className="form-control"
              value={formData.description}
              onChange={handleChange}
              rows="4"
              style={{ width: '100%', padding: '0.75rem', borderRadius: '0.25rem', border: '1px solid var(--border-color)', resize: 'vertical' }}
            ></textarea>
            {errors.description && <span style={{ color: 'red', fontSize: '0.875rem' }}>{errors.description[0]}</span>}
          </div>

          <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Saving...' : 'Save Department'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
