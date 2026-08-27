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
 *
 * También mockea `createClerkClient` con un fake controlable (`clerkFake`) para
 * que los tests de invitaciones/webhook/lazy-linking puedan programar sus
 * respuestas sin pegarle nunca a la red real de Clerk. Los defaults preservan
 * el comportamiento de hoy para el resto de los archivos de test (que no
 * programan nada): `getUser` rechaza, `getUserList` vacío, `createUser` fake,
 * `createInvitation` rechaza con "not programmed" (falla ruidoso si algún test
 * llega ahí sin programar la respuesta, en vez de pasar en silencio).
 */

import { vi } from 'vitest'

// vi.mock hoistea al tope del archivo — solo puede referenciar identificadores
// definidos vía vi.hoisted() (o que empiecen con "mock"). `clerkFake` se define
// acá para poder usarlo tanto dentro del factory de abajo como importado desde
// los archivos de test que quieran programar sus respuestas.
// NOTA: Vitest no permite `export const x = vi.hoisted(...)` en una sola
// declaración (rompe el transform de hoisting) — se declara y se exporta aparte.
const clerkFake = vi.hoisted(() => ({
  invitations: {
    createInvitation: vi.fn(),
  },
  users: {
    getUserList: vi.fn(),
    getUser: vi.fn(),
    updateUserMetadata: vi.fn(),
    createUser: vi.fn(),
  },
}))

export { clerkFake }

/** Reinicia el fake de Clerk a los defaults que preservan el comportamiento pre-Clerk-invitations. */
export function resetClerkFake(): void {
  clerkFake.invitations.createInvitation.mockReset()
  clerkFake.invitations.createInvitation.mockRejectedValue(
    new Error('clerkFake.invitations.createInvitation: not programmed for this test'),
  )
  clerkFake.users.getUserList.mockReset()
  clerkFake.users.getUserList.mockResolvedValue({ data: [], totalCount: 0 })
  clerkFake.users.getUser.mockReset()
  clerkFake.users.getUser.mockRejectedValue(new Error('not found'))
  clerkFake.users.updateUserMetadata.mockReset()
  clerkFake.users.updateUserMetadata.mockResolvedValue(undefined)
  clerkFake.users.createUser.mockReset()
  clerkFake.users.createUser.mockResolvedValue({ id: 'user_test_fake' })
}

resetClerkFake()

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
    createClerkClient: vi.fn(() => clerkFake),
  }
})
