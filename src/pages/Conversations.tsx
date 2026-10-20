import React, { useState } from 'react';
import { Search, Send, Bot, User, Clock, CheckCheck, Check, AlertCircle } from 'lucide-react';

import { DEMO_CONTACTS, DEMO_MESSAGES } from '../lib/demoData';
import { isSupabaseConfigured } from '../lib/supabase';
import type { Contact, Message } from '../types';
import { format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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

  const messages = selectedContact ? DEMO_MESSAGES[selectedContact.id] || [] : [];
  const filteredContacts = contacts.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone_number.includes(search)
  );

  const handleSend = () => {
    if (!messageInput.trim()) return;
    // In real implementation, this would call the backend
    setMessageInput('');
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
          {filteredContacts.map(contact => (
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
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#e8f0fe', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }}>
                    {contact.name || contact.phone_number}
                  </span>
                  {contact.last_message_at && (
                    <span style={{ fontSize: '11px', color: '#4a6080', flexShrink: 0, marginLeft: '8px' }}>
                      {formatTime(contact.last_message_at)}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{
                    fontSize: '12px',
                    color: '#4a6080',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '170px',
                  }}>
                    {contact.last_message}
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
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0a0e1a', overflow: 'hidden' }}>
        {selectedContact ? (
          <>
            {/* Chat header */}
            <div style={{
              padding: '16px 20px',
              background: '#0d1526',
              borderBottom: '1px solid rgba(99, 179, 237, 0.1)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
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
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#4a6080' }}>
                <Bot size={14} color="#3b82f6" />
                <span>Atendendo com IA</span>
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
                      <><User size={11} /> Usuário</>
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
              <div style={{
                display: 'flex',
                gap: '10px',
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.2)',
                borderRadius: '8px',
                padding: '8px 12px',
                marginBottom: '12px',
                fontSize: '12px',
                color: '#f59e0b',
              }}>
                <AlertCircle size={13} style={{ flexShrink: 0 }} />
                Modo demonstração: mensagens reais requerem a Evolution API configurada.
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Digite uma mensagem..."
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
