'use client'

import { useState } from 'react'
import { useContacts, useContactSearch } from '@/lib/hooks'
import { PeopleSection } from '@/components/people/people-section'
import { FilterBuilder, type FilterField } from '@/components/filters/filter-builder'

const CONTACT_FILTER_FIELDS: FilterField[] = [
  { field: 'firstName', label: 'Nombre', kind: 'text' },
  { field: 'lastName', label: 'Apellido', kind: 'text' },
  { field: 'email', label: 'Email', kind: 'text' },
  { field: 'phone', label: 'Teléfono', kind: 'text' },
  { field: 'jobTitle', label: 'Cargo', kind: 'text' },
  {
    field: 'lifecycleStage',
    label: 'Etapa',
    kind: 'enum',
    options: [
      { value: 'lead', label: 'Nuevo Lead' },
      { value: 'mql', label: 'Contactado' },
      { value: 'sql', label: 'Calificado' },
      { value: 'opportunity', label: 'Oportunidad' },
      { value: 'customer', label: 'Cliente' },
      { value: 'other', label: 'Otro' },
    ],
  },
]

export default function ContactsPage() {
  const [filter, setFilter] = useState<unknown | null>(null)
  const all = useContacts()
  const search = useContactSearch(filter)

  const items = filter ? (search.data ?? []) : (all.data ?? [])
  const isLoading = filter ? search.isLoading : all.isLoading

  return (
    <PeopleSection
      scope="contacts"
      eyebrow="Todas las personas"
      title="Contactos"
      newLabel="Nuevo Contacto"
      defaultLifecycle="lead"
      items={items}
      isLoading={isLoading}
      toolbar={<FilterBuilder fields={CONTACT_FILTER_FIELDS} onApply={setFilter} />}
    />
  )
}
