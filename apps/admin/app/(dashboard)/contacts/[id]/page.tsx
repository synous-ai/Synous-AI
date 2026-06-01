'use client'

import { useParams } from 'next/navigation'
import { ContactDetailView } from '@/components/contact-detail/contact-detail-view'

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>()
  return <ContactDetailView scope="contacts" id={id} />
}
