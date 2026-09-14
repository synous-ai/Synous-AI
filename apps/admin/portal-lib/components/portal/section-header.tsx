'use client'

import type { ReactNode } from 'react'

/**
 * Encabezado de una sección del portal.
 *
 * Existe porque los paneles (`DeliverablesPanel`, `InvoicesPanel`, …) no traen
 * título propio: antes lo daba el bloque de bienvenida compartido de la única
 * página del portal. Al pasar cada sección a su propia ruta ese bloque dejó de
 * tener sentido —"Bienvenido, jeremias" arriba de Facturas se lee raro— pero
 * las secciones no podían quedarse sin encabezado.
 *
 * `actions` es opcional: controles que van en la MISMA fila del título, a la
 * derecha (búsqueda, filtros). En mobile bajan debajo del texto.
 */

export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string
  title: string
  description: string
  actions?: ReactNode
}) {
  const text = (
    <div className="min-w-0">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="font-editorial mt-1.5 text-3xl leading-tight tracking-tight text-foreground">
        {title}
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
    </div>
  )

  if (!actions) return text

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      {text}
      <div className="flex w-full items-center gap-2 md:w-auto">{actions}</div>
    </div>
  )
}
