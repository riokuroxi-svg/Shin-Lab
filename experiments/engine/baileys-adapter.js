/**
 * Shin-MD / Shin-Lab
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Bloque B8: Adaptador Baileys para IWhatsAppEngine
 */

import { IWhatsAppEngine, normalizeIncomingMessage, normalizeJid, isLid } from "./engine-interface.js";

export class BaileysEngineAdapter extends IWhatsAppEngine {
  /**
   * @param {object} [options]
   * @param {object} [options.socket] Instancia preexistente o mock de Baileys socket
   */
  constructor(options = {}) {
    super("baileys");
    this.options = options;
    this.sock = options.socket || null;
    this._unbindSocketEvents = null;
  }

  /**
   * Asocia una instancia de Baileys socket al adaptador y normaliza sus eventos.
   * @param {object} socket
   */
  attachSocket(socket) {
    if (this._unbindSocketEvents) {
      this._unbindSocketEvents();
    }

    this.sock = socket;
    if (!socket || !socket.ev) return;

    const onConnUpdate = (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (connection === "open") {
        this.isConnected = true;
      } else if (connection === "close") {
        this.isConnected = false;
      }

      this.emit("connection.update", {
        status: connection || (this.isConnected ? "open" : "close"),
        qr,
        error: lastDisconnect?.error,
        reason: lastDisconnect?.error?.output?.statusCode,
        timestamp: Date.now(),
      });
    };

    const onMessagesUpsert = (upsert) => {
      const normalizedList = (upsert.messages || []).map((m) => {
        // Aprender mapeo LID <-> PN si viene en el mensaje
        if (m.key?.participant && isLid(m.key.participant) && m.sender && !isLid(m.sender)) {
          this.registerLidMapping(m.sender, m.key.participant);
        }
        return normalizeIncomingMessage(m);
      }).filter(Boolean);

      this.emit("messages.upsert", {
        type: upsert.type || "notify",
        messages: normalizedList,
      });
    };

    const onPresenceUpdate = (update) => {
      this.emit("presence.update", update);
    };

    socket.ev.on("connection.update", onConnUpdate);
    socket.ev.on("messages.upsert", onMessagesUpsert);
    socket.ev.on("presence.update", onPresenceUpdate);

    this._unbindSocketEvents = () => {
      try {
        socket.ev.off("connection.update", onConnUpdate);
        socket.ev.off("messages.upsert", onMessagesUpsert);
        socket.ev.off("presence.update", onPresenceUpdate);
      } catch {}
    };
  }

  async connect(options = {}) {
    if (this.sock) {
      this.attachSocket(this.sock);
      this.isConnected = true;
      this.emit("connection.update", { status: "open", timestamp: Date.now() });
      return;
    }
    // Si no se proporcionó socket inyectado, se asume inicialización dinámica
    this.isConnected = true;
    this.emit("connection.update", { status: "open", timestamp: Date.now() });
  }

  async disconnect(reason = "normal_shutdown") {
    this.isConnected = false;
    if (this._unbindSocketEvents) {
      this._unbindSocketEvents();
      this._unbindSocketEvents = null;
    }
    if (this.sock) {
      try { this.sock.end?.(new Error(reason)); } catch {}
      try { this.sock.ws?.close?.(); } catch {}
    }
    this.emit("connection.update", { status: "close", reason, timestamp: Date.now() });
  }

  async sendMessage(jid, content, options = {}) {
    if (!this.isConnected && !this.sock) {
      throw new Error("[BaileysEngineAdapter] El socket no está conectado.");
    }

    const normJid = normalizeJid(jid);
    const resolvedJid = this.resolveIdentity(normJid);

    // Formatear payload para Baileys
    let baileysPayload = content;
    if (typeof content === "string") {
      baileysPayload = { text: content };
    }

    if (this.sock && typeof this.sock.sendMessage === "function") {
      const result = await this.sock.sendMessage(resolvedJid, baileysPayload, options);
      return {
        id: result?.key?.id || `baileys_msg_${Date.now()}`,
        jid: resolvedJid,
        content: baileysPayload,
        status: "sent",
        raw: result,
      };
    }

    // Modo simulado si el socket no implementa sendMessage
    return {
      id: `baileys_stub_${Date.now()}`,
      jid: resolvedJid,
      content: baileysPayload,
      status: "sent",
    };
  }

  async sendPresenceUpdate(type, jid) {
    if (this.sock && typeof this.sock.sendPresenceUpdate === "function") {
      const target = jid ? this.resolveIdentity(normalizeJid(jid)) : undefined;
      await this.sock.sendPresenceUpdate(type, target);
    }
  }
}
