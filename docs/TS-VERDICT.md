# 📘 E6.5 — Veredicto: ¿TypeScript en Shin-MD?

**Resultado: SÍ VALE LA PENA — pero con migración gradual, no un big-bang.**

## Lo que se midió (Experimento 05, real, no teórico)

| Medición | Resultado |
|---|---|
| Port tipado de `queue.js` (el candidato del plan) | ✅ 6/6 tests pasando |
| Correr `.ts` sin dependencias ni build | ✅ Node ≥22.18 nativo (type stripping) |
| Costo de arranque extra | ~50 ms UNA vez al arrancar (irrelevante en un bot 24/7) |
| Bugs realistas inyectados y atrapados por `tsc --strict` | **5 de 5**, incluyendo el clásico typo `isPrioritiy` que hoy sería un `undefined` silencioso |
| Mezclar `.js` y `.ts` en el mismo repo | ✅ funciona (node --test corre ambos) |

## Datos clave

1. **Node 22.18.0+ ejecuta TypeScript nativo** (type stripping por defecto,
   sin flag, sin tsx, sin compilación, sin dependencias). Shin-MD hoy declara
   `engines >=22.5` → habría que subirlo a `>=22.18`.
   Ref: nodejs/node release v22.18.0 (2025-07-31).
2. **Solo sintaxis "borrable"**: nada de enums, namespaces ni parameter
   properties. Con disciplina (o la flag `erasableSyntaxOnly` de tsc) no es
   problema.
3. **El beneficio real está en las interfaces**: `Throttler`, `Health`,
   `EnqueueOptions`. El bug más caro del bot hoy es un typo en `opts`
   que se vuelve `undefined` silencioso (la prioridad deja de adelantar,
   el warm-up se salta...). Con tipos eso no compila.
4. **El costo real** no es técnico: es subir el piso de Node a 22.18 y que
   los colaboradores futuros sepan TS. tsc solo se usa en CI (verificación),
   nunca en runtime.

## Recomendación para Shin-MD

- ❌ **NO** migrar los ~200 archivos de golpe. Riesgo alto, beneficio cero.
- ✅ **Adopción gradual**: cuando un módulo del core se reescriba por otra
  razón (ej. la integración del brain o la memoria RAG del lab), ese módulo
  nuevo nace en `.ts`. Node corre ambos sin configuración.
- ✅ Empezar por lo que más duele: `src/network/queue.js` +
  `src/core/engine/throttler.js` (interfaces pequeñas, mucho `opts` suelto).
- ✅ CI: añadir `npm run check:types` al workflow cuando exista el primer
  `.ts` en el bot estable.
- ⚠️ Requisito previo: subir `engines` a `>=22.18.0` y avisarlo en el README
  (Termux instala Node reciente por defecto; riesgo bajo pero real).

## Artefactos del experimento

- `experiments/typescript/queue.ts` — port tipado de la cola (fiel al original).
- `experiments/typescript/queue.test.ts` — 6 tests, corren con `node --test` directo.
- `experiments/typescript/seeded-bugs.ts` — 5 bugs inyectados; tsc los atrapa todos.
- `experiments/typescript/tsconfig.json` — verificación estricta (`noEmit`).
