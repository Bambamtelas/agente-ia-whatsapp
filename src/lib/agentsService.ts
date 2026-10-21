import { supabase, isSupabaseConfigured } from './supabase';
import { DEMO_AGENTS } from './demoData';
import type { Agent, AgentMediaItem } from '../types';

export const DEFAULT_AGENT_MEDIA: Record<string, AgentMediaItem[]> = {
  '449726e1-53d6-477f-9bed-738e654e7f77': [
    {
      id: 'img-gestor-streamings',
      title: 'Gestor de Streamings',
      url: '/uploads/media_1792515638252_h44w8.png',
      trigger_prompt: 'Envie quando o cliente perguntar sobre o Gestor de Streamings.',
      caption: '🚀 Gestor de Streamings - Gestão de clientes e cobranças automáticas no WhatsApp!',
      created_at: '2026-10-20T17:05:28.603Z',
    },
    {
      id: 'img-mvgxk5na-lh0x',
      title: 'Divulga auto 2',
      url: '/uploads/media_1792515656020_zgkrc.png',
      trigger_prompt: 'Envie quando o cliente perguntar sobre o Auto Divulga Whats.',
      caption: 'Auto Divulga Whats.',
      created_at: '2026-10-20T17:01:29.110Z',
    },
  ],
};

function getLocalMedia(agentId: string): AgentMediaItem[] | null {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(`agent_media_catalog_${agentId}`) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return null;
}

function setLocalMedia(agentId: string, items: AgentMediaItem[]) {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`agent_media_catalog_${agentId}`, JSON.stringify(items));
    }
  } catch {}
}

export async function fetchAgents(): Promise<{ agents: Agent[]; fromSupabase: boolean; error?: string }> {
  if (!isSupabaseConfigured) {
    return { agents: DEMO_AGENTS, fromSupabase: false };
  }

  try {
    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Erro ao carregar agentes do Supabase (usando demo fallback):', error.message);
      return { agents: DEMO_AGENTS, fromSupabase: false, error: error.message };
    }

    let agents = (data || []) as Agent[];

    // Enriquece com media_catalog persistente em disco e links
    try {
      const catalogsRes = await fetch('/api/media/catalogs').then(r => r.json()).catch(() => ({}));
      const linksRes = await fetch('/api/responder/links').then(r => r.json()).catch(() => []);

      agents = agents.map(a => {
        let media = a.media_catalog;
        if (!media || media.length === 0) {
          const fromCatalogFile = catalogsRes?.[a.id];
          if (Array.isArray(fromCatalogFile) && fromCatalogFile.length > 0) {
            media = fromCatalogFile;
          }
        }
        if (!media || media.length === 0) {
          if (Array.isArray(linksRes)) {
            const link = linksRes.find((l: any) => l.agentId === a.id);
            if (link?.mediaCatalog && link.mediaCatalog.length > 0) {
              media = link.mediaCatalog;
            }
          }
        }
        if (!media || media.length === 0) {
          media = getLocalMedia(a.id) || DEFAULT_AGENT_MEDIA[a.id] || [];
        }
        return { ...a, media_catalog: media || [] };
      });
    } catch {
      agents = agents.map(a => ({
        ...a,
        media_catalog: a.media_catalog || getLocalMedia(a.id) || DEFAULT_AGENT_MEDIA[a.id] || [],
      }));
    }

    return { agents, fromSupabase: true };
  } catch (err: any) {
    console.error('Falha de conexão Supabase:', err);
    return { agents: DEMO_AGENTS, fromSupabase: false, error: err.message };
  }
}

export async function fetchAgentById(id: string): Promise<Agent | null> {
  if (!isSupabaseConfigured) {
    return DEMO_AGENTS.find(a => a.id === id) || null;
  }

  try {
    const { data } = await supabase
      .from('agents')
      .select('*')
      .eq('id', id)
      .single();

    let agent = (data as Agent) || DEMO_AGENTS.find(a => a.id === id) || null;
    if (!agent) return null;

    // Busca mídias do catálogo persistente em disco
    try {
      const catRes = await fetch(`/api/media/catalog/${id}`).then(r => r.json()).catch(() => ({}));
      if (catRes?.success && Array.isArray(catRes.catalog) && catRes.catalog.length > 0) {
        agent = { ...agent, media_catalog: catRes.catalog };
      } else if (!agent.media_catalog || agent.media_catalog.length === 0) {
        const linksRes = await fetch('/api/responder/links').then(r => r.json()).catch(() => []);
        const link = Array.isArray(linksRes) ? linksRes.find((l: any) => l.agentId === id) : null;
        if (link?.mediaCatalog && link.mediaCatalog.length > 0) {
          agent = { ...agent, media_catalog: link.mediaCatalog };
        }
      }
    } catch {}

    // Fallback garantido por localStorage ou catálogo padrão do agente
    if (!agent.media_catalog || agent.media_catalog.length === 0) {
      const fallbackMedia = getLocalMedia(id) || DEFAULT_AGENT_MEDIA[id];
      if (fallbackMedia) {
        agent = { ...agent, media_catalog: fallbackMedia };
      }
    }

    return agent;
  } catch {
    const fallback = DEMO_AGENTS.find(a => a.id === id) || null;
    if (fallback && (!fallback.media_catalog || fallback.media_catalog.length === 0)) {
      fallback.media_catalog = getLocalMedia(id) || DEFAULT_AGENT_MEDIA[id] || [];
    }
    return fallback;
  }
}

export async function saveAgent(agent: Partial<Agent> & { name: string; prompt: string }): Promise<Agent> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase não configurado');
  }

  const payload: any = {
    name: agent.name,
    description: agent.description || '',
    prompt: agent.prompt,
    ai_provider: agent.ai_provider || 'gemini',
    ai_model: agent.ai_model || 'gemini-3.5-flash-lite',
    is_active: agent.is_active ?? true,
    updated_at: new Date().toISOString(),
  };

  let savedData: Agent;
  const isUpdate = Boolean(agent.id && agent.id !== 'new');

  try {
    // Tenta primeiro com media_catalog
    const fullPayload = { ...payload, media_catalog: agent.media_catalog || [] };
    const query = isUpdate
      ? supabase.from('agents').update(fullPayload).eq('id', agent.id).select().single()
      : supabase.from('agents').insert([{ ...fullPayload, created_at: new Date().toISOString() }]).select().single();

    const { data, error } = await query;
    if (error) throw error;
    savedData = data as Agent;
  } catch (err: any) {
    // Se o PostgREST ainda estiver com cache de colunas antigo, salva sem media_catalog no Supabase
    if (err.message?.includes('media_catalog') || err.code === 'PGRST204') {
      console.warn('[AgentsService] PostgREST schema cache ainda não sincronizou media_catalog. Salvando dados no Supabase e persistindo mídias via serviço local...');
      const fallbackQuery = isUpdate
        ? supabase.from('agents').update(payload).eq('id', agent.id).select().single()
        : supabase.from('agents').insert([{ ...payload, created_at: new Date().toISOString() }]).select().single();

      const { data, error } = await fallbackQuery;
      if (error) throw new Error(error.message);
      savedData = { ...(data as Agent), media_catalog: agent.media_catalog || [] };
    } else {
      throw err;
    }
  }

  // Persiste o catálogo de mídias no serviço de mídia em disco e localStorage
  if (savedData.id && agent.media_catalog) {
    setLocalMedia(savedData.id, agent.media_catalog);
    try {
      await fetch(`/api/media/catalog/${savedData.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agent.media_catalog),
      });
    } catch {}
  }

  // Sincroniza o catálogo de mídias e prompt com o servidor do robô em background
  try {
    await fetch('/api/responder/update-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: savedData.id,
        prompt: savedData.prompt,
        mediaCatalog: agent.media_catalog || [],
      }),
    });
  } catch {}

  return savedData;
}

export async function deleteAgent(id: string): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase não configurado');
  }

  const { error } = await supabase
    .from('agents')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}

export async function toggleAgentStatus(id: string, is_active: boolean): Promise<void> {
  if (!isSupabaseConfigured) return;

  const { error } = await supabase
    .from('agents')
    .update({ is_active, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(error.message);
}
