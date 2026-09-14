'use client'

import { useEffect } from 'react'

/**
 * Error boundary de ÚLTIMO recurso: se activa cuando el error ocurre en el
 * ROOT layout (`app/layout.tsx`) mismo — ahí ClerkProvider/ThemeProvider ya no
 * están garantizados, por eso Next exige que este archivo declare su propio
 * <html>/<body> y no puede asumir ningún provider ni el CSS de Tailwind
 * (globals.css se importa desde el layout que puede ser justamente lo que
 * falló). Todo acá va con estilos inline.
 *
 * No existía NINGÚN error boundary en todo el admin antes de esto — un error
 * en render tiraba abajo la pantalla en blanco de React sin aviso.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          background: '#0a0a0a',
          color: '#fafafa',
          padding: '24px',
        }}
      >
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px' }}>
            Algo salió mal
          </h1>
          <p style={{ fontSize: 14, color: '#a1a1aa', margin: '0 0 20px', lineHeight: 1.5 }}>
            Se produjo un error inesperado y no pudimos cargar la aplicación.
          </p>
          <button
            onClick={() => reset()}
            style={{
              background: '#fafafa',
              color: '#0a0a0a',
              border: 'none',
              borderRadius: 8,
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reintentar
          </button>
          {error.digest && (
            <p style={{ marginTop: 20, fontSize: 11, color: '#52525b', fontFamily: 'monospace' }}>
              Referencia: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  )
}
