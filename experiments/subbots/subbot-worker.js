/**
 * Shin-Lab - https://github.com/riokuroxi-svg/Shin-Lab
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 */
/**
 * Shin-Lab — Worker de sub-bot (proceso hijo).
 * En la migración a Shin-MD este archivo arranca una sesión Baileys
 * con su propia auth (sesión aislada). Aquí es un "bot de juguete"
 * que demuestra el protocolo IPC: start → ready, echo → reply,
 * crash → exit(1), stop → exit(0).
 */
let id = null;

function reply(msg) {
  if (process.connected) {
    try { process.send(msg); } catch { /* padre ya no está */ }
  }
}

process.on("message", (msg) => {
  if (!msg || typeof msg !== "object") return;
  switch (msg.type) {
    case "start":
      id = msg.id;
      reply({ type: "ready", id });
      break;
    case "echo":
      reply({ type: "reply", id, payload: msg.payload });
      break;
    case "crash":
      process.exit(1); // muerte simulada para probar el respawn
      break;
    case "stop":
      process.exit(0); // salida limpia: sin respawn
      break;
    default:
      reply({ type: "unknown", id, payload: msg.type });
  }
});

// Si el main muere, el sub-bot no se queda huérfano: se apaga.
process.on("disconnect", () => process.exit(0));
