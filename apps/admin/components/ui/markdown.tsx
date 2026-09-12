'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

/**
 * Renderiza Markdown escrito por el equipo (pasos de SOPs, descripciones, notas).
 *
 * Usa react-markdown + remark-gfm (tablas, listas de tareas, tachado, autolinks).
 * No se habilita `rehype-raw`: el HTML embebido queda deshabilitado a propósito,
 * así el contenido no puede inyectar markup. react-markdown escapa por defecto.
 *
 * El estilo se aplica con el mapa `components` en vez del plugin de typography
 * de Tailwind (que no está instalado), para que herede los tokens del tema.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn('text-sm leading-relaxed', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => (
            <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
          ),
          li: ({ children }) => <li className="pl-0.5">{children}</li>,
          code: ({ children }) => (
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="mb-2 overflow-x-auto rounded-lg bg-muted p-3 text-xs last:mb-0">
              {children}
            </pre>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-signal underline underline-offset-2"
            >
              {children}
            </a>
          ),
          h1: ({ children }) => (
            <p className="mb-1 mt-3 font-semibold text-foreground first:mt-0">{children}</p>
          ),
          h2: ({ children }) => (
            <p className="mb-1 mt-3 font-semibold text-foreground first:mt-0">{children}</p>
          ),
          h3: ({ children }) => (
            <p className="mb-1 mt-2 font-semibold text-foreground first:mt-0">{children}</p>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mb-2 border-l-2 border-border pl-3 italic last:mb-0">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-3 border-border" />,
          // Las tablas scrollean solas: el contenido de un SOP puede ser más
          // ancho que la card sin romper el layout.
          table: ({ children }) => (
            <div className="mb-2 overflow-x-auto last:mb-0">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
          th: ({ children }) => (
            <th className="border border-border px-2 py-1 text-left font-semibold">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-2 py-1 align-top">{children}</td>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
