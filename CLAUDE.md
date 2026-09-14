# CLAUDE.md — SynousAI

Este archivo es leído automáticamente por Claude Code al abrir el proyecto.
La documentación completa está en `CRM_SYNOUS_DOCS.md`. Para arquitectura,
modelo de auth/multi-tenant, flujos de negocio y limitaciones conocidas, ver
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

---

## Qué es este proyecto

CRM propio para una agencia de desarrollo web de dos personas (Jeremias y Laurenao).
Monorepo con dos apps: API (Fastify) y Admin (Next.js), que además sirve el
portal de cliente bajo `/portal`.
**No uses librerías externas de CRM. Todo se construye desde cero sobre PostgreSQL.**

---

## Cómo correr el proyecto

```bash
# Instalar dependencias (desde la raíz)
pnpm install

# Levantar servicios de infraestructura
docker compose -f docker-compose.dev.yml up -d

# Correr migraciones
pnpm --filter api db:migrate

# Correr seed inicial
pnpm --filter api db:seed

# Dev (las tres apps en paralelo)
pnpm dev

# Solo la API
pnpm --filter api dev

# Solo el admin (incluye el portal de cliente en /portal)
pnpm --filter admin dev
```

**Puertos en desarrollo:**

- API: `http://localhost:3001`
- Admin + Portal de cliente: `http://localhost:3000`
- PostgreSQL: `localhost:5433` (mapeado a 5432 del contenedor; evita conflicto con un Postgres local)
- Redis: `localhost:6379`

---

## Estructura del monorepo

```
apps/api/            → Fastify + Drizzle ORM + PostgreSQL (backend)
apps/admin/          → Next.js 14 App Router (frontend). Sirve TRES superficies:
                       /admin/*  panel interno del equipo
                       /portal/* portal de cliente (componentes en portal-lib/)
                       /p, /book páginas públicas (propuestas y reservas)
packages/shared/     → @synous/shared — helpers puros (slug, formato, cn)
packages/api-client/ → @synous/api-client — cliente HTTP tipado
docs/                → documentación, referencias de diseño y baselines de perf
services/            → servicios fuera del workspace de pnpm (whatsapp-gateway)
```

El portal de cliente NO es una app aparte: vive dentro de `apps/admin` bajo
`/portal`, y el middleware resuelve el tenant por subdominio o por `/c/<slug>`.
Existió un `apps/client-portal` standalone que quedó obsoleto. La carpeta
**sigue en disco** pero no está trackeada en git (`git ls-files` no la lista)
y solo contiene caché de build (`.next/`, `.turbo/`, `node_modules/`) — no es
un workspace de pnpm activo ni se despliega. Se puede borrar sin impacto.

Cada módulo de la API sigue esta estructura:

```
src/modules/<nombre>/
  router.ts    → rutas Fastify + validación Zod
  service.ts   → lógica de negocio, acceso a DB
  schema.ts    → schemas Zod de request/response
  types.ts     → tipos TypeScript del módulo
```

---

## Stack — decisiones ya tomadas, no cambiar

| Capa               | Tecnología                                         |
| ------------------ | -------------------------------------------------- |
| Runtime            | Node.js 20+ TypeScript estricto                    |
| API framework      | Fastify (no Express)                               |
| ORM                | Drizzle ORM (no Prisma, no TypeORM)                |
| Base de datos      | PostgreSQL 16+                                     |
| Validación         | Zod en todos los endpoints sin excepción           |
| Auth               | Clerk — hub_user y client_account por `userType`   |
| Emails             | Resend                                             |
| Archivos           | Vercel Blob privado (`@vercel/blob`), subida directa presignada; disco local en dev — ver `docs/STORAGE.md` |
| Queue / Jobs       | BullMQ + Redis                                     |
| WebSockets         | @fastify/websocket                                 |
| Frontend           | Next.js 14 App Router + TypeScript                 |
| Estilos            | Tailwind CSS + shadcn/ui                           |
| Estado global      | Zustand                                            |
| Fetching           | TanStack Query                                     |
| Tablas             | TanStack Table                                     |
| Formularios        | React Hook Form + Zod                              |
| Kanban drag & drop | @dnd-kit/core                                      |
| Gráficas           | Recharts                                           |
| Testing            | Vitest + Supertest                                 |

---

## Reglas de código — seguir siempre

### Nombrado

- Archivos: `kebab-case` → `change-request.service.ts`
- Funciones y variables: `camelCase` → `createChangeRequest()`
- Tablas y columnas DB: `snake_case` → `change_request_id`
- Schemas Zod: sufijo `Schema` → `CreateChangeRequestSchema`
- Types/interfaces: sufijo `DTO` o `Type` → `CreateChangeRequestDTO`
- Componentes React: `PascalCase` → `ChangeRequestCard.tsx`

### TypeScript

- `strict: true` siempre. Cero `any` implícitos.
- Tipar todos los returns de funciones async explícitamente.
- Usar `satisfies` de TypeScript cuando sea posible.

### API

- Todos los endpoints validan con Zod antes de llegar al service.
- Todos los errores usan `AppError(code, message, statusCode)`.
- Respuestas siempre en formato `{ data, meta? }` o `{ error }`.
- Paginación con `limit` y `cursor` (no `offset`) para listas grandes.

### Base de datos

- Cualquier operación que toque más de una tabla: usar `db.transaction()`.
- Los campos núcleo (`contact`, `company`, `deal`, etc.) son columnas TIPADAS: se actualizan con un `UPDATE` normal de columnas, no con merge JSONB.
- El merge JSONB con `||` aplica ÚNICAMENTE a la columna `custom` (válvula de escape para campos ad-hoc):
  ```sql
  -- CORRECTO: merge solo sobre custom
  UPDATE deal SET custom = custom || $1 WHERE id = $2
  -- MAL: reemplaza todo el objeto custom
  UPDATE deal SET custom = $1 WHERE id = $2
  ```
- Nunca borrar registros del CRM. Siempre `archived = true` + `archived_at = now()`.
  Cobertura real hoy: `deal`, `contact`, `company`, y desde la migración `0038`
  también `document` y `deliverable`, y desde la `0041` `note` y `task` (antes se
  borraban en duro; sus endpoints `DELETE` mantienen la ruta pero ahora archivan).
- Cada cambio de campo en una entidad núcleo se registra en `record_history` (referencia polimórfica `entity_type` + `entity_id`, guarda `old_value` y `new_value`). Implementarlo en el service, no en el router.
- Siempre filtrar `WHERE archived = false` en queries de listado.

### Seguridad — crítico

- Los tokens de `hub_user` y `client_account` son completamente distintos.
- Middleware `authenticate` → verifica token de admin (hub_user).
- Middleware `authenticateClient` → verifica token de cliente (client_account).
- Un cliente NUNCA puede acceder a rutas del admin. Verificar en cada ruta.
- Nunca loguear tokens, passwords, ni API keys.
- **Guardia de FKs por tenant:** todo id que llega en el body de un request para
  relacionar entidades (`companyId`, `primaryContactId`, `ownerId`, …) tiene que
  validarse contra el `portalId` del caller ANTES de escribir. Postgres solo
  garantiza que la fila exista, no que sea del mismo tenant — sin esto, un
  usuario del portal A puede colgar de su deal una entidad del portal B.
  Usar los helpers de `apps/api/src/lib/portal-access.ts`:
  `assertDealInPortal`, `assertCompanyInPortal`, `assertContactInPortal`,
  `assertHubUsersInPortal` (todos aceptan un `executor` opcional para pasarles
  el `tx` cuando corren dentro de una transacción). `null`/`undefined` pasan
  siempre: desvincular una relación es legítimo. Ya aplicado en `deals`,
  `finance` (invoices/expenses), `documents` y `calendar` (event types); al
  agregar un endpoint nuevo que reciba un FK-id en el body, agregar la guardia
  correspondiente ahí también.
- **Rate limit es opt-in por ruta.** `@fastify/rate-limit` está registrado con
  `global: false`: una ruta NO queda limitada a menos que declare
  `config: { rateLimit: { max, timeWindow } }` explícitamente. Se usa en rutas
  públicas que mandan emails o validan tokens (booking del calendario,
  propuestas públicas). El store es en memoria — bajo serverless con varias
  instancias es defensa contra abuso desde una sola fuente, no un límite
  global exacto.

---

## Reglas de negocio críticas — no saltarse

**DocuSeal:**
Las URLs de documentos firmados expiran en 40 minutos.

- ✅ Guardar: `docuseal_submission_id` (el ID numérico)
- ❌ Nunca guardar: la URL del PDF firmado
- Para obtener la URL: llamar a `GET /submissions/{id}/documents` en el momento que se necesita

**Change Requests — numeración:**
El número de CR es relativo al deal, no global.

```typescript
// SIEMPRE así:
const { number } = await db
  .select({
    number: sql`COALESCE(MAX(${changeRequest.number}), 0) + 1`,
  })
  .from(changeRequest)
  .where(eq(changeRequest.dealId, dealId));
```

**Activación del Client Portal — dos fases:**
Se dispara cuando:

- El deal llega a una etapa con `is_won = true`, O
- Llega el webhook de DocuSeal con `form.completed` sobre un documento
  `contract`, O
- Un admin la dispara a mano (`activateClientPortalManually`) desde el detalle
  de deal.

Llamar siempre a `activateClientPortal(tx, portalId, dealId)` para la parte de
DB: crea `client_account` + `client_deal_access` si no existen, y marca el
contacto como `customer`. Es idempotente y **NO habla con Clerk ni manda
email** — devuelve un descriptor `PortalActivation | null` (`null` si no hay
nada que hacer: sin contacto/email, o cuenta ya vinculada a Clerk).

Las llamadas a Clerk (crear usuario, invitar) y el envío del email van
DESPUÉS del commit, en `completeClientPortalActivation(activation)` —
best-effort, atrapa sus propios errores y loguea. Razón: correr HTTP a Clerk
dentro de la transacción retenía el lock de la fila del deal durante el
round-trip, y si la transacción hacía rollback el usuario de Clerk ya había
quedado creado igual (no hay rollback de un side-effect externo). Si Clerk o
Resend fallan en esta segunda fase, la cuenta ya existe en DB y una activación
posterior reintenta el vínculo porque `needsClerkUser` sigue en `true`.

Patrón siempre igual en los tres callers:
```typescript
const activation = await activateClientPortal(tx, portalId, dealId) // dentro de la tx
// ... commit ...
if (activation) await completeClientPortalActivation(activation) // después del commit
```

**Stage changes:**
Nunca actualizar `stage_id` directamente en el router.
Siempre usar `dealService.changeStage(dealId, newStageId, userId)` que hace:

1. Update del deal (columna `stage_id`)
2. Insert en `record_history` (`entity_type = 'deal'`, `field_name = 'stage_id'`, `old_value`, `new_value`)
3. Insert en `audit_log`
4. Create notification
5. Check si `is_won` para activar client portal

**Envío de emails (`sendEmail`, `lib/mailer.ts`):**
Cliente lazy de Resend — se instancia solo si `RESEND_API_KEY` está presente.

- Sin `RESEND_API_KEY`: loguea el intento y retorna sin error (modo dev/test
  seguro, no rompe nada).
- Con la key configurada, si Resend devuelve `{ error }` (el SDK de Resend NO
  rechaza la promesa ante un fallo, devuelve un objeto con `error`),
  `sendEmail` **LANZA** `AppError('EMAIL_SEND_FAILED', ..., 502)`. Antes ese
  error se tragaba silenciosamente adentro de `sendEmail`, así que el `catch`
  best-effort del caller nunca se ejecutaba y campos como `inviteSentAt` se
  sellaban igual aunque el envío hubiera fallado de verdad.
- El caller SIEMPRE envuelve en `try/catch` y trata el envío como
  best-effort — un email que no sale no debe hacer fallar el flujo de negocio
  que lo dispara (stage change, invitación, etc.), pero si vas a marcar un
  campo tipo `xSentAt`, hacelo DESPUÉS de que `sendEmail` resuelva sin lanzar,
  nunca antes.

---

## Migraciones de base de datos

```bash
# Generar migración después de cambiar el schema Drizzle
pnpm --filter api db:generate

# Aplicar migraciones pendientes
pnpm --filter api db:migrate

# NUNCA editar archivos en /migrations/ manualmente
# NUNCA usar db:push en producción (salvo dev local)
```

El schema de Drizzle vive en `apps/api/src/db/schema/`.
Un archivo por tabla o por grupo de tablas relacionadas.

Las migraciones son **forward-only** (no hay `down`): un rollback en
producción significa restaurar desde backup/PITR, no "deshacer" la migración.
Antes de deployar una migración que agregue un `UNIQUE` sobre datos
preexistentes (como la `0038`, que agrega `UNIQUE(portal_id, number)` en
`invoice`), verificar que no haya duplicados o el `ALTER TABLE` falla en
producción. Ver `docs/ARCHITECTURE.md` para el detalle.

---

## Variables de entorno

El archivo `.env.example` tiene todas las variables requeridas.
Al iniciar, la API valida las variables con Zod, pero SOLO falla rápido con las
requeridas (`DATABASE_URL`, `ACCESS_TOKEN_SECRET`). Las demás son opcionales o
tienen default: su ausencia no rompe el arranque, apaga la feature en silencio.

```bash
cp .env.example .env
# Editar .env con los valores reales
```

Variables mínimas para desarrollo local:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/nous
ACCESS_TOKEN_SECRET=dev_secret_access_32chars_minimum
CLERK_SECRET_KEY=sk_test_...
REDIS_URL=redis://localhost:6379
```

Solo `DATABASE_URL` y `ACCESS_TOKEN_SECRET` son obligatorias: el resto es
`.optional()` o tiene `.default()` en `src/config/env.ts`, así que la API
ARRANCA sin ellas y las features se apagan EN SILENCIO. Sin `REDIS_URL` no
corren las colas de BullMQ; sin `RESEND_API_KEY` no sale ningún email; sin
`DOCUSEAL_API_KEY` la firma de documentos queda inactiva. Si algo "no hace
nada" en un entorno, revisá primero qué variable falta.

---

## Testing

```bash
# Todos los tests
pnpm test

# Solo la API
pnpm --filter api test

# Watch mode
pnpm --filter api test:watch

# Coverage
pnpm --filter api test:coverage
```

Convenciones de tests:

- Tests unitarios del service: `src/modules/<nombre>/<nombre>.service.test.ts`
- Tests de integración del router: `src/modules/<nombre>/<nombre>.router.test.ts`
- Cada módulo nuevo necesita al menos tests del service antes de considerarse completo.
- Usar `vitest` para unitarios y `supertest` para integración contra la app Fastify real.

---

## Webhooks externos

Todos los webhooks entran por `apps/api/src/modules/webhooks/`.

| Servicio | Ruta                      | Validación                                    |
| -------- | ------------------------- | --------------------------------------------- |
| DocuSeal | `POST /webhooks/docuseal` | Header token contra `DOCUSEAL_WEBHOOK_SECRET` |
| Fathom   | `POST /webhooks/fathom`   | Header `X-Fathom-Signature` HMAC              |

Regla: siempre validar la firma del webhook antes de procesar.
Si la validación falla: responder `401` sin información de error (no revelar que existe el endpoint).

---

## Mapa de módulos

Este checklist por fases quedó desactualizado (el producto avanzó mucho más
rápido de lo que se actualizaba este archivo) y se reemplaza por un mapa del
estado real del código. Fuente de verdad: `apps/api/src/modules/` (34
directorios) y `apps/admin/app/` — correr `ls apps/api/src/modules` siempre da
la lista completa y actualizada, más confiable que cualquier checklist a mano.

**CRM núcleo:** `contacts`, `companies`, `deals`, `pipelines`, `leads`,
`clients` (vistas filtradas de contactos), `activities` (notas/tareas/
llamadas/reuniones), `timeline`, `focus` (follow-ups), `custom-fields`,
`dashboard`, `reports`.

**Client Portal:** `client-auth` (sesión separada vía Clerk), `client` (vista
agregada del portal), `deliverables`, `intake` (formularios + versión
cliente), `branding` (white-label), `documents` (incl. DocuSeal). Frontend en
`apps/admin/app/portal/(app)/*` (dashboard, deliverables, documents, forms,
invoices, requests, marca) + `(auth)` (login, accept-invitation).

**Change Requests:** `change-requests` — CRUD, máquina de estados
(`ADMIN_TRANSITIONS`), historial, comentarios, decisión del cliente
(aprobar/rechazar/negociar). Ver `docs/ARCHITECTURE.md` para el detalle de la
máquina de estados.

**Finanzas:** `finance` — facturas (USD+ARS, numeración con advisory lock),
pagos, gastos, retainers, PDF con `pdfkit`. Frontend en
`apps/admin/app/admin/(dashboard)/finance/*` e `invoices/*`.

**Integraciones:** `webhooks` (Fathom + DocuSeal), `email-tracking` (pixel +
click con firma HMAC), `onboarding` (wizard post-venta de 8 pasos dentro del
Client Portal + progreso en admin — NO es un wizard público pre-venta),
`proposals` (generación con IA + PDF + vista pública por token), `calendar`
(scheduling propio, admin + público).

**Operación interna:** `library` (SOPs, plantillas, checklists),
`work-items`, `users`, `settings`, `notifications` + `notification-prefs`,
`files`, `auth`, `health`.

**Frontend — superficies bajo `apps/admin/app/`:**

- `admin/(auth)` y `admin/(dashboard)/*` — panel interno: calendar,
  change-requests, clients, companies, contacts, dashboard, deals, finance,
  follow-ups, invoices, leads, library, onboarding, operations, pipeline,
  projects, proposals, reports, settings, tasks.
- `portal/(auth)` y `portal/(app)/*` — portal del cliente.
- `portal/propuesta` — carta de propuesta pública (sin login, pensada para un
  prospecto que todavía no tiene cuenta).
- `book/*` — reserva pública del calendario (incl. `cancel`, `reschedule`).
- `p/[token]` — vista pública de propuesta por link tokenizado.

**Deuda / limitaciones conocidas** (no las repliques en código nuevo sin
revisar `docs/ARCHITECTURE.md` primero):

- En Vercel la API se deploya como bundle (`dist/server.js`, que Vercel genera con
  `build:bundle`); no se commitea ningún artefacto. Un paquete del workspace que
  exporte `.ts` tiene que quedar inlineado por tsup (`noExternal`). Tiempo real vía
  Redis pub/sub y recordatorios vía Vercel Cron — ver "Procesamiento asíncrono,
  tiempo real y deploy de la API" en `docs/ARCHITECTURE.md`.

---

## Cómo pedir ayuda a Claude Code

Para trabajar módulo por módulo de forma eficiente:

```
"Implementa el módulo de [nombre] siguiendo las convenciones
del CLAUDE.md. Lee también CRM_SYNOUS_DOCS.md sección [X]
para el contexto completo."
```

Si algo no está claro en este archivo, la fuente de verdad es
`CRM_SYNOUS_DOCS.md`.
