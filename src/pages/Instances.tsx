import React, { useState, useEffect } from 'react';
import { Plus, Wifi, WifiOff, QrCode, RefreshCw, Trash2, Globe, Bot, Activity, CheckCircle, MessageSquare } from 'lucide-react';
import DemoBanner from '../components/DemoBanner';
import { isSupabaseConfigured } from '../lib/supabase';
import { fetchEvolutionInstances, createEvolutionInstance, restartEvolutionInstance, deleteEvolutionInstance, getEvolutionQRCode, type EvolutionRawInstance } from '../lib/evolutionService';
import { fetchAgents } from '../lib/agentsService';
import type { WhatsAppInstance, Agent } from '../types';
import toast from 'react-hot-toast';

const statusLabels: Record<string, { label: string; color: string }> = {
  connected: { label: 'Conectado', color: '#25d366' },
  disconnected: { label: 'Desconectado', color: '#ef4444' },
  connecting: { label: 'Conectando...', color: '#f59e0b' },
  qr_code: { label: 'Aguardando QR Code', color: '#8b5cf6' },
};

interface LinkedConfig {
  instanceName: string;
  agentId: string;
  agentName: string;
  prompt: string;
  provider: string;
  model: string;
  enabled: boolean;
}

interface ActivityLog {
  id: string;
  timestamp: string;
  instanceName: string;
  agentName: string;
  senderPhone: string;
  senderName?: string;
  userMessage: string;
  aiResponse: string;
  status: 'success' | 'error';
  errorMessage?: string;
}

const NewInstanceModal: React.FC<{
  onClose: () => void;
  onSuccess: () => void;
}> = ({ onClose, onSuccess }) => {
  const [instanceName, setInstanceName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!instanceName.trim()) {
      setError('Nome da instância é obrigatório');
      return;
    }
    const cleanName = instanceName.trim().replace(/\s+/g, '_').toLowerCase();

    setIsSaving(true);
    setError('');
    try {
      await createEvolutionInstance(cleanName);
      toast.success(`Instância "${cleanName}" criada com sucesso na Evolution API!`);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao criar instância na Evolution API');
      toast.error(err.message || 'Erro ao criar instância');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.75)',
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div
        className="glass-card animate-scale-in"
        style={{ width: '100%', maxWidth: '500px', padding: '28px' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: '18px', fontWeight: 700, color: '#e8f0fe', marginBottom: '6px' }}>
          Nova Instância WhatsApp
        </div>
        <div style={{ fontSize: '13px', color: '#8fa3c8', marginBottom: '20px' }}>
          Criar uma nova instância no seu servidor Evolution API (doratec.site)
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label className="form-label">Nome identificador da instância *</label>
          <input
            type="text"
            className="input-field"
            placeholder="Ex: atendimento_principal"
            value={instanceName}
            onChange={e => setInstanceName(e.target.value)}
          />
          {error && <div className="form-error">{error}</div>}
          <div style={{ fontSize: '11px', color: '#8fa3c8', marginTop: '6px' }}>
            Use letras minúsculas, números e sublinhados.
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onClose} disabled={isSaving}>Cancelar</button>
          <button className="btn-primary" onClick={handleCreate} disabled={isSaving}>
            {isSaving ? <><div className="loader" style={{ width: '14px', height: '14px' }} /> Criando na API...</> : <><Plus size={15} /> Criar Instância</>}
          </button>
        </div>
      </div>
    </div>
  );
};

// Modal de QR Code
const QrModal: React.FC<{
  instanceName: string;
  onClose: () => void;
}> = ({ instanceName, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);

  useEffect(() => {
    getEvolutionQRCode(instanceName)
      .then(res => {
        if (res.base64) {
          setQrCodeData(res.base64);
        } else if (res.code) {
          setQrCodeData(res.code);
        }
        if (res.pairingCode) {
          setPairingCode(res.pairingCode);
        }
      })
      .catch(err => {
        toast.error('Erro ao buscar QR code: ' + err.message);
      })
      .finally(() => setLoading(false));
  }, [instanceName]);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.8)',
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div
        className="glass-card animate-scale-in"
        style={{ width: '100%', maxWidth: '420px', padding: '28px', textAlign: 'center' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: '18px', fontWeight: 700, color: '#e8f0fe', marginBottom: '6px' }}>
          Conectar WhatsApp
        </div>
        <div style={{ fontSize: '13px', color: '#8fa3c8', marginBottom: '20px' }}>
          Abra o WhatsApp no celular &gt; Aparelhos Conectados &gt; Conectar um aparelho
        </div>

        {loading ? (
          <div style={{ padding: '40px 0' }}>
            <div className="loader" style={{ margin: '0 auto 16px' }} />
            <div style={{ fontSize: '13px', color: '#8fa3c8' }}>Gerando QR Code...</div>
          </div>
        ) : qrCodeData ? (
          <div style={{ marginBottom: '20px' }}>
            <img
              src={qrCodeData.startsWith('data:') ? qrCodeData : `data:image/png;base64,${qrCodeData}`}
              alt="QR Code WhatsApp"
              style={{ width: '240px', height: '240px', margin: '0 auto', borderRadius: '12px', background: '#fff', padding: '8px' }}
            />
            {pairingCode && (
              <div style={{ marginTop: '12px', fontSize: '13px', color: '#60a5fa' }}>
                Código de emparelhamento: <strong>{pairingCode}</strong>
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding: '30px', color: '#8fa3c8', fontSize: '13px' }}>
            Instância já conectada ou aguardando inicialização.
          </div>
        )}

        <button className="btn-secondary" style={{ width: '100%' }} onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  );
};

// Modal de Feed de Atendimento com IA
const LogsModal: React.FC<{
  onClose: () => void;
}> = ({ onClose }) => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = () => {
    fetch('/api/responder/logs')
      .then(res => res.json())
      .then(data => setLogs(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.8)',
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div
        className="glass-card animate-scale-in"
        style={{ width: '100%', maxWidth: '750px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: '24px' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#e8f0fe', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={18} color="#10b981" /> Feed de Atendimento da IA (Tempo Real)
            </div>
            <div style={{ fontSize: '12px', color: '#8fa3c8' }}>
              Acompanhe as mensagens recebidas e as respostas automáticas da IA
            </div>
          </div>
          <button className="btn-secondary" onClick={onClose} style={{ padding: '6px 12px', fontSize: '12px' }}>
            Fechar
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '6px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#8fa3c8' }}>
              <div className="loader" style={{ margin: '0 auto 12px' }} />
              Carregando histórico...
            </div>
          ) : logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#8fa3c8', background: 'rgba(15, 22, 41, 0.5)', borderRadius: '10px' }}>
              <MessageSquare size={36} color="#4a6080" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: '15px', color: '#e8f0fe', fontWeight: 600, marginBottom: '4px' }}>
                Aguardando mensagens...
              </div>
              <div style={{ fontSize: '13px', color: '#8fa3c8', maxWidth: '400px', margin: '0 auto' }}>
                Envie uma mensagem no WhatsApp para o número conectado. O agente de IA processará e responderá automaticamente!
              </div>
            </div>
          ) : (
            logs.map(log => (
              <div key={log.id} style={{
                background: 'rgba(15, 22, 41, 0.65)',
                border: `1px solid ${log.status === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.3)'}`,
                borderRadius: '10px',
                padding: '16px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontWeight: 600, color: '#60a5fa' }}>+{log.senderPhone}</span>
                    <span style={{ color: '#8fa3c8' }}>({log.senderName})</span>
                    <span style={{ color: '#4a6080' }}>→</span>
                    <span style={{ color: '#a78bfa' }}>{log.agentName}</span>
                  </div>
                  <span style={{ color: '#4a6080' }}>{new Date(log.timestamp).toLocaleTimeString('pt-BR')}</span>
                </div>

                <div style={{ background: 'rgba(30, 45, 75, 0.4)', padding: '10px 12px', borderRadius: '6px', marginBottom: '8px', fontSize: '13px', color: '#e8f0fe' }}>
                  <strong>Cliente:</strong> {log.userMessage}
                </div>

                {log.status === 'success' ? (
                  <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '10px 12px', borderRadius: '6px', fontSize: '13px', color: '#6ee7b7' }}>
                    <strong>IA:</strong> {log.aiResponse}
                  </div>
                ) : (
                  <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', padding: '10px 12px', borderRadius: '6px', fontSize: '13px', color: '#f87171' }}>
                    <strong>Erro:</strong> {log.errorMessage}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

const Instances: React.FC = () => {
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [rawInstances, setRawInstances] = useState<EvolutionRawInstance[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [linkedMap, setLinkedMap] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [qrModalInstance, setQrModalInstance] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [instResult, agentsResult, linksRes] = await Promise.all([
        fetchEvolutionInstances(),
        fetchAgents(),
        fetch('/api/responder/links').then(r => r.json()).catch(() => []),
      ]);

      setInstances(instResult.instances);
      setRawInstances(instResult.raw);
      setAgents(agentsResult.agents);

      let map: Record<string, string> = {};
      try {
        const stored = localStorage.getItem('responder_linked_map');
        if (stored) map = JSON.parse(stored);
      } catch {}

      if (Array.isArray(linksRes) && linksRes.length > 0) {
        linksRes.forEach((item: LinkedConfig) => {
          map[item.instanceName] = item.agentId;
        });
      }
      setLinkedMap(map);
    } catch {
      toast.error('Erro ao conectar com a Evolution API');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleLinkAgent = async (instanceName: string, agentId: string) => {
    if (!agentId) {
      // Unlink
      try {
        await fetch('/api/responder/unlink', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instanceName }),
        }).catch(() => {});
      } catch {}

      setLinkedMap(prev => {
        const next = { ...prev };
        delete next[instanceName];
        try { localStorage.setItem('responder_linked_map', JSON.stringify(next)); } catch {}
        return next;
      });
      toast.success(`Atendimento com IA desvinculado de "${instanceName}".`);
      return;
    }

    const agent = agents.find(a => a.id === agentId);
    if (!agent) return;

    try {
      await fetch('/api/responder/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceName,
          agentId: agent.id,
          agentName: agent.name,
          prompt: agent.prompt,
          provider: agent.ai_provider,
          model: agent.ai_model,
          mediaCatalog: agent.media_catalog || [],
          enabled: true,
        }),
      }).catch(() => {});
    } catch {}

    setLinkedMap(prev => {
      const next = { ...prev, [instanceName]: agentId };
      try { localStorage.setItem('responder_linked_map', JSON.stringify(next)); } catch {}
      return next;
    });
    toast.success(`🤖 Agente "${agent.name}" ativado para responder o WhatsApp desta instância!`);
  };

  const handleRestart = async (name: string) => {
    try {
      await restartEvolutionInstance(name);
      toast.success(`Instância ${name} reiniciada!`);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao reiniciar');
    }
  };

  const handleDelete = async (name: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir a instância "${name}" da Evolution API?`)) {
      return;
    }
    try {
      await deleteEvolutionInstance(name);
      toast.success(`Instância ${name} excluída com sucesso!`);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir');
    }
  };

  const connectedCount = instances.filter(i => i.connection_status === 'connected').length;
  const activeAiCount = Object.keys(linkedMap).length;

  return (
    <div>
      {!isSupabaseConfigured && <DemoBanner />}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#e8f0fe' }}>
              Instâncias WhatsApp
            </h2>
            <span style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '12px',
              background: 'rgba(37, 211, 102, 0.15)',
              color: '#25d366',
              border: '1px solid rgba(37, 211, 102, 0.3)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <Globe size={11} /> api.doratec.site
            </span>
          </div>
          <p style={{ fontSize: '13px', color: '#8fa3c8' }}>
            {connectedCount} de {instances.length} instância{instances.length !== 1 ? 's' : ''} conectada{connectedCount !== 1 ? 's' : ''} · {activeAiCount} com IA ativa
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setShowLogsModal(true)}
            className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)' }}
          >
            <Activity size={15} /> Feed de Atendimento IA
          </button>
          <button
            onClick={loadData}
            disabled={isLoading}
            className="btn-secondary"
            title="Atualizar instâncias"
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button className="btn-primary" onClick={() => setShowNewModal(true)}>
            <Plus size={16} /> Nova Instância
          </button>
        </div>
      </div>

      {/* Evolution API Connection bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(16, 185, 129, 0.08)',
        border: '1px solid rgba(16, 185, 129, 0.25)',
        borderRadius: '10px',
        padding: '12px 18px',
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#25d366', boxShadow: '0 0 10px #25d366' }} />
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#e8f0fe' }}>
              Evolution API Conectada &amp; Motor IA Ativo
            </div>
            <div style={{ fontSize: '12px', color: '#8fa3c8' }}>
              Vincule um agente a uma instância conectada para ativar o atendimento automático em tempo real
            </div>
          </div>
        </div>
        <div style={{ fontSize: '12px', color: '#8fa3c8' }}>
          Total de instâncias: <strong style={{ color: '#e8f0fe' }}>{instances.length}</strong>
        </div>
      </div>

      {/* Instances list / loading */}
      {isLoading ? (
        <div className="glass-card" style={{ padding: '60px', textAlign: 'center' }}>
          <div className="loader" style={{ margin: '0 auto 16px' }} />
          <div style={{ fontSize: '14px', color: '#8fa3c8' }}>Carregando instâncias da Evolution API...</div>
        </div>
      ) : instances.length === 0 ? (
        <div className="glass-card" style={{ padding: '48px', textAlign: 'center' }}>
          <WifiOff size={48} color="#4a6080" style={{ margin: '0 auto 16px' }} />
          <div style={{ fontSize: '16px', color: '#e8f0fe', marginBottom: '8px', fontWeight: 600 }}>
            Nenhuma instância encontrada
          </div>
          <div style={{ fontSize: '13px', color: '#8fa3c8', marginBottom: '20px' }}>
            Crie sua primeira instância WhatsApp para começar a atender seus clientes com IA.
          </div>
          <button className="btn-primary" onClick={() => setShowNewModal(true)}>
            <Plus size={16} /> Criar Instância
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '16px' }}>
          {instances.map((instance, idx) => {
            const raw = rawInstances[idx] || ({} as EvolutionRawInstance);
            const statusInfo = statusLabels[instance.connection_status] || statusLabels.disconnected;
            const cleanRawName = raw.name || instance.name.split(' ')[0];
            const currentLinkedAgentId = linkedMap[cleanRawName] || '';

            return (
              <div key={instance.id} className="glass-card" style={{ padding: '24px' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {raw.profilePicUrl ? (
                      <img
                        src={raw.profilePicUrl}
                        alt="Profile"
                        style={{
                          width: '46px',
                          height: '46px',
                          borderRadius: '12px',
                          border: `2px solid ${instance.connection_status === 'connected' ? '#25d366' : '#4a6080'}`,
                          objectFit: 'cover',
                        }}
                      />
                    ) : (
                      <div style={{
                        width: '46px',
                        height: '46px',
                        borderRadius: '12px',
                        background: instance.connection_status === 'connected'
                          ? 'rgba(37, 211, 102, 0.15)'
                          : 'rgba(30, 45, 75, 0.5)',
                        border: `1px solid ${instance.connection_status === 'connected' ? 'rgba(37, 211, 102, 0.3)' : 'rgba(74, 96, 128, 0.2)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        {instance.connection_status === 'connected'
                          ? <Wifi size={22} color="#25d366" />
                          : <WifiOff size={22} color="#4a6080" />
                        }
                      </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#e8f0fe', marginBottom: '2px', wordBreak: 'break-all' }}>
                        {raw.profileName || raw.name || instance.name}
                      </div>
                      <div style={{ fontSize: '12px', color: '#8fa3c8' }}>
                        {instance.phone_number ? `+${instance.phone_number}` : `ID: ${cleanRawName}`}
                      </div>
                    </div>
                  </div>

                  {/* Status */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    color: statusInfo.color,
                    fontWeight: 600,
                    background: `${statusInfo.color}15`,
                    padding: '4px 10px',
                    borderRadius: '20px',
                    border: `1px solid ${statusInfo.color}30`,
                    whiteSpace: 'nowrap'
                  }}>
                    <span className={`status-dot ${instance.connection_status === 'connected' ? 'connected' : instance.connection_status === 'connecting' ? 'connecting' : 'disconnected'}`} />
                    {statusInfo.label}
                  </div>
                </div>

                {/* Metrics */}
                {raw._count && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: '8px',
                    background: 'rgba(15, 22, 41, 0.5)',
                    padding: '10px',
                    borderRadius: '8px',
                    marginBottom: '16px',
                    textAlign: 'center',
                  }}>
                    <div>
                      <div style={{ fontSize: '11px', color: '#4a6080' }}>Mensagens</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#e8f0fe' }}>
                        {raw._count.Message?.toLocaleString('pt-BR') || 0}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#4a6080' }}>Contatos</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#e8f0fe' }}>
                        {raw._count.Contact?.toLocaleString('pt-BR') || 0}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#4a6080' }}>Chats</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#e8f0fe' }}>
                        {raw._count.Chat?.toLocaleString('pt-BR') || 0}
                      </div>
                    </div>
                  </div>
                )}

                {/* Linked Agent Selector */}
                <div style={{
                  background: currentLinkedAgentId ? 'rgba(16, 185, 129, 0.08)' : 'rgba(15, 22, 41, 0.4)',
                  border: `1px solid ${currentLinkedAgentId ? 'rgba(16, 185, 129, 0.25)' : 'rgba(99, 179, 237, 0.1)'}`,
                  borderRadius: '8px',
                  padding: '10px 12px',
                  marginBottom: '14px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: currentLinkedAgentId ? '#10b981' : '#8fa3c8', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Bot size={14} color={currentLinkedAgentId ? '#10b981' : '#60a5fa'} />
                      {currentLinkedAgentId ? 'IA Ativa nesta instância:' : 'Vincular Agente de IA:'}
                    </span>
                    {currentLinkedAgentId && (
                      <span style={{ fontSize: '11px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle size={11} /> Respondendo WhatsApp
                      </span>
                    )}
                  </div>
                  <select
                    className="input-field"
                    style={{ width: '100%', padding: '6px 10px', fontSize: '13px' }}
                    value={currentLinkedAgentId}
                    onChange={e => handleLinkAgent(cleanRawName, e.target.value)}
                  >
                    <option value="">Nenhum agente vinculado (Manual)</option>
                    {agents.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.ai_provider} · {a.ai_model})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  {instance.connection_status !== 'connected' ? (
                    <button
                      className="btn-success"
                      style={{ flex: 1, justifyContent: 'center' }}
                      onClick={() => setQrModalInstance(cleanRawName)}
                    >
                      <QrCode size={14} /> Conectar QR Code
                    </button>
                  ) : (
                    <button
                      className="btn-secondary"
                      style={{ flex: 1, justifyContent: 'center' }}
                      onClick={() => handleRestart(cleanRawName)}
                    >
                      <RefreshCw size={14} /> Reiniciar
                    </button>
                  )}
                  <button
                    className="btn-danger"
                    style={{ padding: '10px 14px' }}
                    title="Remover Instância"
                    onClick={() => handleDelete(cleanRawName)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showNewModal && (
        <NewInstanceModal
          onClose={() => setShowNewModal(false)}
          onSuccess={loadData}
        />
      )}

      {qrModalInstance && (
        <QrModal
          instanceName={qrModalInstance}
          onClose={() => {
            setQrModalInstance(null);
            loadData();
          }}
        />
      )}

      {showLogsModal && (
        <LogsModal onClose={() => setShowLogsModal(false)} />
      )}
    </div>
  );
};

export default Instances;
