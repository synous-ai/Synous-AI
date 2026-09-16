import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import ColorBends from '@/components/proposal/color-bends/color-bends'
import { AnnouncementBars } from '@/components/proposal/announcement-bars'
import { LetterScene } from '@/components/proposal/letter-scene'
import { proposal as template } from '@/app/portal/propuesta/proposal-content'
import { fetchPublicProposal, proposalMetadata } from './proposal-metadata'

/** Backdrop palette, drawn from the brand navy and accent blues. */
const BEND_COLORS = ['#010511', '#0b1430', '#1c73ca', '#96c0ff']

export const dynamic = 'force-dynamic'

/** Es el link que se comparte: su título y vista previa llevan el nombre del cliente. */
export function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  return proposalMetadata(params.token)
}

/**
 * First stop of the public link: the envelope. It carries the client's own name
 * and opens onto the proposal at `/p/<token>/propuesta`, so a single URL covers
 * both screens.
 *
 * The backend answers 404 both for an unknown token and for a proposal still in
 * draft, so a link shared early reveals nothing. The texts come from the
 * template, never from the stored `content`.
 */
export default async function PublicProposalEnvelope({ params }: { params: { token: string } }) {
  const data = await fetchPublicProposal(params.token)
  if (!data) notFound()

  const { recipient, dateLabel, statement } = template.envelope

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
          statement={statement}
        />
      </div>
    </main>
  )
}
