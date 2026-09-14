/**
 * portal-url.test.ts — Direcciones que salen en los emails con el dominio raíz
 * configurado: el portal de cada cliente es el subdominio de su empresa y las
 * páginas públicas (propuestas, reservas) viven en el apex, no en el panel.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config/env')>()
  return {
    ...actual,
    env: { ...actual.env, TENANT_ROOT_DOMAIN: 'synousai.com', ADMIN_URL: 'https://admin.synousai.com' },
  }
})

const { tenantPortalUrl, publicSiteBaseUrl, adminBaseUrl } = await import('./portal-url')

describe('portal-url con dominio raíz', () => {
  it('el portal del cliente es el subdominio de su empresa', () => {
    expect(tenantPortalUrl('uirtus')).toBe('https://uirtus.synousai.com')
  })

  it('sin slug de empresa no arma URL de subdominio', () => {
    expect(tenantPortalUrl(null)).toBeNull()
    expect(tenantPortalUrl(undefined)).toBeNull()
    expect(tenantPortalUrl('')).toBeNull()
  })

  it('las páginas públicas van al apex y el panel queda en admin', () => {
    expect(publicSiteBaseUrl()).toBe('https://synousai.com')
    expect(adminBaseUrl()).toBe('https://admin.synousai.com')
  })
})
