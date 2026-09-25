/**
 * Shin-Lab - https://github.com/riokuroxi-svg/Shin-Lab
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 */
/**
 * Shin-Lab — Tests del Experimento 01 (Shin Brain)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createBrain } from "./shin-brain.js";

test("conversación normal → ALLOW", () => {
  const brain = createBrain();
  const t0 = 1_000_000;
  let r;
  for (let i = 0; i < 3; i++) {
    r = brain.decide({ userId: "u1", text: "mensaje distinto " + i, ts: t0 + i * 5000 });
  }
  assert.equal(r.action, "ALLOW");
  assert.ok(r.score < 30, "score bajo en conversación normal, fue " + r.score);
});

test("ráfaga de 9 mensajes en 2s → BLOCK", () => {
  const brain = createBrain();
  const t0 = 2_000_000;
  let r;
  for (let i = 0; i < 9; i++) {
    r = brain.decide({ userId: "u2", text: "msg " + i, ts: t0 + i * 200 });
  }
  assert.equal(r.action, "BLOCK");
  assert.ok(r.reasons.some(x => x.startsWith("ráfaga")));
});

test("texto repetido 3 veces seguidas → BLOCK", () => {
  const brain = createBrain();
  const t0 = 3_000_000;
  let r;
  for (let i = 0; i < 3; i++) {
    r = brain.decide({ userId: "u3", text: "COMPRA YA MI PRODUCTO", ts: t0 + i * 4000 });
  }
  assert.equal(r.action, "BLOCK");
  assert.ok(r.reasons.some(x => x.includes("repetido")));
});

test("flood de comandos (6 en 10s) → al menos SLOW", () => {
  const brain = createBrain();
  const t0 = 4_000_000;
  let r;
  for (let i = 0; i < 6; i++) {
    r = brain.decide({ userId: "u4", text: ".play cancion " + i, isCommand: true, ts: t0 + i * 1000 });
  }
  assert.ok(r.action === "SLOW" || r.action === "BLOCK", "esperaba SLOW/BLOCK, fue " + r.action);
});

test("usuarios independientes: el spam de uno no afecta a otro", () => {
  const brain = createBrain();
  const t0 = 5_000_000;
  for (let i = 0; i < 9; i++) brain.decide({ userId: "spammer", text: "x", ts: t0 + i * 100 });
  const r = brain.decide({ userId: "inocente", text: "hola", ts: t0 + 1000 });
  assert.equal(r.action, "ALLOW");
});

test("ventana deslizante: el ritmo viejo expira", () => {
  const brain = createBrain();
  const t0 = 6_000_000;
  for (let i = 0; i < 7; i++) brain.decide({ userId: "u6", text: "m" + i, ts: t0 + i * 100 });
  // 30 segundos después, la ventana ya no ve la ráfaga
  const r = brain.decide({ userId: "u6", text: "hola de nuevo", ts: t0 + 30000 });
  assert.equal(r.action, "ALLOW");
});

test("reset limpia el estado", () => {
  const brain = createBrain();
  brain.decide({ userId: "u7", text: "a", ts: 7_000_000 });
  assert.equal(brain.size(), 1);
  brain.reset();
  assert.equal(brain.size(), 0);
});
