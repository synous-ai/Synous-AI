import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SLUG_RESERVED } from '@synous/shared'

/**
 * Middleware unificado de la app web (landing + admin + portal de cliente).
 *
 * Orden de responsabilidades:
 *  0. Host del panel (admin.*): sirve SOLO el admin, con URLs sin el prefijo
 *     /admin (admin.synousai.com/login, /dashboard, …). Rewrite a /admin/*.
 *     Las páginas siguen en app/admin/*; el prefijo desaparece de la URL, no
 *     del árbol de archivos. Los links internos ya son sin prefijo.
 *  1. Tenant white-label: subdominio o path /c/<slug> → rewrite a /portal/*.
 *  2. Desde otro dominio, /admin/* y /login → redirect al host del panel.
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
// `/portal/bienvenida` (la carta) y `/portal/propuesta` (la propuesta completa)
// son públicas a propósito: las recibe un prospecto ANTES de que exista su
// cuenta, así que exigir sesión las volvería inalcanzables justo para quien
// están destinadas.
const PORTAL_PUBLIC_PREFIXES = [
  '/portal/login',
  '/portal/accept-invitation',
  '/portal/bienvenida',
  '/portal/propuesta',
] as const
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

// ─── Host del panel interno (admin.*) ────────────────────────────────────────

/**
 * Label de subdominio que sirve el panel interno. Está en `SLUG_RESERVED`
 * (packages/shared/src/slug.ts), así que `getSubdomain()` ya lo descarta como
 * tenant white-label y ninguna empresa puede quedarse con este slug.
 */
const ADMIN_HOST_LABEL = 'admin'

/** ¿La request entra por el host del panel (admin.synousai.com, admin.localhost)? */
function isAdminHost(host: string): boolean {
  const hostname = (host.split(':')[0] || '').toLowerCase()
  return hostname.startsWith(`${ADMIN_HOST_LABEL}.`)
}

/**
 * Mapea el path "limpio" del host del panel al path real del App Router.
 *
 * En `admin.synousai.com` las URLs no llevan el prefijo `/admin`: la raíz es
 * el dashboard y el login es `/login`. Las páginas siguen viviendo en
 * `app/admin/*`, así que acá se traduce con un rewrite (no un redirect: el
 * usuario tiene que ver la URL limpia en la barra).
 *
 * Los paths que YA vienen con `/admin/...` se dejan pasar tal cual: los ~70
 * links internos de la app apuntan ahí y seguir funcionando sin tocarlos
 * mantiene el cambio acotado al ruteo.
 */
function adminHostTarget(pathname: string): string {
  // `/` no es una página del panel (los route groups (auth)/(dashboard) no
  // aportan segmento de URL), así que la raíz va al dashboard.
  if (pathname === '/') return '/admin/dashboard'
  return `/admin${pathname}`
}

/**
 * Base del host del panel, para mandar ahí las URLs viejas con `/admin/...`
 * que lleguen por otro dominio. `NEXT_PUBLIC_ADMIN_URL` tiene prioridad; si no,
 * se arma con el dominio raíz.
 *
 * Devuelve null en local sin dominio raíz configurado — ahí NO se redirige y
 * `/admin/*` se sigue sirviendo como antes, para no obligar a levantar
 * `admin.localhost` sólo para entrar al panel en desarrollo.
 */
function adminHostUrl(): string | null {
  const explicit = process.env['NEXT_PUBLIC_ADMIN_URL']
  if (explicit) return explicit.replace(/\/+$/, '')
  const root = process.env['NEXT_PUBLIC_ROOT_DOMAIN']
  return root ? `https://${ADMIN_HOST_LABEL}.${root.toLowerCase()}` : null
}

/** Saca el prefijo `/admin` de un path: `/admin/deals/1` → `/deals/1`, `/admin` → `/`. */
function stripAdminPrefix(pathname: string): string {
  return pathname.replace(/^\/admin(?=\/|$)/, '') || '/'
}

function isAdminLoginPath(path: string): boolean {
  return path === '/admin/login' || path.startsWith('/admin/login/')
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

  // 0. Host del panel interno (admin.*): sirve SOLO el admin, con URLs limpias.
  //    Va antes que todo lo demás porque decide el destino de la request entera.
  //    Sin esta rama, `admin.synousai.com/` caía en el passthrough final y
  //    servía la LANDING: `admin` está en SLUG_RESERVED, así que no resuelve
  //    como tenant, pero tampoco matcheaba ninguna ruta de /admin/*.
  if (isAdminHost(req.headers.get('host') ?? '')) {
    // Las URLs con el prefijo viejo se corrigen solas: `/admin/deals/1` →
    // `/deals/1`. Redirect (no rewrite) para que el prefijo desaparezca de la
    // barra y no queden dos URLs sirviendo la misma página.
    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      const url = req.nextUrl.clone()
      url.pathname = stripAdminPrefix(pathname)
      return NextResponse.redirect(url)
    }

    const target = adminHostTarget(pathname)

    if (!isAdminLoginPath(target)) {
      // Protección ANTES del rewrite: Next no vuelve a correr el middleware
      // sobre el destino, así que si no se chequea acá no se chequea nunca.
      // `unauthenticatedUrl` apunta a la URL limpia del propio host.
      await auth.protect({ unauthenticatedUrl: new URL('/login', req.url).toString() })

      // Un cliente logueado no tiene nada que hacer en el panel: se lo manda al
      // portal, que vive en OTRO dominio (app.synousai.com). Sin el salto
      // cross-domain quedaría redirigido a /portal de este mismo host, que acá
      // no existe. Si no hay dominio de portal configurado, cae al login del
      // panel y que decida el backend.
      const { sessionClaims } = await auth()
      const claims = sessionClaims as (Record<string, unknown> & { publicMetadata?: { userType?: string } }) | null
      const userType = (claims?.['userType'] as string | undefined) ?? claims?.publicMetadata?.userType
      if (userType === 'client') {
        const portalUrl = process.env['NEXT_PUBLIC_APP_URL']
        return NextResponse.redirect(portalUrl ? `${portalUrl.replace(/\/+$/, '')}/portal` : new URL('/login', req.url))
      }
    }

    if (target === pathname) return NextResponse.next()
    const url = req.nextUrl.clone()
    url.pathname = target
    return NextResponse.rewrite(url)
  }

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

  // 2. El panel vive SOLO en el host admin.*. Lo que llegue por otro dominio a
  //    /admin/* o /login (links viejos, bookmarks, el signInUrl de Clerk) se
  //    manda ahí, ya sin el prefijo.
  //
  //    Si no hay host de admin configurado (dev local sin dominio raíz) NO se
  //    redirige y /admin/* se sigue sirviendo acá, así no hace falta levantar
  //    admin.localhost sólo para entrar al panel.
  const adminUrl = adminHostUrl()
  if (adminUrl && (pathname === '/admin' || pathname.startsWith('/admin/') || pathname === '/login' || pathname.startsWith('/login/'))) {
    const dest = new URL(`${adminUrl}${stripAdminPrefix(pathname)}`)
    dest.search = req.nextUrl.search
    return NextResponse.redirect(dest)
  }

  // 2b. Sin host de admin configurado, se mantiene el comportamiento viejo:
  //     /login → /admin/login y /admin → /admin/dashboard (los route groups
  //     (auth)/(dashboard) no aportan segmento, así que /admin no es página).
  if (!adminUrl) {
    if (pathname === '/login' || pathname.startsWith('/login/')) {
      return NextResponse.redirect(new URL('/admin/login', req.url))
    }
    if (pathname === '/admin') {
      return NextResponse.redirect(new URL('/admin/dashboard', req.url))
    }
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
    // Admin conocido intentando acceder al portal → panel. Si el panel vive en
    // su propio host, el salto es cross-domain: un /admin/dashboard de ESTE
    // host ya no sirve el panel.
    if (userType === 'admin' && isPortalProtected(req) && !isPortalPublic(req)) {
      return NextResponse.redirect(adminUrl ? `${adminUrl}/dashboard` : new URL('/admin/dashboard', req.url))
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
