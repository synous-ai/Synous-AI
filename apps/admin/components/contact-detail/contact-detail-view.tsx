'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft,
  Mail,
  Phone,
  MoreHorizontal,
  Pencil,
  Trash2,
  Activity,
  Plus,
  Check,
  Building2,
  Briefcase,
  User,
  Calendar,
  AlertCircle,
  Clock,
  ArrowRight,
  Sparkles,
} from 'lucide-react'
import {
  useContactDetail,
  useUpdateContact,
  useCreateNote,
  useDeleteNote,
  useCreateTask,
  useUpdateTask,
  useArchiveContact,
  useCompanies,
  useUsers,
  usePipelines,
  useNextAction,
} from '@/lib/hooks'
import type { Task } from '@/lib/types'
import { cn, formatCurrency, initials } from '@/lib/utils'
import { lifecycleStage as lifecycleStageStatus, priority as priorityStatus, taskStatus } from '@/lib/status'
import { StatusBadge } from '@/components/ui/status-badge'
import { fieldLabel, formatHistoryValue, buildStageMap } from '@/lib/history'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ContactDialog } from '@/components/contacts/contact-dialog'
import { STAGE_LABELS, STAGE_DOT_CLASS } from '@/lib/status'
import { ActivityTimeline } from '@/components/activity/activity-timeline'
import { PillTabs } from '@/components/ui/pill-tabs'
import { ContactProposalsTab, formatCustomField } from '@/components/contact-detail/contact-extras'
import { sourceLabel } from '@/lib/labels'
import { DetailViewSkeleton } from '@/components/ui/skeletons'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'
import { StickyNote, ListTodo, History } from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────────────

type DetailTab = 'activity' | 'notes' | 'tasks' | 'deals' | 'proposals' | 'history'
type InfoTab = 'basic' | 'details'

const SCOPE_LABELS: Record<'leads' | 'clients' | 'contacts', string> = {
  leads: 'Leads',
  clients: 'Clientes',
  contacts: 'Contactos',
}

const SCOPE_BACK: Record<'leads' | 'clients' | 'contacts', string> = {
  leads: '/admin/leads',
  clients: '/admin/clients',
  contacts: '/admin/contacts',
}

// ─── Field row ──────────────────────────────────────────────────────────────

function Field({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail
  label: string
  value: string | null | undefined
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium">{value || '—'}</p>
      </div>
    </div>
  )
}

// ─── Shared view ────────────────────────────────────────────────────────────

export function ContactDetailView({
  scope,
  id,
}: {
  scope: 'leads' | 'clients' | 'contacts'
  id: string
}) {
  const router = useRouter()

  const { data, isLoading } = useContactDetail(scope, id)

  const { data: companies = [] } = useCompanies()
  const { data: users = [] } = useUsers()
  const { data: pipelines = [] } = usePipelines()
  const stageMap = useMemo(() => buildStageMap(pipelines), [pipelines])
  const updateContact = useUpdateContact()
  const archiveContact = useArchiveContact()
  const createNote = useCreateNote()
  const deleteNote = useDeleteNote()
  const createTask = useCreateTask()
  const updateTask = useUpdateTask()

  const [detailTab, setDetailTab] = useState<DetailTab>('activity')
  const [infoTab, setInfoTab] = useState<InfoTab>('basic')
  const [editOpen, setEditOpen] = useState(false)
  const [stagePickerOpen, setStagePickerOpen] = useState(false)
  const [noteBody, setNoteBody] = useState('')
  const [taskTitle, setTaskTitle] = useState('')

  const companyMap = useMemo(
    () => new Map(companies.map((c) => [c.id, c])),
    [companies],
  )
  const userMap = useMemo(
    () => new Map(users.map((u) => [u.id, u])),
    [users],
  )

  const c = data?.contact
  const fullName = c
    ? [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || `#${c.id}`
    : ''
  const companyName = c?.companyId ? (companyMap.get(c.companyId)?.name ?? null) : null
  const owner = c?.ownerId ? userMap.get(c.ownerId) ?? null : null
  const source = sourceLabel((c?.custom?.source as string | undefined) ?? null)

  const lastActivityDate = useMemo(() => {
    if (!data) return null
    const dates: Date[] = [
      ...(data.tasks.map((t) => new Date(t.createdAt))),
      ...(data.notes.map((n) => new Date(n.createdAt))),
      ...(data.history.map((h) => new Date(h.changedAt))),
    ]
    if (!dates.length) return null
    return new Date(Math.max(...dates.map((d) => d.getTime())))
  }, [data])

  const nextTask = useMemo(() => {
    if (!data) return null
    const open = data.tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress')
    if (!open.length) return null
    const sorted = [...open].sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0
      if (!a.dueDate) return 1
      if (!b.dueDate) return -1
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    })
    return sorted[0] ?? null
  }, [data])

  // Próxima acción sugerida por IA — solo cuando NO hay una tarea agendada
  // (si ya hay tarea, esa ES la próxima acción).
  const nextAction = useNextAction(id, !!data && !nextTask)

  const backHref = SCOPE_BACK[scope]
  const backLabel = SCOPE_LABELS[scope]

  async function handleArchive() {
    if (!c) return
    if (!window.confirm(`¿Eliminar "${fullName}"? Esta acción no se puede deshacer.`)) return
    await archiveContact.mutateAsync(id)
    router.push(backHref)
  }

  async function handleStageChange(stage: string) {
    if (!c) return
    await updateContact.mutateAsync({ id, input: { lifecycleStage: stage } })
    setStagePickerOpen(false)
  }

  async function handleConvertToClient() {
    if (!c) return
    await updateContact.mutateAsync({ id, input: { lifecycleStage: 'customer' } })
    router.push('/admin/clients')
  }

  async function addNote() {
    if (!noteBody.trim()) return
    await createNote.mutateAsync({ body: noteBody.trim(), contactId: id })
    setNoteBody('')
  }

  async function addTask() {
    if (!taskTitle.trim()) return
    await createTask.mutateAsync({ title: taskTitle.trim(), contactId: id })
    setTaskTitle('')
  }

  function toggleTask(t: Task) {
    updateTask.mutate({ id: t.id, input: { status: t.status === 'completed' ? 'pending' : 'completed' } })
  }

  const DETAIL_TABS: { key: DetailTab; label: string; count?: number }[] = [
    { key: 'activity', label: 'Actividad' },
    { key: 'notes', label: 'Notas', count: data?.notes.length },
    { key: 'tasks', label: 'Tareas', count: data?.tasks.length },
    { key: 'deals', label: 'Deals', count: data?.deals.length },
    { key: 'proposals', label: 'Propuestas' },
    { key: 'history', label: 'Historial', count: data?.history.length },
  ]

  // ── Loading state ──────────────────────────────────────────────────────────
  // Usa DetailViewSkeleton para imitar fielmente los 2 paneles del layout real
  // (aside avatar+título+acciones+campos / panel derecho con tabs+contenido).
  // 6 tabs = activity / notas / tareas / deals / propuestas / historial.
  if (isLoading) {
    return (
      <div className="p-6">
        <DetailViewSkeleton
          label="Cargando detalle…"
          fields={6}
          tabs={6}
          actions={3}
        />
      </div>
    )
  }

  // ── Empty/error state ──────────────────────────────────────────────────────
  if (!c) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">No se encontró el registro.</p>
        <Link href={backHref} className="mt-2 text-sm text-primary underline">
          ← Volver a {backLabel}
        </Link>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={backHref} className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ChevronLeft className="h-4 w-4" />
          {backLabel}
        </Link>
        <span>/</span>
        <span className="font-medium text-foreground">{fullName}</span>
      </nav>

      {/* Two-column layout */}
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* ── Left panel ──────────────────────────────────────────── */}
        <div className="w-full lg:w-80 lg:flex-shrink-0">
          <Card className="rounded-2xl">
            <CardContent className="p-6">
              {/* Avatar + name */}
              <div className="mb-4 flex flex-col items-center text-center">
                <div className="mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-signal text-2xl font-bold text-signal-foreground">
                  {initials(c.firstName, c.lastName)}
                </div>
                <h2 className="text-xl font-bold leading-tight">{fullName}</h2>
                {c.jobTitle && <p className="mt-0.5 text-sm text-muted-foreground">{c.jobTitle}</p>}
                <div className="mt-2 flex items-center gap-1.5">
                  <span className={cn('h-2 w-2 rounded-full', STAGE_DOT_CLASS[c.lifecycleStage] ?? 'bg-muted')} />
                  {(() => {
                    const { kind, label } = lifecycleStageStatus(c.lifecycleStage)
                    return <StatusBadge kind={kind}>{label}</StatusBadge>
                  })()}
                </div>
              </div>

              {/* Quick-action icon buttons */}
              <div className="mb-4 flex justify-center gap-2">
                {c.phone && (
                  <a
                    href={`tel:${c.phone}`}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border bg-card shadow-card transition-colors hover:bg-accent"
                    title="Llamar"
                  >
                    <Phone className="h-4 w-4" />
                  </a>
                )}
                {c.email && (
                  <a
                    href={`mailto:${c.email}`}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border bg-card shadow-card transition-colors hover:bg-accent"
                    title="Enviar email"
                  >
                    <Mail className="h-4 w-4" />
                  </a>
                )}
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 rounded-xl shadow-card"
                  title="Más opciones"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </div>

              {/* Próxima acción / Última actividad */}
              <div className="mb-4 space-y-1.5">
                {nextTask ? (
                  <div className="flex items-start gap-2 rounded-lg bg-accent/60 px-3 py-2">
                    <Clock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Próxima acción
                      </p>
                      <p className="truncate text-xs font-medium text-foreground">{nextTask.title}</p>
                      {nextTask.dueDate && (
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {new Date(nextTask.dueDate).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  // Sin tarea agendada → mostramos la PRÓXIMA ACCIÓN sugerida por
                  // la IA (con todo el contexto del lead). Click → ir a Tareas.
                  <Button
                    variant="ghost"
                    onClick={() => setDetailTab('tasks')}
                    className="flex h-auto w-full items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-left transition-colors hover:bg-amber-100/60 justify-start dark:border-[rgba(250,204,21,0.25)] dark:bg-[rgba(250,204,21,0.1)] dark:hover:bg-[rgba(250,204,21,0.15)]"
                  >
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-500 dark:text-amber-400" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-[rgba(253,224,71,0.85)]">
                        Próxima acción sugerida
                      </p>
                      {nextAction.isPending ? (
                        <p className="text-[11px] text-amber-600/80 dark:text-[rgba(253,224,71,0.6)]">Pensando…</p>
                      ) : (
                        <p className="whitespace-normal text-xs font-medium text-foreground">
                          {nextAction.data?.action ?? 'Agendá un seguimiento.'}
                        </p>
                      )}
                      <p className="mt-0.5 text-[10px] text-amber-600/80 dark:text-[rgba(253,224,71,0.6)]">Agendar →</p>
                    </div>
                  </Button>
                )}
                <p className="text-center text-xs text-muted-foreground">
                  Últ. actividad:{' '}
                  <span className="font-medium text-foreground">
                    {lastActivityDate ? lastActivityDate.toLocaleDateString('es') : '—'}
                  </span>
                </p>
              </div>

              {/* Actions */}
              <div className="mb-4 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/5"
                  onClick={handleArchive}
                  disabled={archiveContact.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={() => setEditOpen(true)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </Button>
              </div>

              {/* Convert to client CTA (leads only) */}
              {scope === 'leads' && (
                <Button
                  className="mb-3 w-full gap-1.5"
                  variant="outline"
                  onClick={handleConvertToClient}
                  disabled={updateContact.isPending}
                >
                  Convertir en cliente
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              )}

              {/* Stage update CTA */}
              <div className="relative">
                <Button
                  className="w-full"
                  onClick={() => setStagePickerOpen((v) => !v)}
                >
                  Actualizar estado
                </Button>
                {stagePickerOpen && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border bg-card shadow-lift">
                    {Object.entries(STAGE_LABELS).map(([key, label]) => (
                      <Button
                        key={key}
                        variant="ghost"
                        onClick={() => handleStageChange(key)}
                        className={cn(
                          'flex h-auto w-full items-center justify-start gap-2 px-4 py-2.5 text-sm first:rounded-t-xl last:rounded-b-xl',
                          c.lifecycleStage === key && 'bg-accent/60 font-semibold',
                        )}
                      >
                        <span className={cn('h-2 w-2 rounded-full', STAGE_DOT_CLASS[key] ?? 'bg-muted')} />
                        {label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>

              {/* Info tabs */}
              <div className="mt-6">
                <PillTabs
                  className="mb-3 w-full"
                  tabs={[
                    { key: 'basic' as InfoTab, label: 'Información Básica' },
                    { key: 'details' as InfoTab, label: 'Detalles' },
                  ]}
                  active={infoTab}
                  onChange={setInfoTab}
                />

                {infoTab === 'basic' ? (
                  <div className="divide-y divide-border">
                    <Field icon={Mail} label="Email" value={c.email} />
                    <Field icon={Phone} label="Teléfono" value={c.phone} />
                    <Field icon={Building2} label="Empresa" value={companyName} />
                    <Field icon={User} label="Fuente" value={source} />
                    <div className="flex items-start gap-3 py-2">
                      <Activity className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Estado</p>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', STAGE_DOT_CLASS[c.lifecycleStage] ?? 'bg-muted')} />
                          {(() => {
                            const { kind, label } = lifecycleStageStatus(c.lifecycleStage)
                            return <StatusBadge kind={kind}>{label}</StatusBadge>
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    <Field icon={Briefcase} label="Cargo" value={c.jobTitle} />
                    <div className="flex items-start gap-3 py-2">
                      <User className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Owner asignado</p>
                        <p className="text-sm font-medium">
                          {owner
                            ? [owner.firstName, owner.lastName].filter(Boolean).join(' ') || owner.email
                            : '—'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 py-2">
                      <Calendar className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Creado el</p>
                        <p className="text-sm font-medium">
                          {new Date(c.createdAt).toLocaleDateString('es')}
                        </p>
                      </div>
                    </div>
                    {c.custom &&
                      Object.entries(c.custom)
                        .filter(([k]) => k !== 'source')
                        .map(([k, v]) => {
                          const f = formatCustomField(k, v)
                          return (
                            <div key={k} className="flex items-start gap-3 py-2">
                              <Activity className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                              <div>
                                <p className="text-xs text-muted-foreground">{f.label}</p>
                                <p className="text-sm font-medium">{f.value}</p>
                              </div>
                            </div>
                          )
                        })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Right panel ─────────────────────────────────────────── */}
        <div className="min-w-0 flex-1">
          <Card className="rounded-2xl">
            {/* Tab bar */}
            <div className="border-b px-4 py-3">
              <PillTabs
                tabs={DETAIL_TABS.map(({ key, label, count }) => ({ key, label, count }))}
                active={detailTab}
                onChange={setDetailTab}
              />
            </div>

            <CardContent className="p-6">
              {/* ── Activity tab ──────────────────────────────────── */}
              {detailTab === 'activity' && (
                <ActivityTimeline contactId={id} />
              )}

              {/* ── Notes tab ─────────────────────────────────────── */}
              {detailTab === 'notes' && (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <textarea
                      value={noteBody}
                      onChange={(e) => setNoteBody(e.target.value)}
                      placeholder="Agregar una nota…"
                      rows={3}
                      className="flex-1 rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <Button
                      size="sm"
                      onClick={addNote}
                      disabled={!noteBody.trim() || createNote.isPending}
                      className="mt-auto"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {data!.notes.length === 0 ? (
                    <Empty className="border-dashed py-8">
                      <EmptyHeader>
                        <EmptyIllustration icon={StickyNote} />
                        <EmptyTitle>Sin Notas</EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    <div className="space-y-2">
                      {data!.notes.map((n) => (
                        <div
                          key={n.id}
                          className="group flex items-start justify-between gap-2 rounded-xl border bg-background/60 px-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="whitespace-pre-wrap text-sm">{n.body}</p>
                            <p className="mt-1 font-mono text-xs text-muted-foreground">
                              {new Date(n.createdAt).toLocaleString('es')}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteNote.mutate(n.id)}
                            className="h-8 w-8 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Tasks tab ─────────────────────────────────────── */}
              {detailTab === 'tasks' && (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <input
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') addTask() }}
                      placeholder="Nueva tarea…"
                      className="h-9 flex-1 rounded-xl border border-border bg-muted/50 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <Button
                      size="sm"
                      onClick={addTask}
                      disabled={!taskTitle.trim() || createTask.isPending}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {data!.tasks.length === 0 ? (
                    <Empty className="border-dashed py-8">
                      <EmptyHeader>
                        <EmptyIllustration icon={ListTodo} />
                        <EmptyTitle>Sin Tareas</EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    <div className="space-y-2">
                      {data!.tasks.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center gap-3 rounded-xl border bg-background/60 px-3 py-2.5"
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleTask(t)}
                            className={cn(
                              'h-5 w-5 flex-shrink-0 rounded border transition-colors',
                              t.status === 'completed'
                                ? 'border-signal bg-signal text-signal-foreground hover:bg-signal'
                                : 'border-input hover:border-primary hover:bg-transparent',
                            )}
                          >
                            {t.status === 'completed' && <Check className="h-3.5 w-3.5" />}
                          </Button>
                          <span
                            className={cn(
                              'flex-1 text-sm',
                              t.status === 'completed' && 'text-muted-foreground line-through',
                            )}
                          >
                            {t.title}
                          </span>
                          {t.status !== 'completed' && (() => {
                            const s = taskStatus(t.status)
                            return <StatusBadge kind={s.kind}>{s.label}</StatusBadge>
                          })()}
                          {(() => {
                            const { kind, label } = priorityStatus(t.priority)
                            return <StatusBadge kind={kind}>{label}</StatusBadge>
                          })()}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Deals tab ─────────────────────────────────────── */}
              {detailTab === 'deals' && (
                <div className="space-y-2">
                  {data!.deals.length === 0 ? (
                    <Empty className="border-dashed py-8">
                      <EmptyHeader>
                        <EmptyIllustration icon={Briefcase} />
                        <EmptyTitle>Sin Deals Asociados</EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    data!.deals.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center justify-between rounded-xl border bg-background/60 px-4 py-3"
                      >
                        <span className="text-sm font-medium">{d.name}</span>
                        <span className="font-mono text-sm text-muted-foreground">
                          {formatCurrency(d.amount, d.currency)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* ── Propuestas tab ────────────────────────────────── */}
              {detailTab === 'proposals' && (
                <ContactProposalsTab contactId={id} dealId={data?.deals[0]?.id} />
              )}

              {/* ── History tab ───────────────────────────────────── */}
              {detailTab === 'history' && (
                <div>
                  {data!.history.length === 0 ? (
                    <Empty className="border-dashed py-8">
                      <EmptyHeader>
                        <EmptyIllustration icon={History} />
                        <EmptyTitle>Sin Historial de Cambios</EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    <ol className="space-y-3">
                      {data!.history.map((h) => {
                        const ctx = { stageMap }
                        const fmtOld = formatHistoryValue(h.fieldName, h.oldValue, ctx)
                        const fmtNew = formatHistoryValue(h.fieldName, h.newValue, ctx)
                        const valueStr =
                          fmtOld !== '—'
                            ? `${fmtOld} → ${fmtNew}`
                            : fmtNew
                        return (
                          <li key={h.id} className="flex gap-3 text-sm">
                            <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-signal" />
                            <div>
                              <p>
                                <span className="font-medium">{fieldLabel(h.fieldName)}</span>{' '}
                                <span className="text-muted-foreground">{valueStr}</span>
                              </p>
                              <p className="font-mono text-xs text-muted-foreground">
                                {new Date(h.changedAt).toLocaleString('es')}
                              </p>
                            </div>
                          </li>
                        )
                      })}
                    </ol>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ContactDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        contact={c}
      />
    </div>
  )
}
