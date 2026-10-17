import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getPayrollSummary, getDepartmentPayroll, getDeductionReport, getEmployeePayrollReport } from '../../services/payrollService';
import { IconUsers, IconCalendar, IconBarChart, IconCheck, IconDownload, IconFileText, IconAlertCircle } from '../../components/common/Icons';
import CustomSelect from '../../components/common/CustomSelect';

export default function PayrollReports() {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [reportType, setReportType] = useState('monthly');
  const [activeTab, setActiveTab] = useState('monthly');
  
  const [summary, setSummary] = useState(null);
  const [departmentReport, setDepartmentReport] = useState([]);
  const [deductionReport, setDeductionReport] = useState(null);
  const [employeeReport, setEmployeeReport] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pdfError, setPdfError] = useState(null);

  const fetchReports = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const params = { month, year };
      const [sumRes, deptRes, dedRes, empRes] = await Promise.all([
        getPayrollSummary(params),
        getDepartmentPayroll(params),
        getDeductionReport(params),
        getEmployeePayrollReport(params)
      ]);
      setSummary(sumRes.data);
      setDepartmentReport(deptRes.data);
      setDeductionReport(dedRes.data);
      setEmployeeReport(empRes.data);
      setActiveTab(reportType);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch payroll reports.');
      setSummary(null);
      setDepartmentReport([]);
      setDeductionReport(null);
      setEmployeeReport([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const months = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' }
  ];

  const reportTypes = [
    { value: 'monthly', label: 'Monthly Payroll Summary' },
    { value: 'department', label: 'Department-wise Payroll' },
    { value: 'deduction', label: 'Deduction Summary' },
    { value: 'employee', label: 'Employee Payroll Report' }
  ];

  const formatCurrency = (amount) => {
    const num = parseFloat(amount || 0);
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(num);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Approved':
        return <span className="badge badge-success"><IconCheck width="12" height="12" style={{ marginRight: '4px' }} /> Approved</span>;
      case 'Pending':
        return <span className="badge badge-warning">Pending</span>;
      default:
        return <span className="badge badge-neutral">{status || 'Draft'}</span>;
    }
  };

  const exportPDF = () => {
    setPdfError(null);
    try {
      if (!summary) {
        setPdfError("Report data is missing or hasn't been loaded yet. Please try again.");
        return;
      }

      if (activeTab === 'monthly' && (!employeeReport || employeeReport.length === 0)) {
        setPdfError("No employee data available to export for the selected month.");
        return;
      }
      if (activeTab === 'department' && (!departmentReport || departmentReport.length === 0)) {
        setPdfError("No department data available to export for the selected month.");
        return;
      }
      if (activeTab === 'deduction' && (!deductionReport || summary.total_deductions === 0)) {
        setPdfError("No deduction data available to export for the selected month.");
        return;
      }
      if (activeTab === 'employee' && (!employeeReport || employeeReport.length === 0)) {
        setPdfError("No employee data available to export for the selected month.");
        return;
      }

      const DocClass = jsPDF.jsPDF ? jsPDF.jsPDF : jsPDF;
      const doc = new DocClass();
      const monthName = months.find(m => m.value === month)?.label || '';
      
      // Title and Summary Info
      doc.setFontSize(16);
      doc.text('HRMS Payroll Report', 14, 20);
      
      doc.setFontSize(11);
      doc.text(`Report Type: ${reportTypes.find(t => t.value === activeTab)?.label}`, 14, 30);
      doc.text(`Period: ${monthName} ${year}`, 14, 36);
      
      doc.text(`Total Employees: ${summary.total_employees_processed || 0}`, 14, 46);
      doc.text(`Total Gross Salary: Rs. ${summary.total_gross_salary || 0}`, 14, 52);
      doc.text(`Total Deductions: Rs. ${summary.total_deductions || 0}`, 14, 58);
      doc.text(`Total Net Salary: Rs. ${summary.total_net_salary || 0}`, 14, 64);
      
      let startY = 74;

      if (activeTab === 'monthly') {
        const tableColumn = ["#", "Employee ID", "Employee Name", "Department", "Designation", "Gross Salary", "Deductions", "Net Salary", "Status"];
        const tableRows = [];

        employeeReport.forEach((emp, index) => {
          tableRows.push([
            index + 1,
            emp.employee_id,
            emp.employee,
            emp.department || '-',
            emp.designation || '-',
            emp.gross,
            emp.deductions,
            emp.net_salary,
            emp.status
          ]);
        });

        autoTable(doc, {
          head: [tableColumn],
          body: tableRows,
          startY: startY,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [79, 70, 229] }
        });
      } else if (activeTab === 'department') {
        const tableColumn = ["Department", "Employee Count", "Gross Salary", "Deductions", "Net Salary"];
        const tableRows = [];

        departmentReport.forEach((dept) => {
          tableRows.push([
            dept.department || 'Unassigned',
            dept.employee_count,
            dept.gross_salary_total,
            dept.deductions_total || 0,
            dept.net_salary_total
          ]);
        });

        autoTable(doc, {
          head: [tableColumn],
          body: tableRows,
          startY: startY,
          headStyles: { fillColor: [79, 70, 229] }
        });
      } else if (activeTab === 'deduction') {
        const tableColumn = ["Deduction Type", "Amount"];
        const tableRows = [];

        tableRows.push(["Provident Fund (PF)", deductionReport.PF_total]);
        tableRows.push(["ESI", deductionReport.ESI_total]);
        tableRows.push(["Professional Tax", deductionReport.Professional_Tax_total]);
        tableRows.push(["TDS", deductionReport.TDS_total]);
        tableRows.push(["Other Deductions", deductionReport.other_deductions_total]);
        if (deductionReport.LOP_total !== undefined) {
          tableRows.push(["Loss of Pay (LOP)", deductionReport.LOP_total]);
        }
        tableRows.push(["Total Deductions", summary.total_deductions || 0]);

        autoTable(doc, {
          head: [tableColumn],
          body: tableRows,
          startY: startY,
          headStyles: { fillColor: [79, 70, 229] }
        });
      } else if (activeTab === 'employee') {
        const tableColumn = ["Employee ID", "Employee Name", "Department", "Designation", "Payroll Period", "Gross Salary", "Deductions", "Net Salary", "Status"];
        const tableRows = [];

        employeeReport.forEach((emp) => {
          tableRows.push([
            emp.employee_id,
            emp.employee,
            emp.department || '-',
            emp.designation || '-',
            `${monthName} ${year}`,
            emp.gross,
            emp.deductions,
            emp.net_salary,
            emp.status
          ]);
        });

        autoTable(doc, {
          head: [tableColumn],
          body: tableRows,
          startY: startY,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [79, 70, 229] }
        });
      }

      doc.save(`HRMS-Payroll-Report-${activeTab}-${monthName}-${year}.pdf`);
    } catch (err) {
      console.error("PDF Export failed:", err);
      setPdfError("An error occurred while generating the PDF. Please check the console for details.");
    }
  };

  const EmptyState = () => (
    <div className="state-container">
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-3)' }}>
        <div style={{ backgroundColor: 'var(--bg-surface-hover)', padding: 'var(--space-4)', borderRadius: '50%' }}>
          <IconBarChart width="32" height="32" style={{ color: 'var(--text-muted)' }} />
        </div>
      </div>
      <h3>No payroll data available</h3>
      <p>There are no payroll records for the selected month and year.</p>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Payroll Reports</h1>
          <p className="page-subtitle">
            View and analyze payroll data with detailed reports and summaries.
          </p>
        </div>
      </div>

      {error && (
        <div className="alert-banner error" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
          <IconAlertCircle width="20" height="20" />
          <div>
            <h3 style={{ margin: 0, fontWeight: 600 }}>Unable to load payroll reports</h3>
            <p style={{ margin: 0, fontSize: '0.875rem' }}>{error}</p>
            <button onClick={() => fetchReports()} className="btn-secondary" style={{ marginTop: 'var(--space-2)', padding: '0.2rem 0.5rem' }}>
              Retry
            </button>
          </div>
        </div>
      )}

      {pdfError && (
        <div className="alert-banner error" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
          <IconAlertCircle width="20" height="20" />
          <div>
            <h3 style={{ margin: 0, fontWeight: 600 }}>PDF Export Error</h3>
            <p style={{ margin: 0, fontSize: '0.875rem' }}>{pdfError}</p>
            <button onClick={() => setPdfError(null)} className="btn-secondary" style={{ marginTop: 'var(--space-2)', padding: '0.2rem 0.5rem' }}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="filters-bar" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="filter-group">
          <label className="filter-label">Report Type</label>
          <CustomSelect
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            className="filter-select"
            disabled={loading}
          >
            {reportTypes.map((rt) => (
              <option key={rt.value} value={rt.value}>{rt.label}</option>
            ))}
          </CustomSelect>
        </div>

        <div className="filter-group">
          <label className="filter-label">Month</label>
          <CustomSelect
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="filter-select"
            disabled={loading}
          >
            {months.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </CustomSelect>
        </div>

        <div className="filter-group">
          <label className="filter-label">Year</label>
          <input
            type="number"
            min="2000"
            max="2100"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="filter-input"
            disabled={loading}
          />
        </div>

        <button
          onClick={fetchReports}
          disabled={loading}
          className="btn-primary"
          style={{ height: 'fit-content' }}
        >
          <IconBarChart width="16" height="16" />
          {loading ? 'Generating...' : 'Generate Report'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <div className="detail-card" style={{ display: 'flex', alignItems: 'center', marginBottom: 0, padding: 'var(--space-4)' }}>
          <div style={{ backgroundColor: '#e0e7ff', padding: 'var(--space-3)', borderRadius: '50%', marginRight: 'var(--space-4)', color: '#064E3B', display: 'flex' }}>
            <IconUsers width="24" height="24" />
          </div>
          <div>
            <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)', margin: 0 }}>Total Employees Processed</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              {loading ? '...' : (summary?.total_employees_processed || 0)}
            </p>
          </div>
        </div>

        <div className="detail-card" style={{ display: 'flex', alignItems: 'center', marginBottom: 0, padding: 'var(--space-4)' }}>
          <div style={{ backgroundColor: '#dcfce7', padding: 'var(--space-3)', borderRadius: '50%', marginRight: 'var(--space-4)', color: '#16a34a', display: 'flex', width: '48px', height: '48px', justifyContent: 'center', alignItems: 'center', fontSize: '1.2rem', fontWeight: 'bold' }}>
            ₹
          </div>
          <div>
            <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)', margin: 0 }}>Total Gross Salary</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              {loading ? '...' : formatCurrency(summary?.total_gross_salary || 0)}
            </p>
          </div>
        </div>

        <div className="detail-card" style={{ display: 'flex', alignItems: 'center', marginBottom: 0, padding: 'var(--space-4)' }}>
          <div style={{ backgroundColor: '#fee2e2', padding: 'var(--space-3)', borderRadius: '50%', marginRight: 'var(--space-4)', color: '#dc2626', display: 'flex', width: '48px', height: '48px', justifyContent: 'center', alignItems: 'center', fontSize: '1.2rem', fontWeight: 'bold' }}>
            ₹
          </div>
          <div>
            <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)', margin: 0 }}>Total Deductions</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              {loading ? '...' : formatCurrency(summary?.total_deductions || 0)}
            </p>
          </div>
        </div>

        <div className="detail-card" style={{ display: 'flex', alignItems: 'center', marginBottom: 0, padding: 'var(--space-4)' }}>
          <div style={{ backgroundColor: '#f3e8ff', padding: 'var(--space-3)', borderRadius: '50%', marginRight: 'var(--space-4)', color: '#9333ea', display: 'flex', width: '48px', height: '48px', justifyContent: 'center', alignItems: 'center', fontSize: '1.2rem', fontWeight: 'bold' }}>
            ₹
          </div>
          <div>
            <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)', margin: 0 }}>Total Net Salary</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              {loading ? '...' : formatCurrency(summary?.total_net_salary || 0)}
            </p>
          </div>
        </div>
      </div>

      <div className="tab-navigation">
        {reportTypes.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`tab-btn ${activeTab === tab.value ? 'active' : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="detail-card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="state-container">
            <p>Loading report data...</p>
          </div>
        ) : (
          <>
            <div className="detail-card-header" style={{ padding: 'var(--space-4) var(--space-6)', margin: 0, backgroundColor: 'var(--bg-surface-hover)' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>
                {reportTypes.find(t => t.value === activeTab)?.label}
              </h3>
              <button onClick={exportPDF} className="btn-secondary" style={{ padding: '0.35rem 0.75rem' }}>
                <IconDownload width="14" height="14" /> Export PDF
              </button>
            </div>
            
            <div>
              {activeTab === 'monthly' && (
                employeeReport && employeeReport.length > 0 ? (
                  <div className="table-container" style={{ margin: 0, border: 'none', borderRadius: 0, boxShadow: 'none' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Employee ID</th>
                          <th>Employee Name</th>
                          <th>Department</th>
                          <th>Designation</th>
                          <th style={{ textAlign: 'right' }}>Gross Salary</th>
                          <th style={{ textAlign: 'right' }}>Total Deductions</th>
                          <th style={{ textAlign: 'right' }}>Net Salary</th>
                          <th style={{ textAlign: 'center' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {employeeReport.map((emp, idx) => (
                          <tr key={idx}>
                            <td style={{ color: 'var(--text-secondary)' }}>{idx + 1}</td>
                            <td style={{ fontWeight: 500 }}>{emp.employee_id}</td>
                            <td>{emp.employee}</td>
                            <td style={{ color: 'var(--text-secondary)' }}>{emp.department || '-'}</td>
                            <td style={{ color: 'var(--text-secondary)' }}>{emp.designation || '-'}</td>
                            <td style={{ textAlign: 'right' }}>{formatCurrency(emp.gross)}</td>
                            <td style={{ textAlign: 'right', color: '#dc2626' }}>{formatCurrency(emp.deductions)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(emp.net_salary)}</td>
                            <td style={{ textAlign: 'center' }}>{getStatusBadge(emp.status)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <EmptyState />
              )}

              {activeTab === 'department' && (
                departmentReport && departmentReport.length > 0 ? (
                  <div style={{ padding: 'var(--space-6)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--space-6)' }}>
                    {departmentReport.map((dept, idx) => (
                      <div key={idx} className="detail-card" style={{ marginBottom: 0, padding: 0 }}>
                        <div style={{ padding: 'var(--space-3) var(--space-4)', backgroundColor: 'var(--bg-surface-hover)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <h4 style={{ margin: 0, fontWeight: 600 }}>{dept.department || 'Unassigned'}</h4>
                          <span className="badge badge-info">{dept.employee_count} Employees</span>
                        </div>
                        <div style={{ padding: 'var(--space-4)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--border-color)' }}>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Gross Salary</span>
                            <span style={{ fontWeight: 500 }}>{formatCurrency(dept.gross_salary_total)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--border-color)' }}>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Deductions</span>
                            <span style={{ fontWeight: 500, color: '#dc2626' }}>{formatCurrency(dept.deductions_total || 0)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 'var(--space-3)' }}>
                            <span style={{ fontWeight: 700 }}>Net Salary</span>
                            <span style={{ fontWeight: 700, fontSize: '1.125rem' }}>{formatCurrency(dept.net_salary_total)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <EmptyState />
              )}

              {activeTab === 'deduction' && (
                deductionReport && (summary?.total_deductions > 0) ? (
                  <div style={{ padding: 'var(--space-6)' }}>
                    <div className="table-container" style={{ margin: '0 auto', maxWidth: '600px' }}>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Deduction Type</th>
                            <th style={{ textAlign: 'right' }}>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td style={{ fontWeight: 500 }}>Provident Fund (PF)</td>
                            <td style={{ textAlign: 'right' }}>{formatCurrency(deductionReport.PF_total)}</td>
                          </tr>
                          <tr>
                            <td style={{ fontWeight: 500 }}>ESI</td>
                            <td style={{ textAlign: 'right' }}>{formatCurrency(deductionReport.ESI_total)}</td>
                          </tr>
                          <tr>
                            <td style={{ fontWeight: 500 }}>Professional Tax</td>
                            <td style={{ textAlign: 'right' }}>{formatCurrency(deductionReport.Professional_Tax_total)}</td>
                          </tr>
                          <tr>
                            <td style={{ fontWeight: 500 }}>TDS</td>
                            <td style={{ textAlign: 'right' }}>{formatCurrency(deductionReport.TDS_total)}</td>
                          </tr>
                          <tr>
                            <td style={{ fontWeight: 500 }}>Other Deductions</td>
                            <td style={{ textAlign: 'right' }}>{formatCurrency(deductionReport.other_deductions_total)}</td>
                          </tr>
                          {deductionReport.LOP_total !== undefined && (
                            <tr>
                              <td style={{ fontWeight: 500 }}>Loss of Pay (LOP)</td>
                              <td style={{ textAlign: 'right' }}>{formatCurrency(deductionReport.LOP_total)}</td>
                            </tr>
                          )}
                        </tbody>
                        <tfoot style={{ backgroundColor: 'var(--bg-surface-hover)' }}>
                          <tr>
                            <th style={{ fontWeight: 700 }}>Total Deductions</th>
                            <th style={{ textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>{formatCurrency(summary.total_deductions)}</th>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                ) : <EmptyState />
              )}

              {activeTab === 'employee' && (
                employeeReport && employeeReport.length > 0 ? (
                  <div style={{ padding: 'var(--space-6)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--space-6)' }}>
                    {employeeReport.map((emp, idx) => (
                      <div key={idx} className="detail-card" style={{ marginBottom: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: 'var(--space-4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)' }}>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#e0e7ff', color: '#064E3B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                              {emp.employee.charAt(0)}
                            </div>
                            <div style={{ marginLeft: 'var(--space-3)' }}>
                              <p style={{ margin: 0, fontWeight: 500 }}>{emp.employee}</p>
                              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{emp.employee_id} • {emp.department || 'No Dept'}</p>
                            </div>
                          </div>
                          <div>{getStatusBadge(emp.status)}</div>
                        </div>
                        <div style={{ padding: 'var(--space-4)', backgroundColor: 'var(--bg-surface-hover)', flexGrow: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Gross</span>
                            <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{formatCurrency(emp.gross)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Deductions</span>
                            <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#dc2626' }}>-{formatCurrency(emp.deductions)}</span>
                          </div>
                        </div>
                        <div style={{ padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>Net Salary</span>
                          <span style={{ fontWeight: 700, fontSize: '1.125rem', color: '#16a34a' }}>{formatCurrency(emp.net_salary)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <EmptyState />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
