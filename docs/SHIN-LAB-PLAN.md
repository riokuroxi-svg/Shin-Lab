# 🗺️ Shin-Lab — Plan del Bloque 6 (desglose)

_Origen: `docs/plan-bloques.md` de Shin-MD, Bloque 6. Nada de esto toca el
bot estable hasta estar probado aquí._

## Restricciones heredadas de Shin-MD

- Repo ligero (<15MB), cero dependencias salvo justificación.
- AGPL-3.0. Sin binarios descargados en runtime.
- Sin modelos grandes en git (nada de ONNX de 151MB — decisión D2).

## E6.1 — Shin Brain heurístico ✅ prototipo
- [x] `experiments/brain/shin-brain.js` — decide ALLOW/SLOW/BLOCK + score.
- [x] 7 tests: conversación normal, ráfaga, repetición, flood de comandos,
      aislamiento por usuario, expiración de ventana, reset.
- [ ] Medición: falsos positivos con un log real de mensajes (el dueño
      exporta un día de chats del bot estable).
- [ ] Criterio de migración: <5% falsos positivos y <1ms por decisión →
      se integra al router de Shin-MD delante del cooldown.

## E6.2 — Memoria RAG sobre SQLite ✅ prototipo
- [x] `experiments/memory/shin-memory.js` — SQLite WAL + FTS5.
- [x] Extracción de hechos por heurística de alta confianza (nombre,
      gustos/disgustos, edad, lugar) — sin LLM, con clases Unicode
      (los acentos del español se procesan bien).
- [x] API: `remember(userId, text)`, `noteCommand`, `recall(userId, {query})`,
      `forget`, `stats`. Refuerzo de peso en vez de duplicar.
- [x] 9 tests pasando, incluyendo benchmark: 10k memorias → recall 0.4ms,
      búsqueda FTS 0.56ms (criterio del plan: <10ms, cumplido x25).
- [ ] Pendiente migración: integrarlo al router de Shin-MD con el comando
      `.memoria` (ver/olvidar) cuando el dueño confirme.

## E6.3 — Sub-bots aislados por proceso
- [ ] `jadibot` con `child_process.fork`: cada sub-bot en su proceso.
- [ ] Protocolo de mensajes main↔sub (JSON por IPC).
- [ ] Si un sub-bot crashea: el main avisa al dueño y lo re-lanza (máx 3).
- [ ] Criterio: matar el sub-bot a mano no afecta al main.

## E6.4 — Migrador global.db JSON → SQLite
- [ ] Script standalone: lee `database.json`/`global.db.json` de
      Gata/Ginko y escribe las tablas users/economy/settings de Shin.
- [ ] Renombra el origen a `.bak` (nunca se vuelve a leer).
- [ ] Criterio: migrar 50MB de JSON en <5s sin perder usuarios.

## E6.5 — Evaluación TypeScript en el core
- [ ] PRUEBA primero: migrar `queue.js` a TS con tsx y medir si el
      beneficio (tipos en la cola) justifica el costo en Termux.
- [ ] Veredicto documentado aquí, se migre o no.

## E6.6 — Plugin store (`.find-skill`)
- [ ] Índice JSON en este repo: nombre, hash SHA256, URL.
- [ ] Instalador: descarga → verifica hash → sandbox vm → registra.
- [ ] Solo cuando E6.3 esté estable.

## Orden y prioridades

```
E6.1 (brain)  →  E6.2 (memoria)  →  E6.3 (sub-bots)
                                        ↓
                              E6.4 · E6.5 · E6.6
```

Cada experimento: tests propios + CI verde + tag `v0.X` + confirmación del
dueño antes de proponer su migración a Shin-MD.
