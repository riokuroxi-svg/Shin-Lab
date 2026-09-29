/**
 * Shin-Lab - https://github.com/riokuroxi-svg/Shin-Lab
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 */
/**
 * Shin-Lab — Worker de sub-bot (proceso hijo) con soporte de permisos IPC.
 */
let id = null;
let capabilities = null;

function reply(msg) {
  if (process.connected) {
    try { process.send(msg); } catch {}
  }
}

process.on("message", (msg) => {
  if (!msg || typeof msg !== "object") return;
  switch (msg.type) {
    case "start":
      id = msg.id;
      capabilities = msg.config?.capabilities || null;
      reply({ type: "ready", id, capabilities });
      break;
    case "echo":
      reply({ type: "reply", id, payload: msg.payload });
      break;
    case "request_tool":
      // El worker solicita permiso al manager para ejecutar una acción
      reply({
        type: "request_action",
        id,
        requestId: msg.requestId || "req-1",
        action: {
          type: "tool",
          name: msg.toolName,
          category: msg.category || "general",
          risk: msg.risk || "low",
        },
      });
      break;
    case "request_db_write":
      reply({
        type: "request_action",
        id,
        requestId: msg.requestId || "req-2",
        action: {
          type: "data",
          target: "masterDb",
          action: "write",
        },
      });
      break;
    case "action_granted":
      reply({ type: "action_executed", id, requestId: msg.requestId, status: "SUCCESS" });
      break;
    case "action_rejected":
      reply({ type: "action_blocked", id, requestId: msg.requestId, error: msg.error, code: msg.code });
      break;
    case "crash":
      process.exit(1);
      break;
    case "stop":
      process.exit(0);
      break;
    default:
      reply({ type: "unknown", id, payload: msg.type });
  }
});

process.on("disconnect", () => process.exit(0));
