import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SLUG_RESERVED } from '@synous/shared'

/**
 * Middleware unificado de la app web (landing + admin + portal de cliente).
 *
 * Orden de responsabilidades:
 *  1. Tenant white-label: subdominio o path /c/<slug> → rewrite a /portal/*.
 *  2. Conveniencia: /login → /admin/login (back-compat).
 *  3. Protección admin: Clerk protege TODO /admin/* EXCEPTO /admin/login.
 *     Unauthenticated → redirect automático a /admin/login.
 *  4. Protección portal (CA2): Clerk protege /portal/* EXCEPTO /portal/login.
 *     Unauthenticated → redirect a /portal/login.
 *  5. Routing por userType (best-effort, NO es el gate de seguridad):
 *     Si un cliente autenticado cae en /admin/* → va a /portal.
 *     Si un admin autenticado cae en /portal/* (no login) → va a /admin/dashboard.
 *     La seguridad real la hace el backend con resolveClientAccount / resolveHubUser.
 *
 * NOTA DE SEGURIDAD: El middleware es una primera línea de defensa conveniente.
 * El verdadero gate de autorización está en el backend (authenticate-client.ts
 * verifica publicMetadata.userType === 'client'). Un admin logueado que llegue a
 * /portal/* sin ser redirigido por el middleware igual recibirá un 401 del backend.
 */

// ─── Constantes ───────────────────────────────────────────────────────────────

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 días

// ─── Matchers de ruta ────────────────────────────────────────────────────────

// Admin: protegido todo excepto /admin/login.
const isAdminProtected = createRouteMatcher(['/admin/(.*)'])
const isAdminPublic = createRouteMatcher(['/admin/login(.*)'])

// Portal: protegido todo excepto las rutas públicas de abajo (login + aceptación
// de invitación). ÚNICA fuente de verdad: la usan tanto el matcher de Clerk como
// la rama de tenant white-label (que calcula el destino del rewrite a mano) —
// duplicar el cálculo dejaba `/portal/accept-invitation` protegida en esa rama
// aunque estuviera exenta acá.
const PORTAL_PUBLIC_PREFIXES = ['/portal/login', '/portal/accept-invitation'] as const
// OJO con el patrón: `/portal/(.*)` NO matchea `/portal` pelado (la barra es
// literal), así que el HOME del portal —la puerta de entrada del cliente— se
// servía sin pasar por auth.protect(). No era fuga de datos (el backend
// devuelve 401 y el layout tiene guard propio), pero el visitante sin sesión
// recibía el shell de la página en vez de un redirect limpio al login.
// Por eso las dos entradas: la exacta y la de subrutas.
const isPortalProtected = createRouteMatcher(['/portal', '/portal/(.*)'])
const isPortalPublic = createRouteMatcher(PORTAL_PUBLIC_PREFIXES.map((p) => `${p}(.*)`))
function isPortalPublicPath(pathname: string): boolean {
  return PORTAL_PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

// ─── Helpers de tenant ────────────────────────────────────────────────────────

/** Extrae el subdominio del host, o null si es apex/www/localhost pelado o reservado. */
function getSubdomain(host: string): string | null {
  const hostname = (host.split(':')[0] || '').toLowerCase()
  if (!hostname || hostname === 'localhost') return null

  let candidate: string | null = null

  // dev: *.localhost
  if (hostname.endsWith('.localhost')) {
    const first = hostname.split('.')[0]
    candidate = first && first !== 'www' ? first : null
  } else {
    // prod: si está configurado el dominio raíz, sacá el label de adelante
    const root = process.env['NEXT_PUBLIC_ROOT_DOMAIN']
    if (root && hostname.endsWith('.' + root.toLowerCase())) {
      const sub = hostname.slice(0, hostname.length - root.length - 1)
      const first = sub.split('.')[0]
      candidate = first && first !== 'www' ? first : null
    } else {
      // Dominios propios de plataformas de deploy (Vercel, etc.): el nombre del
      // proyecto ocupa el label de subdominio (ej. synous-ai-admin.vercel.app),
      // pero NO es un tenant white-label — es la instancia misma de la app. Sin
      // esta excepción, el fallback heurístico de abajo confunde el deployment
      // con un cliente y rompe TODO el sitio (rewrite/protección a /portal/* en
      // cualquier ruta, incluida /admin/login). Bug real observado en producción
      // antes de este fix, no una precaución teórica.
      const PLATFORM_DOMAIN_SUFFIXES = ['.vercel.app'] as const
      if (PLATFORM_DOMAIN_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
        candidate = null
      } else {
        // fallback heurístico: 3+ labels (sub.dominio.tld) y no www
        const labels = hostname.split('.')
        candidate = labels.length > 2 && labels[0] && labels[0] !== 'www' ? labels[0] : null
      }
    }
  }

  if (!candidate) return null

  // Mismo bug que motivó la excepción de PLATFORM_DOMAIN_SUFFIXES arriba, pero
  // con subdominios PROPIOS de la plataforma en vez de ajenos: con
  // NEXT_PUBLIC_ROOT_DOMAIN=synousai.com, "app.synousai.com" resolvía como
  // tenant "app" y el middleware reescribía TODO (incluido /admin/login) a
  // /portal/*, dejando el admin real inaccesible en producción. `SLUG_RESERVED`
  // es la MISMA lista que usa `uniqueCompanySlug()` en la API para no
  // asignarle esos slugs a una empresa — a propósito, para que esta lista y la
  // de la API nunca diverjan (ver `packages/shared/src/slug.ts`).
  if ((SLUG_RESERVED as readonly string[]).includes(candidate)) return null

  return candidate
}

/** Setea la cookie del tenant solo si cambió (evita writes innecesarios). */
function setTenantCookie(res: NextResponse, req: NextRequest, tenant: string): void {
  if (req.cookies.get('dd_tenant')?.value !== tenant) {
    res.cookies.set('dd_tenant', tenant, { path: '/', sameSite: 'lax', maxAge: COOKIE_MAX_AGE })
  }
}

/**
 * Resuelve el tenant white-label y devuelve el NextResponse de rewrite/next
 * si aplica, o null si la request no es de portal.
 *
 * Extraído como función pura para composición limpia dentro de clerkMiddleware.
 */
function resolveTenant(req: NextRequest): NextResponse | null {
  const { pathname } = req.nextUrl

  // 1. Path explícito /c/<slug>/... (dev / back-compat): rewrite a /portal/* + cookie.
  const m = pathname.match(/^\/c\/([^/]+)(\/.*)?$/)
  if (m && m[1]) {
    const url = req.nextUrl.clone()
    const rest = m[2] || ''
    url.pathname = `/portal${rest}`
    const res = NextResponse.rewrite(url)
    setTenantCookie(res, req, m[1])
    return res
  }

  // 2. Subdominio del host → rewrite a /portal/* + cookie.
  const sub = getSubdomain(req.headers.get('host') ?? '')
  if (sub) {
    const url = req.nextUrl.clone()
    if (!pathname.startsWith('/portal')) {
      url.pathname = `/portal${pathname === '/' ? '' : pathname}`
    }
    const res =
      url.pathname !== pathname ? NextResponse.rewrite(url) : NextResponse.next()
    setTenantCookie(res, req, sub)
    return res
  }

  return null
}

// ─── Middleware principal ─────────────────────────────────────────────────────

export default clerkMiddleware(async (auth, req) => {
  const { pathname } = req.nextUrl

  // 1. Tenant white-label: si corresponde a portal → proteger primero, luego rewrite.
  //    Next.js NO vuelve a correr el middleware sobre el destino de un rewrite, así que
  //    verificamos la sesión aquí antes de servir la página reescrita. La excepción es
  //    la ruta de login (/portal/login), que es pública.
  const tenantResp = resolveTenant(req)
  if (tenantResp) {
    // Calculamos el pathname destino del rewrite para saber si requiere protección.
    // resolveTenant escribe a /portal/... ; sólo /portal/login es pública.
    // La ruta /c/<slug> sin path adicional → /portal (home, protegido).
    // Usamos el pathname original del request para inferir si el destino es login.
    const destPathname = (() => {
      const m = pathname.match(/^\/c\/([^/]+)(\/.*)?$/)
      if (m) return `/portal${m[2] ?? ''}`
      // subdominio: ya tiene pathname de la request
      if (!pathname.startsWith('/portal')) return `/portal${pathname === '/' ? '' : pathname}`
      return pathname
    })()
    const destIsPortalPublic = isPortalPublicPath(destPathname)
    if (!destIsPortalPublic) {
      // Proteger: redirigir a login del portal si no hay sesión.
      await auth.protect({ unauthenticatedUrl: new URL('/portal/login', req.url).toString() })
    }
    return tenantResp
  }

  // 2. Conveniencia: /login → /admin/login (back-compat con links viejos).
  if (pathname === '/login' || pathname.startsWith('/login/')) {
    return NextResponse.redirect(new URL('/admin/login', req.url))
  }

  // 2b. /admin exacto → /admin/dashboard. Los route groups (auth)/(dashboard) no aportan
  //     segmento de URL, así que no existe página en /admin (daba 404). Redirigimos al
  //     dashboard y dejamos que la protección de /admin/* (abajo) decida: sin sesión →
  //     /admin/login (auth.protect); sesión cliente → /portal; admin → dashboard.
  if (pathname === '/admin') {
    return NextResponse.redirect(new URL('/admin/dashboard', req.url))
  }

  // 3. Proteger admin (excepto /admin/login que es la página pública de entrada).
  //    `auth.protect()` a secas hace notFound() cuando no hay sesión, así que
  //    entrar a cualquier link profundo del admin sin estar logueado devolvía
  //    un 404 en vez del login (verificado: GET /admin/tasks → 404). Pasamos
  //    unauthenticatedUrl explícito, igual que el portal más abajo.
  if (isAdminProtected(req) && !isAdminPublic(req)) {
    await auth.protect({ unauthenticatedUrl: new URL('/admin/login', req.url).toString() })
  }

  // 4. Proteger portal (excepto /portal/login) — CA2.
  //    auth.protect() con redirectUrl apunta al login del portal (no al del admin).
  if (isPortalProtected(req) && !isPortalPublic(req)) {
    await auth.protect({ unauthenticatedUrl: new URL('/portal/login', req.url).toString() })
  }

  // 5. Routing por userType (best-effort, conveniencia — NO es el gate de seguridad).
  //    El verdadero gate está en el backend (resolveHubUser / resolveClientAccount).
  //
  //    IMPORTANTE: por defecto Clerk NO incluye publicMetadata en el session token, así
  //    que `userType` puede venir undefined. Lo leemos desde el claim top-level `userType`
  //    (configurable en Dashboard → Customize session token:
  //      { "userType": "{{user.public_metadata.userType}}" }) con fallback a publicMetadata.
  //
  //    Solo redirigimos ante un tipo CONOCIDO y equivocado. Si el claim falta (undefined),
  //    NO expulsamos: dejamos cargar la página y que el backend gatee. Esto evita el bug en
  //    que un cliente con sesión válida era rebotado de /portal/* a /admin por falta del claim.
  const { sessionClaims } = await auth()
  if (sessionClaims) {
    const claims = sessionClaims as Record<string, unknown> & { publicMetadata?: { userType?: string } }
    const userType = (claims.userType as string | undefined) ?? claims.publicMetadata?.userType
    // Cliente conocido intentando acceder al admin → portal.
    if (userType === 'client' && isAdminProtected(req) && !isAdminPublic(req)) {
      return NextResponse.redirect(new URL('/portal', req.url))
    }
    // Admin conocido intentando acceder al portal → admin.
    if (userType === 'admin' && isPortalProtected(req) && !isPortalPublic(req)) {
      return NextResponse.redirect(new URL('/admin/dashboard', req.url))
    }
  }

  // 6. Apex / localhost pelado / cualquier otra ruta → passthrough.
  return NextResponse.next()
})

export const config = {
  /**
   * Corre en páginas; no en assets estáticos, _next ni api.
   * El matcher excluye:
   *  - _next/static, _next/image (assets de Next.js)
   *  - favicon.ico
   *  - Archivos con extensión (imágenes, fonts, etc.)
   *  - /api/* (rutas de API de Next.js, si las hubiera)
   * Mantenido igual al matcher original para no romper nada.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*|api).*)'],
}
