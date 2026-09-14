'use client'

import { useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
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
import { Label } from '@/components/ui/label'
import { ListSkeleton } from '@/components/ui/skeletons'
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

// Espejan LogCallSchema / LogMeetingSchema / LogEmailSchema (apps/api/src/modules/timeline)
// y CreateNoteSchema (apps/api/src/modules/activities). dealId/contactId no se validan acá:
// los provee el componente padre, no el usuario.
const CallFormSchema = z.object({
  title: z.string().optional(),
  body: z.string().optional(),
  direction: z.enum(['inbound', 'outbound']),
  durationSec: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.coerce
      .number({ invalid_type_error: 'Debe ser un número entero ≥ 0' })
      .int('Debe ser un número entero ≥ 0')
      .nonnegative('Debe ser un número entero ≥ 0')
      .optional(),
  ),
})
type CallFormValues = z.infer<typeof CallFormSchema>

const MeetingFormSchema = z.object({
  title: z.string().min(1, 'El título de la reunión es requerido'),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  location: z.string().optional(),
})
type MeetingFormValues = z.infer<typeof MeetingFormSchema>

const EmailFormSchema = z.object({
  fromEmail: z.string().min(1, 'Requerido').email('Email inválido'),
  toEmail: z.string().min(1, 'Requerido').email('Email inválido'),
  subject: z.string().min(1, 'El asunto es requerido'),
  body: z.string().optional(),
})
type EmailFormValues = z.infer<typeof EmailFormSchema>

const NoteFormSchema = z.object({ body: z.string().min(1, 'Escribí una nota') })
type NoteFormValues = z.infer<typeof NoteFormSchema>

interface LogActivityDialogProps {
  dealId?: string
  contactId?: string
  onClose: () => void
}

function LogActivityDialog({ dealId, contactId, onClose }: LogActivityDialogProps) {
  const [kind, setKind] = useState<ActivityKind>('call')

  const callForm = useForm<CallFormValues>({
    resolver: zodResolver(CallFormSchema),
    defaultValues: { title: '', body: '', direction: 'outbound', durationSec: undefined },
  })
  const meetingForm = useForm<MeetingFormValues>({
    resolver: zodResolver(MeetingFormSchema),
    defaultValues: { title: '', startsAt: '', endsAt: '', location: '' },
  })
  const emailForm = useForm<EmailFormValues>({
    resolver: zodResolver(EmailFormSchema),
    defaultValues: { fromEmail: '', toEmail: '', subject: '', body: '' },
  })
  const noteForm = useForm<NoteFormValues>({
    resolver: zodResolver(NoteFormSchema),
    defaultValues: { body: '' },
  })

  const logCall = useLogCall()
  const logMeeting = useLogMeeting()
  const logEmail = useLogEmail()
  const createNote = useCreateNote()

  const isPending =
    logCall.isPending || logMeeting.isPending || logEmail.isPending || createNote.isPending

  async function onSubmitCall(values: CallFormValues): Promise<void> {
    await logCall.mutateAsync({
      title: values.title || undefined,
      body: values.body || undefined,
      direction: values.direction,
      durationSec: values.durationSec,
      dealId,
      contactId,
    })
    onClose()
  }

  async function onSubmitMeeting(values: MeetingFormValues): Promise<void> {
    await logMeeting.mutateAsync({
      title: values.title,
      startsAt: values.startsAt || undefined,
      endsAt: values.endsAt || undefined,
      location: values.location || undefined,
      dealId,
      contactId,
    })
    onClose()
  }

  async function onSubmitEmail(values: EmailFormValues): Promise<void> {
    await logEmail.mutateAsync({
      fromEmail: values.fromEmail,
      toEmail: values.toEmail,
      subject: values.subject,
      bodyHtml: values.body || undefined,
      dealId,
      contactId,
    })
    onClose()
  }

  async function onSubmitNote(values: NoteFormValues): Promise<void> {
    await createNote.mutateAsync({ body: values.body, dealId, contactId })
    onClose()
  }

  // Un único <form> que despacha al form RHF de la actividad activa — solo uno
  // está visible (y registrado) a la vez, según el selector de `kind`.
  function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    const submit =
      kind === 'call'
        ? callForm.handleSubmit(onSubmitCall)
        : kind === 'meeting'
          ? meetingForm.handleSubmit(onSubmitMeeting)
          : kind === 'email'
            ? emailForm.handleSubmit(onSubmitEmail)
            : noteForm.handleSubmit(onSubmitNote)
    // Si la mutación falla, el toast global (MutationCache.onError) ya lo
    // informa y el diálogo queda abierto; acá solo se evita que el rechazo que
    // re-lanza handleSubmit quede sin manejar.
    submit(e).catch(() => undefined)
  }

  const inputCls =
    'h-9 w-full rounded-lg border border-border bg-muted/50 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
  const textareaCls =
    'w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
  const errorCls = 'text-xs text-destructive'

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
                type="button"
                variant="ghost"
                onClick={() => setKind(k)}
                className={cn(
                  'flex flex-1 flex-col items-center gap-1 rounded-xl border py-2 text-xs font-medium h-auto transition-colors',
                  kind === k
                    ? 'border-signal bg-signal/10 text-signal hover:bg-signal/10'
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
        <form onSubmit={handleFormSubmit}>
          <div className="space-y-3 px-6 py-4">
            {kind === 'call' && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="log-call-title" className="sr-only">Título</Label>
                  <input
                    id="log-call-title"
                    placeholder="Título (opcional)"
                    className={inputCls}
                    {...callForm.register('title')}
                  />
                </div>
                <div className="flex gap-2">
                  <Controller
                    control={callForm.control}
                    name="direction"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="h-9 flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="outbound">Saliente</SelectItem>
                          <SelectItem value="inbound">Entrante</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <div className="w-36 space-y-1">
                    <Label htmlFor="log-call-duration" className="sr-only">Duración (segundos)</Label>
                    <input
                      id="log-call-duration"
                      placeholder="Duración (seg)"
                      type="number"
                      min={0}
                      aria-invalid={!!callForm.formState.errors.durationSec}
                      aria-describedby={callForm.formState.errors.durationSec ? 'log-call-duration-error' : undefined}
                      className="h-9 w-full rounded-lg border border-border bg-muted/50 px-3 text-sm"
                      {...callForm.register('durationSec')}
                    />
                    {callForm.formState.errors.durationSec && (
                      <p id="log-call-duration-error" className={errorCls}>
                        {callForm.formState.errors.durationSec.message}
                      </p>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="log-call-body" className="sr-only">Notas de la llamada</Label>
                  <textarea
                    id="log-call-body"
                    placeholder="Notas de la llamada…"
                    rows={3}
                    className={textareaCls}
                    {...callForm.register('body')}
                  />
                </div>
              </>
            )}

            {kind === 'meeting' && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="log-meeting-title" className="sr-only">Título de la reunión</Label>
                  <input
                    id="log-meeting-title"
                    placeholder="Título de la reunión *"
                    className={inputCls}
                    aria-invalid={!!meetingForm.formState.errors.title}
                    aria-describedby={meetingForm.formState.errors.title ? 'log-meeting-title-error' : undefined}
                    {...meetingForm.register('title')}
                  />
                  {meetingForm.formState.errors.title && (
                    <p id="log-meeting-title-error" className={errorCls}>
                      {meetingForm.formState.errors.title.message}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Label htmlFor="log-meeting-starts" className="mb-1 block text-xs text-muted-foreground">
                      Inicio
                    </Label>
                    <input
                      id="log-meeting-starts"
                      type="datetime-local"
                      className={inputCls}
                      {...meetingForm.register('startsAt')}
                    />
                  </div>
                  <div className="flex-1">
                    <Label htmlFor="log-meeting-ends" className="mb-1 block text-xs text-muted-foreground">
                      Fin
                    </Label>
                    <input
                      id="log-meeting-ends"
                      type="datetime-local"
                      className={inputCls}
                      {...meetingForm.register('endsAt')}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="log-meeting-location" className="sr-only">Lugar / enlace</Label>
                  <input
                    id="log-meeting-location"
                    placeholder="Lugar / enlace (opcional)"
                    className={inputCls}
                    {...meetingForm.register('location')}
                  />
                </div>
              </>
            )}

            {kind === 'email' && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="log-email-from" className="sr-only">De (email)</Label>
                  <input
                    id="log-email-from"
                    placeholder="De (email) *"
                    type="email"
                    className={inputCls}
                    aria-invalid={!!emailForm.formState.errors.fromEmail}
                    aria-describedby={emailForm.formState.errors.fromEmail ? 'log-email-from-error' : undefined}
                    {...emailForm.register('fromEmail')}
                  />
                  {emailForm.formState.errors.fromEmail && (
                    <p id="log-email-from-error" className={errorCls}>
                      {emailForm.formState.errors.fromEmail.message}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="log-email-to" className="sr-only">Para (email)</Label>
                  <input
                    id="log-email-to"
                    placeholder="Para (email) *"
                    type="email"
                    className={inputCls}
                    aria-invalid={!!emailForm.formState.errors.toEmail}
                    aria-describedby={emailForm.formState.errors.toEmail ? 'log-email-to-error' : undefined}
                    {...emailForm.register('toEmail')}
                  />
                  {emailForm.formState.errors.toEmail && (
                    <p id="log-email-to-error" className={errorCls}>
                      {emailForm.formState.errors.toEmail.message}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="log-email-subject" className="sr-only">Asunto</Label>
                  <input
                    id="log-email-subject"
                    placeholder="Asunto *"
                    className={inputCls}
                    aria-invalid={!!emailForm.formState.errors.subject}
                    aria-describedby={emailForm.formState.errors.subject ? 'log-email-subject-error' : undefined}
                    {...emailForm.register('subject')}
                  />
                  {emailForm.formState.errors.subject && (
                    <p id="log-email-subject-error" className={errorCls}>
                      {emailForm.formState.errors.subject.message}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="log-email-body" className="sr-only">Cuerpo del email</Label>
                  <textarea
                    id="log-email-body"
                    placeholder="Cuerpo del email (opcional)"
                    rows={3}
                    className={textareaCls}
                    {...emailForm.register('body')}
                  />
                </div>
              </>
            )}

            {kind === 'note' && (
              <div className="space-y-1">
                <Label htmlFor="log-note-body" className="sr-only">Nota</Label>
                <textarea
                  id="log-note-body"
                  placeholder="Escribí tu nota…"
                  rows={4}
                  className={textareaCls}
                  aria-invalid={!!noteForm.formState.errors.body}
                  aria-describedby={noteForm.formState.errors.body ? 'log-note-body-error' : undefined}
                  {...noteForm.register('body')}
                />
                {noteForm.formState.errors.body && (
                  <p id="log-note-body-error" className={errorCls}>
                    {noteForm.formState.errors.body.message}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t px-6 py-4">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </form>
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

      {/* Skeleton fiel: 4 cards de timeline con icono + título + fecha + cuerpo */}
      {isLoading && (
        <ListSkeleton
          rows={4}
          rowClassName="h-20 rounded-xl"
          label="Cargando actividad…"
        />
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
