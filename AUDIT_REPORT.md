# Auditoría — NOUS CRM — 2026-06-14

> Auditoría realizada sobre la rama `nous-recovered` (post-recuperación del `git reset --hard`).
> ⚠️ Algunos hallazgos son **artefactos del recovery** (el frontend/algunos archivos se recuperaron
> de un `git stash` del 13/06 23:38 que precede a varios fixes de esta sesión, p. ej. la migración
> del portal a Clerk y el registro de routers nuevos). Se marcan como `[RECOVERY]` para
> distinguirlos de la deuda histórica.

## Resumen ejecutivo
- **Estado general:** 🟠 Compila y buildea (api+admin tsc 0, build 0), pero hay **inconsistencias de auth críticas** (mezcla JWT/Clerk) y **deuda de integridad de datos** real.
- **Conteo por severidad:** Crítico **8** · Alto **~14** · Medio **~16** · Bajo **~10**
- **Top 3 a atacar YA:**
  1. **Mezcla JWT ↔ Clerk** (WS notificaciones + client-auth emiten/verifican JWT propio, incompatible con el resto en Clerk) → notificaciones realtime y login del portal **rotos**. `[RECOVERY]`
  2. **CORS `origin: true` + `credentials: true`** → cualquier dominio hace requests autenticados.
  3. **12 routers exportados pero NO registrados en `app.ts`** (setter, prospecting, proposals, branding, onboarding, calendar público) → endpoints 404. `[RECOVERY]`

## Arquitectura y auth detectadas
- **Apps:** 1 app Next (`apps/admin`) que sirve admin (`/admin`), portal cliente (`/portal`), onboarding (`/onboarding`), booking público (`/book`), propuesta pública (`/p/[token]`). `apps/client-portal` standalone = **legacy** (reemplazado, build roto). API Fastify (`apps/api`, 35 módulos).
- **Auth real:** **Clerk** — admin (`authenticate.ts`→`resolveHubUser`) y portal (`authenticate-client.ts`→`resolveClientAccount`), ambos vía `clerk-auth.ts`; gate real = lookup en DB por `clerk_user_id` (sólido, no confía en `publicMetadata`). Roles vía `authorize.ts` (owner/member/collaborator/viewer). **PERO** quedan restos JWT activos e incompatibles (ver C-2/C-3).

---

## Hallazgos

### [CRÍTICO] C-1 — CORS refleja cualquier origin con credenciales
- **Ubicación:** `apps/api/src/app.ts:67`
- **Qué pasa:** `cors({ origin: true, credentials: true })` → devuelve el `Origin` entrante como `Access-Control-Allow-Origin` + credenciales. Equivale a `*` con cookies.
- **Por qué importa:** cualquier sitio que visite un admin puede hacer requests credenciados y leer la respuesta. Anula CORS/SameSite.
- **Repro:** `fetch('http://localhost:3001/api/users', { credentials:'include' })` desde otro origin → 200.
- **Fix:** `origin: [ADMIN_URL, CLIENT_PORTAL_URL, localhost:3000/3002]`.
- **Estado:** confirmado · histórico

### [CRÍTICO] C-2 — WS de notificaciones verifica JWT propio (incompatible con Clerk) `[RECOVERY]`
- **Ubicación:** `apps/api/src/modules/notifications/notifications.ws.ts:17`
- **Qué pasa:** usa `verifyAccessToken` (JWT `ACCESS_TOKEN_SECRET`) mientras el front manda tokens Clerk → rechaza todos. `setter.ws.ts` ya usa `verifyClerkToken` (inconsistencia interna).
- **Por qué importa:** notificaciones en tiempo real rotas para todos.
- **Fix:** migrar a `verifyClerkToken` + `resolveHubUser` como `setter.ws.ts`.
- **Estado:** confirmado · completar migración Clerk

### [CRÍTICO] C-3 — `client-auth` emite JWT propio (incompatible con `authenticateClient` Clerk) `[RECOVERY]`
- **Ubicación:** `apps/api/src/modules/client-auth/client-auth.service.ts:24-42` vs `middleware/authenticate-client.ts:36`
- **Qué pasa:** `/api/client-auth/login` devuelve JWT propio; los endpoints `/api/client/*` validan con Clerk → el token del login no autentica.
- **Por qué importa:** login del portal del cliente roto end-to-end.
- **Fix:** el portal debe loguear vía Clerk (`<SignIn>` + `userType='client'`); retirar/!registrar el login JWT legacy.
- **Estado:** confirmado · completar migración Clerk

### [CRÍTICO] C-4 — 12 routers exportados pero NO registrados en `app.ts` `[RECOVERY]`
- **Ubicación:** `apps/api/src/app.ts`
- **Qué pasa:** `setterRoutes`, `setterApprovalRoutes`, `setterWsRoutes`, `setterWhatsappWebhookRoutes`, `prospectingRoutes`, `proposalAdminRoutes`, `proposalPublicRoutes`, `brandingAdminRoutes/PublicRoutes/ClientRoutes`, `onboardingAdminRoutes/PublicRoutes`, `calendar.public` (booking) **no se registran**. Los workers del setter tampoco se arrancan en `server.ts`.
- **Por qué importa:** módulos enteros (setter, prospección, propuestas, branding, onboarding, booking público) responden 404 → features inexistentes en runtime.
- **Fix:** registrar los routers en `app.ts` y arrancar workers en `server.ts` (verificar contra el frontend qué rutas se consumen).
- **Estado:** confirmado · a confirmar si el `app.ts` recuperado quedó atrás del estado real

### [CRÍTICO] C-5 — Writes multi-tabla sin transacción (estado corrupto ante fallo)
- **Ubicación:** `cr.service.ts:125-132` (`transitionCR`), `cr.service.ts:158-176` (`clientDecision`), `intake.service.ts:89-99` (`respondIntake`)
- **Qué pasa:** update + insert(history)/update(status) en awaits sueltos. Crash entre medio → estado sin historial / intake eternamente `pending`.
- **Fix:** envolver en `db.transaction()` (CLAUDE.md lo exige).
- **Estado:** confirmado · histórico

### [CRÍTICO] C-6 — DELETE físico en entidades CRM (viola soft-delete de CLAUDE.md)
- **Ubicación:** `deliverables.service.ts:99`, `activities.service.ts:28` (notes), `:82` (tasks), `documents.service.ts:100` (¡incluye contratos firmados DocuSeal!), `cr.service.ts:121` (ítems facturables)
- **Qué pasa:** `db.delete(...)` destruye registros del CRM sin recuperación. Varias tablas ni tienen columna `archived`.
- **Por qué importa:** pérdida irreversible + sin auditoría; `document` borra evidencia legal de firma.
- **Fix:** agregar `archived`/`archived_at` donde falte (migración) + reemplazar por soft-delete.
- **Estado:** confirmado · histórico

### [CRÍTICO] C-7 — Soft-delete leak: contactos archivados en detalle de deal
- **Ubicación:** `deals.service.ts:152-158` (`getDealDetail`)
- **Qué pasa:** filtra contactos por id sin `eq(contact.archived, false)` → contactos archivados aparecen.
- **Fix:** agregar el filtro.
- **Estado:** confirmado · histórico

### [CRÍTICO] C-8 — N+1 grave en timeline (101 queries)
- **Ubicación:** `timeline.service.ts:183-207`
- **Qué pasa:** una query de `emailEvent` por cada email (hasta 100+). Timeline se abre en cada deal/contacto.
- **Fix:** un `inArray(emailEvent.emailId, ids)` + agrupar en memoria.
- **Estado:** confirmado · histórico

### [ALTO] (resumen — detalle en los reportes de los agentes)
- **A-1** `@fastify/rate-limit` NO instalado → los `config.rateLimit` de booking/onboarding se ignoran (DoS / abuso de quota Resend). `calendar.public.router.ts:172`.
- **A-2** Upload sin validación MIME → **XSS via SVG** (`files.service.ts`, `files.router.ts`). Allowlist + magic bytes.
- **A-3** `record_history`/`writeAudit` faltante en **finanzas** (updateInvoice/transitionInvoice/archive*, retainers — `finance.service.ts` H-4..H-10), **CR** (update/transition/clientDecision) y **proposals** (update). Módulo de plata sin audit trail.
- **A-4** `authorize` faltante: `proposals.router.ts:126` (PATCH), `documents` (DELETE), `setter.approval` (reject) → viewer/collaborator pueden editar/borrar.
- **A-5** Booking tokens firmados con el **mismo `ACCESS_TOKEN_SECRET`** que admin (`calendar.service.ts:240`). Secret dedicado.
- **A-6** `notifyAdmins` hace N inserts seriales (`notifications.service.ts:116`). `Promise.all`.
- **A-7** Listas sin paginación (cursor): CRs, deliverables, finance (invoices/payments/expenses/retainers), proposals. CLAUDE.md exige cursor.
- **A-8** `CLERK_SECRET_KEY` default `''` → arranca con auth rota sin avisar (`config/env.ts:36`). `[RECOVERY]` (lo puse así para no romper tests). En prod: `min(1)` o `exit(1)`.
- **A-9** Providers IA (Anthropic/Gemini) sin timeout → workers BullMQ cuelgan (`claude.provider.ts:125`, `gemini.provider.ts:31`, `proposals.ai.ts:132`).

### [MEDIO] (resumen)
- **M-1** Open redirect en `email-tracking` click (`email-tracking.service.ts:117`) — allowlist de hosts.
- **M-2** Host-header injection en URLs de emails de booking si falta `NEXT_PUBLIC_APP_URL` (`calendar.public.router.ts:181`).
- **M-3** Aritmética de plata con floats (`Number()` + `+`) en finance (summary/balance/MRR) — usar numeric SQL o Decimal.
- **M-4** `amountBase` aceptado desde el cliente en expense/retainer schemas (debería computarse server-side).
- **M-5** Money inputs como `z.number()` sin `.multipleOf(0.01)` (acepta `99.999`).
- **M-6** Índices faltantes: `payment.invoiceId`, `changeRequestHistory.changeRequestId`, varias auxiliares.
- **M-7** `expenseSummary` / `getCompanyDetail` / `getDealDetail` con sub-queries sin límite (full fetch + group en JS).
- **M-8** `ANTHROPIC_MODEL`/`VERTEX_MODEL` default `''` → jobs fallan con "invalid model".

### [BAJO] (resumen)
- `void notifyAdmins()` / `.catch(()=>{})` sin log (setter, email-tracking) — fallos silenciosos.
- `(window as any).Clerk` (race de hidratación) en 5 archivos del front — usar `useAuth()`.
- Mutations sin `onError` global (front) — toasts de error.
- `easyinvoice as any`; `invalidateHubUserCache` no-op (riesgo al activar cache Redis); passwords en logs del seed; HMAC fallback de Content-Type en webhook.

---

## Resultados de verificación
- **typecheck:** api 0 · admin 0 ✅
- **build:** api EXIT 0 · admin EXIT 0 ✅ (client-portal legacy falla — fuera de alcance)
- **tests:** unitarios OK (finance.service 42/42). **Integración NO corre:** el test DB se llama `devduo_crm_test` y no existe (contenedor `nous_postgres`). → **drift/infra a arreglar** para poder validar fixes.
- **lint:** no ejecutado en esta pasada (lo agrego en Fase 4 antes/después de fixes).

## Drift doc ↔ código
- `CLAUDE.md`: dice **Auth JWT** (real = **Clerk**) y **Cloudflare R2** (real = **disco local** `uploads/`). Falta documentar roles `collaborator` + finanzas multimoneda.
- **Test DB** `devduo_crm_test` (config de tests) vs DB real `nous` → integración no corre.
- 12 routers sin registrar (C-4) = el `app.ts` no refleja los módulos existentes. `[RECOVERY]`
- Restos de auth JWT (`client-auth`, `notifications.ws`, `auth.router` login) coexisten con Clerk.

## Recomendaciones (no bloqueantes)
- Migrar archivos a R2/S3 con presigned URLs (TTL) — hoy disco local + key pública sin TTL.
- Implementar `invalidateHubUserCache` antes de activar cache Redis de auth.
- Unificar el manejo de errores de mutations en el front (toast global).
