import { createBrowserRouter } from 'react-router-dom';
import { ROUTES } from '../constants/routes';

// Layout
import AppLayout from '../components/layout/AppLayout';
import ProtectedRoute from '../components/auth/ProtectedRoute';
import GuestRoute from '../components/auth/GuestRoute';

// Auth pages
import Login from '../pages/Auth/Login';
import Register from '../pages/Auth/Register';
import ForgotPassword from '../pages/Auth/ForgotPassword';
import AdminRecovery from '../pages/Auth/AdminRecovery';
import AdminResetPassword from '../pages/Auth/AdminResetPassword';
import VerifyRecoveryEmail from '../pages/Auth/VerifyRecoveryEmail';
import SecuritySettings from '../pages/Settings/SecuritySettings';

// Module pages
import Dashboard from '../pages/Dashboard';
import Employees from '../pages/Employees';
import EmployeeForm from '../pages/Employees/EmployeeForm';
import EmployeeView from '../pages/Employees/EmployeeView';
import Departments from '../pages/Departments';
import DepartmentForm from '../pages/Departments/DepartmentForm';
import Designations from '../pages/Designations';
import DesignationForm from '../pages/Designations/DesignationForm';
import Attendance from '../pages/Attendance';
import Leave from '../pages/Leave';
import Jobs from '../pages/Jobs';
import Candidates from '../pages/Candidates';
import Recruitment from '../pages/Recruitment';
import Payroll from '../pages/Payroll';
import PayrollReports from '../pages/Payroll/PayrollReports';
import PayslipView from '../pages/Payroll/PayslipView';
import StatutoryRules from '../pages/Payroll/StatutoryRules';
import Performance from '../pages/Performance';
import Goals from '../pages/Goals';
import KPIs from '../pages/KPIs';
import Reviews from '../pages/Reviews';
import MyPerformance from '../pages/MyPerformance';
import Training from '../pages/Training';
import MyTraining from '../pages/MyTraining';
import Assets from '../pages/Assets';
import Projects from '../pages/Projects';
import Timesheets from '../pages/Timesheets';
import Helpdesk from '../pages/Helpdesk';
import Policies from '../pages/Policies';
import Documents from '../pages/Documents';
import AuditLogs from '../pages/AuditLogs';
import Shifts from '../pages/Shifts';
import Holidays from '../pages/Holidays';
import AttendanceReport from '../pages/Reports/AttendanceReport';
import LeaveReport from '../pages/Reports/LeaveReport';
import RecruitmentReport from '../pages/Reports/RecruitmentReport';
import PerformanceReports from '../pages/Reports/PerformanceReports';
import Interviews from '../pages/Interviews';
import OfferLetters from '../pages/OfferLetters';
import Onboarding from '../pages/Onboarding';
import OnboardingDetails from '../pages/Onboarding/Details';

export const router = createBrowserRouter([
  // Auth routes (outside AppLayout, guest only)
  {
    element: <GuestRoute />,
    children: [
      { path: ROUTES.LOGIN, element: <Login /> },
      { path: ROUTES.FORGOT_PASSWORD, element: <AdminRecovery /> },
      { path: ROUTES.ADMIN_RECOVERY, element: <AdminRecovery /> },
      { path: ROUTES.ADMIN_RESET_PASSWORD, element: <AdminResetPassword /> },
      { path: ROUTES.VERIFY_RECOVERY_EMAIL, element: <VerifyRecoveryEmail /> },
    ]
  },

  // Module routes (wrapped in AppLayout and protected)
  {
    element: <ProtectedRoute />, // Base protection: Must be logged in
    children: [
      {
        element: <AppLayout />,
        children: [
          // DASHBOARD: all six roles
          { path: ROUTES.DASHBOARD, element: <Dashboard /> },

          // SELF PROFILE: all six roles
          { path: ROUTES.EMPLOYEE_ME, element: <EmployeeView /> },

          // SECURITY SETTINGS: Super Admin, HR Admin
          {
            element: <ProtectedRoute roles={['Super Admin', 'HR Admin']} />,
            children: [{ path: ROUTES.SECURITY_SETTINGS, element: <SecuritySettings /> }]
          },

          // EMPLOYEES DIRECTORY & CRUD: Super Admin, HR Admin, HR Executive, Manager, Finance/Payroll Admin
          {
            element: <ProtectedRoute roles={['Super Admin', 'HR Admin', 'HR Executive', 'Manager', 'Finance/Payroll Admin']} />,
            children: [
              { path: ROUTES.EMPLOYEES, element: <Employees /> },
              { path: ROUTES.EMPLOYEE_ADD, element: <EmployeeForm /> },
              { path: ROUTES.EMPLOYEE_VIEW, element: <EmployeeView /> },
              { path: ROUTES.EMPLOYEE_EDIT, element: <EmployeeForm /> },
            ]
          },

          // DEPARTMENTS: Super Admin, HR Admin, HR Executive
          {
            element: <ProtectedRoute roles={['Super Admin', 'HR Admin', 'HR Executive']} />,
            children: [
              { path: ROUTES.DEPARTMENTS, element: <Departments /> },
              { path: ROUTES.DEPARTMENT_ADD, element: <DepartmentForm /> },
              { path: ROUTES.DEPARTMENT_EDIT, element: <DepartmentForm /> },
            ]
          },

          // DESIGNATIONS: Super Admin, HR Admin, HR Executive
          {
            element: <ProtectedRoute roles={['Super Admin', 'HR Admin', 'HR Executive']} />,
            children: [
              { path: ROUTES.DESIGNATIONS, element: <Designations /> },
              { path: ROUTES.DESIGNATION_ADD, element: <DesignationForm /> },
              { path: ROUTES.DESIGNATION_EDIT, element: <DesignationForm /> },
            ]
          },

          // DOCUMENTS: Super Admin, HR Admin, HR Executive, Manager, Employee
          {
            element: <ProtectedRoute roles={['Super Admin', 'HR Admin', 'HR Executive', 'Manager', 'Employee']} />,
            children: [{ path: ROUTES.DOCUMENTS, element: <Documents /> }]
          },

          // AUDIT LOGS: Super Admin, HR Admin, Finance/Payroll Admin
          {
            element: <ProtectedRoute roles={['Super Admin', 'HR Admin', 'Finance/Payroll Admin']} />,
            children: [{ path: ROUTES.AUDIT_LOGS, element: <AuditLogs /> }]
          },

          // SHIFTS: Super Admin, HR Admin, HR Executive, Manager (Employee excluded)
          {
            element: <ProtectedRoute roles={['Super Admin', 'HR Admin', 'HR Executive', 'Manager']} />,
            children: [{ path: ROUTES.SHIFTS, element: <Shifts /> }]
          },

          // HOLIDAYS: Super Admin, HR Admin, HR Executive, Manager, Employee
          {
            element: <ProtectedRoute roles={['Super Admin', 'HR Admin', 'HR Executive', 'Manager', 'Employee']} />,
            children: [{ path: ROUTES.HOLIDAYS, element: <Holidays /> }]
          },

          // ATTENDANCE: all six roles
          { path: ROUTES.ATTENDANCE, element: <Attendance /> },

          // LEAVE: all six roles
          { path: ROUTES.LEAVE, element: <Leave /> },

          // ATTENDANCE & LEAVE REPORTS: Super Admin, HR Admin, HR Executive, Manager, Employee (Finance/Payroll Admin excluded)
          {
            element: <ProtectedRoute roles={['Super Admin', 'HR Admin', 'HR Executive', 'Manager', 'Employee']} />,
            children: [
              { path: ROUTES.REPORTS_ATTENDANCE, element: <AttendanceReport /> },
              { path: ROUTES.REPORTS_LEAVE, element: <LeaveReport /> },
            ]
          },

          // JOB OPENINGS / CANDIDATES / RECRUITMENT: Super Admin, HR Admin, HR Executive
          {
            element: <ProtectedRoute roles={['Super Admin', 'HR Admin', 'HR Executive']} />,
            children: [
              { path: ROUTES.JOBS, element: <Jobs /> },
              { path: ROUTES.REPORTS_RECRUITMENT, element: <RecruitmentReport /> },
              { path: ROUTES.CANDIDATES, element: <Candidates /> },
              { path: ROUTES.RECRUITMENT, element: <Jobs /> },
              { path: ROUTES.OFFER_LETTERS, element: <OfferLetters /> },
              { path: ROUTES.ONBOARDING, element: <Onboarding /> },
              { path: ROUTES.ONBOARDING_DETAILS, element: <OnboardingDetails /> },
            ]
          },

          // INTERVIEWS: Super Admin, HR Admin, HR Executive, Manager
          {
            element: <ProtectedRoute roles={['Super Admin', 'HR Admin', 'HR Executive', 'Manager']} />,
            children: [{ path: ROUTES.INTERVIEWS, element: <Interviews /> }]
          },

          // PAYROLL: Super Admin, Finance/Payroll Admin, HR Admin
          {
            element: <ProtectedRoute roles={['Super Admin', 'Finance/Payroll Admin', 'HR Admin']} />,
            children: [
              { path: ROUTES.PAYROLL, element: <Payroll /> },
              { path: ROUTES.PAYROLL_REPORTS, element: <PayrollReports /> },
            ]
          },

          // STATUTORY RULES: Super Admin, Finance/Payroll Admin
          {
            element: <ProtectedRoute roles={['Super Admin', 'Finance/Payroll Admin']} />,
            children: [
              { path: ROUTES.PAYROLL_STATUTORY_RULES, element: <StatutoryRules /> },
            ]
          },

          // PAYSLIP VIEW (Available to Employees too)
          {
            element: <ProtectedRoute />, // Let PayslipView handle ownership logic
            children: [
              { path: ROUTES.PAYSLIP_VIEW, element: <PayslipView /> },
            ]
          },

          // ADMIN PERFORMANCE CYCLES: Super Admin, HR Admin, Manager
          {
            element: <ProtectedRoute roles={['Super Admin', 'HR Admin', 'Manager']} />,
            children: [
              { path: ROUTES.PERFORMANCE, element: <Performance /> },
            ]
          },

          // PERFORMANCE SELF SERVICE & GOALS/REVIEWS: Super Admin, HR Admin, HR Executive, Manager, Employee
          {
            element: <ProtectedRoute roles={['Super Admin', 'HR Admin', 'HR Executive', 'Manager', 'Employee']} />,
            children: [
              { path: ROUTES.GOALS, element: <Goals /> },
              { path: ROUTES.KPIS, element: <KPIs /> },
              { path: ROUTES.REVIEWS, element: <Reviews /> },
              { path: ROUTES.MY_PERFORMANCE, element: <MyPerformance /> },
              { path: ROUTES.REPORTS_PERFORMANCE, element: <PerformanceReports /> }
            ]
          },

          // TRAINING: Super Admin, HR Admin, HR Executive, Manager, Employee
          {
            element: <ProtectedRoute roles={['Super Admin', 'HR Admin', 'HR Executive', 'Manager', 'Employee']} />,
            children: [
              { path: ROUTES.TRAINING, element: <Training /> },
              { path: ROUTES.MY_TRAINING, element: <MyTraining /> }
            ]
          },

          // ASSETS: Super Admin, HR Admin, HR Executive, Manager, Employee
          {
            element: <ProtectedRoute roles={['Super Admin', 'HR Admin', 'HR Executive', 'Manager', 'Employee']} />,
            children: [{ path: ROUTES.ASSETS, element: <Assets /> }]
          },

          // PROJECTS: Super Admin, HR Admin, Manager
          {
            element: <ProtectedRoute roles={['Super Admin', 'HR Admin', 'Manager']} />,
            children: [{ path: ROUTES.PROJECTS, element: <Projects /> }]
          },

          // TIMESHEETS: Super Admin, HR Admin, HR Executive, Manager, Employee, Finance/Payroll Admin
          {
            element: <ProtectedRoute roles={['Super Admin', 'HR Admin', 'HR Executive', 'Manager', 'Employee', 'Finance/Payroll Admin']} />,
            children: [{ path: ROUTES.TIMESHEETS, element: <Timesheets /> }]
          },

          // HELPDESK: all six roles
          { path: ROUTES.HELPDESK, element: <Helpdesk /> },

          // POLICIES: all six roles
          { path: ROUTES.POLICIES, element: <Policies /> },
        ],
      }
    ]
  },
]);
