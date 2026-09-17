# document-folders Specification

## Purpose

Carpetas de un nivel dentro de cada proyecto (deal) para ordenar documentos, con reglas de permisos por rol y tenant, y trazabilidad de cambios. Cubre la gestión de carpetas (equipo y cliente) y las acciones del equipo sobre documentos.

## Requirements

### Requirement: Alcance de carpetas por proyecto

El sistema DEBE permitir crear carpetas únicamente dentro de un proyecto (deal) del mismo tenant/agencia que el actor. La vista "Generales" (sin proyecto) NO admite creación de carpetas.

#### Scenario: Admin crea carpeta en un deal de su portal
- GIVEN un usuario del equipo con rol owner, member o collaborator
- WHEN crea una carpeta dentro de un deal de su propio portal
- THEN la carpeta se crea activa y visible en el listado de ese deal

#### Scenario: Carpeta o deal de otro portal es rechazado
- GIVEN un deal_id o folder_id que pertenece a otro portal/tenant
- WHEN se intenta crear, renombrar o mover una carpeta, o mover un documento, contra ese id
- THEN el sistema rechaza la operación sin exponer si el recurso existe

### Requirement: Nombres de carpeta únicos por proyecto

El sistema DEBE rechazar la creación o el renombrado de una carpeta si ya existe una carpeta ACTIVA con el mismo nombre en el mismo proyecto. Una carpeta archivada no bloquea la reutilización del nombre.

#### Scenario: Nombre duplicado entre carpetas activas
- GIVEN el proyecto ya tiene una carpeta activa llamada "Contratos"
- WHEN se intenta crear u renombrar otra carpeta a "Contratos" en el mismo proyecto
- THEN el sistema rechaza la operación con un error de validación

#### Scenario: Nombre reutilizado tras archivar
- GIVEN el proyecto tenía una carpeta archivada llamada "Contratos"
- WHEN se crea una nueva carpeta activa llamada "Contratos" en el mismo proyecto
- THEN el sistema permite la creación

### Requirement: Archivar carpeta libera sus documentos

Archivar una carpeta NUNCA debe borrarla físicamente ni borrar sus documentos.

#### Scenario: Archivar carpeta mueve documentos a la raíz
- GIVEN una carpeta activa con documentos activos asociados
- WHEN un actor autorizado la archiva
- THEN la carpeta deja de listarse
- AND sus documentos pasan a la raíz del proyecto (sin carpeta) y siguen visibles ahí

### Requirement: Listados excluyen elementos archivados

El sistema DEBE excluir carpetas y documentos archivados de todo listado y conteo, tanto en el portal como en el admin.

#### Scenario: Carpeta o documento archivado no aparece
- GIVEN una carpeta o un documento archivado
- WHEN cualquier actor lista el contenido del proyecto
- THEN ese elemento no aparece en el resultado ni se cuenta

### Requirement: Autorización del equipo sobre carpetas y documentos

Los roles owner, member y collaborator PUEDEN crear, renombrar y mover carpetas y documentos dentro de un deal de su portal. Solo el rol owner PUEDE archivar carpetas o documentos.

#### Scenario: Member crea y renombra sin poder archivar
- GIVEN un usuario con rol member
- WHEN crea una carpeta, renombra una carpeta o un documento, o mueve un documento entre carpetas del mismo deal
- THEN la operación se permite
- WHEN el mismo usuario intenta archivar una carpeta o un documento
- THEN el sistema rechaza la operación

#### Scenario: Owner archiva carpeta o documento
- GIVEN un usuario con rol owner
- WHEN archiva una carpeta o un documento de un deal de su portal
- THEN la operación se permite

### Requirement: El equipo gestiona cualquier documento del deal

Un usuario del equipo autorizado (owner, member o collaborator) PUEDE renombrar o mover cualquier documento del deal, sin importar quién lo subió.

#### Scenario: Admin mueve documento subido por el cliente
- GIVEN un documento subido por una cuenta de cliente
- WHEN un usuario del equipo lo mueve a otra carpeta del mismo deal
- THEN la operación se permite y queda registrada

### Requirement: Portal-view de solo lectura

Un usuario del equipo autenticado con vista de portal (X-Portal-View) NUNCA puede ejecutar una escritura sobre carpetas ni documentos.

#### Scenario: Portal-view intenta escribir
- GIVEN un admin autenticado con X-Portal-View sobre un portal de cliente
- WHEN intenta crear, renombrar, mover o archivar una carpeta o un documento
- THEN el sistema responde 403 sin ejecutar el cambio

### Requirement: Trazabilidad de cambios

El sistema DEBE registrar quién, cuándo y qué operación se ejecutó (crear, renombrar, mover, archivar) sobre cada carpeta y documento, incluyendo el valor anterior y el nuevo cuando aplique.

#### Scenario: Rename queda auditado
- GIVEN una carpeta o documento renombrado
- WHEN se consulta el historial del proyecto
- THEN aparece un registro con el nombre anterior, el nuevo y el actor que lo hizo

### Requirement: La UI del admin refleja los permisos

La pestaña de documentos del deal DEBE mostrar, deshabilitar u ocultar (con motivo visible) las acciones de crear, renombrar, mover y archivar según el rol del usuario autenticado, y pedir confirmación antes de archivar.

#### Scenario: Member ve "archivar" deshabilitado
- GIVEN un usuario con rol member viendo la pestaña Docs de un deal
- WHEN observa una carpeta o documento
- THEN la acción "archivar" aparece deshabilitada indicando que requiere rol owner

#### Scenario: Confirmación antes de archivar
- GIVEN un owner con permiso para archivar
- WHEN hace clic en archivar una carpeta o un documento
- THEN el sistema pide confirmación antes de ejecutar la acción
