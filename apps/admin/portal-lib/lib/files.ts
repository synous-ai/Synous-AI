// Instancia única del módulo compartido de transferencia de archivos
// (@/lib/file-transfer) para el portal de cliente: basePath '/api/client' +
// token de Clerk del client_account. El admin instancia la MISMA lógica con
// basePath '/api' en lib/hooks/misc.ts — no duplicar nada acá.

import { createFileTransfer, FILE_PURPOSE_ACCEPT } from '@/lib/file-transfer'
import { getPortalToken } from './api'

const fileTransfer = createFileTransfer({ basePath: '/api/client', getToken: getPortalToken })

export const uploadFile = fileTransfer.uploadFile
export const getFileAccessUrl = fileTransfer.getFileAccessUrl
export const openFile = fileTransfer.openFile
export const useFileUrl = fileTransfer.useFileUrl
export { FILE_PURPOSE_ACCEPT }
export type { FilePurpose, UploadedFile } from '@/lib/file-transfer'
