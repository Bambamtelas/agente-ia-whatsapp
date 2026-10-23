import fs from 'node:fs';
import path from 'node:path';
import { normalizePhone } from './humanPauseManager.ts';

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

const HISTORY_FILE = path.resolve(process.cwd(), '.chat-histories.json');
const LID_MAP_FILE = path.resolve(process.cwd(), '.lid-phone-map.json');
const MAX_HISTORY_PER_CHAT = 30;

export class ChatHistoryManager {
  private histories: Map<string, ChatMessage[]> = new Map(); // phone -> messages
  private lidToPhone: Map<string, string> = new Map(); // lid -> phone
  private phoneToLid: Map<string, string> = new Map(); // phone -> lid

  constructor() {
    this.loadFromDisk();
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(LID_MAP_FILE)) {
        const raw = fs.readFileSync(LID_MAP_FILE, 'utf-8');
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          for (const [lid, ph] of Object.entries(data)) {
            const cleanLid = normalizePhone(lid);
            const cleanPh = normalizePhone(ph as string);
            if (cleanLid && cleanPh) {
              this.lidToPhone.set(cleanLid, cleanPh);
              this.phoneToLid.set(cleanPh, cleanLid);
            }
          }
        }
      }
    } catch (err: any) {
      console.warn('[ChatHistoryManager] Erro ao carregar mapa LID:', err.message);
    }

    try {
      if (fs.existsSync(HISTORY_FILE)) {
        const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          for (const [phone, msgs] of Object.entries(data)) {
            const cleanPhone = normalizePhone(phone);
            if (cleanPhone && Array.isArray(msgs)) {
              this.histories.set(cleanPhone, msgs);
            }
          }
        }
        console.log(`[ChatHistoryManager] 📚 Carregados históricos de ${this.histories.size} contatos do disco.`);
      }
    } catch (err: any) {
      console.warn('[ChatHistoryManager] Erro ao carregar históricos do disco:', err.message);
    }
  }

  private saveToDisk() {
    try {
      const obj: Record<string, ChatMessage[]> = {};
      for (const [phone, msgs] of this.histories.entries()) {
        obj[phone] = msgs.slice(-MAX_HISTORY_PER_CHAT);
      }
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(obj, null, 2), 'utf-8');

      const lidObj: Record<string, string> = {};
      for (const [lid, phone] of this.lidToPhone.entries()) {
        lidObj[lid] = phone;
      }
      fs.writeFileSync(LID_MAP_FILE, JSON.stringify(lidObj, null, 2), 'utf-8');
    } catch (err: any) {
      console.warn('[ChatHistoryManager] Erro ao salvar histórico:', err.message);
    }
  }

  /**
   * Registra a correspondência entre LID (WhatsApp Web) e o número de telefone real
   */
  public registerLidMapping(remoteJid: string, remoteJidAlt?: string) {
    if (!remoteJid) return;
    const isLid = remoteJid.includes('@lid');
    const isPhone = remoteJid.includes('@s.whatsapp.net');

    let lid = isLid ? normalizePhone(remoteJid) : '';
    let phone = isPhone ? normalizePhone(remoteJid) : '';

    if (remoteJidAlt) {
      if (remoteJidAlt.includes('@s.whatsapp.net') && !phone) {
        phone = normalizePhone(remoteJidAlt);
      }
      if (remoteJidAlt.includes('@lid') && !lid) {
        lid = normalizePhone(remoteJidAlt);
      }
    }

    if (lid && phone && lid !== phone) {
      this.lidToPhone.set(lid, phone);
      this.phoneToLid.set(phone, lid);
      this.saveToDisk();
    }
  }

  /**
   * Converte qualquer identificador (seja LID ou telefone) para o telefone canônico
   */
  public getCanonicalPhone(identifier: string): string {
    const clean = normalizePhone(identifier);
    if (!clean) return '';
    return this.lidToPhone.get(clean) || clean;
  }

  public getLidForPhone(phone: string): string | undefined {
    const clean = normalizePhone(phone);
    return this.phoneToLid.get(clean);
  }

  /**
   * Adiciona mensagem ao histórico do contato
   */
  public addMessage(
    identifier: string,
    role: 'user' | 'assistant',
    text: string,
    timestamp: number = Date.now(),
    id?: string
  ) {
    const phone = this.getCanonicalPhone(identifier);
    if (!phone || !text || !text.trim()) return;

    const trimmedText = text.trim();
    let list = this.histories.get(phone);
    if (!list) {
      list = [];
      this.histories.set(phone, list);
    }

    // Evita duplicatas exatas recentes
    const isDuplicate = list.some(
      m => (id && m.id === id) || (m.role === role && m.text === trimmedText && Math.abs(m.timestamp - timestamp) < 15000)
    );

    if (!isDuplicate) {
      list.push({ id, role, text: trimmedText, timestamp });
      if (list.length > MAX_HISTORY_PER_CHAT) {
        list = list.slice(-MAX_HISTORY_PER_CHAT);
        this.histories.set(phone, list);
      }
      this.saveToDisk();
    }
  }

  /**
   * Retorna histórico formatado para chamada com a IA
   */
  public getHistory(identifier: string): Array<{ role: 'user' | 'assistant'; text: string }> {
    const phone = this.getCanonicalPhone(identifier);
    if (!phone) return [];
    const list = this.histories.get(phone) || [];
    return list.map(m => ({
      role: m.role,
      text: m.text,
    }));
  }

  /**
   * Se o histórico local estiver vazio ou incompleto, busca no banco da Evolution API
   */
  public async hydrateFromEvolution(
    instanceName: string,
    phoneOrLid: string,
    apiUrl: string,
    apiKey: string
  ): Promise<Array<{ role: 'user' | 'assistant'; text: string }>> {
    const phone = this.getCanonicalPhone(phoneOrLid);
    const lid = this.getLidForPhone(phone) || (phoneOrLid.includes('lid') ? normalizePhone(phoneOrLid) : '');

    const currentHistory = this.getHistory(phone);
    if (currentHistory.length >= 4) {
      return currentHistory;
    }

    try {
      const cleanApiUrl = apiUrl.replace(/\/$/, '');
      const fetchPromises: Promise<any>[] = [];

      // 1. Mensagens do bot (enviadas para o número de WhatsApp)
      if (phone) {
        fetchPromises.push(
          fetch(`${cleanApiUrl}/chat/findMessages/${encodeURIComponent(instanceName)}?page=1`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: apiKey },
            body: JSON.stringify({
              where: { key: { remoteJid: `${phone}@s.whatsapp.net` } },
            }),
          }).then(r => r.json()).catch(() => ({}))
        );
      }

      // 2. Mensagens do cliente (recebidas via LID se houver)
      if (lid && lid !== phone) {
        fetchPromises.push(
          fetch(`${cleanApiUrl}/chat/findMessages/${encodeURIComponent(instanceName)}?page=1`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: apiKey },
            body: JSON.stringify({
              where: { key: { remoteJid: `${lid}@lid` } },
            }),
          }).then(r => r.json()).catch(() => ({}))
        );
      }

      const results = await Promise.all(fetchPromises);
      const allRecords: any[] = [];

      for (const res of results) {
        const records = res?.messages?.records || (Array.isArray(res) ? res : []);
        allRecords.push(...records);
      }

      if (allRecords.length > 0) {
        // Ordena cronologicamente
        allRecords.sort((a, b) => (Number(a.messageTimestamp) || 0) - (Number(b.messageTimestamp) || 0));

        for (const r of allRecords) {
          const text =
            r.message?.conversation ||
            r.message?.extendedTextMessage?.text ||
            (r.message?.imageMessage?.caption ? `[Imagem: ${r.message.imageMessage.caption}]` : '') ||
            '';

          if (text && text.trim()) {
            this.addMessage(
              phone,
              r.key?.fromMe ? 'assistant' : 'user',
              text.trim(),
              (Number(r.messageTimestamp) || 0) * 1000,
              r.id || r.key?.id
            );
          }
        }
      }
    } catch (err: any) {
      console.warn(`[ChatHistoryManager] Não foi possível hidratar histórico de +${phone}:`, err.message);
    }

    return this.getHistory(phone);
  }
}

export const chatHistoryManager = new ChatHistoryManager();
