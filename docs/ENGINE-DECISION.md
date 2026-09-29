# Shin-MD / Shin-Core — Documento de Decisión Técnica: Abstracción de Motor IWhatsAppEngine (Bloque B8)
**Fecha:** 2026-09-29  
**Autor:** riokuroxi-svg  
**Estado:** APROBADO PARA EXPERIMENTACIÓN EN SHIN-LAB  
**Licencia:** AGPL-3.0-only  

---

## 1. Contexto y Justificación

Históricamente, los bots de WhatsApp en el ecosistema Node.js (GataBot, Ginko, Venom, Baileys bots) se construyeron acoplados monolíticamente a una única biblioteca de transporte (`whiskeysockets/baileys` o `whatsapp-web.js`). Cuando WhatsApp actualiza su protocolo o introduce cambios de seguridad en el protocolo Noise/E2EE, todo el bot colapsa si la biblioteca dependiente no se actualiza o queda abandonada.

Durante 2025 y 2026, el ecosistema de librerías de WhatsApp experimentó cambios sísmicos:
1. **La crisis de `companion_reg_refresh` (Julio 2026):** WhatsApp introdujo notificaciones `<notification type="companion_reg_refresh">` tras escanear el código QR. Si el cliente no rota adecuadamente la clave `advSecretKey` con un handshake de sincronización, la sesión cae en bucle infinito de *"Couldn't link device"*.
2. **Introducción masiva de LIDs (LID Privacy Rollout):** WhatsApp anonimiza números telefónicos en grupos y mensajes mediante identificadores de privacidad `@lid`. Las librerías obsoletas fallan al enviar mensajes a receptores `@lid` o confunden administradores.
3. **Ataques a la cadena de suministro de npm:** Múltiples paquetes npm fraudulentos (e.g. `lotusbail`, `@skyzopedia/baileys-mod`, `baileys-fix`) fueron publicados conteniendo código malicioso para robar credenciales de sesión y vincular dispositivos invisibles espía.

Para garantizar la supervivencia a largo plazo de Shin sin depender de los vaivenes de un único repositorio ni arriesgar la cadena de suministro, se implementa el patrón **IWhatsAppEngine**: una capa de abstracción desacoplada que separa la lógica de negocio (agentes, comandos, economía, seguridad) del motor de transporte.

---

## 2. Auditoría Comparativa de Motores (2026)

| Motor / Familia | Arquitectura | Consumo RAM | Manejo LID | Resistencia Anti-Ban | Estado Mantenimiento | Veredicto para Shin |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **WhiskeySockets/Baileys** (Oficial) | WebSocket directo / Protobuf (Node.js) | ~40–80 MB | Parcial / Requiere parches manuales | Media (con throttler y jitter gaussiano) | ⚠️ Lento; PRs críticos pendientes (`#2765`) | **Legacy/Transición** (requiere parches propios) |
| **chaeulso/baileys & luferos forks** | Baileys con parches `companion_reg_refresh` + interactiveMessage | ~40–80 MB | Completo (`mapLidToPn`) | Alta (con políticas Shin-MD) | Activo por la comunidad | **Recomendado para Node.js MD puro** |
| **tulir/whatsmeow (Go)** / GOWA REST | Binario nativo Go / Protocolo directo | **~15–25 MB** (10x menor) | Nativo y transparente | Muy Alta (gestión de tokens atómica) | ⭐ Muy Activo (tulir/mautrix) | **Motor Estratégico a Futuro** (Microservicio Bridge) |
| **wwebjs / Puppeteer (WebJS)** | Chromium Headless inyectado | **300–600 MB** | Deficiente | ❌ Pésima (bloqueado por Code Verify & Play Integrity) | Decreciente | ⛔ **DESCARTADO** (Incompatible con VPS/Termux) |
| **Meta WhatsApp Cloud API (Graph v26.0+)** | HTTP REST oficial de Meta | ~5–10 MB | Gestionado por Meta | 100% Inmune a bans | Oficial Meta | **Tier Empresarial / Clientes de Pago** |

---

## 3. Especificación del Contrato `IWhatsAppEngine`

Cualquier adaptador de motor en Shin debe implementar la interfaz unificada:

```typescript
interface IWhatsAppEngine {
  readonly driverName: string;
  readonly isConnected: boolean;

  // Ciclo de vida
  connect(options?: ConnectOptions): Promise<void>;
  disconnect(reason?: string): Promise<void>;

  // Mensajería agnóstica
  sendMessage(jid: string, content: NormalizedMessageContent, options?: SendOptions): Promise<SentMessageReceipt>;
  sendPresenceUpdate(type: 'composing' | 'paused' | 'available' | 'unavailable', jid?: string): Promise<void>;

  // Identidad y Normalización
  normalizeJid(jid: string): string;
  isLid(jid: string): boolean;
  resolveIdentity(jidOrLid: string): Promise<string>;

  // Eventos Normalizados
  on(event: 'connection.update' | 'messages.upsert' | 'presence.update' | 'error', handler: Function): () => void;
  emit(event: string, payload: any): void;

  // Diagnóstico
  getHealth(): EngineHealthStatus;
}
```

---

## 4. Estrategia de Migración y Despliegue

1. **Fase 1 (Shin-Lab Spike):**
   - Construir interfaz base `IWhatsAppEngine`, adaptador simulado `MockEngineAdapter`, adaptador `BaileysEngineAdapter` y adaptador de puente HTTP/RPC `HttpBridgeEngineAdapter` (compatible con Whatsmeow/GOWA).
   - Validar con tests unitarios que cualquier adaptador se conecta fluidamente con el `AgentPipeline` (B5) y el `EventBus` (B7).

2. **Fase 2 (Shin-MD Estabilización):**
   - Incorporar `IWhatsAppEngine` en `Shin-MD/src/core/engine.js` manteniendo `Baileys` como driver por defecto sin alterar la interfaz de usuario.
   - Permitir selección dinámica vía variable de entorno:
     ```env
     WHATSAPP_ENGINE=baileys      # Por defecto (Node.js nativo)
     # WHATSAPP_ENGINE=whatsmeow  # Bridge Go microservicio para ultra bajo consumo
     # WHATSAPP_ENGINE=mock       # Modo headless para tests continuos sin QR
     ```

3. **Cero Dependencias Tóxicas:**
   - Queda terminantemente prohibido instalar forks no auditados de npm. Todo parche de Baileys se aplica mediante el adaptador transparente o parches locales controlados con hash SHA-256 verificado.
