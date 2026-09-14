# Auditoría de producción — 13/09/2026

Auditoría técnica de punta a punta de SynousAI CRM (API Fastify + admin/portal Next.js)
orientada a dejar el proyecto listo para producción y mantenible por un equipo.

**Método.** Mapeo de arquitectura y flujos; siete auditorías por dominio (seguridad y
autorización, correctness del backend, base de datos, frontend admin, portal y páginas
públicas, integraciones/jobs, tooling/docs); verificación manual en el código de cada
hallazgo CRITICAL antes de corregirlo; implementación por tandas con typecheck + tests
después de cada una; review adversarial con contexto fresco sobre los cambios.

**Baseline antes de tocar código.** Typecheck API y admin limpios; 343 tests de
integración verdes; sin CI; sin configuración de ESLint en el repo.

---

## 1. Acción inmediata requerida (fuera del código)

Estas cinco cosas no se pueden resolver desde el repositorio y son las más urgentes.

| # | Acción | Por qué |
|---|--------|---------|
| 1 | **Rotar la contraseña de la base Neon de producción** (`neondb_owner`, host `ep-silent-haze-av0bjj1j`). | Está commiteada en `.env.example` desde `e33d2a0` (11/09) y pusheada a `origin/main` en GitHub. Borrarla del archivo no la saca del historial. |
| 2 | Reemplazar en `.env.example` todos los valores reales (`DATABASE_URL`, `PGPASSWORD`, `POSTGRES_*`, hosts `*.neon.tech`) por placeholders. | La edición automática de archivos `.env*` está bloqueada por permisos. |
| 3 | Borrar `apps/api/.env.bak.1789257089` y verificar que no se haya sincronizado a Time Machine / iCloud / Dropbox. | Backup con secretos reales. Ya quedó cubierto por `.gitignore` (nunca llegó al historial). |
| 4 | ~~Chequear facturas duplicadas antes de la `UNIQUE`~~ **Hecho 13/09:** 0 duplicados; migraciones `0038`–`0041` aplicadas en producción (42 en total). | La migración agrega `UNIQUE(portal_id, number)` y falla si ya existen facturas duplicadas (posible por el bug C5). |
| 5 | ~~Provisionar Redis del Marketplace de Vercel~~ **Hecho 13/09:** `synous-ai-redis` (iad1) conectado a `synous-ai-api` en Production y Preview. | Fan-out de `/ws/notifications` entre instancias (C10). |
| 6 | Orden de deploy: **migraciones (hecho) → API → admin**. | El admin nuevo llama a rutas de archivos que la API vieja no tiene. |
| 7 | Agregar a `.env.example` los placeholders de Blob: `BLOB_READ_WRITE_TOKEN=`, `BLOB_STORE_ID=`, `BLOB_WEBHOOK_PUBLIC_KEY=` (sin valores). | Edición de `.env*` bloqueada por permisos. |
| 8 | Verificar la integración de Blob con el checklist de `docs/STORAGE.md` → Deploy. | El modo `blob` solo está probado con el SDK mockeado. **Ojo:** los Preview de `synous-ai-api` usan la base de PRODUCCIÓN (no hay branch de Neon por preview) y no tienen `ACCESS_TOKEN_SECRET`; no son un sandbox. |
| 9 | Cargar `ACCESS_TOKEN_SECRET` (y el resto de las variables obligatorias) en el ambiente **Preview** de `synous-ai-api`. | Hoy Preview no la tiene: `env.ts` falla al arrancar y cualquier deploy de Preview queda caído. |
| 10 | Configurar `DOCUSEAL_API_KEY` y `DOCUSEAL_WEBHOOK_SECRET` en Production si la firma de contratos ya se usa. | No están definidas: los endpoints responden 503 y el webhook rechaza todo. |
| 11 | Quitar `DATABASE_URL`/`PGPASSWORD`/`POSTGRES_*` del proyecto Vercel `synous-ai-admin`, y borrar `apps/api/.env.local`. | El admin nunca habla con la DB (superficie de secretos innecesaria). El `.env.local` lo creó la CLI de Vercel al vincular el store y la API no lo usa. |
| 12 | ~~Resolver el cron de recordatorios frente al plan Hobby~~ **Hecho:** cron diario (`0 11 * * *`). | Con `*/15 * * * *` Vercel rechazaba el deploy en Hobby. Consecuencia: el recordatorio de reunión de 1 h solo alcanza a las reuniones de la hora siguiente a la corrida. |

---

## 2. Hallazgos

Estado: **Corregido** · **Parcial** · **Pendiente** (con motivo).

### CRITICAL

| ID | Área | Archivo | Problema | Riesgo | Solución | Estado |
|----|------|---------|----------|--------|----------|--------|
| C1 | Seguridad | `.env.example:12-32` | Credenciales reales de Neon (producción) en un archivo versionado y pusheado. | Acceso total a la base de todos los tenants. | Rotar contraseña; placeholders. | **Pendiente** (acción del owner, ver §1) |
| C2 | Seguridad | `.gitignore` | `.env.bak.*` no estaba ignorado: un `git add -A` commiteaba secretos. | Fuga de secretos al repo. | Regla `.env.*` + `!.env.example`. | Corregido |
| C3 | Multi-tenant | `deals.service.ts`, `finance.service.ts`, `documents.service.ts`, `calendar.service.ts`, `stage.service.ts` | Los ids de FK del body (`companyId`, `primaryContactId`, `ownerId`, `dealId`, `retainerId`, `hostIds`, `availabilityScheduleId`) no se validaban contra el portal, y varias lecturas los resolvían sin filtrar por `portal_id`. | Un usuario del portal A leía la empresa completa de B desde el detalle de un deal, inyectaba documentos en el portal de un cliente ajeno, exponía la agenda de otro tenant en la página pública e invitaba al portal a un contacto de otro tenant. | Guards `assertCompanyInPortal` / `assertContactInPortal` / `assertHubUsersInPortal` en `lib/portal-access.ts`, aplicados en cada escritura; lecturas scopeadas. | Corregido |
| C4 | Privacidad | `finance.service.ts` (PDF) | `easyinvoice` con `apiKey: 'free'` no renderiza localmente: hace POST de la factura completa (cliente, ítems, importes) a `api.easyinvoice.cloud`, sin timeout. | Datos de facturación de clientes enviados a un tercero sin contrato; descargas colgadas. | Render local con `pdfkit` (`modules/finance/invoice-pdf.ts`), mismo contrato `{ filename, pdf }`; dependencia eliminada. | Corregido |
| C5 | Integridad | `finance.service.ts` | Numeración `MAX(number)+1` sin lock ni `UNIQUE`: en READ COMMITTED dos facturas concurrentes reciben el mismo número (retainer automático + factura manual). | Facturas duplicadas: problema contable/legal, silencioso. | `nextInvoiceNumber` con `pg_advisory_xact_lock` por portal + `UNIQUE(portal_id, number)` (migración `0038`). | Corregido |
| C6 | Seguridad | `app.ts`, `calendar.public.router.ts` | Las rutas públicas declaraban `config.rateLimit`, pero `@fastify/rate-limit` no estaba instalado ni registrado: Fastify ignora la clave en silencio. | Reservas ilimitadas sin auth (2 emails por request), abuso de cuota de Resend, fuerza bruta de tokens. | Plugin registrado (`global: false`); límites también en propuestas públicas; test que verifica el `429`. | Corregido |
| C7 | Confiabilidad | `stage.service.ts` | Dos llamadas HTTP a Clerk dentro de `db.transaction()` durante la activación del portal. | Con Clerk lento se retienen locks y se agota el pool; si la tx hacía rollback el usuario de Clerk quedaba creado igual. | `activateClientPortal` solo hace DB y devuelve un `PortalActivation`; `completeClientPortalActivation` hace Clerk + email después del commit. | Corregido |
| C8 | Seguridad | `calendar.public.router.ts` | Los links de cancelar/reprogramar (con el token firmado) se armaban desde `X-Forwarded-Host`. | Un atacante recibía en su dominio los tokens del invitado. | Base desde configuración (`adminBaseUrl()`, `ADMIN_URL`). | Corregido |
| C9 | Negocio | `cr.service.ts` | El cliente podía aprobar una CR en borrador o re-decidir una ya cerrada; el admin podía saltar a cualquier estado; sin transacciones. | Aprobación de alcance y precio sobre algo nunca enviado; historial inconsistente. | Matriz de transiciones en servidor (idéntica a la UI), guard de estado para el cliente, transacciones con concurrencia optimista. | Corregido |
| C10 | Arquitectura | `serverless/index.ts`, `lib/notification-bus.ts`, `server.ts` | Bajo el entrypoint serverless de Vercel: el upgrade de WebSocket nunca se atiende, el bus de notificaciones es un `EventEmitter` en memoria y el worker de BullMQ nunca arranca. | Notificaciones en tiempo real y recordatorios (reuniones, tareas vencidas, deals estancados) inexistentes en producción, sin ningún log. | WebSockets de Vercel (beta) con auth por primer mensaje y heartbeat, fan-out por Redis pub/sub (fallback en memoria), `GET /api/cron/reminders` con `CRON_SECRET` y Vercel Cron; entrypoint `src/server.ts` bundleado por Vercel (`build:bundle`). | **Implementado** — pendiente de verificar en un deploy real (ver `docs/ARCHITECTURE.md`) |
| C11 | Frontend | `apps/admin/lib/hooks/{deals,contacts,companies}.ts` | Los listados pedían `?limit=100` una vez y paginaban en memoria. | Desde el registro 101, deals/contactos/empresas invisibles sin ningún aviso. | `lib/fetch-all-pages.ts` sigue el cursor del backend. | Corregido |
| C12 | Frontend | `apps/admin/app/**` | Cero `error.tsx`/`global-error.tsx`/`not-found.tsx`, más 43+ non-null assertions. | Cualquier excepción de render deja una pantalla genérica sin recuperación, incluidas las páginas públicas que ven los prospectos. | Error boundaries en raíz, admin, portal, `/book` y `/p`. | Corregido (las non-null assertions siguen: ver M12) |
| C14 | Archivos | `modules/files/files.service.ts`, proyecto Vercel `synous-ai-api` | El proyecto de la API no tenía credenciales de Blob en ningún ambiente: los uploads de producción caían al disco efímero y de solo lectura de la Function. | Logos, materiales de onboarding, documentos y adjuntos perdidos o fallando en producción, sin error visible. | Store privado `synous-ai-files` conectado (Production/Preview) + integración completa (ver §4); producción sin credenciales responde 503. | Corregido |
| C13 | Base de datos | `db/index.ts` | Pools sin `max` ni timeouts. | En serverless, N instancias × 10 conexiones superan `max_connections`; conexiones colgadas. | Timeouts de conexión/inactividad, `max: 5` en Neon, `statement_timeout` en node-postgres. | Parcial: sin `statement_timeout` en Neon (el pooler puede rechazar el parámetro; validar en staging) |

### HIGH

| ID | Área | Archivo | Problema | Solución | Estado |
|----|------|---------|----------|----------|--------|
| H1 | Seguridad | `email-tracking.*` | Open redirect: `/track/click/<uuid>?url=https://phishing` redirigía desde nuestro dominio. | Firma HMAC obligatoria del destino (`sig`). | Corregido |
| H2 | Seguridad | `files.router.ts`, `files.service.ts` | Descargas servidas inline con el content-type que declaró quien subió el archivo (HTML/SVG ejecutables en el origen de la API, con el token en la URL). | MIME por extensión; solo imágenes rasterizadas y PDF inline; resto como adjunto con `nosniff` + CSP sandbox. | Parcial: falta allowlist de tipos al subir |
| H3 | Seguridad | `app.ts` | El logger de producción escribía URLs con `?token=` (sesión de Clerk) en texto plano. | Serializer que redacta el token. | Corregido |
| H4 | Autorización | `documents.router.ts`, `proposals.router.ts`, `branding.router.ts`, `files.router.ts` | Rutas mutantes sin `authorize()`: un `viewer` podía enviar a firmar, borrar documentos, editar precios de propuestas o subir archivos. | Roles alineados con el resto de los módulos. | Corregido |
| H5 | Integridad | `documents.service.ts`, `deliverables.service.ts` | Hard delete; el documento guarda el único vínculo con el contrato firmado en DocuSeal. | Soft delete (`archived`, migración `0038`) + filtros en todas las lecturas + `audit_log`. | Parcial: `note`, `task`, `change_request_item`, `pipeline_stage` y config de calendario siguen con hard delete |
| H6 | Confiabilidad | `lib/mailer.ts` | Resend devuelve `{ error }` en vez de rechazar: los `try/catch` de 9 call sites nunca corrían y `inviteSentAt` se sellaba con envíos fallidos. | `sendEmail` lanza `EMAIL_SEND_FAILED`; el único call site sin guard quedó protegido. | Corregido |
| H7 | Concurrencia | `docuseal.service.ts` | El guard de idempotencia se leía fuera de la tx: dos entregas simultáneas de `form.completed` activaban el portal dos veces (y la segunda fallaba con 500). | UPDATE condicionado dentro de la transacción. | Corregido |
| H8 | Validación | `webhooks.router.ts` | Payloads de Fathom/DocuSeal sin validar (el schema de Fathom existía y no se usaba). | Zod después de verificar la firma; payload inválido → 200 + log. | Corregido |
| H9 | Negocio | `branding.service.ts` | Los PATCH pisaban con `null` todo campo omitido (cambiar un color borraba el logo) y cualquier error se reportaba como "slug en uso". | PATCH parcial real; solo `23505` → `SLUG_TAKEN`. | Corregido |
| H10 | Integridad | `cr.service.ts`, `intake.service.ts` | Escrituras multi-tabla sin transacción. | Transacciones. | Corregido |
| H11 | Confiabilidad | `finance.service.ts`, `deliverables.service.ts` | Lecturas con el `db` global dentro de una transacción (pide una segunda conexión: deadlock con pool chico; snapshot inconsistente para `record_history`). | Helpers aceptan `tx`. | Corregido |
| H12 | Confiabilidad | `server.ts` | Un Redis caído en el arranque hacía `process.exit(1)` con la API ya escuchando. | Worker aislado en su propio try/catch. | Corregido |
| H13 | Integraciones | `docuseal.client.ts`, `lib/ai/*` | Llamadas salientes sin timeout dentro de requests HTTP. | DocuSeal 15 s (→ 503), IA 30 s. | Corregido |
| H14 | Observabilidad | `proposals.service.ts`, `next-action.service.ts` | El fallback de IA tragaba el error sin log: una integración rota generaba propuestas de plantilla indefinidamente. | Log explícito del fallo. | Corregido |
| H15 | Seguridad | `app.ts` | Swagger UI público en producción (mapa completo de rutas y schemas). | Solo fuera de producción. | Corregido |
| H16 | Seguridad | `app.ts` | Sin headers de seguridad. | `nosniff`, `X-Frame-Options`, `Referrer-Policy`, HSTS en producción (sin dependencia nueva). | Corregido |
| H17 | Auth | `lib/client-account-linking.ts` | El auto-vínculo de cuentas de Clerk solo lo usa su test; no existe el webhook de Clerk que la documentación y `CLERK_WEBHOOK_SIGNING_SECRET` dan por hecho. | Cablear el webhook de Clerk (con verificación Svix) o borrar el código y la variable. | **Pendiente** (decisión de producto) |
| H18 | Producto | `apps/admin/app/portal/propuesta/page.tsx` | Página pública con copy placeholder ("Nombre del negocio") y CTA a `#`. | Ocultar hasta conectarla a datos reales. | **Pendiente** (confirmar si está en producción) |
| H19 | UX | `apps/admin/app/admin/**` | Acciones destructivas sin confirmación o con `window.confirm`. | `ConfirmDialog` compartido con estado `pending`. | Corregido |
| H20 | UX | `apps/admin/app/book/**` | Preguntas obligatorias no bloqueaban el envío; bug de timezone en "día pasado"; ~300 líneas duplicadas. | Validación, fechas desde enteros, helpers compartidos. | Corregido |
| H21 | CI/CD | — | No había CI. | `.github/workflows/ci.yml`: typecheck, migraciones + tests contra Postgres, bundle serverless al día, lint y build del admin. | Corregido (workflow todavía no ejecutado en GitHub) |
| H22 | Docs | `README.md`, `CLAUDE.md` | Documentan módulos inexistentes (setter, prospecting, webhook de Clerk), storage equivocado (R2/disco) y un checklist de módulos muy desactualizado. | Corrección + `docs/ARCHITECTURE.md`. | Corregido |

### MEDIUM

| ID | Área | Archivo | Problema | Estado |
|----|------|---------|----------|--------|
| M1 | Métricas | `dashboard.service.ts`, `reports.service.ts` | "Deals abiertos" y forecast contaban ganados/perdidos; "cerrados/ganados" contaba archivados. | Corregido |
| M2 | Performance | `pipelines.service.ts` | N+1 (una query por pipeline en cada carga del kanban). | Corregido |
| M3 | Performance | `cr`, `finance`, `documents`, `library`, `work-items`, `intake`, `deliverables`, `calendar`, … | ~18 listados sin paginación en backend; resúmenes financieros agregan en JS sobre todas las filas. | **Corregido** — paginación por cursor (`{ data, meta: { nextCursor } }`, default 20, máx. 100) en ~20 listados; resúmenes financieros agregados en SQL |
| M4 | Base de datos | `note`, `document`, `change_request` | Faltan índices `(portal_id, created_at, id)` para listados por portal. | Pendiente (crear con `CONCURRENTLY` fuera de la tx de Drizzle) |
| M5 | Performance | `files.authz.ts` | Cada descarga hace 7 table scans por `storage_key` sin índice. | Corregido (índices en migración `0040`) |
| M6 | Integraciones | `webhooks.service.ts` | Fathom sin `transcript_url` duplica reuniones y notificaciones en cada reintento. | Pendiente |
| M7 | Concurrencia | `calendar.service.ts` | En eventos grupales el `EXCLUDE` anti double-booking solo cubre al owner, no a los co-hosts. | **Corregido** — el chequeo de ocupación incluye reservas grupales de co-hosts y la reserva toma advisory locks por host en orden; slot tomado → 409 |
| M8 | Concurrencia | `cr.service.ts` | Numeración de CR concurrente → `23505` → 500 (no corrompe, pero pierde la CR). | **Corregido** — advisory lock por deal dentro de la transacción de creación |
| M9 | Concurrencia | `finance.service.ts` | `generateRetainerInvoice` puede emitir dos facturas del mismo mes si corre en paralelo (el chequeo de idempotencia es previo al lock). | Pendiente |
| M10 | Jobs | `jobs/reminders.queue.ts` | Sin `attempts`/`backoff`/`removeOnComplete`, sin handler de `error`. | Pendiente |
| M11 | Arquitectura | `calendar.service.ts` (1.6k líneas), `finance.service.ts` (1.3k), `deals/[id]/page.tsx` (1.4k) | God files con costuras claras (ver plan de split en la auditoría de backend/frontend). | **Parcial** — `calendar.service.ts` y `finance.service.ts` partidos en módulos detrás de un barrel (mismos exports); `deals/[id]/page.tsx` pendiente |
| M12 | Calidad | `apps/admin/**` | Formularios grandes sin React Hook Form + Zod (regla del proyecto); non-null assertions. | Pendiente |
| M13 | Integridad | `contacts`/`deals`/`companies` services | Archivar no actualiza `updated_at`. | Pendiente |
| M14 | Base de datos | schema | `ON DELETE` inconsistente en las FKs a `portal` (mitad cascade, mitad restrict). | Pendiente |
| M15 | Confiabilidad | `email-tracking.router.ts` | Escrituras fire-and-forget (se pierden en serverless). | Corregido |
| M16 | UX | `portal-lib/components/portal/forms-panel.tsx`, `step-7-materials.tsx` | El campo "file" de intake no permite subir archivos; uploads sin validación de tipo/tamaño en cliente. | Pendiente |
| M17 | Frontend | `portal-lib/lib/hooks.ts` | Query keys del portal sin tenant (defensa en profundidad; el backend ya aísla). | Pendiente |
| M18 | Base de datos | `db/schema/setter.ts`, `prospecting.ts` | 10 tablas de una feature eliminada. | Pendiente (requiere migración de drop) |
| M19 | UX / a11y | `components/sidebar.tsx`, varios | Sidebar del admin sin versión mobile; acciones visibles solo con hover (inaccesibles por teclado). | Pendiente |
| M20 | Tooling | `apps/api` | La API no tiene lint (el admin ya tiene `.eslintrc.json`). | Pendiente |

### LOW

| ID | Problema | Estado |
|----|----------|--------|
| L1 | Dependencias muertas en la API: `bcryptjs`, `@types/bcryptjs`, `axios`. | Corregido |
| L2 | Store de Zustand vacío (`apps/admin/lib/store/auth.ts`). | Corregido |
| L3 | `window as any` + helper de token de Clerk duplicado en tres archivos del admin. | Corregido |
| L4 | `apps/client-portal/`: solo caché de build, sin `package.json`, sin trackear. | Pendiente (borrar el directorio localmente) |
| L5 | Índice redundante `idx_work_item_portal`; `audit_log` sin índice por portal. | Pendiente |
| L6 | `services/whatsapp-gateway/cli.config.json` con API key placeholder por defecto. | Pendiente |
| L7 | `console.*` en lugar del logger de Fastify y sin request id en logs de servicios. | Pendiente |

---

## 3. Qué quedó bien (verificado)

- **Sin SQL injection**: el motor de filtros (`lib/filter.ts`) usa allowlist de campos y parámetros.
- **El tenant nunca sale del input**: `portalId` siempre se deriva de la sesión de Clerk verificada.
- **CORS** con allowlist y regex de subdominios correctamente anclada.
- **Firmas de webhooks** con `timingSafeEqual`, raw body, y fail-closed sin secreto.
- **Regla de DocuSeal de 40 minutos** respetada en todo el código.
- **`notify.ts`, `files.authz.ts`, `onboarding.service.ts`**: patrones de idempotencia y autorización ejemplares.
- **Paginación por cursor** del backend correcta donde se usa.

---

## 4. Integración de Vercel Blob

Detalle completo en [`docs/STORAGE.md`](../STORAGE.md). Hallazgos de la auditoría de storage y su estado:

| Hallazgo | Riesgo | Estado |
|---|---|---|
| Sin credenciales de Blob en producción (C14) | Archivos perdidos | Corregido |
| Uploads de hasta 25 MB y descargas pasando por la Function (límite 4.5 MB por request y respuesta) | 413 en archivos grandes | Corregido: subida y descarga directas con tokens/URLs presignadas |
| Descargas del admin con `<a href>`/`<img>` sin token (documentos, biblioteca, onboarding) y logo del login del portal | 401 permanente | Corregido |
| Keys no atadas a quien las subió; key huérfana legible por cualquier hub user de cualquier portal; referencias "plantadas" cross-portal | Lectura de archivos de otro tenant | Corregido: ledger `file_upload` + `claimUpload` + authz filtrada por portal |
| Sin validación de tipo al subir; SVG aceptado | Contenido activo / abuso | Corregido: política por purpose + magic bytes; SVG excluido |
| `deleteFile` sin callers: reemplazos y abandonos dejaban huérfanos | Costo y datos sin dueño | Corregido: limpieza de pendientes y liberación del anterior al reemplazar (salvo comprobantes de gastos) |
| `?token=` con la sesión de Clerk en URLs de archivos | Tokens en logs e historial | Corregido: eliminado |
| Logo de propuesta guardado como URL absoluta con host | Roto entre entornos y en la página pública | Obsoleto: la landing de propuestas rediseñada ya no tiene logo del cliente (antes: `logoKey` + ruta pública) |
| `change_request_attachment` y el campo "archivo" de intake | Tabla sin escritor / campo falso | Pendiente (fuera de alcance: no hay flujo que los use) |

**Review adversarial del backend de storage:** sin CRITICAL ni HIGH. Los 4 MEDIUM (limpieza que podía borrar un archivo recién guardado, ediciones concurrentes, llamadas a Blob dentro de la transacción, sin cuota de pendientes) y los LOW L1, L4–L9 se corrigieron. L2 (cachear delegaciones de lectura) y L3 (decodificar imágenes completas) quedan como decisiones documentadas.

**Integración front↔back:** dos roturas detectadas cruzando rutas reales y corregidas antes de cerrar: el claim de materiales de onboarding apuntaba a la ruta del submit del paso 7, y el portal pedía las URLs de acceso bajo `/api/client/files/access`, que no existe.

---

## 5. Validación final

| Check | API | Admin |
|---|---|---|
| Typecheck | Limpio | Limpio |
| Lint | Sin configuración de ESLint (pendiente M20) | 0 errores, 12 warnings previos (`react-hooks/exhaustive-deps`) |
| Tests | 466/466 en la suite completa (37 archivos). Los fallos intermitentes (401/404 al azar) no eran del producto: supertest escuchaba en un puerto efímero sobre `[::]` y otro proceso local podía tomar `127.0.0.1` en ese puerto. Corregido con `listenForSupertest` en los tests de integración | — |
| Build | Vercel genera `dist/server.js` con `build:bundle` (tsup, `@synous/shared` inlineado); ya no se commitea artefacto | OK |
| CI | `.github/workflows/ci.yml` corre typecheck, migraciones, tests y bundle del API, y typecheck, lint y build del admin en cada PR | |

Baseline al inicio de la sesión: typecheck limpio en ambas apps, 343 tests de API, sin CI y sin configuración de ESLint.
