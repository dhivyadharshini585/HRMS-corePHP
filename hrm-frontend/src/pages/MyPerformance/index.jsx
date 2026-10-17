import React, { useState, useEffect } from 'react';
import api from '../../services/api';

function MyPerformance() {
  const [goals, setGoals] = useState([]);
  const [reviews, setReviews] = useState([]);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    const empId = user?.employee_id; // Assume we have this or get it from /user API
    
    // Using generic endpoints since backend handles filtering based on user permissions
    api.get('/performance-goals').then(res => setGoals(res.data)).catch(console.error);
    api.get('/performance-reviews').then(res => setReviews(res.data)).catch(console.error);
  }, []);

  return (
    <div className="page-container">
      <h2>My Performance</h2>
      
      <h3>My Goals</h3>
      <table className="data-table">
        <thead>
          <tr>
            <th>Goal</th>
            <th>Target</th>
            <th>Progress</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {goals.map(g => (
            <tr key={g.id}>
              <td>{g.goal}</td>
              <td>{g.target}</td>
              <td>{g.progress}%</td>
              <td>{g.status}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>My Reviews</h3>
      <table className="data-table">
        <thead>
          <tr>
            <th>Cycle</th>
            <th>Reviewer</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {reviews.map(r => (
            <tr key={r.id}>
              <td>{r.cycle?.name}</td>
              <td>{r.reviewer?.first_name} {r.reviewer?.last_name}</td>
              <td>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default MyPerformance;
