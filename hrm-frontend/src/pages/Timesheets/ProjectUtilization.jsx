import React, { useEffect, useState } from 'react';
import { timesheetService } from '../../services/timesheetService';
import { IconLayers } from '../../components/common/Icons';

export default function ProjectUtilization() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUtilization();
  }, []);

  const fetchUtilization = async () => {
    try {
      const response = await timesheetService.getUtilization(); 
      // Assuming response contains { billable: X, non_billable: Y, projects: [{ name, hours, percentage_of_max }] }
      setData(response);
    } catch (err) {
      console.error(err);
      // Fallback structure in case of error or empty
      setData({ billable: 0, non_billable: 0, projects: [] });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="detail-card">
        <div className="detail-card-header">
          <div>
            <h2 style={{ fontSize: '1.125rem', fontWeight: '600', color: 'var(--text-primary)' }}>Project Utilization</h2>
          </div>
        </div>
        <div className="table-container" style={{ padding: 'var(--space-6)' }}>
          <div className="state-container"><p>Loading utilization data...</p></div>
        </div>
      </div>
    );
  }

  const total = (data?.billable || 0) + (data?.non_billable || 0);
  const billablePercent = total > 0 ? Math.round((data.billable / total) * 100) : 0;
  const nonBillablePercent = total > 0 ? Math.round((data.non_billable / total) * 100) : 0;

  return (
    <div className="detail-card">
      <div className="detail-card-header">
        <div>
          <h2 style={{ fontSize: '1.125rem', fontWeight: '600', color: 'var(--text-primary)' }}>Project Utilization</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Track hours spent by project and employee.</p>
        </div>
      </div>
      <div className="table-container" style={{ padding: 'var(--space-6)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
          <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: 'var(--space-4)' }}>Billable vs Non-Billable Hours</h3>
            <div style={{ display: 'flex', alignItems: 'flex-end', height: '200px', gap: '10px', paddingTop: '20px' }}>
              <div style={{ flex: 1, backgroundColor: 'var(--primary-color)', height: `${billablePercent || 1}%`, borderRadius: '4px 4px 0 0', position: 'relative', minHeight: '20px' }}>
                <span style={{ position: 'absolute', top: '-25px', width: '100%', textAlign: 'center', fontSize: '0.75rem', fontWeight: '600' }}>{data?.billable || 0}h</span>
                <span style={{ position: 'absolute', bottom: '-25px', width: '100%', textAlign: 'center', fontSize: '0.75rem' }}>Billable</span>
              </div>
              <div style={{ flex: 1, backgroundColor: '#e2e8f0', height: `${nonBillablePercent || 1}%`, borderRadius: '4px 4px 0 0', position: 'relative', minHeight: '20px' }}>
                <span style={{ position: 'absolute', top: '-25px', width: '100%', textAlign: 'center', fontSize: '0.75rem', fontWeight: '600' }}>{data?.non_billable || 0}h</span>
                <span style={{ position: 'absolute', bottom: '-25px', width: '100%', textAlign: 'center', fontSize: '0.75rem' }}>Non-Billable</span>
              </div>
            </div>
          </div>

          <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: 'var(--space-4)' }}>Project Breakdown</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {data?.projects?.length > 0 ? data.projects.map((proj, idx) => {
                // Calculate percentage relative to the highest project to scale the bars nicely
                const maxHours = Math.max(...data.projects.map(p => p.hours || 1));
                const widthPercent = Math.round(((proj.hours || 0) / maxHours) * 100);
                const colors = ['var(--primary-color)', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
                const barColor = colors[idx % colors.length];

                return (
                  <div key={proj.id || idx}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                      <span>{proj.name}</span>
                      <span style={{ fontWeight: '600' }}>{proj.hours} hrs</span>
                    </div>
                    <div style={{ width: '100%', backgroundColor: 'var(--bg-surface-hover)', height: '8px', borderRadius: '4px' }}>
                      <div style={{ width: `${widthPercent}%`, backgroundColor: barColor, height: '100%', borderRadius: '4px' }}></div>
                    </div>
                  </div>
                );
              }) : (
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>No project data available.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
