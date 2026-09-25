/**
 * Shin-Lab - https://github.com/riokuroxi-svg/Shin-Lab
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// ═══════════════════════════════════════════════════════════════════
//  EXPERIMENTO 02 — Shin Memory: memoria RAG sobre SQLite
//  Extrae "hechos" de los mensajes con heurísticas (sin LLM) y los
//  busca con FTS5. Objetivo: que Shin recuerde quién eres y qué te
//  gusta sin costar un peso ni depender de la nube.
//  Criterio del plan: 10k memorias y recall <10ms.
// ═══════════════════════════════════════════════════════════════════
import { DatabaseSync } from "node:sqlite";

// ── Extractores heurísticos ────────────────────────────────────────
// Cada uno: { kind, re(s) → fact|null }. Solo patrones de ALTA
// confianza: preferimos no recordar algo a recordar algo equivocado.
const EXTRACTORS = [
  {
    kind: "name",
    re: (s) => {
      const m = s.match(/\b(?:me llamo|mi nombre es|puedes llamarme|llámame|dime)\s+([a-záéíóúñüA-ZÁÉÍÓÚÑÜ]{2,20})\b/u);
      return m ? cap(m[1]) : null;
    },
  },
  {
    kind: "like",
    re: (s) => {
      const m = s.match(/\bme (?:gustan?|encantan?|fascinan?|am[oa]n?)\s+((?:[\p{L}\p{N}]+[\s,]*){1,8})$/iu);
      return m ? clean(m[1]) : null;
    },
  },
  {
    kind: "dislike",
    re: (s) => {
      const m = s.match(/\b(?:no me gustan?|odi[oa]n?|detesto)\s+((?:[\p{L}\p{N}]+[\s,]*){1,8})$/iu);
      return m ? clean(m[1]) : null;
    },
  },
  {
    kind: "age",
    re: (s) => {
      const m = s.match(/\btengo\s+(\d{1,3})\s*años\b/iu);
      return m && +m[1] > 0 && +m[1] < 120 ? m[1] + " años" : null;
    },
  },
  {
    kind: "location",
    re: (s) => {
      const m = s.match(/\b(?:soy de|vivo en|vivo en la ciudad de)\s+([a-záéíóúñüA-ZÁÉÍÓÚÑÜ]{3,25}(?:\s[a-záéíóúñüA-ZÁÉÍÓÚÑÜ]{3,25}){0,2})\b/u);
      return m ? cap(m[1]) : null;
    },
  },
];

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function clean(s) {
  return s.trim().replace(/[.!?\s]+$/u, "").toLowerCase().slice(0, 80);
}

// ── Memoria ────────────────────────────────────────────────────────
export function createMemory(opts) {
  opts = opts || {};
  const path = opts.path || ":memory:";
  const db = new DatabaseSync(path);

  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS memories (
      id     INTEGER PRIMARY KEY,
      user_id TEXT NOT NULL,
      kind    TEXT NOT NULL,
      fact    TEXT NOT NULL,
      ts      INTEGER NOT NULL,
      weight  REAL NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_mem_user ON memories(user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_mem ON memories(user_id, kind, fact);
  `);

  // FTS5 es opcional: si el SQLite del host no lo tiene, bajamos a LIKE.
  let hasFts = true;
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts
             USING fts5(fact, content='memories', content_rowid='id');`);
  } catch {
    hasFts = false;
  }

  const insMem = db.prepare(
    "INSERT INTO memories (user_id, kind, fact, ts, weight) VALUES (?, ?, ?, ?, 1)"
  );
  const upMem = db.prepare(
    "UPDATE memories SET weight = weight + 1, ts = ? WHERE user_id = ? AND kind = ? AND fact = ?"
  );
  const insFts = hasFts ? db.prepare("INSERT INTO memories_fts (rowid, fact) VALUES (?, ?)") : null;

  /**
   * remember(userId, text, ts?) → extrae hechos del mensaje.
   * Si el hecho ya existía, refuerza su peso en vez de duplicar.
   * @returns {string[]} hechos nuevos recordados esta vez
   */
  function remember(userId, text, ts) {
    const s = String(text ?? "").trim();
    if (!s || !userId) return [];
    const now = ts ?? Date.now();
    const added = [];
    for (const ex of EXTRACTORS) {
      let fact;
      try { fact = ex.re(s); } catch { fact = null; }
      if (!fact) continue;
      const changes = upMem.run(now, String(userId), ex.kind, fact);
      if (changes.changes > 0) continue; // ya lo sabía → refuerza peso
      const r = insMem.run(String(userId), ex.kind, fact, now);
      if (hasFts) insFts.run(Number(r.lastInsertRowid), fact);
      added.push(fact);
    }
    return added;
  }

  /**
   * noteCommand(userId, command, ts?) → refuerza el contador de un
   * comando usado (para saber los favoritos).
   */
  function noteCommand(userId, command, ts) {
    const now = ts ?? Date.now();
    const cmd = String(command ?? "").toLowerCase().slice(0, 30);
    if (!cmd) return;
    const changes = upMem.run(now, String(userId), "command", cmd);
    if (changes.changes === 0) {
      const r = insMem.run(String(userId), "command", cmd, now);
      if (hasFts) insFts.run(Number(r.lastInsertRowid), cmd);
    }
  }

  const KIND_LABEL = {
    name: "Tu nombre", like: "Te gusta", dislike: "No te gusta",
    age: "Tu edad", location: "Eres de", command: "Comando favorito",
  };

  /**
   * recall(userId, opts?) → { text, facts } listo para meter en el
   * contexto del bot. opts: { query?, limit?, includeCommands? }
   * Con query busca por texto (FTS5); sin query trae los hechos más
   * reforzados del usuario.
   */
  function recall(userId, opts) {
    opts = opts || {};
    const limit = Math.min(opts.limit ?? 8, 50);
    let rows;
    if (opts.query && hasFts) {
      rows = db.prepare(`
        SELECT m.user_id, m.kind, m.fact, m.weight
        FROM memories_fts f JOIN memories m ON m.id = f.rowid
        WHERE memories_fts MATCH ? AND m.user_id = ?
        ORDER BY m.weight DESC LIMIT ?
      `).all(sanitizeFts(opts.query), String(userId), limit);
    } else if (opts.query) {
      const pat = "%" + String(opts.query).replace(/[%_]/g, "") + "%";
      rows = db.prepare(`
        SELECT kind, fact, weight FROM memories
        WHERE user_id = ? AND fact LIKE ?
        ORDER BY weight DESC LIMIT ?
      `).all(String(userId), pat, limit);
    } else {
      const kinds = opts.includeCommands
        ? [] : ["AND kind != 'command'"];
      rows = db.prepare(`
        SELECT kind, fact, weight FROM memories
        WHERE user_id = ? ${opts.includeCommands ? "" : "AND kind != 'command'"}
        ORDER BY weight DESC, ts DESC LIMIT ?
      `).all(String(userId), limit);
    }

    const facts = rows.map(r => ({ kind: r.kind, fact: r.fact, weight: r.weight }));
    const lines = facts.map(f => `• ${KIND_LABEL[f.kind] || f.kind}: ${f.fact}`);
    const text = lines.length
      ? "📝 Lo que recuerdo de ti:\n" + lines.join("\n")
      : "🤔 Todavía no recuerdo nada de ti.";
    return { text, facts };
  }

  function sanitizeFts(q) {
    // FTS5 solo acepta tokens simples: limpiamos todo lo especial.
    return String(q).replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).map(t => `"${t}"`).join(" OR ");
  }

  /** forget(userId) → borra TODO lo que sabe de un usuario (derecho al olvido). */
  function forget(userId) {
    if (hasFts) {
      db.prepare("INSERT INTO memories_fts(memories_fts, rowid, fact) SELECT 'delete', id, fact FROM memories WHERE user_id = ?").run(String(userId));
    }
    return db.prepare("DELETE FROM memories WHERE user_id = ?").run(String(userId)).changes;
  }

  function stats(userId) {
    const row = db.prepare(
      "SELECT COUNT(*) AS n, COALESCE(MAX(weight),0) AS w FROM memories WHERE user_id = ?"
    ).get(String(userId));
    return { memories: Number(row.n), maxWeight: Number(row.w) };
  }

  function close() { db.close(); }

  return { remember, noteCommand, recall, forget, stats, close, hasFts };
}

export default createMemory;
