'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Trash2, Plus, ClipboardList, Workflow } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import {
  usePortal,
  useUpdatePortal,
  useUsers,
  useCreateUser,
  usePipelines,
  useCreatePipeline,
  useAddStage,
  useDeleteStage,
  useUpdateStage,
  useIntakeForms,
  useCreateIntakeForm,
} from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'

const TABS = [
  { value: 'empresa', label: 'Empresa' },
  { value: 'usuarios', label: 'Usuarios' },
  { value: 'pipelines', label: 'Pipelines' },
  { value: 'formularios', label: 'Formularios' },
] as const

function slugifyField(label: string): string {
  return (
    label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'campo'
  )
}

const FIELD_TYPES = ['text', 'textarea', 'email', 'number', 'date', 'file']

function FormulariosTab() {
  const { data, isLoading } = useIntakeForms()
  const create = useCreateIntakeForm()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [rows, setRows] = useState<{ label: string; type: string }[]>([{ label: '', type: 'text' }])

  async function save() {
    const fields = rows
      .filter((r) => r.label.trim())
      .map((r) => ({ name: slugifyField(r.label), label: r.label.trim(), type: r.type }))
    if (!name.trim()) return
    await create.mutateAsync({ name: name.trim(), fields })
    toast.success('Plantilla creada correctamente')
    setName('')
    setRows([{ label: '', type: 'text' }])
    setOpen(false)
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => setOpen((o) => !o)}>{open ? 'Cancelar' : 'Nueva Plantilla'}</Button>
      </div>
      {open && (
        <Card className="mb-4">
          <CardContent className="space-y-3 p-4">
            <div className="space-y-1.5">
              <Label>Nombre de la plantilla</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Branding" />
            </div>
            <Label>Campos</Label>
            {rows.map((row, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  className="flex-1"
                  value={row.label}
                  onChange={(e) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, label: e.target.value } : r)))}
                  placeholder="Etiqueta del campo"
                />
                <Select
                  value={row.type}
                  onValueChange={(v) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, type: v } : r)))}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" onClick={() => setRows((rs) => (rs.length === 1 ? rs : rs.filter((_, idx) => idx !== i)))} className="text-muted-foreground hover:text-destructive" aria-label="Quitar campo">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setRows((rs) => [...rs, { label: '', type: 'text' }])}>
              <Plus className="h-4 w-4" /> Campo
            </Button>
            <div>
              <Button size="sm" onClick={save} disabled={!name.trim() || create.isPending}>Guardar plantilla</Button>
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="p-2">
          {isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-9 rounded-lg" />
              <Skeleton className="h-9 rounded-lg" />
            </div>
          ) : (data ?? []).length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyIllustration icon={ClipboardList} />
                <EmptyTitle>Sin Plantillas de Intake</EmptyTitle>
                <EmptyDescription>Creá la primera plantilla para asignarla a los deals.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="divide-y">
              {data!.map((f) => (
                <li key={f.id} className="flex items-center justify-between px-3 py-3">
                  <div>
                    <p className="text-sm font-medium">{f.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">/{f.slug} · {f.fields.length} campos</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function EmpresaTab() {
  const { data } = usePortal()
  const update = useUpdatePortal()
  const [name, setName] = useState('')
  const [timeZone, setTimeZone] = useState('')
  const [currency, setCurrency] = useState('')
  useEffect(() => {
    if (data) {
      setName(data.name)
      setTimeZone(data.timeZone)
      setCurrency(data.currency)
    }
  }, [data])

  async function save() {
    await update.mutateAsync({ name, timeZone, currency })
    toast.success('Configuración guardada')
  }

  return (
    <Card>
      <CardContent className="max-w-md space-y-4 p-6">
        <div className="space-y-1.5">
          <Label htmlFor="pname">Nombre del portal</Label>
          <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ptz">Zona horaria</Label>
          <Input id="ptz" value={timeZone} onChange={(e) => setTimeZone(e.target.value)} placeholder="America/Argentina/Buenos_Aires" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pcur">Moneda</Label>
          <Input id="pcur" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} className="w-24" />
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={update.isPending}>Guardar</Button>
        </div>
      </CardContent>
    </Card>
  )
}

function UsuariosTab() {
  const { data, isLoading } = useUsers()
  const create = useCreateUser()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ email: '', firstName: '', role: 'member', password: '' })
  async function add() {
    try {
      await create.mutateAsync({
        email: form.email,
        firstName: form.firstName || undefined,
        role: form.role as 'owner' | 'member' | 'viewer',
        password: form.password,
      })
      toast.success('Usuario creado correctamente')
      setForm({ email: '', firstName: '', role: 'member', password: '' })
      setOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo crear el usuario')
    }
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => setOpen((o) => !o)}>{open ? 'Cancelar' : 'Nuevo Usuario'}</Button>
      </div>
      {open && (
        <Card className="mb-4">
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">owner</SelectItem>
                  <SelectItem value="member">member</SelectItem>
                  <SelectItem value="viewer">viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Contraseña</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <Button size="sm" onClick={add} disabled={create.isPending}>Crear</Button>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-6">
              <Skeleton className="h-9 rounded-lg" />
              <Skeleton className="h-9 rounded-lg" />
              <Skeleton className="h-9 rounded-lg" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Email</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Nombre</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Rol</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="px-4 py-3 font-medium">{u.email}</TableCell>
                    <TableCell className="px-4 py-3">{u.firstName ?? '—'}</TableCell>
                    <TableCell className="px-4 py-3"><span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">{u.role}</span></TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground">{u.isActive ? 'Activo' : 'Inactivo'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

interface StageEditState {
  exitCriteria: string
  description: string
}

function StageEditRow({
  pipelineId,
  stage,
}: {
  pipelineId: string
  stage: { id: string; label: string; isWon: boolean; exitCriteria: string | null; description: string | null }
}) {
  const updateStage = useUpdateStage()
  const deleteStage = useDeleteStage()
  const [state, setState] = useState<StageEditState>({
    exitCriteria: stage.exitCriteria ?? '',
    description: stage.description ?? '',
  })
  const [open, setOpen] = useState(false)

  async function save() {
    await updateStage.mutateAsync({
      pipelineId,
      stageId: stage.id,
      input: {
        exitCriteria: state.exitCriteria.trim() || null,
        description: state.description.trim() || null,
      },
    })
    toast.success('Etapa actualizada')
    setOpen(false)
  }

  return (
    <div className="rounded-lg border bg-background/40">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{stage.label}</span>
          {stage.isWon && <span className="h-1.5 w-1.5 rounded-full bg-signal" />}
          {stage.exitCriteria && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">criterio definido</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen((o) => !o)}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            {open ? 'Cerrar' : 'Editar Criterio'}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => deleteStage.mutate({ pipelineId, stageId: stage.id })}
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            aria-label="Eliminar etapa"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {open && (
        <div className="border-t px-3 py-3 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Criterio de salida</Label>
            <Textarea
              value={state.exitCriteria}
              onChange={(e) => setState((s) => ({ ...s, exitCriteria: e.target.value }))}
              placeholder="¿Qué tiene que ocurrir para avanzar a la siguiente etapa?"
              rows={2}
              className="resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Descripción (opcional)</Label>
            <Textarea
              value={state.description}
              onChange={(e) => setState((s) => ({ ...s, description: e.target.value }))}
              placeholder="Descripción o notas sobre esta etapa"
              rows={2}
              className="resize-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={save} disabled={updateStage.isPending}>Guardar</Button>
          </div>
        </div>
      )}
    </div>
  )
}

function PipelinesTab() {
  const { data, isLoading } = usePipelines()
  const createPipeline = useCreatePipeline()
  const addStage = useAddStage()
  const [newPipeline, setNewPipeline] = useState('')
  const [stageInputs, setStageInputs] = useState<Record<string, string>>({})

  async function addPipeline() {
    if (!newPipeline.trim()) return
    await createPipeline.mutateAsync({ label: newPipeline.trim(), stages: [{ label: 'Nueva etapa' }] })
    setNewPipeline('')
  }
  async function addStageTo(pipelineId: string) {
    const label = (stageInputs[pipelineId] ?? '').trim()
    if (!label) return
    await addStage.mutateAsync({ pipelineId, input: { label } })
    setStageInputs((s) => ({ ...s, [pipelineId]: '' }))
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex items-end gap-3 p-4">
          <div className="flex-1 space-y-1.5">
            <Label>Nuevo pipeline</Label>
            <Input value={newPipeline} onChange={(e) => setNewPipeline(e.target.value)} placeholder="Ej: Producción" />
          </div>
          <Button size="sm" onClick={addPipeline} disabled={!newPipeline.trim() || createPipeline.isPending}>Crear</Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : (data ?? []).length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyIllustration icon={Workflow} />
            <EmptyTitle>Sin Pipelines</EmptyTitle>
            <EmptyDescription>Creá el primer pipeline con el formulario de arriba.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        (data ?? []).map((p) => (
          <Card key={p.id}>
            <CardContent className="p-4">
              <h3 className="mb-3 font-semibold">{p.label}</h3>
              <div className="mb-3 space-y-2">
                {p.stages.map((s) => (
                  <StageEditRow key={s.id} pipelineId={p.id} stage={s} />
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  className="h-9 max-w-xs"
                  value={stageInputs[p.id] ?? ''}
                  onChange={(e) => setStageInputs((st) => ({ ...st, [p.id]: e.target.value }))}
                  placeholder="Nueva etapa…"
                />
                <Button size="sm" variant="outline" onClick={() => addStageTo(p.id)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}

export default function SettingsPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <p className="eyebrow">Ajustes</p>
        <h1 className="text-3xl font-semibold tracking-tight">Configuración</h1>
      </div>
      <Tabs defaultValue="empresa">
        <TabsList className="mb-4 h-auto rounded-lg bg-muted/60 p-1">
          {TABS.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="rounded-md px-3 py-1.5 text-sm font-medium data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="empresa"><EmpresaTab /></TabsContent>
        <TabsContent value="usuarios"><UsuariosTab /></TabsContent>
        <TabsContent value="pipelines"><PipelinesTab /></TabsContent>
        <TabsContent value="formularios"><FormulariosTab /></TabsContent>
      </Tabs>
    </div>
  )
}
