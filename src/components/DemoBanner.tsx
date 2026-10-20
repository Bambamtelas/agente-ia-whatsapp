import React from 'react';

interface DemoBannerProps {
  message?: string;
}

const DemoBanner: React.FC<DemoBannerProps> = ({
  message = 'Dados de demonstração. Configure o Supabase e a Evolution API nas Configurações para usar dados reais.',
}) => {
  return (
    <div style={{
      background: 'rgba(245, 158, 11, 0.08)',
      border: '1px solid rgba(245, 158, 11, 0.25)',
      borderRadius: '10px',
      padding: '10px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      marginBottom: '24px',
      animation: 'fadeIn 0.3s ease-out',
    }}>
      <div style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: '#f59e0b',
        flexShrink: 0,
      }} />
      <div style={{ fontSize: '13px', color: '#f59e0b', fontWeight: 500 }}>
        🔎 MODO DEMONSTRAÇÃO
      </div>
      <div style={{ fontSize: '12px', color: '#8fa3c8', flex: 1 }}>
        {message}
      </div>
    </div>
  );
};

export default DemoBanner;
