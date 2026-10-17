import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import reportService from '../../services/reportService';
import '../../styles/common.css';
import CustomSelect from '../../components/common/CustomSelect';

const PerformanceReports = () => {
  const [activeTab, setActiveTab] = useState('ratings'); // 'ratings' | 'department' | 'goals' | 'training'

  // Employee Ratings Report state
  const [ratingsData, setRatingsData] = useState([]);
  const [ratingsSummary, setRatingsSummary] = useState({ total_reviews: 0, average_overall_rating: 0 });

  // Department Performance Report state
  const [deptData, setDeptData] = useState([]);
  const [deptSummary, setDeptSummary] = useState({
    total_departments: 0,
    overall_company_avg_rating: 0,
    overall_goal_completion_percentage: 0,
  });

  // Goal Completion Report state
  const [goalsData, setGoalsData] = useState([]);
  const [goalsSummary, setGoalsSummary] = useState({
    total_goals: 0,
    completed_goals: 0,
    in_progress_goals: 0,
    pending_goals: 0,
    cancelled_goals: 0,
    average_progress: 0,
    goal_completion_percentage: 0,
    overdue_goals: 0,
  });

  // Training Completion Report state
  const [trainingData, setTrainingData] = useState([]);
  const [trainingSummary, setTrainingSummary] = useState({
    total_trainings: 0,
    total_enrollments: 0,
    completed_enrollments: 0,
    enrolled_pending_enrollments: 0,
    failed_enrollments: 0,
    dropped_enrollments: 0,
    overall_completion_percentage: 0,
    certificates_issued: 0,
  });
  const [expandedTrainingId, setExpandedTrainingId] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Dropdown options
  const [cycles, setCycles] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [trainingsList, setTrainingsList] = useState([]);

  // Filter state
  const [selectedCycle, setSelectedCycle] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [selectedTraining, setSelectedTraining] = useState('');

  // Fetch filter options
  useEffect(() => {
    const fetchDropdowns = async () => {
      try {
        const [cyclesRes, deptsRes, empsRes, trainingsRes] = await Promise.all([
          api.get('/performance-cycles').catch(() => ({ data: [] })),
          api.get('/departments').catch(() => ({ data: [] })),
          api.get('/employees').catch(() => ({ data: [] })),
          api.get('/trainings').catch(() => ({ data: [] })),
        ]);
        setCycles(Array.isArray(cyclesRes.data) ? cyclesRes.data : cyclesRes.data?.data || []);
        setDepartments(Array.isArray(deptsRes.data) ? deptsRes.data : deptsRes.data?.data || []);
        setEmployees(Array.isArray(empsRes.data) ? empsRes.data : empsRes.data?.data || []);
        setTrainingsList(Array.isArray(trainingsRes.data) ? trainingsRes.data : trainingsRes.data?.data || []);
      } catch (err) {
        console.error('Error fetching report filters:', err);
      }
    };
    fetchDropdowns();
  }, []);

  // Fetch report data based on active tab
  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (selectedCycle) params.cycle_id = selectedCycle;
      if (selectedDepartment) params.department_id = selectedDepartment;
      if (selectedEmployee) params.employee_id = selectedEmployee;
      if (selectedTraining) params.training_id = selectedTraining;

      if (activeTab === 'ratings') {
        const res = await reportService.getEmployeeRatingsReport(params);

        if (res && res.data) {
          setRatingsData(res.data);
          setRatingsSummary(res.summary || { total_reviews: res.data.length, average_overall_rating: 0 });
        } else if (Array.isArray(res)) {
          setRatingsData(res);
          const avg = res.length > 0 ? (res.reduce((acc, r) => acc + (r.overall_rating || 0), 0) / res.length).toFixed(2) : 0;
          setRatingsSummary({ total_reviews: res.length, average_overall_rating: avg });
        } else {
          setRatingsData([]);
          setRatingsSummary({ total_reviews: 0, average_overall_rating: 0 });
        }
      } else if (activeTab === 'department') {
        const res = await reportService.getDepartmentPerformanceReport(params);

        if (res && res.data) {
          setDeptData(res.data);
          setDeptSummary(res.summary || {
            total_departments: res.data.length,
            overall_company_avg_rating: 0,
            overall_goal_completion_percentage: 0,
          });
        } else if (Array.isArray(res)) {
          setDeptData(res);
          setDeptSummary({
            total_departments: res.length,
            overall_company_avg_rating: 0,
            overall_goal_completion_percentage: 0,
          });
        } else {
          setDeptData([]);
          setDeptSummary({
            total_departments: 0,
            overall_company_avg_rating: 0,
            overall_goal_completion_percentage: 0,
          });
        }
      } else if (activeTab === 'goals') {
        const res = await reportService.getGoalCompletionReport(params);

        if (res && res.data) {
          setGoalsData(res.data);
          setGoalsSummary(res.summary || {
            total_goals: res.data.length,
            completed_goals: 0,
            in_progress_goals: 0,
            pending_goals: 0,
            cancelled_goals: 0,
            average_progress: 0,
            goal_completion_percentage: 0,
            overdue_goals: 0,
          });
        } else if (Array.isArray(res)) {
          setGoalsData(res);
          setGoalsSummary({
            total_goals: res.length,
            completed_goals: res.filter(g => (g.status || '').toLowerCase() === 'completed' || g.progress === 100).length,
            in_progress_goals: 0,
            pending_goals: 0,
            cancelled_goals: 0,
            average_progress: 0,
            goal_completion_percentage: 0,
            overdue_goals: 0,
          });
        } else {
          setGoalsData([]);
          setGoalsSummary({
            total_goals: 0,
            completed_goals: 0,
            in_progress_goals: 0,
            pending_goals: 0,
            cancelled_goals: 0,
            average_progress: 0,
            goal_completion_percentage: 0,
            overdue_goals: 0,
          });
        }
      } else if (activeTab === 'training') {
        const res = await reportService.getTrainingCompletionReport(params);

        if (res && res.data) {
          setTrainingData(res.data);
          setTrainingSummary(res.summary || {
            total_trainings: res.data.length,
            total_enrollments: 0,
            completed_enrollments: 0,
            enrolled_pending_enrollments: 0,
            failed_enrollments: 0,
            dropped_enrollments: 0,
            overall_completion_percentage: 0,
            certificates_issued: 0,
          });
        } else if (Array.isArray(res)) {
          setTrainingData(res);
          setTrainingSummary({
            total_trainings: res.length,
            total_enrollments: 0,
            completed_enrollments: 0,
            enrolled_pending_enrollments: 0,
            failed_enrollments: 0,
            dropped_enrollments: 0,
            overall_completion_percentage: 0,
            certificates_issued: 0,
          });
        } else {
          setTrainingData([]);
          setTrainingSummary({
            total_trainings: 0,
            total_enrollments: 0,
            completed_enrollments: 0,
            enrolled_pending_enrollments: 0,
            failed_enrollments: 0,
            dropped_enrollments: 0,
            overall_completion_percentage: 0,
            certificates_issued: 0,
          });
        }
      }
    } catch (err) {
      console.error('Failed to load performance report:', err);
      setError(err.response?.data?.message || 'Failed to load report data.');
      if (activeTab === 'ratings') setRatingsData([]);
      else if (activeTab === 'department') setDeptData([]);
      else if (activeTab === 'goals') setGoalsData([]);
      else setTrainingData([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, selectedCycle, selectedDepartment, selectedEmployee, selectedTraining]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleResetFilters = () => {
    setSelectedCycle('');
    setSelectedDepartment('');
    setSelectedEmployee('');
    setSelectedTraining('');
  };

  const getStatusBadge = (status) => {
    const s = (status || '').toLowerCase();
    if (s === 'acknowledged' || s === 'completed') return 'badge-success';
    if (s === 'submitted' || s === 'in_progress' || s === 'ongoing') return 'badge-info';
    if (s === 'cancelled' || s === 'dropped') return 'badge-neutral';
    if (s === 'failed') return 'badge-danger';
    return 'badge-warning';
  };

  const toggleExpandTraining = (id) => {
    setExpandedTrainingId(prev => (prev === id ? null : id));
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2 className="page-title">Performance Reports</h2>
          <p className="page-subtitle">View detailed employee ratings, department metrics, goal progress, and training completion reports</p>
        </div>
      </div>

      {/* Subtab Navigation */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
        <button
          className={activeTab === 'ratings' ? 'btn-primary' : 'btn-secondary'}
          style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
          onClick={() => setActiveTab('ratings')}
        >
          Employee Ratings
        </button>
        <button
          className={activeTab === 'department' ? 'btn-primary' : 'btn-secondary'}
          style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
          onClick={() => setActiveTab('department')}
        >
          Department Performance
        </button>
        <button
          className={activeTab === 'goals' ? 'btn-primary' : 'btn-secondary'}
          style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
          onClick={() => setActiveTab('goals')}
        >
          Goal Completion
        </button>
        <button
          className={activeTab === 'training' ? 'btn-primary' : 'btn-secondary'}
          style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
          onClick={() => setActiveTab('training')}
        >
          Training Completion
        </button>
      </div>

      {/* Filter Section */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'end' }}>
          {activeTab !== 'training' && (
            <div>
              <label className="filter-label">Performance Cycle</label>
              <CustomSelect
                className="form-control"
                value={selectedCycle}
                onChange={(e) => setSelectedCycle(e.target.value)}
              >
                <option value="">All Cycles</option>
                {cycles.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </CustomSelect>
            </div>
          )}

          {activeTab === 'training' && (
            <div>
              <label className="filter-label">Training Program</label>
              <CustomSelect
                className="form-control"
                value={selectedTraining}
                onChange={(e) => setSelectedTraining(e.target.value)}
              >
                <option value="">All Trainings</option>
                {trainingsList.map((t) => (
                  <option key={t.id} value={t.id}>{t.training_name}</option>
                ))}
              </CustomSelect>
            </div>
          )}

          <div>
            <label className="filter-label">Department</label>
            <CustomSelect
              className="form-control"
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </CustomSelect>
          </div>

          {activeTab !== 'department' && (
            <div>
              <label className="filter-label">Employee</label>
              <CustomSelect
                className="form-control"
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
              >
                <option value="">All Employees</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name} ({emp.employee_code})
                  </option>
                ))}
              </CustomSelect>
            </div>
          )}

          <div>
            <button className="btn-secondary" style={{ width: '100%' }} onClick={handleResetFilters}>
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {activeTab === 'ratings' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <div className="card" style={{ padding: '1.25rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 500 }}>Total Reviews Evaluated</span>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem', color: '#0f172a' }}>
              {ratingsSummary.total_reviews || 0}
            </div>
          </div>

          <div className="card" style={{ padding: '1.25rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 500 }}>Average Overall Rating</span>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem', color: '#2563eb' }}>
              {ratingsSummary.average_overall_rating ? Number(ratingsSummary.average_overall_rating).toFixed(2) : '0.00'} / 5.00
            </div>
          </div>
        </div>
      )}

      {activeTab === 'department' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <div className="card" style={{ padding: '1.25rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 500 }}>Total Departments</span>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem', color: '#0f172a' }}>
              {deptSummary.total_departments || 0}
            </div>
          </div>

          <div className="card" style={{ padding: '1.25rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 500 }}>Overall Company Rating</span>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem', color: '#2563eb' }}>
              {deptSummary.overall_company_avg_rating ? Number(deptSummary.overall_company_avg_rating).toFixed(2) : '0.00'} / 5.00
            </div>
          </div>

          <div className="card" style={{ padding: '1.25rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 500 }}>Overall Goal Completion</span>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem', color: '#16a34a' }}>
              {deptSummary.overall_goal_completion_percentage ? Number(deptSummary.overall_goal_completion_percentage).toFixed(2) : '0.00'}%
            </div>
          </div>
        </div>
      )}

      {activeTab === 'goals' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <div className="card" style={{ padding: '1.25rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 500 }}>Total Goals</span>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem', color: '#0f172a' }}>
              {goalsSummary.total_goals || 0}
            </div>
          </div>

          <div className="card" style={{ padding: '1.25rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 500 }}>Completed Goals</span>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem', color: '#16a34a' }}>
              {goalsSummary.completed_goals || 0}
            </div>
          </div>

          <div className="card" style={{ padding: '1.25rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 500 }}>Average Progress</span>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem', color: '#2563eb' }}>
              {goalsSummary.average_progress ? Number(goalsSummary.average_progress).toFixed(2) : '0.00'}%
            </div>
          </div>

          <div className="card" style={{ padding: '1.25rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 500 }}>Goal Completion Rate</span>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem', color: '#059669' }}>
              {goalsSummary.goal_completion_percentage ? Number(goalsSummary.goal_completion_percentage).toFixed(2) : '0.00'}%
            </div>
          </div>

          <div className="card" style={{ padding: '1.25rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 500 }}>Overdue Goals</span>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem', color: goalsSummary.overdue_goals > 0 ? '#dc2626' : '#64748b' }}>
              {goalsSummary.overdue_goals || 0}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'training' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <div className="card" style={{ padding: '1.25rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 500 }}>Total Trainings</span>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem', color: '#0f172a' }}>
              {trainingSummary.total_trainings || 0}
            </div>
          </div>

          <div className="card" style={{ padding: '1.25rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 500 }}>Total Enrollments</span>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem', color: '#2563eb' }}>
              {trainingSummary.total_enrollments || 0}
            </div>
          </div>

          <div className="card" style={{ padding: '1.25rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 500 }}>Completed</span>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem', color: '#16a34a' }}>
              {trainingSummary.completed_enrollments || 0}
            </div>
          </div>

          <div className="card" style={{ padding: '1.25rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 500 }}>Enrolled / Pending</span>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem', color: '#d97706' }}>
              {trainingSummary.enrolled_pending_enrollments || 0}
            </div>
          </div>

          <div className="card" style={{ padding: '1.25rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 500 }}>Failed</span>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem', color: '#dc2626' }}>
              {trainingSummary.failed_enrollments || 0}
            </div>
          </div>

          <div className="card" style={{ padding: '1.25rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 500 }}>Dropped</span>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem', color: '#64748b' }}>
              {trainingSummary.dropped_enrollments || 0}
            </div>
          </div>

          <div className="card" style={{ padding: '1.25rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 500 }}>Completion Rate</span>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem', color: '#059669' }}>
              {trainingSummary.overall_completion_percentage ? Number(trainingSummary.overall_completion_percentage).toFixed(2) : '0.00'}%
            </div>
          </div>

          <div className="card" style={{ padding: '1.25rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 500 }}>Certificates Issued</span>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem', color: '#7c3aed' }}>
              {trainingSummary.certificates_issued || 0}
            </div>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="alert-banner error" style={{ marginBottom: '1.5rem' }}>
          {error}
        </div>
      )}

      {/* Data Table */}
      <div className="table-container">
        {loading ? (
          <div className="state-container">
            <p>Loading report data...</p>
          </div>
        ) : activeTab === 'ratings' ? (
          ratingsData.length === 0 ? (
            <div className="state-container">
              <p>No performance review ratings found matching the selected criteria.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Cycle</th>
                  <th>Technical</th>
                  <th>Comm.</th>
                  <th>Teamwork</th>
                  <th>Leadership</th>
                  <th>Productivity</th>
                  <th>Problem Solving</th>
                  <th>Attendance</th>
                  <th>Goal Ach.</th>
                  <th>Overall</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {ratingsData.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{item.employee_name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {item.employee_code} &bull; {item.department_name}
                      </div>
                    </td>
                    <td style={{ fontSize: '0.875rem' }}>{item.cycle_name}</td>
                    <td style={{ textAlign: 'center' }}>{item.rating_technical_skills}</td>
                    <td style={{ textAlign: 'center' }}>{item.rating_communication}</td>
                    <td style={{ textAlign: 'center' }}>{item.rating_teamwork}</td>
                    <td style={{ textAlign: 'center' }}>{item.rating_leadership}</td>
                    <td style={{ textAlign: 'center' }}>{item.rating_productivity}</td>
                    <td style={{ textAlign: 'center' }}>{item.rating_problem_solving}</td>
                    <td style={{ textAlign: 'center' }}>{item.rating_attendance}</td>
                    <td style={{ textAlign: 'center' }}>{item.rating_goal_achievement}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        fontWeight: 700,
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        backgroundColor: '#eff6ff',
                        color: '#1d4ed8',
                        border: '1px solid #bfdbfe',
                        fontSize: '0.875rem'
                      }}>
                        {Number(item.overall_rating).toFixed(2)}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${getStatusBadge(item.status)}`}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : activeTab === 'department' ? (
          deptData.length === 0 ? (
            <div className="state-container">
              <p>No department performance data found matching the selected criteria.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Employees</th>
                  <th>Average Rating</th>
                  <th>Goal Completion %</th>
                  <th>Completed Reviews</th>
                  <th>Pending Reviews</th>
                </tr>
              </thead>
              <tbody>
                {deptData.map((dept) => (
                  <tr key={dept.department_id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{dept.department_name}</div>
                    </td>
                    <td>{dept.employee_count}</td>
                    <td>
                      <span style={{
                        fontWeight: 700,
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        backgroundColor: '#eff6ff',
                        color: '#1d4ed8',
                        border: '1px solid #bfdbfe',
                        fontSize: '0.875rem'
                      }}>
                        {Number(dept.average_overall_rating).toFixed(2)} / 5.00
                      </span>
                    </td>
                    <td>
                      <span style={{
                        fontWeight: 600,
                        color: Number(dept.goal_completion_percentage) >= 70 ? '#16a34a' : Number(dept.goal_completion_percentage) >= 40 ? '#d97706' : '#dc2626'
                      }}>
                        {Number(dept.goal_completion_percentage).toFixed(2)}%
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-success">
                        {dept.completed_reviews}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${dept.pending_reviews > 0 ? 'badge-warning' : 'badge-neutral'}`}>
                        {dept.pending_reviews}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : activeTab === 'goals' ? (
          goalsData.length === 0 ? (
            <div className="state-container">
              <p>No goal completion records found matching the selected criteria.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Cycle</th>
                  <th>Goal</th>
                  <th>Target</th>
                  <th>Deadline</th>
                  <th>Progress</th>
                  <th>Status</th>
                  <th>Overdue</th>
                </tr>
              </thead>
              <tbody>
                {goalsData.map((g) => (
                  <tr key={g.goal_id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{g.employee_name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {g.employee_code} &bull; {g.department_name}
                      </div>
                    </td>
                    <td style={{ fontSize: '0.875rem' }}>{g.cycle_name}</td>
                    <td style={{ fontWeight: 500 }}>{g.goal}</td>
                    <td style={{ fontSize: '0.875rem', color: '#475569' }}>{g.target}</td>
                    <td style={{ fontSize: '0.875rem' }}>{g.deadline || '-'}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ flex: 1, height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden', minWidth: '60px' }}>
                          <div style={{
                            width: `${Math.min(100, Math.max(0, g.progress))}%`,
                            height: '100%',
                            backgroundColor: g.progress === 100 ? '#16a34a' : g.progress >= 50 ? '#2563eb' : '#f59e0b',
                            borderRadius: '4px'
                          }} />
                        </div>
                        <span style={{ fontSize: '0.8125rem', fontWeight: 600, minWidth: '35px' }}>{g.progress}%</span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${getStatusBadge(g.status)}`}>
                        {g.status}
                      </span>
                    </td>
                    <td>
                      {g.overdue ? (
                        <span className="badge badge-danger">Overdue</span>
                      ) : (
                        <span className="badge badge-neutral">No</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          trainingData.length === 0 ? (
            <div className="state-container">
              <p>No training completion records found matching the selected criteria.</p>
            </div>
          ) : (
            <div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Training Program</th>
                    <th>Trainer</th>
                    <th>Dates</th>
                    <th>Enrolled</th>
                    <th>Completed</th>
                    <th>Pending</th>
                    <th>Failed</th>
                    <th>Dropped</th>
                    <th>Completion %</th>
                    <th>Certificates</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {trainingData.map((t) => (
                    <React.Fragment key={t.training_id}>
                      <tr>
                        <td>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>{t.training_name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Status: {t.training_status}</div>
                        </td>
                        <td style={{ fontSize: '0.875rem' }}>{t.trainer_name}</td>
                        <td style={{ fontSize: '0.75rem', color: '#475569' }}>
                          {t.start_date} to {t.end_date}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{t.total_enrolled}</td>
                        <td style={{ textAlign: 'center', color: '#16a34a', fontWeight: 600 }}>{t.completed_count}</td>
                        <td style={{ textAlign: 'center', color: '#d97706' }}>{t.enrolled_pending_count}</td>
                        <td style={{ textAlign: 'center', color: '#dc2626' }}>{t.failed_count}</td>
                        <td style={{ textAlign: 'center', color: '#64748b' }}>{t.dropped_count}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{
                            fontWeight: 700,
                            color: Number(t.completion_percentage) >= 70 ? '#16a34a' : Number(t.completion_percentage) >= 40 ? '#d97706' : '#dc2626'
                          }}>
                            {Number(t.completion_percentage).toFixed(2)}%
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="badge badge-info">
                            {t.certificates_issued} Issued
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn-secondary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                            onClick={() => toggleExpandTraining(t.training_id)}
                          >
                            {expandedTrainingId === t.training_id ? 'Hide Attendees' : 'View Attendees'}
                          </button>
                        </td>
                      </tr>
                      {expandedTrainingId === t.training_id && (
                        <tr>
                          <td colSpan="11" style={{ backgroundColor: '#f8fafc', padding: '1rem' }}>
                            <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.875rem', color: '#334155' }}>
                              Enrolled Employees for {t.training_name}:
                            </div>
                            {(!t.attendees || t.attendees.length === 0) ? (
                              <p style={{ fontSize: '0.875rem', color: '#64748b' }}>No employee attendees registered.</p>
                            ) : (
                              <table className="data-table" style={{ backgroundColor: '#ffffff', fontSize: '0.8125rem' }}>
                                <thead>
                                  <tr>
                                    <th>Employee</th>
                                    <th>Department</th>
                                    <th>Completion Status</th>
                                    <th>Certificate Issued</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {t.attendees.map((att) => (
                                    <tr key={att.attendee_id}>
                                      <td>
                                        <div style={{ fontWeight: 600 }}>{att.employee_name}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{att.employee_code}</div>
                                      </td>
                                      <td>{att.department_name}</td>
                                      <td>
                                        <span className={`badge ${getStatusBadge(att.completion_status)}`}>
                                          {att.completion_status}
                                        </span>
                                      </td>
                                      <td>
                                        {att.certificate_available ? (
                                          <span className="badge badge-success">Available</span>
                                        ) : (
                                          <span className="badge badge-neutral">Not Issued</span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default PerformanceReports;
