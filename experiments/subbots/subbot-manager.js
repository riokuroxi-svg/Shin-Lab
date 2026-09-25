/**
 * Shin-Lab - https://github.com/riokuroxi-svg/Shin-Lab
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// ═══════════════════════════════════════════════════════════════════
//  EXPERIMENTO 03 — Sub-bots aislados por proceso
//  Cada sub-bot vive en su propio child_process.fork con su propia
//  sesión. Si uno crashea: se re-lanza solo (hasta N veces) y el
//  main ni se inmuta. Protocolo IPC en JSON. En la migración a
//  Shin-MD, el worker se convierte en una sesión Baileys real.
//  Criterio del plan: matar un sub-bot a mano no afecta al main.
// ═══════════════════════════════════════════════════════════════════
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DEFAULT_WORKER = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "subbot-worker.js"
);

export function createSubBotManager(opts) {
  opts = opts || {};
  const workerScript = opts.workerScript || DEFAULT_WORKER;
  const maxRestarts = opts.maxRestarts ?? 3;
  const subs = new Map();   // id → { proc, cfg, restarts, state, intentional }
  const listeners = [];
  const pendingRespawns = new Set(); // timers de respawn aún no disparados

  function emit(id, type, data) {
    const ev = { id, type, ...(data || {}) };
    for (const fn of listeners) {
      try { fn(ev); } catch { /* un listener roto no tumba al manager */ }
    }
  }

  /** onEvent(fn) → suscribirse a eventos { id, type, ... }. Devuelve unsubscribe. */
  function onEvent(fn) {
    listeners.push(fn);
    return () => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  function start(id, cfg, restartCount) {
    const proc = fork(workerScript, [], {
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      env: { ...process.env, SUBBOT_ID: id },
    });
    const entry = { proc, cfg, restarts: restartCount, state: "starting", intentional: false };
    subs.set(id, entry);

    proc.on("message", (msg) => {
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "ready") {
        entry.state = "running";
        emit(id, "ready", { pid: proc.pid });
      } else {
        emit(id, msg.type || "message", { payload: msg.payload ?? msg });
      }
    });

    proc.on("error", (err) => emit(id, "error", { message: String(err && err.message || err) }));

    proc.on("exit", (code, signal) => {
      subs.delete(id);
      emit(id, "exit", { code, signal });
      if (entry.intentional) return;              // kill a mano → no revive
      const crashed = code !== 0 || signal;
      if (!crashed) return;                       // salida limpia → adiós
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

    try { proc.send({ type: "start", id, config: cfg || {} }); } catch { /* ya murió */ }
    return { ok: true, id, pid: proc.pid };
  }

  /**
   * spawn(id, cfg?) → arranca un sub-bot. Devuelve { ok } o { ok:false, error }.
   * cfg.owner se registra para el futuro filtro de permisos (E6.3-bis).
   */
  function spawn(id, cfg) {
    id = String(id ?? "");
    if (!id) return { ok: false, error: "falta id" };
    if (subs.has(id)) return { ok: false, error: "ya existe" };
    return start(id, cfg || {}, 0);
  }

  /** send(id, msg) → mensaje IPC al sub-bot. false si no existe/está muerto. */
  function send(id, msg) {
    const e = subs.get(String(id));
    if (!e || !e.proc.connected) return false;
    try { e.proc.send(msg); return true; } catch { return false; }
  }

  /** kill(id) → mata el sub-bot SIN respawn (salida intencional). */
  function kill(id) {
    const e = subs.get(String(id));
    if (!e) return false;
    e.intentional = true;
    try { e.proc.kill("SIGTERM"); } catch { /* ya murió */ }
    return true;
  }

  /** list() → [{ id, state, restarts, pid }] de los sub-bots vivos. */
  function list() {
    return [...subs.entries()].map(([id, e]) => ({
      id, state: e.state, restarts: e.restarts, pid: e.proc.pid,
    }));
  }

  /** killAll() → apaga todos y CANCELA respawns pendientes (espera hasta timeoutMs). */
  async function killAll(timeoutMs) {
    for (const t of pendingRespawns) clearTimeout(t);
    pendingRespawns.clear();
    const ids = [...subs.keys()];
    for (const id of ids) kill(id);
    const limit = Date.now() + (timeoutMs ?? 2000);
    while (subs.size > 0 && Date.now() < limit) {
      await new Promise(r => setTimeout(r, 20));
    }
    // si alguno se quedó colgado, SIGKILL directo
    for (const e of subs.values()) { try { e.proc.kill("SIGKILL"); } catch { /* ok */ } }
    subs.clear();
  }

  return { spawn, send, kill, list, killAll, onEvent };
}

export default createSubBotManager;
