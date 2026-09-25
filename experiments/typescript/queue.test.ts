/**
 * Shin-Lab — Tests del Experimento 05 (cola en TypeScript)
 * Corren con `node --test` directo gracias al type stripping nativo.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSendQueue } from "./queue.ts";
import type { Throttler, Health } from "./queue.ts";

function fakeThrottler(canSend = true): Throttler & { sent: number } {
  return {
    sent: 0,
    canSend: () => canSend,
    calcDelay: () => 1,
    recordSent() { this.sent++; },
  };
}

test("encola y resuelve en orden serial", async () => {
  const q = createSendQueue(null, null);
  const orden: number[] = [];
  const p1 = q.enqueue(async () => { orden.push(1); return "a"; });
  const p2 = q.enqueue(async () => { orden.push(2); return "b"; });
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(r1, "a");
  assert.equal(r2, "b");
  assert.deepEqual(orden, [1, 2]);
});

test("reintenta una vez tras fallo y luego resuelve", async () => {
  const t = fakeThrottler();
  const health: Health & { fails: number } = {
    fails: 0,
    recordSend() {},
    recordSendFail() { this.fails++; },
  };
  const q = createSendQueue(t, health);
  let intentos = 0;
  const r = await q.enqueue(async () => {
    intentos++;
    if (intentos === 1) throw new Error("red caída");
    return "ok-al-segundo";
  });
  assert.equal(r, "ok-al-segundo");
  assert.equal(intentos, 2);
  assert.equal(health.fails, 1);
  assert.equal(t.sent, 1);
});

test("rechaza si falla también el reintento", async () => {
  const q = createSendQueue(null, null);
  await assert.rejects(
    q.enqueue(async () => { throw new Error("siempre falla"); }),
    /siempre falla/
  );
});

test("prioridad: la tarea prioritaria adelanta a las normales", async () => {
  // throttler que bloquea envíos normales → solo pasan los prioritarios
  const t = fakeThrottler(false);
  const q = createSendQueue(t, null, { warmupWaitMs: 20 });
  const orden: string[] = [];
  const pNormal = q.enqueue(async () => { orden.push("normal"); }, {});
  const pPrio = q.enqueue(async () => { orden.push("prio"); }, { isPriority: true });
  // esperamos solo a la prioritaria (la normal queda detrás del warm-up)
  await pPrio;
  assert.deepEqual(orden, ["prio"]);
  q.clear(); // descartamos la normal para no esperar 60s
  q.pause();
});

test("pause/resume: la cola se congela y reanuda", async () => {
  const q = createSendQueue(null, null);
  q.pause();
  let corrio = false;
  const p = q.enqueue(async () => { corrio = true; });
  await new Promise(r => setTimeout(r, 30));
  assert.equal(corrio, false, "en pausa no debe procesar");
  assert.equal(q.isPaused(), true);
  q.resume();
  await p;
  assert.equal(corrio, true);
});

test("ventana de prioridad: enter/exit/inPriority", () => {
  const q = createSendQueue(null, null);
  assert.equal(q.inPriority(), false);
  q.enterPriority();
  q.enterPriority();
  assert.equal(q.inPriority(), true);
  q.exitPriority();
  assert.equal(q.inPriority(), true);
  q.exitPriority();
  assert.equal(q.inPriority(), false);
});
