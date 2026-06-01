'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { apiPost, ApiError } from '@/lib/api'
import { useClientAuthStore } from '@/lib/store/auth'
import type { Client } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const LoginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Ingresá tu contraseña'),
})

const AcceptInviteSchema = z
  .object({
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
    confirm: z.string().min(1, 'Confirmá tu contraseña'),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'Las contraseñas no coinciden',
    path: ['confirm'],
  })

type LoginForm = z.infer<typeof LoginSchema>
type AcceptInviteForm = z.infer<typeof AcceptInviteSchema>

// ─── Login Form ───────────────────────────────────────────────────────────────

function LoginForm() {
  const router = useRouter()
  const setAuth = useClientAuthStore((s) => s.setAuth)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(LoginSchema) })

  async function onSubmit(values: LoginForm) {
    setServerError(null)
    try {
      const res = await apiPost<{ accessToken: string; client: Client }>('/api/client-auth/login', values, {
        skipAuth: true,
      })
      setAuth(res.accessToken, res.client)
      router.replace('/')
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión')
    }
  }

  return (
    <div className="w-full max-w-sm">
      <p className="eyebrow">Portal de clientes</p>
      <h2 className="mt-2 font-display text-3xl font-bold tracking-tight">Iniciá sesión</h2>
      <p className="mt-1 text-sm text-muted-foreground">Accedé al seguimiento de tu proyecto.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="vos@empresa.com"
            {...register('email')}
          />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Contraseña</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            {...register('password')}
          />
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
  )
}

// ─── Accept Invite Form ───────────────────────────────────────────────────────

function AcceptInviteForm({ inviteToken }: { inviteToken: string }) {
  const router = useRouter()
  const setAuth = useClientAuthStore((s) => s.setAuth)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AcceptInviteForm>({ resolver: zodResolver(AcceptInviteSchema) })

  async function onSubmit(values: AcceptInviteForm) {
    setServerError(null)
    try {
      const res = await apiPost<{ accessToken: string; client: Client }>(
        '/api/client-auth/accept-invite',
        { token: inviteToken, password: values.password },
        { skipAuth: true },
      )
      setAuth(res.accessToken, res.client)
      router.replace('/')
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'No se pudo activar la cuenta')
    }
  }

  return (
    <div className="w-full max-w-sm">
      <p className="eyebrow">Activación de cuenta</p>
      <h2 className="mt-2 font-display text-3xl font-bold tracking-tight">Creá tu contraseña</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Ya casi terminás. Elegí una contraseña segura para acceder a tu portal.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="password">Nueva contraseña</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            {...register('password')}
          />
          {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirmá tu contraseña</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            {...register('confirm')}
          />
          {errors.confirm && <p className="text-xs text-destructive">{errors.confirm.message}</p>}
        </div>
        {serverError && (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {serverError}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Activando cuenta…' : 'Activar cuenta'}
        </Button>
      </form>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function PortalForm() {
  const searchParams = useSearchParams()
  const inviteToken = searchParams.get('token')
  return inviteToken ? <AcceptInviteForm inviteToken={inviteToken} /> : <LoginForm />
}

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Panel de marca — visible solo en desktop */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-foreground p-12 text-background lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: 'radial-gradient(hsl(var(--background)) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-signal/90 blur-[2px]" />

        <div className="relative flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-signal font-display text-lg font-bold text-signal-foreground">
            D
          </span>
          <span className="eyebrow text-background/70">DevDúo · Portal de clientes</span>
        </div>

        <div className="relative">
          <h1 className="font-display text-6xl font-bold leading-[0.95] tracking-tight">
            Tu proyecto,
            <br />
            siempre
            <br />
            a la vista.
          </h1>
          <p className="mt-6 max-w-sm text-background/60">
            Seguí el avance en tiempo real, revisá entregables y aprobá cambios directamente desde acá.
          </p>
        </div>

        <p className="relative font-mono text-xs text-background/40">portal.devduo.com</p>
      </div>

      {/* Formulario */}
      <div className="flex items-center justify-center p-6">
        <Suspense fallback={<LoginForm />}>
          <PortalForm />
        </Suspense>
      </div>
    </div>
  )
}
