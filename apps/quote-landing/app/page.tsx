import ColorBends from '@/components/color-bends/color-bends'
import { AnnouncementBars } from '@/components/announcement-bars'
import { LetterScene } from '@/components/letter-scene'

/** Destination for the envelope. Point this at the proposal landing once it exists. */
const PROPOSAL_URL = '/propuesta'

/** Backdrop palette, drawn from the FrontPackPro navy and accent blues. */
const BEND_COLORS = ['#010511', '#0b1430', '#1c73ca', '#96c0ff']

/**
 * Per-client copy. This page is a template: swapping these three values is all
 * it takes to address the proposal to someone else.
 */
const LETTER = {
  dateLabel: 'MARZO 2026',
  recipient: 'Nombre del negocio',
  statement: 'Convertimos metodologías en productos y operaciones en sistemas.',
}

/** The client's name rides the bars alongside the standing line. */
const ANNOUNCEMENTS = ['Tu propuesta está lista', LETTER.recipient]

export default function HomePage() {
  return (
    <main className="stage">
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
