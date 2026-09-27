# Anotación de visión — Shin como framework de agentes

> 📌 **Estado:** anotación de visión (sin código, sin fechas comprometidas).
> Registrada el 2026-09-27 a petición del autor. No es un plan de trabajo activo.

## La observación

Si se invierte el flujo de un bot MD, la arquitectura de Shin ya contiene la mayor
parte de un runtime de agentes:

- Flujo hoy: *usuario escribe un comando → un plugin responde.*
- Flujo invertido: *un agente (IA) decide qué herramienta invocar → el bot son sus
  manos y ojos → WhatsApp es solo un canal de entrada/salida más.*

## Mapeo: lo que ya existe

| Componente de Shin | Como bot MD | Como framework de agentes |
|---|---|---|
| Router con aliases | despachador de comandos | registro de herramientas |
| Plugin store (API frontera) | plugins que solo tocan la API | contrato de capacidades (estilo MCP) |
| Sub-bot manager + respawn | corre varios bots | orquestador multi-agente |
| Cola serial con prioridad | evita mensajes cruzados | árbitro de acciones (un agente a la vez) |
| Motor anti-ban (jitter, warm-up, watchdog) | protege el número | rate-limit / seguridad contra el entorno |
| SQLite WAL | estado del bot | memoria persistente del agente |
| Panel web (auth + lockout) | administración | plano de control |
| Modelo de licencia en 3 capas | protección comercial | capa de gobernanza de capacidades |
| Suite de tests + CI | calidad del código | harness de evaluación del agente |

## Lo que faltaría para llamarlo framework

1. **Esquema de herramientas declarativo:** que cada plugin declare nombre,
   parámetros y tipos en formato legible por un LLM, para que el agente decida solo.
2. **Bus de eventos entre agentes:** pub/sub real, no solo despacho de comandos.
3. **Permisos y aislamiento por agente:** el sub-bot manager ya separa procesos;
   falta encerrar cada agente en una celda de capacidades.
4. **Memoria conversacional:** hoy hay estado (SQLite), no memoria semántica.

## Notas de dificultad

Construir un framework de agentes es más difícil que un bot MD: multiplica las
superficies de fallo (seguridad, concurrencia multi-agente, costos de inferencia,
evaluación de comportamiento). Cuando se retome la idea, la ruta sensata es:
prototipo mínimo sobre la frontera del plugin store, sin tocar el núcleo.
