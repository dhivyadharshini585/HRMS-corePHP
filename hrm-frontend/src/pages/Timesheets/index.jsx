import React from 'react';
import WeeklyTimesheet from './WeeklyTimesheet';
import ProjectUtilization from './ProjectUtilization';

export default function Timesheets() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <WeeklyTimesheet />
      <ProjectUtilization />
    </div>
  );
}
