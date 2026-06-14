# Verificación Calendario — 2026-06-14

> Auditoría de punta a punta de la sección Calendario (estilo Calendly) para las tres
> audiencias: **admin**, **cliente del portal** e **invitado público (`/book`)**.
> Fases 0 y 1 (solo lectura) completas. **No se modificó código.** Branch: `verify/calendar`.

## Resumen

- **Estado E2E: 🔴 ROJO.** El flujo público **no funciona de punta a punta**: por un lado el
  contrato frontend↔API está roto (toda reserva desde la UI devuelve 400); por otro, el server
  **no revalida** el slot pedido contra la disponibilidad publicada (confía en el `startsAt` del
  cliente). El backend en aislamiento es sólido (anti-overlap, atomicidad, tokens, DST en el motor),
  pero la integración real está quebrada.
- **Conteo por severidad:** 2 CRÍTICO · 1 ALTO · 2 MEDIO · 4 BAJO.
- **Top 3 riesgos:**
  1. **Contrato FE↔API roto** → ninguna reserva/reprogramación pública se concreta (400).
  2. **Sin revalidación en el server** → un cliente malicioso/viejo reserva fuera de horario, en
     días bloqueados, en el pasado, ignorando minNotice/ventana/buffers. El único guard es el
     EXCLUDE (solapamiento por owner).
  3. **Suite de tests del calendario en rojo** respecto a la implementación: los tests codifican el
     comportamiento correcto (400 para fuera de horario/ventana/notice) que el código ya no cumple.

## Flujo mapeado

```
Disponibilidad (admin)            Slots (público)              Reserva                 Post-reserva
─────────────────────             ──────────────              ───────                 ────────────
availability_schedule  ─┐                                     POST /book              cancel (token)
 + availability_interval ├─ loadHostSchedule ─► computeSlots ─► (NO revalida) ─► INSERT booking ─► reschedule (token)
 + date_override        ─┘     (motor puro,        ▲           EXCLUDE gist        (atómico)
availability_rule (legacy)      date-fns-tz)       │           23P01→409
                                                   └─ getPublicSlots resta SOLO bookings del mismo meeting_type
```

- **Disponibilidad:** schedules con intervalos semanales + date overrides (intervals `[]` = día
  bloqueado). Reglas legacy (`availability_rule`) como fallback. Bloqueo de horarios = override
  vacío. `availability_block` existe en schema pero **no se usa**.
- **Slots:** motor puro `computeSlots` (slots.service.ts), DST-safe vía `date-fns-tz`, almacena y
  devuelve UTC + display en TZ del invitado. Respeta horario, duración, buffers before/after,
  minBookingNotice, bookingWindow (rolling/range/unlimited), dailyLimit, bookings existentes.
- **Reserva:** `POST /api/public/calendar/:portalId/:eventSlug/book` (sin auth, rate limit 10/min).
- **Confirmación:** emails Resend best-effort (invitado + host); tokens JWT de cancel/reschedule.
- **Reprogramar/cancelar:** por token JWT en el body (no en la URL).

**Auth por audiencia:**
- **Admin** → `authenticate` (Clerk/hub_user) + `authorize('owner','member')` para mutaciones.
  Rutas admin solo definen disponibilidad/event types y **listan** bookings del portal.
- **Cliente del portal** → **no tiene vista de calendario/bookings** (no existe la pantalla).
- **Invitado público** → sin login; reserva en `/book`; gestiona con tokens.

**Diferido conocido (no es bug):** integración Google Calendar free/busy (F5). El motor de slots es
interno. ✅ correctamente marcado como pendiente.

## Hallazgos

### [CRÍTICO] Contrato Frontend↔API roto — ninguna reserva pública se concreta (400)
- **Ubicación:**
  - Reserva: `apps/admin/app/book/[portalId]/[slug]/page.tsx:413-419` envía
    `{ slotStart, inviteeName, inviteeEmail, inviteeTimeZone, guestEmails, answers }`.
  - Schema API: `apps/api/src/modules/calendar/calendar.schema.ts:26-41` exige
    `{ startsAt, guestName, guestEmail, inviteeTimeZone, questionAnswers, guestEmails }`.
  - Reprogramar: `apps/admin/app/book/reschedule/page.tsx:139` envía `slotStart` vs backend
    `newStartsAt` (`calendar.schema.ts:65-72`).
- **Qué pasa:** Zod rechaza el body por campos requeridos faltantes (`startsAt`, `guestName`,
  `guestEmail`) → **400 en toda reserva y reprogramación desde la UI real**. Además `answers` es
  array `[{id,value}]` pero el backend espera `questionAnswers` como objeto `record<string>`.
- **Por qué importa:** el producto central (reserva pública estilo Calendly) no puede crear ni una
  sola reserva desde el frontend.
- **Cómo se reproduce:** abrir `/book/:portalId/:slug`, elegir slot, completar y confirmar →
  banner de error con el mensaje Zod (400).
- **Por qué los tests no lo detectaron:** `calendar.router.test.ts:148-155` (`bookPayload`) usa los
  nombres correctos. El gap es puramente el contrato del frontend, nunca ejercido por integración
  FE↔API.
- **Fix propuesto:** unificar el contrato. Recomendado: alinear el **frontend** a los nombres del
  backend (`startsAt/guestName/guestEmail/questionAnswers`, `newStartsAt`) y mapear `answers[]`→
  `questionAnswers{}`. (Alternativa: aceptar ambos en Zod, pero ensucia el contrato.) Responde a la
  convención de envelope/validación Zod de `CLAUDE.md`.

### [CRÍTICO] El server NO revalida el slot — confía en el `startsAt` del cliente
- **Ubicación:** `calendar.service.ts:453-516` (`createPublicBooking`) y `697-781`
  (`reschedulePublicBooking`). `computeSlots` se usa **solo** en `getPublicSlots` (línea 404),
  nunca en la creación/reprogramación.
- **Qué pasa:** la reserva toma `input.startsAt` tal cual, calcula `endsAt` y hace INSERT. El único
  control es el constraint `EXCLUDE USING gist` (solapamiento **por owner**). NO se valida: dentro
  del horario publicado, fecha bloqueada (override vacío), **slot en el pasado**, `minBookingNotice`,
  `bookingWindow`, alineación a `startTimeIncrementMin`, ni buffers.
- **Por qué importa:** un cliente malicioso o con una pestaña vieja puede reservar a las 03:00 AM,
  en días bloqueados, en el pasado o fuera de la ventana publicada. Es exactamente el riesgo que el
  prompt marca como CRÍTICO ("el server revalida… nunca confía en el datetime que manda el cliente").
- **Cómo se reproduce:** `POST /api/public/calendar/:portalId/:slug/book` con
  `startsAt = <fecha>T08:00:00Z` (03:00 AM Bogotá, fuera de 09:00–17:00) → responde **201**
  (debería 400).
- **Evidencia colateral:** `calendar.router.test.ts:295-345+` **espera 400** para fuera de horario,
  fuera de ventana y minNotice → el suite está **rojo** respecto al código actual. La revalidación
  parece haberse perdido en la reconstrucción post-reset (commit `98f9536`).
- **Fix propuesto:** en `createPublicBooking` y `reschedulePublicBooking`, antes del INSERT,
  recomputar los slots disponibles (reusar la lógica de `getPublicSlots`/`computeSlots` para el día
  del `startsAt`) y verificar que el `startsAt` pedido es exactamente un slot válido; si no →
  `Errors.badRequest('… no disponible')`. Mantener el EXCLUDE como red de concurrencia.

### [ALTO] `getPublicSlots` resta solo bookings del mismo meeting_type, pero el anti-overlap es por owner
- **Ubicación:** `calendar.service.ts:376-389` filtra `eq(booking.meetingTypeId, mt.id)`. El
  constraint es `owner_id WITH =` (`migrations/0016_late_deathbird.sql:95-99`).
- **Qué pasa:** si el owner tiene un booking de **otro** meeting_type a esa hora, el slot igual
  aparece libre. Al reservar, el EXCLUDE lo rechaza con 409.
- **Por qué importa:** discrepancia entre los slots mostrados y la realidad → 409 inesperado para el
  invitado, aunque no es un hueco de seguridad.
- **Fix propuesto:** en `getPublicSlots` cargar los bookings confirmados **por owner** (no por
  meeting_type) para el/los host(s) relevantes, y pasárselos al motor.

### [MEDIO] `availability_block` es schema muerto
- **Ubicación:** `db/schema/calendar.ts:72-80`. Sin uso fuera del schema (grep vacío), sin ruta
  admin, sin resta en `computeSlots`.
- **Qué pasa:** no hay forma de "bloquear horarios" vía bloques puntuales con timestamp; el bloqueo
  real funciona solo vía `date_override` (intervals vacíos). Tabla sin uso.
- **Fix propuesto:** decisión de producto — o se cablea (ruta admin + resta en el motor) o se
  documenta como no usada. Severidad baja porque el bloqueo por override sí existe.

### [MEDIO] WeekView (admin) agrupa bookings por TZ local del browser, no la del schedule
- **Ubicación:** `apps/admin/app/admin/(dashboard)/calendar/components/WeekView.tsx:57`
  (`dateOfBooking` usa `new Date(iso)` en hora local del browser).
- **Qué pasa:** bookings cerca de medianoche pueden aparecer en el día equivocado para un admin en
  otra TZ. Solo display; no afecta los datos.

### [BAJO] Defaults de timezone inconsistentes
- `createAvailabilityRule` default `America/Bogota` (`calendar.service.ts:108`) vs schema y
  `loadLegacyRules` default `America/Argentina/Buenos_Aires` (`calendar.ts:66`, `service:202`).
  Puede producir disponibilidad en TZ inesperada según el camino de creación.

### [BAJO] Rolling window usa `startOfDay(now)` en TZ local del proceso
- `slots.service.ts:243` — el borde de la ventana rolling depende de la TZ del server, no de UTC ni
  de la TZ del host. Borde de día potencialmente off-by-one en deploys con TZ no-UTC.

### [BAJO] El frontend no distingue el 409 (slot ya tomado)
- `apps/admin/app/book/[portalId]/[slug]/page.tsx:224` — el mensaje del server se muestra genérico
  en `submitError`; no hay rama que sugiera "elegí otro slot" ni refresque los slots.

### [BAJO] Discrepancia de ruta en el link público copiable
- `apps/admin/app/admin/(dashboard)/calendar/components/EventTypeList.tsx:43` arma
  `/booking/:portalId/:slug`, pero las páginas viven en `/book/:portalId/:slug`.

## Lo que está CORRECTO (verificado, no es bug)

- ✅ **Constraint EXCLUDE parcial:** `WHERE (status = 'confirmed')` (`0016:99`) → cancelar
  (`status='cancelled'`) libera el slot. El bug clásico del gist NO está presente.
- ✅ **Reschedule atómico:** cancela el viejo + inserta el nuevo en la misma `db.transaction`
  (`calendar.service.ts:738-773`). Nunca quedan dos confirmados ni dos libres.
- ✅ **Concurrencia limpia:** `23P01` capturado → 409 con mensaje claro en book y reschedule
  (`service:512` y `:777`). No 500.
- ✅ **Tokens:** JWT firmados con discriminador `type` (cancel ≠ reschedule), TTL hasta `starts_at`,
  revocación al usar (se limpian `cancelToken`/`rescheduleToken`); van en el body, no en la URL.
- ✅ **Motor DST-safe:** `fromZonedTime/toZonedTime` (sin offset fijo), almacena UTC, display en TZ
  del invitado. (Aunque la revalidación lo bypassa — ver CRÍTICO #2.)
- ✅ **IDOR:** el portal del cliente no tiene vista de bookings; el listado es solo admin
  autenticado; los endpoints públicos cancel/reschedule dependen de un JWT no adivinable.

## Casos límite verificados

| Caso | Método | Resultado |
| ---- | ------ | --------- |
| DST gap/overlap | Estático (motor usa date-fns-tz) | ✅ correcto en el motor · ⚠️ **pendiente verificar dinámicamente** (Fase 2) y bypassado en booking (#2) |
| Doble-booking concurrente | Estático (EXCLUDE + 23P01→409) | ✅ correcto · pendiente prueba de concurrencia real (Fase 2) |
| Revalidación server del datetime | Estático | 🔴 **AUSENTE** (CRÍTICO #2) |
| Cancelar libera el slot | Estático (EXCLUDE parcial) | ✅ correcto |
| IDOR cliente A vs B | Estático | ✅ N/A (no hay vista de bookings de cliente) |
| Contrato FE↔API | Estático (diff de campos) | 🔴 **ROTO** (CRÍTICO #1) |
| Suite de tests | `pnpm --filter api test` | ⚠️ no corre: falta DB `devduo_crm_test` (15 archivos fallan por entorno, no por código) |

## Fase 2 — Verificación dinámica (resultados)

DB de test `devduo_crm_test` creada + migrada (incluye el EXCLUDE de la 0016). Suite del calendario
corrida → **baseline ROJO: 7 fallos** en `calendar.router.test.ts`, que demuestran los bugs:

| Test | Esperado | Obtenido | Demuestra |
| ---- | -------- | -------- | --------- |
| crea booking en slot libre → 201 | `cancelUrl` con `?token=` | `?t=` | Contrato `?t=` vs `?token=` (links de email rotos) |
| slot fuera de horario → 400 | 400 | **201** | CRÍTICO 2 (sin revalidación) |
| **slot en el pasado → 400** (test nuevo) | 400 | **201** | CRÍTICO 2 (se puede reservar en el pasado) |
| slot fuera de bookingWindow → 400 | 400 | 409 | CRÍTICO 2 (sin validación de ventana) |
| minNotice insuficiente → 400 | 400 | booking creado | CRÍTICO 2 (sin validación de notice) |
| cancel válido → 200 + libera slot | lee `?token=` | falla en `?t=` | Contrato `?t=` vs `?token=` |
| reschedule válido → 201 | lee `?token=` | falla en `?t=` | Contrato `?t=` vs `?token=` |

**Hallazgo adicional de Fase 2 — `?t=` vs `?token=` (parte de la familia C1):** el service genera
`cancelUrl`/`rescheduleUrl` con `?t=` (`calendar.service.ts:532-533,796-797`), pero las páginas
`/book/cancel` y `/book/reschedule` y los tests leen `?token=`. Los links de cancelar/reprogramar de
los emails **no funcionan**. Fix: emitir `?token=` desde el backend (el resto del sistema ya usa ese
nombre).

Lo que ya estaba **verde** (no es bug): concurrencia (dos reservas mismo slot → 201/409),
`GET /slots`, validaciones Zod de campos faltantes, discriminador de tipo de token (401).

## Fase 4 — Correcciones aplicadas (scope acordado: 2 CRÍTICOS + ALTO)

Commits en `verify/calendar`. Resultado: **flujo público 43/43 verde**, api+admin typecheck 0, lint limpio.

- **CRÍTICO 2 (revalidación):** `createPublicBooking` y `reschedulePublicBooking` ahora llaman a
  `assertSlotAvailable()`, que recomputa los slots con `computeSlots` y exige que el `startsAt`
  pedido sea exactamente un slot válido. Cierra fuera-de-horario, pasado, ventana, minNotice y
  buffers. El EXCLUDE queda como red de concurrencia. (`calendar.service.ts`)
- **ALTO (owner-busy):** `getPublicSlots` y la revalidación restan bookings confirmados por
  `owner_id` (no por `meeting_type`) → los slots mostrados coinciden con lo que el constraint
  permite. Helpers nuevos: `getSchedulesForMeetingType`, `getBusyBookings`, `toEventTypeConfig`.
- **CRÍTICO 1 (contrato):** `/book` y `/reschedule` (frontend) envían
  `startsAt/guestName/guestEmail/questionAnswers/newStartsAt`; el backend emite las URLs de
  autoservicio con `?token=` (no `?t=`). (`page.tsx` × 2 + `calendar.service.ts`)
- Test nuevo (slot en el pasado → 400) y 3 aserciones alineadas al contrato real consumido por el
  frontend (mensaje genérico de revalidación, `data.booking.id`, `data.booking.rescheduledFromId`).

### [CRÍTICO — NUEVO, fuera del scope acordado] Las rutas admin V2 del calendario NO existen
- **Ubicación:** `apps/api/src/modules/calendar/calendar.router.ts` solo registra `/meeting-types`,
  `/availability`, `/bookings`. El frontend admin llama a `/api/calendar/event-types`,
  `/api/calendar/schedules` (+ intervals/overrides), `/api/calendar/bookings/week` y
  `/api/calendar/bookings/:id/cancel` (`apps/admin/lib/hooks/calendar.ts`). Ninguna existe → **404**.
- **Qué pasa:** el panel admin del calendario (definir schedules, intervalos, date overrides, crear
  event types, vista semana, cancelar como admin) está roto de punta a punta contra la API. Solo
  funcionan las rutas legacy (`/availability`, `/meeting-types`) que el frontend ya no usa.
- **Por qué importa:** un admin no puede configurar disponibilidad ni event types desde la UI; el
  flujo público solo se puede preparar por seed/API directa. Los 3 tests F4b quedan en **404 rojo**
  (pre-existentes, no son regresión de esta verificación).
- **Probable causa:** capa V2 perdida en el `git reset`/reconstrucción (el frontend se restauró
  desde un stash, el backend V2 no).
- **Decisión pendiente del usuario:** reconstruir el router admin V2 es un trabajo aparte
  (schedules CRUD + intervals + overrides + event-types CRUD + bookings/week + cancel). No estaba en
  el scope "2 CRÍTICOS + ALTO".

## Checklist E2E manual (admin / cliente / invitado)

- [ ] **Admin** define disponibilidad: crea schedule, intervalos semanales, un date override vacío
      (día bloqueado) y verifica que se guarda.
- [ ] **Admin** crea un event type activo y copia su URL pública.
- [ ] **Invitado** abre `/book/:portalId/:slug`, ve días disponibles, elige slot, selecciona su TZ,
      completa y **confirma** → debe crear la reserva (hoy: 🔴 400 por contrato roto).
- [ ] **Invitado** recibe email de confirmación (mock Resend, no enviar real) con links
      cancel/reschedule.
- [ ] **Invitado** intenta reservar un horario fuera del publicado vía POST directo → debe ser
      rechazado por el server (hoy: 🔴 201).
- [ ] **Invitado** reprograma desde el link → libera el viejo, toma el nuevo, atómico.
- [ ] **Invitado** cancela desde el link → el slot vuelve a aparecer libre.
- [ ] **Admin** ve la reserva en "Reuniones" y en la vista semana, y puede cancelarla.
- [ ] **Concurrencia:** dos reservas simultáneas al mismo slot → una 201, otra 409 (no 500).
