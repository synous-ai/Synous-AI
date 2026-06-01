# CLAUDE.md — DevDúo CRM

Este archivo es leído automáticamente por Claude Code al abrir el proyecto.
La documentación completa está en `CRM_DEVDUO_DOCS.md`.

---

## Qué es este proyecto

CRM propio para una agencia de desarrollo web de dos personas (Carlos y Andrés).
Monorepo con tres apps: API (Fastify), Admin Portal (Next.js), Client Portal (Next.js).
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

# Solo el admin
pnpm --filter admin dev

# Solo el portal del cliente
pnpm --filter client-portal dev
```

**Puertos en desarrollo:**

- API: `http://localhost:3001`
- Admin Portal: `http://localhost:3000`
- Client Portal: `http://localhost:3002`
- PostgreSQL: `localhost:5433` (mapeado a 5432 del contenedor; evita conflicto con un Postgres local)
- Redis: `localhost:6379`

---

## Estructura del monorepo

```
apps/api/          → Fastify + Drizzle ORM + PostgreSQL
apps/admin/        → Next.js 14 App Router (solo para Carlos y Andrés)
apps/client-portal/→ Next.js 14 App Router (solo para clientes)
packages/types/    → tipos TypeScript compartidos entre apps
packages/utils/    → helpers compartidos
```

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
| Auth               | JWT — access 15min + refresh 7d en httpOnly cookie |
| Emails             | Resend                                             |
| Archivos           | Cloudflare R2 (S3-compatible)                      |
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
- Cada cambio de campo en una entidad núcleo se registra en `record_history` (referencia polimórfica `entity_type` + `entity_id`, guarda `old_value` y `new_value`). Implementarlo en el service, no en el router.
- Siempre filtrar `WHERE archived = false` en queries de listado.

### Seguridad — crítico

- Los tokens de `hub_user` y `client_account` son completamente distintos.
- Middleware `authenticate` → verifica token de admin (hub_user).
- Middleware `authenticateClient` → verifica token de cliente (client_account).
- Un cliente NUNCA puede acceder a rutas del admin. Verificar en cada ruta.
- Nunca loguear tokens, passwords, ni API keys.

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

**Activación del Client Portal:**
Se dispara automáticamente cuando:

- El deal llega a una etapa con `is_won = true`, O
- Llega el webhook de DocuSeal con `form.completed`
  Llamar siempre a `activateClientPortal(dealId)` en ambos casos.
  Esta función: crea `client_account` + `client_deal_access` + asigna intake forms + manda email de bienvenida.

**Stage changes:**
Nunca actualizar `stage_id` directamente en el router.
Siempre usar `dealService.changeStage(dealId, newStageId, userId)` que hace:

1. Update del deal (columna `stage_id`)
2. Insert en `record_history` (`entity_type = 'deal'`, `field_name = 'stage_id'`, `old_value`, `new_value`)
3. Insert en `audit_log`
4. Create notification
5. Check si `is_won` para activar client portal

---

## Migraciones de base de datos

```bash
# Generar migración después de cambiar el schema Drizzle
pnpm --filter api db:generate

# Aplicar migraciones pendientes
pnpm --filter api db:migrate

# Ver estado de migraciones
pnpm --filter api db:status

# NUNCA editar archivos en /migrations/ manualmente
# NUNCA usar db:push en producción
```

El schema de Drizzle vive en `apps/api/src/db/schema/`.
Un archivo por tabla o por grupo de tablas relacionadas.

---

## Variables de entorno

El archivo `.env.example` tiene todas las variables requeridas.
Al iniciar, la API valida las variables con Zod y falla rápido si falta alguna.

```bash
cp .env.example .env
# Editar .env con los valores reales
```

Variables mínimas para desarrollo local:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/devduo_crm
REDIS_URL=redis://localhost:6379
ACCESS_TOKEN_SECRET=dev_secret_access_32chars_minimum
REFRESH_TOKEN_SECRET=dev_secret_refresh_32chars_minimum
```

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

## Módulos implementados

Actualizar este checklist a medida que se completan:

### Fase 1 — Base

- [x] Setup monorepo (Turborepo + pnpm)
- [x] Fastify API skeleton + health check
- [x] Drizzle schema + migraciones
- [x] Auth JWT (hub_user) — login, refresh, logout
- [x] CRUD contacts
- [x] CRUD companies
- [x] CRUD deals
- [x] Pipelines + stage changes con historial
- [ ] Admin Portal: login
- [ ] Admin Portal: pipeline kanban

### Fase 2 — Operaciones

- [ ] Actividades tipadas (calls, meetings, notes, tasks)
- [ ] Asociaciones tipadas (deal_contact + FKs directas)
- [ ] Campos custom (columna `custom jsonb`) — sin motor EAV
- [ ] Búsqueda avanzada (filterBranch)
- [ ] Admin Portal: vista de deal completa

### Fase 3 — Client Portal

- [ ] client_account + auth separada
- [ ] Intake forms + subida de archivos R2
- [ ] Client Portal: dashboard + formularios
- [ ] Deliverables + flujo de aprobación
- [ ] Notificaciones WebSocket

### Fase 4 — Change Requests

- [ ] CRUD change requests + ítems
- [ ] Máquina de estados + historial
- [ ] Hilo de comentarios
- [ ] Client Portal: aprobar / rechazar / negociar

### Fase 5 — Integraciones

- [ ] DocuSeal: submissions + webhook
- [ ] Activación automática client portal
- [ ] Fathom: webhook + enriquecer meetings
- [ ] Email tracking: pixel + link tracking
- [ ] Calendario nativo: disponibilidad + bookings

### Fase 6 — Business Intelligence

- [ ] Dashboard métricas (recharts)
- [ ] Revenue forecast ponderado
- [ ] Leads fríos + alertas
- [ ] Reportes exportables

---

## Cómo pedir ayuda a Claude Code

Para trabajar módulo por módulo de forma eficiente:

```
"Implementa el módulo de [nombre] siguiendo las convenciones
del CLAUDE.md. Lee también CRM_DEVDUO_DOCS.md sección [X]
para el contexto completo."
```

Si algo no está claro en este archivo, la fuente de verdad es
`CRM_DEVDUO_DOCS.md`.
