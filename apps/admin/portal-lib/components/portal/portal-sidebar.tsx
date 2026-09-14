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
 * ─── Por qué colapsar NO produce saltos ─────────────────────────────────────
 * La versión anterior achicaba el rail y, al mismo tiempo, escondía el label
 * con `hidden` y mudaba el badge de píldora a punto. Tres cambios de LAYOUT
 * simultáneos: el navegador reacomodaba el contenido del ítem en cada frame de
 * la animación y el texto parpadeaba antes de que el ancho terminara de moverse.
 *
 * Ahora el contenido del ítem NO se reacomoda nunca:
 *  - cada ítem tiene ancho FIJO (216px) en los dos estados; lo que cambia es
 *    solo el ancho del rail, que RECORTA (`overflow-x-hidden`)
 *  - el label y el badge se van en `opacity`, que no dispara reflow
 *  - los números están elegidos para que el icono quede en el MISMO pixel en
 *    ambos estados: rail colapsado 64px, padding 12 + 12 + medio icono 8 = 32,
 *    que es exactamente el centro de 64. El icono no se mueve ni un pixel.
 *
 * Toma el lenguaje visual del sidebar de referencia: ítems de 13px con icono
 * fino (strokeWidth 1.5), esquinas de 6px, estado activo por fondo y no por
 * color de marca, badges redondos a la derecha, y colapsar/expandir. Lo que NO
 * se trae es lo que no existe en esta app: el selector de workspace (hay un
 * solo portal por cliente), el modal de búsqueda y los ítems anidados (seis
 * secciones planas no necesitan árbol).
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

/** Ancho del contenido de cada fila. Constante en ambos estados: el rail recorta. */
const ITEM_WIDTH = 'lg:w-[216px]'
/** Transición común — que todo se mueva junto y lea como UN gesto, no tres. */
const FADE = 'transition-opacity duration-200 ease-out'

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
      // Con el rail colapsado el label no se ve: el title da el tooltip nativo
      // y el aria-label mantiene el nombre accesible.
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        'group flex shrink-0 items-center gap-2.5 rounded-[6px] px-3 py-[7px] text-left',
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        ITEM_WIDTH,
        active
          ? 'bg-white/10 font-medium text-foreground'
          : 'text-muted-foreground hover:bg-white/5 hover:text-foreground/90',
      )}
    >
      <span className="relative flex shrink-0">
        <item.Icon
          className={cn(
            'h-4 w-4 transition-colors',
            active ? 'text-foreground' : 'text-muted-foreground/70 group-hover:text-foreground/70',
          )}
          strokeWidth={1.5}
        />
        {/* Colapsado el número no entra: queda el punto como única señal. Va
            montado siempre y solo cambia de opacidad — aparecerlo con `hidden`
            lo hacía saltar al terminar la animación del ancho. */}
        {badge > 0 && (
          <span
            aria-hidden
            className={cn(
              'absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-primary opacity-0',
              FADE,
              collapsed && 'lg:opacity-100',
            )}
          />
        )}
      </span>

      <span
        className={cn(
          'flex-1 whitespace-nowrap text-[13px] tracking-wide',
          FADE,
          collapsed && 'lg:opacity-0',
        )}
      >
        {item.label}
      </span>

      {badge > 0 && (
        <span
          className={cn(
            'flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full',
            'bg-primary/15 px-1.5 text-[10px] font-semibold text-primary',
            FADE,
            collapsed && 'lg:opacity-0',
          )}
        >
          {badge > 9 ? '9+' : badge}
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
}: {
  items: PortalNavItem[]
  activeId: string
  onSelect: (id: string) => void
  collapsed: boolean
  onToggleCollapsed: () => void
}) {
  return (
    <nav
      aria-label="Secciones del portal"
      className={cn(
        // Mobile: tira horizontal debajo del header, con su propio hairline.
        'sticky top-16 z-10 flex w-full shrink-0 flex-row gap-1 overflow-x-auto',
        'border-b border-border bg-background/80 px-3 py-2 backdrop-blur-md',
        // Desktop: rail izquierdo de altura completa, pegado bajo el header.
        // `overflow-x-hidden` es lo que recorta los labels al colapsar.
        'lg:h-[calc(100dvh-4rem)] lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto',
        'lg:border-b-0 lg:border-r lg:bg-transparent lg:py-4 lg:backdrop-blur-none',
        'lg:transition-[width] lg:duration-200 lg:ease-out',
        collapsed ? 'lg:w-[64px]' : 'lg:w-[240px]',
      )}
    >
      {items.map((item) => (
        <NavItem
          key={item.id}
          item={item}
          active={activeId === item.id}
          collapsed={collapsed}
          onSelect={onSelect}
        />
      ))}

      {/* El toggle solo existe en desktop: en mobile la barra es horizontal y
          colapsarla no libera nada. Los dos iconos van apilados y cruzan en
          opacidad — intercambiar el nodo hacía un parpadeo seco. */}
      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-label={collapsed ? 'Expandir el menú' : 'Contraer el menú'}
        aria-expanded={!collapsed}
        className={cn(
          'mt-auto hidden shrink-0 items-center gap-2.5 rounded-[6px] px-3 py-[7px]',
          'text-muted-foreground/70 transition-colors hover:bg-white/5 hover:text-foreground/90',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'lg:flex',
          ITEM_WIDTH,
        )}
      >
        <span className="relative flex h-4 w-4 shrink-0">
          <PanelLeftClose
            className={cn('absolute inset-0 h-4 w-4', FADE, collapsed && 'opacity-0')}
            strokeWidth={1.5}
          />
          <PanelLeftOpen
            className={cn('absolute inset-0 h-4 w-4 opacity-0', FADE, collapsed && 'opacity-100')}
            strokeWidth={1.5}
          />
        </span>
        <span className={cn('whitespace-nowrap text-[13px] tracking-wide', FADE, collapsed && 'opacity-0')}>
          Contraer
        </span>
      </button>
    </nav>
  )
}
