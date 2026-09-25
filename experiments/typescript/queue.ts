/**
 * Shin-Lab - https://github.com/riokuroxi-svg/Shin-Lab
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// ═══════════════════════════════════════════════════════════════════
//  EXPERIMENTO 05 — Evaluación TypeScript: port tipado de queue.js
//  Puerto fiel (mini) de src/network/queue.js de Shin-MD para medir
//  qué gana el bot con tipos. Corre en Node >=22.18 SIN dependencias
//  (type stripping nativo) — sin tsx, sin tsc en runtime, sin build.
// ═══════════════════════════════════════════════════════════════════

export interface Throttler {
  canSend(): boolean;
  calcDelay(ctx: DelayContext): number;
  recordSent(): void;
}

export interface Health {
  recordSend(): void;
  recordSendFail(err: unknown): void;
}

export interface DelayContext {
  isPriority?: boolean;
  messageLength?: number;
  isNewContact?: boolean;
}

export interface EnqueueOptions {
  isPriority?: boolean;
  messageLength?: number;
  isNewContact?: boolean;
}

export interface QueueOptions {
  timeoutMs?: number;
  /** Espera cuando el warm-up bloquea (60000 en producción; bajo en tests). */
  warmupWaitMs?: number;
}

interface Task {
  fn: () => Promise<unknown>;
  opts: EnqueueOptions;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  ts: number;
}

export interface SendQueue {
  enqueue<T>(fn: () => Promise<T>, opts?: EnqueueOptions): Promise<T>;
  pause(): void;
  resume(): void;
  clear(): void;
  length(): number;
  isPaused(): boolean;
  enterPriority(): void;
  exitPriority(): void;
  inPriority(): boolean;
}

const SEND_TIMEOUT_MS = 120000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      t = setTimeout(() => reject(new Error(label + " superó " + ms + "ms")), ms);
    }),
  ]).finally(() => clearTimeout(t));
}

export function createSendQueue(
  throttler?: Throttler | null,
  health?: Health | null,
  opts: QueueOptions = {}
): SendQueue {
  const timeoutMs = opts.timeoutMs || SEND_TIMEOUT_MS;
  const warmupWaitMs = opts.warmupWaitMs ?? 60000;
  const queue: Task[] = [];
  let processing = false;
  let paused = false;
  let priorityDepth = 0;

  function enterPriority(): void { priorityDepth++; }
  function exitPriority(): void { priorityDepth = Math.max(0, priorityDepth - 1); }
  function inPriority(): boolean { return priorityDepth > 0; }

  function enqueue<T>(fn: () => Promise<T>, enqOpts: EnqueueOptions = {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      queue.push({ fn, opts: enqOpts, resolve: resolve as (v: unknown) => void, reject, ts: Date.now() });
      if (!processing) void processQueue();
    });
  }

  async function processQueue(): Promise<void> {
    if (processing || paused) return;
    processing = true;

    while (queue.length > 0) {
      if (paused) { processing = false; return; }

      let task: Task;
      if (throttler && !throttler.canSend()) {
        const pIdx = queue.findIndex(t => t.opts.isPriority === true);
        if (pIdx === -1) {
          await new Promise(r => setTimeout(r, warmupWaitMs));
          continue;
        }
        task = queue.splice(pIdx, 1)[0] as Task;
      } else {
        task = queue.shift() as Task;
      }

      const delay = throttler
        ? throttler.calcDelay({
            isPriority: task.opts.isPriority || false,
            messageLength: task.opts.messageLength || 0,
            isNewContact: task.opts.isNewContact || false,
          })
        : 500;

      await new Promise(r => setTimeout(r, Math.min(delay, 50))); // lab: tope 50ms para tests rápidos

      try {
        const result = await withTimeout(task.fn(), timeoutMs, "envío");
        throttler?.recordSent();
        health?.recordSend();
        task.resolve(result);
      } catch (err) {
        health?.recordSendFail(err);
        try {
          const retryDelay = throttler
            ? Math.max(2000, throttler.calcDelay({ messageLength: task.opts.messageLength || 0 }))
            : 3000;
          await new Promise(r => setTimeout(r, Math.min(retryDelay, 50)));
          const result2 = await withTimeout(task.fn(), timeoutMs, "reintento");
          throttler?.recordSent();
          task.resolve(result2);
          health?.recordSend();
        } catch (err2) {
          task.reject(err2);
        }
      }
    }
    processing = false;
  }

  function pause(): void { paused = true; }
  function resume(): void { paused = false; if (!processing) void processQueue(); }
  function clear(): void { queue.length = 0; }
  function length(): number { return queue.length; }
  function isPaused(): boolean { return paused; }

  return { enqueue, pause, resume, clear, length, isPaused, enterPriority, exitPriority, inPriority };
}

export default createSendQueue;
