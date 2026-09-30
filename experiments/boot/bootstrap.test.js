/**
 * Shin-MD / Shin-Lab
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Test de Arranque Integral y Ciclo de Vida de Shin-Lab / Shin-Core
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createBrain } from "../brain/shin-brain.js";
import { createMemory } from "../memory/shin-memory.js";
import { EventBus, createAgentEventCoordinator } from "../events/event-bus.js";
import { ToolRegistry, Guardrails } from "../tools/tool-registry.js";
import { createAgentPipeline } from "../brain/agent-pipeline.js";
import { createWhatsAppEngine } from "../engine/engine-factory.js";
import { createPluginStore } from "../store/plugin-loader.js";

const __DIR = path.dirname(fileURLToPath(import.meta.url));
const storeIndex = JSON.parse(fs.readFileSync(path.join(__DIR, "../store/plugin-index.json"), "utf8"));
const fortuneSrc = fs.readFileSync(path.join(__DIR, "../store/plugins/fortune.js"), "utf8");

test("Arranque Integral de Shin-Lab: Inicialización de Subsistemas, Handshake y Ciclo de Vida", async (t) => {
  const bootLogs = [];
  const logStep = (step, msg) => bootLogs.push(`[${step}] ${msg}`);

  // ── FASE 1: BOOT & SECURITY GUARDRAILS ──────────────────────────
  logStep("PHASE_1_BOOT", "Inicializando entorno seguro y Guardrails CAI...");
  assert.ok(process.versions.node, "Node.js runtime verificado");
  const testInputSec = Guardrails.checkPromptInjection("Hola ShinBot");
  assert.equal(testInputSec.isSafe, true, "Guardrails de entrada operativos");

  // ── FASE 2: MEMORIA RAG SQLITE (WAL + FTS5) ─────────────────────
  logStep("PHASE_2_MEMORY", "Iniciando base de datos SQLite embebida y tabla virtual FTS5...");
  const memory = createMemory({ path: ":memory:" });
  assert.ok(memory, "Instancia de memoria creada");
  // Pre-cargar memoria de prueba
  memory.remember("5215500000000@s.whatsapp.net", "me llamo Rio y me gusta la ciberseguridad");
  const recallTest = memory.recall("5215500000000@s.whatsapp.net");
  assert.ok(recallTest.facts.length >= 2, "Recuerdos persistidos e indexados en SQLite");

  // ── FASE 3: SHIN BRAIN & BUS DE EVENTOS PUB/SUB ─────────────────
  logStep("PHASE_3_BRAIN_EVENTS", "Iniciando Shin Brain heurístico y EventBus reactivo...");
  const brain = createBrain({ windowMs: 10000 });
  const bus = new EventBus({ maxDepth: 32 });
  const coordinator = createAgentEventCoordinator(bus, memory);
  assert.ok(coordinator, "Coordinador de agentes y memoria reactiva vinculado");

  // ── FASE 4: DECLARATIVE TOOLS & PLUGIN SANDBOX ──────────────────
  logStep("PHASE_4_TOOLS", "Registrando herramientas declarativas y cargando plugins...");
  const tools = new ToolRegistry();

  // Registrar tool del sistema
  tools.register({
    name: "ping",
    description: "Comprueba latencia y estado",
    category: "system",
    risk: "low",
    parameters: { type: "object", properties: { query: { type: "string" } } },
    execute: async () => ({ status: "pong", uptime: process.uptime() }),
  });

  // Instalar plugin del store en sandbox seguro
  const store = createPluginStore(storeIndex);
  const pluginInstall = store.install("fortuna", fortuneSrc);
  assert.equal(pluginInstall.ok, true, "Plugin 'fortuna' verificado por SHA-256 e instalado en sandbox");

  // ── FASE 5: AGENT PIPELINE SEGURO (B5) ──────────────────────────
  logStep("PHASE_5_PIPELINE", "Ensamblando Agent Pipeline (Brain + Memoria + Tools + Guardrails)...");
  const pipeline = createAgentPipeline({
    memory,
    tools,
    brain,
    enableNaturalLanguage: true,
  });

  // ── FASE 6: ADAPTADOR DE TRANSPORTE (IWhatsAppEngine) ───────────
  logStep("PHASE_6_ENGINE", "Iniciando motor de transporte IWhatsAppEngine...");
  const engine = createWhatsAppEngine({ driver: "mock" });
  let connectionOpened = false;

  engine.on("connection.update", (ev) => {
    if (ev.status === "open") connectionOpened = true;
  });

  await engine.connect();
  assert.equal(connectionOpened, true, "Transporte conectado en estado OPEN");
  assert.equal(engine.isConnected, true);

  // ── FASE 7: CICLO DE MENSAJERÍA EN VIVO ─────────────────────────
  logStep("PHASE_7_MESSAGE_CYCLE", "Ejecutando ciclo de mensaje en vivo...");
  const testUser = "5215500000000@s.whatsapp.net";

  // 1. Ingestión de mensaje a través del motor
  const incomingMsg = engine.receiveMessage({
    key: { remoteJid: testUser, id: "msg_boot_1" },
    sender: testUser,
    text: ".ping",
  });

  // 2. Procesamiento a través del pipeline seguro
  const pipelineResult = await pipeline.processMessage({
    userId: incomingMsg.sender,
    text: incomingMsg.text,
    isGroup: false,
    roles: ["user"],
  });

  assert.equal(pipelineResult.status, "EXECUTED", "Pipeline procesó y ejecutó el comando");
  assert.ok(pipelineResult.toolResult, "Resultado obtenido de la herramienta");

  // 3. Despacho de respuesta normalizada a través del motor
  const receipt = await engine.sendMessage(incomingMsg.chat, `¡Pong! Sistema activo. Memoria RAG: OK`);
  assert.equal(receipt.status, "delivered");
  assert.equal(engine.sentMessages.length, 1);

  // ── FASE 8: APAGADO LIMPIO (CLEAN SHUTDOWN) ─────────────────────
  logStep("PHASE_8_SHUTDOWN", "Ejecutando apagado limpio y cierre de descriptores...");
  await engine.disconnect("test_completed");
  assert.equal(engine.isConnected, false, "Motor desconectado");
  memory.close();
  bus.clear();

  logStep("PHASE_9_COMPLETE", "Shin-Lab completó el arranque integral sin errores.");
  assert.equal(bootLogs.length, 9, "Todas las 9 fases de arranque completadas con éxito");
});
