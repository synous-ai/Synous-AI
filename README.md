# NOUS CRM

CRM propio para una agencia de desarrollo web, construido **desde cero** sobre PostgreSQL.
No usa ninguna librería externa de CRM: toda la lógica de negocio (pipeline, deals, portal
del cliente, facturación, change requests, propuestas, agente de ventas con IA) está hecha
a mano sobre un stack propio.

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
- [Módulos de la API](#módulos-de-la-api)
- [Integraciones externas](#integraciones-externas)
- [Convenciones de código](#convenciones-de-código)
- [Documentación adicional](#documentación-adicional)

---

## Qué incluye

El producto cubre el ciclo completo de la agencia, de lead frío a cliente facturado:

- **Auth unificada con Clerk** — admin y portal del cliente se autentican con **Clerk** (una sola app, identidad federada): el token se verifica y se resuelve `hub_user` (admin) o `client_account` (cliente) por `clerk_user_id`; se distinguen por `publicMetadata.userType` ('admin' | 'client') + lookup en DB. Roles del admin: `owner` / `member` / `collaborator` / `viewer`.
- **Pipeline de ventas** — contactos, empresas, deals, pipelines y etapas con historial de cambios.
- **Calendario / Scheduling propio (estilo Calendly)** — tipos de evento, disponibilidad con rangos múltiples y date overrides, motor de slots con timezones/DST, página pública de reserva (`/book`), emails de confirmación/cancelación y anti-doble-booking a nivel DB.
- **Onboarding pre-venta** — wizard público tokenizado que pre-carga el lead y crea/reusa su deal.
- **Propuestas con IA** — generación de propuestas estructuradas (Gemini/Claude) con PDF y vista pública por token.
- **Portal del cliente** — login separado, intake forms, archivos, deliverables, change requests y white-label.
- **Change requests** — solicitudes de cambio de alcance con ítems, adjuntos, historial, comentarios y aprobación del cliente.
- **Finanzas multimoneda (USD + ARS)** — facturas, cobros, gastos y retainers (MRR) con tipo de cambio congelado por movimiento (dolarapi), estados derivados, resumen con KPIs/gráficos y PDF de factura.
- **Agente de ventas IA ("Setter")** — agente conversacional por WhatsApp (modos shadow / hybrid / autopilot) con cerebro LLM, aprobación humana y sincronización con el CRM.
- **Prospección** — búsqueda de negocios vía Google Places + análisis con Vertex AI y autopilot programado.
- **Operación diaria** — actividades tipadas (notas, tareas, llamadas, reuniones), follow-ups, focus, timeline unificado, reportes y dashboard.
- **Notificaciones en tiempo real** — REST + WebSocket, con preferencias por canal.
- **Email tracking** — pixel de apertura + redirect de clicks.
- **Integraciones de reuniones** — webhook de Fathom (summary, transcript, action items).

> El detalle funcional completo está en [`CRM_NOUS_DOCS.md`](./CRM_NOUS_DOCS.md).
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
| Auth (portal cliente)| **Clerk** — misma app que el admin, distinguido por `publicMetadata.userType='client'` → `client_account` por `clerk_user_id` |
| Jobs / Queue        | BullMQ + Redis                                            |
| WebSockets          | `@fastify/websocket`                                      |
| Docs API            | OpenAPI 3 vía `@fastify/swagger` (`/docs`)                |
| PDF                 | `pdfkit` (propuestas) · `easyinvoice` (facturas)          |
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
  api/                 → Fastify + Drizzle + PostgreSQL (35 módulos de dominio)
  admin/               → Next.js — incluye:
                           · panel de administración  → /admin
                           · portal del cliente       → /portal
                           · wizard de onboarding      → /onboarding (público)
                           · vista pública de propuesta → /p/[token]
packages/
  shared/              → @nous/shared — tipos y utilidades compartidas
  api-client/          → @nous/api-client — cliente HTTP tipado (auth + auto-refresh)
services/
  whatsapp-gateway/    → Gateway open-wa (NO está en el workspace pnpm — servicio aislado)
docs/
  schema.sql           → referencia del esquema de base de datos
docker-compose.dev.yml → Postgres + Redis para desarrollo
```

> **Nota:** el portal del cliente **no es una app separada**. Vive dentro de `apps/admin`
> bajo la ruta `/portal`, con su propio tema y su propio login con **JWT propio** — distinto
> del admin, que se autentica con **Clerk**. La ruta pública de reserva del calendario vive
> en `/book` (también dentro de `apps/admin`, sin auth).

### Estructura interna de la API

```
apps/api/src/
  app.ts          → buildApp(): registra plugins Fastify y todas las rutas
  server.ts       → start(): listen + arranque de workers (reminders, setter, prospecting)
  config/env.ts   → validación Zod de variables de entorno (fail-fast al arrancar)
  db/
    index.ts      → conexión Drizzle + pg
    schema/       → un archivo por dominio (~27 archivos)
    migrations/   → migraciones SQL (0000–0024) — nunca editar a mano (salvo backfill
                    de datos tras `db:generate`). Incluye 0015 (`clerk_user_id` en
                    hub_user), 0016 (calendario: schedules / event types / bookings +
                    `EXCLUDE USING gist` anti-overlap), 0017 (finanzas multimoneda:
                    `expense`/`retainer` + `currency`/`exchange_rate`/`amount_base` en
                    invoice/payment), 0022 (`steps` jsonb + `owner_id` en library_item),
                    0023 (`kind` en library_item: SOP y Checklist consolidados) y
                    0024 (rol `collaborator` en hub_user)
    seed.ts       → seed inicial · seed.setter.ts → seed del agente Setter
  scripts/        → one-offs: migrate-users-to-clerk / migrate-clients-to-clerk
                    (import a Clerk), set-clerk-user-types (publicMetadata.userType),
                    create-admin (alta de admin), set-portal-timezone,
                    migrate-processes-to-library (procesos → SOPs, idempotente)
  lib/            → errors (AppError), jwt (solo portal cliente), password (bcrypt),
                    mailer (Resend), clerk-auth (verify + resolveHubUser), pagination, money, etc.
  middleware/     → authenticate (hub_user vía Clerk) · authenticate-client (JWT portal) · authorize
  jobs/           → colas y workers BullMQ (reminders)
  modules/        → 35 módulos de dominio (ver más abajo)
```

### Estructura interna del admin

```
apps/admin/
  app/            → rutas Next.js App Router
    page.tsx           → landing pública de NOUS
    onboarding/        → wizard público pre-venta
    p/[token]/         → vista pública de propuesta (link tokenizado)
    book/              → reserva pública del calendario (slug del event type + cancel/reschedule)
    admin/             → panel interno (login Clerk + dashboard con todas las secciones)
    portal/            → portal del cliente (login JWT propio + app, tema propio)
  components/      → componentes por dominio (deals, contacts, finance, setter, ui shadcn, …)
  lib/            → hooks (data layer con TanStack Query), store Zustand, api client
  portal-lib/     → librería propia del portal del cliente y del wizard de onboarding
```

---

## Arquitectura

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
- auth admin → **Clerk** (`@clerk/nextjs`): el `ClerkProvider` envuelve la app y el `clerkMiddleware` protege `/admin/*`. El portal del cliente conserva su store Zustand con token propio.
- `components/ui/` → primitivos shadcn/ui.

**Cliente HTTP.** `packages/api-client` expone una factory `createApiClient()` que
añade el `Authorization: Bearer`, maneja el envelope `{ data, meta }` y, ante un 401,
ejecuta `onAuthFailure`. El `getToken` acepta getters **sync o async**: el admin pasa uno
async que lee el token de sesión de Clerk (`window.Clerk.session.getToken()`); el portal
del cliente pasa uno sync desde su store y refresca vía cookie httpOnly (`refreshPath`,
con deduplicación de llamadas concurrentes).

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
| PostgreSQL | `nous_postgres` | `5433`      |
| Redis      | `nous_redis`    | `6379`      |

> Postgres se mapea al **5433** del host (contenedor 5432) para evitar conflictos con un Postgres local.

### 4. Migraciones y seed

```bash
pnpm --filter api db:migrate    # aplicar migraciones pendientes
pnpm --filter api db:seed       # cargar datos iniciales
pnpm --filter api db:seed:setter # (opcional) seed del agente Setter
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

La API valida sus variables con Zod en `apps/api/src/config/env.ts`. Las **requeridas** mínimas
para desarrollo local son `DATABASE_URL`, `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET` y
`CLERK_SECRET_KEY` (auth del admin).

```bash
# ── Entorno ────────────────────────────────────────────────
NODE_ENV=development
PORT=3001

# ── Base de datos (REQUERIDO) ──────────────────────────────
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/nous

# ── Redis (opcional — sin esto los workers BullMQ se deshabilitan) ─
REDIS_URL=redis://localhost:6379

# ── Clerk — auth del ADMIN (REQUERIDO: CLERK_SECRET_KEY) ───
# El panel admin usa Clerk; los hub_user se federan por clerk_user_id.
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SIGNING_SECRET=whsec_...      # opcional — sync user.created/updated/deleted
# En apps/admin/.env.local además: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_... + CLERK_SECRET_KEY

# ── JWT — auth del PORTAL DEL CLIENTE (REQUERIDO, mínimo 32 chars c/u) ──
# Lo usa SOLO el portal del cliente (el admin ya no usa JWT propio).
# Generá secretos fuertes: openssl rand -base64 48
ACCESS_TOKEN_SECRET=cambiar_por_un_secreto_de_al_menos_32_caracteres
REFRESH_TOKEN_SECRET=cambiar_por_otro_secreto_de_al_menos_32_caracteres
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=7d

# ── URLs de las apps (opcional — emails, CORS, tracking) ───
ADMIN_URL=http://localhost:3000
CLIENT_PORTAL_URL=http://localhost:3002
API_URL=http://localhost:3001
PUBLIC_API_URL=http://localhost:3001

# ── Emails — Resend (opcional; sin API key se omite el envío con log) ──
# Lo usan los emails de booking del calendario (confirmación / cancelación).
RESEND_API_KEY=
FROM_EMAIL=
NEXT_PUBLIC_APP_URL=http://localhost:3000   # base de los links cancel/reschedule en emails

# ── Webhooks (opcional — sin secret el webhook responde 401) ─
FATHOM_WEBHOOK_SECRET=

# ── Prospección con IA (opcional) ──────────────────────────
GOOGLE_MAPS_API_KEY=
GOOGLE_SERVICE_ACCOUNT_JSON=
VERTEX_LOCATION=global
VERTEX_MODEL=gemini-3.1-pro-preview

# ── Setter AI / Claude (opcional) ──────────────────────────
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-6

# ── Setter AI / canal WhatsApp (Evolution API, opcional) ───
EVOLUTION_API_URL=
EVOLUTION_API_KEY=
EVOLUTION_INSTANCE=

# ── Booking real del Setter (opcional) ─────────────────────
GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON=
GOOGLE_CALENDAR_ID=
```

> Las variables opcionales degradan con gracia: si falta `GOOGLE_MAPS_API_KEY` la prospección
> responde `503`; sin `EVOLUTION_*` el canal de WhatsApp reporta `not_configured` sin romper el arranque.

---

## Puertos en desarrollo

| App / Servicio          | URL                              |
| ----------------------- | -------------------------------- |
| API                     | http://localhost:3001            |
| Docs API (Swagger)      | http://localhost:3001/docs       |
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

## Módulos de la API

La API expone 35 módulos de dominio en `apps/api/src/modules/`:

| Módulo               | Qué hace                                                                       |
| -------------------- | ------------------------------------------------------------------------------ |
| `auth`               | Auth del equipo (`hub_user`) vía **Clerk**: `verifyToken` + lookup por `clerk_user_id` (mantiene `request.hubUser`); endpoint `/me`. El JWT propio quedó solo para el portal del cliente |
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
| `onboarding`         | Wizard pre-venta público (submissions) + review/routing en admin              |
| `proposals`          | Generación de propuestas con IA + PDF (pdfkit) + vista pública por token       |
| `prospecting`        | Búsqueda en Google Places + análisis con Vertex AI + autopilot                 |
| `setter`             | Agente de ventas IA por WhatsApp (cerebro LLM, cola BullMQ, aprobación humana) |
| `change-requests`    | Solicitudes de cambio de alcance (ítems, adjuntos, historial, comentarios)     |
| `deliverables`       | Entregables asociados a deals con estado                                       |
| `documents`          | Documentos vinculados a deals (referencia a DocuSeal)                          |
| `finance`            | Facturas, ítems, pagos y PDF de factura (easyinvoice)                          |
| `intake`             | Formularios de onboarding asignables a deals (admin + cliente)                 |
| `client`             | Vista del portal del cliente (deal, files, intakes, CRs, branding)             |
| `client-auth`        | Autenticación separada del portal del cliente (token propio)                   |
| `branding`           | White-label por cliente (logo, nombre, colores)                                |
| `files`              | Subida/descarga de archivos (disco local, límite 25 MB)                        |
| `library`            | Biblioteca interna: documentos, plantillas, contratos/propuestas base, doc técnica y la entidad operativa **Procesos y checklists** (`type='sop'` con `kind: 'procedure' \| 'checklist'`, `steps[]` ordenados + `owner`). Es REFERENCIA pura, sin estado de ejecución (el "tildar" para un caso vive en Tareas/Proyecto) |
| `work-items`         | Items de trabajo interno (bugs, mejoras, roadmap) — los procesos se movieron a Biblioteca |
| `calendar`           | Scheduling estilo Calendly: event types, schedules (rangos múltiples + date overrides), motor de slots con timezones/DST (`slots.service`), reserva pública (`/api/public/calendar/*`), emails (Resend), cancel/reschedule por token y anti-doble-booking (`EXCLUDE USING gist`) |
| `notifications`      | Notificaciones en tiempo real (REST + WebSocket)                               |
| `notification-prefs` | Preferencias de notificación por tipo/canal                                    |
| `custom-fields`      | Campos personalizables por entidad                                             |
| `settings`           | Ajustes globales del portal                                                    |
| `email-tracking`     | Pixel de apertura + redirect de clicks                                         |
| `webhooks`           | Webhook de Fathom (HMAC-SHA256) → enriquece reuniones · webhook de **Clerk** (`user.created/updated/deleted` → sync `hub_user`) |
| `health`             | Health check de la API                                                         |

---

## Integraciones externas

| Servicio                  | Estado          | Uso                                                                  |
| ------------------------- | --------------- | -------------------------------------------------------------------- |
| **Clerk**                 | ✅ Conectada     | Auth del panel admin (identidad federada con `hub_user`) + webhook de sync |
| **Anthropic (Claude)**    | ✅ Conectada     | Provider del agente Setter, sugerencia de próxima acción, propuestas |
| **Google GenAI / Vertex** | ✅ Conectada     | Análisis de prospección y cerebro del agente Setter (Gemini)         |
| **Google Places**         | ✅ Conectada     | Búsqueda de negocios para prospección (vía axios)                    |
| **Evolution API (WhatsApp)** | ✅ Conectada  | Canal de mensajería del Setter (degrada si no está configurado)      |
| **Fathom**                | ✅ Conectada     | Webhook receptor (summary, transcript, action items de reuniones)    |
| **easyinvoice**           | ✅ Conectada     | PDF de facturas                                                      |
| **pdfkit**                | ✅ Conectada     | PDF de propuestas (server-side, sin Chromium)                        |
| **BullMQ + Redis**        | ✅ Conectada     | Workers de recordatorios y cola del Setter                           |
| **ReactBits SideRays (`ogl`)** | ✅ Conectada | Fondo WebGL animado del onboarding y la presentación de propuestas   |
| **Resend (emails)**       | ✅ Conectada     | Emails de booking del calendario (confirmación / cancelación); cliente lazy — sin `RESEND_API_KEY` omite el envío y loguea |
| **DocuSeal**              | 🟡 Solo modelado | La tabla `document` guarda los IDs de submission; falta el cliente HTTP |
| **Google Calendar (Setter/booking)** | 🟡 Pendiente | Diferido (F5): free/busy + creación de evento; el motor de slots hoy es interno |
| **Cloudflare R2 / S3**    | 🟡 Pendiente     | Hoy los archivos se guardan en disco local (`./uploads/`)            |

> El **gateway de WhatsApp** (`services/whatsapp-gateway`, basado en `@open-wa/wa-automate`)
> hoy **solo recibe**; el envío lo hace siempre un humano para minimizar el riesgo de baneo.
> Es automatización no oficial de WhatsApp: leé su README antes de usarlo.

---

## Convenciones de código

Resumen — el detalle completo está en [`CLAUDE.md`](./CLAUDE.md):

- **Nombrado:** archivos `kebab-case`, funciones/variables `camelCase`, tablas/columnas `snake_case`,
  schemas Zod con sufijo `Schema`, tipos con sufijo `DTO`/`Type`, componentes React `PascalCase`.
- **TypeScript:** `strict: true`, cero `any` implícitos, returns async tipados explícitamente.
- **API:** todo endpoint valida con Zod; errores con `AppError`; respuestas `{ data, meta? }` / `{ error }`.
- **DB:** operaciones multi-tabla en `db.transaction()`; merge JSONB con `||` **solo** sobre la columna `custom`;
  nunca borrar (soft-delete `archived = true`); historial en `record_history`; siempre filtrar `archived = false`.
- **Seguridad:** el admin se autentica con **Clerk** (`hub_user`) y el portal del cliente con su **JWT propio** (`client_account`) — son sistemas separados; un cliente nunca accede a rutas del admin.
- **Comentarios:** siempre en español; explican el **qué** y el **porqué**, no el cómo obvio.

---

## Documentación adicional

- [`CLAUDE.md`](./CLAUDE.md) — convenciones de código, reglas de negocio críticas y arquitectura.
- [`CRM_NOUS_DOCS.md`](./CRM_NOUS_DOCS.md) — documentación funcional completa del producto.
- [`docs/schema.sql`](./docs/schema.sql) — referencia del esquema de base de datos.
- [`services/whatsapp-gateway/README.md`](./services/whatsapp-gateway/README.md) — gateway de WhatsApp.
</content>
</invoke>
