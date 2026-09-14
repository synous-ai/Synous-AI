'use client'

import { useId, useState } from 'react'

type FaqEntry = {
  question: string
  answer: string
}

/** Accessible accordion whose mounted answers can animate in both directions. */
export function FaqList({ entries }: { entries: FaqEntry[] }) {
  const baseId = useId()
  const [openItems, setOpenItems] = useState<number[]>([])

  function toggleItem(index: number) {
    setOpenItems((current) =>
      current.includes(index) ? current.filter((item) => item !== index) : [...current, index],
    )
  }

  return (
    <div className="faq-list">
      {entries.map((entry, index) => {
        const isOpen = openItems.includes(index)
        const triggerId = `${baseId}-trigger-${index}`
        const answerId = `${baseId}-answer-${index}`

        return (
          <article className={`faq-item${isOpen ? ' is-open' : ''}`} key={entry.question}>
            <button
              className="faq-trigger"
              type="button"
              id={triggerId}
              aria-expanded={isOpen}
              aria-controls={answerId}
              onClick={() => toggleItem(index)}
            >
              <span>{entry.question}</span>
              <span className="faq-marker" aria-hidden="true" />
            </button>
            <div
              className="faq-answer"
              id={answerId}
              role="region"
              aria-labelledby={triggerId}
              aria-hidden={!isOpen}
            >
              <div className="faq-answer-inner">
                <p>{entry.answer}</p>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}
