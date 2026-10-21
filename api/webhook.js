// Serverless Webhook Handler da Evolution API no Vercel (Atendimento 24/7 na Nuvem)

const EVOLUTION_API_URL = (process.env.EVOLUTION_API_URL || 'https://api.doratec.site').replace(/\/$/, '');
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '1003be981b063ae8c3146ba09557a56245312581afb4891d36c316281665eb28';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://ndcruioidkfjwwrnlosf.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_oNACcPiiSm2g-oCiUe3uVg_PDwh5djN';

// Armazenamento em memória (persiste durante instâncias serverless ativas e recicla)
const globalStore = globalThis.__serverlessBotStore || {
  pauses: new Map(), // key -> { expiresAt: number, lastMsg?: string }
  aiSentIds: new Set(), // IDs de mensagens disparadas pela IA
  seenMessageIds: new Set(), // IDs de mensagens já processadas
  recentAiTexts: new Set(), // Trechos de mensagens enviadas pela IA para evitar falso-positivo
  recentAiWindows: new Map(), // key -> timestamp de envio recente da IA
};
globalThis.__serverlessBotStore = globalStore;

function normalizePhone(rawPhone) {
  if (!rawPhone) return '';
  return String(rawPhone)
    .replace('@s.whatsapp.net', '')
    .replace('@lid', '')
    .replace(/\D/g, '')
    .trim();
}

function buildPauseKey(instanceName, phone) {
  const cleanInst = (instanceName || '').trim().toLowerCase();
  const cleanPhone = normalizePhone(phone);
  return `${cleanInst}:${cleanPhone}`;
}

function isContactPaused(instanceName, phone) {
  const key = buildPauseKey(instanceName, phone);
  const record = globalStore.pauses.get(key);
  if (!record) return false;
  if (Date.now() >= record.expiresAt) {
    globalStore.pauses.delete(key);
    console.log(`[HumanPause Vercel] ▶️ Pausa de atendimento humano expirou para ${key}. IA liberada.`);
    return false;
  }
  return true;
}

function setContactPause(instanceName, phone, lastMsg, durationMs = 5 * 60 * 1000) {
  const key = buildPauseKey(instanceName, phone);
  const expiresAt = Date.now() + durationMs;
  globalStore.pauses.set(key, { expiresAt, lastMsg });
  console.log(`[HumanPause Vercel] ⏸️ Pausa de 5 minutos ativada para ${key} até ${new Date(expiresAt).toISOString()}`);
}

function splitIntoWhatsAppMessages(text) {
  if (!text) return [];
  const paragraphs = text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean);

  const messages = [];
  for (const p of paragraphs) {
    if (p.length > 600) {
      const sentences = p.split(/(?<=[.!?])\s+/);
      let current = '';
      for (const s of sentences) {
        if ((current + ' ' + s).trim().length > 600) {
          if (current) messages.push(current.trim());
          current = s;
        } else {
          current = current ? `${current} ${s}` : s;
        }
      }
      if (current) messages.push(current.trim());
    } else {
      messages.push(p);
    }
  }

  return messages.length > 0 ? messages : [text.trim()];
}

async function fetchActiveAgentFromSupabase() {
  if (globalStore.cachedAgent && Date.now() - (globalStore.cachedAgentTime || 0) < 60000) {
    return globalStore.cachedAgent;
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/agents?is_active=eq.true&order=created_at.desc&limit=1`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        globalStore.cachedAgent = data[0];
        globalStore.cachedAgentTime = Date.now();
        return data[0];
      }
    }
  } catch (err) {
    console.warn('[Vercel Webhook] Falha ao buscar agente no Supabase:', err.message);
  }
  return globalStore.cachedAgent || null;
}

async function callGeminiAI(systemPrompt, userMessage) {
  const models = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];
  let lastError = null;

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: userMessage }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1000,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        lastError = new Error(`Gemini ${model} status ${res.status}: ${err.error?.message || res.statusText}`);
        if (res.status === 404 || res.status === 429) continue;
        throw lastError;
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text.trim();
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError || new Error('Não foi possível obter resposta do Gemini');
}

export default async function handler(req, res) {
  // Configura CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({ status: 'active', message: 'Vercel Webhook 24/7 Ativo' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch {}
    }
    if (!body) {
      return res.status(200).json({ success: true, warning: 'Empty body' });
    }

    const eventName = String(body.event || body.type || '').toUpperCase();
    if (eventName === 'SEND_MESSAGE' || eventName === 'SEND_MESSAGE_UPDATE') {
      return res.status(200).json({ success: true, ignored: 'Outbound API event' });
    }

    const instanceName = (
      body.instance ||
      body.instanceName ||
      body.data?.instance ||
      'agente_james_test'
    ).trim();

    const rawData = body.data || body;
    let msgs = [];
    if (Array.isArray(rawData)) {
      msgs = rawData;
    } else if (rawData?.messages?.records && Array.isArray(rawData.messages.records)) {
      msgs = rawData.messages.records;
    } else if (rawData?.messages && Array.isArray(rawData.messages)) {
      msgs = rawData.messages;
    } else if (rawData?.key) {
      msgs = [rawData];
    }

    if (!msgs || msgs.length === 0) {
      return res.status(200).json({ success: true, warning: 'No messages in payload' });
    }

    for (const msg of msgs) {
      if (!msg || !msg.key) continue;

      const msgId = msg.id || '';
      const keyId = msg.key?.id || '';
      const fromMe = Boolean(msg.key?.fromMe);
      const remoteJid = msg.key?.remoteJid || '';

      // Ignora transmissões e grupos
      if (remoteJid.includes('@broadcast') || remoteJid.includes('@g.us')) {
        continue;
      }

      const targetPhone = normalizePhone(msg.key?.remoteJidAlt || remoteJid);
      if (!targetPhone) continue;

      // Evita loops e mensagens duplicadas
      const dedupeKey = keyId || msgId;
      if (dedupeKey && globalStore.seenMessageIds.has(dedupeKey)) {
        continue;
      }
      if (dedupeKey) {
        globalStore.seenMessageIds.add(dedupeKey);
        // Limita o conjunto para os últimos 1000 IDs
        if (globalStore.seenMessageIds.size > 1000) {
          const first = globalStore.seenMessageIds.values().next().value;
          globalStore.seenMessageIds.delete(first);
        }
      }

      // =========================================================================
      // 1. MENSAGEM DO PROPRIETÁRIO (fromMe: true) -> PAUSA HUMANA DE 20 MINUTOS
      // =========================================================================
      if (fromMe) {
        const msgTimestamp = Number(msg.messageTimestamp) || 0;
        if (msgTimestamp > 0 && (Date.now() - msgTimestamp * 1000 > 120000)) {
          continue;
        }

        const textContent = (
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          ''
        ).trim();
        const textLower = textContent.toLowerCase();

        // 1. Se qualquer ID da mensagem foi registrado pela IA
        const isAiId = (msgId && globalStore.aiSentIds.has(msgId)) || (keyId && globalStore.aiSentIds.has(keyId));

        // 2. Se o texto bater com mensagens disparadas recentemente pela IA
        const isAiText = textLower && Array.from(globalStore.recentAiTexts).some(
          t => textLower.startsWith(t) || textLower.includes(t) || t.includes(textLower.substring(0, 30))
        );

        // 3. Janela de tempo de 45 segundos após envio da IA
        const pauseKey = buildPauseKey(instanceName, targetPhone);
        const lastAiSentTime = globalStore.recentAiWindows.get(pauseKey);
        const isRecentAiTime = lastAiSentTime && Math.abs(Date.now() - lastAiSentTime) <= 45000;

        if (isAiId || isAiText || isRecentAiTime) {
          // Eco da própria IA: ignora sem pausar
          continue;
        }

        // Mensagem genuinamente manual enviada pelo operador no WhatsApp!
        setContactPause(instanceName, targetPhone, textContent);
        console.log(`[Vercel Webhook] 👤 Operador manual detectado para +${targetPhone}. IA pausada por 20 minutos.`);
        continue;
      }

      // =========================================================================
      // 2. MENSAGEM RECEBIDA DO CLIENTE (fromMe: false)
      // =========================================================================
      // Verifica se a IA está pausada para este contato
      if (isContactPaused(instanceName, targetPhone)) {
        console.log(`[Vercel Webhook] ⏸️ Mensagem de +${targetPhone} ignorada: atendimento humano ativo.`);
        continue;
      }

      const userMessage = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        ''
      ).trim();

      if (!userMessage) continue;

      // Busca agente oficial no Supabase
      const agent = await fetchActiveAgentFromSupabase();
      let basePrompt = agent?.prompt || '';
      const mediaCatalog = agent?.media_catalog || [
        {
          id: 'img-gestor-streamings',
          title: 'Gestor de Streamings',
          url: 'https://agente-ia-whatsapp-ecru.vercel.app/uploads/media_1792515638252_h44w8.png',
          trigger_prompt: 'Envie quando o cliente perguntar sobre o Gestor de Streamings.',
          caption: '🚀 Gestor de Streamings - Gestão de clientes e cobranças automáticas no WhatsApp!',
        },
        {
          id: 'img-mvgxk5na-lh0x',
          title: 'Divulga auto 2',
          url: 'https://agente-ia-whatsapp-ecru.vercel.app/uploads/media_1792515656020_zgkrc.png',
          trigger_prompt: 'Envie quando o cliente perguntar sobre o Auto Divulga Whats.',
          caption: 'Auto Divulga Whats.',
        },
      ];

      // Formatação para mensagens separadas no WhatsApp
      const formattingInstruction = `
---
## REGRA DE FORMATO PARA WHATSAPP:
- Escreva como uma pessoa real conversando no WhatsApp: mensagens naturais, dinâmicas e fluidas.
- Separe suas respostas sempre em parágrafos usando LINHAS EM BRANCO DUPLAS (\\n\\n).
- Cada parágrafo será enviado como um balão de mensagem separado.
---`;

      const mediaInstruction = mediaCatalog && mediaCatalog.length > 0
        ? `\n---
## CATÁLOGO DE MÍDIAS DISPONÍVEIS (IMAGENS E ÁUDIOS):
Você tem acesso às seguintes mídias oficiais para enviar aos clientes no WhatsApp no momento exato da conversa:

${mediaCatalog.map((item, idx) => {
  const isAudio = item.type === 'audio';
  const tagCmd = isAudio ? `[ENVIAR_AUDIO: ${item.id}]` : `[ENVIAR_IMAGEM: ${item.id}]`;
  const typeLabel = isAudio ? '🎙️ ÁUDIO / MENSAGEM DE VOZ' : '🖼️ IMAGEM / BANNER';
  return `[MÍDIA #${idx + 1}] TIPO: ${typeLabel} | ID: "${item.id}" | Título: "${item.title}" | Quando enviar: ${item.trigger_prompt || 'Quando solicitado'} | Comando: ${tagCmd}`;
}).join('\n')}

REGRAS OBRIGATÓRIAS DE ENVIO DE MÍDIAS:
1. IMAGENS: Quando a solicitação do cliente corresponder ao gatilho de uma imagem (ex: pediu preços, planos, banners promocionais), responda em texto de forma natural e inclua no final: [ENVIAR_IMAGEM: ID_DA_IMAGEM].
2. ÁUDIOS: Quando a solicitação do cliente corresponder ao gatilho de um áudio (ex: perguntou como funciona o sistema, pediu explicação detalhada ou áudio explicativo), responda com um texto de introdução natural (ex: "Vou te mandar um áudio aqui explicando certinho como funciona:") e inclua no final: [ENVIAR_AUDIO: ID_DO_AUDIO].
3. O sistema remove essas tags do texto final e dispara a mensagem de voz ou imagem diretamente para o WhatsApp do cliente.
---`
        : '';

      const fullPrompt = `${basePrompt}\n${formattingInstruction}\n${mediaInstruction}`;

      console.log(`[Vercel Webhook] 🤖 Gerando resposta Gemini 24/7 para +${targetPhone}: "${userMessage}"`);

      // Gera resposta com Gemini
      const rawResponse = await callGeminiAI(fullPrompt, userMessage);

      // Verificação pós-geração: se durante a geração o operador assumiu, descarta!
      if (isContactPaused(instanceName, targetPhone)) {
        console.log(`[Vercel Webhook] 🛑 Resposta descartada para +${targetPhone}: operador assumiu durante a geração.`);
        continue;
      }

      // Extrai tags de imagens: [ENVIAR_IMAGEM: id] ou [ENVIAR_FOTO: id]
      const imageTagRegex = /\[(?:ENVIAR_IMAGEM|ENVIAR_FOTO):\s*([^\]]+)\]/gi;
      const requestedImageKeys = [];
      let match;
      while ((match = imageTagRegex.exec(rawResponse)) !== null) {
        requestedImageKeys.push(match[1].trim());
      }

      // Extrai tags de áudios: [ENVIAR_AUDIO: id] ou [ENVIAR_VOZ: id]
      const audioTagRegex = /\[(?:ENVIAR_AUDIO|ENVIAR_VOZ):\s*([^\]]+)\]/gi;
      const requestedAudioKeys = [];
      while ((match = audioTagRegex.exec(rawResponse)) !== null) {
        requestedAudioKeys.push(match[1].trim());
      }

      // Limpa tags do texto final
      const cleanedResponse = rawResponse
        .replace(imageTagRegex, '')
        .replace(audioTagRegex, '')
        .trim();
      const textChunks = splitIntoWhatsAppMessages(cleanedResponse);

      // 1. Envia os balões de texto para o WhatsApp
      for (let i = 0; i < textChunks.length; i++) {
        const chunk = textChunks[i];
        if (!chunk) continue;

        if (isContactPaused(instanceName, targetPhone)) {
          console.log(`[Vercel Webhook] 🛑 Envio interrompido para +${targetPhone}: operador assumiu.`);
          break;
        }

        const sendRes = await fetch(`${EVOLUTION_API_URL}/message/sendText/${encodeURIComponent(instanceName)}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': EVOLUTION_API_KEY,
          },
          body: JSON.stringify({
            number: targetPhone,
            text: chunk,
          }),
        });

        if (sendRes.ok) {
          const sendData = await sendRes.json().catch(() => ({}));
          const keyId = sendData?.key?.id;
          const dbId = sendData?.id;
          if (keyId) globalStore.aiSentIds.add(keyId);
          if (dbId) globalStore.aiSentIds.add(dbId);
          if (chunk) {
            globalStore.recentAiTexts.add(chunk.substring(0, 50).toLowerCase());
          }
          const pauseKey = buildPauseKey(instanceName, targetPhone);
          globalStore.recentAiWindows.set(pauseKey, Date.now());
          console.log(`[Vercel Webhook] ✅ Mensagem ${i + 1}/${textChunks.length} enviada para +${targetPhone}`);
        } else {
          console.warn(`[Vercel Webhook] Falha ao enviar texto para +${targetPhone}:`, sendRes.statusText);
        }

        // Pequena pausa entre balões
        if (i < textChunks.length - 1) {
          await new Promise(r => setTimeout(r, 1200));
        }
      }

      // 2. Envia os áudios solicitados (PTT / Mensagem de Voz)
      if (requestedAudioKeys.length > 0 && mediaCatalog.length > 0) {
        for (const rawKey of requestedAudioKeys) {
          if (isContactPaused(instanceName, targetPhone)) break;

          const key = rawKey.toLowerCase();
          const matchedItem = mediaCatalog.find(
            m => (m.type === 'audio' || !m.type) && (m.id.toLowerCase() === key || m.title.toLowerCase() === key || m.title.toLowerCase().includes(key))
          );

          if (!matchedItem || !matchedItem.url) continue;

          let finalAudioUrl = matchedItem.url;
          if (finalAudioUrl.startsWith('/')) {
            finalAudioUrl = `https://agente-ia-whatsapp-ecru.vercel.app${finalAudioUrl}`;
          }

          // Sinal de gravando áudio no WhatsApp
          await fetch(`${EVOLUTION_API_URL}/chat/sendPresence/${encodeURIComponent(instanceName)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
            body: JSON.stringify({ number: targetPhone, presence: 'recording', delay: 2000 }),
          }).catch(() => {});
          await new Promise(r => setTimeout(r, 1500));

          let sentAudio = false;
          try {
            const pttRes = await fetch(`${EVOLUTION_API_URL}/message/sendWhatsAppAudio/${encodeURIComponent(instanceName)}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': EVOLUTION_API_KEY,
              },
              body: JSON.stringify({
                number: targetPhone,
                audio: finalAudioUrl,
                delay: 1200,
                encoding: true,
              }),
            });

            if (pttRes.ok) {
              const pttData = await pttRes.json().catch(() => ({}));
              const pttId = pttData?.key?.id || pttData?.id;
              if (pttId) globalStore.aiSentIds.add(pttId);
              console.log(`[Vercel Webhook] 🎙️ Áudio de voz (PTT) "${matchedItem.title}" enviado para +${targetPhone}`);
              sentAudio = true;
            }
          } catch (e) {
            console.warn('[Vercel Webhook] Erro ao enviar sendWhatsAppAudio:', e.message);
          }

          if (!sentAudio) {
            try {
              const mediaRes = await fetch(`${EVOLUTION_API_URL}/message/sendMedia/${encodeURIComponent(instanceName)}`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': EVOLUTION_API_KEY,
                },
                body: JSON.stringify({
                  number: targetPhone,
                  mediatype: 'audio',
                  mimetype: 'audio/mpeg',
                  caption: matchedItem.caption || matchedItem.title,
                  media: finalAudioUrl,
                  fileName: `${matchedItem.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}.mp3`,
                }),
              });
              if (mediaRes.ok) {
                const mediaData = await mediaRes.json().catch(() => ({}));
                const mediaId = mediaData?.key?.id || mediaData?.id;
                if (mediaId) globalStore.aiSentIds.add(mediaId);
                console.log(`[Vercel Webhook] 🎙️ Áudio via sendMedia "${matchedItem.title}" enviado para +${targetPhone}`);
              }
            } catch {}
          }
        }
      }

      // 3. Envia as imagens solicitadas
      if (requestedImageKeys.length > 0 && mediaCatalog.length > 0) {
        for (const rawKey of requestedImageKeys) {
          if (isContactPaused(instanceName, targetPhone)) break;

          const key = rawKey.toLowerCase();
          const matchedItem = mediaCatalog.find(
            m => (m.type !== 'audio') && (m.id.toLowerCase() === key || m.title.toLowerCase() === key || m.title.toLowerCase().includes(key))
          );

          if (!matchedItem || !matchedItem.url) continue;

          let finalMediaUrl = matchedItem.url;
          if (finalMediaUrl.startsWith('/')) {
            finalMediaUrl = `https://agente-ia-whatsapp-ecru.vercel.app${finalMediaUrl}`;
          }

          const mediaRes = await fetch(`${EVOLUTION_API_URL}/message/sendMedia/${encodeURIComponent(instanceName)}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': EVOLUTION_API_KEY,
            },
            body: JSON.stringify({
              number: targetPhone,
              mediatype: 'image',
              mimetype: 'image/png',
              caption: matchedItem.caption || matchedItem.title,
              media: finalMediaUrl,
              fileName: matchedItem.title || 'imagem.png',
            }),
          });

          if (mediaRes.ok) {
            const mediaData = await mediaRes.json().catch(() => ({}));
            const mediaId = mediaData?.key?.id || mediaData?.id;
            if (mediaId) globalStore.aiSentIds.add(mediaId);
            console.log(`[Vercel Webhook] ✅ Imagem "${matchedItem.title}" enviada para +${targetPhone}`);
          }
        }
      }
    }

    return res.status(200).json({ success: true, processed: true });
  } catch (err) {
    console.error('[Vercel Webhook Error]', err);
    return res.status(500).json({ error: err.message });
  }
}
