'use client'

import { DocumentFolderPanel } from '@portal/components/portal/document-folder-panel'

// `folder` es la key de la carpeta: el id del deal o `generales` (ver
// documents-shared.tsx). El panel resuelve nombre y archivos del lado cliente.
export default function DocumentFolderPage({ params }: { params: { folder: string } }) {
  return <DocumentFolderPanel folderKey={params.folder} />
}
