/**
 * Shin-Lab - https://github.com/riokuroxi-svg/Shin-Lab
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// ═══════════════════════════════════════════════════════════════════
//  EXPERIMENTO B5 — Shin Agent Pipeline: Brain + Memoria + Tools
//  Flujo unificado:
//  1. Input Guardrails (CAI Anti-Prompt Injection)
//  2. Brain Heurístico (Anti-Spam / Rate-Limiter: ALLOW/SLOW/BLOCK)
//  3. Memoria RAG SQLite (FTS5 contextual recall + auto-remember)
//  4. Intent Classifier (Prefijo o Lenguaje Natural)
//  5. Parameter & Privilege Guardrails + Tool Execution
//  6. Output Guardrail (Anti-Exfiltración de Secretos)
// ═══════════════════════════════════════════════════════════════════

import { createBrain } from "./shin-brain.js";
import { createMemory } from "../memory/shin-memory.js";
import { ToolRegistry, Guardrails } from "../tools/tool-registry.js";

export function createAgentPipeline(opts) {
  opts = opts || {};
  const prefix = opts.prefix || ".";
  const allowNaturalLanguage = opts.allowNaturalLanguage ?? false;

  const brain = opts.brain || createBrain(opts.brainOpts);
  const memory = opts.memory || createMemory(opts.memoryOpts);
  const tools = opts.tools || new ToolRegistry();

  const intentRules = [];

  /**
   * Registra un reconocedor de intención en lenguaje natural.
   * @param {RegExp} pattern
   * @param {string} toolName
   * @param {function} paramExtractor (matches, recalledMemory) => params
   */
  function registerIntent(pattern, toolName, paramExtractor) {
    intentRules.push({
      pattern,
      toolName,
      extract: paramExtractor || ((m) => ({})),
    });
  }

  // ── Reconocedores de intención por defecto ───────────────────────
  registerIntent(/^¿?(?:qué|que)\s+recuerdas\s+de\s+m[ií]\??$/i, "recall_profile", (m, mem) => ({}));
  registerIntent(/^(?:olvida\s+todo|borra\s+mi\s+memoria|derecho\s+al\s+olvido)$/i, "forget_profile", () => ({}));
  registerIntent(/^(?:descarga|pon|baja|escuchar)\s+(?:la\s+canci[oó]n|audio|m[uú]sica)?\s*(.+)$/i, "download_audio", (m) => ({
    query: m[1].trim(),
  }));
  registerIntent(/^(?:calcula|cu[aá]nto\s+es)\s+(\d+)\s*([\+\-\*\/])\s*(\d+)$/i, "calculator", (m) => {
    const opMap = { "+": "add", "-": "sub", "*": "mul", "/": "div" };
    return {
      a: Number(m[1]),
      operation: opMap[m[2]] || "add",
      b: Number(m[3]),
    };
  });

  /**
   * Resuelve el comando o la intención a partir del texto del mensaje.
   */
  function resolveIntent(text, isCommand, userMemories) {
    text = (text || "").trim();

    // 1. Comando explícito por prefijo (ej: .ping, .kick @user)
    if (text.startsWith(prefix)) {
      const clean = text.slice(prefix.length).trim();
      const [cmdName, ...rest] = clean.split(/\s+/);
      const arg = rest.join(" ");
      return {
        type: "COMMAND",
        toolName: cmdName.toLowerCase(),
        params: { query: arg, rawArgs: rest },
      };
    }

    // 2. Lenguaje Natural (si está habilitado)
    if (allowNaturalLanguage) {
      for (const rule of intentRules) {
        const match = text.match(rule.pattern);
        if (match) {
          const params = rule.extract(match, userMemories);
          return {
            type: "NATURAL_LANGUAGE",
            toolName: rule.toolName,
            params,
          };
        }
      }
    }

    return null;
  }

  /**
   * Procesa un mensaje entrante a través de todo el pipeline seguro.
   * @param {object} msg { userId, text, isGroup, roles, ts }
   * @returns {Promise<object>} resultado estructurado con traza completa
   */
  async function processMessage(msg) {
    const userId = msg.userId || "anon@s.whatsapp.net";
    const text = String(msg.text || "").trim();
    const isCommand = text.startsWith(prefix);
    const userCtx = {
      userId,
      roles: Array.isArray(msg.roles) ? msg.roles : [],
      isGroup: !!msg.isGroup,
    };

    // ── PASO 1: CAI Input Guardrail (Anti-Prompt Injection) ────────
    const inputSec = Guardrails.checkPromptInjection(text);
    if (!inputSec.isSafe) {
      return {
        status: "BLOCKED",
        reason: "PROMPT_INJECTION_DETECTED",
        securityReasons: inputSec.reasons,
        response: "⚠️ Solicitud bloqueada por detección de inyección de prompt/adversarial.",
      };
    }

    // ── PASO 2: Brain Anti-Spam Heurístico ─────────────────────────
    const brainDecision = brain.decide({
      userId,
      text,
      isCommand,
      ts: msg.ts,
    });

    if (brainDecision.action === "BLOCK") {
      return {
        status: "BLOCKED",
        reason: "RATE_LIMIT_BLOCK",
        score: brainDecision.score,
        securityReasons: brainDecision.reasons,
        response: "🚫 Mensaje descartado: ritmo excesivo o spam repetitivo.",
      };
    }

    // ── PASO 3: Memoria RAG SQLite (Auto-Remember & Recall) ────────
    const newFacts = memory.remember(userId, text, msg.ts);
    const recalledContext = memory.recall(userId, { query: text });

    // ── PASO 4: Clasificación de Intención / Selección de Tool ────
    const intent = resolveIntent(text, isCommand, recalledContext);
    if (!intent) {
      return {
        status: "IGNORED",
        action: brainDecision.action,
        score: brainDecision.score,
        newMemories: newFacts,
        recalledContext,
      };
    }

    // ── PASO 5: Ejecución de Tool con Parameter & Privilege Guardrails ─
    const toolExec = await tools.execute(intent.toolName, userCtx, intent.params);

    if (toolExec.ok) {
      memory.noteCommand(userId, intent.toolName, msg.ts);
    }

    return {
      status: toolExec.ok ? "EXECUTED" : "ERROR",
      action: brainDecision.action,
      score: brainDecision.score,
      intent,
      newMemories: newFacts,
      recalledContext,
      toolResult: toolExec.ok ? toolExec.result : null,
      error: toolExec.ok ? null : toolExec.error,
      errorCode: toolExec.code || null,
      response: toolExec.ok ? (typeof toolExec.result === "string" ? toolExec.result : JSON.stringify(toolExec.result)) : `⚠️ ${toolExec.error}`,
    };
  }

  return {
    processMessage,
    registerIntent,
    brain,
    memory,
    tools,
  };
}

export default createAgentPipeline;
