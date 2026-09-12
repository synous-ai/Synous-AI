'use client'

/**
 * Rail de navegación del Client Portal.
 *
 * Es un componente PURO: no sabe de queries ni de rutas, solo recibe ítems y
 * avisa cuál se eligió. Quien lo cablea es `app/portal/(app)/layout.tsx` con
 * `usePortalNav()`.
 *
 * Posición: columna IZQUIERDA que arranca DEBAJO del header (el header mide
 * h-16 = 4rem y es sticky, por eso `top-16` y `h-[calc(100dvh-4rem)]`). No es
 * una card flotante dentro del contenido: es el borde del shell, con hairline
 * a la derecha y scroll propio si la lista crece.
 *
 * Toma el lenguaje visual del sidebar de referencia: encabezado de grupo en
 * versalitas, ítems de 13px con icono fino (strokeWidth 1.5), esquinas de 6px,
 * estado activo por fondo y no por color de marca, badges redondos a la
 * derecha, y colapsar/expandir. Lo que NO se trae es lo que no existe en esta
 * app: el selector de workspace (hay un solo portal por cliente), el modal de
 * búsqueda y los ítems anidados (seis secciones planas no necesitan árbol).
 *
 * Los badges no son decorativos: muestran cuántos ítems esperan una acción del
 * cliente en cada sección, con los MISMOS contadores que usa el panel de
 * inicio (`usePortalPendingCounts`). Es la razón principal para tener sidebar
 * en vez de tabs — desde cualquier sección se ve qué falta en las demás.
 *
 * En mobile el rail no entra (se comería el ancho útil), así que se convierte
 * en una tira horizontal scrolleable pegada debajo del header.
 */

import type { ElementType } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { cn } from '@portal/lib/utils'

export interface PortalNavItem {
  id: string
  label: string
  Icon: ElementType
  /** Ítems que esperan acción del cliente. 0 o ausente ⇒ sin badge. */
  badge?: number
}

function NavItem({
  item,
  active,
  collapsed,
  onSelect,
}: {
  item: PortalNavItem
  active: boolean
  collapsed: boolean
  onSelect: (id: string) => void
}) {
  const badge = item.badge ?? 0
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      aria-current={active ? 'page' : undefined}
      // Con el sidebar colapsado el label no se ve: el title da el tooltip
      // nativo y el aria-label mantiene el nombre accesible.
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        'group flex items-center gap-2.5 rounded-[6px] px-2.5 py-[7px] text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        // Mobile: cada ítem mantiene su ancho natural dentro de la tira.
        // Desktop: ocupa todo el rail.
        'shrink-0 lg:w-full lg:shrink',
        collapsed && 'lg:justify-center lg:px-0',
        active
          ? 'bg-white/10 font-medium text-foreground'
          : 'text-muted-foreground hover:bg-white/5 hover:text-foreground/90',
      )}
    >
      <item.Icon
        className={cn(
          'h-4 w-4 shrink-0 transition-colors',
          active ? 'text-foreground' : 'text-muted-foreground/70 group-hover:text-foreground/70',
        )}
        strokeWidth={1.5}
      />
      <span
        className={cn(
          'flex-1 truncate text-[13px] tracking-wide',
          collapsed && 'lg:hidden',
        )}
      >
        {item.label}
      </span>
      {badge > 0 && (
        <span
          className={cn(
            'flex items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary',
            'h-5 min-w-[20px] px-1.5',
            // Colapsado el número no entra: queda solo un punto como señal.
            collapsed && 'lg:absolute lg:right-2 lg:top-1.5 lg:h-1.5 lg:w-1.5 lg:min-w-0 lg:p-0',
          )}
        >
          <span className={cn(collapsed && 'lg:hidden')}>{badge > 9 ? '9+' : badge}</span>
          <span className="sr-only">{` ${badge} pendiente${badge === 1 ? '' : 's'}`}</span>
        </span>
      )}
    </button>
  )
}

export function PortalSidebar({
  items,
  activeId,
  onSelect,
  collapsed,
  onToggleCollapsed,
  heading = 'Tu proyecto',
}: {
  items: PortalNavItem[]
  activeId: string
  onSelect: (id: string) => void
  collapsed: boolean
  onToggleCollapsed: () => void
  heading?: string
}) {
  return (
    <nav
      aria-label="Secciones del portal"
      className={cn(
        // Mobile: tira horizontal debajo del header, con su propio hairline.
        'sticky top-16 z-10 flex w-full shrink-0 flex-row gap-1 overflow-x-auto',
        'border-b border-border bg-background/80 px-3 py-2 backdrop-blur-md',
        // Desktop: rail izquierdo de altura completa, pegado bajo el header.
        'lg:h-[calc(100dvh-4rem)] lg:flex-col lg:overflow-x-visible lg:overflow-y-auto',
        'lg:border-b-0 lg:border-r lg:bg-transparent lg:px-2.5 lg:py-4 lg:backdrop-blur-none',
        'lg:transition-[width] lg:duration-200',
        collapsed ? 'lg:w-[68px]' : 'lg:w-[240px]',
      )}
    >
      <div
        className={cn(
          'hidden items-center px-2.5 pb-2 lg:flex',
          collapsed && 'lg:hidden',
        )}
      >
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
          {heading}
        </span>
      </div>

      {items.map((item) => (
        <div key={item.id} className="relative flex shrink-0 lg:shrink">
          <NavItem
            item={item}
            active={activeId === item.id}
            collapsed={collapsed}
            onSelect={onSelect}
          />
        </div>
      ))}

      {/* El toggle solo existe en desktop: en mobile la barra es horizontal y
          colapsarla no libera nada. */}
      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-label={collapsed ? 'Expandir el menú' : 'Contraer el menú'}
        className={cn(
          'mt-auto hidden items-center gap-2.5 rounded-[6px] px-2.5 py-[7px] text-muted-foreground/70 transition-colors',
          'hover:bg-white/5 hover:text-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'lg:flex',
          collapsed && 'lg:justify-center lg:px-0',
        )}
      >
        {collapsed ? (
          <PanelLeftOpen className="h-4 w-4 shrink-0" strokeWidth={1.5} />
        ) : (
          <>
            <PanelLeftClose className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            <span className="text-[13px] tracking-wide">Contraer</span>
          </>
        )}
      </button>
    </nav>
  )
}
