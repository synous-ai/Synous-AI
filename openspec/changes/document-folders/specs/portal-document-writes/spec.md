# portal-document-writes Specification

## Purpose

El cliente sube, renombra, mueve y archiva sus propios documentos, y crea/renombra/archiva sus propias carpetas, dentro de los proyectos (deals) a los que tiene acceso. Define límites de tenant, propiedad y tipo de documento.

## Requirements

### Requirement: Subida de archivos por el cliente

El cliente PUEDE subir archivos a la raíz de su proyecto o a una carpeta existente del mismo proyecto. Toda subida DEBE completarse mediante el flujo de reserva/confirmación de subida (claim); el sistema NUNCA debe aceptar una referencia de archivo que el cliente no reclamó a través de ese flujo.

#### Scenario: Subida a la raíz del proyecto
- GIVEN una cuenta de cliente con acceso activo a un deal
- WHEN sube un archivo sin indicar carpeta
- THEN el documento se registra en la raíz de ese proyecto

#### Scenario: Subida a carpeta propia del proyecto
- GIVEN una carpeta activa dentro de un deal del cliente
- WHEN el cliente sube un archivo indicando esa carpeta
- THEN el documento se registra dentro de esa carpeta

#### Scenario: Referencia de archivo no reclamada es rechazada
- GIVEN un cliente intenta registrar un documento apuntando a un archivo que no subió mediante el flujo de subida
- WHEN envía la solicitud
- THEN el sistema la rechaza sin crear el documento

### Requirement: Creación de carpetas por el cliente

El cliente PUEDE crear carpetas únicamente dentro de deals a los que tiene acceso activo, en su propio portal.

#### Scenario: Crear carpeta en proyecto propio
- GIVEN un cliente con acceso activo a un deal
- WHEN crea una carpeta en ese deal
- THEN la carpeta se crea activa, asociada a ese cliente como creador

#### Scenario: Rechazo en proyecto de otro cliente
- GIVEN un deal al que el cliente NO tiene acceso (pertenece a otra empresa cliente del mismo portal)
- WHEN intenta crear una carpeta ahí
- THEN el sistema rechaza la operación

#### Scenario: Rechazo en tenant de otra agencia
- GIVEN un deal_id que pertenece a un portal/agencia distinto del propio
- WHEN el cliente intenta crear una carpeta con ese deal_id
- THEN el sistema rechaza la operación

#### Scenario: Rechazo en "Generales"
- GIVEN la vista "Generales" (documentos sin proyecto)
- WHEN el cliente intenta crear una carpeta ahí
- THEN el sistema rechaza la operación

#### Scenario: Nombre de carpeta duplicado en el mismo proyecto
- GIVEN el cliente ya tiene una carpeta activa "Facturas" en un deal
- WHEN intenta crear otra carpeta "Facturas" en el mismo deal
- THEN el sistema rechaza la operación

### Requirement: El cliente solo gestiona lo propio

El cliente PUEDE renombrar, mover o archivar únicamente las carpetas que él creó y los documentos que él subió. El sistema DEBE rechazar la operación si el elemento fue creado/subido por el equipo o por otra cuenta de cliente.

#### Scenario: Renombrar/archivar carpeta propia
- GIVEN una carpeta creada por el cliente autenticado
- WHEN la renombra o la archiva
- THEN la operación se permite

#### Scenario: Rechazo sobre carpeta del equipo
- GIVEN una carpeta creada por un usuario del equipo (admin)
- WHEN el cliente intenta renombrarla o archivarla
- THEN el sistema rechaza la operación

#### Scenario: Rechazo sobre carpeta de otra cuenta cliente
- GIVEN una carpeta creada por otra cuenta de cliente de la misma empresa
- WHEN el cliente autenticado intenta renombrarla o archivarla
- THEN el sistema rechaza la operación

#### Scenario: Rechazo sobre documento ajeno
- GIVEN un documento subido por el equipo o por otra cuenta de cliente
- WHEN el cliente intenta renombrarlo, moverlo o archivarlo
- THEN el sistema rechaza la operación

### Requirement: Archivar carpeta propia libera sus archivos

Archivar una carpeta creada por el cliente sigue la misma regla que en el admin: los documentos vuelven a la raíz del proyecto y no se borran.

#### Scenario: Cliente archiva su carpeta
- GIVEN una carpeta del cliente con documentos activos
- WHEN el cliente la archiva
- THEN la carpeta deja de listarse y sus documentos quedan en la raíz del proyecto

### Requirement: Mover documentos solo dentro del mismo proyecto

El cliente PUEDE mover un documento propio entre carpetas del MISMO deal. El sistema DEBE rechazar cualquier intento de mover un documento a una carpeta de otro deal.

#### Scenario: Mover dentro del mismo proyecto
- GIVEN un documento propio y una carpeta activa del mismo deal
- WHEN el cliente lo mueve a esa carpeta
- THEN el documento queda asociado a la nueva carpeta

#### Scenario: Rechazo al mover entre proyectos
- GIVEN un documento propio de un deal y una carpeta de OTRO deal (propio o ajeno)
- WHEN el cliente intenta moverlo ahí
- THEN el sistema rechaza la operación

### Requirement: Documentos DocuSeal no son archivables por el cliente

El cliente NUNCA puede archivar un documento cuyo origen sea DocuSeal, sin importar si lo subió o no.

#### Scenario: Rechazo de archivado sobre documento DocuSeal
- GIVEN un documento firmado/generado vía DocuSeal visible en el portal
- WHEN el cliente intenta archivarlo
- THEN el sistema rechaza la operación

### Requirement: Portal-view de solo lectura sobre acciones del cliente

Un admin autenticado con vista de portal (X-Portal-View) NUNCA puede ejecutar una escritura de subida, renombrado, movimiento o archivado sobre documentos ni carpetas del portal que está viendo.

#### Scenario: Portal-view intenta subir o modificar un documento
- GIVEN un admin autenticado con X-Portal-View
- WHEN intenta subir, renombrar, mover o archivar un documento o una carpeta del portal que está viendo
- THEN el sistema responde 403 sin ejecutar el cambio

### Requirement: El listado expone qué puede gestionar el cliente

Cada carpeta y documento listado en el portal DEBE indicar si el cliente autenticado puede renombrarlo, moverlo y archivarlo, para que la interfaz muestre las acciones disponibles sin necesitar un intento fallido.

#### Scenario: UI oculta acciones no permitidas
- GIVEN un documento subido por el equipo, listado en el portal
- WHEN el cliente lo ve en su lista de documentos
- THEN las acciones de renombrar, mover y archivar aparecen deshabilitadas u ocultas para ese documento

#### Scenario: UI muestra acciones permitidas con confirmación
- GIVEN una carpeta o documento propio del cliente
- WHEN el cliente hace clic en archivar
- THEN el sistema pide confirmación antes de ejecutar la acción

### Requirement: Trazabilidad de acciones del cliente

El sistema DEBE registrar cada creación, renombrado, movimiento o archivado ejecutado por una cuenta de cliente, incluyendo qué cuenta lo hizo.

#### Scenario: Acción del cliente queda auditada
- GIVEN un cliente crea, renombra, mueve o archiva una carpeta o documento
- WHEN se consulta el historial del proyecto
- THEN aparece un registro de esa acción con la cuenta de cliente como actor
