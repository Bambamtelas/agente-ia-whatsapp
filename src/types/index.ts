// ============================
// TIPOS GLOBAIS DA APLICAÇÃO
// ============================

export interface AgentMediaItem {
  id: string;
  type?: 'image' | 'audio'; // 'image' (padrão) ou 'audio' (mensagem de voz gravada no WhatsApp)
  title: string;
  url: string; // URL da mídia ou Data URL base64
  trigger_prompt: string; // Instrução de quando a IA deve enviar esta mídia
  caption?: string; // Legenda opcional para a mídia no WhatsApp
  file_name?: string;
  created_at?: string;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  prompt: string;
  ai_provider: 'openai' | 'gemini' | 'anthropic' | 'groq';
  ai_model: string;
  is_active: boolean;
  media_catalog?: AgentMediaItem[];
  created_at: string;
  updated_at: string;
  user_id: string;
}

export interface WhatsAppInstance {
  id: string;
  name: string;
  server_url: string;
  api_key: string;
  connection_status: 'connected' | 'disconnected' | 'connecting' | 'qr_code';
  qr_code?: string;
  phone_number?: string;
  agent_id?: string;
  created_at: string;
  updated_at: string;
  user_id: string;
}

export interface Contact {
  id: string;
  phone_number: string;
  name?: string;
  avatar?: string;
  last_message?: string;
  last_message_at?: string;
  unread_count: number;
  instance_id: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  content: string;
  sender: 'user' | 'agent' | 'human';
  timestamp: string;
  status: 'sent' | 'delivered' | 'read' | 'error';
  phone_number: string;
  instance_id: string;
}

export interface Conversation {
  id: string;
  contact_phone: string;
  contact_name?: string;
  instance_id: string;
  agent_id?: string;
  messages: Message[];
  last_message_at: string;
  is_active: boolean;
  created_at: string;
}

export interface DashboardStats {
  total_agents: number;
  active_agents: number;
  connected_instances: number;
  total_instances: number;
  total_conversations: number;
  active_conversations: number;
  messages_today: number;
}

export interface AppSettings {
  id: string;
  user_id: string;
  openai_api_key?: string;
  gemini_api_key?: string;
  anthropic_api_key?: string;
  groq_api_key?: string;
  webhook_url?: string;
  default_ai_provider: string;
  notifications_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export type AIProvider = 'openai' | 'gemini' | 'anthropic' | 'groq';

export const AI_PROVIDERS: Record<AIProvider, { label: string; models: string[] }> = {
  openai: {
    label: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  },
  gemini: {
    label: 'Google Gemini',
    models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  },
  anthropic: {
    label: 'Anthropic Claude',
    models: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307', 'claude-3-opus-20240229'],
  },
  groq: {
    label: 'Groq',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
  },
};
