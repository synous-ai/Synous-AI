# CLAUDE.md — Contexto del proyecto: Setter unificado

> Este archivo es el contexto persistente para Claude Code. Leelo antes de escribir o modificar código.
> Documentos hermanos (referencia de producto/arquitectura): `setter-ai-playbook.md` (cómo) y `setter-producto-unificado.md` (qué/por qué).

---

## Qué estamos construyendo

Una máquina de adquisición de clientes end-to-end: **prospecta → abre conversación → califica → agenda → recuerda**, por WhatsApp e Instagram DM, en español rioplatense, con respuestas en texto y notas de voz clonadas. Un solo "cerebro" agnóstico del canal.

**Uso primario:** herramienta propia para conseguir clientes (no es para vender todavía). Diseñá simple y robusto, no enterprise. Multi-tenancy y Cloud API oficial son Sprint 5 (opcional), NO ahora.

---

## Stack (no cambiar sin pedir)

- **Runtime:** Node.js + TypeScript (strict), Fastify.
- **LLM:** Gemini (Vertex AI), modelo `gemini-3.1-pro` para el agente, function calling.
- **DB:** PostgreSQL + Prisma.
- **Colas:** Redis + BullMQ (delayed jobs para follow-ups/recordatorios).
- **WhatsApp (MVP):** Evolution API (modo Baileys) sobre número dedicado. Detrás de una interfaz, para swapear a Cloud API oficial después sin tocar el agente.
- **Voz:** ElevenLabs (clonado + TTS), STT con Whisper o Gemini.
- **Calendario:** Google Calendar (freebusy + insert).

---

## Las 3 restricciones duras (definen la arquitectura — no las violes)

1. **Política IA de Meta (ene-2026):** el agente es purpose-driven (calificar + agendar), NO un asistente general. Mantenelo scopeado por system prompt + tools acotadas. Si el lead pregunta si es IA, responde la verdad (no mentir).
2. **Economía de la ventana de 24h:** responder dentro de la ventana de servicio (24h desde el último mensaje del lead) es gratis con free-form. Fuera de la ventana, solo templates pagos. **Todo el motor de follow-up se diseña para vivir dentro de la ventana** y gastar templates solo para reabrir leads fríos.
3. **Cap anti-spam (~2 templates marketing/usuario/24h, error 131049):** no brutear con templates. Priorizar `utility` y free-form. (Aplica a Cloud API; en Evolution/Baileys el riesgo equivalente es el ban — ver anti-patterns.)

---

## Reglas de diseño NO negociables

- **Todo asíncrono.** El webhook responde 200 en <5s y delega a la cola. NUNCA llamar al LLM dentro del request del webhook.
- **Idempotencia.** Guardar `wa_message_id`/`message_id` con unique constraint. Descartar duplicados (los webhooks se reentregan).
- **El estado vive en Postgres, no en el LLM.** El LLM es stateless; reconstruí contexto en cada turno. La fuente de verdad del stage del lead es la state machine (`LeadStatus`).
- **Acciones = tools deterministas.** El LLM decide qué decir y qué tool llamar; el sistema ejecuta. El LLM NUNCA inventa slots, precios ni confirma bookings por texto. `check_availability` es la única fuente de horarios; `book_appointment` es la única que agenda.
- **Validación de salida.** Si el output del LLM menciona una hora sin haber llamado `check_availability`, contiene un precio no autorizado, o se va de tópico → regenerar o escalar.
- **Temperature baja (0.3–0.5) y mensajes cortos** (`maxOutputTokens` ~400). Un setter ejecuta un framework, no improvisa ensayos. Párrafos largos = se nota el bot.
- **Una pregunta por mensaje.** A nivel producto y a nivel prompt.
- **Voz quirúrgica.** Audio solo en beats de rapport (apertura, objeción clave, pedido de call). Texto para horarios/links/datos. Máx 1 audio cada 3-4 mensajes.

---

## Modelo de dominio (resumen — schema completo en el playbook)

Entidades núcleo: `Tenant` (config del negocio), `Person` (identidad cross-canal, agrupa teléfonos/handles), `Lead` (Person en un pipeline, con `status` + `qualification` JSON + `windowExpiresAt`), `Conversation` → `Message[]`, `Appointment`, `FollowUp`, `WhatsappTemplate`.

`LeadStatus`: NEW → CONTACTED → ENGAGED → QUALIFYING → QUALIFIED → BOOKING → BOOKED → (NO_SHOW | NOT_INTERESTED | UNRESPONSIVE | HANDED_OFF).

La memoria de conversación cuelga de `Person`, no del canal (continuidad cross-canal).

---

## Estructura de módulos (sugerida)

```
src/
  channels/                 # adapters por canal, todos implementan MessagingProvider
    MessagingProvider.ts    # interfaz: sendText, sendVoiceNote, sendTemplate, getWindowState, markRead
    whatsapp.evolution.ts   # MVP (Baileys)
    whatsapp.cloud.ts       # Sprint 5 (oficial)
    instagram.ts            # Sprint 3
  agent/
    brain.ts                # el loop del agente (Gemini + tools), agnóstico del canal
    prompts/                # ← los prompts de runtime viven acá (ver prompts-setter.md)
    tools/                  # check_availability, book_appointment, save_qualification,
                            #   handoff_to_human, mark_not_interested
    stateMachine.ts
  identity/
    resolver.ts             # Person matching cross-canal
  voice/
    clone.ts                # ElevenLabs TTS con voiceId
    stt.ts                  # transcripción de audio entrante
    beatPolicy.ts           # decide text vs voice
  followups/
    scheduler.ts            # BullMQ delayed jobs, cadencia window-aware
    cadence.ts
  calendar/
    google.ts
  leadengine/               # integración con tu lead-engine existente
  webhooks/                 # Fastify routes (responden 200 rápido, encolan)
  queue/                    # BullMQ setup, workers
  db/                       # Prisma client, repos
```

---

## Capas propias (lo que nos diferencia — implementar bien)

- **Identity Resolver:** un `Person` agrupa identidades. Match por teléfono/email cuando están; por heurística (nombre + ventana temporal + misma oferta referida) cuando no. La conversación se asocia a `Person`.
- **Voice Layer:** `beatPolicy` decide `text|voice` por turno. Salida: TTS con `voiceId` → `sendVoiceNote`. Entrada: si el lead manda audio, STT antes de pasar al cerebro. En Instagram el envío de audio por API es limitado → priorizar texto ahí, voz en WhatsApp.
- **Lead-engine bridge:** consume leads del proyecto existente (Fastify + Google Maps Places + Claude). El primer toque puede venir del lead-engine; el setter toma desde la primera respuesta.
- **Modo de operación (shadow → híbrido → autopilot):** progresión, no opción suelta.
  - **Shadow (default al arrancar, GLOBAL):** el agente genera la respuesta completa (texto/voz, tool calls) pero NO la manda; la encola para aprobación humana. Aprende de las correcciones. En esta etapa se aprueba TODO, sin excepción — es para calibrar tono/prompts/calificación. No implementes ruteo por tipo todavía.
  - **Híbrido (después, cuando hay confianza parcial):** auto-envía lo de bajo riesgo (apertura, FAQ obvia) y solo frena para aprobación lo delicado (objeción, pedido de call, ambiguo). **Reusá la clasificación de `beatPolicy`** (que ya etiqueta cada draft por momento para decidir text/voice) como input del ruteo — no construyas un clasificador nuevo.
  - **Autopilot:** envía todo solo. Solo cuando el approval rate y la conversión lo respalden.
  - El trigger para avanzar es la **confianza ganada** (tasa de aprobación sin edición alta), no un número de sprint fijo. La infra de Sprint 0 ya debe dejar el draft etiquetado por beat para que el salto a híbrido sea solo agregar la regla de ruteo.

---

## Orden de construcción (sprints — seguir este orden)

- **Sprint 0:** cerebro + 1 canal (Evolution/Baileys) + booking a Google Calendar + shadow mode. Meta: agendar calls reales con aprobación humana.
- **Sprint 1:** lead-engine enchufado + follow-up window-aware.
- **Sprint 2:** Voice Layer (clonado + TTS + STT + beatPolicy).
- **Sprint 3:** Instagram DM + Identity Resolver + comment-to-DM.
- **Sprint 4:** dashboard (unit economics) + paso a **híbrido** (auto-envío de bajo riesgo, aprobación de lo delicado, reusando `beatPolicy`) y luego **autopilot** cuando los números lo respalden. El salto se gatilla por confianza ganada, no por calendario.
- **Sprint 5 (opcional):** productizar — multi-tenant real, Cloud API oficial, onboarding self-serve.

No adelantes sprints. No metas multi-tenancy ni Cloud API en Sprint 0.

---

## Anti-patterns (qué NUNCA hacer)

- ❌ Llamar al LLM dentro del webhook (encolar siempre).
- ❌ Dejar que el LLM invente horarios/precios o "confirme" bookings por texto.
- ❌ Mandar todo en audio (cansa, suena raro). Audio solo en beats.
- ❌ Brutear follow-ups con templates de marketing (cap 131049 / ban en Baileys).
- ❌ Blast de mensajes desde un número nuevo sin warm-up (ban asegurado en Evolution/Baileys).
- ❌ Cold outbound puro a gente que nunca te dio el número (alto riesgo). Preferir que escriban primero (ads click-to-WA, links wa.me, comment-to-DM).
- ❌ Guardar estado de conversación en el LLM o en memoria de proceso (va a Postgres).
- ❌ Mensajes largos / multi-pregunta / más de 1 emoji.
- ❌ Acoplar el agente a un canal concreto (siempre vía `MessagingProvider`).
- ❌ Mentir si preguntan si es IA.

---

## Convenciones de código

- TypeScript strict. Sin `any` salvo justificación.
- Errores: try/catch en toda llamada externa (LLM, canal, calendario). Reintentos con backoff en workers, idempotentes.
- Logs estructurados por `personId`/`leadId` + cada tool call.
- Tracking de costo: cada template enviado registra `costCents` para el unit economics.
- Tests: priorizar el agent loop, el resolver de identidad y la cadencia de follow-up (la lógica con más riesgo de bug caro).
- Secrets por env. Nunca hardcodear tokens de Meta/Evolution/ElevenLabs/Vertex.
