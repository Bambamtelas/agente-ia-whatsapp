import type { WhatsAppInstance } from '../types';

export interface EvolutionRawInstance {
  id: string;
  name: string;
  connectionStatus: 'open' | 'close' | 'connecting' | string;
  ownerJid?: string | null;
  profileName?: string | null;
  profilePicUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
  _count?: {
    Message: number;
    Contact: number;
    Chat: number;
  };
}

const EVOLUTION_API_URL = (
  (import.meta as any).env?.VITE_EVOLUTION_API_URL ||
  (import.meta as any).env?.EVOLUTION_API_URL ||
  'https://api.doratec.site'
).replace(/\/$/, '');

const EVOLUTION_API_KEY =
  (import.meta as any).env?.VITE_EVOLUTION_API_KEY ||
  (import.meta as any).env?.EVOLUTION_API_KEY ||
  '1003be981b063ae8c3146ba09557a56245312581afb4891d36c316281665eb28';

async function evolutionFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const headers = {
    'apikey': EVOLUTION_API_KEY,
    ...(options.headers as Record<string, string> || {}),
  };

  // Tenta chamada direta à Evolution API (doratec.site com CORS habilitado)
  try {
    const directUrl = `${EVOLUTION_API_URL}${endpoint}`;
    const directRes = await fetch(directUrl, { ...options, headers });
    if (directRes.ok || directRes.status < 500) {
      return directRes;
    }
  } catch (err) {
    console.warn('[Evolution API] Chamada direta falhou, tentando fallback local...', err);
  }

  // Fallback via proxy local /api/evolution/
  const proxyUrl = `/api/evolution${endpoint}`;
  return fetch(proxyUrl, options);
}

export function mapEvolutionToInstance(raw: EvolutionRawInstance): WhatsAppInstance {
  const statusMap: Record<string, WhatsAppInstance['connection_status']> = {
    open: 'connected',
    close: 'disconnected',
    connecting: 'connecting',
  };

  const cleanPhone = raw.ownerJid ? raw.ownerJid.replace('@s.whatsapp.net', '') : undefined;

  return {
    id: raw.id,
    name: raw.profileName ? `${raw.name} (${raw.profileName})` : raw.name,
    server_url: EVOLUTION_API_URL,
    api_key: '••••••••',
    connection_status: statusMap[raw.connectionStatus] || 'disconnected',
    phone_number: cleanPhone,
    created_at: raw.createdAt || new Date().toISOString(),
    updated_at: raw.updatedAt || new Date().toISOString(),
    user_id: 'user_default',
  };
}

// Buscar todas as instâncias da Evolution API
export async function fetchEvolutionInstances(): Promise<{ instances: WhatsAppInstance[]; raw: EvolutionRawInstance[] }> {
  try {
    const res = await evolutionFetch('/instance/fetchInstances');
    if (!res.ok) {
      throw new Error(`Erro ${res.status}: Não foi possível carregar as instâncias`);
    }
    const rawData = await res.json();
    const rawList: EvolutionRawInstance[] = Array.isArray(rawData) ? rawData : [];
    const instances = rawList.map(mapEvolutionToInstance);
    return { instances, raw: rawList };
  } catch (error) {
    console.error('Erro ao buscar instâncias Evolution API:', error);
    throw error;
  }
}

// Obter QR Code de conexão
export async function getEvolutionQRCode(instanceName: string): Promise<{ base64?: string; pairingCode?: string; code?: string }> {
  const res = await evolutionFetch(`/instance/connect/${encodeURIComponent(instanceName)}`);
  if (!res.ok) {
    throw new Error('Falha ao obter QR code');
  }
  return res.json();
}

// Criar nova instância
export async function createEvolutionInstance(instanceName: string): Promise<any> {
  const res = await evolutionFetch('/instance/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
    }),
  });
  if (!res.ok) {
    const err: any = await res.json().catch(() => ({}));
    let msg = 'Falha ao criar instância';
    if (Array.isArray(err.response?.message)) {
      msg = err.response.message.join(', ');
    } else if (typeof err.response?.message === 'string') {
      msg = err.response.message;
    } else if (err.message) {
      msg = err.message;
    }
    throw new Error(msg);
  }
  return res.json();
}

// Reiniciar instância
export async function restartEvolutionInstance(instanceName: string): Promise<any> {
  const res = await evolutionFetch(`/instance/restart/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
  });
  if (!res.ok) {
    throw new Error('Falha ao reiniciar instância');
  }
  return res.json();
}

// Deletar instância
export async function deleteEvolutionInstance(instanceName: string): Promise<any> {
  const res = await evolutionFetch(`/instance/delete/${encodeURIComponent(instanceName)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error('Falha ao excluir instância');
  }
  return res.json();
}

// Configurar Webhook na instância Evolution API
export async function setEvolutionWebhook(instanceName: string, webhookUrl: string): Promise<any> {
  const res = await evolutionFetch(`/webhook/set/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        byEvents: false,
        base64: false,
        events: ['MESSAGES_UPSERT', 'SEND_MESSAGE'],
      },
    }),
  });
  if (!res.ok) {
    const err: any = await res.json().catch(() => ({}));
    throw new Error(err.message || err.response?.message || 'Falha ao configurar webhook');
  }
  return res.json();
}

// Consultar Webhook da instância Evolution API
export async function findEvolutionWebhook(instanceName: string): Promise<any> {
  const res = await evolutionFetch(`/webhook/find/${encodeURIComponent(instanceName)}`);
  if (!res.ok) return null;
  return res.json();
}

