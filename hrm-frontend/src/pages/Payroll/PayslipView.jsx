import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getPayslip } from '../../services/payrollService';

export default function PayslipView() {
  const { id } = useParams();
  const [payslip, setPayslip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPayslip = async () => {
      try {
        const res = await getPayslip(id);
        setPayslip(res.data);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to fetch payslip.');
      } finally {
        setLoading(false);
      }
    };
    fetchPayslip();
  }, [id]);

  if (loading) return <div className="state-container">Loading payslip...</div>;
  if (error) return <div className="state-container" style={{ color: 'var(--danger-color)' }}>{error}</div>;
  if (!payslip) return <div className="state-container">Payslip not found.</div>;

  const { payroll } = payslip;
  const { employee } = payroll;
  const breakdown = Array.isArray(payroll.component_breakdown)
    ? payroll.component_breakdown
    : Object.values(payroll.component_breakdown || {});

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Payslip: {payslip.payslip_number}</h1>
        </div>
        <button onClick={() => window.print()} className="btn-primary">
          Print Payslip
        </button>
      </div>

      <div className="detail-card printable-area" style={{ padding: 'var(--space-8)' }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-8)', borderBottom: '1px solid var(--border-color)', paddingBottom: 'var(--space-4)' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 var(--space-2) 0' }}>Acme Corp Ltd.</h2>
          <p style={{ color: 'var(--text-secondary)', margin: '0 0 var(--space-4) 0' }}>123 Tech Park, Bangalore, India</p>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Payslip for {payroll.month}/{payroll.year}</h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-8)', marginBottom: 'var(--space-8)', borderBottom: '1px solid var(--border-color)', paddingBottom: 'var(--space-4)' }}>
          <div>
            <p style={{ margin: '0 0 var(--space-2) 0' }}><strong style={{ fontWeight: 600 }}>Employee Name:</strong> {employee.first_name} {employee.last_name}</p>
            <p style={{ margin: '0 0 var(--space-2) 0' }}><strong style={{ fontWeight: 600 }}>Employee ID:</strong> {employee.employee_id}</p>
            {payroll.total_working_minutes != null && (
              <p style={{ margin: 0 }}><strong style={{ fontWeight: 600 }}>Working Hours:</strong> {Math.floor(payroll.total_working_minutes / 60)}h {payroll.total_working_minutes % 60}m</p>
            )}
          </div>
          <div>
            <p style={{ margin: '0 0 var(--space-2) 0' }}><strong style={{ fontWeight: 600 }}>Department:</strong> {employee.department?.name || 'N/A'}</p>
            <p style={{ margin: '0 0 var(--space-2) 0' }}><strong style={{ fontWeight: 600 }}>Designation:</strong> {employee.designation?.name || 'N/A'}</p>
            {payroll.total_overtime_minutes != null && (
              <p style={{ margin: 0 }}><strong style={{ fontWeight: 600 }}>Overtime Hours:</strong> {Math.floor(payroll.total_overtime_minutes / 60)}h {payroll.total_overtime_minutes % 60}m</p>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-8)', marginBottom: 'var(--space-8)' }}>
          {/* Earnings */}
          <div>
            <h4 style={{ fontSize: '1.125rem', fontWeight: 700, borderBottom: '1px solid var(--border-color)', paddingBottom: 'var(--space-2)', marginBottom: 'var(--space-4)', backgroundColor: 'var(--bg-surface-hover)', padding: 'var(--space-2)' }}>Earnings</h4>
            {breakdown
              .filter(c => c.type === 'Earning')
              .map((c, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2)' }}>
                  <span>{c.name}</span>
                  <span>₹{parseFloat(c.amount).toFixed(2)}</span>
                </div>
              ))}
            {(breakdown.filter(c => c.type === 'Earning').length === 0) && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2)' }}>
                  <span>Basic Salary</span>
                  <span>₹{parseFloat(payroll.basic_salary).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2)' }}>
                  <span>Other Earnings</span>
                  <span>₹{(parseFloat(payroll.gross_earnings) - parseFloat(payroll.basic_salary)).toFixed(2)}</span>
                </div>
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-3) var(--space-2)', marginTop: 'var(--space-4)', borderTop: '1px solid var(--border-color)', fontWeight: 700 }}>
              <span>Total Earnings (Gross)</span>
              <span>₹{parseFloat(payroll.gross_earnings).toFixed(2)}</span>
            </div>
          </div>

          {/* Deductions */}
          <div>
            <h4 style={{ fontSize: '1.125rem', fontWeight: 700, borderBottom: '1px solid var(--border-color)', paddingBottom: 'var(--space-2)', marginBottom: 'var(--space-4)', backgroundColor: 'var(--bg-surface-hover)', padding: 'var(--space-2)' }}>Deductions</h4>
            {breakdown
              .filter(c => c.type === 'Deduction')
              .map((c, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2)' }}>
                  <span>{c.name}</span>
                  <span>₹{parseFloat(c.amount).toFixed(2)}</span>
                </div>
              ))}
            {(breakdown.filter(c => c.type === 'Deduction').length === 0) && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2)' }}>
                <span>Standard Deductions</span>
                <span>₹{parseFloat(payroll.total_deductions).toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-3) var(--space-2)', marginTop: 'var(--space-4)', borderTop: '1px solid var(--border-color)', fontWeight: 700 }}>
              <span>Total Deductions</span>
              <span>₹{parseFloat(payroll.total_deductions).toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div style={{ backgroundColor: '#f0fdf4', padding: 'var(--space-4)', border: '1px solid #bbf7d0', textAlign: 'center', borderRadius: 'var(--radius-md)' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#166534', margin: '0 0 var(--space-1) 0' }}>Net Salary: ₹{parseFloat(payroll.net_salary).toFixed(2)}</h3>
          <p style={{ color: '#15803d', fontSize: '0.875rem', margin: 0 }}>(Gross Earnings - Total Deductions)</p>
        </div>
        
        <div style={{ marginTop: 'var(--space-12)', fontSize: '0.875rem', color: 'var(--text-muted)', textAlign: 'center' }}>
          This is a computer generated document. No signature is required.
        </div>
      </div>
    </div>
  );
}
