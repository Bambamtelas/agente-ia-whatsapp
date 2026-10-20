import React from 'react';
import { Menu, Bell, Wifi, WifiOff } from 'lucide-react';
import { isSupabaseConfigured } from '../lib/supabase';

interface TopbarProps {
  onMenuClick: () => void;
  pageTitle: string;
}

const Topbar: React.FC<TopbarProps> = ({ onMenuClick, pageTitle }) => {
  return (
    <header style={{
      height: '64px',
      background: 'rgba(10, 14, 26, 0.9)',
      borderBottom: '1px solid rgba(99, 179, 237, 0.1)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 24px',
      gap: '16px',
      backdropFilter: 'blur(12px)',
      position: 'sticky',
      top: 0,
      zIndex: 10,
    }}>
      {/* Mobile menu button */}
      <button
        onClick={onMenuClick}
        className="lg:hidden"
        style={{
          background: 'none',
          border: 'none',
          color: '#8fa3c8',
          cursor: 'pointer',
          padding: '8px',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Menu size={20} />
      </button>

      {/* Page title */}
      <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#e8f0fe', flex: 1 }}>
        {pageTitle}
      </h1>

      {/* Status and actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Supabase status indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: isSupabaseConfigured
            ? 'rgba(16, 185, 129, 0.1)'
            : 'rgba(245, 158, 11, 0.1)',
          border: `1px solid ${isSupabaseConfigured ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)'}`,
          borderRadius: '20px',
          padding: '4px 10px',
          fontSize: '12px',
        }}>
          {isSupabaseConfigured ? (
            <>
              <Wifi size={12} color="#10b981" />
              <span style={{ color: '#10b981', fontWeight: 500 }}>Supabase</span>
            </>
          ) : (
            <>
              <WifiOff size={12} color="#f59e0b" />
              <span style={{ color: '#f59e0b', fontWeight: 500 }}>Demo</span>
            </>
          )}
        </div>

        {/* Notification bell */}
        <button style={{
          background: 'rgba(19, 28, 53, 0.8)',
          border: '1px solid rgba(99, 179, 237, 0.12)',
          borderRadius: '8px',
          padding: '8px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          color: '#8fa3c8',
          transition: 'all 0.2s',
        }}>
          <Bell size={18} />
        </button>

        {/* User avatar */}
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px',
          fontWeight: 700,
          color: 'white',
          cursor: 'pointer',
        }}>
          A
        </div>
      </div>
    </header>
  );
};

export default Topbar;
