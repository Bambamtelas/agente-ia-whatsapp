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
    server_url: 'https://api.doratec.site',
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
    const res = await fetch('/api/evolution/instance/fetchInstances');
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
  const res = await fetch(`/api/evolution/instance/connect/${encodeURIComponent(instanceName)}`);
  if (!res.ok) {
    throw new Error('Falha ao obter QR code');
  }
  return res.json();
}

// Criar nova instância
export async function createEvolutionInstance(instanceName: string): Promise<any> {
  const res = await fetch('/api/evolution/instance/create', {
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
  const res = await fetch(`/api/evolution/instance/restart/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
  });
  if (!res.ok) {
    throw new Error('Falha ao reiniciar instância');
  }
  return res.json();
}

// Deletar instância
export async function deleteEvolutionInstance(instanceName: string): Promise<any> {
  const res = await fetch(`/api/evolution/instance/delete/${encodeURIComponent(instanceName)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error('Falha ao excluir instância');
  }
  return res.json();
}
