/**
 * Shin-Lab - https://github.com/riokuroxi-svg/Shin-Lab
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// ═══════════════════════════════════════════════════════════════════
//  EXPERIMENTO B7 — Shin Pub/Sub Event Bus & Coordinador de Agentes
//  Bus de eventos asíncrono desacoplado con:
//   - Tópicos con soporte de comodines/wildcards (ej: `user:*`, `*.alert`).
//   - Ordenamiento por prioridad y aislamiento total de errores.
//   - Coordinación reactiva entre múltiples Agentes y Memoria SQLite RAG.
// ═══════════════════════════════════════════════════════════════════

export class EventBus {
  constructor(opts = {}) {
    this.maxListenersPerTopic = opts.maxListenersPerTopic || 50;
    this.subscribers = new Map(); // topicPattern → Array<{ handler, priority, once, id }>
    this._subIdSeq = 0;
    this.maxDepth = opts.maxDepth || 32;
    this._currentDepth = 0;
  }

  /**
   * Convierte un patrón de tópico (ej: "user.*", "group:add:*") a RegExp.
   */
  _topicToRegex(pattern) {
    if (pattern === "*") return /^.*$/;
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, "[^.:/]+")
      .replace(/#/g, ".*");
    return new RegExp(`^${escaped}$`);
  }

  /**
   * Suscribe un listener a un patrón de tópicos.
   * @param {string} topicPattern
   * @param {function} handler (payload, eventMeta) => void | Promise<void>
   * @param {object} opts { priority?: number, once?: boolean }
   * @returns {function} función para desuscribirse
   */
  on(topicPattern, handler, opts = {}) {
    if (typeof handler !== "function") throw new TypeError("El handler debe ser una función.");
    const pattern = String(topicPattern || "*").trim();
    const priority = opts.priority ?? 0;
    const once = !!opts.once;
    const id = ++this._subIdSeq;

    if (!this.subscribers.has(pattern)) {
      this.subscribers.set(pattern, []);
    }

    const list = this.subscribers.get(pattern);
    if (list.length >= this.maxListenersPerTopic) {
      throw new Error(`Límite de suscriptores alcanzado (${this.maxListenersPerTopic}) para: '${pattern}'`);
    }

    const entry = {
      id,
      handler,
      priority,
      once,
      regex: this._topicToRegex(pattern),
    };

    list.push(entry);
    // Ordenar descendente por prioridad
    list.sort((a, b) => b.priority - a.priority);

    return () => this.offById(pattern, id);
  }

  /**
   * Suscribe un listener que se ejecuta solo una vez.
   */
  once(topicPattern, handler, opts = {}) {
    return this.on(topicPattern, handler, { ...opts, once: true });
  }

  /**
   * Desuscribe por ID interno.
   */
  offById(pattern, id) {
    const list = this.subscribers.get(pattern);
    if (!list) return false;
    const idx = list.findIndex(e => e.id === id);
    if (idx >= 0) {
      list.splice(idx, 1);
      if (list.length === 0) this.subscribers.delete(pattern);
      return true;
    }
    return false;
  }

  /**
   * Publica un evento de forma asíncrona a todos los suscriptores coincidentes.
   * Aislamiento total: un listener que falle o lance excepción no afecta al resto.
   * @param {string} topic
   * @param {any} payload
   * @returns {Promise<{ delivered: number, errors: Array<{ error: string, subscriberId: number }> }>}
   */
  async publish(topic, payload) {
    return this.emit(topic, payload);
  }

  async emit(topic, payload) {
    if (this._currentDepth >= (this.maxDepth || 32)) {
      return {
        delivered: 0,
        errors: [{ error: "EventBus recursion limit exceeded (cascade protection)", subscriberId: 0 }],
      };
    }

    this._currentDepth = (this._currentDepth || 0) + 1;
    try {
      const cleanTopic = String(topic || "").trim();
      const timestamp = Date.now();
      const eventMeta = { topic: cleanTopic, timestamp };

      const matchingHandlers = [];
      const toRemove = [];

      for (const [pattern, list] of this.subscribers.entries()) {
        for (const entry of list) {
          if (entry.regex.test(cleanTopic)) {
            matchingHandlers.push({ pattern, entry });
            if (entry.once) {
              toRemove.push({ pattern, id: entry.id });
            }
          }
        }
      }

      // Limpiar 'once'
      for (const { pattern, id } of toRemove) {
        this.offById(pattern, id);
      }

      // Ordenar todos los ejecutores por prioridad
      matchingHandlers.sort((a, b) => b.entry.priority - a.entry.priority);

      const errors = [];
      let delivered = 0;

      const executions = matchingHandlers.map(async ({ entry }) => {
        try {
          await Promise.race([
            entry.handler(payload, eventMeta),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout de handler (5000ms)")), 5000)),
          ]);
          delivered++;
        } catch (err) {
          errors.push({
            error: String(err?.message || err),
            subscriberId: entry.id,
          });
        }
      });

      await Promise.all(executions);
      return { delivered, errors };
    } finally {
      this._currentDepth--;
    }
  }

  /**
   * Limpia todos los suscriptores.
   */
  clear() {
    this.subscribers.clear();
  }

  listenerCount(topicPattern) {
    if (!topicPattern) {
      let total = 0;
      for (const list of this.subscribers.values()) total += list.length;
      return total;
    }
    return this.subscribers.get(topicPattern)?.length || 0;
  }
}

// ── Coordinador Reactivo Agentes ↔ Memoria ─────────────────────────
export function createAgentEventCoordinator(opts = {}) {
  const eventBus = opts.eventBus || new EventBus();
  const memory = opts.memory || null;
  const pipeline = opts.pipeline || null;

  // 1. Reacción automática a transacciones de economía → registra recuerdo
  if (memory) {
    eventBus.on("economy:transaction", async (data) => {
      if (data?.userId && data?.type && data?.amount) {
        const fact = `Transacción ${data.type}: ¥${data.amount} (${data.description || "general"})`;
        memory.remember(data.userId, `me gusta comprar ${data.description || "artículos"}`);
        memory.noteCommand(data.userId, "economy_transact");
      }
    });

    // 2. Reacción a eventos de usuario → actualiza memoria conversacional
    eventBus.on("user:message", async (data) => {
      if (data?.userId && data?.text) {
        memory.remember(data.userId, data.text);
      }
    });
  }

  // 3. Reacción a alertas de seguridad → log reactivo
  const securityLogs = [];
  eventBus.on("security:*", async (data, meta) => {
    securityLogs.push({ topic: meta.topic, data, ts: meta.timestamp });
    if (securityLogs.length > 100) securityLogs.shift();
  });

  return {
    eventBus,
    memory,
    pipeline,
    getSecurityLogs: () => [...securityLogs],
  };
}

export default { EventBus, createAgentEventCoordinator };
