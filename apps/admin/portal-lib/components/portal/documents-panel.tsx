'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FileText, FolderOpen } from 'lucide-react'
import { useClientDeals, useClientDocuments } from '@portal/lib/hooks'
import { cn } from '@portal/lib/utils'
import type { ClientDocument } from '@portal/lib/types'
import { Badge } from '@portal/components/ui/badge'
import { SectionHeader } from '@portal/components/portal/section-header'
import { RowListSkeleton } from '@portal/components/ui/skeletons'
import { EmptyIllustration } from '@portal/components/ui/empty-illustration'
import { Folder } from '@portal/components/ui/folder'
import {
  AttentionBanner,
  DOCUMENT_CATEGORIES,
  DOCUMENT_STATUS_VARIANT,
  DocumentActionsMenu,
  DocumentPreviewDrawer,
  DocumentSearchField,
  DocumentsTable,
  ENTER,
  FOCUS,
  FileName,
  FileTile,
  PILL,
  SURFACE,
  TypeFilterMenu,
  buildFolders,
  byActivityDesc,
  canPreviewDocument,
  countByType,
  deriveDocumentStatus,
  documentFolderHref,
  folderKey,
  formatDocumentDate,
  matchesSearch,
  normalizeText,
  plural,
  typeBucket,
  type DocumentActions,
  type DocumentFolder,
  type TypeFilter,
} from '@portal/components/portal/documents-shared'

/*
 * ─── Lenguaje visual ───────────────────────────────────────────────────────────
 * Toma la referencia "Docs" (dashboard oscuro de documentación): la fila de
 * carpetas como punto de entrada y un panel lateral fijo con el listado de
 * archivos. Cada carpeta abre su propia vista (document-folder-panel.tsx). Lo
 * que NO se trae es lo que no tiene datos detrás en esta app: los gráficos de
 * engagement. Mostrar métricas inventadas a un cliente es peor que no
 * mostrarlas.
 */

// ─── Carpetas: una por proyecto ───────────────────────────────────────────────
// El "Shortcut" de la referencia, con datos reales. Cada carpeta es un link a su
// vista de detalle (`/documents/<key>`), no un filtro de esta pantalla.

function DocumentFolders({ folders }: { folders: DocumentFolder[] }) {
  const pathname = usePathname()
  // La carpeta es decorativa: el hover lo maneja el link entero (incluye el
  // label) y también el foco de teclado, no solo el mouse sobre el dibujo.
  const [activeKey, setActiveKey] = useState<string | null>(null)

  if (folders.length === 0) return null

  return (
    <section
      aria-labelledby="documents-folders-title"
      className={cn(SURFACE, 'p-4', ENTER)}
      style={{ animationDelay: '60ms' }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="documents-folders-title" className="text-sm font-medium text-foreground">
          Carpetas
        </h2>
        <p className="text-[11px] text-muted-foreground">Por proyecto</p>
      </div>

      {/* pt-8: en hover, las hojas suben por encima de la carpeta. */}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-x-2 gap-y-5 pt-8">
        {folders.map((folder) => (
          <li key={folder.key}>
            <Link
              href={documentFolderHref(pathname, folder.key)}
              onMouseEnter={() => setActiveKey(folder.key)}
              onMouseLeave={() => setActiveKey(null)}
              onFocus={() => setActiveKey(folder.key)}
              onBlur={() => setActiveKey(null)}
              className={cn('group flex w-full flex-col items-center gap-2 rounded-lg px-1 pb-1 text-center', FOCUS)}
            >
              <Folder color="graphite" size="xs" hovered={activeKey === folder.key} className="h-auto w-auto" />
              <span className="line-clamp-2 text-xs leading-snug text-foreground/80 transition-colors group-hover:text-foreground">
                {folder.label}
              </span>
              <span className="-mt-1 flex flex-col items-center text-[10px] tabular-nums text-muted-foreground">
                {plural(folder.count, 'archivo', 'archivos')}
                {folder.pending > 0 && <span className="text-signal">{folder.pending} por firmar</span>}
              </span>
            </Link>
          </li>
        ))}
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

function DocumentListItem({ doc, actions }: { doc: ClientDocument; actions: DocumentActions }) {
  const derived = deriveDocumentStatus(doc)
  const date = formatDocumentDate(doc)
  const hasFile = canPreviewDocument(doc) || doc.storageKey != null

  return (
    <li className="flex items-start gap-3 p-4 transition-colors hover:bg-muted/40">
      <FileTile doc={doc} />
      <div className="min-w-0 flex-1">
        <FileName doc={doc} />
        {derived.status !== 'informational' && (
          <Badge variant={DOCUMENT_STATUS_VARIANT[derived.status]} className="mt-1.5 whitespace-nowrap">
            {derived.label}
          </Badge>
        )}
        <dl className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
          <MetaRow label="Tipo" value={DOCUMENT_CATEGORIES[typeBucket(doc)].singular} />
          {doc.uploadedBy && <MetaRow label="Subido por" value={doc.uploadedBy} />}
          <MetaRow label={date.label} value={date.value} />
        </dl>
        {!hasFile && <p className="mt-2 text-[11px] text-muted-foreground">Todavía no hay archivo para ver</p>}
      </div>
      <DocumentActionsMenu doc={doc} actions={actions} />
    </li>
  )
}

function DocumentListPanel({
  docs,
  filter,
  search,
  onClearSearch,
  onShowAll,
  actions,
}: {
  docs: ClientDocument[]
  filter: TypeFilter
  search: string
  onClearSearch: () => void
  onShowAll: () => void
  actions: DocumentActions
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
      <header className="border-b border-border p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-medium text-foreground">{category?.label ?? 'Todos los documentos'}</h2>
          {category && (
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
        <p className="mt-3 truncate text-[11px] uppercase tracking-[0.14em] tabular-nums text-muted-foreground">
          {plural(docs.length, 'archivo', 'archivos')}
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
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
          {docs.map((doc) => (
            <DocumentListItem key={doc.id} doc={doc} actions={actions} />
          ))}
        </ul>
      )}
    </aside>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

const RECENT_LIMIT = 5

export function DocumentsPanel() {
  const pathname = usePathname()
  const query = useClientDocuments()
  const docs = query.data ?? []
  const [previewDoc, setPreviewDoc] = useState<ClientDocument | null>(null)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [search, setSearch] = useState('')
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
  const counts = countByType(docs)

  const dealNames = new Map((dealsQuery.data ?? []).map((deal) => [deal.id, deal.name]))
  const folders = buildFolders(docs, dealNames)
  const folderLabels = new Map(folders.map((folder) => [folder.key, folder.label]))

  const needle = normalizeText(search.trim())
  const visibleDocs = docs.filter(
    (doc) => (typeFilter === 'all' || typeBucket(doc) === typeFilter) && matchesSearch(doc, needle),
  )

  // Los recientes se calculan sobre TODOS los documentos, sin mirar filtro ni
  // búsqueda (igual que el banner de firma): la vista filtrada es el panel lateral.
  const recentDocs = docs.slice().sort(byActivityDesc).slice(0, RECENT_LIMIT)

  const documentActions: DocumentActions = {
    onPreview: setPreviewDoc,
    // "Ver los de este tipo" limpia la búsqueda: si no, se combinaría con lo que
    // ya estaba escrito y el documento elegido podría no aparecer en el panel.
    onShowType: (type) => {
      setTypeFilter(type)
      setSearch('')
    },
    folderOf: (doc) => {
      const key = folderKey(doc)
      return { label: folderLabels.get(key) ?? 'Generales', href: documentFolderHref(pathname, key) }
    },
  }

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

          <DocumentFolders folders={folders} />

          <DocumentsTable
            docs={recentDocs}
            actions={documentActions}
            title="Archivos recientes"
            subtitle={`${plural(recentDocs.length, 'archivo', 'archivos')} con actividad más reciente`}
            animationDelay="180ms"
          />
        </div>

        <DocumentListPanel
          docs={visibleDocs}
          filter={typeFilter}
          search={search}
          onClearSearch={() => setSearch('')}
          onShowAll={() => setTypeFilter('all')}
          actions={documentActions}
        />
      </div>

      <DocumentPreviewDrawer doc={previewDoc} onClose={() => setPreviewDoc(null)} />
    </div>
  )
}
