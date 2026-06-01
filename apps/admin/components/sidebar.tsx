'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import {
  LayoutDashboard,
  BarChart3,
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
} from 'lucide-react'
import { apiPost } from '@/lib/api'
import { useAuthStore } from '@/lib/store/auth'
import { cn, initials } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { BrandMark } from '@/components/ui/brand-mark'
import { NotificationBell } from '@/components/notifications/notification-bell'

type Icon = typeof Briefcase
interface SubItem {
  label: string
  href?: string // sin href => placeholder "Pronto"
}
interface Group {
  label: string
  icon: Icon
  items: SubItem[]
}

// Ítems sueltos (sin grupo) — cada uno = un destino real
const DASHBOARD = { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' }
const REPORTS = { label: 'Reportes', icon: BarChart3, href: '/reports' }
const CALENDAR = { label: 'Calendario', icon: Calendar, href: '/calendar' }
const STANDALONE = [DASHBOARD, REPORTS, CALENDAR]

// IA: un ítem = un destino real. Las sub-features (Entregables, Formularios, Change
// Requests, Disponibilidad, Tipos de reunión) viven como TABS dentro de su entidad,
// no como ítems de menú. Los filtros (clientes activos/potenciales) son controles
// in-page. La Biblioteca es el hogar único de assets reutilizables.
const GROUPS: Group[] = [
  {
    label: 'CRM',
    icon: Briefcase,
    items: [
      { label: 'Pipeline', href: '/pipeline' },
      { label: 'Leads', href: '/leads' },
      { label: 'Clientes', href: '/clients' },
      { label: 'Contactos', href: '/contacts' },
      { label: 'Empresas', href: '/companies' },
      { label: 'Deals', href: '/deals' },
      { label: 'Seguimientos', href: '/follow-ups' },
    ],
  },
  {
    label: 'Proyectos',
    icon: FolderKanban,
    items: [
      { label: 'Proyectos', href: '/projects' },
      { label: 'Tareas', href: '/tasks' },
    ],
  },
  {
    label: 'Operaciones',
    icon: Wrench,
    items: [
      { label: 'Bugs', href: '/operations/bugs' },
      { label: 'Mejoras', href: '/operations/improvements' },
      { label: 'Roadmap', href: '/operations/roadmap' },
      { label: 'Procesos', href: '/operations/processes' },
    ],
  },
  {
    label: 'Finanzas',
    icon: Wallet,
    items: [
      { label: 'Resumen', href: '/finance/summary' },
      { label: 'Facturas', href: '/finance/invoices' },
      { label: 'Pagos', href: '/finance/payments' },
      { label: 'Cuentas por cobrar', href: '/finance/receivables' },
      { label: 'Ingresos', href: '/finance/income' },
      { label: 'Retainers', href: '/finance/retainers' },
    ],
  },
  {
    label: 'Biblioteca',
    icon: Library,
    items: [
      { label: 'Documentos', href: '/library/documents' },
      { label: 'Plantillas', href: '/library/templates' },
      { label: 'Contratos base', href: '/library/contracts' },
      { label: 'Propuestas base', href: '/library/proposals' },
      { label: 'Checklists', href: '/library/checklists' },
      { label: 'SOPs', href: '/library/sops' },
      { label: 'Documentación técnica', href: '/library/tech-docs' },
    ],
  },
  {
    label: 'Configuración',
    icon: Settings,
    items: [
      { label: 'General', href: '/settings' },
      { label: 'Roles y permisos', href: '/settings/roles' },
      { label: 'Formularios', href: '/settings/forms' },
      { label: 'Campos personalizados', href: '/settings/custom-fields' },
      { label: 'Integraciones', href: '/settings/integrations' },
      { label: 'Portal de cliente', href: '/settings/client-portal' },
      { label: 'Notificaciones', href: '/settings/notifications' },
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

function SubItemLink({ item, active }: { item: SubItem; active: boolean }) {
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

function NavGroup({ group, activeId, open, onToggle }: { group: Group; activeId: string | null; open: boolean; onToggle: () => void }) {
  const Icon = group.icon
  const active = group.items.some((i) => `${group.label}::${i.label}` === activeId)
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
        <Icon className="h-[18px] w-[18px] text-muted-foreground" />
        {group.label}
        <ChevronDown className={cn('ml-auto h-4 w-4 text-muted-foreground transition-transform duration-300 ease-out', open ? '' : '-rotate-90')} />
      </Button>
      <div className={cn('grid transition-[grid-template-rows] duration-300 ease-out', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="overflow-hidden">
          <div className="space-y-0.5 pt-0.5">
            {group.items.map((item) => (
              <SubItemLink key={item.label} item={item} active={`${group.label}::${item.label}` === activeId} />
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
  const user = useAuthStore((s) => s.user)
  const clear = useAuthStore((s) => s.clear)
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Lista plana de ítems con id estable (grupo::label) para resolver el activo único.
  const flatItems = GROUPS.flatMap((g) => g.items.map((i) => ({ id: `${g.label}::${i.label}`, href: i.href })))
  const activeId = resolveActiveId(pathname, flatItems)

  // Cada grupo arranca abierto solo si contiene la ruta activa.
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    for (const g of GROUPS) init[g.label] = g.items.some((i) => i.href && matchesHref(pathname, i.href))
    // Si ninguno quedó abierto, abrir CRM por defecto.
    if (!Object.values(init).some(Boolean)) init['CRM'] = true
    return init
  })

  async function logout() {
    try {
      await apiPost('/api/auth/logout', undefined, { skipAuth: true })
    } catch {
      /* ignore */
    }
    clear()
    router.replace('/login')
  }

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-background">
      <div className="flex h-16 flex-shrink-0 items-center gap-2.5 border-b px-5">
        <BrandMark letter="D" />
        <span className="text-base font-medium tracking-tight">DevDúo</span>
        <div className="ml-auto">
          <NotificationBell />
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {/* Ítems sueltos: Dashboard · Reportes · Calendario */}
        {STANDALONE.map((item) => {
          const Icon = item.icon
          const active = matchesHref(pathname, item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors',
                active
                  ? 'bg-muted text-foreground font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="h-[18px] w-[18px] text-muted-foreground" />
              {item.label}
            </Link>
          )
        })}

        {GROUPS.map((group) => (
          <NavGroup
            key={group.label}
            group={group}
            activeId={activeId}
            open={open[group.label] ?? false}
            onToggle={() => setOpen((prev) => ({ ...prev, [group.label]: !prev[group.label] }))}
          />
        ))}
      </nav>

      <div className="flex-shrink-0 border-t p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted font-mono text-xs font-medium text-foreground">
                {initials(user?.firstName, user?.lastName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{user?.firstName ?? user?.email}</p>
                <p className="truncate font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{user?.role}</p>
              </div>
              <MoreHorizontal className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuItem asChild>
              <Link href="/settings" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Mi perfil
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="flex items-center gap-2 cursor-pointer"
            >
              {mounted ? (
                theme === 'dark' ? (
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
