/**
 * migrate-processes-to-library.ts
 *
 * Script idempotente para fusionar los work_items de tipo 'process' en la Biblioteca
 * como library_items de tipo 'sop'. Corresponde al PO3 aprobado.
 *
 * Qué hace:
 *   1. Busca todos los work_items con type='process' y archived=false.
 *   2. PRE-FLIGHT: cuenta cuántos tienen datos no triviales que se van a DESCARTAR
 *      (deal_id no nulo, status distinto del default, priority distinta del default).
 *      Si hay alguno, FRENA y los lista para revisión humana, salvo que se confirme
 *      explícitamente con CONFIRM_DISCARD=1. (Condición 2: "contá antes de descartar".)
 *   3. Por cada proceso: crea un library_item con type='sop', mapeando los campos, y
 *      registra en record_history los valores descartados (traza durable, condición 3).
 *   4. Archiva el work_item origen (archived=true, archived_at=now()).
 *
 * Idempotencia:
 *   El origen se archiva al procesarlo, entonces re-correr el script no duplica
 *   (la query del paso 1 filtra archived=false; los ya procesados no aparecen).
 *   Cada proceso se migra dentro de su propia db.transaction(): si algo falla a
 *   mitad, esa fila queda intacta (NO migrada y NO archivada) y se reintenta sola
 *   en la próxima corrida. (Condición 4: transacción + idempotente.)
 *
 * NOTA SOBRE EL CHECK CONSTRAINT DE work_item.type:
 *   El valor 'process' se mantiene en el CHECK de work_item (no se remueve),
 *   porque hay filas archivadas con ese type. Removerlo del CHECK rompería
 *   esas filas en cualquier UPDATE futuro sobre ellas. Respeta el principio
 *   de soft-delete del CRM: los registros archivados son inmutables en su type.
 *
 * GUARDRAIL de diseño:
 *   Los library_items creados son DEFINICIONES DE REFERENCIA sin estado de ejecución.
 *   Los campos status/priority/dealId del work_item se DESCARTAN deliberadamente —
 *   no tienen semántica en Biblioteca. Los pasos (steps) arrancan como [] porque
 *   los work_items de tipo 'process' no tenían estructura de pasos.
 *
 * Uso:
 *   # 1ra corrida: si hay datos no triviales, frena y los muestra para que los mires.
 *   DATABASE_URL='postgresql://...' pnpm --filter api tsx scripts/migrate-processes-to-library.ts
 *   # tras revisarlos, confirmás el descarte:
 *   CONFIRM_DISCARD=1 DATABASE_URL='postgresql://...' pnpm --filter api tsx scripts/migrate-processes-to-library.ts
 *
 * Precondiciones:
 *   - DATABASE_URL apunta a la DB correcta (dev, staging o producción).
 *   - La migración 0022 ya fue aplicada (ALTER TABLE library_item ADD COLUMN steps, owner_id).
 */

import 'dotenv/config'
import { and, eq } from 'drizzle-orm'
import { db } from '../src/db'
import { workItem } from '../src/db/schema/work-items'
import { libraryItem } from '../src/db/schema/library'
import { recordHistory } from '../src/db/schema/history'
import { createId } from '../src/lib/id'

// Valores default de work_item (ver schema): lo que NO sea esto es "dato no trivial".
const DEFAULT_STATUS = 'open'
const DEFAULT_PRIORITY = 'medium'

async function main(): Promise<void> {
  console.log('=== migrate-processes-to-library ===')
  console.log(`Entorno: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@') ?? '(DATABASE_URL no definida)'}`)
  console.log()

  // 1. Buscar todos los work_items de tipo 'process' que no estén archivados.
  const processes = await db
    .select()
    .from(workItem)
    .where(
      and(
        eq(workItem.type, 'process'),
        eq(workItem.archived, false),
      ),
    )

  if (processes.length === 0) {
    console.log('No se encontraron procesos activos para migrar. El script es idempotente: nada que hacer.')
    return
  }

  console.log(`Procesos encontrados para migrar: ${processes.length}`)
  console.log()

  // 2. PRE-FLIGHT (condición 2): contar lo que se va a DESCARTAR antes de tirarlo.
  //    Un proceso "atado" a un deal o con estado/prioridad no-default puede haber
  //    importado algo; lo querés VER antes de descartarlo, no descubrirlo después.
  const nonTrivial = processes.filter(
    (p) => p.dealId !== null || p.status !== DEFAULT_STATUS || p.priority !== DEFAULT_PRIORITY,
  )

  if (nonTrivial.length > 0) {
    console.log('────────────────────────────────────────────────────────────')
    console.log(`⚠️  ${nonTrivial.length} de ${processes.length} procesos tienen datos NO triviales que se DESCARTARÍAN:`)
    console.log()
    for (const p of nonTrivial) {
      const flags: string[] = []
      if (p.dealId !== null) flags.push(`deal_id=${p.dealId}`)
      if (p.status !== DEFAULT_STATUS) flags.push(`status=${p.status}`)
      if (p.priority !== DEFAULT_PRIORITY) flags.push(`priority=${p.priority}`)
      console.log(`  • "${p.title}" (id=${p.id}) → ${flags.join(', ')}`)
    }
    console.log()

    if (process.env.CONFIRM_DISCARD !== '1') {
      console.log('FRENADO: revisá los procesos de arriba. Si está OK descartar status/priority/deal_id,')
      console.log('re-corré el script con CONFIRM_DISCARD=1 para confirmar el descarte.')
      console.log('(Igualmente quedará traza de los valores descartados en record_history.)')
      console.log('────────────────────────────────────────────────────────────')
      process.exit(2)
    }

    console.log('CONFIRM_DISCARD=1 detectado → se procede con el descarte (queda traza en record_history).')
    console.log('────────────────────────────────────────────────────────────')
    console.log()
  } else {
    console.log('Pre-flight OK: ningún proceso tiene deal_id, status ni priority no-default. Descarte limpio.')
    console.log()
  }

  let migrated = 0
  let failed = 0

  for (const proc of processes) {
    try {
      // Cada proceso en su propia transacción: create + traza + archive son atómicos.
      await db.transaction(async (tx) => {
        const sopId = createId()

        // 3a. Crear el library_item correspondiente.
        //     - type='sop' (los procesos operativos son el hogar natural de SOPs).
        //     - name/description: del work_item original.
        //     - owner_id: del campo assigned_to del work_item (quien lo tenía asignado).
        //     - steps=[]: los work_items 'process' no tenían estructura de pasos; se
        //       inician vacíos para que el equipo los complete en Biblioteca.
        //     - category='Proceso': tag de origen para distinguirlos de SOPs creados
        //       nativamente desde Biblioteca (opcional, facilita filtrado posterior).
        //     - DESCARTADOS: status, priority, dealId (no tienen semántica en Biblioteca).
        await tx
          .insert(libraryItem)
          .values({
            id: sopId,
            portalId: proc.portalId,
            type: 'sop',
            name: proc.title,
            description: proc.description ?? null,
            category: 'Proceso',
            storageKey: null,
            url: null,
            steps: [],
            ownerId: proc.assignedTo ?? null,
            createdBy: proc.createdBy ?? null,
            archived: false,
          })

        // 3b. TRAZA DURABLE (condición 3): registrar en record_history los valores que
        //     se descartan. El descarte es irreversible; si mañana alguno importaba,
        //     queda guardado y consultable (no se recupera del aire).
        await tx.insert(recordHistory).values({
          portalId: proc.portalId,
          entityType: 'library_item',
          entityId: sopId,
          fieldName: 'migrated_from_process',
          oldValue: JSON.stringify({
            workItemId: proc.id,
            status: proc.status,
            priority: proc.priority,
            dealId: proc.dealId,
            timeframe: proc.timeframe,
          }),
          newValue: null,
          sourceType: 'migration',
          changedBy: proc.createdBy ?? null,
        })

        // 3c. Archivar el work_item origen (soft-delete, NO borrar).
        //     Esto garantiza la idempotencia: en la próxima ejecución, este ítem
        //     ya no aparecerá en la query (archived=false filtra estos).
        await tx
          .update(workItem)
          .set({
            archived: true,
            archivedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(workItem.id, proc.id))
      })

      console.log(`  ✓ Migrado: "${proc.title}" (work_item id=${proc.id})`)
      migrated++
    } catch (err) {
      console.error(`  ✗ Error migrando "${proc.title}" (id=${proc.id}):`, err)
      failed++
      // No abortamos el script: seguimos con el siguiente proceso.
    }
  }

  console.log()
  console.log('=== Resumen ===')
  console.log(`  Procesados: ${processes.length}`)
  console.log(`  Migrados exitosamente: ${migrated}`)
  console.log(`  Fallidos (ver errores arriba): ${failed}`)
  console.log()

  if (failed > 0) {
    console.log('ATENCIÓN: hubo errores. Los work_items fallidos NO fueron archivados.')
    console.log('Podés volver a correr el script para reintentar solo los pendientes.')
    process.exit(1)
  } else {
    console.log('Migración completada. Los work_items originales fueron archivados (soft-delete).')
    console.log('La traza de los campos descartados quedó en record_history (field_name=migrated_from_process).')
    console.log('Podés encontrar los procesos en Biblioteca → SOPs.')
  }
}

main().catch((err) => {
  console.error('Error fatal:', err)
  process.exit(1)
})
