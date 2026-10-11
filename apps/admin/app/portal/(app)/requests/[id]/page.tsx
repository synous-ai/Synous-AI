'use client'

import { useParams } from 'next/navigation'
import { RequestDetailPanel } from '@portal/components/portal/requests/detail/request-detail-panel'

export default function RequestDetailPage() {
  const params = useParams<{ id: string }>()
  return <RequestDetailPanel id={params.id} />
}
