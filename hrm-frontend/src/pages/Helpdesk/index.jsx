import React from 'react';
import TicketList from './TicketList';

export default function Helpdesk() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <TicketList />
    </div>
  );
}
