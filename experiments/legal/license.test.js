/**
 * Shin-Lab - https://github.com/riokuroxi-svg/Shin-Lab
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// Guardia legal: TODO código del laboratorio debe llevar su header SPDX.
// Si alguien (o algo) mete un archivo sin licencia, la suite falla en CI.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Este test vive en experiments/legal/ → la raíz del repo está 2 niveles arriba.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(js|ts)$/.test(e.name)) yield p;
  }
}

test("todos los archivos de código llevan header SPDX (AGPL)", () => {
  const sinHeader = [];
  for (const f of walk(path.join(ROOT, "experiments"))) {
    const src = fs.readFileSync(f, "utf8").slice(0, 600);
    if (!src.includes("SPDX-License-Identifier: AGPL-3.0-only")) {
      sinHeader.push(path.relative(ROOT, f));
    }
  }
  assert.deepEqual(sinHeader, [], "archivos sin header SPDX: " + sinHeader.join(", "));
});

test("LICENSE y NOTICE existen en la raíz (cláusulas Sección 7)", () => {
  assert.ok(fs.existsSync(path.join(ROOT, "LICENSE")), "falta LICENSE");
  const notice = fs.readFileSync(path.join(ROOT, "NOTICE"), "utf8");
  assert.match(notice, /Atribución obligatoria/);
  assert.match(notice, /Sección 7/);
});
