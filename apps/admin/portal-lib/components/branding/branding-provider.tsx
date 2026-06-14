'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '@clerk/nextjs'
import { API_URL } from '@portal/lib/config'
import { apiGet } from '@portal/lib/api'

export interface Branding {
  brandName: string | null
  logoUrl: string | null
  primaryColor: string | null
  secondaryColor: string | null
}

interface BrandCtx {
  brand: Branding | null
  /** Re-aplica el branding en vivo (lo usa el form "Mi Marca" al guardar). */
  apply: (b: Branding) => void
}

const Ctx = createContext<BrandCtx>({ brand: null, apply: () => {} })

export function useBranding(): BrandCtx {
  return useContext(Ctx)
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex)
  if (!m || !m[1]) return null
  const int = parseInt(m[1], 16)
  const r = ((int >> 16) & 255) / 255
  const g = ((int >> 8) & 255) / 255
  const b = (int & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

function readSlugCookie(): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(/(?:^|;\s*)dd_tenant=([^;]+)/)
  return m && m[1] ? decodeURIComponent(m[1]) : null
}

function applyVars(brand: Branding) {
  const root = document.documentElement
  const setColor = (varName: string, fgVar: string, hex: string | null) => {
    if (!hex) return
    const hsl = hexToHsl(hex)
    if (!hsl) return
    root.style.setProperty(varName, `${hsl.h} ${hsl.s}% ${hsl.l}%`)
    // Foreground contrastante según luminancia (evita texto ilegible).
    root.style.setProperty(fgVar, hsl.l > 60 ? '156 30% 13%' : '0 0% 100%')
  }
  setColor('--primary', '--primary-foreground', brand.primaryColor)
  setColor('--secondary', '--secondary-foreground', brand.secondaryColor)
}

// ─── provider ─────────────────────────────────────────────────────────────────

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [brand, setBrand] = useState<Branding | null>(null)
  // CA2: Clerk es el proveedor de auth. isLoaded reemplaza al flag `bootstrapping`
  // del Zustand store JWT anterior. isSignedIn reemplaza al check de `client`.
  const { isLoaded, isSignedIn } = useAuth()

  const apply = useCallback((b: Branding) => {
    setBrand(b)
    applyVars(b)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        if (isSignedIn) {
          // Autenticado → cargar su propia marca via API (token Clerk en header).
          const own = await apiGet<Branding & { id: string }>('/api/client/branding')
          if (!cancelled) apply(own)
          return
        }
        // Pre-login → marca por slug (si entró por /c/<slug>).
        const slug = readSlugCookie()
        if (slug) {
          const res = await fetch(`${API_URL}/api/public/branding/${slug}`)
          if (res.ok) {
            const json = (await res.json()) as { data: Branding | null }
            if (!cancelled && json.data) apply(json.data)
          }
        }
      } catch {
        /* sin branding → defaults */
      }
    }
    // Esperamos a que Clerk termine de cargar antes de intentar la carga de branding.
    if (isLoaded) void load()
    return () => {
      cancelled = true
    }
  }, [isSignedIn, isLoaded, apply])

  return <Ctx.Provider value={{ brand, apply }}>{children}</Ctx.Provider>
}
