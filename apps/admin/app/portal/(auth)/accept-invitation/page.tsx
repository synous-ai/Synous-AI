'use client'

/**
 * Página de aceptación de invitación de Clerk — CA2 (Clerk).
 *
 * El primer ingreso de un cliente se hace desde acá: llega desde el email de
 * invitación con un `__clerk_ticket` en la URL, fija su contraseña y queda
 * autenticado en el portal.
 *
 * IMPORTANTE: usa `@clerk/nextjs/legacy`, NO `@clerk/nextjs`. La API "señal"
 * (root export en @clerk/nextjs 7.5.2) no tiene `setActive` ni `isLoaded` en la
 * forma que necesitamos acá — ver design doc §1.1. `useSignUp` legacy expone
 * `signUp.create({ strategy: 'ticket', ... })` + `setActive`.
 */

import { useState, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSignUp } from '@clerk/nextjs/legacy'
import { useAuth } from '@clerk/nextjs'
import { isClerkAPIResponseError } from '@clerk/nextjs/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const MIN_PASSWORD_LENGTH = 8

/** Mapea errores de Clerk a mensajes genéricos — nunca exponer el string crudo. */
function mapClerkError(err: unknown): string {
  if (isClerkAPIResponseError(err)) {
    const code = err.errors?.[0]?.code
    if (
      code === 'form_password_pwned' ||
      code === 'form_password_length_too_short' ||
      code === 'form_password_validation_failed'
    ) {
      return 'La contraseña no cumple los requisitos de seguridad. Probá con otra.'
    }
    return 'Esta invitación ya fue usada o expiró. Pedí un nuevo link de acceso.'
  }
  return 'No pudimos procesar la invitación. Intentá de nuevo o contactá a soporte.'
}

export default function AcceptInvitationPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const ticket = searchParams.get('__clerk_ticket')
  const { isSignedIn } = useAuth()
  const { isLoaded, signUp, setActive } = useSignUp()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Sin ticket → link inválido/incompleto. Nunca auto-redirigir: el usuario
  // necesita entender qué pasó, no ser rebotado sin explicación.
  if (!ticket) {
    return (
      <InvitationShell>
        <p className="text-sm text-muted-foreground">
          Este link de invitación es inválido o está incompleto.
        </p>
        <a href="/portal/login" className="text-sm font-medium text-primary underline">
          Ir al login del portal
        </a>
      </InvitationShell>
    )
  }

  // Ya hay una sesión activa: no tiene sentido llamar signUp.create (fallaría
  // confusamente). Ofrecemos ir directo al portal.
  if (isSignedIn) {
    return (
      <InvitationShell>
        <p className="text-sm text-muted-foreground">Ya tenés una sesión abierta.</p>
        <Button onClick={() => router.replace('/portal')}>Ir al portal</Button>
      </InvitationShell>
    )
  }

  if (!isLoaded) {
    return (
      <InvitationShell>
        <div className="h-40 w-full animate-pulse rounded-md bg-muted" aria-hidden />
      </InvitationShell>
    )
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setError(null)

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`)
      return
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setSubmitting(true)
    try {
      const res = await signUp!.create({
        strategy: 'ticket',
        ticket: ticket as string,
        password,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
      })

      if (res.status === 'complete' && res.createdSessionId) {
        await setActive!({ session: res.createdSessionId })
        router.replace('/portal')
        return
      }

      // missingFields / unverifiedFields u otro estado no-completo: mensaje genérico.
      setError('No pudimos completar el registro. Intentá de nuevo o contactá a soporte.')
    } catch (err) {
      setError(mapClerkError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <InvitationShell>
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="firstName">Nombre</Label>
            <Input
              id="firstName"
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lastName">Apellido</Label>
            <Input
              id="lastName"
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Contraseña</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>

        {error != null ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={submitting}>
          {submitting ? 'Creando cuenta…' : 'Crear cuenta y entrar'}
        </Button>

        <a href="/portal/login" className="text-center text-sm text-muted-foreground underline">
          ¿Ya tenés cuenta? Ingresá acá
        </a>
      </form>
    </InvitationShell>
  )
}

/** Contenedor visual mínimo — sin extraer branding del portal (fuera de alcance de esta slice). */
function InvitationShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="w-full max-w-sm">
        <p className="eyebrow mb-1">Portal de clientes</p>
        <h1 className="mb-6 text-xl font-semibold">Activá tu cuenta</h1>
        {children}
      </div>
    </div>
  )
}
