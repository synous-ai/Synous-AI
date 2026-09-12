'use client'

/**
 * Navegación lateral del Client Portal.
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
        'group flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-[7px] text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        collapsed && 'justify-center px-0',
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
      {!collapsed && <span className="flex-1 truncate text-[13px] tracking-wide">{item.label}</span>}
      {badge > 0 && (
        <span
          className={cn(
            'flex items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary',
            collapsed
              ? 'absolute right-1 top-1 h-1.5 w-1.5 p-0'
              : 'h-5 min-w-[20px] px-1.5',
          )}
        >
          {/* Colapsado el número no entra: queda solo el punto como señal. */}
          {!collapsed && (badge > 9 ? '9+' : badge)}
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
        'flex shrink-0 flex-col gap-1 rounded-2xl border border-border bg-card/50 p-1.5 transition-[width] duration-200',
        // Mobile: tira horizontal scrolleable. Una barra lateral se comería el
        // ancho útil de la pantalla.
        'w-full flex-row overflow-x-auto lg:overflow-visible',
        collapsed ? 'lg:w-[60px]' : 'lg:w-56',
        'lg:sticky lg:top-6 lg:flex-col',
      )}
    >
      {!collapsed && (
        <div className="hidden items-center justify-between px-2.5 pb-1 pt-1.5 lg:flex">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
            {heading}
          </span>
        </div>
      )}

      {items.map((item) => (
        <div key={item.id} className="relative shrink-0 lg:shrink">
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
          collapsed && 'justify-center px-0',
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
