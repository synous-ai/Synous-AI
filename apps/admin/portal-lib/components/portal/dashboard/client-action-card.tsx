'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowRight, ClipboardList, FileText, GitPullRequest, Receipt, type LucideIcon } from 'lucide-react'
import { cn } from '@portal/lib/utils'
import { portalBase } from '@portal/components/portal/portal-nav'
import type { ClientAction, ClientActionKind } from '@portal/lib/client-actions'

/**
 * Tarjeta de UNA acción concreta del cliente.
 *
 * Genérica sin ser un árbol de condicionales: todo lo específico del dominio
 * (título, contexto, metadata, destino, texto del CTA) ya viene resuelto en el
 * `ClientAction` que arma `lib/client-actions.ts`. Acá solo queda lo visual —
 * el ícono por tipo y el tono. Agregar un dominio nuevo a "Requiere tu
 * atención" es agregar una entrada al módulo de derivación y otra a
 * `KIND_ICON`; este componente no cambia.
 *
 * Los mismos íconos que usa el sidebar para cada sección (`portal-nav.tsx`):
 * el cliente reconoce el tipo de ítem antes de leer la etiqueta.
 */
const KIND_ICON: Record<ClientActionKind, LucideIcon> = {
  deliverable: FileText,
  form: ClipboardList,
  request: GitPullRequest,
  invoice: Receipt,
}

/**
 * La tarjeta ENTERA es el link: tiene exactamente una acción, así que partirla
 * en "card clickeable + botón adentro" agregaría un segundo tab-stop al mismo
 * destino y el problema clásico de un interactivo anidado en otro. El CTA de
 * abajo es la señal visual de ese único link, no un control aparte.
 */
export function ClientActionCard({ action }: { action: ClientAction }) {
  const pathname = usePathname()
  const Icon = KIND_ICON[action.kind]
  const isOverdue = action.tone === 'overdue'

  return (
    <Link
      href={`${portalBase(pathname)}${action.href}`}
      className={cn(
        'group flex h-full flex-col rounded-2xl border bg-card p-4 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        isOverdue
          ? 'border-destructive/35 hover:border-destructive/60'
          : 'border-border hover:border-primary/40',
      )}
    >
      {/* 1. Tipo — ícono + etiqueta. El indicador de vencido va del otro lado. */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <Icon
            aria-hidden
            className={cn('h-3.5 w-3.5 shrink-0', isOverdue ? 'text-destructive' : 'text-muted-foreground')}
            strokeWidth={1.75}
          />
          <span className="eyebrow">{action.kindLabel}</span>
        </span>
        {/* "Vencido" es texto, no un punto de color: el estado no puede
            depender de que se distinga el rojo. */}
        {isOverdue && (
          <span className="rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
            Vencido
          </span>
        )}
      </div>

      {/* 2. El nombre concreto del ítem. */}
      <div className="mt-2.5 min-w-0">
        {action.reference && (
          <span className="block font-mono text-[11px] text-muted-foreground">{action.reference}</span>
        )}
        <span className="mt-0.5 block truncate text-sm font-semibold leading-snug text-foreground">
          {action.title}
        </span>
      </div>

      {/* 3. Contexto — por qué está esperando algo del cliente. */}
      <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{action.context}</p>

      {/* 4. Metadata. `mt-auto` la empuja abajo para que, en una grilla, todas
          las tarjetas alineen el CTA aunque el contexto ocupe distinto alto. */}
      <div className="mt-auto pt-3">
        {action.meta && (
          <p className={cn('text-xs', isOverdue ? 'font-medium text-destructive' : 'text-muted-foreground')}>
            {action.meta}
          </p>
        )}

        {/* 5. CTA — describe la acción, nunca "Ver más". */}
        <span className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-primary">
          {action.cta}
          <ArrowRight
            aria-hidden
            className="h-3.5 w-3.5 transition-transform motion-safe:group-hover:translate-x-0.5"
            strokeWidth={2}
          />
        </span>
      </div>
    </Link>
  )
}
