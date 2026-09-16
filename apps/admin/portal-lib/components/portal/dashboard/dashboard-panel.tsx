'use client'

import { useClientProject } from '@portal/lib/hooks'
import { ApiError } from '@portal/lib/api'
import { ProjectOverview } from '@portal/components/portal/dashboard/project-overview'
import { ProjectUpdates } from '@portal/components/portal/dashboard/project-updates'
import { AttentionSection } from '@portal/components/portal/dashboard/attention-section'
import { RecentActivity } from '@portal/components/portal/dashboard/recent-activity'
import { DashboardSection, SectionError } from '@portal/components/portal/dashboard/dashboard-section'
import { ProjectOverviewSkeleton } from '@portal/components/portal/dashboard/dashboard-skeletons'

/**
 * Inicio del Client Portal — el centro del portal, no un índice del sidebar.
 *
 * ─── Jerarquía ──────────────────────────────────────────────────────────────
 * El orden responde, de arriba abajo, a las preguntas con las que un cliente
 * entra:
 *
 *   1. Tu proyecto          ¿cómo viene? ¿en qué fase estamos? ¿qué sigue?
 *   2. Requiere tu atención ¿qué tengo que hacer YO?
 *   3. Últimos avances      ¿qué nos contó el equipo?
 *   4. Actividad reciente   ¿qué pasó solo?
 *
 * El proyecto va primero aunque haya pendientes: el contexto ("estamos en
 * Verificación") es lo que hace que un pendiente se entienda. Las acciones
 * pesan más que las novedades, y la actividad es lo más liviano de todo.
 *
 * ─── Errores por sección ────────────────────────────────────────────────────
 * Cada sección resuelve su propio error. Si la actividad no carga pero el
 * proyecto sí, el cliente sigue viendo su proyecto y un reintento puntual
 * donde falló. Ninguna request secundaria puede dejar la pantalla inservible.
 *
 * ─── Requests ───────────────────────────────────────────────────────────────
 * Cinco queries en total, todas en paralelo y todas compartidas por queryKey
 * con el resto del shell: el proyecto (acá), entregables / formularios /
 * solicitudes / facturas (vía `usePortalPendingCounts`, el mismo hook que los
 * badges del sidebar ya montó) y las notificaciones (la misma key que la
 * campana del header). No hay ningún endpoint nuevo ni agregador propio del
 * Inicio: esta pantalla lee lo que el portal ya pide.
 */
export function DashboardPanel() {
  const project = useClientProject()

  // 404 de GET /api/client/project = "no hay proyecto activo" (lo tira
  // `resolveActiveClientDeal`). Es un estado legítimo del producto, no una
  // falla: el cliente tiene cuenta pero todavía no tiene un deal asociado.
  const hasNoProject = project.error instanceof ApiError && project.error.status === 404

  return (
    <div className="space-y-10">
      <DashboardSection id="dashboard-project" title="Tu proyecto">
        {project.isLoading ? (
          <ProjectOverviewSkeleton />
        ) : hasNoProject ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
            Todavía no tenés un proyecto activo. Cuando lo tengas, vas a ver acá su estado y su avance.
          </p>
        ) : project.isError || !project.data ? (
          <SectionError
            message="No pudimos cargar el estado de tu proyecto."
            onRetry={() => void project.refetch()}
          />
        ) : (
          <ProjectOverview project={project.data} />
        )}
      </DashboardSection>

      {/* Independiente del proyecto a propósito: un cliente sin proyecto
          activo puede tener igual una factura pendiente, y esconderle esa
          deuda porque otra query falló sería peor que mostrarla sola. */}
      <AttentionSection />

      {/* Las novedades viajan DENTRO de la respuesta del proyecto (`updates`),
          así que comparten su estado de carga: sin datos de proyecto no hay
          novedades que mostrar, y repetir acá el error del proyecto sería
          decir dos veces lo mismo. */}
      {project.data && <ProjectUpdates updates={project.data.updates} />}

      <RecentActivity />
    </div>
  )
}
