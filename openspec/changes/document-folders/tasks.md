# Tasks: Carpetas y archivos editables en Documentos

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1700–1900 (PR1a ~200, PR1b ~420, PR1c ~350, PR2 ~450, PR3 ~350) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1a (schema/migración/guard) → PR1b (API cliente) → PR1c (API admin) → PR2 (UI portal) → PR3 (UI admin) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1a | Schema + migración 0043 + helper `assertFolderInDeal` | PR1a | Base: main (post PR0). Generado con `db:generate`, nunca editar SQL a mano |
| 1b | API cliente (`/api/client/documents`, `/api/client/document-folders`) + tests | PR1b | Base: rama de 1a (o main si stacked) |
| 1c | API admin (`/api/documents/folders`, `PATCH /documents/:id`) + tests + docs (`STORAGE.md`, `CLAUDE.md`) | PR1c | Base: rama de 1b (o main si stacked) |
| 2 | UI portal (carpetas reales sobre PR0) | PR2 | Depende de 1a+1b mergeados |
| 3 | UI admin (tab Docs del deal) | PR3 | Depende de 1a+1c mergeados |

**Precondición**: PR0 (UI portal de carpetas derivadas + título, rama `feat/portal-document-folders-ui`) debe estar mergeado antes de iniciar PR1a — evita conflicto en `documents-shared.tsx`/`document-folder-panel.tsx`.

## PR1a: Schema, migración y guard de tenant

- [x] 1.1 Agregar tabla `document_folder` y columnas `document.folder_id`/`uploaded_by_client_account_id` en `apps/api/src/db/schema/documents.ts` (CHECK XOR creador, `unique(id, deal_id)`, índice único parcial `lower(name)` WHERE `archived=false`, FK compuesta `document(folder_id, deal_id)`). Verif: `tsc --noEmit`.
- [x] 1.2 Generar migración con `pnpm --filter api db:generate` → revisar el SQL resultante (`0043_*.sql` + `meta/0043_snapshot.json`): orden de columnas de la FK compuesta, índice parcial correcto, aditiva. No editar a mano. Verif: `pnpm --filter api db:migrate` local sin error.
- [x] 1.3 Añadir `assertFolderInDeal(portalId, dealId, folderId, executor=db)` en `apps/api/src/lib/portal-access.ts` (null pasa; no encontrada → `badRequest`). Test unitario en `portal-access.test.ts`. Verif: test verde.
- [x] 1.4 Actualizar `CLAUDE.md` — sumar `document_folder` a la lista de cobertura de soft-delete y `assertFolderInDeal` a la lista de helpers de guardia FK. Verif: revisión manual.

## PR1b: API cliente (`/api/client`)

- [ ] 2.1 `documents.client-writes.test.ts` (RED) en `apps/api/src/modules/client/`: subida raíz/carpeta, crear/renombrar/archivar carpeta propia, rechazo carpeta de otro deal, rechazo "Generales", nombre duplicado case-insensitive → 409, reusar tras archivar.
- [ ] 2.2 `clientService.createFolder/renameFolder/archiveFolder/listFolders` en `apps/api/src/modules/client/client.service.ts`: `dealId ∈ clientDealIds` (404), `assertFolderInDeal` FOR SHARE, `record_history`+`audit_log` (sourceType `CLIENT_PORTAL`). Verif: 2.1 en verde.
- [ ] 2.3 `POST/PATCH/DELETE /api/client/document-folders`, `GET .../document-folders?dealId` en `client.router.ts` + schemas Zod en `client.schema.ts`.
- [ ] 2.4 `clientService.createDocument/updateDocument/archiveDocument`: `prepareUploadClaim`/`claimUpload` (purpose `deal_document`), dueño = cliente autenticado, rechazo sobre documento ajeno o DocuSeal, mover solo dentro del mismo deal.
- [ ] 2.5 `POST /api/client/documents`, `PATCH/DELETE /api/client/documents/:id` en router + schemas.
- [ ] 2.6 Test explícito (gap de spec): cliente cuyo `dealId` fue revocado de `clientDealIds` (o el deal se archivó) intenta subir/crear carpeta/renombrar/mover/archivar → 404, mismo trato que deal de otro cliente.
- [ ] 2.7 Test: `X-Portal-View` sobre cualquiera de estas rutas → 403 sin ejecutar cambio (reusa guard global existente).

## PR1c: API admin (`/api/documents`) + docs

- [ ] 3.1 `document-folders.test.ts` (RED) en `apps/api/src/modules/documents/`: crear/renombrar (owner/member/collaborator ok), archivar (solo owner, member→403), nombre duplicado 409 y reuso tras archivar, carpeta/deal de otro portal → rechazo, mover documento de cliente por el equipo, archivar carpeta libera documentos a la raíz + `record_history`.
- [ ] 3.2 `documentsService.createFolder/renameFolder/archiveFolder/listFolders` en `documents.service.ts`: mismo patrón de tx, roles vía `ROLE_MATRIX`, `sourceType 'API'`.
- [ ] 3.3 `documentsService.updateDocument` (rename/folderId) + `createDocument` con `folderId?` opcional; `createDocument` pasa a auditar CREATE.
- [ ] 3.4 `GET/POST/PATCH/DELETE /api/documents/folders`, `PATCH /api/documents/:id` en `documents.router.ts` + schemas en `documents.schema.ts`; `DocumentDTO` suma `folderId`/`uploadedByClientAccountId`.
- [ ] 3.5 Actualizar `docs/STORAGE.md`: documentar que `deal_document` ahora cubre subida de equipo Y cliente, y que `files.authz`/`claimablePendingRow` filtran por `uploaderIs(actor)` sin necesitar un purpose nuevo.
- [ ] 3.6 Test: portal-view intenta escribir sobre carpetas/documentos admin → 403.

## PR2: UI portal (sobre PR0)

- [ ] 4.1 `portal-lib/lib/types.ts` y `lib/hooks.ts`: `useClientDocumentFolders` + mutations (create/rename/archive folder, upload/rename/move/archive document), invalidan `['client','documents']`/`['client','document-folders']`.
- [ ] 4.2 `portal-lib/components/ui/dialog.tsx` (Radix) + `portal/document-dialogs.tsx` (nombre, mover, confirmar archivar).
- [ ] 4.3 `portal/document-upload-button.tsx`: progreso + `FILE_PURPOSE_ACCEPT.deal_document`.
- [ ] 4.4 `documents-shared.tsx`: `DocumentActions` suma `onRename/onMove/onArchive`, visibles solo si `canManage && !usePortalViewer().isPortalView`.
- [ ] 4.5 `document-folder-panel.tsx` + `app/portal/(app)/documents/[folder]/[subfolder]/page.tsx`: grilla de carpetas reales, raíz y subcarpeta; "Generales" queda solo lectura.
- [ ] 4.6 Verif manual: crear/renombrar/archivar carpeta y documento como cliente; confirmar que "Generales" no ofrece crear carpeta.

## PR3: UI admin (tab Docs del deal)

- [ ] 5.1 Extraer tab a `deals/[id]/_components/deal-documents-tab.tsx` desde `page.tsx`.
- [ ] 5.2 `lib/hooks/operations.ts`: `useDealDocumentFolders`, create/update/archive de carpetas, `useUpdateDocument`; invalidan `['documents']`/`['document-folders']`.
- [ ] 5.3 Acción "archivar" visible solo si `ROLE_MATRIX[useHubUser().role]` incluye "Eliminar / archivar"; confirmación antes de archivar (carpeta y documento).
- [ ] 5.4 Verif manual: member ve archivar deshabilitado; owner archiva carpeta y ve documentos vueltos a la raíz.

## Verificación final

- [ ] 6.1 `pnpm --filter api test` completo (serial, Postgres real `devduo_crm_test`) en verde.
- [ ] 6.2 `pnpm --filter api build:bundle` y `tsc --noEmit` en admin sin errores.
