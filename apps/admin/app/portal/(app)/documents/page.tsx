'use client'

import { DocumentsPanel } from '@portal/components/portal/documents-panel'

// El panel renderiza su propio encabezado: la búsqueda y el filtro viven en la
// fila del título y dependen del estado del panel.
export default function DocumentsPanelPage() {
  return <DocumentsPanel />
}
