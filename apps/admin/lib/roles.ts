import type { HubUserRole } from './types'

/**
 * Roles de hub_user: etiquetas, descripciones y matriz de capacidades.
 *
 * IMPORTANTE — `collaborator` se muestra como "Developer".
 * El valor almacenado en la DB y validado por el CHECK constraint de `hub_user`
 * sigue siendo `collaborator`, y es el que usan las ~36 llamadas a
 * `authorize('owner','member','collaborator')` de la API. Acá SOLO cambia la
 * etiqueta visible, porque "Developer" describe mejor a quién se le asigna el
 * rol en la práctica. No renombrar el valor sin una migración + actualizar todos
 * los call sites de authorize().
 *
 * Este archivo es la ÚNICA fuente de verdad de etiquetas y permisos para la UI:
 * lo consumen la matriz de Configuración → Roles y el alta/edición de usuarios.
 * Si divergen, vuelven a aparecer pantallas que dicen cosas distintas.
 */

/** Orden de permisos, de mayor a menor. */
export const ROLE_ORDER: HubUserRole[] = ['owner', 'member', 'collaborator', 'viewer']

export const ROLE_LABEL: Record<HubUserRole, string> = {
  owner: 'Owner',
  member: 'Member',
  collaborator: 'Developer',
  viewer: 'Viewer',
}

export const ROLE_DESCRIPTION: Record<HubUserRole, string> = {
  owner:
    'Control total del portal. Único rol que puede archivar registros, gestionar usuarios y cambiar la configuración.',
  member:
    'Opera el día a día del CRM y además ve finanzas y emite facturas. No archiva registros ni gestiona usuarios.',
  collaborator:
    'Perfil para desarrolladores: opera el CRM (crear y editar registros) pero no accede a finanzas, usuarios ni configuración.',
  viewer: 'Solo lectura. Puede ver registros pero no crear, editar ni archivar.',
}

export type Capability =
  | 'Ver registros'
  | 'Crear registros'
  | 'Editar registros'
  | 'Eliminar / archivar'
  | 'Configurar portal'
  | 'Gestionar usuarios'
  | 'Ver finanzas'
  | 'Emitir facturas'
  | 'Acceso al portal de clientes'

export const CAPABILITIES: Capability[] = [
  'Ver registros',
  'Crear registros',
  'Editar registros',
  'Eliminar / archivar',
  'Configurar portal',
  'Gestionar usuarios',
  'Ver finanzas',
  'Emitir facturas',
  'Acceso al portal de clientes',
]

/**
 * Matriz verificada contra los `authorize()` reales de la API:
 *   - Crear / editar registros → authorize('owner','member','collaborator')
 *   - Eliminar / archivar      → authorize('owner') en deals, contacts, companies
 *                                y pipelines. (Excepción: el borrado del módulo
 *                                calendario admite también member.)
 *   - Finanzas                 → authorize('owner','member') (hook global del router)
 *   - Configurar portal        → authorize('owner')
 *   - Gestionar usuarios       → authorize('owner') en POST y PATCH /api/users
 *
 * "Acceso al portal de clientes" se mantiene como estaba: el módulo `clients`
 * expone solo GETs sin `authorize()`, así que la restricción declarada acá no
 * refleja una regla del backend. Pendiente de definir qué significa exactamente.
 */
export const ROLE_MATRIX: Record<HubUserRole, Set<Capability>> = {
  owner: new Set<Capability>([
    'Ver registros',
    'Crear registros',
    'Editar registros',
    'Eliminar / archivar',
    'Configurar portal',
    'Gestionar usuarios',
    'Ver finanzas',
    'Emitir facturas',
    'Acceso al portal de clientes',
  ]),
  member: new Set<Capability>([
    'Ver registros',
    'Crear registros',
    'Editar registros',
    'Ver finanzas',
    'Emitir facturas',
    'Acceso al portal de clientes',
  ]),
  collaborator: new Set<Capability>([
    'Ver registros',
    'Crear registros',
    'Editar registros',
    'Acceso al portal de clientes',
  ]),
  viewer: new Set<Capability>(['Ver registros']),
}

/** Etiqueta visible de un rol; tolera valores desconocidos que vengan de la API. */
export function roleLabel(role: string): string {
  return ROLE_LABEL[role as HubUserRole] ?? role
}
