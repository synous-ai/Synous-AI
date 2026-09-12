import { sql, type SQL } from 'drizzle-orm'
import { clientOnboarding } from '../../db/schema'
import { Errors } from '../../lib/errors'

/**
 * Modelo del flujo del wizard de onboarding post-venta (8 pasos).
 *
 * FUENTE DE VERDAD ÚNICA: `steps_completed`. `current_step` NO es un contador
 * independiente — se DERIVA de `steps_completed` en el mismo UPDATE (ver
 * `derivedCurrentStep`). Antes era un `Math.max(current_step, N+1)` calculado
 * en JS, lo que permitía estados imposibles de reconstruir: un PATCH
 * /progress con step=4 dejaba `current_step = 5` con `steps_completed = {"4"}`
 * — un puntero a un paso cuyos prerequisitos nunca se cumplieron.
 *
 * Con la derivación, `current_step` = "primer paso incompleto", así que el
 * estado del wizard se reconstruye SIEMPRE desde la DB (reload, logout/login,
 * pestaña nueva) y nunca apunta a un paso inalcanzable.
 */

export const ONBOARDING_TOTAL_STEPS = 8

/** Etiquetas cliente-facing de los pasos, para el detalle de error del gate. */
const STEP_LABELS: Record<number, string> = {
  1: 'bienvenida',
  2: 'cómo funciona',
  3: 'fases del proyecto',
  4: 'modo de trabajo',
  5: 'firma',
  6: 'brief',
  7: 'materiales',
}

export type StepsCompleted = Record<string, string>

/**
 * Primer paso incompleto (o el último si están todos). Espejo en JS de
 * `derivedCurrentStep` — se usa en tests y para razonar sobre el estado sin
 * pegarle a la DB. Tolera "huecos" en filas viejas: busca el primer faltante,
 * no el máximo + 1.
 */
export function resumeStep(stepsCompleted: StepsCompleted): number {
  for (let step = 1; step <= ONBOARDING_TOTAL_STEPS; step++) {
    if (!stepsCompleted[String(step)]) return step
  }
  return ONBOARDING_TOTAL_STEPS
}

/**
 * Exige que TODOS los pasos anteriores estén completos antes de poder
 * completar `step`. Es la barrera server-side contra saltear pasos: el
 * frontend puede mejorar la UX, pero la integridad del flujo no depende de él
 * (un cliente puede pegarle a los endpoints a mano, en cualquier orden).
 *
 * Mantiene el contrato de error del gate del paso 8 que ya existía:
 * 400 + `details.missing` con las etiquetas de lo que falta.
 */
export function assertStepPrerequisites(stepsCompleted: StepsCompleted, step: number): void {
  const missing: string[] = []
  for (let prev = 1; prev < step; prev++) {
    if (!stepsCompleted[String(prev)]) missing.push(STEP_LABELS[prev] ?? String(prev))
  }
  if (missing.length > 0) {
    throw Errors.badRequest(`Faltan completar pasos previos: ${missing.join(', ')}`, { missing })
  }
}

/**
 * Expresión SQL que marca `step` como completado MERGEANDO sobre el valor
 * actual en la misma sentencia, en vez de leer la fila en JS y reescribir el
 * objeto entero.
 *
 * Por qué: el read-modify-write anterior perdía updates. Dos requests casi
 * simultáneas (dos pestañas, doble click, reintento de red) leían el mismo
 * `steps_completed`, cada una le agregaba SU clave y la última en escribir
 * pisaba la del otro. Reproducido: 4 PATCH /progress concurrentes dejaban solo
 * 3 claves en la DB. Con el merge en SQL las escrituras son conmutativas y
 * ninguna se pierde.
 *
 * Orden `patch || actual` (y no al revés) a propósito: ante una clave repetida
 * gana la que YA estaba, así re-marcar un paso no le pisa el timestamp de
 * cuándo se completó de verdad — el update queda idempotente.
 */
export function stepsCompletedMerge(step: number): SQL {
  const patch = JSON.stringify({ [String(step)]: new Date().toISOString() })
  return sql`${patch}::jsonb || ${clientOnboarding.stepsCompleted}`
}

/**
 * `current_step` derivado del `steps_completed` YA MERGEADO: el menor paso de
 * 1..8 que no está presente. Se pasa la misma expresión de merge para que el
 * puntero y el mapa de pasos se escriban de forma consistente en un único
 * UPDATE atómico (sin ventana en la que uno esté actualizado y el otro no).
 *
 * `jsonb_exists(x, k)` en vez del operador `?`: mismo comportamiento, sin
 * ambigüedad con el placeholder `?` de algunos drivers.
 */
export function derivedCurrentStep(merged: SQL): SQL {
  return sql`(
    SELECT COALESCE(MIN(s), ${ONBOARDING_TOTAL_STEPS})
    FROM generate_series(1, ${ONBOARDING_TOTAL_STEPS}) AS s
    WHERE NOT jsonb_exists(${merged}, s::text)
  )`
}
