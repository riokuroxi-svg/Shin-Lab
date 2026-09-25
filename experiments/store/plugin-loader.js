/**
 * Shin-Lab - https://github.com/riokuroxi-svg/Shin-Lab
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// ═══════════════════════════════════════════════════════════════════
//  EXPERIMENTO 06 — Plugin store: instalador con hash + sandbox
//  Un plugin SOLO entra si su SHA-256 coincide con el índice confiable
//  y corre en un contexto vm SIN require, SIN process, SIN red.
//  Límite honesto: vm no es frontera dura contra un atacante dedicado;
//  la defensa real es (1) hash del índice y (2) aprobación del owner.
// ═══════════════════════════════════════════════════════════════════
import { createHash } from "node:crypto";
import vm from "node:vm";

export function sha256(source) {
  return createHash("sha256").update(String(source), "utf8").digest("hex");
}

/**
 * createPluginStore(index)
 * index: { plugins: { [nombre]: { sha256, version, description, author } } }
 */
export function createPluginStore(index) {
  const plugins = (index && index.plugins) || {};
  const installed = new Map();

  /** verify(nombre, source) → ¿el código coincide con el índice? */
  function verify(name, source) {
    const entry = plugins[name];
    if (!entry) return { ok: false, error: "el plugin '" + name + "' no está en el índice" };
    const got = sha256(source);
    if (got !== entry.sha256) {
      return { ok: false, error: "hash alterado", esperado: entry.sha256, recibido: got };
    }
    return { ok: true, entry };
  }

  /** install(nombre, source) → verifica hash y ejecuta en sandbox. */
  function install(name, source, opts) {
    opts = opts || {};
    const v = verify(name, source);
    if (!v.ok) return v;

    const mod = { exports: {} };
    // Whitelist estricta: solo objetos puros e inofensivos.
    // Nada de require, process, fetch, fs ni child_process.
    const ctx = vm.createContext({
      module: mod,
      exports: mod.exports,
      Math, Date, JSON, String, Number, Array, Object, Boolean, RegExp,
      Map, Set, Promise, parseInt, parseFloat, isNaN,
    });

    const script = new vm.Script(source, { filename: name + ".plugin.js" });
    try {
      script.runInContext(ctx, { timeout: opts.loadTimeoutMs ?? 1000 });
    } catch (err) {
      return { ok: false, error: "el plugin no cargó: " + (err.message || err) };
    }

    const plugin = mod.exports;
    if (!plugin || typeof plugin !== "object") {
      return { ok: false, error: "plugin inválido: no exporta nada" };
    }
    if (typeof plugin.name !== "string" || !plugin.name) {
      return { ok: false, error: "plugin inválido: falta 'name'" };
    }
    if (typeof plugin.execute !== "function") {
      return { ok: false, error: "plugin inválido: falta 'execute()'" };
    }
    if (!Array.isArray(plugin.aliases)) plugin.aliases = [];

    installed.set(plugin.name, plugin);
    return { ok: true, plugin };
  }

  /**
   * run(nombre, { args }, api) → ejecuta con timeout. api es lo que el
   * bot real le pasa (sendReply, getSender...). Devuelve { ok, result }.
   */
  async function run(name, input, api) {
    const plugin = installed.get(name);
    if (!plugin) return { ok: false, error: "no instalado" };
    try {
      const out = plugin.execute({ args: (input && input.args) || [], api });
      const result = await Promise.race([
        Promise.resolve(out),
        new Promise((_, rej) => setTimeout(
          () => rej(new Error("plugin excedió 5s de ejecución")), 5000
        )),
      ]);
      return { ok: true, result };
    } catch (err) {
      return { ok: false, error: "error del plugin: " + (err.message || err) };
    }
  }

  function list() {
    return [...installed.values()].map(p => ({
      name: p.name, aliases: p.aliases, description: p.description || "",
    }));
  }

  function find(alias) {
    for (const p of installed.values()) {
      if (p.name === alias || p.aliases.includes(alias)) return p.name;
    }
    return null;
  }

  return { verify, install, run, list, find, installed };
}

export default createPluginStore;
