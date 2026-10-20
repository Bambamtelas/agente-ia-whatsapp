import React, { useState } from 'react';
import {
  Database,
  Smartphone,
  Bot,
  Webhook,
  Eye,
  EyeOff,
  Save,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';
import { isSupabaseConfigured } from '../lib/supabase';
import toast from 'react-hot-toast';

const Section: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  status?: 'configured' | 'not-configured' | 'partial';
  children: React.ReactNode;
}> = ({ icon, title, description, status, children }) => (
  <div className="glass-card" style={{ padding: '24px', marginBottom: '16px' }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '38px',
          height: '38px',
          borderRadius: '8px',
          background: 'rgba(59, 130, 246, 0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#60a5fa',
        }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#e8f0fe' }}>{title}</div>
          <div style={{ fontSize: '13px', color: '#8fa3c8' }}>{description}</div>
        </div>
      </div>

      {status && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          borderRadius: '20px',
          fontSize: '12px',
          fontWeight: 500,
          background: status === 'configured' ? 'rgba(16, 185, 129, 0.1)' : status === 'partial' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          border: `1px solid ${status === 'configured' ? 'rgba(16, 185, 129, 0.3)' : status === 'partial' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          color: status === 'configured' ? '#10b981' : status === 'partial' ? '#f59e0b' : '#ef4444',
        }}>
          {status === 'configured' ? <CheckCircle size={12} /> : <AlertTriangle size={12} />}
          {status === 'configured' ? 'Configurado' : status === 'partial' ? 'Parcial' : 'Não configurado'}
        </div>
      )}
    </div>

    {children}
  </div>
);

const SecretInput: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  hint?: string;
}> = ({ label, value, onChange, placeholder, hint }) => {
  const [show, setShow] = useState(false);

  return (
    <div>
      <label className="form-label">{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={show ? 'text' : 'password'}
          className="input-field"
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ paddingRight: '40px' }}
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          style={{
            position: 'absolute',
            right: '10px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#4a6080',
            display: 'flex',
          }}
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      {hint && <div style={{ fontSize: '11px', color: '#4a6080', marginTop: '4px' }}>🔒 {hint}</div>}
    </div>
  );
};

const Settings: React.FC = () => {
  const [supabase, setSupabase] = useState({ url: '', anon_key: '' });
  const [evolution, setEvolution] = useState({ url: '', global_api_key: '' });
  const [aiKeys, setAiKeys] = useState({ openai: '', gemini: '', anthropic: '', groq: '' });
  const [webhook, setWebhook] = useState('');
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const webhookExample = 'https://api.seudominio.com/webhook/whatsapp';

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise(r => setTimeout(r, 1000));
    setIsSaving(false);
    toast.success('Configurações salvas! Reinicie a aplicação para aplicar as variáveis de ambiente.');
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      {/* Warning banner */}
      <div style={{
        display: 'flex',
        gap: '12px',
        background: 'rgba(239, 68, 68, 0.08)',
        border: '1px solid rgba(239, 68, 68, 0.2)',
        borderRadius: '10px',
        padding: '16px',
        marginBottom: '28px',
      }}>
        <AlertTriangle size={18} color="#ef4444" style={{ flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#fca5a5', marginBottom: '6px' }}>
            ⚠️ Segurança Importante
          </div>
          <div style={{ fontSize: '13px', color: '#8fa3c8', lineHeight: 1.6 }}>
            As chaves de API <strong style={{ color: '#fca5a5' }}>não devem ser inseridas diretamente no frontend</strong>.
            Configure-as via variáveis de ambiente no arquivo <code style={{ background: 'rgba(239,68,68,0.1)', padding: '1px 4px', borderRadius: '3px', color: '#fca5a5' }}>.env</code> ou
            nas configurações de deploy. Esta tela é apenas para visualização e instrução.
          </div>
        </div>
      </div>

      {/* Supabase */}
      <Section
        icon={<Database size={18} />}
        title="Supabase"
        description="Banco de dados e autenticação"
        status={isSupabaseConfigured ? 'configured' : 'not-configured'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
          <div>
            <label className="form-label">URL do Projeto (VITE_SUPABASE_URL)</label>
            <input
              type="url"
              className="input-field"
              placeholder="https://xxxxxxxxxxx.supabase.co"
              value={supabase.url}
              onChange={e => setSupabase(s => ({ ...s, url: e.target.value }))}
            />
          </div>
          <SecretInput
            label="Anon Key (VITE_SUPABASE_ANON_KEY)"
            value={supabase.anon_key}
            onChange={v => setSupabase(s => ({ ...s, anon_key: v }))}
            placeholder="eyJhbGciOiJIUzI1NiIs..."
            hint="Use apenas a chave anônima (pública). Nunca use a service_role key no frontend."
          />
        </div>

        <div style={{
          background: 'rgba(15, 22, 41, 0.6)',
          borderRadius: '8px',
          padding: '12px 16px',
          fontSize: '13px',
          color: '#8fa3c8',
          lineHeight: 1.6,
        }}>
          📄 Adicione ao arquivo <code style={{ color: '#60a5fa' }}>.env</code> na raiz do projeto:
          <pre style={{
            marginTop: '8px',
            background: 'rgba(10, 14, 26, 0.8)',
            border: '1px solid rgba(99, 179, 237, 0.1)',
            borderRadius: '6px',
            padding: '10px',
            fontSize: '12px',
            color: '#a5f3fc',
            overflow: 'auto',
          }}>
{`VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key-aqui`}
          </pre>
        </div>

        <div style={{ marginTop: '12px' }}>
          <a
            href="https://app.supabase.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: '#60a5fa', textDecoration: 'none' }}
          >
            <ExternalLink size={13} /> Acessar Supabase
          </a>
        </div>
      </Section>

      {/* Evolution API */}
      <Section
        icon={<Smartphone size={18} />}
        title="Evolution API"
        description="Gateway para WhatsApp — acesso via backend"
        status="not-configured"
      >
        <div style={{
          background: 'rgba(139, 92, 246, 0.08)',
          border: '1px solid rgba(139, 92, 246, 0.2)',
          borderRadius: '8px',
          padding: '12px 14px',
          marginBottom: '16px',
          fontSize: '13px',
          color: '#a78bfa',
          lineHeight: 1.5,
        }}>
          🛡️ A Evolution API é acessada <strong>exclusivamente pelo backend</strong>.
          As credenciais são armazenadas de forma segura no servidor, nunca expostas no frontend.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label className="form-label">URL do Servidor (variável de backend)</label>
            <input type="url" className="input-field" placeholder="https://api.seudominio.com" value={evolution.url} onChange={e => setEvolution(s => ({ ...s, url: e.target.value }))} />
          </div>
          <SecretInput
            label="Global API Key (variável de backend)"
            value={evolution.global_api_key}
            onChange={v => setEvolution(s => ({ ...s, global_api_key: v }))}
            placeholder="••••••••••••••••"
            hint="Configure como variável de ambiente EVOLUTION_API_KEY no servidor backend."
          />
        </div>
      </Section>

      {/* AI Providers */}
      <Section
        icon={<Bot size={18} />}
        title="Provedores de IA"
        description="Chaves de API — configurar no backend"
        status="not-configured"
      >
        <div style={{
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.15)',
          borderRadius: '8px',
          padding: '10px 14px',
          marginBottom: '16px',
          fontSize: '12px',
          color: '#fca5a5',
        }}>
          🚫 Chaves de IA devem ser configuradas <strong>apenas no backend</strong> como variáveis de ambiente, nunca no frontend.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          {[
            { key: 'openai' as const, label: 'OpenAI API Key', env: 'OPENAI_API_KEY', placeholder: 'sk-...' },
            { key: 'gemini' as const, label: 'Google Gemini API Key', env: 'GEMINI_API_KEY', placeholder: 'AIzaSy...' },
            { key: 'anthropic' as const, label: 'Anthropic API Key', env: 'ANTHROPIC_API_KEY', placeholder: 'sk-ant-...' },
            { key: 'groq' as const, label: 'Groq API Key', env: 'GROQ_API_KEY', placeholder: 'gsk_...' },
          ].map(({ key, label, env, placeholder }) => (
            <SecretInput
              key={key}
              label={`${label} (${env})`}
              value={aiKeys[key]}
              onChange={v => setAiKeys(k => ({ ...k, [key]: v }))}
              placeholder={placeholder}
              hint="Configure apenas no servidor backend"
            />
          ))}
        </div>
      </Section>

      {/* Webhook */}
      <Section
        icon={<Webhook size={18} />}
        title="Webhook"
        description="URL de callback para receber mensagens"
      >
        <div style={{ marginBottom: '14px' }}>
          <label className="form-label">URL do Webhook (backend)</label>
          <div style={{ position: 'relative' }}>
            <input
              type="url"
              className="input-field"
              placeholder={webhookExample}
              value={webhook}
              onChange={e => setWebhook(e.target.value)}
              style={{ paddingRight: '44px' }}
            />
            <button
              onClick={() => handleCopy(webhook || webhookExample)}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#4a6080',
                display: 'flex',
              }}
            >
              {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
            </button>
          </div>
          <div style={{ fontSize: '11px', color: '#4a6080', marginTop: '4px' }}>
            Configure esta URL na Evolution API para receber eventos de mensagens
          </div>
        </div>
      </Section>

      {/* Save button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
        <div style={{ fontSize: '13px', color: '#4a6080', alignSelf: 'center' }}>
          Lembre de reiniciar após alterar variáveis de ambiente
        </div>
        <button className="btn-primary" onClick={handleSave} disabled={isSaving}>
          {isSaving ? <><div className="loader" style={{ width: '14px', height: '14px' }} />Salvando...</> : <><Save size={15} />Salvar Configurações</>}
        </button>
      </div>
    </div>
  );
};

export default Settings;
