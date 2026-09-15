# Design: Carpetas y archivos editables en Documentos

## Technical Approach

Carpetas reales de UN nivel (`document_folder`) colgadas de un deal, más `document.folder_id` y `document.uploaded_by_client_account_id`. Las escrituras del cliente van a `/api/client/*` y reutilizan el flujo intent → subida → claim. Las del equipo van a `/api/documents/*`. Toda la lógica (guards, ownership, `record_history`, `audit_log`) vive en services dentro de `db.transaction`. El 403 global de portal-view no se toca. Se entrega en 3 PRs encadenados (API → portal → admin).

## Architecture Decisions

| # | Tema | Opciones | Decisión y por qué |
|---|------|----------|--------------------|
| 1 | Autor de la carpeta | a) `created_by` + `created_by_client_account_id` con CHECK XOR · b) columna polimórfica `actor_type/actor_id` | **a**. Mantiene FKs reales y el CHECK XOR ya existe en `notification`. b pierde la integridad referencial. |
| 2 | Nombres duplicados | a) pre-check en el service · b) índice único parcial `(deal_id, lower(name)) WHERE archived = false` | **b** y mapear `23505` a `Errors.conflict`, como hace `branding.service.ts:302`. El pre-check tiene carreras. Una carpeta archivada libera su nombre. |
| 3 | Invariante `folder.deal_id = document.deal_id` | a) solo service · b) FK compuesta `(folder_id, deal_id) → document_folder(id, deal_id)` + guard en el service | **b**. Con MATCH SIMPLE, `folder_id` null no se chequea. La DB impide que un documento quede en una carpeta de otro deal. El guard da un 400 legible. |
| 4 | Purpose de subida del cliente | a) purpose nuevo `client_document` · b) reutilizar `deal_document` con actores `['hub','client']` | **b**. `files.authz` decide por la fila de `document` sin mirar el purpose, y `claimablePendingRow` filtra con `uploaderIs(actor)`, así que un claim del admin no toma un upload del cliente ni al revés. a exigía migrar el CHECK de `file_upload.purpose`, sumar el tipo en `apps/admin/lib/file-transfer.ts` y agregar un accept, sin ganar seguridad. |
| 5 | Auditoría con actor cliente | — | `writeAudit({ clientId })` (patrón de branding) y `recordFieldChanges({ changedBy: null, sourceType: 'CLIENT_PORTAL' })`. Para el equipo: `userId` y `sourceType: 'API'`. Acciones: `CREATE`, `UPDATE` y `ARCHIVE`, sobre `entityType` `document` o `document_folder`. |
| 6 | Ajeno vs inexistente (cliente) | a) 404 siempre · b) 404 si no lo ve, 403 si lo ve pero no es suyo | **b**. El cliente ya ve el archivo en el listado: un 404 sería falso. Los ids fuera de `clientDealIds` o no visibles dan 404, como en branding. |
| 7 | Roles del equipo | — | Crear, renombrar y mover: `authorize('owner','member','collaborator')`. Archivar documentos y carpetas: `authorize('owner')`. El equipo gestiona cualquier carpeta o archivo del deal. |
| 8 | Carrera mover vs archivar carpeta | — | `assertFolderInDeal` usa `FOR SHARE` sobre la carpeta dentro de la tx. Archivar la carpeta toma `FOR UPDATE`. Así nadie mueve un archivo a una carpeta que se está archivando. |
| 9 | Listado de carpetas | paginado · array completo | **Array completo** por deal: son pocas por proyecto. El conteo sale en 1 query con `LEFT JOIN … count(*) FILTER (WHERE d.archived = false AND …)`. |

### Schema (Drizzle, `apps/api/src/db/schema/documents.ts`)

```ts
export const documentFolder = pgTable('document_folder', {
  id, portalId /*FK portal NN*/, dealId /*FK deal NN*/, name /*text NN*/,
  createdBy: text('created_by').references(() => hubUser.id),
  createdByClientAccountId: text('created_by_client_account_id').references(() => clientAccount.id),
  archived, archivedAt, createdAt, updatedAt,
}, (t) => [
  check('document_folder_creator_check', sql`(created_by IS NOT NULL) <> (created_by_client_account_id IS NOT NULL)`),
  check('document_folder_name_check', sql`char_length(btrim(name)) BETWEEN 1 AND 120`),
  unique('uq_document_folder_id_deal').on(t.id, t.dealId),            // destino de la FK compuesta
  uniqueIndex('uq_document_folder_deal_name').on(t.dealId, sql`lower(${t.name})`).where(sql`archived = false`),
])
// document: + folderId (FK simple), + uploadedByClientAccountId (FK client_account),
// foreignKey({ columns: [folderId, dealId], foreignColumns: [documentFolder.id, documentFolder.dealId] }),
// check('document_uploader_check', sql`NOT (created_by IS NOT NULL AND uploaded_by_client_account_id IS NOT NULL)`),
// index('idx_document_folder').on(folderId).where(sql`archived = false`)
```

La tabla va definida antes de `document` en el mismo archivo. La migración `0043` sale de `db:generate` y es aditiva.

## Data Flow

**Subida del cliente**
```
Portal ─POST /api/client/uploads {purpose:'deal_document'}──► intent (ledger: uploaded_by_client_id)
Portal ─blob/PUT──► store
Portal ─POST /api/client/documents {dealId, folderId?, storageKey, name?}
  API: dealId ∈ clientDealIds? (404) → prepareUploadClaim(actor client) [FUERA de la tx]
  tx: assertDealInPortal(tx) → assertFolderInDeal(tx, FOR SHARE) → claimUpload(tx)
      → INSERT document(type 'other', source 'manual', uploaded_by_client_account_id)
      → writeAudit(clientId, CREATE)
  ◄─201 ClientDocumentDTO ── invalidate ['client','documents'] + ['client','document-folders']
```

**Archivar una carpeta**
```
DELETE …/document-folders/:id
 tx: SELECT folder FOR UPDATE (portal, deal accesible, archived=false; cliente: creador = él → 403)
     UPDATE document SET folder_id=NULL WHERE folder_id=:id RETURNING id, deal_id
     INSERT record_history (bulk: field folder_id, old :id → new null)
     UPDATE document_folder SET archived=true, archived_at=now()
     writeAudit(ARCHIVE, payload {movedDocuments: n})
 ◄─204
```

## Interfaces / Contracts

| Método y ruta | Body/Query (Zod) | Respuesta | Reglas |
|---|---|---|---|
| GET `/api/client/documents` | ListQuery | `ClientDocumentDTO` + `folderId`, `uploadedByMe`, `canManage` | `canManage = uploadedByMe && source !== 'docuseal'`. `uploadedBy` cae al nombre del contact si lo subió el cliente. |
| GET `/api/client/document-folders` | `dealId?` | `ClientDocumentFolderDTO[]` `{id, dealId, name, documentCount, createdAt, canManage}` | Solo deals de `clientDealIds`. |
| POST `/api/client/document-folders` | `{dealId, name}` | 201 | name: `trim().min(1).max(120)`. Duplicado → 409. |
| PATCH `/api/client/document-folders/:id` | `{name}` | 200 | Solo el creador. |
| DELETE `/api/client/document-folders/:id` | — | 204 | Solo el creador. Los archivos vuelven a la raíz. |
| POST `/api/client/documents` | `{dealId, storageKey, folderId?: string\|null, name?}` | 201 | Nunca en "Generales". Sin `name` se usa `originalName`. |
| PATCH `/api/client/documents/:id` | `{name?, folderId?: string\|null}` + refine ≥1 | 200 | Solo el dueño y nunca DocuSeal. Mover no cambia `dealId`. |
| DELETE `/api/client/documents/:id` | — | 204 | Solo el dueño y nunca DocuSeal. |
| GET `/api/documents/folders` | `dealId` (requerido) | `DocumentFolderDTO[]` (+ `createdByClientAccountId`) | `assertDealInPortal`. |
| POST / PATCH `/api/documents/folders[/:id]` | igual | 201/200 | owner, member, collaborator. |
| DELETE `/api/documents/folders/:id` | — | 204 | Solo owner. |
| PATCH `/api/documents/:id` | `{name?, folderId?}` | 200 | owner, member, collaborator. |
| POST `/api/documents` | + `folderId?` | 201 | Ahora audita `CREATE`. |

`DocumentDTO` suma `folderId` y `uploadedByClientAccountId`. Helper nuevo en `portal-access.ts`: `assertFolderInDeal(portalId, dealId, folderId | null | undefined, executor = db)`. Con null pasa. Si no la encuentra lanza `badRequest('Carpeta inexistente')`.

## File Changes

| Archivo | Acción | Descripción |
|---|---|---|
| `apps/api/src/db/schema/documents.ts` + `migrations/0043_*.sql` (generada) | Modify/Create | Tabla, columnas, CHECKs, FK compuesta e índices. |
| `apps/api/src/lib/storage/policy.ts`, `docs/STORAGE.md` | Modify | `deal_document.actors = ['hub','client']`. |
| `apps/api/src/lib/portal-access.ts` | Modify | `assertFolderInDeal`. |
| `apps/api/src/modules/documents/document-folders.service.ts` | Create | CRUD de carpetas para el equipo y el cliente. |
| `apps/api/src/modules/documents/documents.service.ts` / `.schema.ts` / `.router.ts` | Modify | Escrituras de documentos (equipo y cliente), DTOs, schemas y rutas admin. |
| `apps/api/src/modules/client/client.router.ts` | Modify | Rutas del cliente. |
| `apps/api/src/modules/documents/document-folders.test.ts`, `documents.client-writes.test.ts` | Create | Integración con supertest. |
| `apps/admin/portal-lib/lib/types.ts`, `lib/hooks.ts` | Modify | Tipos, `useClientDocumentFolders` y 6 mutations con `invalidateClientDocuments(qc)`. |
| `apps/admin/portal-lib/components/ui/dialog.tsx` | Create | Sobre `@radix-ui/react-dialog`, que ya usa `sheet.tsx`. Sin dependencias nuevas. |
| `apps/admin/portal-lib/components/portal/document-dialogs.tsx`, `document-upload-button.tsx` | Create | Diálogos de nombre, mover y confirmar archivado. Subida con progreso y `FILE_PURPOSE_ACCEPT.deal_document`. |
| `…/portal/documents-shared.tsx` | Modify | `DocumentActions` suma `onRename/onMove/onArchive` y solo los muestra si `canManage && !isPortalView`. |
| `…/portal/document-folder-panel.tsx`, `documents-panel.tsx` | Modify | Vista del deal: grilla de carpetas (`ui/folder.tsx`), archivos de la raíz y toolbar. Vista de subcarpeta. |
| `apps/admin/app/portal/(app)/documents/[folder]/[subfolder]/page.tsx` | Create | `/documents/<dealId>/<folderId>`. "Generales" queda de solo lectura. |
| `apps/admin/lib/hooks/operations.ts`, `lib/types.ts` | Modify | Hooks de carpetas y `useUpdateDocument`. Invalidan `['documents']` y `['document-folders']`. |
| `apps/admin/app/admin/(dashboard)/deals/[id]/_components/deal-documents-tab.tsx` + `page.tsx` | Create/Modify | Saca el tab Docs de `page.tsx`. Archivar se ve solo si `ROLE_MATRIX[useHubUser().role]` tiene `'Eliminar / archivar'`. |
| `CLAUDE.md` | Modify | Guardia de FKs: agregar carpetas de documentos. |

## Testing Strategy

| Capa | Qué | Cómo |
|---|---|---|
| Integración API (Postgres real) | Cliente A escribe en deal de B o de otro portal → 404. En "Generales" → 400. Archivo del equipo o DocuSeal → 403. Carpeta de otro deal → 400. Nombre duplicado (case-insensitive) → 409, y sirve de nuevo tras archivar. Archivar carpeta → archivos a la raíz + `record_history`. Portal-view (`PORTAL_VIEW_HEADER`) en POST/PATCH/DELETE → 403. Member y collaborator no archivan → 403. Claim con key de otro actor → falla. | `buildApp` + supertest + `faketoken:` (patrón de `brand-editing.test.ts`), `uploadServerFile(…'/api/client/uploads')`, `clearPendingUploads`/`removeTestUploads`. |
| DB | La FK compuesta rechaza `folder_id` de otro deal. Un CHECK de creador con los dos null o los dos seteados falla. | Insert directo con `db`. |
| Authz de archivos | El cliente lee su archivo subido y no lo lee una vez archivado. | `/api/files/access`. |
| UI | Sin tests automatizados en el portal. | Verificación manual + `tsc`. |

## Migration / Rollout

- **PR0:** commitear la UI del portal que hoy está sin commitear.
- **PR1** (~800 líneas): schema + `0043` + policy + services + rutas + tests. Los DTOs solo suman campos, así que no rompe la UI actual.
- **PR2** (~450): portal.
- **PR3** (~350): admin.

La única migración está en PR1 y es forward-only y aditiva. Rollback: revertir el código. Las columnas quedan sin uso.

## Open Questions

- [ ] ¿El equipo puede renombrar o archivar carpetas creadas por el cliente? Se asume que sí (owner archiva). Confirmar en spec.
- [ ] ¿Avisar al equipo cuando el cliente sube un archivo? Fuera de alcance por ahora.
