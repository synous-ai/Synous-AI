'use client'

/**
 * Página de aceptación de invitación de Clerk — CA2 (Clerk).
 *
 * El primer ingreso de un cliente se hace desde acá: llega desde el email de
 * invitación con un `__clerk_ticket` en la URL, fija su contraseña y queda
 * autenticado en el portal.
 *
 * Es la PRIMERA pantalla de Synous que ve un cliente, antes incluso que el
 * portal, así que comparte el diseño de los logins: dos columnas, panel de
 * marca con grano y arco de luz, y el form del otro lado.
 *
 * IMPORTANTE: usa `@clerk/nextjs/legacy`, NO `@clerk/nextjs`. La API "señal"
 * (root export en @clerk/nextjs 7.5.2) no tiene `setActive` ni `isLoaded` en la
 * forma que necesitamos acá — ver design doc §1.1. `useSignUp` legacy expone
 * `signUp.create({ strategy: 'ticket', ... })` + `setActive`.
 */

import { Suspense, useState, type FormEvent, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSignUp } from '@clerk/nextjs/legacy'
import { useAuth } from '@clerk/nextjs'
import { isClerkAPIResponseError } from '@clerk/nextjs/errors'
import './accept-invitation.css'

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

// useSearchParams() exige un límite de Suspense para el prerender estático
// (Next.js hace bail-out a client-side rendering si no lo tiene envuelto).
export default function AcceptInvitationPage() {
  return (
    <Suspense
      fallback={
        <InvitationShell>
          <div className="invite-skeleton" aria-hidden />
        </InvitationShell>
      }
    >
      <AcceptInvitationForm />
    </Suspense>
  )
}

function AcceptInvitationForm() {
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
        <p className="invite-note">Este link de invitación es inválido o está incompleto.</p>
        <a className="invite-link" href="/portal/login">
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
        <p className="invite-note">Ya tenés una sesión abierta.</p>
        <button className="invite-submit" type="button" onClick={() => router.replace('/portal')}>
          Ir al portal
        </button>
      </InvitationShell>
    )
  }

  if (!isLoaded) {
    return (
      <InvitationShell>
        <div className="invite-skeleton" aria-hidden />
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
      <form className="invite-form" onSubmit={handleSubmit}>
        <div className="invite-row">
          <div className="invite-field">
            <label htmlFor="firstName">Nombre</label>
            <input
              id="firstName"
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className="invite-field">
            <label htmlFor="lastName">Apellido</label>
            <input
              id="lastName"
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>

        <div className="invite-field">
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="invite-hint">Mínimo {MIN_PASSWORD_LENGTH} caracteres.</p>
        </div>

        <div className="invite-field">
          <label htmlFor="confirmPassword">Confirmar contraseña</label>
          <input
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
          <p className="invite-error" role="alert">
            {error}
          </p>
        ) : null}

        <button className="invite-submit" type="submit" disabled={submitting}>
          {submitting ? 'Creando cuenta…' : 'Crear cuenta y entrar'}
        </button>

        <a className="invite-link" href="/portal/login">
          ¿Ya tenés cuenta? Ingresá acá
        </a>
      </form>
    </InvitationShell>
  )
}

/**
 * Shell de dos columnas, el mismo de los logins: el panel de marca sostiene el
 * contexto (quién invita y a qué) mientras el form del otro lado hace el
 * trabajo.
 */
function InvitationShell({ children }: { children: ReactNode }) {
  return (
    <div className="invite-page">
      <aside className="invite-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="invite-light" src="/light2.webp" alt="" aria-hidden="true" />
        <div className="invite-grain" aria-hidden="true" />
        <div className="invite-halo" aria-hidden="true" />

        <div className="invite-brand-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="invite-logo" src="/brand/logotipo.svg" alt="Synous AI" />
        </div>

        <div className="invite-brand-body">
          <p className="invite-badge">
            <span className="invite-orb" aria-hidden="true" />
            TU ACCESO
          </p>
          <h1 className="invite-title">
            Bienvenido a tu <span className="invite-title-accent">espacio</span>.
          </h1>
          <p className="invite-lede">
            Creá tu contraseña y entrá al portal donde vas a seguir el proyecto: hitos, demos,
            próximos pasos y documentación.
          </p>
        </div>

        <div className="invite-marks" aria-hidden="true">
          <span className="invite-mark" />
          <span className="invite-mark" />
          <span className="invite-mark" />
        </div>
      </aside>

      <main className="invite-form-side">
        <div className="invite-form-inner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="invite-logo invite-logo-mobile" src="/brand/logotipo.svg" alt="Synous AI" />

          <h2 className="invite-heading">Activá tu cuenta</h2>
          <p className="invite-sub">Una sola vez: después entrás con tu email y contraseña.</p>

          <div className="invite-body">{children}</div>
        </div>
      </main>
    </div>
  )
}
