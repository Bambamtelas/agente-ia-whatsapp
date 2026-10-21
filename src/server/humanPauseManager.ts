import fs from 'node:fs';
import path from 'node:path';

export interface HumanPauseRecord {
  instanceName: string;
  phone: string; // Número normalizado (somente dígitos)
  pausedAt: string; // Data ISO de início
  expiresAt: string; // Data ISO de expiração (pausedAt + 20 minutos)
  lastHumanMessage?: string; // Trecho da mensagem manual que ativou a pausa
}

const PAUSES_FILE = path.resolve(process.cwd(), '.human-pauses.json');
const AI_SENT_IDS_FILE = path.resolve(process.cwd(), '.ai-sent-ids.json');
const DEFAULT_PAUSE_DURATION_MS = 5 * 60 * 1000; // 5 minutos

/**
 * Normaliza um identificador de telefone WhatsApp:
 * Remove sufixos @s.whatsapp.net, @lid, espaços e caracteres não numéricos.
 */
export function normalizePhone(rawPhone: string): string {
  if (!rawPhone) return '';
  return rawPhone
    .replace('@s.whatsapp.net', '')
    .replace('@lid', '')
    .replace(/\D/g, '')
    .trim();
}

/**
 * Cria a chave composta exclusiva por instância e contato
 */
export function buildPauseKey(instanceName: string, phone: string): string {
  const cleanInst = (instanceName || '').trim().toLowerCase();
  const cleanPhone = normalizePhone(phone);
  return `${cleanInst}:${cleanPhone}`;
}

export class HumanPauseManager {
  private pauses: Map<string, HumanPauseRecord> = new Map();
  private aiSentMessageIds: Set<string> = new Set();
  private recentAiSentWindows: Map<string, number> = new Map(); // key -> timestamp em ms
  private recentAiSentTexts: Map<string, Set<string>> = new Map(); // key -> trechos de textos enviados pela IA

  constructor() {
    this.loadFromDisk();
  }

  /**
   * Carrega pausas e IDs de mensagens da IA do disco
   */
  private loadFromDisk() {
    // 1. Carrega pausas salvas
    try {
      if (fs.existsSync(PAUSES_FILE)) {
        const raw = fs.readFileSync(PAUSES_FILE, 'utf-8');
        const list: HumanPauseRecord[] = JSON.parse(raw);
        const now = Date.now();
        if (Array.isArray(list)) {
          list.forEach(item => {
            const expTime = new Date(item.expiresAt).getTime();
            // Mantém somente se ainda não expirou
            if (expTime > now) {
              const key = buildPauseKey(item.instanceName, item.phone);
              this.pauses.set(key, item);
            }
          });
        }
        console.log(`[HumanPauseManager] 📂 Carregadas ${this.pauses.size} pausas ativas do disco.`);
      }
    } catch (err: any) {
      console.warn('[HumanPauseManager] Erro ao carregar pausas:', err.message);
    }

    // 2. Carrega histórico de IDs enviados pela IA para evitar falso-positivo
    try {
      if (fs.existsSync(AI_SENT_IDS_FILE)) {
        const raw = fs.readFileSync(AI_SENT_IDS_FILE, 'utf-8');
        const ids: string[] = JSON.parse(raw);
        if (Array.isArray(ids)) {
          // Mantém os últimos 500 IDs
          ids.slice(-500).forEach(id => this.aiSentMessageIds.add(id));
        }
      }
    } catch {}
  }

  /**
   * Salva as pausas ativas no disco para persistência pós-reinicialização
   */
  private saveToDisk() {
    try {
      this.cleanupExpired();
      const list = Array.from(this.pauses.values());
      fs.writeFileSync(PAUSES_FILE, JSON.stringify(list, null, 2), 'utf-8');
    } catch (err: any) {
      console.error('[HumanPauseManager] Erro ao salvar pausas no disco:', err.message);
    }
  }

  /**
   * Salva IDs de mensagens enviadas pela IA
   */
  private saveAiSentIds() {
    try {
      const list = Array.from(this.aiSentMessageIds).slice(-500);
      fs.writeFileSync(AI_SENT_IDS_FILE, JSON.stringify(list, null, 2), 'utf-8');
    } catch {}
  }

  /**
   * Remove registros expirados
   */
  public cleanupExpired(): void {
    const now = Date.now();
    for (const [key, record] of this.pauses.entries()) {
      if (new Date(record.expiresAt).getTime() <= now) {
        this.pauses.delete(key);
      }
    }
  }

  /**
   * Registra que uma mensagem foi enviada pela própria IA.
   * Suporta chamada com múltiplos IDs (WhatsApp key.id e cuid do banco) e texto enviado.
   */
  public registerAiSentMessage(
    params: {
      id?: string;
      keyId?: string;
      instanceName?: string;
      phone?: string;
      text?: string;
    } | string,
    legacyInstance?: string,
    legacyPhone?: string
  ) {
    let id: string | undefined;
    let keyId: string | undefined;
    let instanceName: string | undefined;
    let phone: string | undefined;
    let text: string | undefined;

    if (typeof params === 'object') {
      id = params.id;
      keyId = params.keyId;
      instanceName = params.instanceName;
      phone = params.phone;
      text = params.text;
    } else {
      id = params;
      instanceName = legacyInstance;
      phone = legacyPhone;
    }

    if (id) this.aiSentMessageIds.add(id);
    if (keyId) this.aiSentMessageIds.add(keyId);
    this.saveAiSentIds();

    if (instanceName && phone) {
      const key = buildPauseKey(instanceName, phone);
      this.recentAiSentWindows.set(key, Date.now());

      if (text && text.trim()) {
        const snippet = text.trim().substring(0, 50).toLowerCase();
        let set = this.recentAiSentTexts.get(key);
        if (!set) {
          set = new Set();
          this.recentAiSentTexts.set(key, set);
        }
        set.add(snippet);
        if (set.size > 20) {
          const first = set.values().next().value;
          if (first) set.delete(first);
        }
      }
    }
  }

  /**
   * Verifica de forma exaustiva se uma mensagem foi gerada/enviada pela IA
   */
  public isAiSentMessage(
    candidateIds: (string | undefined)[] | string | undefined,
    instanceName?: string,
    phone?: string,
    textContent?: string,
    msgTimestampMs?: number
  ): boolean {
    const ids: string[] = Array.isArray(candidateIds)
      ? candidateIds.filter((x): x is string => Boolean(x && typeof x === 'string' && x.trim()))
      : (candidateIds ? [candidateIds] : []);

    // 1. Verifica se qualquer um dos IDs (WhatsApp keyId ou DB id) foi disparado pela IA
    for (const id of ids) {
      if (this.aiSentMessageIds.has(id)) {
        return true;
      }
    }

    // 2. Se o conteúdo contiver palavras-chave ou links exclusivos do agente de IA
    if (textContent) {
      const cleanContent = textContent.trim().toLowerCase();
      const botKeywords = [
        'gestordestreamings',
        'auto-divulga-whats',
        'gestor de streamings',
        'auto divulga whats',
        'seja bem-vindo',
        'qual anúncio você viu',
        'duas opções para você',
        '85988159811',
        'edvan dyemison',
        '199,90',
        '150,00',
        '99,90',
        'teste grátis por 3 dias',
        'lembretes automáticos de cobrança',
        'painéis de iptv',
        'vídeo tutorial disponível',
        'chave pix',
        'conheça aqui:'
      ];
      if (botKeywords.some(kw => cleanContent.includes(kw))) {
        return true;
      }
    }

    // 3. Se o texto bater com mensagens enviadas recentemente pela IA neste chat
    if (instanceName && phone && textContent) {
      const key = buildPauseKey(instanceName, phone);
      const recentTexts = this.recentAiSentTexts.get(key);
      if (recentTexts && recentTexts.size > 0) {
        const cleanContent = textContent.trim().toLowerCase();
        for (const snippet of recentTexts) {
          if (cleanContent.startsWith(snippet) || cleanContent.includes(snippet) || snippet.includes(cleanContent.substring(0, 30))) {
            return true;
          }
        }
      }
    }

    // 3. Janela de tempo recente: se a IA enviou mensagem para este chat há menos de 45 segundos,
    // o evento fromMe: true recebido é o eco da própria IA
    if (instanceName && phone) {
      const key = buildPauseKey(instanceName, phone);
      const lastAiSentTime = this.recentAiSentWindows.get(key);
      if (lastAiSentTime) {
        const now = Date.now();
        if (Math.abs(now - lastAiSentTime) <= 45000) {
          return true;
        }
        if (msgTimestampMs && Math.abs(msgTimestampMs - lastAiSentTime) <= 45000) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Registra ou renova uma pausa de 20 minutos por intervenção humana
  /**
   * Registra ou renova uma pausa de atendimento humano (padrão 5 minutos).
   * Se a mensagem for antiga e a pausa já tiver expirado no passado, não ativa pausa.
   */
  public setPause(
    instanceName: string,
    phone: string,
    lastHumanMessage?: string,
    durationMs = DEFAULT_PAUSE_DURATION_MS,
    msgTimestampMs?: number
  ): HumanPauseRecord | null {
    const cleanPhone = normalizePhone(phone);
    const key = buildPauseKey(instanceName, cleanPhone);

    const baseTime = msgTimestampMs && msgTimestampMs > 0 ? msgTimestampMs : Date.now();
    const expiresAtMs = baseTime + durationMs;

    // Se a mensagem enviada for antiga e o prazo de pausa já teria expirado no passado, não pausa!
    if (expiresAtMs <= Date.now()) {
      return null;
    }

    const record: HumanPauseRecord = {
      instanceName: (instanceName || '').trim().toLowerCase(),
      phone: cleanPhone,
      pausedAt: new Date(baseTime).toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
      lastHumanMessage: lastHumanMessage ? lastHumanMessage.substring(0, 150) : undefined,
    };

    this.pauses.set(key, record);
    this.saveToDisk();

    console.log(`[HumanPauseManager] ⏸️ Pausa ativada para ${key}. Expira em: ${record.expiresAt}`);
    return record;
  }

  /**
   * Verifica se o contato está atualmente sob atendimento humano (pausado)
   */
  public isPaused(instanceName: string, phone: string): boolean {
    const key = buildPauseKey(instanceName, phone);
    const record = this.pauses.get(key);
    if (!record) return false;

    const now = Date.now();
    const expTime = new Date(record.expiresAt).getTime();

    if (now >= expTime) {
      // Expirou
      this.pauses.delete(key);
      this.saveToDisk();
      console.log(`[HumanPauseManager] ▶️ Pausa de 20 minutos expirou para ${key}. IA liberada para responder.`);
      return false;
    }

    return true;
  }

  /**
   * Retorna os detalhes da pausa ativa para o contato ou null se não houver
   */
  public getPause(instanceName: string, phone: string): HumanPauseRecord | null {
    if (!this.isPaused(instanceName, phone)) return null;
    const key = buildPauseKey(instanceName, phone);
    return this.pauses.get(key) || null;
  }

  /**
   * Remove manualmente a pausa (ex: operador devolveu o cliente para o robô)
   */
  public clearPause(instanceName: string, phone: string): boolean {
    const key = buildPauseKey(instanceName, phone);
    const had = this.pauses.delete(key);
    if (had) {
      this.saveToDisk();
      console.log(`[HumanPauseManager] 🔄 Pausa removida manualmente para ${key}.`);
    }
    return had;
  }

  /**
   * Retorna todas as pausas ativas
   */
  public getAllActivePauses(): HumanPauseRecord[] {
    this.cleanupExpired();
    return Array.from(this.pauses.values());
  }
}

export const humanPauseManager: HumanPauseManager = new HumanPauseManager();
(globalThis as any).__humanPauseManager = humanPauseManager;
