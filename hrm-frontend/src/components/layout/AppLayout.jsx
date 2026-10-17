import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import HRAssistantChat from '../HRAssistantChat';
import '../../styles/layout.css';

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleMobileMenu = () => {
    setMobileOpen(!mobileOpen);
  };

  return (
    <div className="app-layout">
      <Sidebar 
        collapsed={collapsed} 
        setCollapsed={setCollapsed} 
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />
      
      <div className="app-main-wrapper">
        <Header toggleMobileMenu={toggleMobileMenu} />
        
        <main className="app-main-content">
          <Outlet />
        </main>
      </div>
      <HRAssistantChat />
    </div>
  );
}
