import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Bot, CheckCircle, XCircle, Edit2, Trash2, Search, RefreshCw, Database } from 'lucide-react';
import DemoBanner from '../components/DemoBanner';
import { isSupabaseConfigured } from '../lib/supabase';
import { fetchAgents, deleteAgent, toggleAgentStatus } from '../lib/agentsService';
import type { Agent } from '../types';
import { AI_PROVIDERS } from '../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import toast from 'react-hot-toast';

const AgentsList: React.FC = () => {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFromSupabase, setIsFromSupabase] = useState(false);
  const [search, setSearch] = useState('');
  const [rlsError, setRlsError] = useState<string | null>(null);

  const loadAgents = async () => {
    setIsLoading(true);
    try {
      const result = await fetchAgents();
      setAgents(result.agents);
      setIsFromSupabase(result.fromSupabase);
      if (result.error) {
        setRlsError(result.error);
      } else {
        setRlsError(null);
      }
    } catch {
      toast.error('Erro ao carregar agentes');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o agente "${name}"?`)) {
      return;
    }

    try {
      await deleteAgent(id);
      toast.success('Agente excluído com sucesso');
      setAgents(prev => prev.filter(a => a.id !== id));
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir agente');
    }
  };

  const handleToggle = async (id: string, currentStatus: boolean) => {
    try {
      await toggleAgentStatus(id, !currentStatus);
      setAgents(prev => prev.map(a => a.id === id ? { ...a, is_active: !currentStatus } : a));
      toast.success(!currentStatus ? 'Agente ativado' : 'Agente desativado');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar status');
    }
  };

  const filtered = agents.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.description || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {!isSupabaseConfigured && <DemoBanner />}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#e8f0fe' }}>
              Agentes de IA
            </h2>
            {isFromSupabase ? (
              <span style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '12px',
                background: 'rgba(16, 185, 129, 0.15)',
                color: '#10b981',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <Database size={11} /> Supabase
              </span>
            ) : (
              <span style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '12px',
                background: 'rgba(245, 158, 11, 0.15)',
                color: '#f59e0b',
                border: '1px solid rgba(245, 158, 11, 0.3)',
              }}>
                Modo Demonstração
              </span>
            )}
          </div>
          <p style={{ fontSize: '13px', color: '#8fa3c8' }}>
            Gerencie seus agentes de inteligência artificial para atendimento no WhatsApp
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={loadAgents}
            disabled={isLoading}
            className="btn-secondary"
            title="Atualizar lista"
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <Link to="/agents/new" className="btn-primary">
            <Plus size={16} />
            Novo Agente
          </Link>
        </div>
      </div>

      {rlsError && (
        <div style={{
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '20px',
          fontSize: '12px',
          color: '#f59e0b',
          lineHeight: 1.5
        }}>
          💡 <strong>Aviso Supabase RLS:</strong> As políticas do Supabase estão ativas. Caso queira salvar dados sem login, adicione a política anônima no SQL Editor do Supabase.
        </div>
      )}

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '20px' }}>
        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#4a6080' }} />
        <input
          type="text"
          className="input-field"
          placeholder="Buscar agentes por nome ou descrição..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ paddingLeft: '38px' }}
        />
      </div>

      {/* Agents grid */}
      {isLoading ? (
        <div className="glass-card" style={{ padding: '60px', textAlign: 'center' }}>
          <div className="loader" style={{ margin: '0 auto 16px' }} />
          <div style={{ fontSize: '14px', color: '#8fa3c8' }}>Carregando agentes do Supabase...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card" style={{ padding: '48px', textAlign: 'center' }}>
          <Bot size={48} color="#4a6080" style={{ margin: '0 auto 16px' }} />
          <div style={{ fontSize: '16px', color: '#e8f0fe', marginBottom: '8px', fontWeight: 600 }}>
            {search ? 'Nenhum agente encontrado' : 'Nenhum agente cadastrado ainda'}
          </div>
          <div style={{ fontSize: '13px', color: '#8fa3c8', marginBottom: '20px' }}>
            {search ? 'Tente outro termo de busca' : 'Crie seu primeiro agente de IA para começar a atender no WhatsApp'}
          </div>
          {!search && (
            <Link to="/agents/new" className="btn-primary">
              <Plus size={16} /> Criar Primeiro Agente
            </Link>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
          {filtered.map(agent => (
            <div key={agent.id} className="glass-card" style={{ padding: '24px', position: 'relative' }}>
              {/* Status badge */}
              <button
                onClick={() => handleToggle(agent.id, agent.is_active)}
                title="Clique para alternar status"
                style={{
                  position: 'absolute',
                  top: '16px',
                  right: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: agent.is_active ? 'rgba(16, 185, 129, 0.1)' : 'rgba(74, 96, 128, 0.15)',
                  border: `1px solid ${agent.is_active ? 'rgba(16, 185, 129, 0.3)' : 'rgba(74, 96, 128, 0.2)'}`,
                  borderRadius: '20px',
                  padding: '4px 10px',
                  fontSize: '12px',
                  color: agent.is_active ? '#10b981' : '#8fa3c8',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {agent.is_active ? <CheckCircle size={12} /> : <XCircle size={12} />}
                {agent.is_active ? 'Ativo' : 'Inativo'}
              </button>

              {/* Agent icon and name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', paddingRight: '80px' }}>
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '10px',
                  background: agent.is_active
                    ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(139, 92, 246, 0.2))'
                    : 'rgba(30, 45, 75, 0.5)',
                  border: `1px solid ${agent.is_active ? 'rgba(59, 130, 246, 0.2)' : 'rgba(74, 96, 128, 0.2)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Bot size={20} color={agent.is_active ? '#60a5fa' : '#4a6080'} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#e8f0fe', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span>{agent.name}</span>
                    {agent.media_catalog && agent.media_catalog.length > 0 && (
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '1px 8px',
                        borderRadius: '10px',
                        background: 'rgba(139, 92, 246, 0.2)',
                        color: '#c4b5fd',
                        border: '1px solid rgba(139, 92, 246, 0.3)',
                      }}>
                        🖼️ {agent.media_catalog.length} {agent.media_catalog.length === 1 ? 'mídia' : 'mídias'}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: '#8fa3c8' }}>
                    {AI_PROVIDERS[agent.ai_provider]?.label || agent.ai_provider} · {agent.ai_model}
                  </div>
                </div>
              </div>

              {/* Description */}
              <p style={{
                fontSize: '13px',
                color: '#8fa3c8',
                marginBottom: '16px',
                lineHeight: 1.5,
                minHeight: '38px',
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}>
                {agent.description || 'Sem descrição cadastrada'}
              </p>

              {/* Prompt preview */}
              <div style={{
                background: 'rgba(15, 22, 41, 0.6)',
                border: '1px solid rgba(99, 179, 237, 0.08)',
                borderRadius: '6px',
                padding: '10px 12px',
                marginBottom: '16px',
              }}>
                <div style={{ fontSize: '11px', color: '#4a6080', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Prompt do Sistema
                </div>
                <div style={{
                  fontSize: '12px',
                  color: '#8fa3c8',
                  lineHeight: 1.4,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}>
                  {agent.prompt}
                </div>
              </div>

              {/* Footer */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: '11px', color: '#4a6080' }}>
                  {agent.updated_at ? `Atualizado ${format(new Date(agent.updated_at), "dd/MM/yyyy", { locale: ptBR })}` : ''}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => navigate(`/agents/${agent.id}`)}
                    className="btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '13px' }}
                  >
                    <Edit2 size={13} /> Editar
                  </button>
                  <button
                    onClick={() => handleDelete(agent.id, agent.name)}
                    className="btn-danger"
                    style={{ padding: '6px 12px', fontSize: '13px' }}
                    title="Excluir agente"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AgentsList;
