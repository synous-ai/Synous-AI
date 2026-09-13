import { notFound } from 'next/navigation'
import { API_URL } from '@/lib/config'
import ColorBends from '@/components/proposal/color-bends/color-bends'
import { AnnouncementBars } from '@/components/proposal/announcement-bars'
import { LetterScene } from '@/components/proposal/letter-scene'
import type { PublicProposal } from '@/lib/types/proposals'

/** Backdrop palette, drawn from the brand navy and accent blues. */
const BEND_COLORS = ['#010511', '#0b1430', '#1c73ca', '#96c0ff']

/** Shown while the proposal has no statement of its own. */
const FALLBACK_STATEMENT = 'Convertimos metodologías en productos y operaciones en sistemas.'

export const dynamic = 'force-dynamic'

async function fetchProposal(token: string): Promise<PublicProposal | null> {
  try {
    const res = await fetch(`${API_URL}/api/public/proposals/${encodeURIComponent(token)}`, {
      cache: 'no-store',
    })
    if (!res.ok) return null
    const json = (await res.json()) as { data?: PublicProposal }
    return json.data ?? null
  } catch {
    return null
  }
}

/**
 * First stop of the public link: the envelope. It carries the client's own name
 * and opens onto the proposal at `/p/<token>/propuesta`, so a single URL covers
 * both screens.
 *
 * The backend answers 404 both for an unknown token and for a proposal still in
 * draft, so a link shared early reveals nothing.
 */
export default async function PublicProposalEnvelope({ params }: { params: { token: string } }) {
  const data = await fetchProposal(params.token)
  if (!data) notFound()

  const recipient = data.content.clientName
  const dateLabel = data.content.dateLabel

  return (
    <main className="brand-surface proposal-stage stage">
      <div className="stage-backdrop" aria-hidden="true">
        <ColorBends
          colors={BEND_COLORS}
          rotation={110}
          speed={0.14}
          scale={1.25}
          frequency={0.85}
          warpStrength={1.1}
          mouseInfluence={0.7}
          parallax={0.35}
          noise={0}
          iterations={2}
          intensity={1.05}
          bandWidth={7}
          transparent={false}
        />
      </div>

      <AnnouncementBars items={['Tu propuesta está lista', recipient]} />

      <div className="stage-content">
        <LetterScene
          href={`/p/${params.token}/propuesta`}
          dateLabel={dateLabel}
          recipient={recipient}
          statement={data.content.heroLede || FALLBACK_STATEMENT}
        />
      </div>
    </main>
  )
}
