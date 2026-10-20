import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Bot,
  Smartphone,
  MessageSquare,
  Settings,
  Zap,
  X,
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Visão Geral' },
  { to: '/agents', icon: Bot, label: 'Agentes IA' },
  { to: '/instances', icon: Smartphone, label: 'Instâncias WhatsApp' },
  { to: '/conversations', icon: MessageSquare, label: 'Conversas' },
  { to: '/settings', icon: Settings, label: 'Configurações' },
];

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          height: '100vh',
          width: '260px',
          background: 'linear-gradient(180deg, #0d1526 0%, #0a0e1a 100%)',
          borderRight: '1px solid rgba(99, 179, 237, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 30,
          transition: 'transform 0.3s ease',
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
        }}
        className="lg:translate-x-0"
      >
        {/* Logo */}
        <div style={{ padding: '24px 20px', borderBottom: '1px solid rgba(99, 179, 237, 0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #25d366, #128c7e)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 20px rgba(37, 211, 102, 0.3)',
            }}>
              <Zap size={20} color="white" fill="white" />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#e8f0fe', lineHeight: 1.2 }}>
                Atendimento IA
              </div>
              <div style={{ fontSize: '11px', color: '#25d366', fontWeight: 500 }}>
                WhatsApp
              </div>
            </div>
            {/* Mobile close button */}
            <button
              onClick={onClose}
              className="lg:hidden"
              style={{
                marginLeft: 'auto',
                background: 'none',
                border: 'none',
                color: '#8fa3c8',
                cursor: 'pointer',
                padding: '4px',
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '16px 12px', overflowY: 'auto' }}>
          <div style={{ fontSize: '11px', color: '#4a6080', fontWeight: 600, letterSpacing: '0.08em', padding: '0 4px 8px', textTransform: 'uppercase' }}>
            Menu Principal
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
                onClick={onClose}
              >
                <Icon size={18} />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Footer */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(99, 179, 237, 0.1)' }}>
          <div style={{
            background: 'rgba(37, 211, 102, 0.08)',
            border: '1px solid rgba(37, 211, 102, 0.15)',
            borderRadius: '8px',
            padding: '10px 12px',
          }}>
            <div style={{ fontSize: '11px', color: '#25d366', fontWeight: 600, marginBottom: '2px' }}>
              ⚡ Evolution API
            </div>
            <div style={{ fontSize: '11px', color: '#4a6080' }}>
              Configure em Configurações
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
