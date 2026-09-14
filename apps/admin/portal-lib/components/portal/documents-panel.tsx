'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Check,
  Download,
  FileSignature,
  FileText,
  FolderOpen,
  Loader2,
  PenLine,
  Presentation,
  Receipt,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import { useClientDeals, useClientDocuments, useDocumentPreview } from '@portal/lib/hooks'
import { openFile } from '@portal/lib/files'
import { cn } from '@portal/lib/utils'
import type { ClientDocument } from '@portal/lib/types'
import { Badge, type BadgeProps } from '@portal/components/ui/badge'
import { SectionHeader } from '@portal/components/portal/section-header'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@portal/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@portal/components/ui/dropdown-menu'
import { RowListSkeleton } from '@portal/components/ui/skeletons'
import { EmptyIllustration } from '@portal/components/ui/empty-illustration'
import { Folder } from '@portal/components/ui/folder'

/*
 * ─── Lenguaje visual ───────────────────────────────────────────────────────────
 * Toma la referencia "Docs" (dashboard oscuro de documentación): grilla de cards
 * por categoría con tile de ícono blanco y botón pill, y un panel lateral fijo
 * con el listado de archivos de la categoría elegida. Lo que NO se trae es lo
 * que no tiene datos detrás en esta app: la fila de carpetas "Shortcut" y los
 * gráficos de engagement. Mostrar métricas inventadas a un cliente es peor que
 * no mostrarlas.
 */

const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
/** Superficie de card: hairline claro + halo exterior tenue, profundidad por tono y no por sombra. */
const SURFACE =
  'rounded-xl border border-white/[0.08] bg-card shadow-[0_0_0_3px_rgba(255,255,255,0.025),inset_0_1px_0_rgba(255,255,255,0.04)]'
/** Controles del header (búsqueda, filtro). */
const CONTROL = cn(
  'inline-flex h-9 items-center rounded-lg border border-white/[0.08] bg-card text-[13px] text-foreground/90 transition-colors hover:bg-white/[0.06]',
  FOCUS,
)
/** Botón pill secundario — el "Connect" de la referencia. */
const PILL = cn(
  'inline-flex h-7 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 text-[11px] font-medium text-foreground/90 transition-colors hover:bg-white/[0.09] disabled:pointer-events-none disabled:opacity-40',
  FOCUS,
)
const PILL_SELECTED = 'border-white/25 bg-white/[0.12] text-foreground'
/** Botón pill sólido — el "Details" blanco de la referencia. */
const SOLID_PILL = cn(
  'inline-flex h-7 items-center gap-1.5 rounded-md bg-foreground px-3 text-[11px] font-semibold text-background transition-opacity hover:opacity-90',
  FOCUS,
)
const ICON_BUTTON = cn(
  'inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-muted-foreground transition-colors hover:bg-white/[0.09] hover:text-foreground disabled:opacity-50',
  FOCUS,
)
/** Entrada escalonada (el delay lo pone cada instancia). */
const ENTER =
  'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 motion-safe:fill-mode-both'

// ─── Categorías (filtro por tipo) ─────────────────────────────────────────────
// 100% client-side sobre lo que ya trajo useClientDocuments() — sin params
// nuevos ni llamadas extra. Cualquier `type` que no sea uno de los 3 conocidos
// cae en el balde "other".

type TypeFilterKey = 'contract' | 'proposal' | 'invoice' | 'other'
type TypeFilter = 'all' | TypeFilterKey

const TYPE_FILTER_ORDER: TypeFilterKey[] = ['contract', 'proposal', 'invoice', 'other']

const DOCUMENT_CATEGORIES: Record<
  TypeFilterKey,
  { label: string; singular: string; description: string; Icon: LucideIcon }
> = {
  contract: {
    label: 'Contratos',
    singular: 'Contrato',
    description: 'Los acuerdos de tu proyecto, con su estado de firma al día.',
    Icon: FileSignature,
  },
  proposal: {
    label: 'Propuestas',
    singular: 'Propuesta',
    description: 'Propuestas comerciales y alcances que te compartimos.',
    Icon: Presentation,
  },
  invoice: {
    label: 'Facturas',
    singular: 'Factura',
    description: 'Comprobantes de facturación asociados a tu proyecto.',
    Icon: Receipt,
  },
  other: {
    label: 'Otros',
    singular: 'Otro',
    description: 'Archivos de apoyo: briefs, materiales y referencias.',
    Icon: FolderOpen,
  },
}

function typeBucket(doc: ClientDocument): TypeFilterKey {
  return doc.type === 'contract' || doc.type === 'proposal' || doc.type === 'invoice' ? doc.type : 'other'
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/** Minúsculas y sin tildes: "propuesta" encuentra "Propuesta técnica". */
function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function matchesSearch(doc: ClientDocument, needle: string): boolean {
  if (!needle) return true
  return [doc.name, doc.uploadedBy ?? ''].some((field) => normalizeText(field).includes(needle))
}

// ─── Estado derivado (nunca persistido) ────────────────────────────────────────
// Documentos es una VISTA DE SOLO LECTURA del estado documental. DocuSeal es
// la fuente de verdad de la firma — acá solo se deriva un label/badge en
// render a partir de `docusealStatus`/`signedAt`, nunca se guarda un estado
// propio ni se ofrecen acciones de workflow (aprobar, etc.).

type DerivedDocumentStatusKind = 'pending' | 'signed' | 'declined' | 'expired' | 'informational'

interface DerivedDocumentStatus {
  status: DerivedDocumentStatusKind
  label: string
}

function deriveDocumentStatus(doc: ClientDocument): DerivedDocumentStatus {
  if (doc.docusealStatus === 'pending') {
    return { status: 'pending', label: 'Requiere tu firma' }
  }
  if (doc.docusealStatus === 'completed' || doc.signedAt != null) {
    return { status: 'signed', label: 'Firmado' }
  }
  if (doc.docusealStatus === 'declined') {
    return { status: 'declined', label: 'Rechazado' }
  }
  if (doc.docusealStatus === 'expired') {
    return { status: 'expired', label: 'Vencido' }
  }
  return { status: 'informational', label: 'Informativo' }
}

const DOCUMENT_STATUS_VARIANT: Record<DerivedDocumentStatusKind, NonNullable<BadgeProps['variant']>> = {
  pending: 'signal',
  signed: 'default',
  declined: 'destructive',
  expired: 'muted',
  informational: 'muted',
}

/** ¿Hay algún camino para previsualizar este documento en el drawer? */
function canPreviewDocument(doc: ClientDocument): boolean {
  return doc.storageKey != null || doc.docusealStatus === 'completed'
}

const DATE_FORMAT = new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', year: 'numeric' })
const TIME_FORMAT = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' })

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr)
  return `${DATE_FORMAT.format(date)} · ${TIME_FORMAT.format(date)}`
}

/** Fecha a mostrar: la de firma si está firmado, si no la de alta. */
function formatDocumentDate(doc: ClientDocument): { label: string; value: string } {
  if (doc.signedAt) return { label: 'Firmado', value: formatDateTime(doc.signedAt) }
  return { label: 'Compartido', value: formatDateTime(doc.createdAt) }
}

// ─── Header: búsqueda ─────────────────────────────────────────────────────────
// Atajo "/" (y no ⌘F como en la referencia): pisar el buscar-en-página del
// navegador es hostil, "/" es la convención de búsqueda en apps web.

function DocumentSearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      event.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <label className="relative flex min-w-0 flex-1 items-center md:w-64 md:flex-none">
      <span className="sr-only">Buscar documentos</span>
      <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onChange('')
            event.currentTarget.blur()
          }
        }}
        placeholder="Buscar"
        className={cn(
          CONTROL,
          'w-full pl-9 pr-9 placeholder:text-muted-foreground hover:bg-card [&::-webkit-search-cancel-button]:hidden',
        )}
      />
      {!value && (
        <kbd
          aria-hidden
          className="pointer-events-none absolute right-2.5 rounded border border-white/10 px-1.5 font-sans text-[10px] leading-4 text-muted-foreground"
        >
          /
        </kbd>
      )}
    </label>
  )
}

// ─── Header: filtro por tipo ──────────────────────────────────────────────────

function TypeFilterMenu({
  value,
  counts,
  total,
  onChange,
}: {
  value: TypeFilter
  counts: Record<TypeFilterKey, number>
  total: number
  onChange: (value: TypeFilter) => void
}) {
  const active = value !== 'all'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn(CONTROL, 'shrink-0 gap-2 px-3', active && 'border-white/20 text-foreground')}>
          <SlidersHorizontal className="h-4 w-4" strokeWidth={1.5} />
          {active ? DOCUMENT_CATEGORIES[value].label : 'Filtrar'}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Tipo de documento</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(next as TypeFilter)}>
          <DropdownMenuRadioItem value="all">
            Todos
            <span className="ml-auto pl-3 text-xs tabular-nums text-muted-foreground">{total}</span>
          </DropdownMenuRadioItem>
          {TYPE_FILTER_ORDER.map((type) => (
            <DropdownMenuRadioItem key={type} value={type} disabled={counts[type] === 0}>
              {DOCUMENT_CATEGORIES[type].label}
              <span className="ml-auto pl-3 text-xs tabular-nums text-muted-foreground">{counts[type]}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── "Requieren tu firma" ─────────────────────────────────────────────────────
// Siempre muestra TODO lo accionable, sin importar el filtro ni la búsqueda.

function AttentionBanner({ docs }: { docs: ClientDocument[] }) {
  if (docs.length === 0) return null

  return (
    <section
      aria-labelledby="documents-attention-title"
      className={cn('rounded-xl border border-signal/30 bg-signal/[0.06] p-4', ENTER)}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-signal text-signal-foreground">
          <PenLine className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h2 id="documents-attention-title" className="text-sm font-medium text-foreground">
            {docs.length === 1 ? 'Un documento requiere tu firma' : `${docs.length} documentos requieren tu firma`}
          </h2>
          <p className="text-xs text-muted-foreground">Te llegó el pedido de firma por email — completalo desde ahí.</p>
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {docs.map((doc) => (
          <li
            key={doc.id}
            title={doc.name}
            className="max-w-full truncate rounded-md border border-signal/25 bg-background/40 px-2.5 py-1 text-xs text-foreground/90"
          >
            {doc.name}
          </li>
        ))}
      </ul>
      {/* PENDIENTE: botón Firmar — requiere exponer signingUrl validando que el client_account sea el firmante. */}
    </section>
  )
}

// ─── Card de categoría ────────────────────────────────────────────────────────

function CategoryCard({
  type,
  count,
  pending,
  selected,
  index,
  onToggle,
}: {
  type: TypeFilterKey
  count: number
  pending: number
  selected: boolean
  index: number
  onToggle: () => void
}) {
  const { label, description, Icon } = DOCUMENT_CATEGORIES[type]
  const empty = count === 0

  return (
    <article
      className={cn(SURFACE, 'flex flex-col p-4 transition-colors', selected && 'border-white/25 bg-white/[0.035]', ENTER)}
      style={{ animationDelay: `${60 + index * 60}ms` }}
    >
      <span
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-lg',
          empty
            ? 'bg-white/[0.06] text-muted-foreground'
            : 'bg-foreground text-background shadow-[inset_0_-2px_0_rgba(0,0,0,0.12)]',
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </span>

      <h3 className="mt-4 text-sm font-medium text-foreground">{label}</h3>
      <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">{description}</p>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button type="button" onClick={onToggle} disabled={empty} aria-pressed={selected} className={cn(PILL, selected && PILL_SELECTED)}>
          {selected && <Check className="h-3 w-3" strokeWidth={2} />}
          {selected ? 'Mostrando' : 'Ver archivos'}
        </button>
        <p className="flex items-center gap-2.5 text-[11px] tabular-nums text-muted-foreground">
          {pending > 0 && (
            <span className="flex items-center gap-1 text-signal">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-signal" />
              {pending} por firmar
            </span>
          )}
          <span>{empty ? 'Sin archivos' : plural(count, 'archivo', 'archivos')}</span>
        </p>
      </div>
    </article>
  )
}

// ─── Accesos rápidos: una carpeta por proyecto ────────────────────────────────
// El "Shortcut" de la referencia, con datos reales: cada carpeta es un deal del
// cliente que tiene documentos (nombre vía useClientDeals, cruce por `dealId`).
// Los documentos sin deal caen en "Generales". Elegir una carpeta filtra el
// listado, y se combina con el filtro por tipo y la búsqueda.

const GENERAL_FOLDER = '__general__'

interface ShortcutFolder {
  key: string
  label: string
  count: number
}

function folderKey(doc: ClientDocument): string {
  return doc.dealId ?? GENERAL_FOLDER
}

function buildFolders(docs: ClientDocument[], dealNames: Map<string, string>): ShortcutFolder[] {
  const counts = new Map<string, number>()
  for (const doc of docs) counts.set(folderKey(doc), (counts.get(folderKey(doc)) ?? 0) + 1)

  return Array.from(counts, ([key, count]) => ({
    key,
    count,
    label: key === GENERAL_FOLDER ? 'Generales' : (dealNames.get(key) ?? 'Proyecto'),
  })).sort((a, b) => {
    // "Generales" siempre al final; los proyectos, alfabéticos.
    if (a.key === GENERAL_FOLDER) return 1
    if (b.key === GENERAL_FOLDER) return -1
    return a.label.localeCompare(b.label, 'es')
  })
}

function ShortcutFolders({
  folders,
  selectedKey,
  onToggle,
}: {
  folders: ShortcutFolder[]
  selectedKey: string | null
  onToggle: (key: string) => void
}) {
  // La carpeta es decorativa: el hover lo maneja el botón entero (incluye el
  // label) y también el foco de teclado, no solo el mouse sobre el dibujo.
  const [activeKey, setActiveKey] = useState<string | null>(null)

  if (folders.length === 0) return null

  return (
    <section
      aria-labelledby="documents-shortcuts-title"
      className={cn(SURFACE, 'p-4', ENTER)}
      style={{ animationDelay: '300ms' }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="documents-shortcuts-title" className="text-sm font-medium text-foreground">
          Accesos rápidos
        </h2>
        <p className="text-[11px] text-muted-foreground">Por proyecto</p>
      </div>

      {/* pt-8: al abrirse, las hojas suben por encima de la carpeta. */}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-x-2 gap-y-5 pt-8">
        {folders.map((folder) => {
          const selected = folder.key === selectedKey
          return (
            <li key={folder.key}>
              <button
                type="button"
                onClick={() => onToggle(folder.key)}
                onMouseEnter={() => setActiveKey(folder.key)}
                onMouseLeave={() => setActiveKey(null)}
                onFocus={() => setActiveKey(folder.key)}
                onBlur={() => setActiveKey(null)}
                aria-pressed={selected}
                className={cn('group flex w-full flex-col items-center gap-2 rounded-lg px-1 pb-1 text-center', FOCUS)}
              >
                <Folder
                  color="graphite"
                  size="xs"
                  open={selected}
                  hovered={activeKey === folder.key}
                  className="h-auto w-auto"
                />
                <span
                  className={cn(
                    'line-clamp-2 text-xs leading-snug transition-colors',
                    selected ? 'text-foreground' : 'text-foreground/80 group-hover:text-foreground',
                  )}
                >
                  {folder.label}
                </span>
                <span className="-mt-1 text-[10px] tabular-nums text-muted-foreground">
                  {plural(folder.count, 'archivo', 'archivos')}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ─── Panel lateral: listado de archivos ───────────────────────────────────────

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 gap-1">
      <dt className="shrink-0">{label}:</dt>
      <dd className="truncate text-foreground/75">{value}</dd>
    </div>
  )
}

function DocumentListItem({ doc, onPreview }: { doc: ClientDocument; onPreview: (doc: ClientDocument) => void }) {
  const [downloading, setDownloading] = useState(false)
  const [failed, setFailed] = useState(false)

  const derived = deriveDocumentStatus(doc)
  const previewable = canPreviewDocument(doc)
  const date = formatDocumentDate(doc)

  // Descarga autenticada: hace falta pedir una URL de acceso temporal
  // (openFile en lib/files.ts), un <a href> pelado no puede. Solo aplica a
  // documentos con storageKey propio (los firmados-en-DocuSeal-sin-copia-propia
  // no tienen bytes locales para bajar, solo preview vía signed-documents).
  async function handleDownload() {
    if (!doc.storageKey) return
    setDownloading(true)
    setFailed(false)
    try {
      await openFile(doc.storageKey)
    } catch {
      setFailed(true)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <li className="p-4 transition-colors hover:bg-white/[0.02]">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 truncate text-[13px] font-medium text-foreground" title={doc.name}>
          {doc.name}
        </p>
        {derived.status !== 'informational' && (
          <Badge variant={DOCUMENT_STATUS_VARIANT[derived.status]} className="shrink-0 text-[10px]">
            {derived.label}
          </Badge>
        )}
      </div>

      <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
        <MetaRow label="Tipo" value={DOCUMENT_CATEGORIES[typeBucket(doc)].singular} />
        {doc.uploadedBy && <MetaRow label="Subido por" value={doc.uploadedBy} />}
        <MetaRow label={date.label} value={date.value} />
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {previewable && (
          <button type="button" onClick={() => onPreview(doc)} className={SOLID_PILL}>
            Ver
          </button>
        )}
        {doc.storageKey && (
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={downloading}
            aria-label={`Descargar ${doc.name}`}
            title="Descargar"
            className={ICON_BUTTON}
          >
            {downloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
            )}
          </button>
        )}
        {!previewable && !doc.storageKey && (
          <span className="text-[11px] text-muted-foreground/70">Todavía no hay archivo para ver</span>
        )}
        {failed && (
          <span role="alert" className="text-[11px] text-destructive">
            No se pudo descargar
          </span>
        )}
      </div>
    </li>
  )
}

function DocumentListPanel({
  docs,
  filter,
  folderLabel,
  search,
  onClearSearch,
  onShowAll,
  onPreview,
}: {
  docs: ClientDocument[]
  filter: TypeFilter
  folderLabel: string | null
  search: string
  onClearSearch: () => void
  onShowAll: () => void
  onPreview: (doc: ClientDocument) => void
}) {
  const category = filter === 'all' ? null : DOCUMENT_CATEGORIES[filter]
  const trimmedSearch = search.trim()

  return (
    <aside
      aria-label="Listado de documentos"
      className={cn(
        SURFACE,
        'flex min-w-0 flex-col overflow-hidden xl:sticky xl:top-24 xl:max-h-[calc(100dvh-8rem)]',
        ENTER,
      )}
      style={{ animationDelay: '120ms' }}
    >
      <header className="border-b border-white/[0.06] p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-medium text-foreground">{category?.label ?? 'Todos los documentos'}</h2>
          {(category || folderLabel) && (
            <button
              type="button"
              onClick={onShowAll}
              className={cn('shrink-0 rounded text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline', FOCUS)}
            >
              Ver todos
            </button>
          )}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {category?.description ?? 'Todo lo que el equipo compartió con vos.'}
        </p>
        <p className="mt-3 truncate text-[11px] uppercase tracking-[0.14em] tabular-nums text-muted-foreground/80">
          {plural(docs.length, 'archivo', 'archivos')}
          {folderLabel && <span className="normal-case tracking-normal"> · {folderLabel}</span>}
          {trimmedSearch && <span className="normal-case tracking-normal"> · “{trimmedSearch}”</span>}
        </p>
      </header>

      {docs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <FolderOpen className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
          <p className="px-4 text-sm text-muted-foreground">Ningún documento coincide con la búsqueda.</p>
          {trimmedSearch && (
            <button type="button" onClick={onClearSearch} className={PILL}>
              Limpiar búsqueda
            </button>
          )}
        </div>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-white/[0.06] overflow-y-auto">
          {docs.map((doc) => (
            <DocumentListItem key={doc.id} doc={doc} onPreview={onPreview} />
          ))}
        </ul>
      )}
    </aside>
  )
}

// ─── Preview drawer ────────────────────────────────────────────────────────────

function DocumentPreviewDrawer({
  doc,
  onClose,
}: {
  doc: ClientDocument | null
  onClose: () => void
}) {
  const preview = useDocumentPreview(doc)
  const storageKey = doc?.storageKey ?? null

  return (
    <Sheet
      open={doc != null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-3 sm:max-w-2xl"
        aria-label="Vista previa del documento"
      >
        <SheetHeader>
          <SheetTitle className="truncate pr-6">{doc?.name ?? 'Documento'}</SheetTitle>
          <SheetDescription>
            {preview.status === 'error'
              ? 'No se pudo cargar la vista previa.'
              : 'Vista previa del documento — puede tardar unos segundos en cargar.'}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted/30">
          {preview.status === 'loading' && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <p className="text-sm">Cargando vista previa…</p>
            </div>
          )}

          {preview.status === 'error' && (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-destructive">No pudimos cargar la vista previa de este documento.</p>
              {storageKey && (
                <button
                  type="button"
                  onClick={() => void openFile(storageKey).catch(() => {})}
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent/50"
                >
                  Descargar en su lugar
                </button>
              )}
            </div>
          )}

          {preview.status === 'ready' && preview.url && (
            <iframe
              src={preview.url}
              title={doc?.name ?? 'Vista previa del documento'}
              className="h-full w-full"
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function DocumentsPanel() {
  const query = useClientDocuments()
  const docs = query.data ?? []
  const [previewDoc, setPreviewDoc] = useState<ClientDocument | null>(null)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [search, setSearch] = useState('')
  const [folderFilter, setFolderFilter] = useState<string | null>(null)
  const dealsQuery = useClientDeals()

  const renderHeader = (actions?: ReactNode) => (
    <SectionHeader
      eyebrow="Tu proyecto"
      title="Documentos"
      description="Contratos y archivos compartidos con vos."
      actions={actions}
    />
  )

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        {renderHeader()}
        <RowListSkeleton count={4} label="Cargando documentos…" />
      </div>
    )
  }

  if (query.isError) {
    return (
      <div className="space-y-6">
        {renderHeader()}
        <p className="py-8 text-sm text-destructive">No se pudieron cargar los documentos.</p>
      </div>
    )
  }

  if (docs.length === 0) {
    return (
      <div className="space-y-6">
        {renderHeader()}
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <EmptyIllustration icon={FileText} />
          <div>
            <p className="font-medium text-muted-foreground">Sin Documentos</p>
            <p className="mt-0.5 text-sm text-muted-foreground/70">
              Los contratos y documentos de tus proyectos aparecerán acá cuando el equipo los suba.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const pendingSignature = docs.filter((doc) => deriveDocumentStatus(doc).status === 'pending')

  const counts: Record<TypeFilterKey, number> = { contract: 0, proposal: 0, invoice: 0, other: 0 }
  const pendingCounts: Record<TypeFilterKey, number> = { contract: 0, proposal: 0, invoice: 0, other: 0 }
  for (const doc of docs) counts[typeBucket(doc)] += 1
  for (const doc of pendingSignature) pendingCounts[typeBucket(doc)] += 1

  const dealNames = new Map((dealsQuery.data ?? []).map((deal) => [deal.id, deal.name]))
  const folders = buildFolders(docs, dealNames)
  // Si la carpeta elegida dejó de existir (cambió la data), se ignora el filtro.
  const activeFolder = folders.find((folder) => folder.key === folderFilter) ?? null

  const needle = normalizeText(search.trim())
  const visibleDocs = docs.filter(
    (doc) =>
      (typeFilter === 'all' || typeBucket(doc) === typeFilter) &&
      (activeFolder == null || folderKey(doc) === activeFolder.key) &&
      matchesSearch(doc, needle),
  )

  return (
    <div className="space-y-6">
      {renderHeader(
        <>
          <DocumentSearchField value={search} onChange={setSearch} />
          <TypeFilterMenu value={typeFilter} counts={counts} total={docs.length} onChange={setTypeFilter} />
        </>,
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div className="min-w-0 space-y-5">
          <AttentionBanner docs={pendingSignature} />

          <section aria-label="Categorías de documentos" className="grid gap-4 sm:grid-cols-2">
            {TYPE_FILTER_ORDER.map((type, index) => (
              <CategoryCard
                key={type}
                type={type}
                index={index}
                count={counts[type]}
                pending={pendingCounts[type]}
                selected={typeFilter === type}
                onToggle={() => setTypeFilter((current) => (current === type ? 'all' : type))}
              />
            ))}
          </section>

          <ShortcutFolders
            folders={folders}
            selectedKey={activeFolder?.key ?? null}
            onToggle={(key) => setFolderFilter((current) => (current === key ? null : key))}
          />
        </div>

        <DocumentListPanel
          docs={visibleDocs}
          filter={typeFilter}
          folderLabel={activeFolder?.label ?? null}
          search={search}
          onClearSearch={() => setSearch('')}
          onShowAll={() => {
            setTypeFilter('all')
            setFolderFilter(null)
          }}
          onPreview={setPreviewDoc}
        />
      </div>

      <DocumentPreviewDrawer doc={previewDoc} onClose={() => setPreviewDoc(null)} />
    </div>
  )
}
