'use client'

// El header (título, descripción y CTA "+ Nueva solicitud") vive dentro de
// `RequestsPanel`: necesita el estado del sheet de creación, igual que
// `DocumentsPanel` arma el suyo con sus propias acciones (búsqueda, filtro).
import { RequestsPanel } from '@portal/components/portal/requests-panel'

export default function RequestsPanelPage() {
  return <RequestsPanel />
}
