/**
 * Shin-MD / Shin-Lab
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Bloque B8: Factoría de Motores IWhatsAppEngine
 */

import { MockEngineAdapter } from "./mock-adapter.js";
import { BaileysEngineAdapter } from "./baileys-adapter.js";
import { HttpBridgeEngineAdapter } from "./bridge-adapter.js";

/**
 * Crea e inicializa una instancia de motor según el driver solicitado.
 * @param {object} [config]
 * @param {'mock'|'baileys'|'whatsmeow'|'bridge'} [config.driver]
 * @returns {import('./engine-interface.js').IWhatsAppEngine}
 */
export function createWhatsAppEngine(config = {}) {
  const driver = (config.driver || process.env.WHATSAPP_ENGINE || "mock").toLowerCase();

  switch (driver) {
    case "mock":
      return new MockEngineAdapter(config);

    case "baileys":
      return new BaileysEngineAdapter(config);

    case "whatsmeow":
    case "bridge":
    case "gowa":
      return new HttpBridgeEngineAdapter(config);

    default:
      throw new Error(`[createWhatsAppEngine] Driver desconocido: '${driver}'. Opciones válidas: 'mock', 'baileys', 'whatsmeow'.`);
  }
}
