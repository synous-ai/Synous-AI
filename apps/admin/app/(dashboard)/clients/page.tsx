'use client'

import { useClients } from '@/lib/hooks'
import { PeopleSection } from '@/components/people/people-section'

export default function ClientsPage() {
  const { data, isLoading } = useClients()
  return (
    <PeopleSection
      scope="clients"
      eyebrow="Cuentas activas"
      title="Clientes"
      newLabel="Nuevo Cliente"
      defaultLifecycle="customer"
      items={data ?? []}
      isLoading={isLoading}
    />
  )
}
