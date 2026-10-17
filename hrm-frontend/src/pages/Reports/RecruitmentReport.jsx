import React, { useState, useEffect, useCallback } from 'react';
import reportService from '../../services/reportService';
import { ROUTES } from '../../constants/routes';
import CustomSelect from '../../components/common/CustomSelect';

// ─── Status badge helper ───────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    Hired: 'status-active', Completed: 'status-active', Verified: 'status-active',
    Shortlisted: 'status-info', 'In Progress': 'status-info', Interview: 'status-info',
    Selected: 'status-info', Scheduled: 'status-info',
    Rejected: 'status-inactive', Cancelled: 'status-inactive', Withdrawn: 'status-inactive',
    New: 'status-warning', 'No Show': 'status-warning', Draft: 'status-warning',
  };
  return <span className={`status-badge ${map[status] || 'status-warning'}`}>{status}</span>;
}

// ─── Summary card ──────────────────────────────────────────────────────────────
function SummaryCard({ label, value, color }) {
  return (
    <div className="detail-card" style={{ textAlign: 'center', padding: '20px', borderTop: `4px solid ${color || '#075E4B'}` }}>
      <div style={{ fontSize: '2rem', fontWeight: '700', color: color || '#075E4B' }}>{value ?? '—'}</div>
      <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '4px' }}>{label}</div>
    </div>
  );
}

// ─── Pagination ────────────────────────────────────────────────────────────────
function Pagination({ meta, onPageChange }) {
  if (!meta || meta.last_page <= 1) return null;
  return (
    <div className="pagination-container" style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '16px' }}>
      <button className="btn btn-secondary btn-sm" disabled={meta.current_page === 1}
        onClick={() => onPageChange(meta.current_page - 1)}>Prev</button>
      <span style={{ padding: '6px 12px', fontSize: '0.875rem' }}>
        Page {meta.current_page} of {meta.last_page} ({meta.total} total)
      </span>
      <button className="btn btn-secondary btn-sm" disabled={meta.current_page === meta.last_page}
        onClick={() => onPageChange(meta.current_page + 1)}>Next</button>
    </div>
  );
}

// ─── Job filter ────────────────────────────────────────────────────────────────
function DateJobFilters({ filters, onChange, jobOptions = [] }) {
  return (
    <div className="filter-section" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
      <div className="form-group" style={{ margin: 0 }}>
        <label>Date From</label>
        <input type="date" className="form-control" value={filters.date_from || ''}
          onChange={e => onChange({ ...filters, date_from: e.target.value })} />
      </div>
      <div className="form-group" style={{ margin: 0 }}>
        <label>Date To</label>
        <input type="date" className="form-control" value={filters.date_to || ''}
          onChange={e => onChange({ ...filters, date_to: e.target.value })} />
      </div>
      {jobOptions.length > 0 && (
        <div className="form-group" style={{ margin: 0 }}>
          <label>Job Opening</label>
          <CustomSelect className="form-control" value={filters.job_opening_id || ''}
            onChange={e => onChange({ ...filters, job_opening_id: e.target.value })}>
            <option value="">All Jobs</option>
            {jobOptions.map(j => <option key={j.id} value={j.id}>{j.title} ({j.job_code})</option>)}
          </CustomSelect>
        </div>
      )}
      <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'flex-end' }}>
        <button className="btn btn-secondary" onClick={() => onChange({ date_from: '', date_to: '', job_opening_id: '' })}>
          Clear Filters
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
const TABS = [
  { key: 'applications', label: 'Applications' },
  { key: 'shortlisted',  label: 'Shortlisted' },
  { key: 'interviews',   label: 'Interviews' },
  { key: 'selected',     label: 'Selected / Hired' },
  { key: 'timeToHire',   label: 'Time to Hire' },
  { key: 'hiringCost',   label: 'Hiring Cost' },
];

export default function RecruitmentReport() {
  const [activeTab, setActiveTab] = useState('applications');
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [page,      setPage]      = useState(1);
  const [filters,   setFilters]   = useState({ date_from: '', date_to: '', job_opening_id: '' });

  // Extra filter state per tab
  const [statusFilter,      setStatusFilter]      = useState('');
  const [interviewerFilter, setInterviewerFilter] = useState('');

  const fetchData = useCallback(async (tab, pg, f, sf, iF) => {
    setLoading(true);
    setError('');
    setData(null);
    try {
      const params = { page: pg, per_page: 10 };
      if (f.date_from)       params.date_from       = f.date_from;
      if (f.date_to)         params.date_to         = f.date_to;
      if (f.job_opening_id)  params.job_opening_id  = f.job_opening_id;
      if (sf)                params.status          = sf;
      if (iF)                params.interviewer_employee_id = iF;

      let res;
      switch (tab) {
        case 'applications': res = await reportService.getRecruitmentApplications(params); break;
        case 'shortlisted':  res = await reportService.getRecruitmentShortlisted(params);  break;
        case 'interviews':   res = await reportService.getRecruitmentInterviews(params);   break;
        case 'selected':     res = await reportService.getRecruitmentSelected(params);     break;
        case 'timeToHire':   res = await reportService.getRecruitmentTimeToHire(params);   break;
        case 'hiringCost':   res = await reportService.getRecruitmentHiringCost(params);   break;
        default: res = null;
      }
      setData(res);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load report data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(activeTab, page, filters, statusFilter, interviewerFilter);
  }, [activeTab, page, filters, statusFilter, interviewerFilter, fetchData]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setPage(1);
    setFilters({ date_from: '', date_to: '', job_opening_id: '' });
    setStatusFilter('');
    setInterviewerFilter('');
  };

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
    setPage(1);
  };

  // ── Applications Tab ──────────────────────────────────────────────────────
  function renderApplications() {
    const summary = data?.summary || {};
    const byStatus = summary.by_status || {};
    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px', marginBottom: '20px' }}>
          <SummaryCard label="Total Applications" value={summary.total} color="#075E4B" />
          {Object.entries(byStatus).map(([st, cnt]) => (
            <SummaryCard key={st} label={st} value={cnt} color={st === 'Hired' ? '#10b981' : st === 'Rejected' ? '#ef4444' : '#6366f1'} />
          ))}
        </div>
        <div className="form-group" style={{ marginBottom: '12px' }}>
          <label>Filter by Status</label>
          <CustomSelect className="form-control" style={{ maxWidth: '200px' }} value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">All Statuses</option>
            {['New','Screening','Shortlisted','Rejected','Hired'].map(s =>
              <option key={s} value={s}>{s}</option>
            )}
          </CustomSelect>
        </div>
        {renderCandidateTable(['Name', 'Code', 'Job', 'Status', 'Applied'])}
      </>
    );
  }

  // ── Shortlisted Tab ───────────────────────────────────────────────────────
  function renderShortlisted() {
    const summary = data?.summary || {};
    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '20px' }}>
          <SummaryCard label="Total Shortlisted" value={summary.total} color="#6366f1" />
        </div>
        {renderCandidateTable(['Name', 'Code', 'Job', 'Status', 'Applied', 'Shortlisted At'])}
      </>
    );
  }

  // ── Interviews Tab ────────────────────────────────────────────────────────
  function renderInterviews() {
    const summary = data?.summary || {};
    const byStatus = summary.by_status || {};
    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px', marginBottom: '20px' }}>
          <SummaryCard label="Total Interviews" value={summary.total} color="#8b5cf6" />
          {Object.entries(byStatus).map(([st, cnt]) => (
            <SummaryCard key={st} label={st} value={cnt}
              color={st === 'Completed' ? '#10b981' : st === 'Cancelled' ? '#ef4444' : '#f59e0b'} />
          ))}
        </div>
        <div className="form-group" style={{ marginBottom: '12px' }}>
          <label>Filter by Status</label>
          <CustomSelect className="form-control" style={{ maxWidth: '200px' }} value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">All Statuses</option>
            {['Scheduled','Completed','Cancelled','No Show'].map(s =>
              <option key={s} value={s}>{s}</option>
            )}
          </CustomSelect>
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead><tr><th>Candidate</th><th>Job</th><th>Round</th><th>Type</th><th>Mode</th><th>Scheduled At</th><th>Status</th></tr></thead>
            <tbody>
              {(data?.data || []).length === 0
                ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: '#6b7280' }}>No interviews found.</td></tr>
                : (data?.data || []).map(item => (
                  <tr key={item.id}>
                    <td className="font-medium">{item.candidate?.first_name} {item.candidate?.last_name}</td>
                    <td><span className="text-sm">{item.job_opening?.title}</span></td>
                    <td>Round {item.interview_round}</td>
                    <td>{item.interview_type}</td>
                    <td>{item.mode}</td>
                    <td className="text-sm">{item.scheduled_at ? new Date(item.scheduled_at).toLocaleString() : '—'}</td>
                    <td><StatusBadge status={item.status} /></td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </>
    );
  }

  // ── Selected / Hired Tab ──────────────────────────────────────────────────
  function renderSelected() {
    const summary = data?.summary || {};
    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '20px' }}>
          <SummaryCard label="Total Hired" value={summary.total} color="#10b981" />
        </div>
        {renderCandidateTable(['Name', 'Code', 'Job', 'Status', 'Applied', 'Hired At'])}
      </>
    );
  }

  // ── Time-to-Hire Tab ──────────────────────────────────────────────────────
  function renderTimeToHire() {
    const summary = data?.summary || {};
    return (
      <>
        {data?.calculation_note && (
          <div className="alert-info" style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '0.875rem', color: '#1e40af' }}>
            <strong>ℹ️ Calculation Method:</strong> {data.calculation_note}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginBottom: '20px' }}>
          <SummaryCard label="Total Hired" value={summary.total_hired} color="#10b981" />
          <SummaryCard label="Avg Days to Hire" value={summary.avg_days_to_hire ?? '—'} color="#075E4B" />
          <SummaryCard label="Fastest Hire (days)" value={summary.min_days_to_hire ?? '—'} color="#6366f1" />
          <SummaryCard label="Longest Hire (days)" value={summary.max_days_to_hire ?? '—'} color="#f59e0b" />
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead><tr><th>Candidate</th><th>Code</th><th>Job</th><th>Applied</th><th>Hired At</th><th>Days to Hire</th></tr></thead>
            <tbody>
              {(data?.data || []).length === 0
                ? <tr><td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: '#6b7280' }}>No hired candidates found.</td></tr>
                : (data?.data || []).map(item => (
                  <tr key={item.id}>
                    <td className="font-medium">{item.first_name} {item.last_name}</td>
                    <td className="text-sm">{item.candidate_code}</td>
                    <td className="text-sm">{item.job_opening?.title}</td>
                    <td className="text-sm">{new Date(item.created_at).toLocaleDateString()}</td>
                    <td className="text-sm">{item.hired_at ? new Date(item.hired_at).toLocaleDateString() : '—'}</td>
                    <td>
                      {item.days_to_hire != null
                        ? <span style={{ fontWeight: 700, color: item.days_to_hire <= 14 ? '#10b981' : item.days_to_hire <= 30 ? '#f59e0b' : '#ef4444' }}>{item.days_to_hire} days</span>
                        : '—'}
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </>
    );
  }

  // ── Hiring Cost Tab ───────────────────────────────────────────────────────
  function renderHiringCost() {
    const summary = data?.summary || {};
    return (
      <>
        {data?.disclaimer && (
          <div className="alert-info" style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '0.875rem', color: '#1e40af' }}>
            <strong>ℹ️ Reporting Note:</strong> {data.disclaimer}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '20px' }}>
          <SummaryCard label="Accepted Offers" value={summary.total_accepted_offers} color="#10b981" />
          <SummaryCard label="Total Offered Salary" value={summary.total_offered_salary != null ? `₹${Number(summary.total_offered_salary).toLocaleString()}` : '—'} color="#075E4B" />
          <SummaryCard label="Avg Offered Salary" value={summary.avg_offered_salary != null ? `₹${Number(summary.avg_offered_salary).toLocaleString()}` : '—'} color="#6366f1" />
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead><tr><th>Candidate</th><th>Job</th><th>Offer Code</th><th>Offer Date</th><th>Salary</th><th>Frequency</th></tr></thead>
            <tbody>
              {(data?.data || []).length === 0
                ? <tr><td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: '#6b7280' }}>No accepted offers found.</td></tr>
                : (data?.data || []).map(item => (
                  <tr key={item.id}>
                    <td className="font-medium">{item.candidate?.first_name} {item.candidate?.last_name}</td>
                    <td className="text-sm">{item.job_opening?.title}</td>
                    <td className="text-sm">{item.offer_code}</td>
                    <td className="text-sm">{item.offer_date ? new Date(item.offer_date).toLocaleDateString() : '—'}</td>
                    <td><strong>{item.salary_currency} {Number(item.salary_amount).toLocaleString()}</strong></td>
                    <td className="text-sm">{item.salary_frequency}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </>
    );
  }

  // ── Shared candidate table ────────────────────────────────────────────────
  function renderCandidateTable(cols) {
    const items = data?.data || [];
    return (
      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              {cols.map(c => <th key={c}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {items.length === 0
              ? <tr><td colSpan={cols.length} style={{ textAlign: 'center', padding: '24px', color: '#6b7280' }}>No records found.</td></tr>
              : items.map(item => (
                <tr key={item.id}>
                  <td className="font-medium">{item.first_name} {item.last_name}</td>
                  {cols.includes('Code') && <td className="text-sm">{item.candidate_code}</td>}
                  {cols.includes('Job') && <td className="text-sm">{item.job_opening?.title || '—'}</td>}
                  {cols.includes('Status') && <td><StatusBadge status={item.status} /></td>}
                  {cols.includes('Applied') && <td className="text-sm">{new Date(item.created_at).toLocaleDateString()}</td>}
                  {cols.includes('Shortlisted At') && <td className="text-sm">{item.shortlisted_at ? new Date(item.shortlisted_at).toLocaleDateString() : '—'}</td>}
                  {cols.includes('Hired At') && <td className="text-sm">{item.hired_at ? new Date(item.hired_at).toLocaleDateString() : '—'}</td>}
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    );
  }

  function renderTabContent() {
    if (loading) return <div className="loading-state"><div className="spinner"></div><p>Loading report...</p></div>;
    if (error)   return <div className="alert alert-error">{error}</div>;
    if (!data)   return null;

    switch (activeTab) {
      case 'applications': return renderApplications();
      case 'shortlisted':  return renderShortlisted();
      case 'interviews':   return renderInterviews();
      case 'selected':     return renderSelected();
      case 'timeToHire':   return renderTimeToHire();
      case 'hiringCost':   return renderHiringCost();
      default: return null;
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="header-content">
          <h1>Recruitment Reports</h1>
          <p>Analyse your recruitment pipeline — applications, interviews, hires, and time-to-hire metrics.</p>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="detail-card" style={{ marginBottom: '0', borderBottom: 'none', borderRadius: '8px 8px 0 0' }}>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              className={`btn btn-sm ${activeTab === tab.key ? 'btn-primary' : 'btn-secondary'}`}
              style={{ borderRadius: '6px 6px 0 0', marginBottom: 0 }}
              onClick={() => handleTabChange(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content card */}
      <div className="detail-card" style={{ borderRadius: '0 0 8px 8px', borderTop: '1px solid #e5e7eb' }}>
        {/* Shared date + job filters (not for hiringCost which shows offer_date already) */}
        <DateJobFilters filters={filters} onChange={handleFilterChange} />

        {renderTabContent()}

        <Pagination meta={data?.meta} onPageChange={setPage} />
      </div>
    </div>
  );
}
