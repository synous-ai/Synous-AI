import ColorBends from '@/components/proposal/color-bends/color-bends'
import { AnnouncementBars } from '@/components/proposal/announcement-bars'
import { LetterScene } from '@/components/proposal/letter-scene'

/** Destination for the envelope. Point this at the full proposal once it exists. */
const PROPOSAL_URL = '#'

/** Backdrop palette, drawn from the FrontPackPro navy and accent blues. */
const BEND_COLORS = ['#010511', '#0b1430', '#1c73ca', '#96c0ff']

/**
 * Placeholder copy. Once the proposal table exists this comes from the tenant
 * resolved by the middleware, so each client sees their own letter.
 */
const LETTER = {
  dateLabel: 'MARZO 2026',
  recipient: 'Nombre del negocio',
  statement: 'Convertimos metodologías en productos y operaciones en sistemas.',
}

const ANNOUNCEMENTS = ['Tu propuesta está lista', LETTER.recipient]

export default function ProposalPage() {
  return (
    <main className="proposal-stage stage">
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

      <AnnouncementBars items={ANNOUNCEMENTS} />

      <div className="stage-content">
        <LetterScene
          href={PROPOSAL_URL}
          dateLabel={LETTER.dateLabel}
          recipient={LETTER.recipient}
          statement={LETTER.statement}
        />
      </div>
    </main>
  )
}
