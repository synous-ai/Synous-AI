import { createReadStream, createWriteStream, type ReadStream } from 'node:fs'
import { mkdir, open, rm, stat } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { isReadableStorageKey } from './keys'

/**
 * Backend de disco — SOLO desarrollo local. El filesystem de una Function de
 * Vercel es efímero y no se comparte entre instancias: lo que se escribe ahí se
 * pierde, por eso `index.ts` nunca elige este backend en producción.
 */
const UPLOADS_DIR = resolve(process.cwd(), 'uploads')

/** Ruta absoluta de la key, garantizando que no escape de `uploads/`. */
function localPathFor(key: string): string {
  if (!isReadableStorageKey(key)) throw new Error('storageKey inválida para disco')
  const path = resolve(UPLOADS_DIR, key)
  if (!path.startsWith(UPLOADS_DIR + sep)) throw new Error('storageKey fuera del directorio de uploads')
  return path
}

/** Escribe sin pisar (`wx`): una key ya subida no se puede reemplazar. Devuelve los bytes escritos. */
export async function writeLocalObject(key: string, source: Readable): Promise<number> {
  const path = localPathFor(key)
  await mkdir(dirname(path), { recursive: true })
  const target = createWriteStream(path, { flags: 'wx' })
  try {
    await pipeline(source, target)
  } catch (err) {
    if ((err as { code?: string }).code !== 'EEXIST') await rm(path, { force: true })
    throw err
  }
  return target.bytesWritten
}

export async function statLocalObject(key: string): Promise<number | null> {
  try {
    const info = await stat(localPathFor(key))
    return info.isFile() ? info.size : null
  } catch {
    return null
  }
}

export async function readLocalHead(key: string, length: number): Promise<Buffer | null> {
  let handle
  try {
    handle = await open(localPathFor(key), 'r')
    const buffer = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buffer, 0, length, 0)
    return buffer.subarray(0, bytesRead)
  } catch {
    return null
  } finally {
    await handle?.close()
  }
}

export async function deleteLocalObject(key: string): Promise<void> {
  await rm(localPathFor(key), { force: true })
}

export async function openLocalObject(key: string): Promise<ReadStream | null> {
  if ((await statLocalObject(key)) === null) return null
  return createReadStream(localPathFor(key))
}
