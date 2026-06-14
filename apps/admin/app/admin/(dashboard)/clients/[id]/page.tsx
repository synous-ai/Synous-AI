'use client'

import { useParams } from 'next/navigation'
import { ContactDetailView } from '@/components/contact-detail/contact-detail-view'

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  return <ContactDetailView scope="clients" id={id} />
}
