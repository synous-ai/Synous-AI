'use client'

import { Globe } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useClientAccounts } from '@/lib/hooks'
import { formatDate } from '@/lib/utils'
import { clientAccountStatus } from '@/lib/status'
import { StatusBadge } from '@/components/ui/status-badge'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export function PortalClientesSection() {
  const { data, isLoading } = useClientAccounts()

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Cuentas de acceso al portal del cliente. Se activan automáticamente cuando un deal avanza a una etapa ganada o cuando DocuSeal completa el contrato.
      </p>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            /* Skeleton de tabla de cuentas: imita las filas reales (email, estado, deals, fecha) */
            <div className="divide-y">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="grid grid-cols-4 gap-4 px-4 py-3">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-4 w-8" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          ) : (data ?? []).length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyIllustration icon={Globe} />
                <EmptyTitle>Sin Cuentas de Portal Todavía</EmptyTitle>
                <EmptyDescription>Se crean automáticamente al activar el Client Portal en un deal.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Email</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Estado</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Deals</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Creado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).map((acc) => (
                  <TableRow key={acc.id}>
                    <TableCell className="px-4 py-3 font-medium">{acc.email}</TableCell>
                    <TableCell className="px-4 py-3">
                      {(() => {
                        const { kind, label } = clientAccountStatus(acc.inviteAccepted)
                        return <StatusBadge kind={kind}>{label}</StatusBadge>
                      })()}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground">
                      {acc.dealIds.length === 0 ? '—' : acc.dealIds.length}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground">{formatDate(acc.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
