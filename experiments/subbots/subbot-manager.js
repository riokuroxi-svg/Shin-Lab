/**
 * Shin-Lab - https://github.com/riokuroxi-svg/Shin-Lab
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// ═══════════════════════════════════════════════════════════════════
//  EXPERIMENTO 03/06-bis — Sub-bots aislados con Contrato de Permisos
//  Cada sub-bot vive en su propio child_process.fork con ACLs:
//   - Capability Matrix: categorías permitidas, lista blanca/negra de tools.
//   - Risk Gate: límite máximo de nivel de riesgo (low/medium/high/critical).
//   - Data Isolation: permisos explícitos sobre DB maestra y memoria.
//   - Rate Limiter por sub-bot: cuota de operaciones por minuto.
// ═══════════════════════════════════════════════════════════════════
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DEFAULT_WORKER = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "subbot-worker.js"
);

const RISK_LEVELS = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export const DEFAULT_CAPABILITIES = {
  allowedCategories: ["utility", "fun", "general", "economy"],
  allowedTools: ["*"],
  deniedTools: ["exec", "eval", "shutdown", "kick_user", "system_override", "admin_shutdown"],
  maxRisk: "medium",
  dataAccess: {
    readMemory: true,
    writeMemory: true,
    readMasterDb: false,
    writeMasterDb: false,
  },
  maxOpsPerMinute: 60,
};

export function createSubBotManager(opts) {
  opts = opts || {};
  const workerScript = opts.workerScript || DEFAULT_WORKER;
  const maxRestarts = opts.maxRestarts ?? 3;
  const subs = new Map();   // id → { proc, cfg, restarts, state, intentional, ops: [] }
  const listeners = [];
  const pendingRespawns = new Set();

  function emit(id, type, data) {
    const ev = { id, type, ...(data || {}) };
    for (const fn of listeners) {
      try { fn(ev); } catch {}
    }
  }

  function onEvent(fn) {
    listeners.push(fn);
    return () => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  /**
   * Evalúa si una acción solicitada cumple con el contrato de capacidades del sub-bot.
   */
  function checkCapability(id, req) {
    const entry = subs.get(String(id));
    if (!entry) return { allowed: false, code: "ERR_SUBBOT_NOT_FOUND", reason: "Sub-bot no existe o no está activo." };

    const caps = {
      ...DEFAULT_CAPABILITIES,
      ...(entry.cfg.capabilities || {}),
      dataAccess: {
        ...DEFAULT_CAPABILITIES.dataAccess,
        ...(entry.cfg.capabilities?.dataAccess || {}),
      },
    };

    // 1. Rate Limiter por sub-bot
    const now = Date.now();
    entry.ops = (entry.ops || []).filter(t => now - t < 60000);
    if (entry.ops.length >= caps.maxOpsPerMinute) {
      return {
        allowed: false,
        code: "ERR_RATE_LIMIT_EXCEEDED",
        reason: `Cuota de operaciones excedida (${caps.maxOpsPerMinute} ops/minuto).`,
      };
    }
    entry.ops.push(now);

    // 2. Control de Acceso a Tools
    if (req.type === "tool") {
      const toolName = (req.name || "").toLowerCase().trim();
      const category = (req.category || "general").toLowerCase().trim();
      const risk = (req.risk || "low").toLowerCase().trim();

      // Lista negra explícita
      if (caps.deniedTools.includes(toolName)) {
        return {
          allowed: false,
          code: "ERR_TOOL_DENIED",
          reason: `La tool '${toolName}' está explícitamente prohibida para este sub-bot.`,
        };
      }

      // Lista blanca de herramientas
      if (!caps.allowedTools.includes("*") && !caps.allowedTools.includes(toolName)) {
        return {
          allowed: false,
          code: "ERR_TOOL_NOT_WHITELISTED",
          reason: `La tool '${toolName}' no está autorizada en la lista permitida.`,
        };
      }

      // Categoría permitida
      if (!caps.allowedCategories.includes("*") && !caps.allowedCategories.includes(category)) {
        return {
          allowed: false,
          code: "ERR_CATEGORY_UNAUTHORIZED",
          reason: `La categoría '${category}' no está permitida para este sub-bot.`,
        };
      }

      // Límite de nivel de riesgo
      const toolRiskScore = RISK_LEVELS[risk] || 1;
      const maxRiskScore = RISK_LEVELS[caps.maxRisk] || 2;
      if (toolRiskScore > maxRiskScore) {
        return {
          allowed: false,
          code: "ERR_RISK_LIMIT_EXCEEDED",
          reason: `Nivel de riesgo '${risk}' excede el límite permitido ('${caps.maxRisk}').`,
        };
      }
    }

    // 3. Control de Acceso a Datos (Data Access Layer)
    if (req.type === "data") {
      if (req.target === "masterDb") {
        if (req.action === "write" && !caps.dataAccess.writeMasterDb) {
          return {
            allowed: false,
            code: "ERR_DATA_ACCESS_DENIED",
            reason: "Escritura no autorizada en la base de datos maestra.",
          };
        }
        if (req.action === "read" && !caps.dataAccess.readMasterDb) {
          return {
            allowed: false,
            code: "ERR_DATA_ACCESS_DENIED",
            reason: "Lectura no autorizada en la base de datos maestra.",
          };
        }
      }
    }

    return { allowed: true };
  }

  function start(id, cfg, restartCount) {
    const proc = fork(workerScript, [], {
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      env: { ...process.env, SUBBOT_ID: id },
    });
    const entry = { proc, cfg, restarts: restartCount, state: "starting", intentional: false, ops: [] };
    subs.set(id, entry);

    proc.on("message", (msg) => {
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "ready") {
        entry.state = "running";
        emit(id, "ready", { pid: proc.pid, capabilities: msg.capabilities });
      } else if (msg.type === "request_action") {
        const check = checkCapability(id, msg.action || {});
        if (!check.allowed) {
          emit(id, "security_violation", { action: msg.action, error: check.reason, code: check.code, requestId: msg.requestId });
          proc.send({ type: "action_rejected", requestId: msg.requestId, error: check.reason, code: check.code });
        } else {
          emit(id, "action_authorized", { action: msg.action, requestId: msg.requestId });
          proc.send({ type: "action_granted", requestId: msg.requestId });
        }
      } else {
        emit(id, msg.type || "message", msg);
      }
    });

    proc.on("error", (err) => emit(id, "error", { message: String(err && err.message || err) }));

    proc.on("exit", (code, signal) => {
      subs.delete(id);
      emit(id, "exit", { code, signal });
      if (entry.intentional) return;
      const crashed = code !== 0 || signal;
      if (!crashed) return;
      if (restartCount < maxRestarts) {
        const attempt = restartCount + 1;
        emit(id, "respawn", { attempt, inMs: 50 * attempt });
        const timer = setTimeout(() => {
          pendingRespawns.delete(timer);
          if (!subs.has(id)) start(id, cfg, attempt);
        }, 50 * attempt);
        pendingRespawns.add(timer);
      } else {
        emit(id, "gave-up", { restarts: restartCount });
      }
    });

    try { proc.send({ type: "start", id, config: cfg || {} }); } catch {}
    return { ok: true, id, pid: proc.pid };
  }

  function spawn(id, cfg) {
    id = String(id ?? "");
    if (!id) return { ok: false, error: "falta id" };
    if (subs.has(id)) return { ok: false, error: "ya existe" };
    return start(id, cfg || {}, 0);
  }

  function send(id, msg) {
    const e = subs.get(String(id));
    if (!e || !e.proc.connected) return false;
    try { e.proc.send(msg); return true; } catch { return false; }
  }

  function kill(id) {
    const e = subs.get(String(id));
    if (!e) return false;
    e.intentional = true;
    try { e.proc.kill("SIGTERM"); } catch {}
    return true;
  }

  function list() {
    return [...subs.entries()].map(([id, e]) => ({
      id, state: e.state, restarts: e.restarts, pid: e.proc.pid, capabilities: e.cfg?.capabilities || DEFAULT_CAPABILITIES,
    }));
  }

  async function killAll(timeoutMs) {
    for (const t of pendingRespawns) clearTimeout(t);
    pendingRespawns.clear();
    const ids = [...subs.keys()];
    for (const id of ids) kill(id);
    const limit = Date.now() + (timeoutMs ?? 2000);
    while (subs.size > 0 && Date.now() < limit) {
      await new Promise(r => setTimeout(r, 20));
    }
    for (const e of subs.values()) { try { e.proc.kill("SIGKILL"); } catch {} }
    subs.clear();
  }

  return { spawn, send, kill, list, killAll, onEvent, checkCapability };
}

export default createSubBotManager;
