# DevDúo CRM — Documentación Técnica Completa
> Prompt maestro para construir el CRM con Claude Code

---

## Contexto del Proyecto

Somos dos desarrolladores web socios (Carlos y Andrés). Queremos construir nuestro **propio CRM interno** para gestionar el negocio de la agencia, reemplazando herramientas externas como HubSpot, Calendly, PandaDoc, Notion, etc.

El sistema tiene **dos portales**:
- **Admin Portal** (`app.devduo.com`) — solo para nosotros dos. Gestión completa del negocio.
- **Client Portal** (`cliente.devduo.com`) — para nuestros clientes. Siguen su proyecto, suben assets, aprueban entregables, firman contratos.

---

## Stack Tecnológico

### Backend
- **Runtime:** Node.js 20+ con TypeScript estricto
- **Framework:** Fastify (preferido sobre Express por performance y tipos nativos)
- **ORM:** Drizzle ORM (TypeScript-first, sin magia, SQL predecible)
- **Base de datos:** PostgreSQL 16+
- **Autenticación:** JWT (access token 15min + refresh token 7 días) con bcrypt
- **Validación:** Zod en todos los endpoints
- **Emails:** Resend (SDK oficial)
- **Storage de archivos:** Cloudflare R2 (compatible con S3 SDK)
- **Queue / Jobs:** BullMQ + Redis (para notificaciones, emails, jobs recurrentes)
- **WebSockets:** Para notificaciones en tiempo real (Fastify + `@fastify/websocket`)

### Frontend — Admin Portal
- **Framework:** Next.js 14+ (App Router)
- **Lenguaje:** TypeScript estricto
- **Estilos:** Tailwind CSS + shadcn/ui
- **Estado global:** Zustand
- **Fetching:** TanStack Query (React Query)
- **Tablas:** TanStack Table
- **Formularios:** React Hook Form + Zod
- **Drag & drop (kanban):** @dnd-kit/core
- **Gráficas:** Recharts

### Frontend — Client Portal
- Mismo stack que Admin Portal
- Rutas y layouts completamente separados
- Autenticación separada (client_account, no hub_user)

### Infraestructura
- **Containerización:** Docker + Docker Compose
- **Variables de entorno:** dotenv + validación con Zod al startup
- **Migraciones:** Drizzle Kit
- **Testing:** Vitest + Supertest para API

---

## Estructura de Carpetas

```
devduo-crm/
├── apps/
│   ├── api/                        # Fastify backend
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── contacts/
│   │   │   │   ├── companies/
│   │   │   │   ├── deals/
│   │   │   │   ├── pipelines/
│   │   │   │   ├── activities/     # calls, meetings, notes, tasks, emails
│   │   │   │   ├── calendar/
│   │   │   │   ├── intake-forms/
│   │   │   │   ├── deliverables/
│   │   │   │   ├── change-requests/
│   │   │   │   ├── documents/
│   │   │   │   ├── client-portal/
│   │   │   │   ├── notifications/
│   │   │   │   ├── email-tracking/
│   │   │   │   └── webhooks/       # docuseal, fathom
│   │   │   ├── db/
│   │   │   │   ├── schema/         # un archivo por tabla Drizzle
│   │   │   │   ├── migrations/
│   │   │   │   └── index.ts
│   │   │   ├── lib/
│   │   │   │   ├── resend.ts
│   │   │   │   ├── r2.ts
│   │   │   │   ├── redis.ts
│   │   │   │   └── jwt.ts
│   │   │   ├── middleware/
│   │   │   │   ├── authenticate.ts
│   │   │   │   ├── authorize.ts
│   │   │   │   └── validate.ts
│   │   │   └── app.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── admin/                      # Next.js Admin Portal
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   │   └── login/
│   │   │   ├── (dashboard)/
│   │   │   │   ├── pipeline/       # vista kanban
│   │   │   │   ├── contacts/
│   │   │   │   ├── companies/
│   │   │   │   ├── deals/[id]/
│   │   │   │   ├── calendar/
│   │   │   │   ├── reports/
│   │   │   │   └── settings/
│   │   │   └── layout.tsx
│   │   └── package.json
│   │
│   └── client-portal/              # Next.js Client Portal
│       ├── app/
│       │   ├── (auth)/
│       │   │   ├── login/
│       │   │   └── invite/[token]/
│       │   ├── (portal)/
│       │   │   ├── dashboard/
│       │   │   ├── proyecto/
│       │   │   ├── formularios/
│       │   │   ├── entregables/
│       │   │   ├── cambios/        # change requests
│       │   │   └── documentos/
│       │   └── layout.tsx
│       └── package.json
│
├── packages/
│   ├── types/                      # tipos compartidos entre apps
│   └── utils/                      # helpers compartidos
│
├── docker-compose.yml
├── docker-compose.dev.yml
└── turbo.json                      # monorepo con Turborepo
```

---

## Base de Datos — Esquema Completo PostgreSQL

> El schema canónico ejecutable es la fuente Drizzle en `apps/api/src/db/schema/` y sus migraciones en `apps/api/src/db/migrations/`. El DDL de referencia histórico (modelo tipado, sin EAV) vive en `docs/schema.sql`. No dupliques DDL acá para evitar desincronización.

### Modelo de datos (tipado)

El proyecto abandonó el modelo EAV (`crm_object` / `property` / `property_group` / `association` genérico) y usa tablas tipadas reales. Cada tabla núcleo tiene una columna `custom jsonb` como válvula de escape para campos ad-hoc poco frecuentes, sin reconstruir el motor dinámico de propiedades de HubSpot.

**Entidades núcleo**

- `portal` — multi-tenancy; todas las demás tablas tienen `portal_id`.
- `hub_user` — equipo interno (Carlos y Andrés). `role`: `owner` | `member` | `viewer`. El campo `owner_id` en el resto del schema referencia directamente a `hub_user`; ya no existe tabla `owner` separada.
- `pipeline` / `pipeline_stage` — pipelines de deals. `pipeline_stage` tiene `probability`, `is_closed`, `is_won`.
- `company` — empresa cliente. Campos: `name`, `domain`, `industry`, `phone`, `website`, `custom jsonb`.
- `contact` — persona. Campos: `first_name`, `last_name`, `email` (citext, único por portal), `phone`, `job_title`, `lifecycle_stage`, `custom jsonb`. FK nullable a `company` (empresa principal).
- `deal` — negocio/proyecto. Campos: `name`, `amount` (tipado para forecast), `currency`, `close_date`, `custom jsonb`. FKs: `pipeline_id`, `stage_id`, `primary_contact_id` → `contact`, `company_id` → `company`.
- `deal_contact` — join table para contactos secundarios de un deal (`role`: `decision_maker` | `billing` | `technical`). El contacto principal vive como FK directa en `deal.primary_contact_id`.

**Actividades tipadas** (cada una puede colgar de `deal_id`, `contact_id` y/o `company_id` mediante FKs nullables)

- `note` — cuerpo de texto, `created_by`.
- `task` — `title`, `status` (`pending`/`in_progress`/`completed`/`cancelled`), `priority`, `due_date`, `assigned_to`.
- `call` — `direction` (`inbound`/`outbound`), `duration_sec`, `occurred_at`.
- `meeting` — `starts_at`, `ends_at`, `booking_id` (FK opcional a `booking`). Columnas tipadas de enriquecimiento Fathom: `fathom_summary`, `fathom_transcript_url`, `fathom_action_items` (jsonb), `fathom_participants` (jsonb).

**Calendario nativo**

- `availability_rule` — reglas semanales por `hub_user` (día de la semana, hora inicio/fin, zona horaria).
- `availability_block` — bloqueos puntuales por `hub_user`.
- `meeting_type` — tipo de reunión con `slug`, `duration_min`, `buffer_min`.
- `booking` — reserva confirmada. Tiene constraintEXCLUDE USING gist (owner_id, tstzrange) `WHERE status <> 'cancelled'` que garantiza a nivel DB que no haya doble booking del mismo owner.

**Client Portal**

- `client_account` — cuenta del cliente. `contact_id` → `contact` (FK tipada). Email en `citext`.
- `client_deal_access` — join table cliente ↔ deal.
- `intake_form` — definición del formulario (`fields jsonb`).
- `deal_intake` — instancia de formulario asignada a un deal; `status`: `pending`/`in_progress`/`completed`.
- `deal_intake_response` — respuestas del cliente (`answers jsonb`). Un UNIQUE en `intake_id` garantiza una respuesta por intake.
- `client_asset` — archivos subidos por el cliente; guarda `storage_key` en R2/S3, nunca la URL.

**Otras entidades**

- `deliverable` — entregable por deal. `type`: `design`/`prototype`/`staging`/`final`. `status`: `pending_review`/`approved`/`changes_requested`.
- `change_request` + `change_request_item` / `change_request_attachment` / `change_request_history` / `change_request_comment` — control de alcance (ver Módulo 5).
- `document` — contratos, propuestas, facturas. Vinculado a `deal` y/o `change_request`. Integración DocuSeal via `docuseal_submission_id` (nunca guardar la URL, expira en 40 min).
- `email_send` / `email_event` — tracking de emails. `email_send` se vincula con `contact_id` y/o `deal_id` (columnas tipadas, sin `object_id` genérico).
- `record_history` — historial polimórfico de cambios de campo. Columnas: `entity_type` (`contact`/`company`/`deal`/...), `entity_id`, `field_name`, `old_value`, `new_value`. Reemplaza a `property_history`.
- `crm_list` / `list_membership` — listas estáticas y dinámicas. `crm_list.entity_type` es `contact`/`company`/`deal`. `list_membership.entity_id` apunta al id del registro correspondiente (polimórfico, sin FK dura, patrón estándar para tablas de membresía).
- `notification` — referencia polimórfica `entity_type` + `entity_id` al registro relacionado. Puede apuntar a `hub_user` o `client_account`.
- `audit_log` — referencia polimórfica `entity_type` + `entity_id`. Acciones: `CREATE`/`UPDATE`/`DELETE`/`STAGE_CHANGE`/`LOGIN`.

**Convenciones transversales**

- Soft-delete con `archived boolean` + `archived_at timestamptz`. Todos los queries de listado filtran `WHERE archived = false`.
- Emails en `citext` (case-insensitive) en `hub_user`, `contact`, `client_account`, `booking`, `email_send`.
- Triggers `set_updated_at()` en todas las tablas que tienen `updated_at`.

---

## Módulos del Sistema — Descripción Funcional

### Módulo 1: Autenticación

**Admin Portal (`hub_user`)**
- `POST /api/auth/login` — email + password → JWT access + refresh token
- `POST /api/auth/refresh` — rota access token
- `POST /api/auth/logout`
- Middleware `authenticate` en todas las rutas admin
- Middleware `authorize` para verificar rol ('owner' puede todo, 'member' no puede borrar, 'viewer' solo lee)

**Client Portal (`client_account`)**
- `POST /api/client-auth/accept-invite` — token del email → setear password → login
- `POST /api/client-auth/login`
- `POST /api/client-auth/refresh`
- Middleware separado `authenticateClient` — nunca puede acceder a rutas admin

**Tokens**
- Access token: 15 minutos, firmado con `ACCESS_TOKEN_SECRET`
- Refresh token: 7 días, almacenado en httpOnly cookie
- Al firmarse el contrato, generar `invite_token` con `crypto.randomUUID()` y mandar email

---

### Módulo 2: CRM Core (contacts, companies, deals)

Cada recurso tiene su propia tabla tipada (`contact`, `company`, `deal`). Los campos núcleo son columnas reales; los campos ad-hoc poco frecuentes van en `custom jsonb`.

**Endpoints por recurso (patrón uniforme):**
```
GET    /api/contacts                     → lista paginada (cursor-based)
POST   /api/contacts                     → crear
GET    /api/contacts/:id                 → detalle (con actividades y asociaciones)
PATCH  /api/contacts/:id                 → actualizar
DELETE /api/contacts/:id                 → archivar (soft delete)
POST   /api/contacts/search              → búsqueda avanzada con filterBranch
POST   /api/contacts/batch/create        → crear múltiples
POST   /api/contacts/batch/update        → actualizar múltiples

GET    /api/companies                    → lista paginada (cursor-based)
POST   /api/companies                    → crear
GET    /api/companies/:id                → detalle (con actividades y asociaciones)
PATCH  /api/companies/:id                → actualizar
DELETE /api/companies/:id                → archivar (soft delete)
POST   /api/companies/search             → búsqueda avanzada con filterBranch
POST   /api/companies/batch/create       → crear múltiples
POST   /api/companies/batch/update       → actualizar múltiples

GET    /api/deals                        → lista paginada (cursor-based)
POST   /api/deals                        → crear
GET    /api/deals/:id                    → detalle (con actividades y asociaciones)
PATCH  /api/deals/:id                    → actualizar
DELETE /api/deals/:id                    → archivar (soft delete)
POST   /api/deals/search                 → búsqueda avanzada con filterBranch
POST   /api/deals/batch/create           → crear múltiples
POST   /api/deals/batch/update           → actualizar múltiples
```

**Al actualizar, siempre:**
1. Actualizar las columnas tipadas con `UPDATE` normal. El merge `jsonb || $1` aplica ÚNICAMENTE a la columna `custom` cuando se modifican campos ad-hoc.
2. Insertar en `record_history` por cada campo que cambió (`entity_type = 'contact'|'company'|'deal'`, `entity_id`, `field_name`, `old_value`, `new_value`).
3. Insertar en `audit_log`.
4. Emitir notificación si el cambio es relevante (ej: stage change).

---

### Módulo 3: Pipelines y Stage Changes

```
GET    /api/pipelines
POST   /api/pipelines
GET    /api/pipelines/:id/stages
PATCH  /api/deals/:id/stage     → mover deal de etapa
```

**Al cambiar de etapa (`PATCH /api/deals/:id/stage`):**
```typescript
// Lógica de negocio en el service:
async function changeDealStage(dealId, newStageId, userId) {
  const deal = await getDeal(dealId);
  const newStage = await getStage(newStageId);
  
  // 1. Actualizar el deal
  await updateDeal(dealId, { stage_id: newStageId });
  
  // 2. Historial
  await insertRecordHistory({ entity_type: 'deal', entity_id: dealId, field_name: 'stage_id', old_value: String(deal.stage_id), new_value: String(newStageId), source_type: 'API', changed_by: userId });
  
  // 3. Audit log
  await insertAuditLog({ action: 'STAGE_CHANGE', entity_type: 'deal', entity_id: dealId, payload: { from, to } });
  
  // 4. Notificación
  await createNotification({ type: 'deal_stage_changed', ... });
  
  // 5. Si es "Contrato firmado" → activar client portal automáticamente
  if (newStage.is_won) {
    await activateClientPortal(dealId, userId);
  }
}
```

---

### Módulo 4: Client Portal — Activación Automática

Se dispara cuando el deal llega a etapa ganada (por stage change o por webhook de DocuSeal).

```typescript
async function activateClientPortal(dealId: number, triggeredBy: string) {
  const deal = await getDealWithContact(dealId);
  const clientEmail = deal.primaryContact.email; // campo tipado, no properties JSONB
  
  // 1. Crear client_account
  const inviteToken = crypto.randomUUID();
  const clientAccount = await createClientAccount({
    portal_id: deal.portal_id,
    contact_id: deal.contact.id,
    email: clientEmail,
    invite_token: inviteToken,
    invite_sent_at: new Date(),
  });
  
  // 2. Dar acceso al deal de producción
  await createClientDealAccess(clientAccount.id, dealId);
  
  // 3. Asignar formularios de intake automáticamente
  const defaultForms = ['branding', 'contenido', 'accesos'];
  for (const slug of defaultForms) {
    await assignIntakeForm(dealId, slug);
  }
  
  // 4. Email de bienvenida con el link del portal
  await resend.emails.send({
    from: 'DevDúo <hola@devduo.com>',
    to: clientEmail,
    subject: '¡Tu proyecto está iniciando! Accede a tu portal',
    html: welcomeEmailTemplate(deal.name, inviteToken),
  });
}
```

---

### Módulo 5: Change Requests

**Endpoints:**
```
GET    /api/deals/:dealId/change-requests
POST   /api/deals/:dealId/change-requests          → crear CR (draft)
GET    /api/deals/:dealId/change-requests/:crId
PATCH  /api/deals/:dealId/change-requests/:crId    → editar mientras draft
POST   /api/deals/:dealId/change-requests/:crId/send       → draft → sent
POST   /api/deals/:dealId/change-requests/:crId/complete   → marcar completada

-- Endpoints del CLIENT PORTAL:
POST   /api/client/change-requests/:crId/approve
POST   /api/client/change-requests/:crId/reject
POST   /api/client/change-requests/:crId/comment

-- Items
POST   /api/change-requests/:crId/items
PATCH  /api/change-requests/:crId/items/:itemId
DELETE /api/change-requests/:crId/items/:itemId

-- Adjuntos
POST   /api/change-requests/:crId/attachments     → upload a R2
```

**Máquina de estados:**
```
draft → sent → approved     → completed
             → rejected
             → negotiating  → sent (nueva versión, version++)
             → approved_verbally → approved
             → disputed
```

**Reglas de negocio importantes:**
- Solo se puede editar una CR en estado `draft`
- Al pasar a `sent`, el cliente recibe email con link al portal
- Al aprobar, si `timeline_impact_days > 0`, actualizar `closedate` del deal automáticamente
- Cada transición de estado se registra en `change_request_history`
- Auto-incrementar `number` por deal (CR#1, CR#2...) con `SELECT MAX(number) + 1`
- Si la CR tiene `total_amount > 0` y se aprueba, crear un `document` de tipo `invoice` automáticamente

---

### Módulo 6: Integración DocuSeal

**Configuración:**
```env
DOCUSEAL_URL=https://docuseal.tuservidor.com   # self-hosted
DOCUSEAL_API_KEY=tu_api_key
DOCUSEAL_WEBHOOK_SECRET=tu_secret
```

**Crear submission al enviar propuesta/contrato:**
```
POST /api/deals/:dealId/documents/send-for-signature
Body: { templateId, documentType: 'contract' | 'proposal' }
```

**Webhook receiver:**
```
POST /api/webhooks/docuseal
```

Validar el token del header antes de procesar. Al recibir `form.completed`:
1. Buscar `document` por `docuseal_external_id`
2. Marcar `docuseal_status = 'completed'` y `signed_at = now()`
3. Si es contrato → llamar `activateClientPortal(dealId)`
4. Insertar en `record_history` con `entity_type = 'document'`, `field_name = 'docuseal_status'`, `source_type = 'DOCUSEAL'`
5. **NUNCA** guardar la URL del documento firmado — expira en 40 minutos. Guardar solo el `submission_id` y llamar a la API de DocuSeal cuando se necesite la URL fresca.

---

### Módulo 7: Integración Fathom

**Webhook receiver:**
```
POST /api/webhooks/fathom
```

Al recibir evento de reunión completada:
1. Buscar el registro en la tabla `meeting` que corresponde (por email del participante o meeting ID)
2. Actualizar las columnas tipadas: `fathom_summary`, `fathom_transcript_url`, `fathom_action_items` (jsonb), `fathom_participants` (jsonb)
3. Por cada item en `fathom_action_items`, crear un registro en la tabla `task` asociado al deal
4. Notificar al owner del deal

---

### Módulo 8: Calendario Nativo

**Endpoints públicos (sin auth, para que el cliente reserve):**
```
GET  /book/:ownerSlug/:meetingTypeSlug          → página de reserva
GET  /api/calendar/availability/:ownerId        → slots disponibles
     Query params: ?date=2026-07-01&meetingTypeId=1
POST /api/calendar/bookings                     → crear reserva
```

**Algoritmo de slots disponibles:**
```typescript
async function getAvailableSlots(ownerId, date, durationMin) {
  // 1. Obtener reglas del día de la semana
  const rules = await getAvailabilityRules(ownerId, date.getDay());
  
  // 2. Generar todos los slots posibles del día
  const allSlots = generateSlots(rules, durationMin, bufferMin);
  
  // 3. Obtener bloqueos del día
  const blocks = await getBlocksForDay(ownerId, date);
  
  // 4. Obtener bookings existentes del día (+ buffer)
  const existingBookings = await getBookingsForDay(ownerId, date);
  
  // 5. Filtrar slots ocupados
  return allSlots.filter(slot => 
    !isOverlapping(slot, blocks) && 
    !isOverlapping(slot, existingBookings)
  );
}
```

**Al confirmar una reserva:**
1. Insertar en `booking`
2. Insertar en la tabla `meeting` con los datos del booking (`booking_id` FK, `title`, `starts_at`, `ends_at`, `contact_id`, `deal_id`)
3. Si el guest_email coincide con un contacto existente, asignar `contact_id` en el registro
4. Enviar email de confirmación con detalles y link de reunión
5. Si hay deal activo del contacto, asignar `deal_id` en el registro

---

### Módulo 9: Email Tracking

**Al enviar un email desde el CRM:**
1. Insertar en `email_send` con `contact_id` y/o `deal_id` (columnas tipadas; ya no existe `object_id` genérico) → obtener `tracking_id`
2. Inyectar pixel al final del `body_html`:
   ```html
   <img src="https://api.devduo.com/track/open/{tracking_id}" width="1" height="1" />
   ```
3. Reemplazar links con links de tracking:
   ```
   https://propuesta.devduo.com/... 
   → https://api.devduo.com/track/click/{link_id}
   ```

**Endpoints públicos (sin auth):**
```
GET /track/open/:trackingId   → registra apertura, responde imagen 1px GIF
GET /track/click/:linkId      → registra click, redirige a URL original
```

**Respuesta de 1px GIF (base64):**
```typescript
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
res.header('Content-Type', 'image/gif').send(PIXEL);
```

---

### Módulo 10: Notificaciones en Tiempo Real

**Canal WebSocket:**
```typescript
// Admin: ws://api.devduo.com/ws/admin?token=JWT
// Client: ws://api.devduo.com/ws/client?token=JWT
```

**Al crear una `notification`, el job de BullMQ:**
1. Guarda en tabla `notification`
2. Emite por WebSocket si el usuario está conectado
3. Envía email si el usuario no está conectado (o si es crítico como `contract_signed`)

---

## Flujos de Negocio Completos

### Flujo 1: Nuevo lead → Contrato firmado

```
1. Carlos crea contacto + empresa + deal en Pipeline de Ventas (etapa: "Nuevo lead")
2. Carlos le envía el cuestionario de onboarding → deal a "Cuestionario enviado"
3. Cliente responde el formulario → propiedades del deal actualizadas (source: FORM)
4. Booking de llamada de discovery (calendario nativo) → deal a "Llamada de discovery"
5. Fathom graba la llamada → webhook → meeting enriquecido + tasks creadas
6. Carlos genera propuesta con ítems → deal a "Propuesta enviada"
7. DocuSeal envía propuesta al cliente para firma
8. Cliente firma → webhook DocuSeal → deal a "Contrato firmado"
9. AUTOMÁTICO: se activa client portal + se crean 3 intakes + se crea deal en Pipeline de Producción
```

### Flujo 2: Change Request durante producción

```
1. Cliente pide algo nuevo (por WhatsApp, email, portal)
2. Andrés crea CR en estado "draft" con ítems y precio
3. Andrés agrega adjunto: captura del chat donde el cliente lo pidió
4. CR pasa a "sent" → cliente recibe email → ve en su portal
5a. Cliente aprueba → deal actualiza fecha de entrega → se genera factura
5b. Cliente rechaza → CR queda en "rejected" con comentario
5c. Cliente negocia → hilo de comentarios → nueva versión de la CR
```

### Flujo 3: Entrega y aprobación

```
1. Andrés sube entregable (link a Figma o staging) desde admin portal
2. Deliverable queda en "pending_review"
3. Cliente recibe notificación en su portal
4. Cliente entra, revisa y elige:
   a. "Aprobar" → deliverable.status = 'approved', deal avanza
   b. "Solicitar cambios" → deja comentario, Andrés recibe notificación
5. Si hay más de N revisiones en el mismo entregable → considerar CR
```

---

## Variables de Entorno Requeridas

```env
# Base de datos
DATABASE_URL=postgresql://user:password@localhost:5432/devduo_crm

# Auth
ACCESS_TOKEN_SECRET=secret_muy_largo_aleatorio
REFRESH_TOKEN_SECRET=otro_secret_muy_largo

# Resend (emails)
RESEND_API_KEY=re_xxxxxxxxxxxx
FROM_EMAIL=hola@devduo.com

# Cloudflare R2 (archivos)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=devduo-crm-files
R2_PUBLIC_URL=https://files.devduo.com

# Redis (queues)
REDIS_URL=redis://localhost:6379

# DocuSeal (self-hosted)
DOCUSEAL_URL=https://sign.devduo.com
DOCUSEAL_API_KEY=
DOCUSEAL_WEBHOOK_SECRET=

# Fathom
FATHOM_WEBHOOK_SECRET=

# URLs
ADMIN_URL=https://app.devduo.com
CLIENT_PORTAL_URL=https://cliente.devduo.com
API_URL=https://api.devduo.com
```

---

## Docker Compose (desarrollo)

```yaml
version: '3.9'
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: devduo_crm
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  api:
    build: ./apps/api
    ports:
      - "3001:3001"
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/devduo_crm
      REDIS_URL: redis://redis:6379
    depends_on:
      - postgres
      - redis
    volumes:
      - ./apps/api:/app
      - /app/node_modules

  admin:
    build: ./apps/admin
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:3001
    volumes:
      - ./apps/admin:/app

  client-portal:
    build: ./apps/client-portal
    ports:
      - "3002:3002"
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:3001
    volumes:
      - ./apps/client-portal:/app

volumes:
  postgres_data:
```

---

## Orden de Implementación Recomendado

### Fase 1 — Base (semanas 1-2)
1. Setup monorepo (Turborepo + pnpm workspaces)
2. Fastify API con Drizzle + migraciones
3. Autenticación JWT (hub_user)
4. CRUD de contacts, companies, deals
5. Pipelines y stage changes con historial
6. Admin portal: login + pipeline kanban básico

### Fase 2 — Operaciones (semanas 3-4)
7. Actividades (calls, meetings, notes, tasks)
8. Asociaciones tipadas (deal_contact para contactos secundarios; FKs directas deal→company, deal→primary_contact)
9. Campos custom (columna `custom jsonb`) — sin motor EAV
10. Búsqueda avanzada con filterBranch
11. Admin portal: vista de deal completa

### Fase 3 — Client Portal (semanas 5-6)
12. client_account + autenticación separada
13. Sistema de intake forms + subida de archivos a R2
14. Vista del cliente (dashboard + formularios)
15. Deliverables + flujo de aprobación
16. Notificaciones en tiempo real (WebSocket)

### Fase 4 — Change Requests (semana 7)
17. CRUD de change requests con ítems
18. Máquina de estados + historial
19. Hilo de comentarios (agencia ↔ cliente)
20. Vista del cliente para aprobar/rechazar/negociar

### Fase 5 — Integraciones (semanas 8-9)
21. DocuSeal: crear submissions + webhook receiver
22. Activación automática del client portal
23. Fathom: webhook receiver + enriquecer meetings
24. Email tracking: pixel + link tracking
25. Calendario nativo: disponibilidad + bookings

### Fase 6 — Business Intelligence (semana 10)
26. Dashboard con métricas (recharts)
27. Revenue forecast ponderado
28. Leads fríos + alertas automáticas
29. Audit log completo
30. Reportes exportables

---

## Convenciones de Código

- **Nombres de archivos:** kebab-case (`change-request.service.ts`)
- **Nombres de funciones:** camelCase (`createChangeRequest`)
- **Nombres de tablas/columnas:** snake_case
- **Zod schemas:** sufijo `Schema` (`CreateChangeRequestSchema`)
- **Tipos TypeScript:** sufijo `Type` o `DTO` (`CreateChangeRequestDTO`)
- **Un módulo = una carpeta** con: `router.ts`, `service.ts`, `schema.ts`, `types.ts`
- **Errores:** siempre usar `throw new AppError(code, message, statusCode)`
- **Transacciones:** cualquier operación que toque más de una tabla debe usar `db.transaction()`

---

## Notas Críticas

1. **DocuSeal URLs expiran en 40 minutos.** Nunca guardar la URL del documento firmado en la BD. Guardar solo el `submission_id` y llamar a `GET /submissions/{id}/documents` cuando se necesite la URL fresca.

2. **Actualización de campos:** Los campos núcleo son columnas tipadas; se actualizan con `UPDATE` normal. El merge `jsonb || $1` aplica ÚNICAMENTE a la columna `custom` de cada tabla cuando se modifican campos ad-hoc. No existe ya `UPDATE crm_object SET properties = properties || $1`.

3. **Soft delete:** Nunca borrar registros del CRM. Usar `archived = true` + `archived_at = now()`. Todos los queries filtran `WHERE archived = false`.

4. **Historial obligatorio:** Cada cambio de campo en una entidad núcleo (`contact`, `company`, `deal`, etc.) debe registrarse en `record_history` (referencia polimórfica: `entity_type` + `entity_id`; guarda `old_value` y `new_value`). Implementar esto en el service, no en el router.

5. **Separación de auth:** Los tokens de `hub_user` y `client_account` son completamente separados. Un cliente no puede nunca acceder a una ruta del admin, y viceversa. Verificar el tipo de token en cada middleware.

6. **Change requests:** El número de CR es relativo al deal (`CR#1 del deal 103`), no global. Usar `SELECT COALESCE(MAX(number), 0) + 1 FROM change_request WHERE deal_id = $1`.
