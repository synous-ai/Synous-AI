'use client'

import { useMemo, useState } from 'react'
import {
  Phone,
  Calendar,
  Mail,
  FileText,
  ClipboardList,
  Activity,
  Plus,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { useTimeline, useLogCall, useLogMeeting, useLogEmail, useCreateNote, usePipelines } from '@/lib/hooks'
import type { TimelineItem } from '@/lib/types'
import { cn } from '@/lib/utils'
import { taskStatus, priority as priorityStatus, BADGE_CLASS } from '@/lib/status'
import { StatusBadge } from '@/components/ui/status-badge'
import { fieldLabel, formatHistoryValue, buildStageMap } from '@/lib/history'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ── Icon map ──────────────────────────────────────────────────────────────────

const KIND_ICON: Record<TimelineItem['kind'], typeof Phone> = {
  call: Phone,
  meeting: Calendar,
  email: Mail,
  note: FileText,
  task: ClipboardList,
  history: Activity,
}

const KIND_LABEL: Record<TimelineItem['kind'], string> = {
  call: 'Llamada',
  meeting: 'Reunión',
  email: 'Email',
  note: 'Nota',
  task: 'Tarea',
  history: 'Cambio de campo',
}

const KIND_COLOR: Record<TimelineItem['kind'], string> = {
  call: 'text-blue-500',
  meeting: 'text-purple-500',
  email: 'text-amber-500',
  note: 'text-emerald-500',
  task: 'text-orange-500',
  history: 'text-muted-foreground',
}

// ── Single card ───────────────────────────────────────────────────────────────

function TimelineCard({ item, stageMap }: { item: TimelineItem; stageMap: Record<string, string> }) {
  const Icon = KIND_ICON[item.kind]
  const color = KIND_COLOR[item.kind]

  // For history items, humanise the field name and resolve old→new values
  const cardTitle =
    item.kind === 'history' ? fieldLabel(item.title) : item.title

  // History body is stored as "oldValue → newValue" — parse and re-format
  const historyBody: string | null = (() => {
    if (item.kind !== 'history' || !item.body) return null
    const sep = ' → '
    const idx = item.body.indexOf(sep)
    if (idx === -1) {
      // fallback: single value
      return formatHistoryValue(item.title, item.body, { stageMap })
    }
    const rawOld = item.body.slice(0, idx)
    const rawNew = item.body.slice(idx + sep.length)
    const fmtOld = formatHistoryValue(item.title, rawOld === '—' ? null : rawOld, { stageMap })
    const fmtNew = formatHistoryValue(item.title, rawNew === '—' ? null : rawNew, { stageMap })
    if (fmtOld === '—' && fmtNew === '—') return null
    if (fmtOld === '—') return fmtNew
    return `${fmtOld} → ${fmtNew}`
  })()

  return (
    <div className="rounded-xl border bg-card shadow-card">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Icon className={cn('h-4 w-4', color)} />
        <span className="flex-1 text-sm font-semibold">{cardTitle}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {new Date(item.occurredAt).toLocaleString('es')}
        </span>
      </div>
      <div className="px-4 py-3 space-y-1">
        {item.kind === 'history' ? (
          historyBody && (
            <p className="text-sm text-muted-foreground">{historyBody}</p>
          )
        ) : (
          item.body && (
            <p className="text-sm text-foreground whitespace-pre-wrap">{item.body}</p>
          )
        )}
        {item.kind === 'call' && item.meta && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {Boolean(item.meta.direction) && (
              <span>
                Dirección:{' '}
                <span className="font-medium text-foreground">
                  {String(item.meta.direction) === 'inbound' ? 'Entrante' : 'Saliente'}
                </span>
              </span>
            )}
            {item.meta.durationSec != null && (
              <span>
                Duración:{' '}
                <span className="font-medium text-foreground">
                  {Math.floor(Number(item.meta.durationSec) / 60)}m{' '}
                  {Number(item.meta.durationSec) % 60}s
                </span>
              </span>
            )}
          </div>
        )}
        {item.kind === 'meeting' && item.meta && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {Boolean(item.meta.location) && (
              <span>
                Lugar:{' '}
                <span className="font-medium text-foreground">
                  {String(item.meta.location)}
                </span>
              </span>
            )}
            {Boolean(item.meta.endsAt) && (
              <span>
                Fin:{' '}
                <span className="font-medium text-foreground">
                  {new Date(String(item.meta.endsAt)).toLocaleString('es')}
                </span>
              </span>
            )}
            {Boolean(item.meta.fathomSummary) && (
              <p className="w-full text-xs text-muted-foreground mt-1">
                Resumen Fathom: {String(item.meta.fathomSummary)}
              </p>
            )}
          </div>
        )}
        {item.kind === 'email' && item.meta && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {Boolean(item.meta.fromEmail) && (
              <span>
                De: <span className="font-medium text-foreground">{String(item.meta.fromEmail)}</span>
              </span>
            )}
            {Boolean(item.meta.toEmail) && (
              <span>
                Para: <span className="font-medium text-foreground">{String(item.meta.toEmail)}</span>
              </span>
            )}
            {/* Indicadores de apertura y click */}
            {item.meta.opened === true && (
              <span className={cn(BADGE_CLASS.base, BADGE_CLASS.success, 'rounded-full')}>
                Abierto
              </span>
            )}
            {item.meta.clicked === true && (
              <span className={cn(BADGE_CLASS.base, BADGE_CLASS.info, 'rounded-full')}>
                Click
              </span>
            )}
          </div>
        )}
        {item.kind === 'task' && item.meta && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            {item.meta.status != null && (() => {
              const s = taskStatus(String(item.meta.status))
              return (
                <span className="flex items-center gap-1">
                  Estado:{' '}
                  <StatusBadge kind={s.kind}>{s.label}</StatusBadge>
                </span>
              )
            })()}
            {item.meta.priority != null && (() => {
              const p = priorityStatus(String(item.meta.priority))
              return (
                <span className="flex items-center gap-1">
                  Prioridad:{' '}
                  <StatusBadge kind={p.kind}>{p.label}</StatusBadge>
                </span>
              )
            })()}
            {Boolean(item.meta.dueDate) && (
              <span>
                Vence:{' '}
                <span className="font-medium text-foreground">
                  {new Date(String(item.meta.dueDate)).toLocaleDateString('es')}
                </span>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Log activity dialog ───────────────────────────────────────────────────────

type ActivityKind = 'call' | 'meeting' | 'email' | 'note'

interface LogActivityDialogProps {
  dealId?: string
  contactId?: string
  onClose: () => void
}

function LogActivityDialog({ dealId, contactId, onClose }: LogActivityDialogProps) {
  const [kind, setKind] = useState<ActivityKind>('call')

  // Call form
  const [callTitle, setCallTitle] = useState('')
  const [callBody, setCallBody] = useState('')
  const [callDirection, setCallDirection] = useState<'inbound' | 'outbound'>('outbound')
  const [callDuration, setCallDuration] = useState('')

  // Meeting form
  const [meetTitle, setMeetTitle] = useState('')
  const [meetStartsAt, setMeetStartsAt] = useState('')
  const [meetEndsAt, setMeetEndsAt] = useState('')
  const [meetLocation, setMeetLocation] = useState('')

  // Email form
  const [emailFrom, setEmailFrom] = useState('')
  const [emailTo, setEmailTo] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')

  // Note form
  const [noteBody, setNoteBody] = useState('')

  const logCall = useLogCall()
  const logMeeting = useLogMeeting()
  const logEmail = useLogEmail()
  const createNote = useCreateNote()

  const isPending =
    logCall.isPending || logMeeting.isPending || logEmail.isPending || createNote.isPending

  async function handleSubmit() {
    try {
      if (kind === 'call') {
        await logCall.mutateAsync({
          title: callTitle || undefined,
          body: callBody || undefined,
          direction: callDirection,
          durationSec: callDuration ? Number(callDuration) : undefined,
          dealId,
          contactId,
        })
      } else if (kind === 'meeting') {
        await logMeeting.mutateAsync({
          title: meetTitle || 'Reunión',
          startsAt: meetStartsAt || undefined,
          endsAt: meetEndsAt || undefined,
          location: meetLocation || undefined,
          dealId,
          contactId,
        })
      } else if (kind === 'email') {
        await logEmail.mutateAsync({
          fromEmail: emailFrom,
          toEmail: emailTo,
          subject: emailSubject,
          bodyHtml: emailBody || undefined,
          dealId,
          contactId,
        })
      } else if (kind === 'note') {
        await createNote.mutateAsync({
          body: noteBody,
          dealId,
          contactId,
        })
      }
      onClose()
    } catch {
      // error handled by mutation
    }
  }

  const inputCls =
    'h-9 w-full rounded-lg border border-border bg-muted/50 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
  const textareaCls =
    'w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card shadow-lift">
        <div className="border-b px-6 py-4">
          <h3 className="text-base font-bold">Registrar Actividad</h3>
        </div>

        {/* Kind selector */}
        <div className="flex gap-1 px-6 pt-4">
          {(['call', 'meeting', 'email', 'note'] as ActivityKind[]).map((k) => {
            const Icon = KIND_ICON[k]
            return (
              <Button
                key={k}
                variant="ghost"
                onClick={() => setKind(k)}
                className={cn(
                  'flex flex-1 flex-col items-center gap-1 rounded-xl border py-2 text-xs font-medium h-auto transition-colors',
                  kind === k
                    ? 'border-signal bg-signal/10 text-signal-foreground hover:bg-signal/10'
                    : 'border-transparent bg-muted text-muted-foreground hover:bg-accent',
                )}
              >
                <Icon className="h-4 w-4" />
                {KIND_LABEL[k]}
              </Button>
            )
          })}
        </div>

        {/* Forms */}
        <div className="space-y-3 px-6 py-4">
          {kind === 'call' && (
            <>
              <input
                value={callTitle}
                onChange={(e) => setCallTitle(e.target.value)}
                placeholder="Título (opcional)"
                className={inputCls}
              />
              <div className="flex gap-2">
                <Select value={callDirection} onValueChange={(v) => setCallDirection(v as typeof callDirection)}>
                  <SelectTrigger className="h-9 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="outbound">Saliente</SelectItem>
                    <SelectItem value="inbound">Entrante</SelectItem>
                  </SelectContent>
                </Select>
                <input
                  value={callDuration}
                  onChange={(e) => setCallDuration(e.target.value)}
                  placeholder="Duración (seg)"
                  type="number"
                  min={0}
                  className="h-9 w-36 rounded-lg border border-border bg-muted/50 px-3 text-sm"
                />
              </div>
              <textarea
                value={callBody}
                onChange={(e) => setCallBody(e.target.value)}
                placeholder="Notas de la llamada…"
                rows={3}
                className={textareaCls}
              />
            </>
          )}

          {kind === 'meeting' && (
            <>
              <input
                value={meetTitle}
                onChange={(e) => setMeetTitle(e.target.value)}
                placeholder="Título de la reunión *"
                className={inputCls}
              />
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-muted-foreground">Inicio</label>
                  <input
                    type="datetime-local"
                    value={meetStartsAt}
                    onChange={(e) => setMeetStartsAt(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-muted-foreground">Fin</label>
                  <input
                    type="datetime-local"
                    value={meetEndsAt}
                    onChange={(e) => setMeetEndsAt(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
              <input
                value={meetLocation}
                onChange={(e) => setMeetLocation(e.target.value)}
                placeholder="Lugar / enlace (opcional)"
                className={inputCls}
              />
            </>
          )}

          {kind === 'email' && (
            <>
              <input
                value={emailFrom}
                onChange={(e) => setEmailFrom(e.target.value)}
                placeholder="De (email) *"
                type="email"
                className={inputCls}
              />
              <input
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="Para (email) *"
                type="email"
                className={inputCls}
              />
              <input
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Asunto *"
                className={inputCls}
              />
              <textarea
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                placeholder="Cuerpo del email (opcional)"
                rows={3}
                className={textareaCls}
              />
            </>
          )}

          {kind === 'note' && (
            <textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Escribí tu nota…"
              rows={4}
              className={textareaCls}
            />
          )}
        </div>

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={
              isPending ||
              (kind === 'meeting' && !meetTitle.trim()) ||
              (kind === 'email' && (!emailFrom.trim() || !emailTo.trim() || !emailSubject.trim())) ||
              (kind === 'note' && !noteBody.trim())
            }
          >
            {isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export interface ActivityTimelineProps {
  dealId?: string
  contactId?: string
  companyId?: string
  /** Compact mode: used inside a Sheet (deal-detail). No extra outer padding. */
  compact?: boolean
}

export function ActivityTimeline({
  dealId,
  contactId,
  companyId,
  compact = false,
}: ActivityTimelineProps) {
  const params =
    dealId != null
      ? { dealId }
      : contactId != null
        ? { contactId }
        : companyId != null
          ? { companyId }
          : null

  const { data: items = [], isLoading } = useTimeline(params)
  const { data: pipelines = [] } = usePipelines()
  const stageMap = useMemo(() => buildStageMap(pipelines), [pipelines])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)

  // Separate upcoming tasks from past items
  const upcomingTasks = items.filter(
    (i) =>
      i.kind === 'task' &&
      i.meta?.status !== 'completed' &&
      i.meta?.status !== 'cancelled' &&
      i.meta?.dueDate != null &&
      new Date(String(i.meta.dueDate)).getTime() > Date.now(),
  )
  const rest = items.filter((i) => !upcomingTasks.includes(i))
  const visibleRest = showAll ? rest : rest.slice(0, 10)

  const canLogNew = dealId != null || contactId != null

  return (
    <div className={cn('space-y-4', compact ? '' : '')}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className={cn('font-semibold', compact ? 'eyebrow' : 'text-sm font-semibold')}>
          Actividad
        </p>
        {canLogNew && (
          <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Registrar Actividad
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <Empty className="border-dashed">
          <EmptyHeader>
            <EmptyIllustration icon={Activity} />
            <EmptyTitle>Sin actividad todavía</EmptyTitle>
            <EmptyDescription>Registrá una llamada, reunión o nota para empezar el historial.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <ScrollArea className="max-h-[60vh]">
        <div className="space-y-4 pr-2">
          {/* Upcoming tasks */}
          {upcomingTasks.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Próximas
              </p>
              {upcomingTasks.map((item) => (
                <TimelineCard key={`${item.kind}-${item.id}`} item={item} stageMap={stageMap} />
              ))}
            </div>
          )}

          {/* Past / all items */}
          {rest.length > 0 && (
            <div className="space-y-2">
              {upcomingTasks.length > 0 && (
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Anteriores
                </p>
              )}
              {visibleRest.map((item) => (
                <TimelineCard key={`${item.kind}-${item.id}`} item={item} stageMap={stageMap} />
              ))}
              {rest.length > 10 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAll((v) => !v)}
                  className="flex w-full items-center justify-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  {showAll ? (
                    <>
                      <ChevronUp className="h-3.5 w-3.5" /> Ver menos
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3.5 w-3.5" /> Ver {rest.length - 10} más
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Dialog */}
      {dialogOpen && (
        <LogActivityDialog
          dealId={dealId}
          contactId={contactId}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </div>
  )
}
