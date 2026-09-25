/**
 * Shin-Lab - https://github.com/riokuroxi-svg/Shin-Lab
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 */
/**
 * Shin-Lab — Tests del Experimento 06 (Plugin store)
 * Incluye los ataques: código alterado, plugin desconocido,
 * intento de require/process y loop infinito.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPluginStore, sha256 } from "./plugin-loader.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const index = JSON.parse(fs.readFileSync(path.join(DIR, "plugin-index.json"), "utf8"));
const fortuneSrc = fs.readFileSync(path.join(DIR, "plugins", "fortune.js"), "utf8");

test("integridad: el índice coincide con el archivo real del plugin", () => {
  assert.equal(sha256(fortuneSrc), index.plugins.fortuna.sha256);
});

test("plugin legítimo: se instala y se ejecuta", async () => {
  const store = createPluginStore(index);
  const r = store.install("fortuna", fortuneSrc);
  assert.equal(r.ok, true, JSON.stringify(r));
  const out = await store.run("fortuna", { args: [] });
  assert.equal(out.ok, true);
  assert.match(out.result, /^🔮 /);
});

test("código alterado (1 byte): rechazado por hash", () => {
  const store = createPluginStore(index);
  const tampered = fortuneSrc + " ";
  const r = store.install("fortuna", tampered);
  assert.equal(r.ok, false);
  assert.match(r.error, /hash alterado/);
  assert.equal(store.installed.size, 0);
});

test("plugin que no está en el índice: rechazado", () => {
  const store = createPluginStore(index);
  const r = store.install("desconocido", "module.exports = { name: 'x', execute() {} };");
  assert.equal(r.ok, false);
  assert.match(r.error, /no está en el índice/);
});

test("ataque require('child_process'): el sandbox lo bloquea", () => {
  const evil = "const cp = require('child_process'); cp.execSync('touch /tmp/pwned');" +
    "module.exports = { name: 'evil', execute() { return 'mal'; } };";
  const evilIndex = { plugins: { evil: { sha256: sha256(evil), version: "0", description: "", author: "?" } } };
  const store = createPluginStore(evilIndex);
  const r = store.install("evil", evil);
  assert.equal(r.ok, false, "no debió instalarse");
  assert.match(r.error, /require is not defined|no cargó/);
  assert.ok(!fs.existsSync("/tmp/pwned"), "el comando NO debió ejecutarse");
});

test("ataque process.exit(1): el sandbox lo bloquea", () => {
  const evil = "process.exit(1); module.exports = { name: 'evil2', execute() {} };";
  const evilIndex = { plugins: { evil2: { sha256: sha256(evil), version: "0", description: "", author: "?" } } };
  const store = createPluginStore(evilIndex);
  const r = store.install("evil2", evil);
  assert.equal(r.ok, false);
  assert.match(r.error, /process is not defined|no cargó/);
});

test("loop infinito al cargar: muere por timeout, no cuelga nada", () => {
  const loopy = "while (true) {} module.exports = { name: 'loopy', execute() {} };";
  const loopIndex = { plugins: { loopy: { sha256: sha256(loopy), version: "0", description: "", author: "?" } } };
  const store = createPluginStore(loopIndex);
  const t0 = Date.now();
  const r = store.install("loopy", loopy, { loadTimeoutMs: 200 });
  assert.equal(r.ok, false);
  assert.ok(Date.now() - t0 < 5000, "no debió tardar más de 5s, tardó " + (Date.now() - t0) + "ms");
});

test("plugin sin execute(): rechazado aunque pase el hash", () => {
  const bad = "module.exports = { name: 'incompleto' };";
  const badIndex = { plugins: { incompleto: { sha256: sha256(bad), version: "0", description: "", author: "?" } } };
  const store = createPluginStore(badIndex);
  const r = store.install("incompleto", bad);
  assert.equal(r.ok, false);
  assert.match(r.error, /falta 'execute/);
});

test("find() resuelve por nombre y alias", () => {
  const store = createPluginStore(index);
  store.install("fortuna", fortuneSrc);
  assert.equal(store.find("fortuna"), "fortuna");
  assert.equal(store.find("suerte"), "fortuna");
  assert.equal(store.find("noexiste"), null);
});
