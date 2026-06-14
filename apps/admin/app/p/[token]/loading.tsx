/**
 * Skeleton del shell de la propuesta pública (`/p/[token]`).
 *
 * Next.js App Router muestra este archivo automáticamente mientras el segmento
 * [token] suspende (streaming RSC). Cubre el gap entre la navegación y el primer
 * render de `ProposalDeck`. Estructura fiel al shell real:
 *   header (empresa + PDF + toggle) | slide central | footer (← dots →)
 *
 * Usa `bg-background` igual que el estado ready de `ProposalDeck` → sin flash de
 * color al montar. Las barras son `bg-muted` (tokens shadcn), apropiado porque
 * esta página respeta el tema del usuario (light/dark).
 */
export default function PublicProposalLoading() {
  return (
    <div
      role="status"
      aria-label="Cargando propuesta…"
      aria-busy="true"
      className="relative flex min-h-screen flex-col overflow-hidden bg-background"
    >
      <span className="sr-only">Cargando propuesta…</span>

      {/* Header: nombre de empresa + botón PDF + ThemeToggle */}
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <div aria-hidden className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="flex items-center gap-2">
          <div aria-hidden className="h-8 w-16 animate-pulse rounded-lg bg-muted" />
          <div aria-hidden className="h-8 w-8 animate-pulse rounded-lg bg-muted" />
        </div>
      </header>

      {/* Slide central: eyebrow + título + subtítulo */}
      <main className="flex flex-1 items-center justify-center px-6 py-8 sm:px-12">
        <div className="w-full max-w-3xl space-y-6 text-center">
          <div aria-hidden className="mx-auto h-3 w-20 animate-pulse rounded bg-muted" />
          <div aria-hidden className="mx-auto h-10 w-3/4 animate-pulse rounded bg-muted" />
          <div aria-hidden className="mx-auto h-5 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      </main>

      {/* Footer: botón anterior + dots de navegación + botón siguiente */}
      <footer className="flex items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <div aria-hidden className="h-10 w-10 animate-pulse rounded-full bg-muted" />
        <div className="flex gap-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted" />
          ))}
        </div>
        <div aria-hidden className="h-10 w-10 animate-pulse rounded-full bg-muted" />
      </footer>
    </div>
  )
}
