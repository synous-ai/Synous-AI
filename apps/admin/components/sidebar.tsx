'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import {
  LayoutDashboard,
  BarChart3,
  Inbox,
  Briefcase,
  FolderKanban,
  Wrench,
  Wallet,
  Library,
  Calendar,
  Settings,
  ChevronDown,
  LogOut,
  MoreHorizontal,
  Sun,
  Moon,
  User,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { useUser, useClerk } from '@clerk/nextjs'
import { cn, initials } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { NotificationBell } from '@/components/notifications/notification-bell'

type Icon = typeof Briefcase
interface SubItem {
  label: string
  href?: string // sin href => placeholder "Pronto"
  section?: boolean // si true, es un encabezado de sección (no clickeable)
}
interface Group {
  label: string
  icon: Icon
  items: SubItem[]
}

const STORAGE_KEY = 'nous-sidebar-collapsed'

// Ítems sueltos (sin grupo) — cada uno = un destino real
const DASHBOARD = { label: 'Dashboard', icon: LayoutDashboard, href: '/admin/dashboard' }
const SETTER = { label: 'Setter', icon: Inbox, href: '/admin/setter' }
const REPORTS = { label: 'Reportes', icon: BarChart3, href: '/admin/reports' }
const CALENDAR = { label: 'Calendario', icon: Calendar, href: '/admin/calendar' }
const STANDALONE = [DASHBOARD, SETTER, REPORTS, CALENDAR]

// IA: un ítem = un destino real. Las sub-features (Entregables, Formularios, Change
// Requests, Disponibilidad, Tipos de reunión) viven como TABS dentro de su entidad,
// no como ítems de menú. Los filtros (clientes activos/potenciales) son controles
// in-page. La Biblioteca es el hogar único de assets reutilizables.
const GROUPS: Group[] = [
  {
    label: 'CRM',
    icon: Briefcase,
    items: [
      { label: 'Pipeline', href: '/admin/pipeline' },
      { label: 'Leads', href: '/admin/leads' },
      { label: 'Clientes', href: '/admin/clients' },
      { label: 'Contactos', href: '/admin/contacts' },
      { label: 'Empresas', href: '/admin/companies' },
      { label: 'Deals', href: '/admin/deals' },
      { label: 'Seguimientos', href: '/admin/follow-ups' },
    ],
  },
  {
    label: 'Proyectos',
    icon: FolderKanban,
    items: [
      { label: 'Proyectos', href: '/admin/projects' },
      { label: 'Tareas', href: '/admin/tasks' },
    ],
  },
  {
    label: 'Operaciones',
    icon: Wrench,
    items: [
      { label: 'Bugs', href: '/admin/operations/bugs' },
      { label: 'Mejoras', href: '/admin/operations/improvements' },
      { label: 'Roadmap', href: '/admin/operations/roadmap' },
      // "Procesos" fue removido de Operaciones (PO3) — los procesos viven
      // ahora como SOPs en Biblioteca → /admin/library/sops.
    ],
  },
  {
    label: 'Finanzas',
    icon: Wallet,
    items: [
      { label: 'Resumen', href: '/admin/finance/summary' },
      { label: 'INGRESOS', section: true },
      { label: 'Facturas', href: '/admin/finance/invoices' },
      { label: 'Cobros', href: '/admin/finance/cobros' },
      { label: 'Retainers', href: '/admin/finance/retainers' },
      { label: 'EGRESOS', section: true },
      { label: 'Gastos', href: '/admin/finance/expenses' },
      { label: 'ANÁLISIS', section: true },
      { label: 'Rentabilidad' },
      { label: 'Proyección' },
      { label: 'Reparto' },
    ],
  },
  {
    label: 'Biblioteca',
    icon: Library,
    items: [
      { label: 'Documentos', href: '/admin/library/documents' },
      { label: 'Plantillas', href: '/admin/library/templates' },
      { label: 'Contratos base', href: '/admin/library/contracts' },
      { label: 'Propuestas base', href: '/admin/library/proposals' },
      // Checklists se fusionó en la sección 'sops' como `kind='checklist'`.
      // Ya no existe la ruta /library/checklists — el filtro vive en /library/sops.
      { label: 'Procesos y checklists', href: '/admin/library/sops' },
      { label: 'Documentación técnica', href: '/admin/library/tech-docs' },
    ],
  },
  {
    label: 'Configuración',
    icon: Settings,
    items: [
      { label: 'General', href: '/admin/settings' },
      { label: 'Prospección', href: '/admin/settings/prospecting' },
      { label: 'White-Label', href: '/admin/settings/white-label' },
      { label: 'Roles y permisos', href: '/admin/settings/roles' },
      { label: 'Formularios', href: '/admin/settings/forms' },
      { label: 'Campos personalizados', href: '/admin/settings/custom-fields' },
      { label: 'Integraciones', href: '/admin/settings/integrations' },
      { label: 'Portal de cliente', href: '/admin/settings/client-portal' },
    ],
  },
]

/** ¿La ruta actual cae dentro de este href? (coincidencia exacta o ruta hija). */
function matchesHref(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/')
}

/**
 * Devuelve el `id` del ÚNICO ítem que debe resaltarse para la ruta actual:
 * el de href más específico (más largo). Ante hrefs idénticos gana el primero
 * en orden de render, evitando que varios ítems se enciendan a la vez.
 */
function resolveActiveId(pathname: string, items: { id: string; href?: string }[]): string | null {
  let best: { id: string; len: number } | null = null
  for (const it of items) {
    if (!it.href || !matchesHref(pathname, it.href)) continue
    if (!best || it.href.length > best.len) best = { id: it.id, len: it.href.length }
  }
  return best?.id ?? null
}

function SubItemLink({ item, active, onNavigate }: { item: SubItem; active: boolean; onNavigate?: (href: string) => void }) {
  // Encabezado de sección: no es clickeable, solo visual
  if (item.section) {
    return (
      <div className="px-3 pb-1 pt-2.5 pl-9">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">{item.label}</p>
      </div>
    )
  }
  if (!item.href) {
    return (
      <div className="flex cursor-default items-center justify-between rounded-lg py-2 pl-9 pr-3 text-sm text-muted-foreground/60">
        <span>{item.label}</span>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          Pronto
        </span>
      </div>
    )
  }
  return (
    <Link
      href={item.href}
      onClick={() => item.href && onNavigate?.(item.href)}
      className={cn(
        'block rounded-lg py-2 pl-9 pr-3 text-sm transition-colors',
        active
          ? 'bg-accent text-accent-foreground font-medium'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {item.label}
    </Link>
  )
}

function NavGroup({
  group,
  activeId,
  open,
  collapsed,
  onToggle,
  onNavigate,
  onExpandAndOpen,
}: {
  group: Group
  activeId: string | null
  open: boolean
  collapsed: boolean
  onToggle: () => void
  onNavigate?: (href: string) => void
  onExpandAndOpen: () => void
}) {
  const Icon = group.icon
  const active = group.items.filter((i) => !i.section).some((i) => `${group.label}::${i.label}` === activeId)

  // Colapsado: solo el ícono. Al clickear, expande el sidebar y abre el grupo.
  if (collapsed) {
    return (
      <button
        type="button"
        title={group.label}
        aria-label={group.label}
        onClick={onExpandAndOpen}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
          active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
      </button>
    )
  }

  return (
    <div>
      <Button
        variant="ghost"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          'flex h-auto w-full items-center justify-start gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
          'text-foreground hover:bg-muted',
        )}
      >
        <Icon className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
        <span className="truncate">{group.label}</span>
        <ChevronDown className={cn('ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-out', open ? '' : '-rotate-90')} />
      </Button>
      <div className={cn('grid transition-[grid-template-rows] duration-300 ease-out', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="overflow-hidden">
          <div className="space-y-0.5 pt-0.5">
            {group.items.map((item) => (
              <SubItemLink key={item.label} item={item} active={`${group.label}::${item.label}` === activeId} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  // El usuario y el logout vienen de Clerk — ya no del Zustand store.
  const { user: clerkUser } = useUser()
  const { signOut, openUserProfile } = useClerk()
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Colapsado: persistido en localStorage. Se lee tras montar para no romper la
  // hidratación SSR (el server siempre renderiza expandido).
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === '1') setCollapsed(true)
  }, [])
  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }

  // Resaltado optimista: al hacer click marcamos el href de inmediato y lo
  // limpiamos cuando `pathname` alcanza la navegación. Evita el lag entre el
  // click y que el App Router termine de cargar la ruta nueva.
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  useEffect(() => { setPendingHref(null) }, [pathname])
  const activePath = pendingHref ?? pathname

  // Lista plana de ítems con id estable (grupo::label) para resolver el activo único.
  const flatItems = GROUPS.flatMap((g) => g.items.filter((i) => !i.section).map((i) => ({ id: `${g.label}::${i.label}`, href: i.href })))
  const activeId = resolveActiveId(activePath, flatItems)

  // Cada grupo arranca abierto solo si contiene la ruta activa.
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    // Cada grupo arranca abierto SOLO si contiene la ruta activa (contexto). Ninguna
    // sección se expande "por defecto" cuando la ruta no pertenece a ningún grupo.
    for (const g of GROUPS) init[g.label] = g.items.filter((i) => !i.section).some((i) => i.href && matchesHref(pathname, i.href))
    return init
  })

  // Colapsado → click en un grupo: expande el sidebar y abre ese grupo.
  function expandAndOpen(label: string) {
    setCollapsed(false)
    try { localStorage.setItem(STORAGE_KEY, '0') } catch { /* ignore */ }
    setOpen((prev) => ({ ...prev, [label]: true }))
  }

  async function logout() {
    // Clerk destruye la sesión y las cookies __session.
    // El redirect lo maneja el middleware (clerkMiddleware) automáticamente.
    await signOut({ redirectUrl: '/admin/login' })
    router.replace('/admin/login')
  }

  const displayName =
    clerkUser?.fullName ??
    clerkUser?.firstName ??
    clerkUser?.primaryEmailAddress?.emailAddress ??
    'Cuenta'

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r bg-background transition-[width] duration-300 ease-in-out',
        collapsed ? 'w-[72px]' : 'w-64',
      )}
    >
      {/* Header: marca TEXTUAL (sin badge) + bell solo expandido. Padding fijo. */}
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b px-4">
        {collapsed ? (
          <span className="text-base font-semibold tracking-tight">N</span>
        ) : (
          <>
            <span className="truncate text-base font-medium tracking-tight">NOUS</span>
            <div className="ml-auto">
              <NotificationBell />
            </div>
          </>
        )}
      </div>

      {/* Padding fijo (p-3 + px-3 en cada ítem) en ambos estados → los iconos
          NO se mueven al colapsar; solo se oculta el label y cambia el ancho. */}
      <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden p-3">
        {/* Ítems sueltos */}
        {STANDALONE.map((item) => {
          const Icon = item.icon
          const active = matchesHref(activePath, item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setPendingHref(item.href)}
              title={collapsed ? item.label : undefined}
              className={cn(
                // Mismo tratamiento que los encabezados de grupo: label siempre
                // text-foreground + font-medium para que TODOS los labels del sidebar
                // tengan el mismo color (en dark y light). El activo se distingue por el fondo.
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-muted text-foreground'
                  : 'text-foreground hover:bg-muted',
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          )
        })}

        {GROUPS.map((group) => (
          <NavGroup
            key={group.label}
            group={group}
            activeId={activeId}
            open={open[group.label] ?? false}
            collapsed={collapsed}
            onToggle={() => setOpen((prev) => ({ ...prev, [group.label]: !prev[group.label] }))}
            onNavigate={setPendingHref}
            onExpandAndOpen={() => expandAndOpen(group.label)}
          />
        ))}
      </nav>

      <div className="shrink-0 space-y-1 border-t p-3">
        {/* Toggle colapsar/expandir */}
        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-[18px] w-[18px] shrink-0" />
          ) : (
            <>
              <PanelLeftClose className="h-[18px] w-[18px] shrink-0" />
              <span className="truncate">Colapsar</span>
            </>
          )}
        </button>

        {/* Usuario — avatar de Clerk (imagen real o iniciales) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              title={collapsed ? displayName : undefined}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Avatar className="h-8 w-8 shrink-0">
                {clerkUser?.imageUrl && <AvatarImage src={clerkUser.imageUrl} alt={displayName} />}
                <AvatarFallback className="bg-muted font-mono text-xs font-medium text-foreground">
                  {initials(clerkUser?.firstName, clerkUser?.lastName)}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{displayName}</p>
                    <p className="truncate font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                      admin
                    </p>
                  </div>
                  <MoreHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            {/* Abre el <UserProfile> nativo de Clerk como modal (gestión de cuenta,
                email, contraseña, sesiones). */}
            <DropdownMenuItem
              onClick={() => openUserProfile()}
              className="flex items-center gap-2 cursor-pointer"
            >
              <User className="h-4 w-4" />
              Mi perfil
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              className="flex items-center gap-2 cursor-pointer"
            >
              {mounted ? (
                resolvedTheme === 'dark' ? (
                  <><Sun className="h-4 w-4" /> Cambiar a claro</>
                ) : (
                  <><Moon className="h-4 w-4" /> Cambiar a oscuro</>
                )
              ) : (
                <><Moon className="h-4 w-4" /> Cambiar tema</>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={logout}
              className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  )
}
