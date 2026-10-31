'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { AppDemo, GuideConversation } from './product-vision-types'

/** Pausa de la guía "escribiendo" antes de mostrar la respuesta simulada. */
const TYPING_MS = 1100

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// ── Marco ────────────────────────────────────────────────────────────────────

/**
 * El celular: bisel, isla y barra de estado. El contenido llega como hijo y
 * ocupa la pantalla entera; la barra de pestañas, si hay, la pone quien lo usa.
 */
export function PhoneFrame({
  children,
  label,
  className,
}: {
  children: ReactNode
  /** Nombre accesible del mockup. Sin él se oculta a lectores de pantalla. */
  label?: string
  className?: string
}) {
  return (
    <div
      className={`pv-phone${className ? ` ${className}` : ''}`}
      role={label ? 'group' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <div className="pv-phone-screen">
        <div className="pv-phone-status" aria-hidden="true">
          <span>9:41</span>
          <span className="pv-phone-island" />
          <span className="pv-phone-signal">
            <i />
            <i />
            <i />
          </span>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Iniciales de la app para el isotipo provisional: "Katherine Lindo" → "KL". */
function appInitials(app: AppDemo): string {
  return app.appName
    .split(' ')
    .map((word) => word[0])
    .join('')
}

function AppHeader({ app, title }: { app: AppDemo; title?: string }) {
  return (
    <div className="pv-app-header">
      <span className="pv-app-mark" aria-hidden="true">
        {appInitials(app)}
      </span>
      <span className="pv-app-name">{title ?? app.appName}</span>
    </div>
  )
}

// ── Inicio ───────────────────────────────────────────────────────────────────

const TOPIC_GLYPH: Record<string, ReactNode> = {
  training: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      {/* Dos ruedas y el cuadro: la bici, sin más. */}
      <circle cx="6" cy="16" r="3.5" />
      <circle cx="18" cy="16" r="3.5" />
      <path d="M6 16 10 9h5l3 7M10 9l3 7h-7M14 6h2" />
    </svg>
  ),
  nutrition: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M12 21c-4.5 0-7-3.5-7-7.5S8 6 12 8c4-2 7 1.5 7 5.5S16.5 21 12 21Z" />
      <path d="M12 8c0-2 1-3.5 3-4" />
    </svg>
  ),
  mindset: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2v3M12 19v3" />
    </svg>
  ),
}

export function HomeScreen({
  app,
  onTalk,
  onConversation,
  onClasses,
}: {
  app: AppDemo
  onTalk?: () => void
  onConversation?: (conversationId: string) => void
  onClasses?: () => void
}) {
  const interactive = Boolean(onTalk)
  const { home } = app

  return (
    <div className="pv-app pv-app-home">
      <AppHeader app={app} />
      <div className="pv-app-scroll" data-lenis-prevent>
        <p className="pv-home-greeting">{home.greeting}</p>
        <h3 className="pv-home-title">{home.title}</h3>
        <p className="pv-home-body">{home.body}</p>

        <button
          type="button"
          className="pv-home-primary"
          onClick={onTalk}
          tabIndex={interactive ? 0 : -1}
        >
          <span>{home.primaryAction}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>

        <button type="button" className="pv-home-continue" onClick={onClasses} tabIndex={interactive ? 0 : -1}>
          <span className="pv-home-continue-play" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5.5v13l10.5-6.5z" />
            </svg>
          </span>
          <span className="pv-home-continue-copy">
            <span className="pv-mod-kicker">{home.continueClass.kicker}</span>
            <span className="pv-home-continue-title">{home.continueClass.title}</span>
            <span className="pv-home-continue-meta">{home.continueClass.meta}</span>
          </span>
        </button>

        <div className="pv-home-shortcuts">
          {home.shortcuts.map((shortcut) => (
            <button
              key={shortcut.topic}
              type="button"
              className={`pv-home-shortcut is-${shortcut.topic}`}
              onClick={() => onConversation?.(shortcut.conversationId)}
              tabIndex={interactive ? 0 : -1}
            >
              <span className="pv-home-shortcut-glyph" aria-hidden="true">
                {TOPIC_GLYPH[shortcut.topic]}
              </span>
              <span className="pv-home-shortcut-name">{shortcut.label}</span>
              <svg className="pv-home-shortcut-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </button>
          ))}
        </div>

        <div className="pv-checkin">
          <p className="pv-checkin-question">{home.checkin.question}</p>
          <div className="pv-checkin-options">
            {home.checkin.options.map((option) => (
              <button
                key={option.conversationId}
                type="button"
                onClick={() => onConversation?.(option.conversationId)}
                tabIndex={interactive ? 0 : -1}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Clases ───────────────────────────────────────────────────────────────────

/**
 * Las clases del programa por módulo. Tocar una clase la marca como vista (o
 * la desmarca) y el avance del módulo se actualiza: muestra que cada alumno
 * lleva su propio progreso. Un módulo abierto a la vez.
 */
export function ClassesScreen({ app }: { app: AppDemo }) {
  const { classes } = app
  const [open, setOpen] = useState(0)
  const [done, setDone] = useState<Set<string>>(
    () =>
      new Set(
        classes.modules.flatMap((module, m) =>
          module.lessons.flatMap((lesson, l) => (lesson.done ? [`${m}-${l}`] : [])),
        ),
      ),
  )

  function toggle(key: string) {
    setDone((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="pv-app pv-app-classes">
      <AppHeader app={app} title={classes.title} />
      <div className="pv-app-scroll" data-lenis-prevent>
        <p className="pv-mod-kicker">{classes.programLabel}</p>
        <ul className="pv-modules">
          {classes.modules.map((module, m) => {
            const total = module.lessons.length
            const completed = module.lessons.filter((_, l) => done.has(`${m}-${l}`)).length
            const isOpen = open === m
            return (
              <li key={module.title} className={`pv-module${isOpen ? ' is-open' : ''}`}>
                <button
                  type="button"
                  className="pv-module-head"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? -1 : m)}
                >
                  <span className="pv-module-title">{module.title}</span>
                  <span className="pv-module-count">
                    {completed}/{total}
                  </span>
                  <span className="pv-module-bar" aria-hidden="true">
                    <i style={{ width: `${(completed / total) * 100}%` }} />
                  </span>
                </button>
                {isOpen && (
                  <ol className="pv-lessons">
                    {module.lessons.map((lesson, l) => {
                      const key = `${m}-${l}`
                      const seen = done.has(key)
                      return (
                        <li key={lesson.title}>
                          <button
                            type="button"
                            className={seen ? 'is-done' : ''}
                            aria-pressed={seen}
                            onClick={() => toggle(key)}
                          >
                            <span className="pv-lesson-check" aria-hidden="true">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                                <path d="m6 12.5 4 4 8-9" />
                              </svg>
                            </span>
                            <span className="pv-lesson-title">{lesson.title}</span>
                            <em>{lesson.duration}</em>
                          </button>
                        </li>
                      )
                    })}
                  </ol>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

// ── Guía ─────────────────────────────────────────────────────────────────────

type ThreadEntry = { id: string; ready: boolean }

/**
 * La guía de IA, con respuestas PREDEFINIDAS. Cada pregunta elegida entra al
 * hilo, muestra a la guía "escribiendo" y después la respuesta de ejemplo,
 * marcada como tal.
 *
 * `seed` es la conversación con la que se abre (desde un atajo del inicio):
 * cambia cada vez que se toca un atajo, y el hilo la suma si todavía no está.
 */
export function GuideScreen({ app, seed }: { app: AppDemo; seed: { id: string; at: number } | null }) {
  const { guide } = app
  const byId = new Map<string, GuideConversation>(guide.conversations.map((c) => [c.id, c]))
  const [thread, setThread] = useState<ThreadEntry[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  function ask(id: string) {
    setThread((current) => {
      if (current.some((entry) => entry.id === id)) return current
      return [...current, { id, ready: prefersReducedMotion() }]
    })
    if (prefersReducedMotion()) return
    timers.current.push(
      setTimeout(() => {
        setThread((current) => current.map((entry) => (entry.id === id ? { ...entry, ready: true } : entry)))
      }, TYPING_MS),
    )
  }

  // El atajo del inicio abre la guía con su pregunta ya hecha.
  useEffect(() => {
    if (seed) ask(seed.id)
    // `ask` solo cierra sobre setters estables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed?.at])

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    node.scrollTo({ top: node.scrollHeight, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [thread])

  const remaining = guide.suggested.filter((id) => !thread.some((entry) => entry.id === id))

  return (
    <div className="pv-app pv-app-guide">
      <AppHeader app={app} title={guide.title} />
      <div className="pv-chat" ref={scrollRef} data-lenis-prevent aria-live="polite">
        <div className="pv-bubble is-guide">{guide.opening}</div>

        {thread.map((entry) => {
          const conversation = byId.get(entry.id)
          if (!conversation) return null
          return (
            <div key={entry.id} className="pv-chat-turn">
              <div className="pv-bubble is-student">{conversation.question}</div>
              {entry.ready ? (
                <div className="pv-bubble is-guide is-answer">
                  {conversation.answer.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                  <span className="pv-bubble-note">{guide.sampleNote}</span>
                </div>
              ) : (
                <div className="pv-bubble is-guide is-typing" aria-label="La guía está escribiendo">
                  <i />
                  <i />
                  <i />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="pv-chat-suggestions">
        {remaining.length > 0 ? (
          remaining.map((id) => {
            const conversation = byId.get(id)
            if (!conversation) return null
            return (
              <button key={id} type="button" onClick={() => ask(id)}>
                <span>{conversation.label}</span>
                {conversation.question}
              </button>
            )
          })
        ) : (
          <p className="pv-chat-end">{guide.sampleNote}</p>
        )}
      </div>
    </div>
  )
}

// ── Perfil ───────────────────────────────────────────────────────────────────

/** El perfil del alumno: datos básicos, su objetivo y el historial de la guía. */
export function ProfileScreen({ app, onConversation }: { app: AppDemo; onConversation?: () => void }) {
  const { profile } = app
  return (
    <div className="pv-app pv-app-profile">
      <AppHeader app={app} title={profile.title} />
      <div className="pv-app-scroll" data-lenis-prevent>
        <div className="pv-profile-card">
          <span className="pv-profile-avatar" aria-hidden="true">
            {app.studentName[0]}
          </span>
          <div>
            <p className="pv-profile-name">{profile.details[0]?.value ?? app.studentName}</p>
            <p className="pv-profile-meta">{profile.details[2]?.value}</p>
          </div>
        </div>

        <div className="pv-profile-goal">
          <p className="pv-mod-kicker">{profile.goalLabel}</p>
          <p>{profile.goal}</p>
        </div>

        <dl className="pv-profile-details">
          {profile.details.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>

        <p className="pv-mod-kicker">{profile.historyLabel}</p>
        <ul className="pv-profile-history">
          {profile.history.map((item) => (
            <li key={item.title}>
              <button type="button" onClick={onConversation} tabIndex={onConversation ? 0 : -1}>
                <span>{item.title}</span>
                <em>{item.when}</em>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
