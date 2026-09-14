/**
 * Alta del subdominio de un tenant en Vercel.
 *
 * ─── Por qué hace falta ─────────────────────────────────────────────────────
 * El portal de cada empresa vive en `<slug>.synousai.com`. Eso necesita DOS
 * cosas, y solo una está resuelta de entrada:
 *
 *  1. RUTEO — resuelto. El registro `A * → 76.76.21.21` de Cloudflare hace que
 *     cualquier subdominio resuelva a Vercel, y el alias wildcard
 *     `*.synousai.com` del proyecto hace que la request llegue a la app. Esto
 *     ya cubre a todos los tenants presentes y futuros.
 *
 *  2. CERTIFICADO — NO resuelto. Se emite por host. Un subdominio que no se dio
 *     de alta resuelve por DNS y después muere en el handshake TLS (verificado:
 *     8 intentos en 105s sobre un host nuevo, cero certificado).
 *
 * No se puede tapar con un cert wildcard: Let's Encrypt solo valida wildcards
 * por DNS-01, y para eso Vercel necesita controlar los nameservers. Están en
 * Cloudflare, y moverlos rompería Email Routing (MX), el DKIM de Resend y el
 * SPF de SES. Por eso el alta es por host, vía la API de Vercel.
 *
 * El síntoma de NO hacer esto es de los peores: el cliente recibe su link, el
 * browser le muestra un error de certificado, y del lado nuestro no hay ningún
 * log ni ningún error. Todo "funciona" menos donde el cliente mira.
 */
import { env } from '../config/env'

export interface TenantDomainResult {
  status: 'created' | 'already-exists' | 'skipped' | 'failed'
  domain: string | null
  reason?: string
}

/** Config completa = feature prendida. Falta cualquiera ⇒ apagada. */
function config(): { token: string; projectId: string; root: string } | null {
  const token = env.VERCEL_API_TOKEN
  const projectId = env.VERCEL_PROJECT_ID
  const root = env.TENANT_ROOT_DOMAIN
  return token && projectId && root ? { token, projectId, root } : null
}

/**
 * Emite el certificado TLS de `<slug>.<TENANT_ROOT_DOMAIN>` en Vercel.
 *
 * NUNCA lanza: el alta del dominio es un efecto EXTERNO y secundario. Si falla,
 * la empresa ya está creada y su portal sigue siendo alcanzable por
 * `/c/<slug>`; lo único que falta es el certificado del subdominio, que se
 * puede reintentar a mano. Tirar acá abortaría la creación de la empresa por
 * un problema de infraestructura ajeno al CRM.
 *
 * Idempotente: si el dominio ya está en el proyecto, Vercel responde 409 y lo
 * tratamos como éxito.
 */
export async function provisionTenantDomain(slug: string): Promise<TenantDomainResult> {
  const cfg = config()
  if (!cfg) {
    return {
      status: 'skipped',
      domain: null,
      reason: 'Faltan VERCEL_API_TOKEN / VERCEL_PROJECT_ID / TENANT_ROOT_DOMAIN',
    }
  }

  const domain = `${slug}.${cfg.root}`
  // El team id va como query param, no en el body: si el proyecto vive en un
  // team y no se manda, la API responde 403 aunque el token sea válido.
  const teamQuery = env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(env.VERCEL_TEAM_ID)}` : ''
  //
  // ─── Por qué `/v3/certs` y no `/projects/{id}/domains` ─────────────────────
  // Agregar el subdominio como DOMINIO del proyecto también funcionaría, pero
  // sería redundante: el ruteo ya lo resuelve el alias wildcard `*.<raíz>`, que
  // figura verificado en el proyecto. Lo ÚNICO que falta por tenant es el
  // certificado.
  //
  // Es además como está armada la producción de hoy: `uirtus.synousai.com`
  // funciona y NO figura en la lista de dominios del proyecto (son 4: el
  // wildcard, admin, app y el .vercel.app) — tiene un certificado suelto,
  // emitido el 2026-09-12. Emitir solo el cert mantiene la lista de dominios
  // limpia en vez de hacerla crecer un ítem por cliente.
  const url = `https://api.vercel.com/v3/certs${teamQuery}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${cfg.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ cns: [domain] }),
      // Sin timeout la creación de una empresa queda colgada de la latencia de
      // un tercero. 10s es de sobra para este endpoint.
      signal: AbortSignal.timeout(10_000),
    })

    if (res.ok) {
      console.info('[tenant-domain] certificado emitido', { domain })
      return { status: 'created', domain }
    }

    const body = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } }
    const code = body.error?.code ?? ''

    // Ya existe (en este proyecto o en otro del mismo team) ⇒ nada que hacer.
    if (res.status === 409 || code === 'cert_already_exists' || code === 'domain_already_in_use') {
      return { status: 'already-exists', domain }
    }

    console.warn('[tenant-domain] Vercel rechazó la emisión del certificado', {
      domain,
      status: res.status,
      code,
      message: body.error?.message,
    })
    return { status: 'failed', domain, reason: body.error?.message ?? `HTTP ${res.status}` }
  } catch (e) {
    // Red caída, DNS, timeout. Mismo criterio: se loguea y se sigue.
    const reason = e instanceof Error ? e.message : String(e)
    console.warn('[tenant-domain] falló la llamada a Vercel', { domain, reason })
    return { status: 'failed', domain, reason }
  }
}
