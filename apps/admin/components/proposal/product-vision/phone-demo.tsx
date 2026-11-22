'use client'

import { useState } from 'react'
import { ClassesScreen, GuideScreen, HomeScreen, PhoneFrame, ProfileScreen } from './phone-screens'
import type { AppDemo } from './product-vision-types'

type Tab = 'home' | 'classes' | 'guide' | 'profile'

const TABS: { id: Tab; label: string }[] = [
  { id: 'home', label: 'Inicio' },
  { id: 'classes', label: 'Clases' },
  { id: 'guide', label: 'Guía de IA' },
  { id: 'profile', label: 'Perfil' },
]

/**
 * La demo navegable de la V1 en un celular: inicio, clases, guía y perfil.
 *
 * Las pantallas quedan montadas y se alternan con `hidden`, así la
 * conversación de la guía y el avance de las clases no se pierden al ir y
 * volver de otra pestaña. Los controles de afuera del celular y la barra de
 * abajo manejan el mismo estado.
 */
export function PhoneDemo({ app }: { app: AppDemo }) {
  const [tab, setTab] = useState<Tab>('home')
  const [seed, setSeed] = useState<{ id: string; at: number } | null>(null)

  function openConversation(id: string) {
    setSeed({ id, at: Date.now() })
    setTab('guide')
  }

  return (
    <div className="pv-demo">
      <div className="pv-demo-switch" role="group" aria-label="Pantallas de la demo">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={tab === item.id}
            className={tab === item.id ? 'is-active' : ''}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <PhoneFrame label="Demo conceptual de tu V1" className="pv-demo-phone">
        <div className="pv-app-viewport">
          <div hidden={tab !== 'home'} className="pv-app-pane">
            <HomeScreen
              app={app}
              onTalk={() => setTab('guide')}
              onConversation={openConversation}
              onClasses={() => setTab('classes')}
            />
          </div>
          <div hidden={tab !== 'classes'} className="pv-app-pane">
            <ClassesScreen app={app} />
          </div>
          <div hidden={tab !== 'guide'} className="pv-app-pane">
            <GuideScreen app={app} seed={seed} />
          </div>
          <div hidden={tab !== 'profile'} className="pv-app-pane">
            <ProfileScreen app={app} onConversation={() => setTab('guide')} />
          </div>
        </div>

        <nav className="pv-app-tabs" aria-label="Navegación de la app">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? 'is-active' : ''}
              aria-current={tab === item.id ? 'page' : undefined}
              onClick={() => setTab(item.id)}
            >
              <span aria-hidden="true" className={`pv-tab-glyph is-${item.id}`} />
              {item.label}
            </button>
          ))}
        </nav>
      </PhoneFrame>
    </div>
  )
}
