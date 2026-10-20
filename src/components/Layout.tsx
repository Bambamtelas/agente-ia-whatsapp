import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const pageTitles: Record<string, string> = {
  '/': 'Visão Geral',
  '/agents': 'Agentes IA',
  '/agents/new': 'Novo Agente',
  '/instances': 'Instâncias WhatsApp',
  '/conversations': 'Conversas',
  '/settings': 'Configurações',
};

const Layout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  const getPageTitle = () => {
    const path = location.pathname;
    if (path.startsWith('/agents/') && path !== '/agents/new') return 'Editar Agente';
    return pageTitles[path] || 'Atendimento IA';
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        marginLeft: '260px',
        overflow: 'hidden',
        transition: 'margin 0.3s ease',
      }} className="lg-margin">
        <Topbar
          onMenuClick={() => setSidebarOpen(true)}
          pageTitle={getPageTitle()}
        />

        <main style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
          background: 'var(--bg-primary)',
        }}>
          <div style={{ maxWidth: '1400px', margin: '0 auto', animation: 'fadeIn 0.3s ease-out' }}>
            <Outlet />
          </div>
        </main>
      </div>

      <style>{`
        @media (max-width: 1024px) {
          .lg-margin {
            margin-left: 0 !important;
          }
        }
      `}</style>
    </div>
  );
};

export default Layout;
