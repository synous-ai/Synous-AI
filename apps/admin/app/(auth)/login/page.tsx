'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { apiPost, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store/auth'
import type { User } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const LoginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Ingresá tu contraseña'),
})
type LoginForm = z.infer<typeof LoginSchema>

export default function LoginPage() {
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(LoginSchema) })

  async function onSubmit(values: LoginForm) {
    setServerError(null)
    try {
      const res = await apiPost<{ accessToken: string; user: User }>('/api/auth/login', values, { skipAuth: true })
      setAuth(res.accessToken, res.user)
      router.replace('/pipeline')
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión')
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Panel de marca */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-foreground p-12 text-background lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: 'radial-gradient(hsl(var(--background)) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-background/10 blur-[80px]" />

        <div className="relative flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md border border-background/20 font-display text-lg font-medium text-background">
            D
          </span>
          <span className="eyebrow text-background/70">DevDúo · CRM interno</span>
        </div>

        <div className="relative">
          <h1 className="font-display text-6xl font-medium leading-[0.95] tracking-tight">
            El negocio,
            <br />
            de punta
            <br />
            a punta.
          </h1>
          <p className="mt-6 max-w-sm text-background/60">
            Pipeline, contactos, empresas y deals — todo en una sola herramienta hecha a medida.
          </p>
        </div>

        <p className="relative font-mono text-xs text-background/40">app.devduo.com</p>
      </div>

      {/* Formulario */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <p className="eyebrow">Acceso</p>
          <h2 className="mt-2 font-display text-3xl font-medium tracking-tight">Iniciá sesión</h2>
          <p className="mt-1 text-sm text-muted-foreground">Entrá con tu cuenta del equipo.</p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" placeholder="carlos@devduo.com" {...register('email')} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input id="password" type="password" autoComplete="current-password" placeholder="••••••••" {...register('password')} />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>
            {serverError && (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {serverError}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Ingresando…' : 'Ingresar'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
