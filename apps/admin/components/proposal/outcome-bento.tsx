import { ProjectMockup } from './project-mockup'

type Block = {
  title: string
  body: string
}

/** Filled dots pinned inside the four corners of a bento cell. */
function CellDots() {
  return (
    <>
      <span className="bento-dot bento-dot-1" aria-hidden="true" />
      <span className="bento-dot bento-dot-2" aria-hidden="true" />
      <span className="bento-dot bento-dot-3" aria-hidden="true" />
      <span className="bento-dot bento-dot-4" aria-hidden="true" />
    </>
  )
}

/**
 * The three outcome blocks as an asymmetric bento: a narrow signal cell paired
 * with the lead block on top, then the two remaining blocks below.
 *
 * The blocks carry the meaning, so the visual cells sit beside them rather than
 * on top of them — nothing here competes with the copy for the reader.
 */
export function OutcomeBento({ blocks }: { blocks: Block[] }) {
  const [lead, second, third] = blocks

  return (
    <div className="bento">
      <div className="bento-row">
        {/* Concentric rings: the one purely atmospheric cell, standing in for
            the single front door the copy beside it describes. */}
        <div className="bento-cell bento-cell-signal">
          <CellDots />
          <div className="bento-rings" aria-hidden="true">
            <span className="bento-ring" />
            <span className="bento-ring bento-ring-2" />
            <span className="bento-ring bento-ring-3" />
            <span className="bento-ring bento-ring-4" />
            <span className="bento-ring-core">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/logo-synous.svg" alt="" />
            </span>
          </div>
        </div>

        {lead && (
          <article className="bento-cell bento-cell-lead">
            <CellDots />
            <div className="bento-stage" aria-hidden="true">
              <ProjectMockup kind="platform" />
            </div>
            <div className="bento-copy">
              <h3>{lead.title}</h3>
              <p>{lead.body}</p>
            </div>
          </article>
        )}
      </div>

      <div className="bento-row">
        {second && (
          <article className="bento-cell bento-cell-wide">
            <CellDots />
            <div className="bento-copy">
              <h3>{second.title}</h3>
              <p>{second.body}</p>
            </div>
            <div className="bento-stage bento-stage-inline" aria-hidden="true">
              <ProjectMockup kind="institutional" />
            </div>
          </article>
        )}

        {third && (
          <article className="bento-cell bento-cell-narrow">
            <CellDots />
            <div className="bento-panel" aria-hidden="true">
              <span className="bento-panel-row" />
              <span className="bento-panel-row" />
              <span className="bento-panel-row bento-panel-row-lit" />
              <span className="bento-panel-row" />
            </div>
            <div className="bento-copy">
              <h3>{third.title}</h3>
              <p>{third.body}</p>
            </div>
          </article>
        )}
      </div>
    </div>
  )
}
