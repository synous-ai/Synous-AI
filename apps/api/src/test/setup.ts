/**
 * test/setup.ts
 *
 * Archivo de setup de Vitest — cargado antes de cada archivo de test.
 * Configura el mock global de @clerk/backend para que todos los tests de
 * integración puedan autenticar requests sin claves reales de Clerk.
 *
 * El mock intercepta verifyToken y decodifica tokens del formato:
 *   "faketoken:<clerkUserId>"
 * retornando { sub: clerkUserId } — exactamente lo que verifyClerkToken necesita.
 *
 * authenticate.ts llama verifyToken → recibe { sub: clerkUserId } → busca el
 * hub_user en DB de test por clerkUserId → setea request.hubUser normalmente.
 *
 * IMPORTANTE: vi.mock hoistea al inicio del módulo en test files, pero en setup
 * files se comporta como un import-time mock. Usamos __mocks__ o unstubAllMocks
 * no aplica aquí — este patrón es correcto para setupFiles en Vitest.
 */

import { vi } from 'vitest'

vi.mock('@clerk/backend', async (importOriginal) => {
  const original = await importOriginal<typeof import('@clerk/backend')>()
  return {
    ...original,
    verifyToken: vi.fn(async (token: string) => {
      if (!token.startsWith('faketoken:')) {
        throw new Error('Token de Clerk inválido (mock de test — formato esperado: faketoken:<clerkUserId>)')
      }
      const clerkUserId = token.slice('faketoken:'.length)
      // Retorna el mínimo que verifyClerkToken necesita: { sub }
      return { sub: clerkUserId }
    }),
  }
})
