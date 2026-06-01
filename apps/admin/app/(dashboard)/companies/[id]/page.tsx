'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft,
  Globe,
  Phone,
  Briefcase,
  Building2,
  Pencil,
  Plus,
  Check,
  Trash2,
} from 'lucide-react'
import {
  useCompanyDetail,
  useCreateNote,
  useDeleteNote,
  useCreateTask,
  useUpdateTask,
} from '@/lib/hooks'
import type { Task } from '@/lib/types'
import { cn, formatCurrency, initials } from '@/lib/utils'
import { priority as priorityStatus, taskStatus } from '@/lib/status'
import { StatusBadge } from '@/components/ui/status-badge'
import { fieldLabel, formatHistoryValue } from '@/lib/history'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PillTabs } from '@/components/ui/pill-tabs'
import { CompanyDialog } from '@/components/companies/company-dialog'
import { ActivityTimeline } from '@/components/activity/activity-timeline'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'
import { Users, StickyNote, ListTodo, History } from 'lucide-react'

type DetailTab = 'activity' | 'contacts' | 'deals' | 'notes' | 'tasks' | 'history'

// ─── Field row ─────────────────────────────────────────────────────────────

function Field({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2
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

// ─── Page ───────────────────────────────────────────────────────────────────

export default function CompanyDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const router = useRouter()

  const { data, isLoading } = useCompanyDetail(id)
  const createNote = useCreateNote()
  const deleteNote = useDeleteNote()
  const createTask = useCreateTask()
  const updateTask = useUpdateTask()

  const [detailTab, setDetailTab] = useState<DetailTab>('activity')
  const [editOpen, setEditOpen] = useState(false)
  const [noteBody, setNoteBody] = useState('')
  const [taskTitle, setTaskTitle] = useState('')

  const co = data?.company
  const companyInitials = co?.name
    ? initials(co.name.split(' ')[0], co.name.split(' ')[1])
    : '?'

  async function addNote() {
    if (!noteBody.trim()) return
    await createNote.mutateAsync({ body: noteBody.trim(), companyId: id })
    setNoteBody('')
  }

  async function addTask() {
    if (!taskTitle.trim()) return
    await createTask.mutateAsync({ title: taskTitle.trim(), companyId: id })
    setTaskTitle('')
  }

  function toggleTask(t: Task) {
    updateTask.mutate({
      id: t.id,
      input: { status: t.status === 'completed' ? 'pending' : 'completed' },
    })
  }

  const DETAIL_TABS: { key: DetailTab; label: string; count?: number }[] = [
    { key: 'activity', label: 'Actividad' },
    { key: 'contacts', label: 'Contactos', count: data?.contacts.length },
    { key: 'deals', label: 'Deals', count: data?.deals.length },
    { key: 'notes', label: 'Notas', count: data?.notes.length },
    { key: 'tasks', label: 'Tareas', count: data?.tasks.length },
    { key: 'history', label: 'Historial', count: data?.history.length },
  ]

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6 lg:flex-row">
        <Skeleton className="h-80 w-full rounded-2xl lg:w-80 lg:flex-shrink-0" />
        <Skeleton className="h-80 min-w-0 flex-1 rounded-2xl" />
      </div>
    )
  }

  // ── Empty / error ──────────────────────────────────────────────────────────
  if (!co) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">No se encontró la empresa.</p>
        <Link href="/companies" className="mt-2 inline-block text-sm text-primary underline">
          ← Volver a Empresas
        </Link>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href="/companies"
          className="flex items-center gap-1 transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Empresas
        </Link>
        <span>/</span>
        <span className="font-medium text-foreground">{co.name}</span>
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
                  {companyInitials}
                </div>
                <h2 className="text-xl font-bold leading-tight">{co.name}</h2>
                {co.domain && (
                  <p className="mt-0.5 text-sm text-muted-foreground">{co.domain}</p>
                )}
                {!co.domain && co.industry && (
                  <p className="mt-0.5 text-sm text-muted-foreground">{co.industry}</p>
                )}
              </div>

              {/* Edit button */}
              <div className="mb-4 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setEditOpen(true)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </Button>
              </div>

              {/* Fields */}
              <div className="divide-y divide-border">
                <Field icon={Globe} label="Dominio" value={co.domain} />
                <Field icon={Briefcase} label="Industria" value={co.industry} />
                <Field icon={Phone} label="Teléfono" value={co.phone} />
                <Field icon={Globe} label="Website" value={co.website} />
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
              {/* ── Activity tab ─────────────────────────── */}
              {detailTab === 'activity' && <ActivityTimeline companyId={id} />}

              {/* ── Contacts tab ─────────────────────────── */}
              {detailTab === 'contacts' && (
                <div className="space-y-2">
                  {data!.contacts.length === 0 ? (
                    <Empty className="border-dashed py-8">
                      <EmptyHeader>
                        <EmptyIllustration icon={Users} />
                        <EmptyTitle>Sin Contactos Asociados</EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    data!.contacts.map((c) => {
                      const fullNameStr =
                        [c.firstName, c.lastName].filter(Boolean).join(' ') ||
                        c.email ||
                        `#${c.id}`
                      return (
                        <div
                          key={c.id}
                          className="flex cursor-pointer items-center gap-3 rounded-xl border bg-background/60 px-3 py-2.5 transition-colors hover:bg-accent/60"
                          onClick={() => router.push(`/contacts/${c.id}`)}
                        >
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                            {initials(c.firstName ?? undefined, c.lastName ?? undefined)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{fullNameStr}</p>
                            {c.jobTitle && (
                              <p className="truncate text-xs text-muted-foreground">
                                {c.jobTitle}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              )}

              {/* ── Deals tab ────────────────────────────── */}
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
                        className="flex cursor-pointer items-center justify-between rounded-xl border bg-background/60 px-4 py-3 transition-colors hover:bg-accent/60"
                        onClick={() => router.push(`/deals/${d.id}`)}
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

              {/* ── Notes tab ────────────────────────────── */}
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
                            aria-label="Eliminar nota"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Tasks tab ────────────────────────────── */}
              {detailTab === 'tasks' && (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <input
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void addTask()
                      }}
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
                            aria-label="Completar tarea"
                          >
                            {t.status === 'completed' && <Check className="h-3.5 w-3.5" />}
                          </Button>
                          <span
                            className={cn(
                              'flex-1 text-sm',
                              t.status === 'completed' &&
                                'text-muted-foreground line-through',
                            )}
                          >
                            {t.title}
                          </span>
                          {t.status !== 'completed' && (() => {
                            const s = taskStatus(t.status)
                            return <StatusBadge kind={s.kind}>{s.label}</StatusBadge>
                          })()}
                          {t.priority && t.status !== 'completed' && (() => {
                            const p = priorityStatus(t.priority)
                            return <StatusBadge kind={p.kind}>{p.label}</StatusBadge>
                          })()}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── History tab ──────────────────────────── */}
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
                        const fmtOld = formatHistoryValue(h.fieldName, h.oldValue)
                        const fmtNew = formatHistoryValue(h.fieldName, h.newValue)
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

      <CompanyDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        company={co}
      />
    </div>
  )
}
