'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft, FolderOpen } from 'lucide-react'
import { useClientDeals, useClientDocuments } from '@portal/lib/hooks'
import { cn } from '@portal/lib/utils'
import type { ClientDocument } from '@portal/lib/types'
import { SectionHeader } from '@portal/components/portal/section-header'
import { portalHref } from '@portal/components/portal/portal-nav'
import { RowListSkeleton } from '@portal/components/ui/skeletons'
import {
  AttentionBanner,
  DOCUMENT_CATEGORIES,
  DocumentPreviewDrawer,
  DocumentSearchField,
  DocumentsTable,
  FOCUS,
  GENERAL_FOLDER,
  PILL,
  TypeFilterMenu,
  byActivityDesc,
  countByType,
  deriveDocumentStatus,
  folderKey as folderKeyOf,
  folderLabel,
  formatDateTime,
  activityDate,
  matchesSearch,
  normalizeText,
  plural,
  typeBucket,
  type DocumentActions,
  type TypeFilter,
} from '@portal/components/portal/documents-shared'

/*
 * Vista de detalle de una carpeta de Documentos (`/documents/<key>`): todos los
 * archivos de un proyecto —o los "Generales", sin proyecto— en una tabla
 * completa, con la misma búsqueda y filtro por tipo que la vista general pero
 * acotados a la carpeta. Se deriva de useClientDocuments() igual que la general:
 * la carpeta no es una entidad del backend, es un agrupamiento por `dealId`.
 */

export function DocumentFolderPanel({ folderKey }: { folderKey: string }) {
  const pathname = usePathname()
  const query = useClientDocuments()
  const dealsQuery = useClientDeals()
  const [previewDoc, setPreviewDoc] = useState<ClientDocument | null>(null)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [search, setSearch] = useState('')

  const documentsHref = portalHref(pathname, 'documents')
  const dealNames = new Map((dealsQuery.data ?? []).map((deal) => [deal.id, deal.name]))
  const label = folderLabel(folderKey, dealNames)

  const backLink = (
    <Link
      href={documentsHref}
      className={cn(
        'inline-flex items-center gap-1.5 rounded text-xs text-muted-foreground transition-colors hover:text-foreground',
        FOCUS,
      )}
    >
      <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
      Documentos
    </Link>
  )

  // Una carpeta de proyecto espera también los deals: si no, el título dice
  // "Proyecto" un instante antes del nombre real.
  if (query.isLoading || (folderKey !== GENERAL_FOLDER && dealsQuery.isLoading)) {
    return (
      <div className="space-y-6">
        {backLink}
        <SectionHeader eyebrow="Carpeta" title="Cargando carpeta…" description="Buscando los archivos de esta carpeta." />
        <RowListSkeleton count={4} label="Cargando documentos…" />
      </div>
    )
  }

  if (query.isError) {
    return (
      <div className="space-y-6">
        {backLink}
        <SectionHeader eyebrow="Carpeta" title={label} description="No se pudieron cargar los documentos." />
      </div>
    )
  }

  const folderDocs = (query.data ?? []).filter((doc) => folderKeyOf(doc) === folderKey).sort(byActivityDesc)
  const [latestDoc] = folderDocs

  // La carpeta existe solo mientras tenga documentos: un link viejo, un
  // proyecto ajeno o una key inventada caen acá, sin filtrar nada de otro lado.
  if (!latestDoc) {
    return (
      <div className="space-y-6">
        {backLink}
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <FolderOpen className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
          <div>
            <p className="font-medium text-muted-foreground">Esta carpeta no tiene archivos</p>
            <p className="mt-0.5 text-sm text-muted-foreground/70">
              Puede que el link sea viejo o que los documentos se hayan movido.
            </p>
          </div>
          <Link href={documentsHref} className={PILL}>
            Volver a Documentos
          </Link>
        </div>
      </div>
    )
  }

  const pendingSignature = folderDocs.filter((doc) => deriveDocumentStatus(doc).status === 'pending')
  const counts = countByType(folderDocs)
  const lastActivity = formatDateTime(activityDate(latestDoc))

  const needle = normalizeText(search.trim())
  const visibleDocs = folderDocs.filter(
    (doc) => (typeFilter === 'all' || typeBucket(doc) === typeFilter) && matchesSearch(doc, needle),
  )
  const filtered = typeFilter !== 'all' || needle !== ''

  const documentActions: DocumentActions = {
    onPreview: setPreviewDoc,
    onShowType: (type) => {
      setTypeFilter(type)
      setSearch('')
    },
    // Ya estás adentro de la carpeta: "Abrir carpeta" no tiene sentido acá.
    folderOf: null,
  }

  const subtitleParts = [
    filtered ? `${visibleDocs.length} de ${folderDocs.length}` : plural(folderDocs.length, 'archivo', 'archivos'),
    typeFilter !== 'all' ? DOCUMENT_CATEGORIES[typeFilter].label : null,
    search.trim() ? `“${search.trim()}”` : null,
  ].filter(Boolean)

  return (
    <div className="space-y-6">
      {backLink}

      <SectionHeader
        eyebrow={folderKey === GENERAL_FOLDER ? 'Carpeta' : 'Carpeta del proyecto'}
        title={label}
        description={`${plural(folderDocs.length, 'archivo', 'archivos')} · Última actividad ${lastActivity}`}
        actions={
          <>
            <DocumentSearchField value={search} onChange={setSearch} />
            <TypeFilterMenu value={typeFilter} counts={counts} total={folderDocs.length} onChange={setTypeFilter} />
          </>
        }
      />

      <AttentionBanner docs={pendingSignature} />

      <DocumentsTable
        docs={visibleDocs}
        actions={documentActions}
        title="Archivos"
        subtitle={subtitleParts.join(' · ')}
        animationDelay="60ms"
        empty={
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <FolderOpen className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
            <p className="px-4 text-sm text-muted-foreground">Ningún archivo de esta carpeta coincide.</p>
            <button
              type="button"
              onClick={() => {
                setTypeFilter('all')
                setSearch('')
              }}
              className={PILL}
            >
              Limpiar filtros
            </button>
          </div>
        }
      />

      <DocumentPreviewDrawer doc={previewDoc} onClose={() => setPreviewDoc(null)} />
    </div>
  )
}
