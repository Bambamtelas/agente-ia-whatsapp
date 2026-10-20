import React, { useState, useEffect } from 'react';
import { Search, Send, Bot, User, Clock, CheckCheck, Check, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

import { DEMO_CONTACTS, DEMO_MESSAGES } from '../lib/demoData';
import { isSupabaseConfigured } from '../lib/supabase';
import type { Contact, Message } from '../types';
import { format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface HumanPauseRecord {
  instanceName: string;
  phone: string;
  pausedAt: string;
  expiresAt: string;
  lastHumanMessage?: string;
}

const cleanPhone = (ph: string) => (ph || '').replace('@s.whatsapp.net', '').replace('@lid', '').replace(/\D/g, '').trim();

const formatTime = (dateStr: string) => {
  const date = new Date(dateStr);
  if (isToday(date)) return format(date, 'HH:mm');
  if (isYesterday(date)) return 'Ontem';
  return format(date, 'dd/MM', { locale: ptBR });
};

const formatMessageTime = (dateStr: string) => {
  return format(new Date(dateStr), 'HH:mm');
};

const MessageStatusIcon: React.FC<{ status: Message['status'] }> = ({ status }) => {
  if (status === 'read') return <CheckCheck size={12} color="#3b82f6" />;
  if (status === 'delivered') return <CheckCheck size={12} color="#4a6080" />;
  if (status === 'sent') return <Check size={12} color="#4a6080" />;
  return <AlertCircle size={12} color="#ef4444" />;
};

const Conversations: React.FC = () => {
  const [contacts] = useState<Contact[]>(DEMO_CONTACTS);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(DEMO_CONTACTS[0]);
  const [search, setSearch] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [pauses, setPauses] = useState<HumanPauseRecord[]>([]);

  const loadPauses = async () => {
    try {
      const res = await fetch('/api/pauses');
      if (res.ok) {
        const data = await res.json();
        setPauses(Array.isArray(data) ? data : []);
      }
    } catch {}
  };

  useEffect(() => {
    loadPauses();
    const interval = setInterval(loadPauses, 4000);
    return () => clearInterval(interval);
  }, []);

  const messages = selectedContact ? DEMO_MESSAGES[selectedContact.id] || [] : [];
  const filteredContacts = contacts.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone_number.includes(search)
  );

  const activePause = selectedContact
    ? pauses.find(p => cleanPhone(p.phone) === cleanPhone(selectedContact.phone_number))
    : null;

  const handleResumeAI = async () => {
    if (!selectedContact) return;
    try {
      await fetch('/api/pauses/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceName: activePause?.instanceName || selectedContact.instance_id || 'atendimento_principal',
          phone: selectedContact.phone_number,
        }),
      });
      toast.success(`IA retomada para ${selectedContact.name || selectedContact.phone_number}!`);
      loadPauses();
    } catch {
      toast.error('Erro ao retomar IA.');
    }
  };

  const handlePauseAI = async () => {
    if (!selectedContact) return;
    try {
      await fetch('/api/pauses/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceName: selectedContact.instance_id || 'atendimento_principal',
          phone: selectedContact.phone_number,
          lastHumanMessage: 'Pausa acionada manualmente pelo operador na tela de conversas',
        }),
      });
      toast.success(`IA pausada por 20 minutos para ${selectedContact.name || selectedContact.phone_number}!`);
      loadPauses();
    } catch {
      toast.error('Erro ao pausar IA.');
    }
  };

  const handleSend = async () => {
    if (!messageInput.trim() || !selectedContact) return;
    const text = messageInput.trim();
    setMessageInput('');

    // Ativa ou renova a pausa de 20 minutos imediatamente
    try {
      await fetch('/api/pauses/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceName: selectedContact.instance_id || 'atendimento_principal',
          phone: selectedContact.phone_number,
          lastHumanMessage: text,
        }),
      });
      loadPauses();
      toast.success('Mensagem manual registrada! IA pausada por 20 minutos.');
    } catch {}
  };

  return (
    <div style={{ height: 'calc(100vh - 112px)', display: 'flex', gap: '0', overflow: 'hidden', borderRadius: '12px', border: '1px solid rgba(99, 179, 237, 0.1)' }}>
      {/* Contact list sidebar */}
      <div style={{
        width: '320px',
        flexShrink: 0,
        background: '#0d1526',
        borderRight: '1px solid rgba(99, 179, 237, 0.1)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '16px', borderBottom: '1px solid rgba(99, 179, 237, 0.1)' }}>
          {!isSupabaseConfigured && (
            <div style={{ fontSize: '11px', color: '#f59e0b', marginBottom: '10px', padding: '6px 8px', background: 'rgba(245, 158, 11, 0.08)', borderRadius: '6px' }}>
              🔎 Dados de demonstração
            </div>
          )}
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#4a6080' }} />
            <input
              type="text"
              className="input-field"
              placeholder="Buscar contatos..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: '32px', fontSize: '13px' }}
            />
          </div>
        </div>

        {/* Contacts */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredContacts.map(contact => {
            const isContactPaused = pauses.some(p => cleanPhone(p.phone) === cleanPhone(contact.phone_number));
            return (
              <div
                key={contact.id}
                onClick={() => setSelectedContact(contact)}
                style={{
                  display: 'flex',
                  gap: '12px',
                  padding: '14px 16px',
                  cursor: 'pointer',
                  background: selectedContact?.id === contact.id ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                  borderLeft: selectedContact?.id === contact.id ? '2px solid #3b82f6' : '2px solid transparent',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  if (selectedContact?.id !== contact.id) {
                    (e.currentTarget as HTMLDivElement).style.background = 'rgba(30, 45, 75, 0.3)';
                  }
                }}
                onMouseLeave={e => {
                  if (selectedContact?.id !== contact.id) {
                    (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                  }
                }}
              >
                {/* Avatar */}
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '16px',
                  fontWeight: 700,
                  color: 'white',
                  flexShrink: 0,
                }}>
                  {(contact.name || contact.phone_number)[0].toUpperCase()}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: '#e8f0fe', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '130px' }}>
                        {contact.name || contact.phone_number}
                      </span>
                      {isContactPaused && (
                        <span style={{
                          fontSize: '10px',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          background: 'rgba(245, 158, 11, 0.2)',
                          color: '#f59e0b',
                          border: '1px solid rgba(245, 158, 11, 0.35)',
                          fontWeight: 600,
                          marginLeft: '6px',
                          flexShrink: 0,
                        }}>
                          Humano
                        </span>
                      )}
                    </div>
                    {contact.last_message_at && (
                      <span style={{ fontSize: '11px', color: '#4a6080', flexShrink: 0, marginLeft: '8px' }}>
                        {formatTime(contact.last_message_at)}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                      fontSize: '12px',
                      color: isContactPaused ? '#f59e0b' : '#4a6080',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '170px',
                    }}>
                      {isContactPaused ? '👤 Atendimento humano (IA pausada)' : contact.last_message}
                    </span>
                    {contact.unread_count > 0 && (
                      <span style={{
                        background: '#25d366',
                        color: 'white',
                        borderRadius: '10px',
                        padding: '1px 6px',
                        fontSize: '11px',
                        fontWeight: 700,
                        flexShrink: 0,
                      }}>
                        {contact.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0a0e1a', overflow: 'hidden' }}>
        {selectedContact ? (
          <>
            {/* Chat header */}
            <div style={{
              padding: '14px 20px',
              background: '#0d1526',
              borderBottom: '1px solid rgba(99, 179, 237, 0.1)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
            }}>
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '15px',
                fontWeight: 700,
                color: 'white',
              }}>
                {(selectedContact.name || selectedContact.phone_number)[0].toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#e8f0fe' }}>
                  {selectedContact.name || selectedContact.phone_number}
                </div>
                <div style={{ fontSize: '12px', color: '#4a6080' }}>
                  {selectedContact.phone_number}
                </div>
              </div>

              {/* Status de Pausa por Atendimento Humano (Regra 12) */}
              {activePause ? (
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '20px',
                    background: 'rgba(245, 158, 11, 0.15)',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    color: '#f59e0b',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}>
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
                    <User size={13} />
                    <span>Atendimento humano — IA pausada (retomada às {format(new Date(activePause.expiresAt), 'HH:mm')})</span>
                  </div>
                  <button
                    className="btn-secondary"
                    style={{
                      padding: '5px 12px',
                      fontSize: '11px',
                      height: 'auto',
                      color: '#60a5fa',
                      borderColor: 'rgba(59, 130, 246, 0.4)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                    onClick={handleResumeAI}
                    title="Reativar respostas da IA imediatamente para este cliente"
                  >
                    <Bot size={13} /> Retomar IA agora
                  </button>
                </div>
              ) : (
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '5px 12px',
                    borderRadius: '20px',
                    background: 'rgba(37, 211, 102, 0.12)',
                    border: '1px solid rgba(37, 211, 102, 0.3)',
                    color: '#25d366',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}>
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#25d366', display: 'inline-block' }} />
                    <Bot size={13} />
                    <span>Atendendo com IA</span>
                  </div>
                  <button
                    className="btn-secondary"
                    style={{
                      padding: '5px 12px',
                      fontSize: '11px',
                      height: 'auto',
                      color: '#f59e0b',
                      borderColor: 'rgba(245, 158, 11, 0.4)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                    onClick={handlePauseAI}
                    title="Pausar o agente de IA para este cliente por 20 minutos"
                  >
                    <Clock size={13} /> Pausar IA (20 min)
                  </button>
                </div>
              )}
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {activePause && (
                <div style={{
                  padding: '8px 14px',
                  background: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  borderRadius: '8px',
                  color: '#f59e0b',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '10px',
                }}>
                  <Clock size={14} style={{ flexShrink: 0 }} />
                  <span>
                    <strong>Pausa Automática por Atendimento Humano Ativa:</strong> O proprietário enviou mensagem manual. A IA está suspensa para este contato e voltará a responder automaticamente às {format(new Date(activePause.expiresAt), 'HH:mm')} se não houver novas mensagens do atendente.
                  </span>
                </div>
              )}

              {messages.map(msg => (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: msg.sender === 'user' ? 'flex-start' : 'flex-end',
                  }}
                >
                  {/* Sender label */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    marginBottom: '4px',
                    color: '#4a6080',
                    fontSize: '11px',
                  }}>
                    {msg.sender === 'user' ? (
                      <><User size={11} /> Cliente</>
                    ) : (
                      <><Bot size={11} color="#3b82f6" /> <span style={{ color: '#60a5fa' }}>Agente IA</span></>
                    )}
                  </div>

                  {/* Bubble */}
                  <div className={msg.sender === 'user' ? 'message-bubble-received' : 'message-bubble-sent'}>
                    <div style={{ fontSize: '14px', color: '#e8f0fe', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                      {msg.content}
                    </div>
                  </div>

                  {/* Time and status */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    marginTop: '4px',
                    fontSize: '11px',
                    color: '#4a6080',
                  }}>
                    <Clock size={10} />
                    {formatMessageTime(msg.timestamp)}
                    {msg.sender !== 'user' && <MessageStatusIcon status={msg.status} />}
                  </div>
                </div>
              ))}
            </div>

            {/* Input area */}
            <div style={{
              padding: '16px 20px',
              background: '#0d1526',
              borderTop: '1px solid rgba(99, 179, 237, 0.1)',
            }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  className="input-field"
                  placeholder={activePause ? "Digite uma mensagem manual (reinicia os 20 min)..." : "Digite uma mensagem manual (pausará a IA por 20 min)..."}
                  value={messageInput}
                  onChange={e => setMessageInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                  style={{ flex: 1 }}
                />
                <button
                  className="btn-primary"
                  onClick={handleSend}
                  disabled={!messageInput.trim()}
                  style={{ padding: '10px 16px' }}
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', color: '#4a6080' }}>
            <Bot size={48} color="#4a6080" />
            <div style={{ fontSize: '16px' }}>Selecione uma conversa</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Conversations;
