import React, { useEffect, useState } from 'react';
import { timesheetService } from '../../services/timesheetService';
import { useAuthContext } from '../../context/AuthContext';
import CustomSelect from '../../components/common/CustomSelect';

export default function WeeklyTimesheet() {
  const { user } = useAuthContext();
  const [projects, setProjects] = useState([]);
  const [weekDates, setWeekDates] = useState([]);
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    fetchProjects();
    generateWeekDates();
  }, []);

  const fetchProjects = async () => {
    try {
      const data = await timesheetService.getProjects();
      setProjects(data);
    } catch (err) {
      console.error(err);
    }
  };

  const generateWeekDates = () => {
    const dates = [];
    const curr = new Date();
    const first = curr.getDate() - curr.getDay() + 1; // Monday
    for (let i = 0; i < 5; i++) {
      const next = new Date(curr.setDate(first + i));
      dates.push({
        label: next.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        iso: next.toISOString().split('T')[0]
      });
    }
    setWeekDates(dates);
    // Initialize one empty row
    setEntries([{ id: Date.now(), project_id: '', task_description: '', hours: [0, 0, 0, 0, 0] }]);
  };

  const handleAddRow = () => {
    setEntries([...entries, { id: Date.now(), project_id: '', task_description: '', hours: [0, 0, 0, 0, 0] }]);
  };

  const handleEntryChange = (index, field, value) => {
    const newEntries = [...entries];
    if (field.startsWith('hours_')) {
      const dayIndex = parseInt(field.split('_')[1], 10);
      newEntries[index].hours[dayIndex] = parseFloat(value) || 0;
    } else {
      newEntries[index][field] = value;
    }
    setEntries(newEntries);
  };

  const handleSubmit = async () => {
    const payloadEntries = [];
    
    entries.forEach(row => {
      if (!row.project_id) return;
      row.hours.forEach((h, i) => {
        if (h > 0) {
          payloadEntries.push({
            project_id: row.project_id,
            date: weekDates[i].iso,
            hours: h,
            billable_hours: h, // simplified logic
            non_billable_hours: 0,
            client: row.task_description
          });
        }
      });
    });

    if (payloadEntries.length === 0) {
      alert("No valid entries to submit.");
      return;
    }

    try {
      const employeeId = user?.employee?.id || user?.employee_id;
      const payload = { entries: payloadEntries };
      if (employeeId) {
        payload.employee_id = employeeId;
      }
      await timesheetService.createTimesheet(payload);
      alert("Timesheets submitted successfully!");
      generateWeekDates(); // reset
    } catch (err) {
      console.error(err);
      alert("Failed to submit timesheets");
    }
  };

  return (
    <div className="detail-card">
      <div className="detail-card-header">
        <div>
          <h2 style={{ fontSize: '1.125rem', fontWeight: '600', color: 'var(--text-primary)' }}>Weekly Timesheet</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Log your hours against projects and tasks.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handleAddRow} className="btn-secondary">Add Row</button>
          <button onClick={handleSubmit} className="btn-primary">Submit Timesheet</button>
        </div>
      </div>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Task</th>
              {weekDates.map(d => <th key={d.iso} style={{ textAlign: 'center' }}>{d.label}</th>)}
              <th style={{ textAlign: 'center' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((row, idx) => {
              const rowTotal = row.hours.reduce((sum, val) => sum + val, 0);
              return (
                <tr key={row.id}>
                  <td>
                    <select 
                      className="filter-select"
                      value={row.project_id}
                      onChange={(e) => handleEntryChange(idx, 'project_id', e.target.value)}
                    >
                      <option value="">Select Project...</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <input 
                      type="text" 
                      className="filter-input" 
                      placeholder="Task description..." 
                      value={row.task_description}
                      onChange={(e) => handleEntryChange(idx, 'task_description', e.target.value)}
                    />
                  </td>
                  {row.hours.map((h, i) => (
                    <td key={i} style={{ textAlign: 'center' }}>
                      <input 
                        type="number" 
                        min="0" max="24"
                        className="filter-input" 
                        style={{ width: '60px', textAlign: 'center' }} 
                        value={h || ''}
                        onChange={(e) => handleEntryChange(idx, `hours_${i}`, e.target.value)}
                      />
                    </td>
                  ))}
                  <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{rowTotal}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
