// =====================================
// DADOS DE DEMONSTRAÇÃO
// Estes dados são usados apenas enquanto
// as integrações reais não estão configuradas.
// =====================================

import type { Agent, WhatsAppInstance, Contact, Message, DashboardStats } from '../types';

export const DEMO_AGENTS: Agent[] = [
  {
    id: 'demo-agent-1',
    name: 'Suporte ao Cliente',
    description: 'Agente especializado em atendimento ao cliente, responde dúvidas sobre produtos e serviços.',
    prompt: `Você é um assistente de suporte ao cliente da empresa XYZ. Seu objetivo é ajudar os clientes com dúvidas sobre produtos e serviços.

Diretrizes:
- Seja sempre educado e profissional
- Responda em português do Brasil
- Se não souber a resposta, informe que irá verificar e retornar
- Não faça promessas que não podem ser cumpridas

Horário de atendimento: Segunda a Sexta, 08h às 18h`,
    ai_provider: 'openai',
    ai_model: 'gpt-4o-mini',
    is_active: true,
    created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    user_id: 'demo-user',
  },
  {
    id: 'demo-agent-2',
    name: 'Vendas e Captação',
    description: 'Agente focado em apresentar produtos, tirar dúvidas comerciais e encaminhar para equipe de vendas.',
    prompt: `Você é um consultor de vendas da empresa XYZ. Seu objetivo é apresentar os produtos de forma atraente e ajudar o cliente a encontrar a melhor solução.

Diretrizes:
- Identifique as necessidades do cliente antes de apresentar soluções
- Destaque os benefícios, não apenas as funcionalidades
- Seja proativo em oferecer demonstrações
- Colete informações de contato para seguimento`,
    ai_provider: 'gemini',
    ai_model: 'gemini-2.0-flash',
    is_active: false,
    created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    user_id: 'demo-user',
  },
];

export const DEMO_INSTANCES: WhatsAppInstance[] = [
  {
    id: 'demo-instance-1',
    name: 'WhatsApp Principal',
    server_url: 'https://api.evolution.example.com',
    api_key: '••••••••••••••••',
    connection_status: 'connected',
    phone_number: '+55 11 99999-9999',
    agent_id: 'demo-agent-1',
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    user_id: 'demo-user',
  },
  {
    id: 'demo-instance-2',
    name: 'WhatsApp Vendas',
    server_url: 'https://api.evolution.example.com',
    api_key: '••••••••••••••••',
    connection_status: 'disconnected',
    agent_id: 'demo-agent-2',
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    user_id: 'demo-user',
  },
];

export const DEMO_CONTACTS: Contact[] = [
  {
    id: 'contact-1',
    phone_number: '+55 11 98888-1111',
    name: 'Maria Silva',
    last_message: 'Obrigada pelo atendimento!',
    last_message_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    unread_count: 0,
    instance_id: 'demo-instance-1',
  },
  {
    id: 'contact-2',
    phone_number: '+55 21 97777-2222',
    name: 'João Santos',
    last_message: 'Quando vocês têm disponibilidade?',
    last_message_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    unread_count: 2,
    instance_id: 'demo-instance-1',
  },
  {
    id: 'contact-3',
    phone_number: '+55 31 96666-3333',
    name: 'Ana Costa',
    last_message: 'Gostaria de saber mais sobre o produto',
    last_message_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    unread_count: 1,
    instance_id: 'demo-instance-1',
  },
  {
    id: 'contact-4',
    phone_number: '+55 41 95555-4444',
    name: 'Carlos Oliveira',
    last_message: 'Ok, vou aguardar o retorno',
    last_message_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    unread_count: 0,
    instance_id: 'demo-instance-1',
  },
];

export const DEMO_MESSAGES: Record<string, Message[]> = {
  'contact-1': [
    {
      id: 'msg-1',
      conversation_id: 'conv-1',
      content: 'Olá, preciso de ajuda com meu pedido',
      sender: 'user',
      timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      status: 'read',
      phone_number: '+55 11 98888-1111',
      instance_id: 'demo-instance-1',
    },
    {
      id: 'msg-2',
      conversation_id: 'conv-1',
      content: 'Olá, Maria! Fico feliz em ajudar. Poderia me informar o número do seu pedido?',
      sender: 'agent',
      timestamp: new Date(Date.now() - 59 * 60 * 1000).toISOString(),
      status: 'read',
      phone_number: '+55 11 98888-1111',
      instance_id: 'demo-instance-1',
    },
    {
      id: 'msg-3',
      conversation_id: 'conv-1',
      content: 'Meu pedido é #12345',
      sender: 'user',
      timestamp: new Date(Date.now() - 58 * 60 * 1000).toISOString(),
      status: 'read',
      phone_number: '+55 11 98888-1111',
      instance_id: 'demo-instance-1',
    },
    {
      id: 'msg-4',
      conversation_id: 'conv-1',
      content: 'Encontrei seu pedido #12345. Ele foi despachado ontem e deve chegar em até 2 dias úteis. Você receberá um SMS com o código de rastreamento.',
      sender: 'agent',
      timestamp: new Date(Date.now() - 55 * 60 * 1000).toISOString(),
      status: 'read',
      phone_number: '+55 11 98888-1111',
      instance_id: 'demo-instance-1',
    },
    {
      id: 'msg-5',
      conversation_id: 'conv-1',
      content: 'Obrigada pelo atendimento!',
      sender: 'user',
      timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      status: 'read',
      phone_number: '+55 11 98888-1111',
      instance_id: 'demo-instance-1',
    },
  ],
  'contact-2': [
    {
      id: 'msg-6',
      conversation_id: 'conv-2',
      content: 'Boa tarde! Vocês têm o produto X em estoque?',
      sender: 'user',
      timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      status: 'read',
      phone_number: '+55 21 97777-2222',
      instance_id: 'demo-instance-1',
    },
    {
      id: 'msg-7',
      conversation_id: 'conv-2',
      content: 'Boa tarde, João! Sim, temos disponível. Gostaria de mais informações sobre preço e condições?',
      sender: 'agent',
      timestamp: new Date(Date.now() - 2.9 * 60 * 60 * 1000).toISOString(),
      status: 'read',
      phone_number: '+55 21 97777-2222',
      instance_id: 'demo-instance-1',
    },
    {
      id: 'msg-8',
      conversation_id: 'conv-2',
      content: 'Sim! Quando vocês têm disponibilidade?',
      sender: 'user',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      status: 'delivered',
      phone_number: '+55 21 97777-2222',
      instance_id: 'demo-instance-1',
    },
  ],
};

export const DEMO_STATS: DashboardStats = {
  total_agents: 2,
  active_agents: 1,
  connected_instances: 1,
  total_instances: 2,
  total_conversations: 47,
  active_conversations: 3,
  messages_today: 128,
};
