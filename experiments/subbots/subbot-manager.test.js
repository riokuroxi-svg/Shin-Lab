/**
 * Shin-Lab - https://github.com/riokuroxi-svg/Shin-Lab
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 */
/**
 * Shin-Lab — Tests del Experimento 03 (Sub-bots aislados por proceso)
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
  // crash 1
  mgr.send("s1", { type: "crash" });
  await waitFor(events, e => e.type === "respawn" && e.attempt === 1);
  await waitFor(events, e => e.type === "ready" && mgr.list()[0]?.restarts === 1);
  // crash 2
  mgr.send("s1", { type: "crash" });
  await waitFor(events, e => e.type === "respawn" && e.attempt === 2);
  await waitFor(events, e => e.type === "ready" && mgr.list()[0]?.restarts === 2);
  // crash 3 → se rinde
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
  // el main (este test) sigue vivo y manda matar a uno
  mgr.send("muerto", { type: "crash" });
  await waitFor(events, e => e.id === "muerto" && e.type === "exit");
  // el sobreviviente sigue respondiendo IPC
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
