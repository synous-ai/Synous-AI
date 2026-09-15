# Proposal: Carpetas y archivos editables en Documentos

## Intent

Hoy Documentos es de solo lectura para el cliente y las carpetas se arman en el navegador según el `dealId`. Cliente y equipo necesitan ordenar los archivos de cada proyecto: crear carpetas, subir, renombrar, mover y borrar (soft delete).

## Scope

### In Scope
- Carpetas propias de UN nivel dentro de cada proyecto (deal). Se mantienen las carpetas automáticas por proyecto y "Generales".
- Cliente: subir a cualquier carpeta de sus proyectos. Renombrar, mover y borrar solo lo que subió y las carpetas que creó.
- Equipo (admin): lo mismo desde la pestaña Docs del deal.
- Borrar una carpeta la archiva y sus archivos vuelven a la raíz del proyecto (`folder_id = null`).
- Mover archivos solo entre carpetas del MISMO proyecto.

### Out of Scope
- Carpetas anidadas, papelera o restaurar, mover entre proyectos.
- Escrituras del cliente en "Generales" (`deal_id` null).
- Borrar documentos DocuSeal desde el portal.
- Escrituras en portal-view: el 403 global se mantiene.

## Capabilities

### New Capabilities
- `document-folders`: carpetas de un nivel por proyecto, con reglas de permisos para cliente y admin.
- `portal-document-writes`: el cliente sube, renombra, mueve y archiva sus propios documentos.

### Modified Capabilities
- None (todavía no hay `openspec/specs/`).

## Approach

- **DB** (migración aditiva generada con drizzle-kit):
  - Tabla nueva `document_folder`: `portal_id`, `deal_id` NOT NULL, `name`, quién la creó (`created_by` o `created_by_client_account_id`, con un CHECK de exactamente uno), `archived`/`archived_at`.
  - Columnas nuevas en `document`: `folder_id` y `uploaded_by_client_account_id`, ambas nullable.
- **API cliente** (`/api/client`):
  - `GET/POST/PATCH/DELETE document-folders`.
  - `POST documents`, que registra el archivo subido con `prepareUploadClaim`/`claimUpload`.
  - `PATCH/DELETE documents/:id`.
  - Toda escritura exige `deal_id ∈ clientDealIds`, que el cliente sea el dueño y que la carpeta sea del mismo deal.
- **API admin**: `PATCH /documents/:id` (renombrar o mover) y CRUD de carpetas, con `assertDealInPortal`.
- **Service**: transacciones, `record_history` (name, folder_id) y `audit_log` en crear, renombrar, mover y archivar. Todo listado y conteo filtra `archived = false`.
- **UI**: el portal pasa de carpetas derivadas a carpetas reales, y la pestaña Docs del deal suma carpetas y acciones.

## Affected Areas

| Area | Impact |
|------|--------|
| `apps/api/src/db/schema/documents.ts` + migración 0043 | Modified/New |
| `apps/api/src/modules/documents/*` | Modified |
| `apps/api/src/modules/client/client.router.ts` | Modified |
| `apps/api/src/lib/portal-access.ts`, `lib/storage/policy.ts` | Modified |
| `apps/admin/portal-lib/components/portal/documents-*.tsx`, `document-folder-panel.tsx`, `app/portal/(app)/documents/[folder]/` | Modified |
| `apps/admin/app/admin/(dashboard)/deals/[id]/page.tsx`, `lib/hooks/operations.ts` | Modified |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Fuga entre clientes (`portal_id` es el tenant de la agencia) | Med | Chequear `clientDealIds` en cada escritura. Tests de acceso cruzado. |
| Carpeta de otro deal o de otro tenant | Med | Guard nuevo `assertFolderInDeal`, que también corre dentro de la tx |
| `storageKey` inyectado por el cliente | Low | Solo se acepta un claim |
| La UI del portal sin commitear en `main` choca con el cambio | Med | Commitearla antes del slice 2 |

## Rollback Plan

La migración es forward-only y aditiva: tabla nueva y columnas nullable.
- Rollback = revertir el código de la app. Las columnas quedan sin uso y los documentos se siguen viendo en la raíz de su proyecto.
- No hace falta restaurar un backup.

## Dependencies

- Commitear primero la UI del portal que hoy está sin commitear.

## Tamaño estimado

Unas 1.600 líneas en total. Conviene dividirlo en PRs encadenados:
1. DB + API + tests: ~800
2. UI del portal: ~450
3. UI de admin: ~350

## Open Questions

- ¿Qué roles del equipo pueden archivar documentos y carpetas? Hoy `DELETE /documents/:id` es solo `owner`.

## Success Criteria

- [ ] El cliente crea, renombra y borra carpetas y sube, renombra, mueve y borra sus archivos en sus proyectos.
- [ ] Hay tests que prueban el 403/404 cuando el cliente escribe en otro deal, en "Generales", en archivos ajenos o en DocuSeal, y cuando escribe en portal-view.
- [ ] Borrar una carpeta devuelve sus archivos a la raíz. No hay DELETE físico.
- [ ] Cada rename, move y archive queda en `record_history`/`audit_log`.
