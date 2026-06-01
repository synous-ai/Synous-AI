'use client'

import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type Capability =
  | 'Ver registros'
  | 'Crear registros'
  | 'Editar registros'
  | 'Eliminar / archivar'
  | 'Configurar portal'
  | 'Gestionar usuarios'
  | 'Ver finanzas'
  | 'Emitir facturas'
  | 'Acceso al portal de clientes'

type Role = 'owner' | 'member' | 'viewer'

const ROLES: { id: Role; label: string; description: string }[] = [
  {
    id: 'owner',
    label: 'Owner',
    description: 'Control total del portal. Puede configurar todo, gestionar usuarios y ver finanzas.',
  },
  {
    id: 'member',
    label: 'Member',
    description: 'Operaciones día a día: CRM, deals, actividades. No puede cambiar configuración del portal ni gestionar usuarios.',
  },
  {
    id: 'viewer',
    label: 'Viewer',
    description: 'Solo lectura. Puede ver registros pero no crear, editar ni eliminar.',
  },
]

const CAPABILITIES: Capability[] = [
  'Ver registros',
  'Crear registros',
  'Editar registros',
  'Eliminar / archivar',
  'Configurar portal',
  'Gestionar usuarios',
  'Ver finanzas',
  'Emitir facturas',
  'Acceso al portal de clientes',
]

const ROLE_MATRIX: Record<Role, Set<Capability>> = {
  owner: new Set([
    'Ver registros',
    'Crear registros',
    'Editar registros',
    'Eliminar / archivar',
    'Configurar portal',
    'Gestionar usuarios',
    'Ver finanzas',
    'Emitir facturas',
    'Acceso al portal de clientes',
  ]),
  member: new Set([
    'Ver registros',
    'Crear registros',
    'Editar registros',
    'Eliminar / archivar',
    'Ver finanzas',
    'Emitir facturas',
    'Acceso al portal de clientes',
  ]),
  viewer: new Set(['Ver registros']),
}

export function RolesSection() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Los roles se asignan al crear o editar un usuario en la sección Usuarios. Esta tabla muestra qué puede hacer cada rol.
        </p>
      </div>

      {/* Role cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {ROLES.map((r) => (
          <Card key={r.id} className="border-border/60">
            <CardContent className="p-4">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-accent-foreground">
                  {r.label}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{r.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Permissions matrix */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Capacidad</TableHead>
                {ROLES.map((r) => (
                  <TableHead key={r.id} className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">
                    {r.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {CAPABILITIES.map((cap, i) => (
                <TableRow key={cap} className={cn(i % 2 === 0 ? '' : 'bg-muted/20')}>
                  <TableCell className="px-4 py-3 font-medium text-foreground">{cap}</TableCell>
                  {ROLES.map((r) => (
                    <TableCell key={r.id} className="px-4 py-3 text-center">
                      {ROLE_MATRIX[r.id].has(cap) ? (
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-[rgba(34,255,153,0.118)] dark:text-[rgba(70,254,165,0.83)] dark:ring-[rgba(34,255,153,0.22)]">
                          <Check className="h-3 w-3 stroke-[2.5]" />
                        </span>
                      ) : (
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground/50 ring-1 ring-inset ring-black/5">
                          <X className="h-3 w-3 stroke-[2]" />
                        </span>
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
