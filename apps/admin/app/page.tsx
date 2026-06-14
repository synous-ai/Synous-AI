import Link from 'next/link'
import { Fraunces, JetBrains_Mono } from 'next/font/google'

// Display serif characterful (editorial) + mono para labels/etiquetas.
const display = Fraunces({ subsets: ['latin'], weight: ['400', '500', '600'], style: ['normal', 'italic'] })
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'] })

const STEPS = [
  { n: '01', label: 'Prospecta', desc: 'El lead-engine busca tu ICP y arma el primer toque.' },
  { n: '02', label: 'Conversa', desc: 'El setter con IA califica por WhatsApp, en tu voz.' },
  { n: '03', label: 'Agenda', desc: 'Reconfirma y reserva la call en tu calendario.' },
  { n: '04', label: 'Cierra', desc: 'Cae en tu CRM como lead, deal y cliente.' },
]

const FEATURES = [
  {
    k: 'Plataformas a medida',
    d: 'Sistemas Operativos Digitales propios: alumnos, contenido, pagos, comunidad e IA en un solo lugar. Arquitectura antes de código.',
  },
  {
    k: 'Setter con IA',
    d: 'Una máquina que prospecta, califica y agenda sola por WhatsApp — en rioplatense, con aprobación humana hasta que confiás.',
  },
  {
    k: 'CRM propio',
    d: 'Nada de herramientas sueltas. Pipeline, deals, clientes y portales white-label, construidos desde cero sobre Postgres.',
  },
]

export default function Landing() {
  return (
    <main
      className="relative min-h-screen overflow-hidden bg-[#0B0B0C] text-[#EDEDE8] antialiased"
      style={{ fontFeatureSettings: '"ss01","cv01"' }}
    >
      {/* Atmósfera: glow + grilla + grano */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(900px 520px at 72% -8%, rgba(199,249,75,0.10), transparent 60%), radial-gradient(680px 480px at 8% 12%, rgba(120,140,255,0.06), transparent 60%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(circle at 50% 0%, black, transparent 78%)',
          WebkitMaskImage: 'radial-gradient(circle at 50% 0%, black, transparent 78%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      <style>{`
        @keyframes rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        .rise { opacity: 0; animation: rise 0.7s cubic-bezier(0.16,1,0.3,1) forwards; }
        @keyframes lineGrow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
      `}</style>

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-6">
        {/* Nav */}
        <header className="rise flex items-center justify-between py-7" style={{ animationDelay: '0ms' }}>
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#C7F94B] text-sm font-bold text-black">
              N
            </span>
            <span className={`${mono.className} text-sm tracking-wide text-[#EDEDE8]`}>NOUS</span>
          </div>
          <Link
            href="/admin/login"
            className={`${mono.className} rounded-full border border-white/15 px-4 py-1.5 text-xs text-[#EDEDE8] transition-colors hover:border-[#C7F94B]/60 hover:text-[#C7F94B]`}
          >
            Entrar al panel →
          </Link>
        </header>

        {/* Hero */}
        <section className="flex flex-1 flex-col justify-center py-16">
          <p
            className={`${mono.className} rise mb-6 flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-[#8A8A82]`}
            style={{ animationDelay: '80ms' }}
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#C7F94B]" />
            Agencia de software · adquisición con IA
          </p>

          <h1
            className={`${display.className} rise max-w-4xl text-[clamp(2.6rem,7vw,5.3rem)] font-normal leading-[0.98] tracking-[-0.02em]`}
            style={{ animationDelay: '150ms' }}
          >
            Construimos la máquina
            <br />
            que consigue <em className="italic text-[#C7F94B]">tus clientes</em>.
          </h1>

          <p
            className="rise mt-7 max-w-xl text-lg leading-relaxed text-[#A9A9A1]"
            style={{ animationDelay: '230ms' }}
          >
            Plataformas SaaS a medida, un setter con IA que prospecta y agenda solo, y un CRM propio
            donde todo cae ordenado. De punta a punta.
          </p>

          <div className="rise mt-10 flex flex-wrap items-center gap-4" style={{ animationDelay: '310ms' }}>
            <Link
              href="/admin/login"
              className="group inline-flex items-center gap-2 rounded-full bg-[#C7F94B] px-6 py-3 text-sm font-medium text-black transition-transform hover:-translate-y-0.5"
            >
              Entrar al panel
              <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </Link>
            <a
              href="#maquina"
              className={`${mono.className} text-sm text-[#8A8A82] underline-offset-4 transition-colors hover:text-[#EDEDE8] hover:underline`}
            >
              Ver cómo funciona
            </a>
          </div>
        </section>

        {/* La máquina (flow) */}
        <section id="maquina" className="rise border-t border-white/10 py-16" style={{ animationDelay: '420ms' }}>
          <p className={`${mono.className} mb-8 text-xs uppercase tracking-[0.25em] text-[#8A8A82]`}>
            La máquina · una sola
          </p>
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n} className="bg-[#0B0B0C] p-6 transition-colors hover:bg-white/[0.02]">
                <span className={`${mono.className} text-xs text-[#C7F94B]`}>{s.n}</span>
                <h3 className={`${display.className} mt-3 text-2xl`}>{s.label}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#A9A9A1]">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="py-16">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {FEATURES.map((f, i) => (
              <div
                key={f.k}
                className="rise group relative rounded-2xl border border-white/10 bg-white/[0.015] p-7 transition-colors hover:border-[#C7F94B]/30"
                style={{ animationDelay: `${480 + i * 90}ms` }}
              >
                <div
                  className="mb-5 h-px w-10 origin-left bg-[#C7F94B]"
                  style={{ animation: 'lineGrow 0.6s cubic-bezier(0.16,1,0.3,1) both', animationDelay: `${560 + i * 90}ms` }}
                />
                <h3 className={`${display.className} text-2xl leading-tight`}>{f.k}</h3>
                <p className="mt-3 text-sm leading-relaxed text-[#A9A9A1]">{f.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-auto flex flex-col items-start justify-between gap-4 border-t border-white/10 py-8 sm:flex-row sm:items-center">
          <p className={`${mono.className} text-xs text-[#6E6E66]`}>
            © {new Date().getFullYear()} NOUS — hecho desde cero.
          </p>
          <div className={`${mono.className} flex items-center gap-5 text-xs text-[#8A8A82]`}>
            <Link href="/admin/login" className="transition-colors hover:text-[#C7F94B]">
              Panel admin
            </Link>
            <span className="text-[#6E6E66]">·</span>
            <span className="text-[#6E6E66]">Portales de cliente por subdominio</span>
          </div>
        </footer>
      </div>
    </main>
  )
}
