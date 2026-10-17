import React, { useEffect, useState } from 'react';
import { helpdeskService } from '../../services/helpdeskService';
import { IconSearch, IconPlus } from '../../components/common/Icons';
import CustomSelect from '../../components/common/CustomSelect';

export default function TicketList() {
  const [tickets, setTickets] = useState([]);
  const [statusCounts, setStatusCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Open');
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  // New Ticket Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [ticketForm, setTicketForm] = useState({
    problem: '',
    category: 'IT Support',
    priority: 'Medium',
  });

  const tabs = ['Open', 'Assigned', 'In Progress', 'Waiting', 'Resolved', 'Closed'];

  useEffect(() => {
    loadTickets();
    loadStatusCounts();
  }, []);

  const loadTickets = async () => {
    setLoading(true);
    try {
      const data = await helpdeskService.getTickets();
      setTickets(Array.isArray(data) ? data : data.data || []);
    } catch (err) {
      console.error('Failed to load tickets', err);
      setError('Failed to load tickets.');
    } finally {
      setLoading(false);
    }
  };

  const loadStatusCounts = async () => {
    try {
      const counts = await helpdeskService.getStatusCounts();
      setStatusCounts(counts || {});
    } catch (err) {
      console.error('Failed to load status counts', err);
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      await helpdeskService.updateTicketStatus(id, newStatus);
      setSuccessMsg('Ticket status updated.');
      loadTickets();
      loadStatusCounts();
    } catch (err) {
      console.error('Failed to update status', err);
      alert(err.response?.data?.message || 'Failed to update ticket status.');
    }
  };

  const openCreateModal = () => {
    setError(null);
    setSuccessMsg('');
    setTicketForm({
      problem: '',
      category: 'IT Support',
      priority: 'Medium',
    });
    setShowCreateModal(true);
  };

  const handleTicketSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (ticketForm.problem.trim().length < 5) {
      setError('Problem description must be at least 5 characters long.');
      return;
    }

    try {
      const created = await helpdeskService.createTicket(ticketForm);
      setSuccessMsg(`Support ticket ${created.ticket_number || ''} submitted successfully.`);
      setShowCreateModal(false);
      loadTickets();
      loadStatusCounts();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to submit support ticket.');
    }
  };

  const filteredTickets = tickets.filter(t =>
    t.status === activeTab &&
    (t.ticket_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
     t.problem?.toLowerCase().includes(searchTerm.toLowerCase()) ||
     t.category?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="detail-card">
      <div className="detail-card-header" style={{ flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h2 style={{ fontSize: '1.125rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>
            IT Helpdesk
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Manage and resolve internal IT support tickets.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <div className="search-bar" style={{ position: 'relative' }}>
            <IconSearch width="16" height="16" style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search tickets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="filter-input"
              style={{ paddingLeft: '32px' }}
            />
          </div>
          <button onClick={openCreateModal} className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <IconPlus width="16" height="16" />
            <span>New Ticket</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div style={{ margin: 'var(--space-3) var(--space-6)', padding: 'var(--space-3)', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 'var(--radius-md)', color: '#991b1b', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}
      {successMsg && (
        <div style={{ margin: 'var(--space-3) var(--space-6)', padding: 'var(--space-3)', backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: 'var(--radius-md)', color: '#166534', fontSize: '0.875rem' }}>
          {successMsg}
        </div>
      )}

      {/* Status Tabs with Counts */}
      <div style={{ padding: '0 var(--space-6)', display: 'flex', gap: 'var(--space-4)', borderBottom: '1px solid var(--border-color)', overflowX: 'auto' }}>
        {tabs.map(tab => {
          const count = statusCounts[tab] !== undefined ? statusCounts[tab] : '';
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: 'var(--space-3) var(--space-1)',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab ? '2px solid var(--primary-color)' : '2px solid transparent',
                color: activeTab === tab ? 'var(--primary-color)' : 'var(--text-secondary)',
                fontWeight: activeTab === tab ? '600' : '400',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {tab} {count !== '' ? `(${count})` : ''}
            </button>
          );
        })}
      </div>

      <div className="table-container" style={{ borderTop: 'none', borderRadius: '0 0 var(--radius-lg) var(--radius-lg)' }}>
        {loading ? (
          <div className="state-container"><p>Loading tickets...</p></div>
        ) : filteredTickets.length === 0 ? (
          <div className="state-container"><p>No {activeTab.toLowerCase()} tickets found.</p></div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Ticket #</th>
                <th>Problem Description</th>
                <th>Category</th>
                <th>Priority</th>
                <th>Assigned To</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredTickets.map(ticket => (
                <tr key={ticket.id}>
                  <td style={{ fontWeight: '600', color: 'var(--primary-color)' }}>{ticket.ticket_number}</td>
                  <td>{ticket.problem}</td>
                  <td>{ticket.category || 'General'}</td>
                  <td>
                    <span className={`badge badge-${ticket.priority === 'Critical' || ticket.priority === 'High' ? 'danger' : ticket.priority === 'Medium' ? 'warning' : 'info'}`}>
                      {ticket.priority}
                    </span>
                  </td>
                  <td>{ticket.assignee ? ticket.assignee.name : (ticket.assigned_to_name || 'Unassigned')}</td>
                  <td>
                    <CustomSelect
                      className="filter-select"
                      style={{ padding: '0.25rem 2rem 0.25rem 0.5rem', fontSize: '0.875rem' }}
                      value={ticket.status}
                      onChange={(e) => handleStatusChange(ticket.id, e.target.value)}
                    >
                      {tabs.map(statusOption => (
                        <option key={statusOption} value={statusOption}>{statusOption}</option>
                      ))}
                    </CustomSelect>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* New Ticket Modal */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 'var(--space-4)' }}>
          <div className="detail-card" style={{ width: '100%', maxWidth: '520px', backgroundColor: 'var(--bg-surface)' }}>
            <div className="detail-card-header">
              <h3 style={{ fontSize: '1.125rem', fontWeight: '600' }}>
                Submit Support Ticket
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="btn-secondary" style={{ padding: '0.25rem 0.5rem' }}>✕</button>
            </div>
            <form onSubmit={handleTicketSubmit} style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '4px' }}>Problem Description *</label>
                <textarea
                  required
                  rows="4"
                  className="filter-input"
                  placeholder="Describe the issue in detail (min 5 characters)..."
                  style={{ width: '100%', resize: 'vertical' }}
                  value={ticketForm.problem}
                  onChange={(e) => setTicketForm({ ...ticketForm, problem: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '4px' }}>Category</label>
                  <CustomSelect
                    className="filter-select"
                    style={{ width: '100%' }}
                    value={ticketForm.category}
                    onChange={(e) => setTicketForm({ ...ticketForm, category: e.target.value })}
                  >
                    <option value="IT Support">IT Support</option>
                    <option value="Hardware">Hardware</option>
                    <option value="Software">Software</option>
                    <option value="Network">Network</option>
                    <option value="Access">Access</option>
                    <option value="Other">Other</option>
                  </CustomSelect>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '4px' }}>Priority</label>
                  <CustomSelect
                    className="filter-select"
                    style={{ width: '100%' }}
                    value={ticketForm.priority}
                    onChange={(e) => setTicketForm({ ...ticketForm, priority: e.target.value })}
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </CustomSelect>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Submit Ticket</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
