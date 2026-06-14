'use client'

import { useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft,
  Mail,
  Building2,
  Plus,
  Check,
  Trash2,
  Pencil,
  Clock,
  AlertCircle,
  X,
  ExternalLink,
} from 'lucide-react'
import {
  useDealDetail,
  usePipelines,
  useCompanies,
  useContacts,
  useArchiveDeal,
  useChangeStage,
  useCreateNote,
  useDeleteNote,
  useCreateTask,
  useUpdateTask,
  useAddDealContact,
  useRemoveDealContact,
  useDeliverables,
  useCreateDeliverable,
  useUpdateDeliverable,
  useDeleteDeliverable,
  useDealIntakes,
  useIntakeForms,
  useAssignIntake,
  useDealCRs,
  useCreateCR,
  useCRTransition,
  useDealDocuments,
  useCreateDocument,
  useDeleteDocument,
  useUsers,
} from '@/lib/hooks'
import { uploadFile } from '@/lib/hooks/misc'
import { API_URL } from '@/lib/config'
import type { Company, Contact, Deal, Task, DocumentType, TeamUser } from '@/lib/types'
import { cn, formatCurrency, initials } from '@/lib/utils'
import { deliverableStatus, crStatus, intakeStatus, taskStatus, priority as priorityStatus, documentType } from '@/lib/status'
import { StatusBadge } from '@/components/ui/status-badge'
import { fieldLabel, formatHistoryValue, buildStageMap } from '@/lib/history'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DealDialog } from '@/components/deals/deal-dialog'
import { TaskDialog } from '@/components/tasks/task-dialog'
import { ActivityTimeline } from '@/components/activity/activity-timeline'
import { PillTabs } from '@/components/ui/pill-tabs'
import { DetailViewSkeleton, ListSkeleton } from '@/components/ui/skeletons'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'
import { StickyNote, ListTodo, Users, PackageCheck, GitPullRequest, History, FolderOpen, Download } from 'lucide-react'

type DetailTab =
  | 'activity'
  | 'contacts'
  | 'notes'
  | 'tasks'
  | 'deliverables'
  | 'intakes'
  | 'change-requests'
  | 'history'
  | 'documents'

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

// ─── Page ───────────────────────────────────────────────────────────────────

export default function DealDetailPage(): React.JSX.Element {
  const params = useParams<{ id: string }>()
  const id = params.id
  const router = useRouter()

  const { data, isLoading } = useDealDetail(id)
  const pipelinesQ = usePipelines()
  const companiesQ = useCompanies()
  const contactsQ = useContacts()
  const usersQ = useUsers()
  const archiveDeal = useArchiveDeal()
  const changeStage = useChangeStage()
  const createNote = useCreateNote()
  const deleteNote = useDeleteNote()
  const createTask = useCreateTask()
  const updateTask = useUpdateTask()
  const addDealContact = useAddDealContact()
  const removeDealContact = useRemoveDealContact()
  const deliverablesQ = useDeliverables(id)
  const createDeliverable = useCreateDeliverable()
  const updateDeliverable = useUpdateDeliverable()
  const deleteDeliverable = useDeleteDeliverable()
  const dealIntakesQ = useDealIntakes(id)
  const intakeFormsQ = useIntakeForms()
  const assignIntake = useAssignIntake()
  const crsQ = useDealCRs(id)
  const createCR = useCreateCR()
  const crTransition = useCRTransition()
  const documentsQ = useDealDocuments(id)
  const createDocument = useCreateDocument()
  const deleteDocument = useDeleteDocument()

  const [detailTab, setDetailTab] = useState<DetailTab>('activity')
  const [editOpen, setEditOpen] = useState(false)
  const [taskDialogOpen, setTaskDialogOpen] = useState(false)
  const [stagePicker, setStagePicker] = useState(false)
  const [noteBody, setNoteBody] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [addContactId, setAddContactId] = useState('')
  const [delivTitle, setDelivTitle] = useState('')
  const [delivType, setDelivType] = useState<'design' | 'prototype' | 'staging' | 'final'>('design')
  const [delivUrl, setDelivUrl] = useState('')
  const [assignFormId, setAssignFormId] = useState('')
  const [crOpen, setCrOpen] = useState(false)
  const [crForm, setCrForm] = useState({ title: '', description: '' })
  const [docName, setDocName] = useState('')
  const [docType, setDocType] = useState<DocumentType>('contract')
  const [docFile, setDocFile] = useState<File | null>(null)
  const [docUploading, setDocUploading] = useState(false)
  const [crItems, setCrItems] = useState<{ description: string; unitPrice: string; quantity: string }[]>([])

  const pipelines = pipelinesQ.data ?? []
  const companies = companiesQ.data ?? []
  const contacts = contactsQ.data ?? []

  // Mapa de usuarios para mostrar el responsable de cada tarea del deal
  const userMap = useMemo(() => {
    const m = new Map<string, TeamUser>()
    for (const u of usersQ.data ?? []) m.set(u.id, u)
    return m
  }, [usersQ.data])

  const d = data?.deal

  const pipeline = useMemo(
    () => pipelines.find((p) => p.id === d?.pipelineId),
    [pipelines, d?.pipelineId],
  )

  const stageLabel = useMemo(
    () => pipeline?.stages.find((s) => s.id === d?.stageId)?.label ?? null,
    [pipeline, d?.stageId],
  )

  const stageMap = useMemo(() => buildStageMap(pipelines), [pipelines])

  const associatedIds = useMemo(
    () => new Set((data?.contacts ?? []).map((c) => c.id)),
    [data?.contacts],
  )
  const availableContacts = useMemo(
    () => contacts.filter((c) => !associatedIds.has(c.id)),
    [contacts, associatedIds],
  )

  // Next open task
  const nextTask = useMemo((): Task | null => {
    if (!data) return null
    const open = data.tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress')
    if (!open.length) return null
    return [...open].sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0
      if (!a.dueDate) return 1
      if (!b.dueDate) return -1
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    })[0] ?? null
  }, [data])

  // Last activity date
  const lastActivityAt = useMemo((): Date | null => {
    if (!data) return null
    const dates: Date[] = [
      ...data.tasks.map((t) => new Date(t.createdAt)),
      ...data.notes.map((n) => new Date(n.createdAt)),
      ...data.history.map((h) => new Date(h.changedAt)),
    ]
    if (!dates.length) return null
    return new Date(Math.max(...dates.map((dd) => dd.getTime())))
  }, [data])

  async function handleArchive(): Promise<void> {
    if (!d) return
    if (!window.confirm(`¿Archivar el deal "${d.name}"? Esta acción no se puede deshacer.`)) return
    await archiveDeal.mutateAsync(id)
    router.push('/admin/deals')
  }

  async function handleStageChange(stageId: string): Promise<void> {
    await changeStage.mutateAsync({ dealId: id, stageId })
    setStagePicker(false)
  }

  async function addNote(): Promise<void> {
    if (!noteBody.trim()) return
    await createNote.mutateAsync({ body: noteBody.trim(), dealId: id })
    setNoteBody('')
  }

  async function addTask(): Promise<void> {
    if (!taskTitle.trim()) return
    await createTask.mutateAsync({ title: taskTitle.trim(), dealId: id })
    setTaskTitle('')
  }

  function toggleTask(t: Task): void {
    updateTask.mutate({ id: t.id, input: { status: t.status === 'completed' ? 'pending' : 'completed' } })
  }

  async function onAddContact(): Promise<void> {
    if (!addContactId) return
    await addDealContact.mutateAsync({ dealId: id, contactId: addContactId })
    setAddContactId('')
  }

  async function addDeliverable(): Promise<void> {
    if (!delivTitle.trim()) return
    await createDeliverable.mutateAsync({ dealId: id, title: delivTitle.trim(), type: delivType, url: delivUrl || undefined })
    setDelivTitle('')
    setDelivUrl('')
  }

  async function submitCR(): Promise<void> {
    if (!crForm.title.trim() || !crForm.description.trim()) return
    const items = crItems
      .filter((i) => i.description.trim() && i.unitPrice)
      .map((i) => ({
        description: i.description.trim(),
        unitPrice: Number(i.unitPrice),
        quantity: Number(i.quantity) || 1,
      }))
    await createCR.mutateAsync({ dealId: id, title: crForm.title.trim(), description: crForm.description.trim(), items })
    setCrForm({ title: '', description: '' })
    setCrItems([])
    setCrOpen(false)
  }

  async function uploadDocument(): Promise<void> {
    if (!docName.trim() || !docFile) return
    setDocUploading(true)
    try {
      const { key } = await uploadFile(docFile)
      await createDocument.mutateAsync({ dealId: id, name: docName.trim(), type: docType, storageKey: key })
      setDocName('')
      setDocFile(null)
    } finally {
      setDocUploading(false)
    }
  }

  const DETAIL_TABS: { key: DetailTab; label: string; count?: number }[] = [
    { key: 'activity', label: 'Actividad' },
    { key: 'contacts', label: 'Contactos', count: data?.contacts.length },
    { key: 'notes', label: 'Notas', count: data?.notes.length },
    { key: 'tasks', label: 'Tareas', count: data?.tasks.length },
    { key: 'deliverables', label: 'Entregables', count: deliverablesQ.data?.length },
    { key: 'intakes', label: 'Formularios', count: dealIntakesQ.data?.length },
    { key: 'change-requests', label: 'CRs', count: crsQ.data?.length },
    { key: 'history', label: 'Historial', count: data?.history.length },
    { key: 'documents', label: 'Docs', count: documentsQ.data?.length },
  ]

  // ── Loading state ──────────────────────────────────────────────────────────
  // 9 tabs: actividad / contactos / notas / tareas / entregables /
  //         formularios / CRs / historial / docs.
  if (isLoading) {
    return (
      <div className="p-6">
        <DetailViewSkeleton
          label="Cargando deal…"
          fields={4}
          tabs={9}
          actions={2}
        />
      </div>
    )
  }

  // ── Not found ──────────────────────────────────────────────────────────────

  if (!d) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">No se encontró el deal.</p>
        <Link href="/admin/deals" className="mt-2 text-sm text-primary underline">
          ← Volver a Deals
        </Link>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin/deals" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ChevronLeft className="h-4 w-4" />
          Deals
        </Link>
        <span>/</span>
        <span className="font-medium text-foreground">{d.name}</span>
      </nav>

      {/* Two-column layout */}
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* ── Left panel ──────────────────────────────────────────────── */}
        <div className="w-full lg:w-80 lg:flex-shrink-0">
          <Card className="rounded-2xl">
            <CardContent className="p-6">
              {/* Deal name + amount */}
              <div className="mb-4 text-center">
                <div className="mb-3 flex h-20 w-20 mx-auto items-center justify-center rounded-full bg-signal text-2xl font-bold text-signal-foreground">
                  {d.name.slice(0, 2).toUpperCase()}
                </div>
                <h2 className="text-xl font-bold leading-tight">{d.name}</h2>
                <p className="mt-1 font-mono font-semibold text-foreground">
                  {formatCurrency(d.amount, d.currency)}
                </p>
                {stageLabel && (
                  <span className="mt-1.5 inline-block rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-foreground">
                    {stageLabel}
                  </span>
                )}
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
                  <Button
                    variant="ghost"
                    onClick={() => setDetailTab('tasks')}
                    className="flex h-auto w-full items-center gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-left transition-colors hover:bg-amber-100/60 justify-start dark:border-[rgba(250,204,21,0.25)] dark:bg-[rgba(250,204,21,0.1)] dark:hover:bg-[rgba(250,204,21,0.15)]"
                  >
                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 text-amber-500 dark:text-amber-400" />
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-[rgba(253,224,71,0.85)]">
                        Sin próxima acción
                      </p>
                      <p className="text-[10px] text-amber-600/80 dark:text-[rgba(253,224,71,0.6)]">Agendar seguimiento →</p>
                    </div>
                  </Button>
                )}
                <p className="text-center text-xs text-muted-foreground">
                  Últ. actividad:{' '}
                  <span className="font-medium text-foreground">
                    {lastActivityAt ? lastActivityAt.toLocaleDateString('es') : '—'}
                  </span>
                </p>
              </div>

              {/* Actions */}
              <div className="mb-4 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/5"
                  onClick={() => void handleArchive()}
                  disabled={archiveDeal.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Archivar
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

              {/* Stage picker */}
              {pipeline && (
                <div className="relative mb-4">
                  <Button
                    className="w-full"
                    onClick={() => setStagePicker((v) => !v)}
                  >
                    Cambiar Etapa
                  </Button>
                  {stagePicker && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border bg-card shadow-lift">
                      {pipeline.stages.map((s) => (
                        <Button
                          key={s.id}
                          variant="ghost"
                          onClick={() => void handleStageChange(s.id)}
                          className={cn(
                            'flex h-auto w-full items-center justify-start gap-2 px-4 py-2.5 text-sm first:rounded-t-xl last:rounded-b-xl',
                            d.stageId === s.id && 'bg-accent/60 font-semibold',
                          )}
                        >
                          {s.label}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Deal info */}
              <div className="divide-y divide-border">
                <Field icon={Building2} label="Empresa" value={data?.company?.name} />
                {d.closeDate && (
                  <Field
                    icon={Clock}
                    label="Fecha de cierre"
                    value={new Date(d.closeDate).toLocaleDateString('es')}
                  />
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Right panel ───────────────────────────────────────────────── */}
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
              {/* ── Activity ──────────────────────────────────────────── */}
              {detailTab === 'activity' && (
                <ActivityTimeline dealId={id} compact />
              )}

              {/* ── Contacts ──────────────────────────────────────────── */}
              {detailTab === 'contacts' && (
                <div className="space-y-4">
                  {data!.contacts.length > 0 && (
                    <div className="space-y-2">
                      {data!.contacts.map((c: Contact) => (
                        <div
                          key={c.id}
                          className="group flex items-center gap-3 rounded-xl border bg-background/60 px-3 py-2.5"
                        >
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-signal text-xs font-bold text-signal-foreground">
                            {initials(c.firstName, c.lastName)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {[c.firstName, c.lastName].filter(Boolean).join(' ') || '—'}
                              {c.id === d.primaryContactId && (
                                <span className="ml-2 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">
                                  principal
                                </span>
                              )}
                            </p>
                            {c.email && (
                              <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                                <Mail className="h-3 w-3" /> {c.email}
                              </p>
                            )}
                          </div>
                          {c.id !== d.primaryContactId && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeDealContact.mutate({ dealId: id, contactId: c.id })}
                              className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                              aria-label="Quitar contacto"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {availableContacts.length > 0 && (
                    <div className="flex gap-2">
                      <Select value={addContactId} onValueChange={setAddContactId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Asociar contacto…" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableContacts.map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              {[c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || `#${c.id}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" onClick={() => void onAddContact()} disabled={!addContactId || addDealContact.isPending}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  {data!.contacts.length === 0 && availableContacts.length === 0 && (
                    <Empty className="border-dashed py-8">
                      <EmptyHeader>
                        <EmptyIllustration icon={Users} />
                        <EmptyTitle>Sin Contactos Asociados</EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  )}
                </div>
              )}

              {/* ── Notes ─────────────────────────────────────────────── */}
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
                      onClick={() => void addNote()}
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

              {/* ── Tasks ─────────────────────────────────────────────── */}
              {detailTab === 'tasks' && (
                <div className="space-y-4">
                  {/* Quick-add inline + botón de modal completo (con assignee/estado) */}
                  <div className="flex gap-2">
                    <input
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void addTask() }}
                      placeholder="Nueva tarea rápida…"
                      className="h-9 flex-1 rounded-xl border border-border bg-muted/50 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <Button
                      size="sm"
                      onClick={() => void addTask()}
                      disabled={!taskTitle.trim() || createTask.isPending}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTaskDialogOpen(true)}
                      title="Crear tarea con más opciones"
                    >
                      <Plus className="h-4 w-4" />
                      Completa
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
                      {data!.tasks.map((t) => {
                        const assignee = t.assignedTo ? userMap.get(t.assignedTo) : null
                        return (
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
                            {/* Responsable: avatar con iniciales */}
                            {assignee ? (
                              <div
                                className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground"
                                title={[assignee.firstName, assignee.lastName].filter(Boolean).join(' ') || assignee.email}
                              >
                                {initials(assignee.firstName, assignee.lastName)}
                              </div>
                            ) : (
                              <div
                                className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground"
                                title="Sin asignar"
                              >
                                ?
                              </div>
                            )}
                            {t.status !== 'completed' && (() => {
                              const s = taskStatus(t.status)
                              return <StatusBadge kind={s.kind}>{s.label}</StatusBadge>
                            })()}
                            {t.priority && (() => {
                              const p = priorityStatus(t.priority)
                              return <StatusBadge kind={p.kind}>{p.label}</StatusBadge>
                            })()}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── Deliverables ───────────────────────────────────────── */}
              {detailTab === 'deliverables' && (
                <div className="space-y-4">
                  {/* Skeleton mientras la sub-query de entregables carga */}
                  {deliverablesQ.isLoading ? (
                    <ListSkeleton rows={3} rowClassName="h-14 rounded-xl" label="Cargando entregables…" />
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <input
                          value={delivTitle}
                          onChange={(e) => setDelivTitle(e.target.value)}
                          placeholder="Título…"
                          className="h-9 flex-1 rounded-xl border border-border bg-muted/50 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        <Select value={delivType} onValueChange={(v) => setDelivType(v as typeof delivType)}>
                          <SelectTrigger className="h-9 w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="design">Diseño</SelectItem>
                            <SelectItem value="prototype">Prototipo</SelectItem>
                            <SelectItem value="staging">Staging</SelectItem>
                            <SelectItem value="final">Final</SelectItem>
                          </SelectContent>
                        </Select>
                        <input
                          value={delivUrl}
                          onChange={(e) => setDelivUrl(e.target.value)}
                          placeholder="URL (opcional)"
                          className="h-9 w-44 rounded-xl border border-border bg-muted/50 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        <Button size="sm" onClick={() => void addDeliverable()} disabled={!delivTitle.trim() || createDeliverable.isPending}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      {(deliverablesQ.data ?? []).length === 0 ? (
                        <Empty className="border-dashed py-8">
                          <EmptyHeader>
                            <EmptyIllustration icon={PackageCheck} />
                            <EmptyTitle>Sin Entregables</EmptyTitle>
                          </EmptyHeader>
                        </Empty>
                      ) : (
                        <div className="space-y-2">
                          {deliverablesQ.data!.map((dv) => (
                            <div key={dv.id} className="group rounded-xl border bg-background/60 px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <span className="flex-1 text-sm font-medium">{dv.title}</span>
                                {(() => {
                                  const { kind, label } = deliverableStatus(dv.status)
                                  return <StatusBadge kind={kind}>{label}</StatusBadge>
                                })()}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => deleteDeliverable.mutate(dv.id)}
                                  className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                              <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                                <span className="capitalize">{dv.type}</span>
                                {dv.url && (
                                  <a href={dv.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary underline">
                                    <ExternalLink className="h-3 w-3" /> Ver
                                  </a>
                                )}
                                {dv.status !== 'approved' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => updateDeliverable.mutate({ id: dv.id, input: { status: 'approved' } })}
                                    className="h-auto px-0 text-xs hover:text-foreground"
                                  >
                                    Aprobar
                                  </Button>
                                )}
                                {dv.status !== 'changes_requested' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => updateDeliverable.mutate({ id: dv.id, input: { status: 'changes_requested' } })}
                                    className="h-auto px-0 text-xs hover:text-foreground"
                                  >
                                    Pedir cambios
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── Intakes ────────────────────────────────────────────── */}
              {detailTab === 'intakes' && (
                <div className="space-y-4">
                  {/* Skeleton mientras carga la sub-query de formularios */}
                  {dealIntakesQ.isLoading && (
                    <ListSkeleton rows={2} rowClassName="h-12 rounded-xl" label="Cargando formularios…" />
                  )}
                  {!dealIntakesQ.isLoading && (dealIntakesQ.data ?? []).length > 0 && (
                    <div className="space-y-2">
                      {dealIntakesQ.data!.map((it) => (
                        <div
                          key={it.id}
                          className="flex items-center justify-between rounded-xl border bg-background/60 px-3 py-2.5"
                        >
                          <span className="text-sm font-medium">{it.formName}</span>
                          {(() => {
                            const { kind, label } = intakeStatus(it.status)
                            return <StatusBadge kind={kind}>{label}</StatusBadge>
                          })()}
                        </div>
                      ))}
                    </div>
                  )}
                  {(intakeFormsQ.data ?? []).length > 0 ? (
                    <div className="flex gap-2">
                      <Select value={assignFormId} onValueChange={setAssignFormId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Asignar formulario…" />
                        </SelectTrigger>
                        <SelectContent>
                          {intakeFormsQ.data!.map((f) => (
                            <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        onClick={async () => {
                          if (assignFormId) {
                            await assignIntake.mutateAsync({ dealId: id, formId: assignFormId })
                            setAssignFormId('')
                          }
                        }}
                        disabled={!assignFormId || assignIntake.isPending}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Creá plantillas en Configuración → Formularios para asignarlas.
                    </p>
                  )}
                </div>
              )}

              {/* ── Change Requests ────────────────────────────────────── */}
              {detailTab === 'change-requests' && (
                <div className="space-y-4">
                  {/* Skeleton mientras carga la sub-query de CRs */}
                  {crsQ.isLoading ? (
                    <ListSkeleton rows={3} rowClassName="h-14 rounded-xl" label="Cargando change requests…" />
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                          {(crsQ.data ?? []).length} change request{(crsQ.data ?? []).length !== 1 ? 's' : ''}
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setCrOpen((o) => !o)}
                          className="h-auto px-0 text-xs font-semibold text-primary hover:underline hover:bg-transparent"
                        >
                          {crOpen ? 'Cancelar' : '+ Nueva'}
                        </Button>
                      </div>

                      {crOpen && (
                        <div className="space-y-2 rounded-xl border bg-background/60 p-3">
                          <input
                            value={crForm.title}
                            onChange={(e) => setCrForm({ ...crForm, title: e.target.value })}
                            placeholder="Título"
                            className="h-9 w-full rounded-lg border border-border bg-muted/50 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          />
                          <textarea
                            value={crForm.description}
                            onChange={(e) => setCrForm({ ...crForm, description: e.target.value })}
                            placeholder="Descripción de lo que se pide"
                            rows={2}
                            className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          />
                          {crItems.map((it, i) => (
                            <div key={i} className="flex gap-2">
                              <input
                                value={it.description}
                                onChange={(e) =>
                                  setCrItems((xs) => xs.map((x, idx) => idx === i ? { ...x, description: e.target.value } : x))
                                }
                                placeholder="Ítem"
                                className="h-8 flex-1 rounded-md border border-input bg-card px-2 text-sm"
                              />
                              <input
                                value={it.unitPrice}
                                onChange={(e) =>
                                  setCrItems((xs) => xs.map((x, idx) => idx === i ? { ...x, unitPrice: e.target.value } : x))
                                }
                                placeholder="$"
                                type="number"
                                className="h-8 w-20 rounded-md border border-input bg-card px-2 text-sm"
                              />
                              <input
                                value={it.quantity}
                                onChange={(e) =>
                                  setCrItems((xs) => xs.map((x, idx) => idx === i ? { ...x, quantity: e.target.value } : x))
                                }
                                placeholder="cant"
                                type="number"
                                className="h-8 w-16 rounded-md border border-input bg-card px-2 text-sm"
                              />
                            </div>
                          ))}
                          <div className="flex items-center justify-between">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setCrItems((xs) => [...xs, { description: '', unitPrice: '', quantity: '1' }])}
                              className="h-auto px-0 text-xs text-muted-foreground hover:text-foreground hover:bg-transparent"
                            >
                              + ítem
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => void submitCR()}
                              disabled={!crForm.title.trim() || createCR.isPending}
                            >
                              Crear Borrador
                            </Button>
                          </div>
                        </div>
                      )}

                      {(crsQ.data ?? []).length === 0 ? (
                        <Empty className="border-dashed py-8">
                          <EmptyHeader>
                            <EmptyIllustration icon={GitPullRequest} />
                            <EmptyTitle>Sin Change Requests</EmptyTitle>
                          </EmptyHeader>
                        </Empty>
                      ) : (
                        <div className="space-y-2">
                          {crsQ.data!.map((cr) => (
                            <div
                              key={cr.id}
                              className="cursor-pointer rounded-xl border bg-background/60 px-3 py-2.5 transition-colors hover:bg-accent/50"
                              onClick={() => router.push(`/admin/change-requests/${cr.id}`)}
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs text-muted-foreground">CR#{cr.number}</span>
                                <span className="flex-1 text-sm font-medium">{cr.title}</span>
                                {cr.totalAmount && (
                                  <span className="font-mono text-xs text-muted-foreground">
                                    {formatCurrency(cr.totalAmount)}
                                  </span>
                                )}
                                {(() => {
                                  const { kind, label } = crStatus(cr.status)
                                  return <StatusBadge kind={kind}>{label}</StatusBadge>
                                })()}
                              </div>
                              {cr.status === 'draft' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    crTransition.mutate({ id: cr.id, status: 'sent' })
                                  }}
                                  className="mt-1 h-auto px-0 text-xs font-medium text-primary hover:underline hover:bg-transparent"
                                >
                                  Enviar al cliente →
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── History ────────────────────────────────────────────── */}
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
              {/* ── Documents ──────────────────────────────────────────── */}
              {detailTab === 'documents' && (
                <div className="space-y-4">
                  {/* Skeleton mientras carga la sub-query de documentos */}
                  {documentsQ.isLoading ? (
                    <ListSkeleton rows={3} rowClassName="h-12 rounded-xl" label="Cargando documentos…" />
                  ) : (
                    <>
                      {/* Formulario de upload */}
                      <div className="flex flex-wrap gap-2">
                        <input
                          value={docName}
                          onChange={(e) => setDocName(e.target.value)}
                          placeholder="Nombre del documento…"
                          className="h-9 flex-1 rounded-xl border border-border bg-muted/50 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        <Select value={docType} onValueChange={(v) => setDocType(v as DocumentType)}>
                          <SelectTrigger className="h-9 w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="contract">Contrato</SelectItem>
                            <SelectItem value="proposal">Propuesta</SelectItem>
                            <SelectItem value="invoice">Factura</SelectItem>
                            <SelectItem value="other">Otro</SelectItem>
                          </SelectContent>
                        </Select>
                        <label className="flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-muted/50 px-3 text-sm hover:bg-accent/50">
                          <FolderOpen className="h-4 w-4 text-muted-foreground" />
                          {docFile ? docFile.name.slice(0, 20) : 'Elegir archivo…'}
                          <input
                            type="file"
                            className="sr-only"
                            onChange={(e) => {
                              const f = e.target.files?.[0] ?? null
                              setDocFile(f)
                              if (f && !docName.trim()) setDocName(f.name)
                            }}
                          />
                        </label>
                        <Button
                          size="sm"
                          onClick={() => void uploadDocument()}
                          disabled={!docName.trim() || !docFile || docUploading}
                        >
                          {docUploading ? 'Subiendo…' : <Plus className="h-4 w-4" />}
                        </Button>
                      </div>

                      {/* Listado de documentos */}
                      {(documentsQ.data ?? []).length === 0 ? (
                        <Empty className="border-dashed py-8">
                          <EmptyHeader>
                            <EmptyIllustration icon={FolderOpen} />
                            <EmptyTitle>Sin Documentos</EmptyTitle>
                          </EmptyHeader>
                        </Empty>
                      ) : (
                        <div className="space-y-2">
                          {documentsQ.data!.map((doc) => {
                            const { kind, label } = documentType(doc.type)
                            return (
                              <div
                                key={doc.id}
                                className="group flex items-center gap-3 rounded-xl border bg-background/60 px-3 py-2.5"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium">{doc.name}</p>
                                  <p className="font-mono text-xs text-muted-foreground">
                                    {new Date(doc.createdAt).toLocaleDateString('es')}
                                  </p>
                                </div>
                                <StatusBadge kind={kind}>{label}</StatusBadge>
                                {doc.storageKey && (
                                  <a
                                    href={`${API_URL}/api/files/${doc.storageKey}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                    Descargar
                                  </a>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    if (window.confirm(`¿Eliminar "${doc.name}"?`)) {
                                      deleteDocument.mutate(doc.id)
                                    }
                                  }}
                                  className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modal de tarea completo (con assignee, estado) fijado al dealId actual */}
      <TaskDialog
        open={taskDialogOpen}
        onClose={() => setTaskDialogOpen(false)}
        fixedDealId={id}
      />

      {/* Edit deal dialog */}
      <DealDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        deal={d as Deal}
        pipeline={pipeline}
        companies={companies}
        contacts={contacts}
      />
    </div>
  )
}
