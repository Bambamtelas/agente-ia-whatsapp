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
    console.log(`[HumanPause Vercel] ▶️ Pausa de 20 minutos expirou para ${key}. IA liberada.`);
    return false;
  }
  return true;
}

function setContactPause(instanceName, phone, lastMsg, durationMs = 20 * 60 * 1000) {
  const key = buildPauseKey(instanceName, phone);
  const expiresAt = Date.now() + durationMs;
  globalStore.pauses.set(key, { expiresAt, lastMsg });
  console.log(`[HumanPause Vercel] ⏸️ Pausa ativada/renovada para ${key} até ${new Date(expiresAt).toISOString()}`);
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
        return data[0];
      }
    }
  } catch (err) {
    console.warn('[Vercel Webhook] Falha ao buscar agente no Supabase:', err.message);
  }
  return null;
}

async function callGeminiAI(systemPrompt, userMessage) {
  const models = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-1.5-flash'];
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

    const instanceName = (
      body.instance ||
      body.instanceName ||
      body.data?.instance ||
      'jdgestor_8ac6207d22e44198a25a'
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

      const msgId = msg.id || msg.key?.id || '';
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
      const dedupeKey = msgId || keyId;
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
        // Se este ID foi enviado pela IA, não é atendimento humano
        if ((msgId && globalStore.aiSentIds.has(msgId)) || (keyId && globalStore.aiSentIds.has(keyId))) {
          continue;
        }

        const textContent = (
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          ''
        ).trim();

        // Ativa ou reinicia a pausa de 20 minutos
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
## CATÁLOGO DE IMAGENS DISPONÍVEIS:
${mediaCatalog.map((item, idx) => `[MÍDIA #${idx + 1}] ID: "${item.id}" | Título: "${item.title}" | Quando enviar: ${item.trigger_prompt} | Comando: [ENVIAR_IMAGEM: ${item.id}]`).join('\n')}

Quando a conversa solicitar uma imagem, inclua a tag [ENVIAR_IMAGEM: ID_DA_IMAGEM] no final da sua resposta.
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

      // Extrai tags de imagens: [ENVIAR_IMAGEM: id]
      const mediaTagRegex = /\[(?:ENVIAR_IMAGEM|ENVIAR_FOTO):\s*([^\]]+)\]/gi;
      const requestedMediaKeys = [];
      let match;
      while ((match = mediaTagRegex.exec(rawResponse)) !== null) {
        requestedMediaKeys.push(match[1].trim());
      }

      // Limpa tags do texto final
      const cleanedResponse = rawResponse.replace(mediaTagRegex, '').trim();
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
          const sentId = sendData?.key?.id || sendData?.id;
          if (sentId) {
            globalStore.aiSentIds.add(sentId);
          }
          console.log(`[Vercel Webhook] ✅ Mensagem ${i + 1}/${textChunks.length} enviada para +${targetPhone}`);
        } else {
          console.warn(`[Vercel Webhook] Falha ao enviar texto para +${targetPhone}:`, sendRes.statusText);
        }

        // Pequena pausa entre balões
        if (i < textChunks.length - 1) {
          await new Promise(r => setTimeout(r, 1200));
        }
      }

      // 2. Envia as imagens solicitadas
      if (requestedMediaKeys.length > 0 && mediaCatalog.length > 0) {
        for (const rawKey of requestedMediaKeys) {
          if (isContactPaused(instanceName, targetPhone)) break;

          const key = rawKey.toLowerCase();
          const matchedItem = mediaCatalog.find(
            m => m.id.toLowerCase() === key || m.title.toLowerCase() === key || m.title.toLowerCase().includes(key)
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
