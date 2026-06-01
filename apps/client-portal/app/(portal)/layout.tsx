'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useClientAuthStore } from '@/lib/store/auth'
import { apiPost } from '@/lib/api'
import { LogOut, Sun, Moon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BrandMark } from '@/components/ui/brand-mark'

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const client = useClientAuthStore((s) => s.client)
  const bootstrapping = useClientAuthStore((s) => s.bootstrapping)
  const clear = useClientAuthStore((s) => s.clear)
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!bootstrapping && !client) router.replace('/login')
  }, [bootstrapping, client, router])

  async function handleLogout() {
    try {
      await apiPost('/api/client-auth/logout')
    } catch {
      // ignorar errores de logout
    } finally {
      clear()
      router.replace('/login')
    }
  }

  if (bootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Cargando…
      </div>
    )
  }

  if (!client) return null

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandMark letter="D" />
            <span className="font-display text-sm font-semibold">DevDúo · Portal</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:block">{client.email}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={mounted && theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              className="h-8 w-8"
            >
              {mounted ? (
                theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-1.5">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  )
}
