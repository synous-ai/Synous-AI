# Synous CRM

CRM propio para una agencia de desarrollo web, construido **desde cero** sobre PostgreSQL.
No usa ninguna librería externa de CRM: toda la lógica de negocio (pipeline, deals, portal
del cliente, facturación, change requests, propuestas con IA) está hecha a mano sobre un
stack propio.

Monorepo gestionado con **pnpm workspaces + Turborepo**.

---

## Tabla de contenidos

- [Qué incluye](#qué-incluye)
- [Stack](#stack)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Arquitectura](#arquitectura)
- [Requisitos previos](#requisitos-previos)
- [Instalación e inicialización](#instalación-e-inicialización)
- [Variables de entorno](#variables-de-entorno)
- [Puertos en desarrollo](#puertos-en-desarrollo)
- [Comandos útiles](#comandos-útiles)
- [CI](#ci)
- [Deployment](#deployment)
- [Módulos de la API](#módulos-de-la-api)
- [Integraciones externas](#integraciones-externas)
- [Convenciones de código](#convenciones-de-código)
- [Documentación adicional](#documentación-adicional)

---

## Qué incluye

El producto cubre el ciclo completo de la agencia, de lead frío a cliente facturado:

- **Auth 100% Clerk (admin y portal del cliente)** — no hay JWT propio de sesión: el token de Clerk se verifica y se resuelve `hub_user` (admin) o `client_account` (cliente) por `clerk_user_id`; se distinguen por `publicMetadata.userType` ('admin' | 'client') + lookup en DB. Roles del admin: `owner` / `member` / `collaborator` / `viewer`. El alta de un cliente se vincula a su cuenta de Clerk vía invitación (`accept-invitation`) + `client-account-linking` (ID-first por `publicMetadata.clientAccountId`, con fallback por email exacto).
- **Pipeline de ventas** — contactos, empresas, deals, pipelines y etapas con historial de cambios.
- **Calendario / Scheduling propio (estilo Calendly)** — tipos de evento, disponibilidad con rangos múltiples y date overrides, motor de slots con timezones/DST, página pública de reserva (`/book`), emails de confirmación/cancelación y anti-doble-booking a nivel DB.
- **Onboarding post-venta** — wizard de 8 pasos (firma, brief, materiales) dentro del Client Portal, autenticado con `client_account`. Al completarse mueve el deal al pipeline "Producción" (`moveDealToProduction`).
- **Propuestas con IA** — generación de propuestas estructuradas (Gemini/Claude) con PDF y vista pública por token.
- **Portal del cliente** — login separado, intake forms, archivos, deliverables, change requests y white-label.
- **Change requests** — solicitudes de cambio de alcance con ítems, adjuntos, historial, comentarios y aprobación del cliente.
- **Finanzas multimoneda (USD + ARS)** — facturas, cobros, gastos y retainers (MRR) con tipo de cambio congelado por movimiento (dolarapi), estados derivados, resumen con KPIs/gráficos y PDF de factura (generado localmente con `pdfkit`).
- **Operación diaria** — actividades tipadas (notas, tareas, llamadas, reuniones), follow-ups, focus, timeline unificado, reportes y dashboard.
- **Notificaciones en tiempo real** — REST + WebSocket, con preferencias por canal.
- **Email tracking** — pixel de apertura + redirect de clicks.
- **Integraciones de reuniones** — webhook de Fathom (summary, transcript, action items).

> El detalle funcional completo está en [`CRM_SYNOUS_DOCS.md`](./CRM_SYNOUS_DOCS.md).
> Las convenciones de código y reglas de negocio críticas están en [`CLAUDE.md`](./CLAUDE.md).

---

## Stack

| Capa                | Tecnología                                                |
| ------------------- | --------------------------------------------------------- |
| Runtime             | Node.js 20+ · TypeScript estricto                         |
| Monorepo            | pnpm workspaces + Turborepo                               |
| API                 | Fastify 5 + Zod (`fastify-type-provider-zod`)             |
| ORM                 | Drizzle ORM                                               |
| Base de datos       | PostgreSQL 16                                             |
| Auth (admin)        | **Clerk** — identidad federada (`@clerk/nextjs` + `@clerk/backend` `verifyToken` → `hub_user` por `clerk_user_id`) |
| Auth (portal cliente)| **Clerk** — misma app que el admin, sin JWT propio; distinguido por `publicMetadata.userType='client'` → `client_account` por `clerk_user_id` |
| Jobs / Queue        | BullMQ + Redis                                            |
| WebSockets          | `@fastify/websocket`                                      |
| Docs API            | OpenAPI 3 vía `@fastify/swagger` (`/docs`)                |
| PDF                 | `pdfkit` (propuestas y facturas, renderizado local sin servicio externo) |
| IA                  | Anthropic SDK (Claude) · `@google/genai` (Gemini / Vertex AI) |
| Frontend            | Next.js 14 (App Router) + TypeScript                      |
| Estilos             | Tailwind CSS + shadcn/ui (Radix) + Framer Motion          |
| Estado / Datos      | Zustand + TanStack Query + TanStack Table                 |
| Formularios         | React Hook Form + Zod                                     |
| Kanban / Drag & Drop| `@dnd-kit/core`                                           |
| Gráficas            | Recharts                                                  |
| Timezones (calendario)| `date-fns-tz` — cálculo de slots DST-safe (almacena UTC) |
| Fondos WebGL        | `ogl` — ReactBits *SideRays* (onboarding + presentación de propuestas) |
| Emails              | `resend` — cliente lazy (skip+log si falta API key)      |
| Testing             | Vitest + Supertest                                        |

---

## Estructura del repositorio

```
apps/
  api/                 → Fastify + Drizzle + PostgreSQL (34 módulos de dominio)
  admin/               → Next.js — incluye:
                           · panel de administración  → /admin
                           · portal del cliente       → /portal (incluye el wizard
                             de onboarding post-venta y la propuesta pública en
                             /portal/propuesta)
                           · reserva pública de calendario → /book
                           · vista pública de propuesta → /p/[token]
packages/
  shared/              → @synous/shared — tipos y utilidades compartidas
  api-client/          → @synous/api-client — cliente HTTP tipado (auth + auto-refresh)
services/
  whatsapp-gateway/    → Gateway open-wa (NO está en el workspace pnpm — servicio aislado)
docs/
  schema.sql           → referencia del esquema de base de datos
docker-compose.dev.yml → Postgres + Redis para desarrollo
```

> **Nota:** el portal del cliente **no es una app separada**. Vive dentro de `apps/admin`
> bajo la ruta `/portal`, con su propio tema y su propio login — pero autenticado con
> **Clerk**, igual que el admin (no hay JWT propio de sesión). La ruta pública de reserva
> del calendario vive en `/book` (también dentro de `apps/admin`, sin auth).

### Estructura interna de la API

```
apps/api/src/
  app.ts          → buildApp(): registra plugins Fastify y todas las rutas
  server.ts       → entrypoint único: listen + worker de recordatorios (BullMQ) en modo
                    long-running; en Vercel se deploya bundleado (dist/server.js) y sin
                    worker (ver Deployment)
  config/env.ts   → validación Zod de variables de entorno (fail-fast al arrancar)
  db/
    index.ts      → conexión Drizzle: node-postgres en local/self-hosted, driver
                    serverless de Neon cuando `DATABASE_URL` apunta a Neon (necesario
                    para soportar `db.transaction()`, que `neon-http` no ofrece)
    schema/       → un archivo por dominio. Incluye dos archivos LEGACY sin
                    consumidores (`setter.ts`, `prospecting.ts`) de una feature de
                    agente de ventas por WhatsApp que fue eliminada del código —
                    quedan solo para no romper migraciones ya aplicadas
    migrations/   → migraciones SQL (0000–0038), forward-only — nunca editar a mano
                    ni usar `db:push` en producción. Ver `docs/ARCHITECTURE.md` para
                    el detalle de la migración 0038 (soft-delete de document/
                    deliverable + UNIQUE de numeración de factura) y el chequeo
                    previo obligatorio antes de deployarla
    seed.ts       → seed inicial · seed-portal-demo.ts → datos demo de un portal
  scripts/        → one-offs: migrate-users-to-clerk / migrate-clients-to-clerk
                    (import a Clerk), set-clerk-user-types (publicMetadata.userType),
                    create-admin (alta de admin), set-portal-timezone,
                    migrate-processes-to-library (procesos → SOPs, idempotente)
  lib/            → errors (AppError), mailer (Resend, lanza si Resend rechaza el
                    envío), clerk-auth (verify + resolveHubUser/resolveClientAccount),
                    portal-access (guardias de FK por tenant), portal-url (URLs del
                    portal, siempre desde ADMIN_URL, nunca de headers del request),
                    notification-bus (Redis pub/sub por portal; en proceso sin REDIS_URL), pagination, money, fx, etc.
  middleware/     → authenticate (hub_user vía Clerk) · authenticate-client (client_account vía Clerk) · authorize
  jobs/           → colas y workers BullMQ (reminders) — solo en modo long-running;
                    en Vercel el mismo scan lo dispara Vercel Cron vía
                    modules/cron (ver `docs/ARCHITECTURE.md`)
  modules/        → 34 módulos de dominio (ver más abajo)
```

### Estructura interna del admin

```
apps/admin/
  app/            → rutas Next.js App Router
    page.tsx           → landing pública de Synous
    p/[token]/         → vista pública de propuesta (link tokenizado)
    book/              → reserva pública del calendario (slug del event type + cancel/reschedule)
    admin/             → panel interno (login Clerk + dashboard con todas las secciones,
                          incluido el progreso del onboarding post-venta por deal)
    portal/            → portal del cliente (login vía Clerk + app, tema propio);
                          incluye el wizard de onboarding post-venta (8 pasos) y
                          `/portal/propuesta`, la carta de propuesta pública (sin
                          login) para un prospecto que todavía no tiene cuenta
  components/      → componentes por dominio (deals, contacts, finance, ui shadcn, …)
  lib/            → hooks (data layer con TanStack Query), store Zustand, api client
  portal-lib/     → librería propia del portal del cliente y del wizard de onboarding
```

---

## Arquitectura

> Esto es un resumen operativo (cómo se ve un módulo, cómo pega el frontend a la API).
> Para el modelo de auth/multi-tenant, los flujos de negocio (activación del portal,
> firma de DocuSeal, numeración de facturas), las integraciones externas con sus
> timeouts/idempotencia, el tiempo real y los recordatorios en Vercel, y las
> limitaciones conocidas, ver [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

**Backend.** Cada módulo de la API sigue la misma estructura por capas:

```
src/modules/<nombre>/
  *.router.ts   → rutas Fastify + validación Zod (entrada y salida)
  *.service.ts  → lógica de negocio y acceso a DB
  *.schema.ts   → schemas Zod de request/response
  *.types.ts    → tipos TypeScript del módulo
```

Reglas transversales: respuestas siempre como `{ data, meta? }` o `{ error: { code, message } }`;
errores con `AppError(code, message, statusCode)`; paginación por cursor; soft-delete
(`archived = true`, nunca `DELETE`); cada cambio de campo en una entidad núcleo se registra en
`record_history`.

**Frontend.** El admin no usa container/presentational explícito; el patrón real es
**domain-sliced + hooks como data layer**:

- `components/<dominio>/` → componentes presentacionales por dominio.
- `lib/hooks/<dominio>.ts` → todo el data fetching con TanStack Query (`useQuery` / `useMutation`).
- auth → **Clerk** (`@clerk/nextjs`) en ambos lados: el `ClerkProvider` envuelve la app y el `clerkMiddleware` protege `/admin/*` y `/portal/(app)/*`. El portal del cliente ya no mantiene un store de sesión propio; el alta se resuelve por invitación de Clerk + vínculo a `client_account` (`client-account-linking`).
- `components/ui/` → primitivos shadcn/ui.

**Cliente HTTP.** `packages/api-client` expone una factory `createApiClient()` que
añade el `Authorization: Bearer`, maneja el envelope `{ data, meta }` y, ante un 401,
ejecuta `onAuthFailure`. El `getToken` es async en ambos lados: tanto el admin como el
portal del cliente leen el token de sesión de Clerk (`window.Clerk.session.getToken()`).

---

## Requisitos previos

- **Node.js** ≥ 20
- **pnpm** ≥ 11 (`npm install -g pnpm`)
- **Docker** + Docker Compose (para Postgres y Redis)

---

## Instalación e inicialización

### 1. Clonar e instalar dependencias

```bash
git clone https://github.com/jeremiasingla/CRMDev.git
cd CRMDev
pnpm install
```

### 2. Configurar variables de entorno

La API valida sus variables con Zod al arrancar y **falla rápido** si falta alguna requerida.
Creá `apps/api/.env` (ver [Variables de entorno](#variables-de-entorno)).

> El `.env` está en `.gitignore` y **nunca** debe subirse al repositorio.

### 3. Levantar la infraestructura (Postgres + Redis)

```bash
docker compose -f docker-compose.dev.yml up -d
```

| Servicio   | Contenedor        | Puerto host |
| ---------- | ----------------- | ----------- |
| PostgreSQL | `devduo_postgres` | `5433`      |
| Redis      | `devduo_redis`    | `6379`      |

> Postgres se mapea al **5433** del host (contenedor 5432) para evitar conflictos con un Postgres local.

### 4. Migraciones y seed

```bash
pnpm --filter api db:migrate         # aplicar migraciones pendientes
pnpm --filter api db:seed            # cargar datos iniciales
pnpm --filter api db:seed:portal-demo # (opcional) datos demo de un portal
```

### 5. Levantar el entorno de desarrollo

```bash
# Todas las apps del workspace en paralelo (Turborepo)
pnpm dev

# O cada una por separado:
pnpm --filter api dev     # API        → http://localhost:3001
pnpm --filter admin dev   # Admin + portal cliente → http://localhost:3000
```

> El **gateway de WhatsApp** (`services/whatsapp-gateway`) es un servicio aislado que
> **no forma parte del workspace pnpm**. Se levanta aparte; ver su propio
> [`README`](./services/whatsapp-gateway/README.md).

---

## Variables de entorno

La API valida sus variables con Zod en `apps/api/src/config/env.ts` — esa es la fuente de
verdad, no este README. Solo **dos** son requeridas para que arranque (fail-fast): `DATABASE_URL`
y `ACCESS_TOKEN_SECRET`. Todas las demás son opcionales o tienen default: su ausencia **no**
rompe el arranque, apaga la feature correspondiente en silencio.

```bash
# ── Entorno ────────────────────────────────────────────────
NODE_ENV=development
PORT=3001

# ── Base de datos (REQUERIDO) ──────────────────────────────
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/nous

# ── Redis (opcional — sin esto no corren los workers BullMQ ni hay fan-out de
#    notificaciones en tiempo real entre instancias) ─
REDIS_URL=redis://localhost:6379

# ── Vercel Cron (producción) — sin esto GET /api/cron/reminders responde 503 ─
CRON_SECRET=

# ── Clerk — auth de SESIÓN, admin y portal del cliente ──────
# Ambos se federan por clerk_user_id; no hay JWT propio de sesión en ningún lado.
# Requerida en la PRÁCTICA en producción (sin ella verifyToken falla siempre y
# nadie autentica), pero el schema le da default '' para no romper boot/tests en local.
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SIGNING_SECRET=whsec_...   # opcional — declarada en env.ts pero hoy
                                          # SIN ruta de webhook registrada que la consuma
# En apps/admin/.env.local además: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_... + CLERK_SECRET_KEY

# ── ACCESS_TOKEN_SECRET (REQUERIDO, mínimo 32 caracteres) ──
# NO es de sesión — firma tokens de NEGOCIO puntuales: booking (cancel/reschedule
# en calendar.service.ts) y la firma HMAC de los links de click-tracking
# (email-tracking.service.ts). La auth de sesión (admin y cliente) es 100% Clerk.
# Generá un secreto fuerte: openssl rand -base64 48
ACCESS_TOKEN_SECRET=cambiar_por_un_secreto_de_al_menos_32_caracteres

# ── URLs de las apps (opcional pero fuertemente recomendado en prod) ──
# ADMIN_URL es la base de TODOS los links que salen en emails (booking, invitación
# al portal) — sin ella, en producción, esos links apuntan a localhost.
ADMIN_URL=http://localhost:3000
CLIENT_PORTAL_URL=http://localhost:3002   # hoy solo un origin extra de CORS (legacy)
API_URL=http://localhost:3001
PUBLIC_API_URL=http://localhost:3001      # base del pixel/link de email tracking
ALLOWED_ORIGINS=                          # orígenes CORS extra, separados por coma
TENANT_ROOT_DOMAIN=                       # dominio raíz de subdominios de tenant (ej. synousai.com)

# ── Emails — Resend (opcional; sin API key se omite el envío con log) ──
RESEND_API_KEY=
FROM_EMAIL=

# ── Webhooks externos (opcional — sin secret el webhook responde 401) ─
FATHOM_WEBHOOK_SECRET=

# ── IA: qué proveedor usan propuestas y sugerencia de próxima acción ──
MODEL_PROVIDER=gemini   # 'gemini' | 'claude'
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=
VERTEX_LOCATION=
VERTEX_MODEL=
GOOGLE_SERVICE_ACCOUNT_JSON=

# ── DocuSeal (firma de contratos y propuestas) ──────────────
# Sin DOCUSEAL_API_KEY los endpoints responden 503; sin el webhook secret,
# el webhook responde 401 a todo. DOCUSEAL_URL (app pública, de donde sale el
# link de firma) y DOCUSEAL_API_URL (API REST) son hosts DISTINTOS en cloud.
DOCUSEAL_URL=https://docuseal.com
DOCUSEAL_API_URL=https://api.docuseal.com
DOCUSEAL_API_KEY=
DOCUSEAL_WEBHOOK_SECRET=

# ── Onboarding post-venta: asignación automática de responsable ────
PRODUCTION_ASSIGNEE_DIAGNOSTICO_EMAIL=
PRODUCTION_ASSIGNEE_DEFAULT_EMAIL=

# ── Alta automática de subdominio de tenant en Vercel (opcional) ───
VERCEL_API_TOKEN=
VERCEL_PROJECT_ID=
VERCEL_TEAM_ID=

# ── Archivos — Vercel Blob (ver docs/STORAGE.md) ────────────
# Sin ninguna de las dos, en local se usa disco (apps/api/uploads/). En
# NODE_ENV=production sin credenciales, las subidas responden 503 en vez de
# escribir al disco efímero de la Function. Solo en el proyecto de la API:
# nunca en el admin ni bajo NEXT_PUBLIC_*.
BLOB_READ_WRITE_TOKEN=     # la agrega Vercel al conectar el store (Production/Preview)
BLOB_STORE_ID=             # alternativa OIDC sin secreto de larga vida; tiene precedencia
BLOB_WEBHOOK_PUBLIC_KEY=   # opcional; hoy no se usan callbacks de subida
```

En `apps/admin` (Next.js), además: `NEXT_PUBLIC_ADMIN_URL`, `NEXT_PUBLIC_APP_URL`,
`NEXT_PUBLIC_ROOT_DOMAIN` — no están validadas con Zod (son del lado del front), así que su
ausencia no se detecta al arrancar.

### Variables cuya ausencia rompe algo en producción sin avisar

Ninguna de estas hace fallar el arranque, pero producción sin ellas queda roto de un modo que
no se ve como error:

| Variable | Qué se rompe si falta |
| --- | --- |
| `CLERK_SECRET_KEY` | Nadie puede loguearse (`verifyToken` falla en cada request) |
| `RESEND_API_KEY` | No sale ningún email — se loguea y se omite en silencio |
| `ADMIN_URL` | Los links de los emails apuntan a `localhost:3000` |
| `PUBLIC_API_URL` | Los links de tracking apuntan a `localhost:3001` |
| `DOCUSEAL_API_KEY` + `DOCUSEAL_WEBHOOK_SECRET` | El flujo de firma y la activación automática del portal por contrato quedan rotos |
| `BLOB_READ_WRITE_TOKEN` (o `BLOB_STORE_ID`) | No falla en silencio: subidas y descargas responden `503 STORAGE_NOT_CONFIGURED` |

Detalle completo (incl. variables no documentadas hasta ahora en `.env.example`) en
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md#deploy-y-migraciones).

---

## Puertos en desarrollo

| App / Servicio          | URL                              |
| ----------------------- | -------------------------------- |
| API                     | http://localhost:3001            |
| Docs API (Swagger)      | http://localhost:3001/docs (solo fuera de `NODE_ENV=production`) |
| Admin + portal cliente  | http://localhost:3000            |
| PostgreSQL              | localhost:5433                   |
| Redis                   | localhost:6379                   |
| WhatsApp Gateway (aparte)| http://localhost:8002           |

---

## Comandos útiles

### Raíz (Turborepo)

```bash
pnpm dev         # todas las apps en paralelo
pnpm build       # build de producción
pnpm test        # todos los tests
pnpm lint        # lint del monorepo
pnpm typecheck   # type-check del monorepo
```

### Base de datos (workspace `api`)

```bash
pnpm --filter api db:generate   # generar migración tras cambiar el schema Drizzle
pnpm --filter api db:migrate    # aplicar migraciones pendientes
pnpm --filter api db:push       # push directo del schema (solo dev)
pnpm --filter api db:studio     # abrir Drizzle Studio
pnpm --filter api db:seed       # datos iniciales
```

> El schema de Drizzle vive en `apps/api/src/db/schema/`.
> Nunca editar manualmente los archivos en `apps/api/src/db/migrations/`.

### Testing

```bash
pnpm --filter api test          # solo la API
pnpm --filter api test:watch    # watch mode
pnpm --filter api test:coverage # con cobertura
```

---

## CI

`.github/workflows/ci.yml` corre en cada pull request y en cada push a `main`, y es el
gate antes de mergear:

- **API**: typecheck, migraciones y tests de integración contra un Postgres 16 de
  servicio, y build del bundle que deploya Vercel (`dist/server.js`, verificando que
  `@synous/shared` quede inlineado).
- **Admin**: typecheck, lint (`next lint`, config en `apps/admin/.eslintrc.json`) y build.

Localmente: `pnpm typecheck`, `pnpm --filter api test`, `pnpm --filter admin lint` y
`pnpm --filter admin build`. El CI valida pero no despliega ni migra producción.

---

## Deployment

- **API** — se despliega en Vercel con el preset zero-config de Fastify, como una sola
  Function. `apps/api/vercel.json` le indica a Vercel que corra `pnpm run build:bundle`
  (tsup) y use `dist/server.js` como entrypoint: el bundle se genera en cada deploy y
  **no se commitea**. Es el mismo `src/server.ts` de `pnpm dev`; con `VERCEL` definido
  no arranca el worker de BullMQ ni instala handlers de señales. Por qué bundle y no el
  `.ts` directo, checklist de verificación y rollback en
  [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md#procesamiento-asíncrono-tiempo-real-y-deploy-de-la-api).
- **Admin** (`apps/admin`) — build estándar de Next.js.
- **Tiempo real y recordatorios** — `/ws/notifications` reparte eventos entre instancias
  vía Redis pub/sub (`REDIS_URL`, Redis del Marketplace de Vercel) y los recordatorios
  corren por Vercel Cron (`GET /api/cron/reminders` una vez por día, protegido con
  `CRON_SECRET`). Los WebSockets de Vercel están en beta y cortan la conexión a la
  duración máxima de la Function: la campana del admin reconecta sola.
- Migraciones Drizzle son forward-only; antes de deployar una que agregue un
  `UNIQUE` sobre datos existentes, correr el chequeo de duplicados correspondiente
  (ver [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md#deploy-y-migraciones)).

---

## Módulos de la API

La API expone 34 módulos de dominio en `apps/api/src/modules/` — la lista de abajo
resume qué hace cada uno; `ls apps/api/src/modules` siempre da el inventario exacto y
actualizado:

| Módulo               | Qué hace                                                                       |
| -------------------- | ------------------------------------------------------------------------------ |
| `auth`               | Auth del equipo (`hub_user`) vía **Clerk**: `verifyToken` + lookup por `clerk_user_id` (mantiene `request.hubUser`); endpoint `/me` |
| `users`              | Gestión del equipo: CRUD y roles                                               |
| `contacts`           | CRUD de contactos + sugerencia de próxima acción con IA                        |
| `companies`          | CRUD de empresas vinculadas a contactos y deals                                |
| `deals`              | CRUD de deals + cambios de etapa con lógica de negocio (`stage.service`)       |
| `pipelines`          | CRUD de pipelines y sus etapas (orden, probabilidad)                           |
| `leads` / `clients`  | Vistas filtradas de contactos por etapa (lead / cliente)                       |
| `activities`         | Notas, tareas, llamadas y reuniones tipadas                                    |
| `timeline`           | Timeline unificado de actividad de un deal o contacto                          |
| `focus`              | Follow-ups: tareas vencidas/hoy, deals sin próxima acción o sin actividad      |
| `dashboard`          | Métricas y resumen del portal                                                  |
| `reports`            | Reportes de gestión: embudo, riesgo, conversión, cerrados/ganados              |
| `onboarding`         | Wizard de onboarding **post-venta** (8 pasos: firma, brief, materiales) dentro del Client Portal + progreso/routing en admin. Al completarse mueve el deal al pipeline "Producción" |
| `proposals`          | Generación de propuestas con IA + PDF (pdfkit) + vista pública por token       |
| `change-requests`    | Solicitudes de cambio de alcance (ítems, adjuntos, historial, comentarios) con máquina de estados server-side y decisión del cliente solo en estados `sent`/`negotiating` |
| `deliverables`       | Entregables asociados a deals con estado (soft-delete desde la migración `0038`) |
| `documents`          | Documentos vinculados a deals + cliente HTTP real de DocuSeal (firma de contratos/propuestas) |
| `finance`            | Facturas (numeración con advisory lock), ítems, pagos, gastos, retainers y PDF de factura (`pdfkit`) |
| `intake`             | Formularios de onboarding asignables a deals (admin + cliente)                 |
| `client`             | Vista del portal del cliente (deal, files, intakes, CRs, branding)             |
| `client-auth`        | Sesión del portal del cliente vía **Clerk**: `verifyToken` + lookup por `clerk_user_id` en `client_account`; endpoint `/me`. El alta se resuelve por invitación de Clerk + `client-account-linking` |
| `branding`           | White-label por cliente (logo, nombre, colores)                                |
| `files`              | Autorización de lectura por recurso (`files.authz.ts`), `POST /api/files/access` (URL presignada de 5 min) y rutas públicas de logos. Los bytes nunca pasan por la API — ver [`docs/STORAGE.md`](./docs/STORAGE.md) |
| `uploads`            | Subidas en tres pasos: intent validado por purpose, token presignado para subir directo a Vercel Blob, y `claimUpload` en el endpoint de dominio (ownership por actor + portal + purpose). Tabla `file_upload` |
| `library`            | Biblioteca interna: documentos, plantillas, contratos/propuestas base, doc técnica y la entidad operativa **Procesos y checklists** (`type='sop'` con `kind: 'procedure' \| 'checklist'`, `steps[]` ordenados + `owner`). Es REFERENCIA pura, sin estado de ejecución (el "tildar" para un caso vive en Tareas/Proyecto) |
| `work-items`         | Items de trabajo interno (bugs, mejoras, roadmap) — los procesos se movieron a Biblioteca |
| `calendar`           | Scheduling estilo Calendly: event types, schedules (rangos múltiples + date overrides), motor de slots con timezones/DST (`slots.service`), reserva pública (`/api/public/calendar/*`), emails (Resend), cancel/reschedule por token y anti-doble-booking (`EXCLUDE USING gist`) |
| `notifications`      | Notificaciones en tiempo real (REST + WebSocket)                               |
| `notification-prefs` | Preferencias de notificación por tipo/canal                                    |
| `custom-fields`      | Campos personalizables por entidad                                             |
| `settings`           | Ajustes globales del portal                                                    |
| `email-tracking`     | Pixel de apertura + redirect de clicks firmado con HMAC (`ACCESS_TOKEN_SECRET`) para evitar open-redirect |
| `webhooks`           | Webhook de Fathom (HMAC-SHA256) → enriquece reuniones · webhook de DocuSeal (token fijo) → estado de firma + activación del Client Portal |
| `health`             | Health check de la API                                                         |

---

## Integraciones externas

| Servicio                  | Estado          | Uso                                                                  |
| ------------------------- | --------------- | -------------------------------------------------------------------- |
| **Clerk**                 | ✅ Conectada     | Auth de sesión de admin (`hub_user`) y portal de cliente (`client_account`); ambos federados por `clerk_user_id`, sin JWT propio de sesión |
| **Anthropic (Claude) / Google GenAI (Gemini/Vertex)** | ✅ Conectada | Generación de propuestas y sugerencia de próxima acción, con timeout de 30s y fallback logueado; `MODEL_PROVIDER` elige el proveedor activo |
| **DocuSeal**               | ✅ Conectada     | Cliente HTTP real (`docuseal.client.ts`) + webhook (`/webhooks/docuseal`) — firma de contratos/propuestas y activación automática del Client Portal. Guarda solo `docuseal_submission_id`; la URL del PDF firmado expira a los 40 min y se pide en el momento |
| **Fathom**                | ✅ Conectada     | Webhook receptor HMAC-SHA256 (summary, transcript, action items de reuniones) |
| **pdfkit**                | ✅ Conectada     | PDF de propuestas y de facturas, renderizado local (sin Chromium ni servicio externo) |
| **Redis**                 | ⚠️ Parcial       | Fan-out de `/ws/notifications` entre instancias vía pub/sub (sin `REDIS_URL` el bus queda en memoria). BullMQ solo en el proceso long-running local; en Vercel los recordatorios corren con Vercel Cron (`/api/cron/reminders`) |
| **Vercel Blob**           | ✅ Conectada     | Store privado `synous-ai-files` (Production y Preview). Subida y descarga directas desde el browser con tokens/URLs presignadas; disco local en dev. Ver [`docs/STORAGE.md`](./docs/STORAGE.md) |
| **Resend (emails)**       | ✅ Conectada     | Emails de booking e invitación al portal; cliente lazy — sin `RESEND_API_KEY` omite el envío y loguea, y si Resend rechaza el envío `sendEmail` lanza en vez de tragarse el error |
| **ReactBits SideRays (`ogl`)** | ✅ Conectada | Fondo WebGL animado del onboarding y la presentación de propuestas   |

> El **gateway de WhatsApp** (`services/whatsapp-gateway`, basado en `@open-wa/wa-automate`)
> sigue en el repo como servicio aislado (no está en el workspace pnpm), pero hoy **no lo
> consume ningún módulo de la API** — era el canal de un agente de ventas por WhatsApp
> ("Setter") que fue eliminado del código. Antes de reactivarlo, confirmar si sigue siendo
> necesario o es candidato a borrar junto con `services/whatsapp-gateway`.

---

## Convenciones de código

Resumen — el detalle completo está en [`CLAUDE.md`](./CLAUDE.md):

- **Nombrado:** archivos `kebab-case`, funciones/variables `camelCase`, tablas/columnas `snake_case`,
  schemas Zod con sufijo `Schema`, tipos con sufijo `DTO`/`Type`, componentes React `PascalCase`.
- **TypeScript:** `strict: true`, cero `any` implícitos, returns async tipados explícitamente.
- **API:** todo endpoint valida con Zod; errores con `AppError`; respuestas `{ data, meta? }` / `{ error }`.
- **DB:** operaciones multi-tabla en `db.transaction()`; merge JSONB con `||` **solo** sobre la columna `custom`;
  nunca borrar en entidades núcleo (soft-delete `archived = true`, con `note`/`task` como excepción conocida —
  ver `CLAUDE.md`); historial en `record_history`; siempre filtrar `archived = false`.
- **Seguridad:** admin (`hub_user`) y portal del cliente (`client_account`) se autentican con **Clerk**, pero son resoluciones completamente separadas (tablas y middlewares distintos); un cliente nunca accede a rutas del admin.
- **Comentarios:** siempre en español; explican el **qué** y el **porqué**, no el cómo obvio.

---

## Documentación adicional

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — arquitectura: modelo de auth/multi-tenant, flujos de negocio, integraciones, procesamiento asíncrono y limitaciones conocidas.
- [`CLAUDE.md`](./CLAUDE.md) — convenciones de código y reglas de negocio críticas.
- [`CRM_SYNOUS_DOCS.md`](./CRM_SYNOUS_DOCS.md) — documentación funcional completa del producto.
- [`docs/schema.sql`](./docs/schema.sql) — referencia del esquema de base de datos.
- [`services/whatsapp-gateway/README.md`](./services/whatsapp-gateway/README.md) — gateway de WhatsApp (hoy sin consumidor activo en la API).
