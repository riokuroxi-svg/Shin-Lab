/**
 * Shin-MD / Shin-Lab
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Bloque B8: Abstracción de Motor de WhatsApp (IWhatsAppEngine)
 */

import { EventEmitter } from "node:events";

/**
 * Normaliza un JID de WhatsApp a su formato canónico.
 * Soporta números individuales (@s.whatsapp.net), identificadores de privacidad (@lid) y grupos (@g.us).
 * @param {string} raw
 * @returns {string}
 */
export function normalizeJid(raw) {
  if (!raw) return "";
  let s = String(raw).trim();
  if (!s) return "";
  // Quitar sufijo de dispositivo secundario :12@
  if (/:\d+@/i.test(s)) s = s.replace(/^(.*?):\d+@/, "$1@");
  if (!s.includes("@")) {
    const digits = s.replace(/\D/g, "");
    if (digits) s = `${digits}@s.whatsapp.net`;
  }
  return s.toLowerCase();
}

/**
 * Determina si un JID corresponde a un identificador de privacidad (LID).
 * @param {string} jid
 * @returns {boolean}
 */
export function isLid(jid) {
  return typeof jid === "string" && jid.toLowerCase().endsWith("@lid");
}

/**
 * Normaliza un mensaje entrante de cualquier motor a un formato común agnóstico.
 * @param {object} rawMsg
 * @returns {object} NormalizedMessage
 */
export function normalizeIncomingMessage(rawMsg) {
  if (!rawMsg) return null;
  const key = rawMsg.key || {};
  const remoteJid = normalizeJid(key.remoteJid || rawMsg.chat || rawMsg.jid);
  const isGroup = remoteJid.endsWith("@g.us");
  const sender = normalizeJid(rawMsg.sender || key.participant || (isGroup ? null : remoteJid));
  const id = key.id || rawMsg.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const fromMe = Boolean(key.fromMe || rawMsg.fromMe);

  let text = "";
  if (typeof rawMsg.text === "string") {
    text = rawMsg.text;
  } else if (rawMsg.message) {
    const m = rawMsg.message;
    text = m.conversation ||
      m.extendedTextMessage?.text ||
      m.imageMessage?.caption ||
      m.videoMessage?.caption ||
      m.documentMessage?.caption ||
      "";
  }

  return {
    key: {
      remoteJid,
      id,
      fromMe,
      participant: key.participant ? normalizeJid(key.participant) : undefined,
    },
    sender,
    chat: remoteJid,
    isGroup,
    text,
    message: rawMsg.message || { conversation: text },
    timestamp: Number(rawMsg.messageTimestamp || rawMsg.timestamp || Date.now()),
    raw: rawMsg,
  };
}

/**
 * Clase base abstracta IWhatsAppEngine.
 * Define el contrato que cualquier backend (Baileys, Whatsmeow, Cloud API, Mock) debe cumplir.
 */
export class IWhatsAppEngine extends EventEmitter {
  constructor(driverName = "abstract") {
    super();
    this.driverName = driverName;
    this.isConnected = false;
    this.jidMap = new Map(); // Mapeo bidireccional LID <-> PN
  }

  /**
   * Conecta el motor con la red WhatsApp.
   * @param {object} [options]
   * @returns {Promise<void>}
   */
  async connect(options = {}) {
    throw new Error(`[IWhatsAppEngine] El método connect() debe ser implementado por el driver '${this.driverName}'.`);
  }

  /**
   * Desconecta limpiamente el motor.
   * @param {string} [reason]
   * @returns {Promise<void>}
   */
  async disconnect(reason = "normal_shutdown") {
    throw new Error(`[IWhatsAppEngine] El método disconnect() debe ser implementado por el driver '${this.driverName}'.`);
  }

  /**
   * Envía un mensaje a un destinatario.
   * @param {string} jid
   * @param {string|object} content
   * @param {object} [options]
   * @returns {Promise<object>} Objeto de recibo { id, jid, timestamp, status }
   */
  async sendMessage(jid, content, options = {}) {
    throw new Error(`[IWhatsAppEngine] El método sendMessage() debe ser implementado por el driver '${this.driverName}'.`);
  }

  /**
   * Envía una actualización de presencia (escribiendo, pausado, disponible).
   * @param {'composing'|'paused'|'available'|'unavailable'} type
   * @param {string} [jid]
   * @returns {Promise<void>}
   */
  async sendPresenceUpdate(type, jid) {
    throw new Error(`[IWhatsAppEngine] El método sendPresenceUpdate() debe ser implementado por el driver '${this.driverName}'.`);
  }

  /**
   * Normaliza un JID.
   * @param {string} jid
   * @returns {string}
   */
  normalizeJid(jid) {
    return normalizeJid(jid);
  }

  /**
   * Verifica si es LID.
   * @param {string} jid
   * @returns {boolean}
   */
  isLid(jid) {
    return isLid(jid);
  }

  /**
   * Registra una correspondencia entre un Phone Number JID y un LID JID.
   * @param {string} pnJid
   * @param {string} lidJid
   */
  registerLidMapping(pnJid, lidJid) {
    const pn = normalizeJid(pnJid);
    const lid = normalizeJid(lidJid);
    if (pn && lid) {
      this.jidMap.set(pn, lid);
      this.jidMap.set(lid, pn);
    }
  }

  /**
   * Resuelve el JID real si se tiene el mapeo LID/PN.
   * @param {string} jid
   * @returns {string}
   */
  resolveIdentity(jid) {
    const norm = normalizeJid(jid);
    return this.jidMap.get(norm) || norm;
  }

  /**
   * Devuelve métricas de salud y estado del motor.
   * @returns {object}
   */
  getHealth() {
    return {
      driver: this.driverName,
      connected: this.isConnected,
      mappedIdentities: this.jidMap.size / 2,
      timestamp: Date.now(),
    };
  }
}
