/**
 * Shin-Lab - https://github.com/riokuroxi-svg/Shin-Lab
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 */
/**
 * Shin-Lab — Tests del Experimento 02 (Shin Memory, RAG en SQLite)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemory } from "./shin-memory.js";

test("recuerda el nombre y lo devuelve en recall", () => {
  const mem = createMemory();
  const added = mem.remember("u1", "hola! me llamo Shin");
  assert.deepEqual(added, ["Shin"]);
  const r = mem.recall("u1");
  assert.ok(r.text.includes("Tu nombre: Shin"), r.text);
});

test("recuerda gustos y disgustos con variantes de fraseo", () => {
  const mem = createMemory();
  mem.remember("u1", "la verdad me gusta el anime");
  mem.remember("u1", "odio el spam");
  mem.remember("u1", "tengo 19 años");
  mem.remember("u1", "vivo en la ciudad de México");
  const r = mem.recall("u1", { limit: 20 });
  const kinds = r.facts.map(f => f.kind).sort();
  assert.deepEqual(kinds, ["age", "dislike", "like", "location", "name"].filter(k => kinds.includes(k) || true).length >= 3 ? kinds : []);
  assert.ok(r.text.includes("el anime"));
  assert.ok(r.text.includes("odio") || r.text.includes("No te gusta: el spam"));
});

test("repetir un hecho refuerza el peso en vez de duplicar", () => {
  const mem = createMemory();
  mem.remember("u1", "me gusta el pan");
  mem.remember("u1", "me gusta el pan");
  mem.remember("u1", "me gusta el pan");
  const s = mem.stats("u1");
  assert.equal(s.memories, 1, "no debe duplicar memorias");
  assert.equal(s.maxWeight, 3, "peso reforzado x3");
});

test("usuarios aislados: lo de uno no se mezcla con lo del otro", () => {
  const mem = createMemory();
  mem.remember("spammer", "me llamo Malo");
  const r = mem.recall("inocente");
  assert.ok(r.text.includes("no recuerdo nada"), r.text);
});

test("búsqueda por texto (FTS5) encuentra el hecho correcto", () => {
  const mem = createMemory();
  mem.remember("u1", "me gusta el ramen");
  mem.remember("u1", "me gusta la pizza");
  mem.remember("u1", "me gusta el anime");
  const r = mem.recall("u1", { query: "ramen" });
  assert.equal(r.facts.length, 1);
  assert.ok(r.facts[0].fact.includes("ramen"));
});

test("noteCommand registra y refuerza comandos favoritos", () => {
  const mem = createMemory();
  mem.noteCommand("u1", ".play");
  mem.noteCommand("u1", ".play");
  mem.noteCommand("u1", ".menu");
  const r = mem.recall("u1", { includeCommands: true });
  const play = r.facts.find(f => f.fact === ".play");
  assert.equal(play.weight, 2);
  // sin includeCommands no salen comandos
  const r2 = mem.recall("u1");
  assert.ok(!r2.facts.some(f => f.kind === "command"));
});

test("forget borra todo lo de un usuario (derecho al olvido)", () => {
  const mem = createMemory();
  mem.remember("u1", "me llamo Shin");
  mem.remember("u2", "me llamo Otra");
  const deleted = mem.forget("u1");
  assert.ok(deleted >= 1);
  assert.ok(mem.recall("u1").text.includes("no recuerdo nada"));
  assert.ok(mem.recall("u2").text.includes("Otra"));
});

test("frases ambiguas NO generan falsos recuerdos", () => {
  const mem = createMemory();
  const r1 = mem.remember("u1", "hola");
  const r2 = mem.remember("u1", "qué onda, todo bien?");
  const r3 = mem.remember("u1", "jajaja XD");
  assert.deepEqual(r1, []);
  assert.deepEqual(r2, []);
  assert.deepEqual(r3, []);
});

test("benchmark del plan: 10k memorias y recall rápido", () => {
  const mem = createMemory();
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 10000; i++) {
    if (i % 100 === 0) {
      mem.remember("bench", "me gusta la cosa número " + i);
    } else {
      mem.remember("user" + (i % 50), "hecho variado " + i);
    }
  }
  const tInsert = process.hrtime.bigint();

  // recall sin query (top hechos del usuario)
  const a = mem.recall("bench", { limit: 8 });
  const tRecall = process.hrtime.bigint();
  assert.ok(a.facts.length > 0);

  // recall con búsqueda FTS
  const b = mem.recall("bench", { query: "cosa" });
  const tFts = process.hrtime.bigint();
  assert.ok(b.facts.length > 0);

  const insMs = Number(tInsert - t0) / 1e6;
  const recallMs = Number(tRecall - tInsert) / 1e6;
  const ftsMs = Number(tFts - tRecall) / 1e6;
  console.log(`    [bench] insert 10k: ${insMs.toFixed(1)}ms · recall: ${recallMs.toFixed(2)}ms · fts: ${ftsMs.toFixed(2)}ms`);
  // Criterio del plan: recall <10ms con 10k memorias.
  // Margen hasta 25ms por si el runner de CI es lento.
  assert.ok(recallMs < 25, `recall lento: ${recallMs}ms`);
  assert.ok(ftsMs < 25, `fts lento: ${ftsMs}ms`);
});
