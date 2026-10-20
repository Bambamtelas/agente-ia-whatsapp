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
const DEFAULT_PAUSE_DURATION_MS = 20 * 60 * 1000; // 20 minutos

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
   * Isso garante que ela NUNCA ative a pausa humana.
   */
  public registerAiSentMessage(msgId?: string, instanceName?: string, phone?: string) {
    if (msgId) {
      this.aiSentMessageIds.add(msgId);
      this.saveAiSentIds();
    }
    if (instanceName && phone) {
      const key = buildPauseKey(instanceName, phone);
      this.recentAiSentWindows.set(key, Date.now());
    }
  }

  /**
   * Verifica se uma mensagem foi gerada/enviada pela IA
   */
  public isAiSentMessage(msgId?: string, instanceName?: string, phone?: string, msgTimestampMs?: number): boolean {
    if (msgId && this.aiSentMessageIds.has(msgId)) {
      return true;
    }

    // Se a mensagem possui ID e ele NÃO está no conjunto da IA,
    // trata-se com certeza de uma mensagem manual enviada pelo operador humano
    if (msgId) {
      return false;
    }

    // Apenas se não houver msgId (fallback raro), checa janela recente
    if (instanceName && phone) {
      const key = buildPauseKey(instanceName, phone);
      const lastAiSentTime = this.recentAiSentWindows.get(key);
      if (lastAiSentTime) {
        const compareTime = msgTimestampMs || Date.now();
        if (Math.abs(compareTime - lastAiSentTime) <= 5000) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Registra ou renova uma pausa de 20 minutos por intervenção humana
   */
  public setPause(
    instanceName: string,
    phone: string,
    lastHumanMessage?: string,
    durationMs = DEFAULT_PAUSE_DURATION_MS
  ): HumanPauseRecord {
    const cleanPhone = normalizePhone(phone);
    const key = buildPauseKey(instanceName, cleanPhone);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationMs);

    const record: HumanPauseRecord = {
      instanceName: (instanceName || '').trim().toLowerCase(),
      phone: cleanPhone,
      pausedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      lastHumanMessage: lastHumanMessage ? lastHumanMessage.substring(0, 150) : undefined,
    };

    this.pauses.set(key, record);
    this.saveToDisk();

    console.log(`[HumanPauseManager] ⏸️ Pausa ativada/renovada para ${key}. Expira em: ${record.expiresAt}`);
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
