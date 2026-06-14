'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Inbox, Check, Pencil, RefreshCw, X, Sparkles, Bot, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { API_URL } from '@/lib/config'
import { useAuth } from '@clerk/nextjs'
import {
  useSetterDrafts,
  useSetterDraft,
  useSetterConfig,
  useApproveDraft,
  useEditDraft,
  useRejectDraft,
  useRegenerateDraft,
  useSetModelProvider,
  useSetterEvents,
} from '@/lib/hooks'
import type { SetterDraft, ModelProvider, SetterEvent } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from '@/components/ui/status-badge'
import type { StatusKind } from '@/lib/status'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ProspectingView } from '@/components/prospecting/prospecting-view'

const LEAD_STATUS: Record<string, { kind: StatusKind; label: string }> = {
  NEW: { kind: 'neutral', label: 'Nuevo' },
  CONTACTED: { kind: 'neutral', label: 'Contactado' },
  ENGAGED: { kind: 'info', label: 'Enganchado' },
  QUALIFYING: { kind: 'info', label: 'Calificando' },
  QUALIFIED: { kind: 'warning', label: 'Calificado' },
  BOOKING: { kind: 'warning', label: 'Agendando' },
  BOOKED: { kind: 'success', label: 'Agendado' },
  NOT_INTERESTED: { kind: 'neutral', label: 'No interesado' },
  HANDED_OFF: { kind: 'danger', label: 'A humano' },
  OPTED_OUT: { kind: 'danger', label: 'Opt-out' },
}

function leadStatus(s: string): { kind: StatusKind; label: string } {
  return LEAD_STATUS[s] ?? { kind: 'neutral', label: s }
}

// ─── Model Switcher ───────────────────────────────────────────────────────────

function ModelSwitcher() {
  const { data: config } = useSetterConfig()
  const setProvider = useSetModelProvider()
  if (!config) return null

  const options: { value: ModelProvider; label: string }[] = [
    { value: 'gemini', label: 'Gemini' },
    { value: 'claude', label: 'Claude Sonnet 4.6' },
  ]

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Modelo</span>
      <div className="inline-flex rounded-lg border p-0.5">
        {options.map((opt) => {
          const active = config.modelProvider === opt.value
          const available = config.providers[opt.value]
          return (
            <button
              key={opt.value}
              type="button"
              disabled={!available || setProvider.isPending}
              title={available ? undefined : `${opt.label} no tiene credenciales cargadas en la API`}
              onClick={() =>
                setProvider.mutate(opt.value, {
                  onSuccess: () => toast.success(`Modelo: ${opt.label}`),
                  onError: (e) => toast.error(e instanceof Error ? e.message : 'Error'),
                })
              }
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1 text-sm transition-colors',
                active ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
                !available && 'cursor-not-allowed opacity-40',
              )}
            >
              {opt.value === 'claude' ? <Sparkles className="size-3.5" /> : <Bot className="size-3.5" />}
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Cola (columna izquierda) ─────────────────────────────────────────────────

function DraftRow({
  draft,
  selected,
  onSelect,
}: {
  draft: SetterDraft
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-lg border p-3 text-left transition-colors',
        selected ? 'border-foreground/30 bg-muted' : 'hover:bg-muted/50',
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">
          {draft.personName ?? draft.personPhone ?? 'Lead'}
        </span>
        {draft.beat && <span className="shrink-0 text-[11px] text-muted-foreground">{draft.beat}</span>}
      </div>
      <p className="line-clamp-2 text-xs text-muted-foreground">{draft.content}</p>
    </button>
  )
}

// ─── Contexto del lead (columna derecha) ──────────────────────────────────────

function LeadContext({ draft }: { draft: SetterDraft }) {
  const q = draft.qualification ?? {}
  const tools = draft.toolCalls?.tools ?? []
  const st = leadStatus(draft.leadStatus)

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="eyebrow mb-1">Lead</p>
        <p className="font-medium">{draft.personName ?? 'Sin nombre'}</p>
        <p className="text-xs text-muted-foreground">{draft.personPhone}</p>
      </div>

      <div>
        <p className="eyebrow mb-1">Estado</p>
        <StatusBadge kind={st.kind}>{st.label}</StatusBadge>
      </div>

      {Object.keys(q).length > 0 && (
        <div>
          <p className="eyebrow mb-1">Calificación</p>
          <dl className="space-y-1">
            {Object.entries(q).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="text-xs capitalize text-muted-foreground">{k}:</dt>
                <dd className="text-xs">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div>
        <p className="eyebrow mb-1">Por qué dijo esto</p>
        {tools.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {tools.map((t, i) => (
              <span key={i} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                {t}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Sin tool calls (respuesta directa)</p>
        )}
      </div>

      <div>
        <p className="eyebrow mb-1">CRM</p>
        {draft.crmContactId ? (
          <div className="flex flex-col gap-1">
            <Link
              href={`/contacts/${draft.crmContactId}`}
              className="inline-flex items-center gap-1 text-xs text-foreground underline-offset-2 hover:underline"
            >
              <ExternalLink className="size-3" /> Ver contacto
            </Link>
            {draft.crmDealId && (
              <Link
                href={`/deals/${draft.crmDealId}`}
                className="inline-flex items-center gap-1 text-xs text-foreground underline-offset-2 hover:underline"
              >
                <ExternalLink className="size-3" /> Ver deal
              </Link>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Aún no sincronizado al CRM</p>
        )}
      </div>
    </div>
  )
}

// ─── Vista principal ──────────────────────────────────────────────────────────

/** Sección unificada: Prospección (encontrar leads) + Bandeja (aprobar drafts). */
export function SetterView() {
  return (
    <div className="px-6 pt-6">
      <div className="mb-4">
        <p className="eyebrow">Máquina de adquisición</p>
        <h1 className="text-3xl font-semibold tracking-tight">Setter</h1>
      </div>
      <Tabs defaultValue="bandeja">
        <TabsList>
          <TabsTrigger value="prospeccion">Prospección</TabsTrigger>
          <TabsTrigger value="bandeja">Bandeja</TabsTrigger>
          <TabsTrigger value="consola">Consola</TabsTrigger>
        </TabsList>
        <TabsContent value="prospeccion">
          <ProspectingView embedded />
        </TabsContent>
        <TabsContent value="bandeja">
          <BandejaTab />
        </TabsContent>
        <TabsContent value="consola">
          <SetterConsole />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Consola (monitoreo en vivo) ──────────────────────────────────────────────

const LEVEL_STYLE = {
  info: { dot: 'bg-zinc-500', text: 'text-zinc-300' },
  success: { dot: 'bg-emerald-400', text: 'text-emerald-200' },
  warn: { dot: 'bg-amber-400', text: 'text-amber-200' },
  error: { dot: 'bg-red-400', text: 'text-red-300' },
} as const

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function SetterConsole() {
  const { isSignedIn, getToken } = useAuth()
  const { data: history, isPending } = useSetterEvents()
  const [live, setLive] = useState<SetterEvent[]>([])
  const [connected, setConnected] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // WebSocket: actividad en vivo, sin polling. Reconecta solo si se cae.
  // El token de Clerk vence ~60s, por eso se pide FRESCO en cada (re)conexión.
  // Si la sesión Clerk sigue activa en el browser, getToken() devuelve un
  // token nuevo para el reconnect automático.
  useEffect(() => {
    if (!isSignedIn) return
    let ws: WebSocket | null = null
    let retry: ReturnType<typeof setTimeout> | null = null
    let closed = false

    async function connect() {
      const token = await getToken()
      if (closed || !token) return
      try {
        ws = new WebSocket(`${API_URL.replace(/^http/, 'ws')}/ws/setter/events?token=${token}`)
      } catch {
        return
      }
      ws.onopen = () => setConnected(true)
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data as string) as SetterEvent & { type?: string }
          if (data.type === 'connected') return
          setLive((prev) => [data, ...prev])
        } catch {
          /* ignore */
        }
      }
      ws.onclose = () => {
        setConnected(false)
        // Al reconectar, pide un token fresco (el viejo pudo haber vencido).
        if (!closed) retry = setTimeout(connect, 2000)
      }
      ws.onerror = () => ws?.close()
    }

    void connect()
    return () => {
      closed = true
      if (retry) clearTimeout(retry)
      ws?.close()
    }
  }, [isSignedIn, getToken])

  // Merge: live (nuevos) + historia inicial, dedup por id, nuevos abajo (terminal).
  const seen = new Set<string>()
  const events = [...live, ...(history ?? [])]
    .filter((e) => {
      if (seen.has(e.id)) return false
      seen.add(e.id)
      return true
    })
    .reverse()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events.length])

  return (
    <div className="py-2">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="eyebrow">Consola · actividad de la máquina</p>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={cn(
                'absolute inline-flex h-full w-full animate-ping rounded-full opacity-90 [animation-duration:0.8s]',
                connected ? 'bg-emerald-500' : 'bg-red-500',
              )}
            />
            <span
              className={cn(
                'relative inline-flex h-2.5 w-2.5 rounded-full',
                connected ? 'bg-emerald-500' : 'bg-red-500',
              )}
            />
          </span>
          {connected ? 'Conectado' : 'Desconectado'}
        </span>
      </div>

      <div className="h-[62vh] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-300">
        {isPending ? (
          <p className="text-zinc-500">Conectando…</p>
        ) : events.length === 0 ? (
          <p className="text-zinc-600">
            Esperando actividad… acá vas a ver en tiempo real: mensajes que entran, drafts del
            agente, aprobaciones, sync al CRM, corridas del autopilot y errores.
          </p>
        ) : (
          events.map((e) => {
            const st = LEVEL_STYLE[e.level] ?? LEVEL_STYLE.info
            return (
              <div key={e.id} className="flex items-start gap-2 py-0.5">
                <span className="shrink-0 text-zinc-600">{fmtTime(e.createdAt)}</span>
                <span className={cn('mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full', st.dot)} />
                <span className="w-20 shrink-0 truncate uppercase tracking-wide text-zinc-500">
                  {e.type}
                </span>
                <span className={st.text}>{e.message}</span>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

function BandejaTab() {
  const { data: drafts, isPending } = useSetterDrafts()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')

  const selected = drafts?.find((d) => d.id === selectedId) ?? null
  const { data: detail } = useSetterDraft(selectedId)

  const approve = useApproveDraft()
  const edit = useEditDraft()
  const reject = useRejectDraft()
  const regenerate = useRegenerateDraft()

  // Seleccionar el primero de la cola automáticamente.
  useEffect(() => {
    if (!selectedId && drafts && drafts.length > 0) setSelectedId(drafts[0]?.id ?? null)
    if (selectedId && drafts && !drafts.some((d) => d.id === selectedId)) {
      setSelectedId(drafts[0]?.id ?? null)
    }
  }, [drafts, selectedId])

  function doApprove() {
    if (!selected) return
    approve.mutate(selected.id, {
      onSuccess: (r) => {
        toast.success(r.sent ? 'Aprobado y enviado' : 'Aprobado (envío pendiente: Evolution sin credenciales)')
        setSelectedId(null)
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Error'),
    })
  }

  function doReject() {
    if (!selected) return
    reject.mutate(selected.id, {
      onSuccess: () => {
        toast.success('Rechazado')
        setSelectedId(null)
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Error'),
    })
  }

  function doRegenerate() {
    if (!selected) return
    regenerate.mutate(selected.id, {
      onSuccess: (d) => {
        toast.success('Regenerado')
        setSelectedId(d.id)
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Error'),
    })
  }

  function startEdit() {
    if (!selected) return
    setEditText(selected.content)
    setEditing(true)
  }

  function saveEdit() {
    if (!selected) return
    edit.mutate(
      { id: selected.id, content: editText },
      {
        onSuccess: () => {
          toast.success('Editado y enviado')
          setEditing(false)
          setSelectedId(null)
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Error'),
      },
    )
  }

  // Atajo: Enter aprueba (si hay draft seleccionado y no se está editando).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (editing || !selected) return
      const target = e.target as HTMLElement
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') return
      if (e.key === 'Enter') {
        e.preventDefault()
        doApprove()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, editing])

  const busy = approve.isPending || edit.isPending || reject.isPending || regenerate.isPending

  return (
    <div className="py-2">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="eyebrow">Cola de aprobación · shadow mode</p>
        <ModelSwitcher />
      </div>

      {isPending ? (
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-3 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
          <Skeleton className="col-span-6 h-96 rounded-lg" />
          <Skeleton className="col-span-3 h-96 rounded-lg" />
        </div>
      ) : !drafts?.length ? (
        <Empty>
          <EmptyHeader>
            <EmptyIllustration icon={Inbox} />
            <EmptyTitle>Todo al día</EmptyTitle>
            <EmptyDescription>
              No hay drafts para aprobar. Cuando entre un mensaje, el agente arma la respuesta y aparece acá.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-12 gap-4">
          {/* Columna 1 — Cola */}
          <div className="col-span-3 space-y-2">
            {drafts.map((d) => (
              <DraftRow
                key={d.id}
                draft={d}
                selected={d.id === selectedId}
                onSelect={() => {
                  setSelectedId(d.id)
                  setEditing(false)
                }}
              />
            ))}
          </div>

          {/* Columna 2 — Conversación + draft */}
          <div className="col-span-6 rounded-lg border">
            {selected ? (
              <div className="flex h-full flex-col">
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {detail?.messages.map((m, i) => (
                    <div
                      key={i}
                      className={cn('flex', m.role === 'assistant' ? 'justify-end' : 'justify-start')}
                    >
                      <div
                        className={cn(
                          'max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm',
                          m.role === 'assistant'
                            ? 'bg-foreground text-background'
                            : 'bg-muted text-foreground',
                        )}
                      >
                        {m.content}
                      </div>
                    </div>
                  ))}
                  {/* Skeleton de mensajes mientras carga la conversación */}
                  {!detail && (
                    <div className="space-y-3 px-1">
                      <div className="flex justify-start">
                        <Skeleton className="h-10 w-48 rounded-2xl" />
                      </div>
                      <div className="flex justify-end">
                        <Skeleton className="h-10 w-56 rounded-2xl" />
                      </div>
                      <div className="flex justify-start">
                        <Skeleton className="h-10 w-40 rounded-2xl" />
                      </div>
                      <div className="flex justify-end">
                        <Skeleton className="h-10 w-52 rounded-2xl" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Draft de la IA */}
                <div className="border-t bg-muted/30 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Sparkles className="size-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">
                      Borrador del agente{selected.beat ? ` · ${selected.beat}` : ''}
                    </span>
                  </div>

                  {editing ? (
                    <Textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={4}
                      className="mb-3"
                      autoFocus
                    />
                  ) : (
                    <p className="mb-3 whitespace-pre-wrap rounded-lg border bg-background p-3 text-sm">
                      {selected.content}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {editing ? (
                      <>
                        <Button size="sm" disabled={busy} onClick={saveEdit}>
                          <Check /> Guardar y enviar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                          Cancelar
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" disabled={busy} onClick={doApprove}>
                          <Check /> Aprobar <kbd className="ml-1 text-[10px] opacity-60">⏎</kbd>
                        </Button>
                        <Button size="sm" variant="outline" disabled={busy} onClick={startEdit}>
                          <Pencil /> Editar
                        </Button>
                        <Button size="sm" variant="outline" disabled={busy} onClick={doRegenerate}>
                          <RefreshCw /> Regenerar
                        </Button>
                        <Button size="sm" variant="ghost" disabled={busy} onClick={doReject}>
                          <X /> Rechazar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
                Elegí un draft de la cola
              </div>
            )}
          </div>

          {/* Columna 3 — Contexto */}
          <div className="col-span-3 rounded-lg border p-4">
            {selected ? (
              <LeadContext draft={selected} />
            ) : (
              <p className="text-sm text-muted-foreground">Sin selección</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
