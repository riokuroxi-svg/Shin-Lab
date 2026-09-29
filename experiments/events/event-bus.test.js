/**
 * Shin-Lab - https://github.com/riokuroxi-svg/Shin-Lab
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventBus, createAgentEventCoordinator } from "./event-bus.js";
import { createMemory } from "../memory/shin-memory.js";

test("EventBus: suscripción y emisión de tópicos exactos", async () => {
  const bus = new EventBus();
  const received = [];

  bus.on("bot:ready", (payload, meta) => {
    received.push({ payload, topic: meta.topic });
  });

  const res = await bus.emit("bot:ready", { botName: "Shin-MD", version: "3.0.3" });
  assert.equal(res.delivered, 1);
  assert.equal(res.errors.length, 0);
  assert.equal(received.length, 1);
  assert.equal(received[0].payload.botName, "Shin-MD");
  assert.equal(received[0].topic, "bot:ready");
});

test("EventBus: soporte de comodines / wildcards (* y #)", async () => {
  const bus = new EventBus();
  const logs = [];

  // Escuchar cualquier evento bajo "user:*"
  bus.on("user:*", (payload, meta) => {
    logs.push(`user-single: ${meta.topic} - ${payload.action}`);
  });

  // Escuchar con wildcard multi-nivel "#"
  bus.on("system:#", (payload, meta) => {
    logs.push(`system-multi: ${meta.topic}`);
  });

  await bus.emit("user:login", { action: "logged_in" });
  await bus.emit("user:logout", { action: "logged_out" });
  await bus.emit("system:core:memory:checkpoint", { ok: true });
  await bus.emit("other:event", { ok: true }); // No debe coincidir

  assert.equal(logs.length, 3);
  assert.ok(logs.includes("user-single: user:login - logged_in"));
  assert.ok(logs.includes("user-single: user:logout - logged_out"));
  assert.ok(logs.includes("system-multi: system:core:memory:checkpoint"));
});

test("EventBus: ordenamiento por prioridad de ejecutores", async () => {
  const bus = new EventBus();
  const order = [];

  bus.on("task:run", () => { order.push("low-priority"); }, { priority: 10 });
  bus.on("task:run", () => { order.push("high-priority"); }, { priority: 100 });
  bus.on("task:run", () => { order.push("medium-priority"); }, { priority: 50 });

  await bus.emit("task:run", {});
  assert.deepEqual(order, ["high-priority", "medium-priority", "low-priority"]);
});

test("EventBus: aislamiento de fallos (un handler que falla no rompe el bus)", async () => {
  const bus = new EventBus();
  const successful = [];

  bus.on("event:test", () => {
    throw new Error("Fallo catastrófico en plugin externo");
  });

  bus.on("event:test", () => {
    successful.push("handler-seguro-ejecutado");
  });

  const res = await bus.emit("event:test", { data: 123 });
  assert.equal(res.delivered, 1);
  assert.equal(res.errors.length, 1);
  assert.ok(res.errors[0].error.includes("Fallo catastrófico"));
  assert.equal(successful.length, 1);
  assert.equal(successful[0], "handler-seguro-ejecutado");
});

test("EventBus: suscripción 'once' y desuscripción 'off'", async () => {
  const bus = new EventBus();
  let count = 0;

  const unsubscribe = bus.on("ping", () => { count++; });
  await bus.emit("ping", {});
  assert.equal(count, 1);

  // Desuscribir
  unsubscribe();
  await bus.emit("ping", {});
  assert.equal(count, 1, "no debe recibir eventos tras desuscribirse");

  // Probar 'once'
  let onceCount = 0;
  bus.once("single", () => { onceCount++; });
  await bus.emit("single", {});
  await bus.emit("single", {});
  assert.equal(onceCount, 1, "el handler 'once' solo debe dispararse 1 vez");
});

test("B7 Coordinador Reactivo: Agente Economía dispara actualización en Memoria RAG SQLite", async () => {
  const memory = createMemory();
  const coordinator = createAgentEventCoordinator({ memory });
  const userId = "trader_521234@s.whatsapp.net";

  // Simular evento emitido por módulo de economía
  await coordinator.eventBus.emit("economy:transaction", {
    userId,
    type: "compra",
    amount: 5000,
    description: "espadas legendarias",
  });

  // Verificar que la memoria SQLite capturó el hecho
  const recall = memory.recall(userId);
  assert.ok(recall.facts.some(f => f.kind === "like" && f.fact.includes("espadas legendarias")));

  // Simular alerta de seguridad
  await coordinator.eventBus.emit("security:guardrail_block", {
    userId,
    threat: "prompt_injection_attempt",
  });

  const secLogs = coordinator.getSecurityLogs();
  assert.equal(secLogs.length, 1);
  assert.equal(secLogs[0].topic, "security:guardrail_block");
  assert.equal(secLogs[0].data.threat, "prompt_injection_attempt");

  memory.close();
});
