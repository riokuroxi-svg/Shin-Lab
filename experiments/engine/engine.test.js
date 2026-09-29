/**
 * Shin-MD / Shin-Lab
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Tests del Bloque B8: Abstracción de Motor IWhatsAppEngine
 */

import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import {
  IWhatsAppEngine,
  normalizeJid,
  isLid,
  normalizeIncomingMessage,
} from "./engine-interface.js";
import { MockEngineAdapter } from "./mock-adapter.js";
import { BaileysEngineAdapter } from "./baileys-adapter.js";
import { HttpBridgeEngineAdapter } from "./bridge-adapter.js";
import { createWhatsAppEngine } from "./engine-factory.js";
import { EventBus } from "../events/event-bus.js";
import { createAgentPipeline } from "../brain/agent-pipeline.js";
import { createMemory } from "../memory/shin-memory.js";

test("IWhatsAppEngine: la clase base abstracta rechaza llamadas no implementadas", async () => {
  const base = new IWhatsAppEngine("unimplemented");
  await assert.rejects(async () => base.connect(), /connect\(\) debe ser implementado/);
  await assert.rejects(async () => base.disconnect(), /disconnect\(\) debe ser implementado/);
  await assert.rejects(async () => base.sendMessage("123@s.whatsapp.net", "hola"), /sendMessage\(\) debe ser implementado/);
  await assert.rejects(async () => base.sendPresenceUpdate("composing"), /sendPresenceUpdate\(\) debe ser implementado/);
});

test("Normalización de JIDs y detección de LIDs", () => {
  // Limpieza de sufijos de dispositivo
  assert.equal(normalizeJid("5215512345678:14@s.whatsapp.net"), "5215512345678@s.whatsapp.net");
  // Añade dominio si solo son dígitos
  assert.equal(normalizeJid("5215512345678"), "5215512345678@s.whatsapp.net");
  // Grupos
  assert.equal(normalizeJid("120363041234567890@g.us"), "120363041234567890@g.us");
  // Detección de LID
  assert.equal(isLid("10023456789@lid"), true);
  assert.equal(isLid("5215512345678@s.whatsapp.net"), false);
  assert.equal(isLid("120363041234567890@g.us"), false);
});

test("MockEngineAdapter: ciclo de vida, envío, recepción y presencia", async () => {
  const engine = new MockEngineAdapter({ simulateLatencyMs: 5 });
  const events = [];

  engine.on("connection.update", (e) => events.push(e));
  engine.on("messages.upsert", (e) => events.push(e));

  // 1. Conectar
  await engine.connect();
  assert.equal(engine.isConnected, true);
  assert.equal(events[0].status, "open");

  // 2. Enviar mensaje
  const receipt = await engine.sendMessage("5215512345678@s.whatsapp.net", "Hola mundo desde Shin Mock");
  assert.equal(receipt.status, "delivered");
  assert.equal(receipt.text, "Hola mundo desde Shin Mock");
  assert.equal(engine.sentMessages.length, 1);

  // 3. Simular presencia
  await engine.sendPresenceUpdate("composing", "5215512345678@s.whatsapp.net");
  assert.equal(engine.presenceUpdates.length, 1);
  assert.equal(engine.presenceUpdates[0].type, "composing");

  // 4. Simular recepción de mensaje entrante
  const incoming = engine.receiveMessage({
    key: { remoteJid: "5215512345678@s.whatsapp.net", id: "msg_abc_123", fromMe: false },
    sender: "5215512345678@s.whatsapp.net",
    message: { conversation: ".ping" },
  });
  assert.equal(incoming.text, ".ping");
  assert.equal(events.length, 2); // open + messages.upsert

  // 5. Desconectar
  await engine.disconnect("test_done");
  assert.equal(engine.isConnected, false);
});

test("BaileysEngineAdapter: adaptación de eventos crudos y normalización de LIDs", async () => {
  // Simulador del socket de Baileys
  const mockBaileysSocket = {
    ev: new EventEmitter(),
    sendMessage: async (jid, content) => ({
      key: { id: "baileys_key_123", remoteJid: jid },
      message: content,
    }),
    sendPresenceUpdate: async () => {},
  };

  const adapter = new BaileysEngineAdapter({ socket: mockBaileysSocket });
  let receivedUpsert = null;

  adapter.on("messages.upsert", (ev) => {
    receivedUpsert = ev;
  });

  await adapter.connect();
  assert.equal(adapter.isConnected, true);

  // Simular evento crudo de Baileys con LID
  mockBaileysSocket.ev.emit("messages.upsert", {
    type: "notify",
    messages: [
      {
        key: {
          remoteJid: "120363041234567890@g.us",
          participant: "9876543210@lid",
          id: "raw_msg_1",
          fromMe: false,
        },
        sender: "5215599887766@s.whatsapp.net",
        message: {
          extendedTextMessage: { text: "Mensaje dentro de grupo con LID anonimizado" },
        },
      },
    ],
  });

  assert.ok(receivedUpsert);
  assert.equal(receivedUpsert.messages.length, 1);
  const msg = receivedUpsert.messages[0];
  assert.equal(msg.text, "Mensaje dentro de grupo con LID anonimizado");
  assert.equal(msg.isGroup, true);

  // Probar mapeo y resolución de LID aprendido
  assert.equal(adapter.resolveIdentity("5215599887766@s.whatsapp.net"), "9876543210@lid");

  // Enviar mensaje a través del adapter
  const sendRes = await adapter.sendMessage("5215599887766@s.whatsapp.net", "Respuesta al usuario");
  assert.equal(sendRes.status, "sent");
  assert.equal(sendRes.jid, "9876543210@lid"); // Resuelto automáticamente al LID de destino
});

test("HttpBridgeEngineAdapter: conexión con microservicio (Whatsmeow / GOWA)", async () => {
  let capturedPost = null;
  const mockFetch = async (url, opts) => {
    capturedPost = { url, opts, body: JSON.parse(opts.body) };
    return {
      json: async () => ({ status: "ok", id: "gowa_msg_999" }),
    };
  };

  const bridge = new HttpBridgeEngineAdapter({
    baseUrl: "http://127.0.0.1:8080",
    apiKey: "secret-token-123",
    fetchFn: mockFetch,
  });

  await bridge.connect();
  assert.equal(bridge.isConnected, true);

  // Enviar mensaje vía bridge HTTP
  const sendRes = await bridge.sendMessage("5215511223344@s.whatsapp.net", "Notificación desde Shin-Core");
  assert.equal(sendRes.status, "delivered");
  assert.ok(capturedPost);
  assert.equal(capturedPost.url, "http://127.0.0.1:8080/send/message");
  assert.equal(capturedPost.body.receiver, "5215511223344@s.whatsapp.net");
  assert.equal(capturedPost.body.message, "Notificación desde Shin-Core");

  // Ingestión de webhook entrante
  let webhookEvent = null;
  bridge.on("messages.upsert", (e) => { webhookEvent = e; });

  bridge.handleWebhook({
    sender: "5215511223344@s.whatsapp.net",
    chat: "5215511223344@s.whatsapp.net",
    text: "Respuesta entrante desde webhook whatsmeow",
  });

  assert.ok(webhookEvent);
  assert.equal(webhookEvent.messages[0].text, "Respuesta entrante desde webhook whatsmeow");
});

test("createWhatsAppEngine: factoría y selección por configuración / env", () => {
  const mockEngine = createWhatsAppEngine({ driver: "mock" });
  assert.equal(mockEngine.driverName, "mock");

  const baileysEngine = createWhatsAppEngine({ driver: "baileys" });
  assert.equal(baileysEngine.driverName, "baileys");

  const bridgeEngine = createWhatsAppEngine({ driver: "whatsmeow" });
  assert.equal(bridgeEngine.driverName, "whatsmeow-bridge");

  assert.throws(() => {
    createWhatsAppEngine({ driver: "unsupported_xyz" });
  }, /Driver desconocido/);
});

test("Integración End-to-End: IWhatsAppEngine -> EventBus (B7) -> Agent Pipeline (B5)", async () => {
  // 1. Instanciar el motor agnóstico
  const engine = new MockEngineAdapter();
  await engine.connect();

  // 2. Instanciar Bus de Eventos y Pipeline de Agentes
  const bus = new EventBus();
  const memory = createMemory({ dbPath: ":memory:" });
  const pipeline = createAgentPipeline({
    memory,
    enableNaturalLanguage: true,
  });

  // Registrar tool/comando en el pipeline
  pipeline.tools.register({
    name: "estado",
    description: "Consulta estado del bot",
    category: "system",
    risk: "low",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
    },
    execute: async (params, ctx) => {
      return `Estado del sistema: OK (Driver: ${engine.driverName})`;
    },
  });

  // 3. Conectar el bus al ciclo de mensajes del motor
  engine.on("messages.upsert", async ({ messages }) => {
    for (const msg of messages) {
      await bus.publish("message:received", msg);
      // El pipeline procesa el mensaje de forma totalmente desacoplada del transporte
      const result = await pipeline.processMessage({
        userId: msg.sender,
        text: msg.text,
        isGroup: msg.isGroup,
        roles: ["user"],
      });
      if (result.status === "EXECUTED" && result.response) {
        const replyText = typeof result.response === "string" ? result.response : result.response.text;
        await engine.sendMessage(msg.chat, replyText);
        await bus.publish("message:replied", { to: msg.chat, reply: replyText });
      }
    }
  });

  // 4. Simular recepción de mensaje
  engine.receiveMessage({
    key: { remoteJid: "5215512345678@s.whatsapp.net", id: "msg_integration_1" },
    sender: "5215512345678@s.whatsapp.net",
    text: ".estado",
  });

  // Dar tick al event loop
  await new Promise((resolve) => setTimeout(resolve, 30));

  // 5. Verificar que se envió la respuesta a través del motor
  assert.equal(engine.sentMessages.length, 1);
  assert.equal(engine.sentMessages[0].jid, "5215512345678@s.whatsapp.net");
  assert.match(engine.sentMessages[0].text, /Estado del sistema: OK \(Driver: mock\)/);

  memory.close();
});
