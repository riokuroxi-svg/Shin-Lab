/**
 * Shin-Lab - https://github.com/riokuroxi-svg/Shin-Lab
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// ═══════════════════════════════════════════════════════════════════
//  EXPERIMENTO 07 — Shin Declarative Tools & CAI Adversarial Guardrails
//  Convierte comandos en Tools declarativas para Agentes con:
//   1. Input Guardrails: Detección anti prompt-injection (CAI).
//   2. Parameter Guardrails: Esquema estricto + anti command-injection.
//   3. Privilege Guardrails: Barrera dura de roles (RBAC).
//   4. Output Guardrails: Filtro de exfiltración de secretos (.env/tokens).
// ═══════════════════════════════════════════════════════════════════

// ── 1. CAI Adversarial Detection Patterns ─────────────────────────
const PROMPT_INJECTION_PATTERNS = [
  /\b(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions|rules|prompts|system)\b/i,
  /\b(?:system\s+override|mode\s+override|developer\s+mode|dan\s+mode|jailbreak)\b/i,
  /\b(?:you\s+are\s+now|act\s+as)\s+(?:an?\s+unconstrained|unfiltered|evil|root|admin\s+bot)\b/i,
  /\b(?:bypass\s+security|reveal\s+(?:all\s+)?(?:secrets|tokens|env|keys|passwords))\b/i,
  /\b(?:sudo\s+execute|system_prompt_override)\b/i,
];

const SHELL_INJECTION_PATTERNS = [
  /[;&|`$<>]/,
  /\b(?:cat|rm|mv|cp|curl|wget|bash|sh|exec|eval|node|python|perl)\s+/i,
  /\.\.\/|\.\.\\/, // Path traversal
];

const SECRET_PATTERNS = [
  /ghp_[a-zA-Z0-9]{36,}/,
  /sk-[a-zA-Z0-9]{20,}/,
  /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/,
  /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/, // JWT
  /(?:password|secret|apikey|api_key)\s*[:=]\s*["']?[^\s"']{8,}["']?/i,
];

// ── 2. Guardrails Engine ──────────────────────────────────────────
export class Guardrails {
  /**
   * Normaliza texto eliminando caracteres invisibles y homóglifos comunes.
   */
  static normalizeText(str) {
    if (typeof str !== "string") return "";
    // Eliminar caracteres invisibles/zero-width
    let clean = str.replace(/[\u200B-\u200D\uFEFF]/g, "");
    // Normalizar unicode a forma canónica (NFKC)
    return clean.normalize("NFKC").trim();
  }

  /**
   * Analiza si una entrada contiene inyección de prompt directa u ofuscada.
   */
  static checkPromptInjection(input) {
    const text = this.normalizeText(String(input || ""));
    const reasons = [];

    // Verificación directa por regex
    for (const pat of PROMPT_INJECTION_PATTERNS) {
      if (pat.test(text)) {
        reasons.push("Patrón de inyección de prompt detectado: " + pat.source);
      }
    }

    // Detección de payloads ofuscados en Base64
    const b64Matches = text.match(/\b[A-Za-z0-9+/]{20,}={0,2}\b/g) || [];
    for (const b64 of b64Matches) {
      try {
        const decoded = Buffer.from(b64, "base64").toString("utf8");
        for (const pat of PROMPT_INJECTION_PATTERNS) {
          if (pat.test(decoded)) {
            reasons.push("Inyección de prompt oculta en Base64");
            break;
          }
        }
      } catch {}
    }

    return {
      isSafe: reasons.length === 0,
      reasons,
    };
  }

  /**
   * Valida y sanitiza parámetros de herramientas contra Command Injection (CVE-2025-67511).
   */
  static validateParamSecurity(value, paramName, schema) {
    if (value == null) return { isSafe: true };
    const strVal = String(value);

    // Si el esquema exige un formato seguro específico (alfanumérico, JID, etc.)
    if (schema?.pattern) {
      const re = new RegExp(schema.pattern);
      if (!re.test(strVal)) {
        return { isSafe: false, reason: `Parámetro '${paramName}' no coincide con el patrón requerido: ${schema.pattern}` };
      }
    }

    // Comprobación de Command/Path Injection si no está explícitamente permitido
    if (!schema?.allowShellMetas) {
      for (const pat of SHELL_INJECTION_PATTERNS) {
        if (pat.test(strVal)) {
          return { isSafe: false, reason: `Carácter o comando sospechoso detectado en '${paramName}': intento de inyección de comandos/traversal` };
        }
      }
    }

    return { isSafe: true };
  }

  /**
   * Sanitiza la salida antes de responder para evitar exfiltración de credenciales.
   */
  static sanitizeOutput(output) {
    if (output == null) return output;
    let text = typeof output === "string" ? output : JSON.stringify(output);
    for (const pat of SECRET_PATTERNS) {
      text = text.replace(pat, "[REDACTED_SECRET]");
    }
    return typeof output === "string" ? text : JSON.parse(text);
  }
}

// ── 3. Tool Registry ──────────────────────────────────────────────
export class ToolRegistry {
  constructor() {
    this.tools = new Map();
  }

  /**
   * Registra una herramienta declarativa.
   * @param {object} toolDef
   */
  register(toolDef) {
    if (!toolDef || typeof toolDef !== "object") {
      throw new Error("Definición de Tool inválida.");
    }
    if (!toolDef.name || typeof toolDef.name !== "string") {
      throw new Error("La Tool debe tener un 'name' válido.");
    }
    if (typeof toolDef.execute !== "function") {
      throw new Error(`Tool '${toolDef.name}' debe implementar una función 'execute'.`);
    }

    const tool = {
      name: toolDef.name.toLowerCase().trim(),
      description: toolDef.description || "",
      category: toolDef.category || "general",
      risk: toolDef.risk || "low", // low | medium | high | critical
      requires: Array.isArray(toolDef.requires) ? toolDef.requires : [],
      parameters: toolDef.parameters || { type: "object", properties: {}, required: [] },
      execute: toolDef.execute,
    };

    this.tools.set(tool.name, tool);
    return tool;
  }

  get(name) {
    return this.tools.get(String(name).toLowerCase().trim()) || null;
  }

  list() {
    return Array.from(this.tools.values());
  }

  /**
   * Exporta la lista de herramientas al formato estándar JSON Schema de Function Calling.
   */
  exportAgentSchemas() {
    return this.list().map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  /**
   * Valida los parámetros pasados contra el esquema JSON Schema de la Tool.
   */
  validateParameters(tool, rawParams) {
    const params = rawParams || {};
    const schema = tool.parameters || {};
    const props = schema.properties || {};
    const required = schema.required || [];

    // 1. Validar campos requeridos
    for (const reqKey of required) {
      if (params[reqKey] === undefined || params[reqKey] === null || params[reqKey] === "") {
        return { valid: false, error: `Falta el parámetro requerido: '${reqKey}'` };
      }
    }

    // 2. Validar tipos y aplicar Guardrails de seguridad por parámetro
    for (const [key, val] of Object.entries(params)) {
      const propSchema = props[key];
      if (!propSchema) continue; // ignorar propiedades no declaradas o permitir modo estricto

      // Verificación de tipo
      if (propSchema.type) {
        const actualType = Array.isArray(val) ? "array" : typeof val;
        if (actualType !== propSchema.type) {
          return { valid: false, error: `Tipo inválido para '${key}': esperado ${propSchema.type}, recibido ${actualType}` };
        }
      }

      // Verificación de Enum
      if (Array.isArray(propSchema.enum) && !propSchema.enum.includes(val)) {
        return { valid: false, error: `Valor inválido para '${key}': debe ser uno de [${propSchema.enum.join(", ")}]` };
      }

      // Verificación de Guardrails de Inyección en parámetros string
      if (typeof val === "string") {
        const secCheck = Guardrails.validateParamSecurity(val, key, propSchema);
        if (!secCheck.isSafe) {
          return { valid: false, error: secCheck.reason, securityViolation: true };
        }
      }
    }

    return { valid: true, sanitizedParams: params };
  }

  /**
   * Ejecuta una herramienta garantizando todas las defensas y permisos.
   * @param {string} toolName
   * @param {object} userCtx { userId, roles: ['admin', 'owner'], isGroup }
   * @param {object} rawParams
   */
  async execute(toolName, userCtx, rawParams) {
    const tool = this.get(toolName);
    if (!tool) {
      return { ok: false, error: `Tool no encontrada: '${toolName}'` };
    }

    userCtx = userCtx || { userId: "?", roles: [] };
    const userRoles = new Set(userCtx.roles || []);

    // ── Guardrail 1: Verificación de Roles y Privilegios ───────────
    for (const requiredRole of tool.requires) {
      if (!userRoles.has(requiredRole)) {
        return {
          ok: false,
          error: `Acceso denegado: la tool '${tool.name}' requiere el rol '${requiredRole}'.`,
          code: "ERR_PERMISSION_DENIED",
        };
      }
    }

    // ── Guardrail 2: Validación de Parámetros y Anti-Injection ─────
    const validation = this.validateParameters(tool, rawParams);
    if (!validation.valid) {
      return {
        ok: false,
        error: validation.error,
        code: validation.securityViolation ? "ERR_SECURITY_VIOLATION" : "ERR_INVALID_PARAMS",
      };
    }

    // ── Guardrail 3: Ejecución Aislada con Timeout ──────────────────
    try {
      const result = await Promise.race([
        tool.execute(userCtx, validation.sanitizedParams),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout al ejecutar Tool (5000ms)")), 5000)),
      ]);

      // ── Guardrail 4: Sanitización de Salida (Anti-Exfiltración) ───
      const safeOutput = Guardrails.sanitizeOutput(result);
      return { ok: true, result: safeOutput };
    } catch (err) {
      return {
        ok: false,
        error: `Fallo en la ejecución de '${tool.name}': ${err.message || err}`,
        code: "ERR_EXECUTION_FAILURE",
      };
    }
  }
}

export default { Guardrails, ToolRegistry };
