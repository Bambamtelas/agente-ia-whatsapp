import { generateAIResponse } from './aiEngine.ts';
import fs from 'node:fs';
import path from 'node:path';

declare const process: any;
declare const globalThis: any;

export interface AgentMediaItem {
  id: string;
  title: string;
  url: string; // URL da imagem ou Data URL base64
  trigger_prompt: string; // Instrução de quando a IA deve enviar esta imagem
  caption?: string; // Legenda opcional para a imagem no WhatsApp
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
    const trigger = item.trigger_prompt || 'Quando o cliente solicitar ou demonstrar interesse';
    return `[MÍDIA #${idx + 1}]
- ID: "${item.id}"
- Título: "${item.title}"
- Quando enviar: ${trigger}
${item.caption ? `- Legenda sugerida: "${item.caption}"` : ''}
- Comando para disparar: [ENVIAR_IMAGEM: ${item.id}]`;
  }).join('\n\n');

  return `${prompt}

---
## CATÁLOGO DE IMAGENS E MÍDIAS OFICIAIS DISPONÍVEIS:
Você tem acesso às seguintes imagens oficiais cadastradas para enviar ao cliente no WhatsApp quando a conversa solicitar:

${mediaList}

REGRAS OBRIGATÓRIAS DE ENVIO DE IMAGENS:
1. Analise cuidadosamente a mensagem do cliente e o contexto da conversa.
2. Quando a solicitação do cliente corresponder ao campo "Quando enviar" de uma imagem (exemplo: cliente pediu para ver os planos, pediu tabela de preços, fotos, banners ou demonstrou interesse no produto), você DEVE responder em texto de forma natural e incluir no final da sua mensagem a tag de disparo correspondente:
   [ENVIAR_IMAGEM: ID_DA_IMAGEM]
   Exemplo: Se o cliente perguntar os valores do plano, responda com o texto explicativo e termine com: [ENVIAR_IMAGEM: ID_DA_IMAGEM]
3. Se precisar enviar mais de uma imagem, inclua as tags separadas: [ENVIAR_IMAGEM: ID_1] [ENVIAR_IMAGEM: ID_2].
4. O sistema irá automaticamente detectar essa tag, remover ela do texto visível e enviar o arquivo de imagem diretamente para o WhatsApp do cliente.
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
    } catch (err: any) {
      console.error('[AutoResponder Error]', err?.message || err);
    } finally {
      this.isPolling = false;
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
        const msgId = msg.id || '';
        const keyId = msg.key?.id || '';
        const fromMe = msg.key?.fromMe;
        const msgTimestamp = Number(msg.messageTimestamp) || 0;

        if (fromMe) continue;

        const remoteJid = msg.key?.remoteJid || '';
        if (remoteJid.includes('@broadcast') || remoteJid.includes('@g.us')) {
          if (msgId) this.seenMessageIds.add(msgId);
          if (keyId) this.seenMessageIds.add(keyId);
          continue;
        }

        let targetPhone = msg.key?.remoteJidAlt || msg.key?.remoteJid || '';
        targetPhone = targetPhone.replace('@s.whatsapp.net', '').replace('@lid', '').trim();
        if (!targetPhone) continue;

        if ((msgId && this.seenMessageIds.has(msgId)) || (keyId && this.seenMessageIds.has(keyId))) {
          continue;
        }

        const lastTs = this.lastChatTimestamps.get(targetPhone) || 0;
        if (msgTimestamp > 0 && msgTimestamp <= lastTs) {
          if (msgId) this.seenMessageIds.add(msgId);
          if (keyId) this.seenMessageIds.add(keyId);
          continue;
        }

        const textContent = (
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          ''
        ).trim();

        if (!textContent) {
          if (msgId) this.seenMessageIds.add(msgId);
          if (keyId) this.seenMessageIds.add(keyId);
          continue;
        }

        // Marca imediatamente como visto para não repetir em novos polls
        if (msgId) this.seenMessageIds.add(msgId);
        if (keyId) this.seenMessageIds.add(keyId);
        if (msgTimestamp > lastTs) {
          this.lastChatTimestamps.set(targetPhone, msgTimestamp);
        }
        this.saveSeenToDisk();

        // Extrai histórico recente da conversa
        const conversationHistory: Array<{ role: 'user' | 'assistant'; text: string }> = [];
        const recentMessages = messages
          .filter(m => {
            const p = (m.key?.remoteJidAlt || m.key?.remoteJid || '').replace('@s.whatsapp.net', '').replace('@lid', '').trim();
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

        // Envia para o buffer de debounce do contato
        this.bufferIncomingMessage(
          targetPhone,
          msg.pushName || 'Cliente',
          { id: msgId, keyId, text: textContent, timestamp: msgTimestamp },
          link,
          conversationHistory
        );
      }
    } catch (err: any) {
      console.error(`[AutoResponder] Falha ao verificar mensagens de ${link.instanceName}:`, err.message);
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

      // Extrai tags de imagens solicitadas: [ENVIAR_IMAGEM: id_ou_titulo] ou [ENVIAR_FOTO: ...]
      const mediaTagRegex = /\[(?:ENVIAR_IMAGEM|ENVIAR_FOTO):\s*([^\]]+)\]/gi;
      const requestedMediaKeys: string[] = [];
      let match;
      while ((match = mediaTagRegex.exec(aiResponse)) !== null) {
        requestedMediaKeys.push(match[1].trim());
      }

      // Detecção inteligente adicional: se o cliente pediu expressamente foto/imagem/banner/tabela/plano
      if (requestedMediaKeys.length === 0 && link.mediaCatalog && link.mediaCatalog.length > 0) {
        const userLower = userMessage.toLowerCase();
        const asksImage = userLower.includes('foto') || userLower.includes('imagem') || userLower.includes('banner') || userLower.includes('print') || userLower.includes('tabela') || userLower.includes('catalogo') || userLower.includes('catálogo');
        const asksPlans = userLower.includes('plano') || userLower.includes('planos') || userLower.includes('preço') || userLower.includes('quanto custa') || userLower.includes('valor');

        if (asksImage || asksPlans) {
          for (const item of link.mediaCatalog) {
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

      // Remove a tag do texto para o cliente não ver código
      const cleanResponseText = aiResponse.replace(mediaTagRegex, '').trim();

      logEntry.aiResponse = cleanResponseText || aiResponse;
      console.log(`[AutoResponder] 📤 Resposta gerada: "${cleanResponseText.substring(0, 90)}..." (Mídias acionadas: ${requestedMediaKeys.length})`);

      // 1. Envia resposta em texto dividida em mensagens individuais separadas
      if (cleanResponseText) {
        const textChunks = splitIntoMessages(cleanResponseText);
        console.log(`[AutoResponder] 💬 Dividindo resposta em ${textChunks.length} mensagens separadas para +${targetPhone}`);

        for (let i = 0; i < textChunks.length; i++) {
          const chunk = textChunks[i];
          if (!chunk) continue;

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
            console.log(`[AutoResponder] ✅ Mensagem ${i + 1}/${textChunks.length} enviada para +${targetPhone}`);
          }

          // Pausa entre mensagens consecutivas
          if (i < textChunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 800));
          }
        }
      }

      // 2. Se a IA disparou imagens do catálogo, envia com pausa natural
      if (requestedMediaKeys.length > 0 && link.mediaCatalog && link.mediaCatalog.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 1500));

        for (const rawKey of requestedMediaKeys) {
          const key = rawKey.toLowerCase();
          const matchedItem = link.mediaCatalog.find(
            m => m.id.toLowerCase() === key || m.title.toLowerCase() === key || m.title.toLowerCase().includes(key)
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
    } catch (err: any) {
      console.error(`[AutoResponder] ❌ Erro ao atender +${targetPhone}:`, err.message);
      logEntry.status = 'error';
      logEntry.errorMessage = err.message;
      this.activityLogs.push(logEntry);
    } finally {
      this.processingChats.delete(targetPhone);
    }
  }
}

export const autoResponder: AutoResponderService = new AutoResponderService();
globalThis.__autoResponderInstance = autoResponder;

