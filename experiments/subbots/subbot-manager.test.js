/**
 * Shin-Lab - https://github.com/riokuroxi-svg/Shin-Lab
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 */
/**
 * Shin-Lab — Tests del Experimento 03 & Bloque B6 (Sub-bots con permisos y aislamiento)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSubBotManager } from "./subbot-manager.js";

/** Espera un evento que cumpla pred (timeout 5s). */
function waitFor(events, pred, timeoutMs) {
  const limit = Date.now() + (timeoutMs ?? 5000);
  return new Promise((resolve, reject) => {
    const tick = () => {
      const ev = events.find(pred);
      if (ev) return resolve(ev);
      if (Date.now() > limit) return reject(new Error("timeout esperando evento"));
      setTimeout(tick, 10);
    };
    tick();
  });
}

function setup(opts) {
  const mgr = createSubBotManager(opts);
  const events = [];
  mgr.onEvent(ev => events.push(ev));
  return { mgr, events };
}

test("handshake: spawn → el sub-bot responde ready", async () => {
  const { mgr, events } = setup();
  const r = mgr.spawn("s1");
  assert.equal(r.ok, true);
  await waitFor(events, e => e.id === "s1" && e.type === "ready");
  assert.equal(mgr.list().length, 1);
  assert.equal(mgr.list()[0].state, "running");
  await mgr.killAll();
});

test("IPC: el main le manda un mensaje y el sub-bot contesta", async () => {
  const { mgr, events } = setup();
  mgr.spawn("s1");
  await waitFor(events, e => e.type === "ready");
  assert.equal(mgr.send("s1", { type: "echo", payload: { hola: "mundo" } }), true);
  const reply = await waitFor(events, e => e.type === "reply");
  assert.deepEqual(reply.payload, { hola: "mundo" });
  await mgr.killAll();
});

test("kill a mano: sale y NO revive", async () => {
  const { mgr, events } = setup();
  mgr.spawn("s1");
  await waitFor(events, e => e.type === "ready");
  assert.equal(mgr.kill("s1"), true);
  await waitFor(events, e => e.type === "exit");
  await new Promise(r => setTimeout(r, 300));
  assert.equal(mgr.list().length, 0, "no quedó en la lista");
  assert.ok(!events.some(e => e.type === "respawn"), "no debió revivir");
  await mgr.killAll();
});

test("crash: revive solo y vuelve a estar listo", async () => {
  const { mgr, events } = setup();
  mgr.spawn("s1");
  await waitFor(events, e => e.type === "ready");
  mgr.send("s1", { type: "crash" });
  await waitFor(events, e => e.type === "exit");
  const rs = await waitFor(events, e => e.type === "respawn");
  assert.equal(rs.attempt, 1);
  await waitFor(events, e => e.type === "ready" && e !== events[0]);
  assert.equal(mgr.list()[0].restarts, 1);
  await mgr.killAll();
});

test("límite de respawns: tras N crashes se rinde", async () => {
  const { mgr, events } = setup({ maxRestarts: 2 });
  mgr.spawn("s1");
  await waitFor(events, e => e.type === "ready");
  mgr.send("s1", { type: "crash" });
  await waitFor(events, e => e.type === "respawn" && e.attempt === 1);
  await waitFor(events, e => e.type === "ready" && mgr.list()[0]?.restarts === 1);
  mgr.send("s1", { type: "crash" });
  await waitFor(events, e => e.type === "respawn" && e.attempt === 2);
  await waitFor(events, e => e.type === "ready" && mgr.list()[0]?.restarts === 2);
  mgr.send("s1", { type: "crash" });
  await waitFor(events, e => e.type === "gave-up");
  await new Promise(r => setTimeout(r, 200));
  assert.equal(mgr.list().length, 0);
  await mgr.killAll();
});

test("aislamiento: un sub-bot muerto no afecta al otro ni al main", async () => {
  const { mgr, events } = setup();
  mgr.spawn("vivo");
  mgr.spawn("muerto");
  await waitFor(events, e => e.id === "vivo" && e.type === "ready");
  await waitFor(events, e => e.id === "muerto" && e.type === "ready");
  mgr.send("muerto", { type: "crash" });
  await waitFor(events, e => e.id === "muerto" && e.type === "exit");
  assert.equal(mgr.send("vivo", { type: "echo", payload: "sigo aquí" }), true);
  const reply = await waitFor(events, e => e.id === "vivo" && e.type === "reply");
  assert.equal(reply.payload, "sigo aquí");
  await mgr.killAll();
});

test("duplicados: no se puede spawnear el mismo id dos veces", async () => {
  const { mgr, events } = setup();
  mgr.spawn("s1");
  await waitFor(events, e => e.type === "ready");
  const r = mgr.spawn("s1");
  assert.equal(r.ok, false);
  assert.match(r.error, /ya existe/);
  await mgr.killAll();
});

// ── B6: Tests del Contrato de Permisos y Capacidades ───────────────

test("B6 Permisos: sub-bot con permisos normales ejecuta tools permitidas", async () => {
  const { mgr, events } = setup();
  mgr.spawn("sub-normal", {
    capabilities: {
      allowedCategories: ["utility", "fun"],
      maxRisk: "medium",
    },
  });

  await waitFor(events, e => e.id === "sub-normal" && e.type === "ready");

  // Solicitar tool válida (ping)
  mgr.send("sub-normal", {
    type: "request_tool",
    requestId: "req-ping-1",
    toolName: "ping",
    category: "utility",
    risk: "low",
  });

  const grantedEv = await waitFor(events, e => e.type === "action_authorized");
  assert.equal(grantedEv.action.name, "ping");

  const executedEv = await waitFor(events, e => e.type === "action_executed");
  assert.equal(executedEv.status, "SUCCESS");

  await mgr.killAll();
});

test("B6 Permisos: sub-bot bloqueado si intenta ejecutar tool en lista negra o riesgo crítico", async () => {
  const { mgr, events } = setup();
  mgr.spawn("sub-restricted", {
    capabilities: {
      deniedTools: ["exec", "eval", "kick_user"],
      maxRisk: "medium",
    },
  });

  await waitFor(events, e => e.id === "sub-restricted" && e.type === "ready");

  // Intento 1: Tool en deniedTools (kick_user)
  mgr.send("sub-restricted", {
    type: "request_tool",
    requestId: "req-kick",
    toolName: "kick_user",
    category: "admin",
    risk: "high",
  });

  const violation1 = await waitFor(events, e => e.type === "security_violation");
  assert.equal(violation1.code, "ERR_TOOL_DENIED");

  const blocked1 = await waitFor(events, e => e.type === "action_blocked");
  assert.equal(blocked1.code, "ERR_TOOL_DENIED");

  await mgr.killAll();
});

test("B6 Permisos: sub-bot bloqueado si intenta escribir en la base de datos maestra", async () => {
  const { mgr, events } = setup();
  mgr.spawn("sub-guest", {
    capabilities: {
      dataAccess: { writeMasterDb: false, readMasterDb: false },
    },
  });

  await waitFor(events, e => e.id === "sub-guest" && e.type === "ready");

  mgr.send("sub-guest", {
    type: "request_db_write",
    requestId: "req-db",
    payload: { table: "settings", key: "owner_jid", value: "hacker@s.whatsapp.net" },
  });

  const violation = await waitFor(events, e => e.type === "security_violation");
  assert.equal(violation.code, "ERR_DATA_ACCESS_DENIED");

  const blocked = await waitFor(events, e => e.type === "action_blocked");
  assert.equal(blocked.code, "ERR_DATA_ACCESS_DENIED");

  await mgr.killAll();
});

test("B6 Permisos: sub-bot sujeto a cuota de operaciones (rate limit por sub-bot)", async () => {
  const { mgr } = setup();
  mgr.spawn("sub-rate", {
    capabilities: {
      maxOpsPerMinute: 3,
    },
  });

  // 3 operaciones permitidas
  assert.equal(mgr.checkCapability("sub-rate", { type: "tool", name: "ping" }).allowed, true);
  assert.equal(mgr.checkCapability("sub-rate", { type: "tool", name: "ping" }).allowed, true);
  assert.equal(mgr.checkCapability("sub-rate", { type: "tool", name: "ping" }).allowed, true);

  // 4ta operación excede la cuota
  const check4 = mgr.checkCapability("sub-rate", { type: "tool", name: "ping" });
  assert.equal(check4.allowed, false);
  assert.equal(check4.code, "ERR_RATE_LIMIT_EXCEEDED");

  await mgr.killAll();
});
