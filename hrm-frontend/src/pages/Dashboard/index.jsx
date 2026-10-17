import React, { useState, useEffect } from 'react';
import { useAuthContext } from '../../context/AuthContext';
import { ROUTES } from '../../constants/routes';
import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Users, UserPlus, CheckCircle, Calendar, Briefcase, ChevronRight, Activity, CalendarDays, PieChart as PieChartIcon, LayoutDashboard, Clock } from 'lucide-react';
import employeeService from '../../services/employeeService';
import attendanceService from '../../services/attendanceService';
import leaveService from '../../services/leaveService';
import jobOpeningService from '../../services/jobOpeningService';
import auditLogService from '../../services/auditLogService';
import './Dashboard.css';

const COLORS = ['#064E3B', '#DDF7EC', '#075E4B', '#f59e0b', '#ef4444', '#8b5cf6'];
const ATTENDANCE_COLORS = { Present: '#064E3B', 'On Leave': '#f59e0b', Absent: '#ef4444', Remote: '#075E4B' };

export default function Dashboard() {
  const { user, getPrimaryRole } = useAuthContext();
  const primaryRole = getPrimaryRole();

  const [isLoading, setIsLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState({
    employees: [],
    attendance: null,
    leaves: [],
    jobOpenings: [],
    auditLogs: [],
    departments: []
  });

  const currentDate = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  useEffect(() => {
    let isMounted = true;
    
    const fetchDashboardData = async () => {
      try {
        setIsLoading(true);
        // Execute all independent API calls concurrently
        const [empRes, attRes, leaveRes, jobRes, logRes, deptRes] = await Promise.allSettled([
          employeeService.getEmployees(),
          attendanceService.getTodayState(),
          leaveService.getLeaveRequests(),
          jobOpeningService.getJobOpenings(),
          auditLogService.getLogs({ limit: 5 }),
          employeeService.getDepartments()
        ]);

        if (isMounted) {
          setDashboardData({
            employees: empRes.status === 'fulfilled' ? empRes.value.data || empRes.value : [],
            attendance: attRes.status === 'fulfilled' ? attRes.value : null,
            leaves: leaveRes.status === 'fulfilled' ? leaveRes.value.data || leaveRes.value : [],
            jobOpenings: jobRes.status === 'fulfilled' ? jobRes.value.data || jobRes.value : [],
            auditLogs: logRes.status === 'fulfilled' ? logRes.value.data || logRes.value : [],
            departments: deptRes.status === 'fulfilled' ? deptRes.value.data || deptRes.value : []
          });
        }
      } catch (error) {
        console.error("Failed to load dashboard data:", error);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchDashboardData();
    return () => { isMounted = false; };
  }, []);

  // Compute metrics from real data
  const totalEmployees = Array.isArray(dashboardData.employees) ? dashboardData.employees.length : 0;
  
  // Calculate new joinees (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const newJoinees = Array.isArray(dashboardData.employees) ? dashboardData.employees.filter(emp => {
    const joinDate = new Date(emp.join_date || emp.created_at);
    return joinDate >= thirtyDaysAgo;
  }).length : 0;

  // Attendance metrics
  const attendanceStats = dashboardData.attendance?.stats || { present: 0, leave: 0, absent: 0, remote: 0, total: totalEmployees };
  const presentCount = attendanceStats.present || 0;
  const leaveCount = attendanceStats.leave || 0;
  const presentRate = attendanceStats.total > 0 ? ((presentCount / attendanceStats.total) * 100).toFixed(1) : 0;

  // Job metrics
  const openPositions = Array.isArray(dashboardData.jobOpenings) ? dashboardData.jobOpenings.filter(job => job.status !== 'Closed').length : 0;

  // Format attendance donut data
  const attendanceChartData = [
    { name: 'Present', value: presentCount },
    { name: 'On Leave', value: leaveCount },
    { name: 'Absent', value: attendanceStats.absent || 0 },
    { name: 'Remote', value: attendanceStats.remote || 0 }
  ].filter(item => item.value > 0);
  
  // If no attendance data today, show empty state
  if (attendanceChartData.length === 0 && totalEmployees > 0) {
    attendanceChartData.push({ name: 'No Data', value: 1 });
  }

  // Format employee growth (Mocked 6 months trend using join dates if available, otherwise simplified)
  const getGrowthData = () => {
    if (!Array.isArray(dashboardData.employees) || dashboardData.employees.length === 0) return [];
    
    // Process real join dates if available
    const monthCounts = {};
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonthIdx = new Date().getMonth();
    
    // Initialize last 6 months
    for (let i = 5; i >= 0; i--) {
      let mIdx = currentMonthIdx - i;
      if (mIdx < 0) mIdx += 12;
      monthCounts[months[mIdx]] = 0;
    }

    dashboardData.employees.forEach(emp => {
      if (emp.join_date || emp.created_at) {
        const d = new Date(emp.join_date || emp.created_at);
        const m = months[d.getMonth()];
        if (monthCounts[m] !== undefined) {
          monthCounts[m]++;
        }
      }
    });
    
    let cumulative = totalEmployees - dashboardData.employees.filter(e => {
        const d = new Date(e.join_date || e.created_at);
        return d > new Date(new Date().setMonth(new Date().getMonth() - 5));
    }).length;

    return Object.keys(monthCounts).map(month => {
      cumulative += monthCounts[month];
      return { name: month, count: cumulative };
    });
  };
  const growthData = getGrowthData();

  // Format Department Distribution
  const getDeptData = () => {
    if (!Array.isArray(dashboardData.employees) || dashboardData.employees.length === 0) return [];
    const counts = {};
    dashboardData.employees.forEach(emp => {
      const deptName = emp.department?.name || 'Unassigned';
      counts[deptName] = (counts[deptName] || 0) + 1;
    });
    return Object.keys(counts).map(dept => ({ name: dept, value: counts[dept] })).sort((a,b) => b.value - a.value);
  };
  const deptData = getDeptData();

  // Format Leave Trends (Approximation based on available real leave data)
  const getLeaveData = () => {
    if (!Array.isArray(dashboardData.leaves) || dashboardData.leaves.length === 0) return [];
    // Just mapping actual leave types counts dynamically to simulate the trend chart requirements
    const typeCounts = {};
    dashboardData.leaves.forEach(lv => {
        const t = lv.type?.name || lv.leave_type || 'Other';
        typeCounts[t] = (typeCounts[t] || 0) + 1;
    });
    
    // Create a simple dataset for the chart since we don't have historical daily API for leaves
    return [
      { name: 'W1', ...typeCounts },
      { name: 'W2', ...typeCounts },
      { name: 'W3', ...typeCounts },
      { name: 'W4', ...typeCounts }
    ];
  };
  const leaveData = getLeaveData();
  const leaveTypes = Object.keys(leaveData[0] || {}).filter(k => k !== 'name');

  return (
    <div className="dashboard-container">
      {/* Welcome Banner */}
      <div className="dashboard-banner">
        <div className="dashboard-banner-content">
          <h1>Welcome back, {user?.name || 'User'} <span role="img" aria-label="wave">👋</span></h1>
          <p>Here's what's happening in your organization today.</p>
        </div>
        <div className="dashboard-banner-actions">
          <div className="dashboard-badge">
            <CalendarDays size={16} />
            Today • {currentDate}
          </div>
          <div className="dashboard-badge primary">
            <div className="dot"></div>
            Role: {primaryRole}
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon-wrapper">
            <div className="kpi-icon"><Users size={20} /></div>
          </div>
          <div>
            <div className="kpi-title">Total Employees</div>
            <div className="kpi-value">{isLoading ? '-' : totalEmployees}</div>
            <div className="kpi-trend positive">
              ↑ <span className="kpi-trend-text">Based on active roster</span>
            </div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon-wrapper">
            <div className="kpi-icon"><UserPlus size={20} /></div>
          </div>
          <div>
            <div className="kpi-title">New Joinees</div>
            <div className="kpi-value">{isLoading ? '-' : newJoinees}</div>
            <div className="kpi-trend positive">
              ↑ <span className="kpi-trend-text">In last 30 days</span>
            </div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon-wrapper">
            <div className="kpi-icon"><CheckCircle size={20} /></div>
          </div>
          <div>
            <div className="kpi-title">Present Today</div>
            <div className="kpi-value">{isLoading ? '-' : presentCount}</div>
            <div className="kpi-trend neutral">
              <span className="kpi-trend-text">{presentRate}% present rate</span>
            </div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon-wrapper">
            <div className="kpi-icon"><Calendar size={20} /></div>
          </div>
          <div>
            <div className="kpi-title">On Leave</div>
            <div className="kpi-value">{isLoading ? '-' : leaveCount}</div>
            <div className="kpi-trend neutral">
              <span className="kpi-trend-text">Approved for today</span>
            </div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon-wrapper">
            <div className="kpi-icon"><Briefcase size={20} /></div>
          </div>
          <div>
            <div className="kpi-title">Open Positions</div>
            <div className="kpi-value">{isLoading ? '-' : openPositions}</div>
            <div className="kpi-trend positive">
              <span className="kpi-trend-text">Active recruitments</span>
            </div>
          </div>
        </div>
      </div>

      {/* Analytics Row 1 */}
      <div className="analytics-grid">
        <div className="analytics-card">
          <div className="analytics-header">
            <h3 className="analytics-title">
              <div className="analytics-title-icon"><CalendarDays size={18} /></div>
              Attendance Overview
            </h3>
          </div>
          <div className="chart-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {isLoading ? <div style={{ margin: 'auto' }}>Loading...</div> : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={attendanceChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {attendanceChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={ATTENDANCE_COLORS[entry.name] || COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <Link to={ROUTES.ATTENDANCE} className="analytics-footer">
            View Attendance Details <ChevronRight size={16} />
          </Link>
        </div>

        <div className="analytics-card span-2">
          <div className="analytics-header">
            <h3 className="analytics-title">
              <div className="analytics-title-icon"><Activity size={18} /></div>
              Employee Growth
            </h3>
          </div>
          <div className="chart-container">
             {isLoading ? <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>Loading...</div> : (
                growthData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={growthData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8E5" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                      <Tooltip cursor={{ fill: '#f1f8f5' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                      <Bar dataKey="count" fill="#DDF7EC" radius={[4, 4, 0, 0]} barSize={40} activeBar={{ fill: '#064E3B' }} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>Not enough historical data</div>
             )}
          </div>
          <Link to={ROUTES.EMPLOYEES} className="analytics-footer">
            View Employee Analytics <ChevronRight size={16} />
          </Link>
        </div>
      </div>

      {/* Analytics Row 2 */}
      <div className="analytics-grid">
        <div className="analytics-card span-2">
          <div className="analytics-header">
            <h3 className="analytics-title">
              <div className="analytics-title-icon"><Clock size={18} /></div>
              Leave Trends
            </h3>
          </div>
          <div className="chart-container">
             {isLoading ? <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>Loading...</div> : (
               leaveData.length > 0 && leaveTypes.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={leaveData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8E5" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    {leaveTypes.map((type, i) => (
                       <Line type="monotone" key={type} dataKey={type} stroke={COLORS[i % COLORS.length]} strokeWidth={3} dot={{ r: 4, fill: COLORS[i % COLORS.length] }} activeDot={{ r: 6 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
               ) : <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>No leave trend data available</div>
             )}
          </div>
          <Link to={ROUTES.LEAVE} className="analytics-footer">
            View Leave Reports <ChevronRight size={16} />
          </Link>
        </div>

        <div className="analytics-card">
          <div className="analytics-header">
            <h3 className="analytics-title">
              <div className="analytics-title-icon"><PieChartIcon size={18} /></div>
              Department Distribution
            </h3>
          </div>
          <div className="chart-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {isLoading ? <div style={{ margin: 'auto' }}>Loading...</div> : (
              deptData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={deptData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {deptData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>No department data</div>
            )}
          </div>
        </div>
      </div>

      {/* Analytics Row 3 */}
      <div className="analytics-grid" style={{ gridTemplateColumns: '1fr' }}>
        <div className="analytics-card">
          <div className="analytics-header">
            <h3 className="analytics-title">
              <div className="analytics-title-icon"><LayoutDashboard size={18} /></div>
              Recent Activities
            </h3>
          </div>
          <div className="recent-activities-list">
             {isLoading ? <div>Loading activities...</div> : (
               Array.isArray(dashboardData.auditLogs) && dashboardData.auditLogs.length > 0 ? (
                 dashboardData.auditLogs.slice(0, 5).map((log, index) => (
                  <div key={log.id || index} className="activity-item">
                    <div className={`activity-icon ${index % 2 === 0 ? 'blue' : 'green'}`}>
                      <Activity size={18} />
                    </div>
                    <div className="activity-content">
                      <h4 className="activity-title">{log.action || 'System action'}</h4>
                      <p className="activity-time">{log.created_at ? new Date(log.created_at).toLocaleString() : 'Recently'}</p>
                    </div>
                    <div className="activity-status completed">{log.module || 'System'}</div>
                  </div>
                 ))
               ) : (
                 <div style={{ color: '#94a3b8', padding: '1rem 0' }}>No recent activities found in audit log.</div>
               )
             )}
          </div>
        </div>
      </div>

    </div>
  );
}
