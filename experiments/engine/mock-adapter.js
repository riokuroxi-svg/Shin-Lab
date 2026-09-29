/**
 * Shin-MD / Shin-Lab
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Bloque B8: Adaptador Mock de IWhatsAppEngine
 */

import { IWhatsAppEngine, normalizeIncomingMessage, normalizeJid } from "./engine-interface.js";

export class MockEngineAdapter extends IWhatsAppEngine {
  constructor(options = {}) {
    super("mock");
    this.options = options;
    this.sentMessages = [];
    this.presenceUpdates = [];
    this.simulateLatencyMs = options.simulateLatencyMs || 0;
  }

  async connect(options = {}) {
    if (this.simulateLatencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.simulateLatencyMs));
    }
    this.isConnected = true;
    this.emit("connection.update", {
      status: "open",
      isNewLogin: false,
      user: { id: "5215500000000@s.whatsapp.net", name: "ShinBot (Mock)" },
      timestamp: Date.now(),
    });
  }

  async disconnect(reason = "normal_shutdown") {
    this.isConnected = false;
    this.emit("connection.update", {
      status: "close",
      reason,
      timestamp: Date.now(),
    });
  }

  async sendMessage(jid, content, options = {}) {
    if (!this.isConnected) {
      throw new Error("Cannot send message: MockEngineAdapter is not connected.");
    }
    if (this.simulateLatencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.simulateLatencyMs));
    }

    const normJid = normalizeJid(jid);
    const text = typeof content === "string" ? content : content?.text || content?.caption || "";
    const receipt = {
      id: `mock_msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      jid: normJid,
      text,
      content,
      options,
      status: "delivered",
      timestamp: Date.now(),
    };

    this.sentMessages.push(receipt);
    return receipt;
  }

  async sendPresenceUpdate(type, jid) {
    this.presenceUpdates.push({
      type,
      jid: jid ? normalizeJid(jid) : undefined,
      timestamp: Date.now(),
    });
  }

  /**
   * Helper para simular un mensaje recibido desde la red hacia el bot.
   * @param {object} rawMessage
   */
  receiveMessage(rawMessage) {
    const normalized = normalizeIncomingMessage(rawMessage);
    this.emit("messages.upsert", {
      type: "notify",
      messages: [normalized],
    });
    return normalized;
  }

  /**
   * Limpia las bandejas de mensajes enviados para tests.
   */
  clear() {
    this.sentMessages = [];
    this.presenceUpdates = [];
  }
}
