import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot,
  Smartphone,
  MessageSquare,
  TrendingUp,
  Activity,
  ArrowRight,
  CheckCircle,
  XCircle,
  Clock,
  Zap,
  Globe,
  Database
} from 'lucide-react';
import toast from 'react-hot-toast';
import DemoBanner from '../components/DemoBanner';
import { isSupabaseConfigured } from '../lib/supabase';
import { fetchAgents, toggleAgentStatus } from '../lib/agentsService';
import { fetchEvolutionInstances, type EvolutionRawInstance } from '../lib/evolutionService';
import type { Agent, WhatsAppInstance } from '../types';

const StatCard: React.FC<{
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ReactNode;
  color: string;
  glow: string;
}> = ({ title, value, subtitle, icon, color, glow }) => (
  <div className="glass-card" style={{ padding: '24px' }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
      <div>
        <div style={{ fontSize: '13px', color: '#8fa3c8', fontWeight: 500, marginBottom: '8px' }}>{title}</div>
        <div style={{ fontSize: '36px', fontWeight: 800, color: '#e8f0fe', lineHeight: 1 }}>{value}</div>
      </div>
      <div style={{
        width: '48px',
        height: '48px',
        borderRadius: '12px',
        background: glow,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color,
      }}>
        {icon}
      </div>
    </div>
    <div style={{ fontSize: '12px', color: '#8fa3c8' }}>{subtitle}</div>
  </div>
);

const Dashboard: React.FC = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [rawInstances, setRawInstances] = useState<EvolutionRawInstance[]>([]);
  const [totalMessages, setTotalMessages] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      try {
        const [agentsRes, instRes, linksRes] = await Promise.allSettled([
          fetchAgents(),
          fetchEvolutionInstances(),
          fetch('/api/responder/links').then(r => r.json()).catch(() => []),
        ]);

        if (agentsRes.status === 'fulfilled') {
          setAgents(agentsRes.value.agents);
        }

        if (instRes.status === 'fulfilled') {
          // Obtém lista de nomes de instâncias vinculadas a este sistema
          const linkedNames = new Set<string>();
          if (linksRes.status === 'fulfilled' && Array.isArray(linksRes.value) && linksRes.value.length > 0) {
            linksRes.value.forEach((l: any) => {
              if (l?.instanceName) linkedNames.add(l.instanceName.toLowerCase().trim());
            });
          }
          try {
            const stored = localStorage.getItem('responder_linked_map');
            if (stored) {
              const map = JSON.parse(stored);
              Object.keys(map).forEach(name => linkedNames.add(name.toLowerCase().trim()));
            }
          } catch {}

          // Fallback seguro: se nenhuma estiver vinculada ainda no cache, foca na instância padrão deste sistema
          if (linkedNames.size === 0) {
            linkedNames.add('agente_james_test');
          }

          // Filtra estritamente apenas as instâncias que pertencem a este agente/sistema
          const matchedRaw = instRes.value.raw.filter(i => linkedNames.has(i.name.toLowerCase().trim()));
          const matchedInstances = instRes.value.instances.filter(i => linkedNames.has(i.name.toLowerCase().trim()));

          // Se nenhuma das vinculadas foi encontrada na API, mostra vazio ou apenas as do sistema
          setInstances(matchedInstances);
          setRawInstances(matchedRaw);

          // Soma contagem de mensagens EXCLUSIVAMENTE das instâncias deste sistema
          const totalMsgs = matchedRaw.reduce((acc, curr) => acc + (curr._count?.Message || 0), 0);
          setTotalMessages(totalMsgs);
        }
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, []);

  const activeAgents = agents.filter(a => a.is_active).length;
  const connectedInstances = instances.filter(i => i.connection_status === 'connected').length;

  const handleToggleAgent = async (id: string, currentStatus: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextStatus = !currentStatus;
    setAgents(prev => prev.map(a => a.id === id ? { ...a, is_active: nextStatus } : a));
    try {
      await toggleAgentStatus(id, nextStatus);
      toast.success(nextStatus ? 'Agente ativado com sucesso!' : 'Agente desativado com sucesso!');
    } catch (err: any) {
      setAgents(prev => prev.map(a => a.id === id ? { ...a, is_active: currentStatus } : a));
      toast.error(err.message || 'Erro ao atualizar status');
    }
  };

  return (
    <div>
      {!isSupabaseConfigured && <DemoBanner />}

      {/* Stats Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
        marginBottom: '32px',
      }}>
        <StatCard
          title="Total de Agentes"
          value={loading ? '...' : agents.length}
          subtitle={`${activeAgents} ativo${activeAgents !== 1 ? 's' : ''} no Supabase`}
          icon={<Bot size={22} />}
          color="#3b82f6"
          glow="rgba(59, 130, 246, 0.15)"
        />
        <StatCard
          title="Instâncias WhatsApp"
          value={loading ? '...' : connectedInstances}
          subtitle={`de ${instances.length} vinculada${instances.length !== 1 ? 's' : ''} ao agente`}
          icon={<Smartphone size={22} />}
          color="#10b981"
          glow="rgba(16, 185, 129, 0.15)"
        />
        <StatCard
          title="Conversas Conectadas"
          value={loading ? '...' : rawInstances.reduce((acc, i) => acc + (i._count?.Chat || 0), 0).toLocaleString('pt-BR')}
          subtitle="Chats do agente vinculado"
          icon={<MessageSquare size={22} />}
          color="#8b5cf6"
          glow="rgba(139, 92, 246, 0.15)"
        />
        <StatCard
          title="Mensagens Processadas"
          value={loading ? '...' : totalMessages.toLocaleString('pt-BR')}
          subtitle="Histórico da instância vinculada"
          icon={<TrendingUp size={22} />}
          color="#f59e0b"
          glow="rgba(245, 158, 11, 0.15)"
        />
      </div>

      {/* Content grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        {/* Agents overview */}
        <div className="glass-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Bot size={18} color="#3b82f6" />
              <span style={{ fontSize: '15px', fontWeight: 600, color: '#e8f0fe' }}>Agentes IA Cadastrados</span>
            </div>
            <Link to="/agents" style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
              color: '#3b82f6',
              textDecoration: 'none',
            }}>
              Ver todos <ArrowRight size={12} />
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {agents.length === 0 ? (
              <div style={{ padding: '30px 10px', textAlign: 'center', color: '#8fa3c8', fontSize: '13px' }}>
                Nenhum agente cadastrado. <Link to="/agents/new" style={{ color: '#60a5fa' }}>Criar o primeiro</Link>
              </div>
            ) : (
              agents.slice(0, 4).map(agent => (
                <div key={agent.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px',
                  background: 'rgba(15, 22, 41, 0.6)',
                  borderRadius: '8px',
                  border: '1px solid rgba(99, 179, 237, 0.08)',
                }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: agent.is_active ? 'rgba(16, 185, 129, 0.15)' : 'rgba(74, 96, 128, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Bot size={16} color={agent.is_active ? '#10b981' : '#4a6080'} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#e8f0fe', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {agent.name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#8fa3c8' }}>
                      {agent.ai_provider} · {agent.ai_model}
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleToggleAgent(agent.id, agent.is_active, e)}
                    title={agent.is_active ? "Clique para desativar o agente" : "Clique para ativar o agente"}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontSize: '12px',
                      color: agent.is_active ? '#10b981' : '#8fa3c8',
                      background: agent.is_active ? 'rgba(16, 185, 129, 0.12)' : 'rgba(74, 96, 128, 0.15)',
                      border: `1px solid ${agent.is_active ? 'rgba(16, 185, 129, 0.3)' : 'rgba(74, 96, 128, 0.2)'}`,
                      borderRadius: '16px',
                      padding: '4px 10px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    {agent.is_active ? <CheckCircle size={14} /> : <XCircle size={14} />}
                    {agent.is_active ? 'Ativo' : 'Inativo'}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Instances overview */}
        <div className="glass-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Smartphone size={18} color="#10b981" />
              <span style={{ fontSize: '15px', fontWeight: 600, color: '#e8f0fe' }}>Instâncias Vinculadas ao Agente</span>
            </div>
            <Link to="/instances" style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
              color: '#3b82f6',
              textDecoration: 'none',
            }}>
              Gerenciar instâncias <ArrowRight size={12} />
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {instances.length === 0 ? (
              <div style={{ padding: '30px 10px', textAlign: 'center', color: '#8fa3c8', fontSize: '13px' }}>
                Nenhuma instância vinculada a este agente ainda.<br />
                <span style={{ fontSize: '11px', color: '#4a6080' }}>Acesse "Gerenciar instâncias" para ativar seu agente.</span>
              </div>
            ) : (
              instances.slice(0, 4).map((instance, idx) => {
                const raw = rawInstances[idx];
                return (
                  <div key={instance.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px',
                    background: 'rgba(15, 22, 41, 0.6)',
                    borderRadius: '8px',
                    border: '1px solid rgba(99, 179, 237, 0.08)',
                  }}>
                    {raw?.profilePicUrl ? (
                      <img
                        src={raw.profilePicUrl}
                        alt="Profile"
                        style={{ width: '36px', height: '36px', borderRadius: '8px', objectFit: 'cover' }}
                      />
                    ) : (
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        background: instance.connection_status === 'connected' ? 'rgba(37, 211, 102, 0.15)' : 'rgba(74, 96, 128, 0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <Smartphone size={16} color={instance.connection_status === 'connected' ? '#25d366' : '#8fa3c8'} />
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#e8f0fe', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {raw?.profileName || instance.name}
                      </div>
                      <div style={{ fontSize: '12px', color: '#8fa3c8' }}>
                        {instance.phone_number ? `+${instance.phone_number}` : instance.name}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className={`status-dot ${instance.connection_status}`} />
                      <span style={{
                        fontSize: '12px',
                        color: instance.connection_status === 'connected' ? '#25d366' : '#8fa3c8',
                        fontWeight: 500,
                      }}>
                        {instance.connection_status === 'connected' ? 'Conectado' : 'Aguardando'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="glass-card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={16} color="#3b82f6" />
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#e8f0fe' }}>Status dos Serviços</span>
          </div>
          <div style={{ flex: 1 }} />

          {[
            { label: 'IA Operacional', status: true, icon: <Zap size={12} /> },
            { label: 'Evolution API (doratec.site)', status: true, icon: <Globe size={12} /> },
            { label: 'Supabase Database', status: isSupabaseConfigured, icon: <Database size={12} /> },
            { label: 'Webhook Router', status: true, icon: <Clock size={12} /> },
          ].map(({ label, status, icon }) => (
            <div key={label} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: status ? 'rgba(16, 185, 129, 0.1)' : 'rgba(74, 96, 128, 0.15)',
              border: `1px solid ${status ? 'rgba(16, 185, 129, 0.2)' : 'rgba(74, 96, 128, 0.2)'}`,
              borderRadius: '20px',
              fontSize: '12px',
              color: status ? '#10b981' : '#8fa3c8',
              fontWeight: 500,
            }}>
              {icon}
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
