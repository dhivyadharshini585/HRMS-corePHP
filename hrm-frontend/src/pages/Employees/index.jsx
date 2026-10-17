import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getEmployees, getDepartments, getDesignations, deleteEmployee } from '../../services/employeeService';
import { useAuthContext } from '../../context/AuthContext';
import { ROUTES } from '../../constants/routes';
import '../../styles/employees.css';
import CustomSelect from '../../components/common/CustomSelect';

export default function Employees() {
  const navigate = useNavigate();
  const { hasPermission } = useAuthContext();
  
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [designationId, setDesignationId] = useState('');
  const [status, setStatus] = useState('');

  const fetchEmployees = async (options = {}) => {
    setLoading(true);
    try {
      const data = await getEmployees({
        search,
        department_id: departmentId,
        designation_id: designationId,
        employment_status: status
      }, options);
      setEmployees(data.data);
    } catch (err) {
      if (err.name !== 'CanceledError') {
        console.error(err);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    
    const fetchDropdowns = async () => {
      try {
        const [depts, desigs] = await Promise.all([
          getDepartments({ signal: controller.signal }), 
          getDesignations({ signal: controller.signal })
        ]);
        setDepartments(depts);
        setDesignations(desigs);
      } catch (err) {
        if (err.name !== 'CanceledError') {
          console.error(err);
        }
      }
    };
    
    fetchDropdowns();
    return () => { controller.abort(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    
    const timer = setTimeout(() => {
      fetchEmployees({ signal: controller.signal });
    }, 300);
    
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, departmentId, designationId, status]);

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this employee?')) {
      try {
        await deleteEmployee(id);
        fetchEmployees();
      } catch (err) {
        alert('Failed to delete employee');
      }
    }
  };

  return (
    <div className="employees-page">
      <div className="page-header">
        <h1 className="page-title">Employees</h1>
        {hasPermission('employees.create') && (
          <button 
            className="btn-primary"
            onClick={() => navigate(ROUTES.EMPLOYEE_ADD)}
          >
            Add Employee
          </button>
        )}
      </div>

      <div className="filters-bar">
        <input 
          type="text" 
          placeholder="Search by name, email, or code..." 
          className="filter-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <CustomSelect 
          className="filter-select"
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
        >
          <option value="">All Departments</option>
          {departments.map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </CustomSelect>
        <CustomSelect 
          className="filter-select"
          value={designationId}
          onChange={(e) => setDesignationId(e.target.value)}
        >
          <option value="">All Designations</option>
          {designations.map(d => (
            <option key={d.id} value={d.id}>{d.title}</option>
          ))}
        </CustomSelect>
        <CustomSelect 
          className="filter-select"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
          <option value="Terminated">Terminated</option>
          <option value="On Leave">On Leave</option>
        </CustomSelect>
      </div>

      <div className="table-container">
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>Loading employees...</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Email</th>
                <th>Department</th>
                <th>Designation</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 ? (
                <tr><td colSpan="7" style={{ textAlign: 'center' }}>No employees found.</td></tr>
              ) : (
                employees.map(emp => (
                  <tr key={emp.id}>
                    <td>{emp.employee_code}</td>
                    <td>{emp.first_name} {emp.last_name}</td>
                    <td>{emp.email}</td>
                    <td>{emp.department?.name || '-'}</td>
                    <td>{emp.designation?.title || '-'}</td>
                    <td>
                      <span className={`badge ${emp.employment_status.toLowerCase().replace(' ', '-')}`}>
                        {emp.employment_status}
                      </span>
                    </td>
                    <td>
                      <div className="actions-cell">
                        <button 
                          className="btn-secondary"
                          onClick={() => navigate(ROUTES.EMPLOYEE_VIEW.replace(':id', emp.id))}
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        >
                          View
                        </button>
                        {hasPermission('employees.update') && (
                          <button 
                            className="btn-secondary"
                            onClick={() => navigate(ROUTES.EMPLOYEE_EDIT.replace(':id', emp.id))}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          >
                            Edit
                          </button>
                        )}
                        {hasPermission('employees.delete') && (
                          <button 
                            className="btn-danger"
                            onClick={() => handleDelete(emp.id)}
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
