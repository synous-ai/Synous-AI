'use client'

import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ROLE_ORDER, ROLE_LABEL, ROLE_DESCRIPTION, ROLE_MATRIX, CAPABILITIES } from '@/lib/roles'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

/**
 * Matriz de capacidades por rol.
 *
 * Las etiquetas y los permisos viven en `lib/roles.ts` (fuente única, compartida
 * con el alta/edición de usuarios en Configuración → General) para que las dos
 * pantallas no puedan decir cosas distintas sobre el mismo rol.
 */
export function RolesSection() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Los roles se asignan al crear o editar un usuario en Configuración → General → Usuarios.
          Esta tabla muestra qué puede hacer cada rol.
        </p>
      </div>

      {/* Role cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ROLE_ORDER.map((r) => (
          <Card key={r} className="border-border/60">
            <CardContent className="p-4">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-accent-foreground">
                  {ROLE_LABEL[r]}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{ROLE_DESCRIPTION[r]}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Permissions matrix */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Capacidad</TableHead>
                  {ROLE_ORDER.map((r) => (
                    <TableHead key={r} className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">
                      {ROLE_LABEL[r]}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {CAPABILITIES.map((cap, i) => (
                  <TableRow key={cap} className={cn(i % 2 === 0 ? '' : 'bg-muted/20')}>
                    <TableCell className="px-4 py-3 font-medium text-foreground">{cap}</TableCell>
                    {ROLE_ORDER.map((r) => (
                      <TableCell key={r} className="px-4 py-3 text-center">
                        {ROLE_MATRIX[r].has(cap) ? (
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
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
