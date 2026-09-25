/**
 * Shin-Lab - https://github.com/riokuroxi-svg/Shin-Lab
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// ═══════════════════════════════════════════════════════════════════
//  DEMO: bugs REALISTAS que JS deja pasar y TypeScript atrapa.
//  Este archivo NO se ejecuta ni se testea: existe para correr
//  `npx tsc --noEmit seeded-bugs.ts` y mostrar los errores.
//  Son el tipo de errores que hoy solo se descubren en producción.
// ═══════════════════════════════════════════════════════════════════
import { createSendQueue } from "./queue.ts";
import type { Throttler } from "./queue.ts";

const q = createSendQueue(null, null);

// BUG 1 — typo en propiedad: hoy sería undefined silencioso en runtime
// (task.opts.isPrioritiy → siempre false, la prioridad jamás adelanta).
q.enqueue(async () => "x", { isPrioritiy: true });

// BUG 2 — tipo equivocado: "si" es truthy, parece funcionar… hasta que
// un `=== true` lo trata como false.
q.enqueue(async () => "x", { isPriority: "si" });

// BUG 3 — enqueue espera una función que devuelva promesa; pasar una
// función síncrona rompe el `await` interno y el orden de la cola.
q.enqueue(() => 42);

// BUG 4 — implementar mal la interfaz del throttler: falta recordSent.
const malThrottler: Throttler = {
  canSend: () => true,
  calcDelay: () => 10,
};
createSendQueue(malThrottler, null);

// BUG 5 — comparar contra algo que nunca puede ser ese valor.
const n: number = q.length();
if (n === "muchos") console.log("imposible");
