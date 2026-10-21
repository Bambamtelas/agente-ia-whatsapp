import { generateAIResponse } from './aiEngine.ts';
import fs from 'node:fs';
import path from 'node:path';
import { humanPauseManager, normalizePhone } from './humanPauseManager.ts';

declare const process: any;
declare const globalThis: any;

export interface AgentMediaItem {
  id: string;
  type?: 'image' | 'audio';
  title: string;
  url: string; // URL da mídia ou Data URL base64
  trigger_prompt: string; // Instrução de quando a IA deve enviar esta mídia
  caption?: string; // Legenda/texto opcional para a mídia no WhatsApp
  file_name?: string;
  created_at?: string;
}

export interface LinkedAgentConfig {
  instanceName: string;
  agentId: string;
  agentName: string;
  prompt: string;
  provider: string;
  model: string;
  enabled: boolean;
  mediaCatalog?: AgentMediaItem[];
}

export interface ActivityLog {
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

const LINKS_FILE = path.resolve(process.cwd(), '.responder-links.json');
const SEEN_FILE = path.resolve(process.cwd(), '.responder-seen.json');
const LOCK_FILE = path.resolve(process.cwd(), '.responder.lock');

// Limpa qualquer timer órfão decorrente de recargas do Vite HMR
if (globalThis.__autoResponderTimer) {
  try {
    clearInterval(globalThis.__autoResponderTimer);
    console.log('[AutoResponder] 🧹 Timer anterior cancelado.');
  } catch {}
  globalThis.__autoResponderTimer = null;
}

function getEnvKey(key: string): string {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith(`${key}=`)) {
          const val = trimmed.substring(key.length + 1).trim();
          if (val && !val.startsWith('AIzaSy...') && !val.startsWith('sk-...')) {
            return val;
          }
        }
      }
    }
  } catch {}
  return process.env[key] || '';
}

function acquireLock(): boolean {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const content = fs.readFileSync(LOCK_FILE, 'utf-8').trim();
      const existingPid = parseInt(content, 10);
      if (existingPid && existingPid !== process.pid) {
        try {
          process.kill(existingPid, 0); // Verifica se o processo ainda existe no SO
          return false; // Outro processo ativo detém a trava
        } catch {
          // Processo anterior morreu, assume o controle
        }
      }
    }
    fs.writeFileSync(LOCK_FILE, String(process.pid), 'utf-8');
    return true;
  } catch {
    return true;
  }
}

function splitIntoMessages(fullText: string): string[] {
  if (!fullText) return [];
  const cleaned = fullText.replace(/\r\n/g, '\n').trim();
  const rawParagraphs = cleaned.split(/\n{2,}/);
  const messages: string[] = [];

  for (let p of rawParagraphs) {
    p = p.trim();
    if (!p) continue;

    // Se o parágrafo for muito longo (> 350 caracteres) e não for lista com marcadores, divide por frases
    if (p.length > 350 && !p.includes('\n-') && !p.includes('\n*')) {
      const sentences = p.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÀÂÊÔÃÕ0-9"'])/);
      let chunk = '';
      for (const s of sentences) {
        if ((chunk + ' ' + s).trim().length > 250) {
          if (chunk) messages.push(chunk.trim());
          chunk = s;
        } else {
          chunk = chunk ? `${chunk} ${s}` : s;
        }
      }
      if (chunk) messages.push(chunk.trim());
    } else {
      messages.push(p);
    }
  }

  // Se por algum motivo veio tudo junto com mais de 300 caracteres e quebras simples \n
  if (messages.length === 1 && messages[0].length > 300) {
    const lines = messages[0].split(/\n+/).map(l => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      return lines;
    }
  }

  return messages.length > 0 ? messages : [fullText];
}

function buildPromptWithMedia(basePrompt: string, mediaCatalog?: AgentMediaItem[]): string {
  const formattingInstruction = `
---
## REGRA DE FORMATO PARA WHATSAPP (MENSAGENS SEPARADAS):
- Escreva como uma pessoa real conversando no WhatsApp: mensagens naturais, dinâmicas e fluidas.
- NUNCA envie tudo amontoado em um único bloco de texto gigante.
- Separe suas respostas sempre em parágrafos usando LINHAS EM BRANCO DUPLAS (\\n\\n).
  Exemplo:
  Primeiro parágrafo: cumprimento ou resposta direta à dúvida.
  
  Segundo parágrafo: explicação dos benefícios ou preço.
  
  Terceiro parágrafo: link ou convite para o teste grátis.
- Cada parágrafo será disparado pelo sistema como um balão de mensagem SEPARADO para o cliente.
---`;

  let prompt = `${basePrompt}\n${formattingInstruction}`;

  if (!mediaCatalog || mediaCatalog.length === 0) {
    return prompt;
  }

  const mediaList = mediaCatalog.map((item, idx) => {
    const isAudio = item.type === 'audio';
    const trigger = item.trigger_prompt || 'Quando o cliente solicitar ou demonstrar interesse';
    const tag = isAudio ? `[ENVIAR_AUDIO: ${item.id}]` : `[ENVIAR_IMAGEM: ${item.id}]`;
    const typeLabel = isAudio ? '🎙️ ÁUDIO / MENSAGEM DE VOZ' : '🖼️ IMAGEM / BANNER';
    return `[MÍDIA #${idx + 1}]
- TIPO: ${typeLabel}
- ID: "${item.id}"
- Título: "${item.title}"
- Quando enviar: ${trigger}
${item.caption ? `- Descrição / Legenda: "${item.caption}"` : ''}
- Comando para disparar: ${tag}`;
  }).join('\n\n');

  return `${prompt}

---
## CATÁLOGO DE MÍDIAS OFICIAIS DISPONÍVEIS (IMAGENS E ÁUDIOS):
Você tem acesso às seguintes mídias oficiais cadastradas para enviar ao cliente no WhatsApp quando a conversa solicitar:

${mediaList}

REGRAS OBRIGATÓRIAS DE ENVIO DE MÍDIAS:
1. Analise cuidadosamente a mensagem do cliente e o contexto da conversa.
2. IMAGENS: Quando a solicitação do cliente corresponder ao campo "Quando enviar" de uma imagem (exemplo: cliente pediu para ver os planos, pediu tabela de preços, fotos, banners ou demonstrou interesse no produto), você DEVE responder em texto de forma natural e incluir no final da sua mensagem a tag de disparo correspondente:
   [ENVIAR_IMAGEM: ID_DA_IMAGEM]
   Exemplo: Se o cliente perguntar os valores do plano, responda com o texto explicativo e termine com: [ENVIAR_IMAGEM: ID_DA_IMAGEM]
3. ÁUDIOS DE VOZ: Quando a solicitação corresponder ao campo "Quando enviar" de um áudio (exemplo: cliente perguntou "como funciona", pediu uma explicação detalhada ou áudio explicativo), você DEVE responder com uma introdução natural (exemplo: "Vou te mandar um áudio aqui explicando certinho como funciona:") e incluir no final da mensagem a tag:
   [ENVIAR_AUDIO: ID_DO_AUDIO]
4. O sistema irá automaticamente detectar essas tags, removê-las do texto visível e enviar o arquivo de áudio como mensagem de voz gravada ou a imagem diretamente para o WhatsApp do cliente.
---`;
}

interface ChatDebounceBuffer {
  timer: any;
  messages: Array<{ id: string; keyId: string; text: string; timestamp: number }>;
  senderName: string;
  link: LinkedAgentConfig;
  conversationHistory: Array<{ role: 'user' | 'assistant'; text: string }>;
}

class AutoResponderService {
  private links: Map<string, LinkedAgentConfig> = new Map();
  private seenMessageIds: Set<string> = new Set();
  private lastChatTimestamps: Map<string, number> = new Map();
  private processingChats: Set<string> = new Set();
  private debounceBuffers: Map<string, ChatDebounceBuffer> = new Map();
  private activityLogs: ActivityLog[] = [];
  private isPolling = false;
  private lastInteractionTimestamps: Map<string, number> = new Map();
  private chatLastActiveLink: Map<string, LinkedAgentConfig> = new Map();
  private chatSenderNames: Map<string, string> = new Map();
  private closedChats: Set<string> = new Set();
  private chatCloseTimers: Map<string, any> = new Map();
  private readonly INACTIVITY_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutos sem conversa

  constructor() {
    this.loadLinksFromDisk();
    this.loadSeenFromDisk();
  }

  private loadLinksFromDisk() {
    try {
      if (fs.existsSync(LINKS_FILE)) {
        const raw = fs.readFileSync(LINKS_FILE, 'utf-8');
        const list: LinkedAgentConfig[] = JSON.parse(raw);
        if (Array.isArray(list)) {
          // Também lê os catálogos persistentes de mídias para enriquecer os links
          const catalogsFile = path.resolve(process.cwd(), '.agent-media-catalogs.json');
          let allCatalogs: Record<string, any[]> = {};
          if (fs.existsSync(catalogsFile)) {
            try { allCatalogs = JSON.parse(fs.readFileSync(catalogsFile, 'utf-8')); } catch {}
          }

          list.forEach(c => {
            if ((!c.mediaCatalog || c.mediaCatalog.length === 0) && allCatalogs[c.agentId]) {
              c.mediaCatalog = allCatalogs[c.agentId];
            }
            this.links.set(c.instanceName, c);
          });
          console.log(`[AutoResponder] Carregados ${list.length} vínculos de instâncias do disco.`);
        }
      }
    } catch (err: any) {
      console.warn('[AutoResponder] Não foi possível carregar links do disco:', err.message);
    }
  }

  private loadSeenFromDisk() {
    try {
      if (fs.existsSync(SEEN_FILE)) {
        const raw = fs.readFileSync(SEEN_FILE, 'utf-8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.seenMessageIds)) {
          data.seenMessageIds.forEach((id: string) => this.seenMessageIds.add(id));
        }
        if (data.lastChatTimestamps && typeof data.lastChatTimestamps === 'object') {
          for (const [phone, ts] of Object.entries(data.lastChatTimestamps)) {
            this.lastChatTimestamps.set(phone, Number(ts));
          }
        }
        console.log(`[AutoResponder] Histórico carregado: ${this.seenMessageIds.size} IDs e ${this.lastChatTimestamps.size} chats rastreados.`);
      }
    } catch (err: any) {
      console.warn('[AutoResponder] Erro ao carregar arquivo de vistos:', err.message);
    }
  }

  private saveSeenToDisk() {
    try {
      const idsArray = Array.from(this.seenMessageIds).slice(-2000);
      const timestampsObj: Record<string, number> = {};
      for (const [phone, ts] of this.lastChatTimestamps.entries()) {
        timestampsObj[phone] = ts;
      }
      fs.writeFileSync(
        SEEN_FILE,
        JSON.stringify({ seenMessageIds: idsArray, lastChatTimestamps: timestampsObj }, null, 2),
        'utf-8'
      );
    } catch (err: any) {
      console.warn('[AutoResponder] Erro ao salvar vistos no disco:', err.message);
    }
  }

  private saveLinksToDisk() {
    try {
      const list = Array.from(this.links.values());
      fs.writeFileSync(LINKS_FILE, JSON.stringify(list, null, 2), 'utf-8');
    } catch (err: any) {
      console.warn('[AutoResponder] Erro ao salvar links:', err.message);
    }
  }

  public linkInstance(config: LinkedAgentConfig) {
    this.links.set(config.instanceName, config);
    this.saveLinksToDisk();
    console.log(`[AutoResponder] Instância "${config.instanceName}" vinculada ao agente "${config.agentName}" (Ativo: ${config.enabled}, Mídias: ${config.mediaCatalog?.length || 0})`);
    if (config.enabled && !globalThis.__autoResponderTimer) {
      this.startPolling();
    }
  }

  public unlinkInstance(instanceName: string) {
    this.links.delete(instanceName);
    this.saveLinksToDisk();
    console.log(`[AutoResponder] Instância "${instanceName}" desvinculada.`);
  }

  public updateAgentData(agentId: string, prompt?: string, mediaCatalog?: AgentMediaItem[]) {
    let updated = false;
    for (const link of this.links.values()) {
      if (link.agentId === agentId) {
        if (prompt !== undefined) link.prompt = prompt;
        if (mediaCatalog !== undefined) link.mediaCatalog = mediaCatalog;
        updated = true;
        console.log(`[AutoResponder] 🔄 Instância "${link.instanceName}" atualizada com novo prompt e ${link.mediaCatalog?.length || 0} mídias.`);
      }
    }
    if (updated) {
      this.saveLinksToDisk();
    }
  }

  public getLinks(): LinkedAgentConfig[] {
    return Array.from(this.links.values());
  }

  public getLogs(): ActivityLog[] {
    return this.activityLogs.slice(-50);
  }

  public startPolling() {
    if (globalThis.__autoResponderTimer) return;

    if (process.argv?.some((arg: string) => arg.includes('build'))) {
      return;
    }

    if (!acquireLock()) {
      console.log(`[AutoResponder] 🔒 Trava de processo ativa por outra instância (PID diferente). Polling em espera.`);
      return;
    }

    globalThis.__autoResponderTimer = setInterval(() => {
      this.checkNewMessages();
    }, 3500);
    console.log('[AutoResponder] 🚀 Motor de atendimento INICIADO (Debounce de digitação e Suporte a Mídias ativos).');
  }

  public stopPolling() {
    if (globalThis.__autoResponderTimer) {
      clearInterval(globalThis.__autoResponderTimer);
      globalThis.__autoResponderTimer = null;
      console.log('[AutoResponder] ⏸️ Motor de atendimento PAUSADO.');
    }
  }

  private async checkNewMessages() {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      if (!acquireLock()) {
        this.stopPolling();
        return;
      }

      const activeLinks = Array.from(this.links.values()).filter(l => l.enabled);
      for (const link of activeLinks) {
        await this.pollInstanceMessages(link);
      }

      // Verifica encerramento de conversas inativas há mais de 20 minutos
      await this.checkInactivityTimeouts();
    } catch (err: any) {
      console.error('[AutoResponder Error]', err?.message || err);
    } finally {
      this.isPolling = false;
    }
  }

  // Verifica periodicamente se algum contato ficou 20 minutos sem resposta
  private async checkInactivityTimeouts() {
    const now = Date.now();
    for (const [phone, lastTime] of this.lastInteractionTimestamps.entries()) {
      if (!this.closedChats.has(phone) && (now - lastTime >= this.INACTIVITY_TIMEOUT_MS)) {
        const link = this.chatLastActiveLink.get(phone);
        const sender = this.chatSenderNames.get(phone) || 'Cliente';
        if (link) {
          await this.closeChatDueToInactivity(phone, link, sender);
        }
      }
    }
  }

  // Agenda encerramento após 20 minutos sem mensagem do cliente
  private scheduleInactivityClose(targetPhone: string, link: LinkedAgentConfig, senderName: string) {
    if (this.chatCloseTimers.has(targetPhone)) {
      clearTimeout(this.chatCloseTimers.get(targetPhone));
    }

    const timer = setTimeout(async () => {
      await this.closeChatDueToInactivity(targetPhone, link, senderName);
    }, this.INACTIVITY_TIMEOUT_MS);

    this.chatCloseTimers.set(targetPhone, timer);
  }

  // Executa o encerramento da conversa por inatividade
  private async closeChatDueToInactivity(targetPhone: string, link: LinkedAgentConfig, senderName: string) {
    if (this.closedChats.has(targetPhone)) return;

    // Se o contato está com atendimento humano ativo, não envia encerramento automático
    if (humanPauseManager.isPaused(link.instanceName, targetPhone)) {
      return;
    }

    if (this.chatCloseTimers.has(targetPhone)) {
      clearTimeout(this.chatCloseTimers.get(targetPhone));
      this.chatCloseTimers.delete(targetPhone);
    }

    this.closedChats.add(targetPhone);
    console.log(`[AutoResponder] ⏱️ 20 minutos sem interação com +${targetPhone} (${senderName}). Encerrando atendimento...`);

    const apiUrl = getEnvKey('EVOLUTION_API_URL').replace(/\/$/, '') || 'https://api.doratec.site';
    const apiKey = getEnvKey('EVOLUTION_API_KEY');

    const farewellMessage = `Olá, ${senderName}! Como não tivemos retorno por aqui nos últimos 20 minutos, estou encerrando este atendimento.\n\nCaso precise de qualquer informação ou queira continuar, basta me enviar uma nova mensagem a qualquer momento! Tenha um ótimo dia! 👋`;

    try {
      // 1. Simula presença "digitando..."
      await fetch(`${apiUrl}/chat/sendPresence/${encodeURIComponent(link.instanceName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
        body: JSON.stringify({ number: targetPhone, presence: 'composing', delay: 1800 }),
      }).catch(() => {});

      await new Promise(resolve => setTimeout(resolve, 1500));

      // 2. Envia balão de encerramento amigável
      const res = await fetch(`${apiUrl}/message/sendText/${encodeURIComponent(link.instanceName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
        body: JSON.stringify({ number: targetPhone, text: farewellMessage }),
      });

      if (res.ok) {
        const fareData: any = await res.json().catch(() => ({}));
        const fareId = fareData?.key?.id || fareData?.id;
        humanPauseManager.registerAiSentMessage(fareId, link.instanceName, targetPhone);
        console.log(`[AutoResponder] ✅ Atendimento encerrado com mensagem de despedida enviada para +${targetPhone}`);
      }

      this.activityLogs.push({
        id: Math.random().toString(36).substring(2),
        timestamp: new Date().toISOString(),
        instanceName: link.instanceName,
        agentName: link.agentName,
        senderPhone: targetPhone,
        senderName,
        userMessage: '[Inatividade de 20 minutos]',
        aiResponse: farewellMessage,
        status: 'success',
      });
    } catch (err: any) {
      console.error(`[AutoResponder] Falha ao enviar encerramento para +${targetPhone}:`, err.message);
    }
  }

  private async pollInstanceMessages(link: LinkedAgentConfig) {
    const apiUrl = getEnvKey('EVOLUTION_API_URL').replace(/\/$/, '') || 'https://api.doratec.site';
    const apiKey = getEnvKey('EVOLUTION_API_KEY');

    try {
      const res = await fetch(`${apiUrl}/chat/findMessages/${encodeURIComponent(link.instanceName)}?page=1`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey,
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        return;
      }

      const data: any = await res.json();
      const messages: any[] = data?.messages?.records || (Array.isArray(data) ? data : []);
      if (!messages.length) return;

      for (const msg of messages) {
        await this.processSingleMessage(msg, link, messages);
      }
    } catch (err: any) {
      console.error(`[AutoResponder] Falha ao verificar mensagens de ${link.instanceName}:`, err.message);
    }
  }

  /**
   * Processa uma única mensagem recebida via Polling ou Webhook da Evolution API
   */
  public async processSingleMessage(
    msg: any,
    link?: LinkedAgentConfig,
    contextMessages?: any[],
    explicitInstanceName?: string
  ) {
    if (!msg || !msg.key) return;

    const msgId = msg.id || '';
    const keyId = msg.key?.id || '';
    const fromMe = Boolean(msg.key?.fromMe);
    const msgTimestamp = Number(msg.messageTimestamp) || 0;

    const remoteJid = msg.key?.remoteJid || '';
    if (remoteJid.includes('@broadcast') || remoteJid.includes('@g.us')) {
      if (msgId) this.seenMessageIds.add(msgId);
      if (keyId) this.seenMessageIds.add(keyId);
      return;
    }

    let targetPhone = msg.key?.remoteJidAlt || msg.key?.remoteJid || '';
    targetPhone = normalizePhone(targetPhone);
    if (!targetPhone) return;

    if ((msgId && this.seenMessageIds.has(msgId)) || (keyId && this.seenMessageIds.has(keyId))) {
      return;
    }

    const instanceName = link?.instanceName || explicitInstanceName || '';

    // =========================================================================
    // 1. DETECÇÃO DE MENSAGEM MANUAL DO OPERADOR HUMANO (fromMe: true)
    // =========================================================================
    if (fromMe) {
      if (msgId) this.seenMessageIds.add(msgId);
      if (keyId) this.seenMessageIds.add(keyId);
      this.saveSeenToDisk();

      // Verifica se essa mensagem enviada foi disparada pela própria IA
      const isAi = humanPauseManager.isAiSentMessage(msgId || keyId, instanceName, targetPhone, msgTimestamp * 1000);
      if (isAi) {
        // Mensagem da própria IA: ignora sem pausar
        return;
      }

      // Mensagem enviada MANUALMENTE pelo proprietário/atendente no WhatsApp!
      const textContent = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        ''
      ).trim();

      // Ativa ou reinicia a pausa de 20 minutos para este contato
      const pauseRecord = humanPauseManager.setPause(instanceName, targetPhone, textContent);

      // Cancela qualquer resposta da IA que estava no buffer de espera
      const pendingBuffer = this.debounceBuffers.get(targetPhone);
      if (pendingBuffer?.timer) {
        clearTimeout(pendingBuffer.timer);
      }
      this.debounceBuffers.delete(targetPhone);

      // Cancela qualquer timer de encerramento por inatividade
      if (this.chatCloseTimers.has(targetPhone)) {
        clearTimeout(this.chatCloseTimers.get(targetPhone));
        this.chatCloseTimers.delete(targetPhone);
      }

      console.log(`[HumanPause] 👤 Mensagem manual detectada na instância "${instanceName}" para +${targetPhone}. IA pausada por 20 minutos (retomada: ${new Date(pauseRecord.expiresAt).toLocaleTimeString()}).`);

      this.activityLogs.push({
        id: Math.random().toString(36).substring(2),
        timestamp: new Date().toISOString(),
        instanceName,
        agentName: link?.agentName || 'Operador',
        senderPhone: targetPhone,
        senderName: 'Operador Humano',
        userMessage: textContent || '[Mensagem manual]',
        aiResponse: `Atendimento humano iniciado. IA pausada por 20 minutos para este contato (retomada prevista: ${new Date(pauseRecord.expiresAt).toLocaleTimeString()}).`,
        status: 'success',
      });

      return;
    }

    // =========================================================================
    // 2. MENSAGEM RECEBIDA DO CLIENTE (fromMe: false)
    // =========================================================================
    if (!link) return;

    // Verifica se o contato está com IA pausada por atendimento humano
    if (humanPauseManager.isPaused(link.instanceName, targetPhone)) {
      const pause = humanPauseManager.getPause(link.instanceName, targetPhone);
      const textContent = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        ''
      ).trim();

      if (msgId) this.seenMessageIds.add(msgId);
      if (keyId) this.seenMessageIds.add(keyId);
      this.saveSeenToDisk();

      console.log(`[HumanPause] ⏸️ Mensagem de +${targetPhone} registrada, mas IA está pausada para atendimento humano até ${pause?.expiresAt}. Nenhuma resposta da IA será enviada.`);

      this.activityLogs.push({
        id: Math.random().toString(36).substring(2),
        timestamp: new Date().toISOString(),
        instanceName: link.instanceName,
        agentName: link.agentName,
        senderPhone: targetPhone,
        senderName: msg.pushName || 'Cliente',
        userMessage: textContent || '[Mensagem recebida]',
        aiResponse: `[IA Pausada - Atendimento Humano ativo até ${pause ? new Date(pause.expiresAt).toLocaleTimeString() : '20 min'}]`,
        status: 'success',
      });

      return;
    }

    const lastTs = this.lastChatTimestamps.get(targetPhone) || 0;
    if (msgTimestamp > 0 && msgTimestamp <= lastTs) {
      if (msgId) this.seenMessageIds.add(msgId);
      if (keyId) this.seenMessageIds.add(keyId);
      return;
    }

    const textContent = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      ''
    ).trim();

    if (!textContent) {
      if (msgId) this.seenMessageIds.add(msgId);
      if (keyId) this.seenMessageIds.add(keyId);
      return;
    }

    // Marca imediatamente como visto para não repetir em novos polls
    if (msgId) this.seenMessageIds.add(msgId);
    if (keyId) this.seenMessageIds.add(keyId);
    if (msgTimestamp > lastTs) {
      this.lastChatTimestamps.set(targetPhone, msgTimestamp);
    }
    this.saveSeenToDisk();

    // Cancela qualquer timer de encerramento pendente para este contato
    if (this.chatCloseTimers.has(targetPhone)) {
      clearTimeout(this.chatCloseTimers.get(targetPhone));
      this.chatCloseTimers.delete(targetPhone);
    }

    const wasClosed = this.closedChats.has(targetPhone);
    if (wasClosed) {
      console.log(`[AutoResponder] 🔄 Cliente +${targetPhone} iniciou nova conversa após encerramento anterior.`);
      this.closedChats.delete(targetPhone);
    }

    // Atualiza rastreamento de atividade da conversa
    this.lastInteractionTimestamps.set(targetPhone, Date.now());
    this.chatLastActiveLink.set(targetPhone, link);
    this.chatSenderNames.set(targetPhone, msg.pushName || 'Cliente');

    // Extrai histórico recente da conversa (se estava encerrada, começa do zero sem misturar contexto velho)
    const conversationHistory: Array<{ role: 'user' | 'assistant'; text: string }> = [];
    if (!wasClosed && contextMessages && contextMessages.length > 0) {
      const recentMessages = contextMessages
        .filter(m => {
          const p = normalizePhone(m.key?.remoteJidAlt || m.key?.remoteJid || '');
          return p === targetPhone && m.id !== msgId && m.key?.id !== keyId;
        })
        .sort((a, b) => (a.messageTimestamp || 0) - (b.messageTimestamp || 0))
        .slice(-10);

      for (const rm of recentMessages) {
        const rmText = rm.message?.conversation || rm.message?.extendedTextMessage?.text;
        if (rmText && rmText.trim()) {
          conversationHistory.push({
            role: rm.key?.fromMe ? 'assistant' : 'user',
            text: rmText.trim(),
          });
        }
      }
    }

    // Envia para o buffer de debounce do contato
    this.bufferIncomingMessage(
      targetPhone,
      msg.pushName || 'Cliente',
      { id: msgId, keyId, text: textContent, timestamp: msgTimestamp },
      link,
      conversationHistory
    );
  }

  /**
   * Processa Webhooks recebidos da Evolution API (messages.upsert, etc.)
   */
  public async handleWebhook(payload: any) {
    if (!payload) return;
    const instanceName = (
      payload.instance ||
      payload.instanceName ||
      payload.data?.instance ||
      ''
    ).trim();

    let link = this.links.get(instanceName);
    if (!link && instanceName) {
      for (const [name, l] of this.links.entries()) {
        if (name.toLowerCase() === instanceName.toLowerCase()) {
          link = l;
          break;
        }
      }
    }

    const rawData = payload.data || payload;
    let msgs: any[] = [];
    if (Array.isArray(rawData)) {
      msgs = rawData;
    } else if (rawData?.messages?.records && Array.isArray(rawData.messages.records)) {
      msgs = rawData.messages.records;
    } else if (rawData?.messages && Array.isArray(rawData.messages)) {
      msgs = rawData.messages;
    } else if (rawData?.key) {
      msgs = [rawData];
    }

    for (const msg of msgs) {
      await this.processSingleMessage(msg, link, msgs, instanceName);
    }
  }

  // Buffer de espera: aguarda 5 segundos para agrupar mensagens consecutivas do usuário
  private bufferIncomingMessage(
    targetPhone: string,
    senderName: string,
    msg: { id: string; keyId: string; text: string; timestamp: number },
    link: LinkedAgentConfig,
    history: Array<{ role: 'user' | 'assistant'; text: string }>
  ) {
    let buffer = this.debounceBuffers.get(targetPhone);

    if (buffer) {
      clearTimeout(buffer.timer);
      buffer.messages.push(msg);
      buffer.senderName = senderName;
      buffer.conversationHistory = history;
      console.log(`[AutoResponder] 💬 Mensagem adicional de +${targetPhone} ("${msg.text}") agrupada ao buffer.`);
    } else {
      buffer = {
        timer: null,
        messages: [msg],
        senderName,
        link,
        conversationHistory: history,
      };
      this.debounceBuffers.set(targetPhone, buffer);
      console.log(`[AutoResponder] 📥 Nova mensagem de +${targetPhone} ("${msg.text}"). Aguardando 5s para agrupar frases.`);
    }

    // Espera 5 segundos sem novas mensagens antes de chamar a IA
    buffer.timer = setTimeout(() => {
      this.flushChatBuffer(targetPhone);
    }, 5000);
  }

  private async flushChatBuffer(targetPhone: string) {
    const buffer = this.debounceBuffers.get(targetPhone);
    if (!buffer) return;

    this.debounceBuffers.delete(targetPhone);

    // Verificação de segurança: se o operador humano iniciou atendimento durante o debounce, descarta!
    if (humanPauseManager.isPaused(buffer.link.instanceName, targetPhone)) {
      console.log(`[HumanPause] 🛑 Buffer descartado para +${targetPhone}: atendimento humano ativo.`);
      return;
    }

    if (this.processingChats.has(targetPhone)) {
      console.log(`[AutoResponder] ⏳ Chat +${targetPhone} já ocupado gerando resposta. Reagendando envio...`);
      setTimeout(() => this.bufferIncomingMessage(targetPhone, buffer.senderName, buffer.messages[0], buffer.link, buffer.conversationHistory), 2000);
      return;
    }

    const combinedText = buffer.messages.map(m => m.text).join('\n');
    await this.processContactResponse(
      buffer.link,
      targetPhone,
      buffer.senderName,
      combinedText,
      buffer.conversationHistory
    );
  }

  private async processContactResponse(
    link: LinkedAgentConfig,
    targetPhone: string,
    senderName: string,
    userMessage: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; text: string }>
  ) {
    // Verificação pré-geração: se a IA foi pausada, não gera resposta
    if (humanPauseManager.isPaused(link.instanceName, targetPhone)) {
      console.log(`[HumanPause] 🛑 Geração abortada para +${targetPhone}: atendimento humano ativo.`);
      return;
    }

    this.processingChats.add(targetPhone);
    console.log(`[AutoResponder] 🤖 Gerando resposta única para +${targetPhone} (${senderName}): "${userMessage}"`);

    const apiUrl = getEnvKey('EVOLUTION_API_URL').replace(/\/$/, '') || 'https://api.doratec.site';
    const apiKey = getEnvKey('EVOLUTION_API_KEY');

    const logEntry: ActivityLog = {
      id: Math.random().toString(36).substring(2),
      timestamp: new Date().toISOString(),
      instanceName: link.instanceName,
      agentName: link.agentName,
      senderPhone: targetPhone,
      senderName,
      userMessage,
      aiResponse: '',
      status: 'success',
    };

    try {
      const geminiKey = getEnvKey('GEMINI_API_KEY');
      const openaiKey = getEnvKey('OPENAI_API_KEY');
      const groqKey = getEnvKey('GROQ_API_KEY');

      const enrichedSystemPrompt = buildPromptWithMedia(link.prompt, link.mediaCatalog);

      const aiResponse = await generateAIResponse({
        provider: link.provider,
        model: link.model,
        systemPrompt: enrichedSystemPrompt,
        userMessage,
        conversationHistory,
        apiKeys: {
          gemini: geminiKey,
          openai: openaiKey,
          groq: groqKey,
        },
      });

      // VERIFICAÇÃO CRÍTICA PÓS-GERAÇÃO:
      // Se durante a geração o operador humano mandou mensagem manual, descarta a resposta imediatamente!
      if (humanPauseManager.isPaused(link.instanceName, targetPhone)) {
        console.log(`[HumanPause] 🛑 Resposta da IA descartada para +${targetPhone}: atendimento humano foi ativado durante a geração!`);
        return;
      }

      // Extrai tags de imagens solicitadas: [ENVIAR_IMAGEM: id_ou_titulo] ou [ENVIAR_FOTO: ...]
      const mediaTagRegex = /\[(?:ENVIAR_IMAGEM|ENVIAR_FOTO):\s*([^\]]+)\]/gi;
      const requestedMediaKeys: string[] = [];
      let match;
      while ((match = mediaTagRegex.exec(aiResponse)) !== null) {
        requestedMediaKeys.push(match[1].trim());
      }

      // Extrai tags de áudios solicitados: [ENVIAR_AUDIO: id] ou [ENVIAR_VOZ: ...]
      const audioTagRegex = /\[(?:ENVIAR_AUDIO|ENVIAR_VOZ):\s*([^\]]+)\]/gi;
      const requestedAudioKeys: string[] = [];
      while ((match = audioTagRegex.exec(aiResponse)) !== null) {
        requestedAudioKeys.push(match[1].trim());
      }

      // Detecção inteligente adicional: se o cliente pediu expressamente foto/imagem/banner/tabela/plano
      if (requestedMediaKeys.length === 0 && link.mediaCatalog && link.mediaCatalog.length > 0) {
        const userLower = userMessage.toLowerCase();
        const asksImage = userLower.includes('foto') || userLower.includes('imagem') || userLower.includes('banner') || userLower.includes('print') || userLower.includes('tabela') || userLower.includes('catalogo') || userLower.includes('catálogo');
        const asksPlans = userLower.includes('plano') || userLower.includes('planos') || userLower.includes('preço') || userLower.includes('quanto custa') || userLower.includes('valor');

        if (asksImage || asksPlans) {
          for (const item of link.mediaCatalog) {
            if (item.type === 'audio') continue;
            const titleLower = item.title.toLowerCase();
            const triggerLower = (item.trigger_prompt || '').toLowerCase();

            if (
              (titleLower.includes('gestor') && (userLower.includes('gestor') || asksPlans)) ||
              (titleLower.includes('divulga') && userLower.includes('divulga')) ||
              (triggerLower.includes('plano') && asksPlans) ||
              asksImage
            ) {
              console.log(`[AutoResponder] 🎯 Gatilho inteligente acionado para imagem "${item.title}"`);
              requestedMediaKeys.push(item.id);
              break;
            }
          }
        }
      }

      // Detecção inteligente adicional para áudios: se perguntou "como funciona" ou pediu áudio
      if (requestedAudioKeys.length === 0 && link.mediaCatalog && link.mediaCatalog.length > 0) {
        const userLower = userMessage.toLowerCase();
        const asksAudioOrHowItWorks = userLower.includes('como funciona') || userLower.includes('áudio') || userLower.includes('audio') || userLower.includes('me explica') || userLower.includes('explica') || userLower.includes('funciona');
        if (asksAudioOrHowItWorks) {
          for (const item of link.mediaCatalog) {
            if (item.type === 'audio') {
              console.log(`[AutoResponder] 🎯 Gatilho inteligente acionado para áudio "${item.title}"`);
              requestedAudioKeys.push(item.id);
              break;
            }
          }
        }
      }

      // Remove as tags do texto para o cliente não ver código
      const cleanResponseText = aiResponse
        .replace(mediaTagRegex, '')
        .replace(audioTagRegex, '')
        .trim();

      logEntry.aiResponse = cleanResponseText || aiResponse;
      console.log(`[AutoResponder] 📤 Resposta gerada: "${cleanResponseText.substring(0, 90)}..." (Imagens: ${requestedMediaKeys.length}, Áudios: ${requestedAudioKeys.length})`);

      // 1. Envia resposta em texto dividida em mensagens individuais separadas
      if (cleanResponseText) {
        const textChunks = splitIntoMessages(cleanResponseText);
        console.log(`[AutoResponder] 💬 Dividindo resposta em ${textChunks.length} mensagens separadas para +${targetPhone}`);

        for (let i = 0; i < textChunks.length; i++) {
          const chunk = textChunks[i];
          if (!chunk) continue;

          // Verificação pré-envio de cada balão de mensagem
          if (humanPauseManager.isPaused(link.instanceName, targetPhone)) {
            console.log(`[HumanPause] 🛑 Envio de mensagens interrompido para +${targetPhone}: atendimento humano ativado.`);
            break;
          }

          // Simula tempo de digitação humano (entre 1.2s e 2.8s)
          const typingDelay = Math.min(Math.max(chunk.length * 25, 1200), 2800);

          // Mostra "digitando..." no WhatsApp do cliente
          await fetch(`${apiUrl}/chat/sendPresence/${encodeURIComponent(link.instanceName)}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': apiKey,
            },
            body: JSON.stringify({
              number: targetPhone,
              presence: 'composing',
              delay: typingDelay,
            }),
          }).catch(() => {});

          // Aguarda a simulação de digitação
          await new Promise(resolve => setTimeout(resolve, typingDelay));

          // Envia o balão individual
          const sendRes = await fetch(`${apiUrl}/message/sendText/${encodeURIComponent(link.instanceName)}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': apiKey,
            },
            body: JSON.stringify({
              number: targetPhone,
              text: chunk,
            }),
          });

          if (!sendRes.ok) {
            const sendErr: any = await sendRes.json().catch(() => ({}));
            console.warn(`[AutoResponder] Falha no envio do balão ${i + 1}:`, sendErr.message || sendRes.statusText);
          } else {
            const sendData: any = await sendRes.json().catch(() => ({}));
            const sentId = sendData?.key?.id || sendData?.id;
            // Registra que este ID é da própria IA para não disparar pausa humana
            humanPauseManager.registerAiSentMessage(sentId, link.instanceName, targetPhone);
            console.log(`[AutoResponder] ✅ Mensagem ${i + 1}/${textChunks.length} enviada para +${targetPhone}`);
          }

          // Pausa entre mensagens consecutivas
          if (i < textChunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 800));
          }
        }
      }

      // 2. Se a IA disparou áudios do catálogo, envia como mensagem de voz gravada no WhatsApp (PTT)
      if (requestedAudioKeys.length > 0 && link.mediaCatalog && link.mediaCatalog.length > 0) {
        if (humanPauseManager.isPaused(link.instanceName, targetPhone)) {
          console.log(`[HumanPause] 🛑 Envio de áudios abortado para +${targetPhone}: atendimento humano ativo.`);
          return;
        }

        await new Promise(resolve => setTimeout(resolve, 1500));

        for (const rawKey of requestedAudioKeys) {
          if (humanPauseManager.isPaused(link.instanceName, targetPhone)) return;

          const key = rawKey.toLowerCase();
          const matchedItem = link.mediaCatalog.find(
            m => (m.type === 'audio' || !m.type) && (m.id.toLowerCase() === key || m.title.toLowerCase() === key || m.title.toLowerCase().includes(key))
          );

          if (matchedItem && matchedItem.url) {
            console.log(`[AutoResponder] 🎙️ Enviando mensagem de voz "${matchedItem.title}" para +${targetPhone}...`);

            // Mostra "Gravando áudio..." no WhatsApp do cliente
            await fetch(`${apiUrl}/chat/sendPresence/${encodeURIComponent(link.instanceName)}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
              body: JSON.stringify({ number: targetPhone, presence: 'recording', delay: 2000 }),
            }).catch(() => {});
            await new Promise(resolve => setTimeout(resolve, 1800));

            let audioPayload = matchedItem.url;
            if (audioPayload.startsWith('/uploads/')) {
              try {
                const localFilePath = path.resolve(process.cwd(), 'public', audioPayload.replace(/^\//, ''));
                if (fs.existsSync(localFilePath)) {
                  const fileBuffer = fs.readFileSync(localFilePath);
                  audioPayload = fileBuffer.toString('base64');
                }
              } catch {}
            } else if (audioPayload.startsWith('data:')) {
              const m = audioPayload.match(/^data:([^;]+);base64,(.+)$/s);
              if (m) audioPayload = m[2];
            }

            let sentAudioOk = false;
            try {
              const pttRes = await fetch(`${apiUrl}/message/sendWhatsAppAudio/${encodeURIComponent(link.instanceName)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
                body: JSON.stringify({
                  number: targetPhone,
                  audio: audioPayload,
                  delay: 1200,
                  encoding: true,
                }),
              });

              if (pttRes.ok) {
                const pttData: any = await pttRes.json().catch(() => ({}));
                const pttId = pttData?.key?.id || pttData?.id;
                humanPauseManager.registerAiSentMessage(pttId, link.instanceName, targetPhone);
                console.log(`[AutoResponder] ✅ Áudio WhatsApp (PTT) "${matchedItem.title}" enviado para +${targetPhone}!`);
                sentAudioOk = true;
              }
            } catch (err: any) {
              console.warn('[AutoResponder] Falha em sendWhatsAppAudio, tentando sendMedia:', err.message);
            }

            if (!sentAudioOk) {
              const mediaRes = await fetch(`${apiUrl}/message/sendMedia/${encodeURIComponent(link.instanceName)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
                body: JSON.stringify({
                  number: targetPhone,
                  mediatype: 'audio',
                  mimetype: 'audio/mpeg',
                  caption: matchedItem.caption || matchedItem.title,
                  media: audioPayload,
                  fileName: `${matchedItem.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}.mp3`,
                }),
              });
              if (mediaRes.ok) {
                const mediaData: any = await mediaRes.json().catch(() => ({}));
                const mediaId = mediaData?.key?.id || mediaData?.id;
                humanPauseManager.registerAiSentMessage(mediaId, link.instanceName, targetPhone);
                console.log(`[AutoResponder] ✅ Áudio enviado como mídia para +${targetPhone}!`);
              }
            }
          }
        }
      }

      // 3. Se a IA disparou imagens do catálogo, envia com pausa natural
      if (requestedMediaKeys.length > 0 && link.mediaCatalog && link.mediaCatalog.length > 0) {
        if (humanPauseManager.isPaused(link.instanceName, targetPhone)) {
          console.log(`[HumanPause] 🛑 Envio de mídias abortado para +${targetPhone}: atendimento humano ativo.`);
          return;
        }

        await new Promise(resolve => setTimeout(resolve, 1500));

        for (const rawKey of requestedMediaKeys) {
          if (humanPauseManager.isPaused(link.instanceName, targetPhone)) {
            console.log(`[HumanPause] 🛑 Envio de mídias interrompido para +${targetPhone}: atendimento humano ativo.`);
            return;
          }

          const key = rawKey.toLowerCase();
          const matchedItem = link.mediaCatalog.find(
            m => (m.type !== 'audio') && (m.id.toLowerCase() === key || m.title.toLowerCase() === key || m.title.toLowerCase().includes(key))
          );

          if (matchedItem && matchedItem.url) {
            console.log(`[AutoResponder] 📸 Enviando imagem "${matchedItem.title}" para +${targetPhone}...`);

            // Sinal de digitando antes da imagem
            await fetch(`${apiUrl}/chat/sendPresence/${encodeURIComponent(link.instanceName)}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
              body: JSON.stringify({ number: targetPhone, presence: 'composing', delay: 1500 }),
            }).catch(() => {});
            await new Promise(resolve => setTimeout(resolve, 1200));

            let mediaPayload = matchedItem.url;
            let mimeType = 'image/jpeg';

            if (mediaPayload.startsWith('/uploads/')) {
              try {
                const localFilePath = path.resolve(process.cwd(), 'public', mediaPayload.replace(/^\//, ''));
                if (fs.existsSync(localFilePath)) {
                  const fileBuffer = fs.readFileSync(localFilePath);
                  mimeType = localFilePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
                  mediaPayload = fileBuffer.toString('base64'); // PURE Base64 for Evolution API
                }
              } catch (err: any) {
                console.warn('[AutoResponder] Não foi possível ler arquivo local de imagem:', err.message);
              }
            } else if (mediaPayload.startsWith('data:')) {
              // Remove o prefixo data:...;base64, para a Evolution API aceitar
              const m = mediaPayload.match(/^data:([^;]+);base64,(.+)$/s);
              if (m) {
                mimeType = m[1];
                mediaPayload = m[2];
              }
            }

            const mediaRes = await fetch(`${apiUrl}/message/sendMedia/${encodeURIComponent(link.instanceName)}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': apiKey,
              },
              body: JSON.stringify({
                number: targetPhone,
                mediatype: 'image',
                mimetype: mimeType,
                caption: matchedItem.caption || matchedItem.title,
                media: mediaPayload,
                fileName: `${matchedItem.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}.jpg`,
              }),
            });

            if (mediaRes.ok) {
              const mediaData: any = await mediaRes.json().catch(() => ({}));
              const mediaId = mediaData?.key?.id || mediaData?.id;
              humanPauseManager.registerAiSentMessage(mediaId, link.instanceName, targetPhone);
              console.log(`[AutoResponder] ✅ Imagem "${matchedItem.title}" enviada com sucesso para +${targetPhone}!`);
            } else {
              const mediaErr: any = await mediaRes.json().catch(() => ({}));
              console.error(`[AutoResponder] ❌ Falha ao enviar imagem "${matchedItem.title}":`, mediaErr);
            }
          } else {
            console.warn(`[AutoResponder] ⚠️ Imagem com ID ou nome "${rawKey}" não encontrada no catálogo.`);
          }
        }
      }

      this.activityLogs.push(logEntry);

      // Agenda encerramento automático por inatividade de 20 minutos
      this.lastInteractionTimestamps.set(targetPhone, Date.now());
      this.chatLastActiveLink.set(targetPhone, link);
      this.chatSenderNames.set(targetPhone, senderName);
      this.scheduleInactivityClose(targetPhone, link, senderName);
    } catch (err: any) {
      console.error(`[AutoResponder] ❌ Erro ao atender +${targetPhone}:`, err.message);
      logEntry.status = 'error';
      logEntry.errorMessage = err.message;
      this.activityLogs.push(logEntry);
    } finally {
      this.processingChats.delete(targetPhone);
    }
  }

  // Métodos de Pausa por Atendimento Humano
  public getPauses() {
    return humanPauseManager.getAllActivePauses();
  }
  public getPause(instanceName: string, phone: string) {
    return humanPauseManager.getPause(instanceName, phone);
  }
  public isContactPaused(instanceName: string, phone: string) {
    return humanPauseManager.isPaused(instanceName, phone);
  }
  public setHumanPause(instanceName: string, phone: string, lastHumanMessage?: string, durationMs?: number) {
    return humanPauseManager.setPause(instanceName, phone, lastHumanMessage, durationMs);
  }
  public clearHumanPause(instanceName: string, phone: string) {
    return humanPauseManager.clearPause(instanceName, phone);
  }
}

export const autoResponder: AutoResponderService = new AutoResponderService();
globalThis.__autoResponderInstance = autoResponder;

