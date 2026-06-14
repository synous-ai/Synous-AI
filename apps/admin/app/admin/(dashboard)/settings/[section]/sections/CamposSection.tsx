'use client'

import { useState } from 'react'
import { Plus, Loader2, Trash2, Pencil, Settings2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useCustomFields,
  useCreateCustomField,
  useUpdateCustomField,
  useDeleteCustomField,
  type CreateCustomFieldInput,
  type UpdateCustomFieldInput,
} from '@/lib/hooks'
import type { CustomField, CustomFieldEntityType } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'

const ENTITY_OPTIONS: { value: CustomFieldEntityType; label: string }[] = [
  { value: 'contact', label: 'Contacto' },
  { value: 'deal', label: 'Deal' },
  { value: 'company', label: 'Empresa' },
]

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: 'Texto',
  number: 'Número',
  date: 'Fecha',
  select: 'Selección',
  boolean: 'Sí / No',
}

function slugifyKey(label: string): string {
  return (
    label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^[^a-z]+/, '')
      .replace(/_+$/g, '') || 'campo'
  )
}

interface FieldFormState {
  label: string
  key: string
  fieldType: string
  options: string[]
  displayOrder: string
}

function emptyFieldForm(): FieldFormState {
  return { label: '', key: '', fieldType: 'text', options: [''], displayOrder: '0' }
}

interface EditDialogProps {
  field: CustomField
  onClose: () => void
}

function EditFieldDialog({ field, onClose }: EditDialogProps) {
  const update = useUpdateCustomField()
  const [form, setForm] = useState<FieldFormState>({
    label: field.label,
    key: field.key,
    fieldType: field.fieldType,
    options: field.options && field.options.length > 0 ? field.options : [''],
    displayOrder: String(field.displayOrder),
  })
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setError(null)
    if (!form.label.trim()) {
      setError('La etiqueta es requerida')
      return
    }
    const input: UpdateCustomFieldInput = {
      label: form.label.trim(),
      fieldType: form.fieldType as UpdateCustomFieldInput['fieldType'],
      displayOrder: parseInt(form.displayOrder, 10) || 0,
      options:
        form.fieldType === 'select'
          ? form.options.map((o) => o.trim()).filter(Boolean)
          : null,
    }
    try {
      await update.mutateAsync({ id: field.id, input })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Campo</DialogTitle>
          <DialogDescription className="sr-only">
            Formulario para editar un campo personalizado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Etiqueta</Label>
            <Input
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              Clave{' '}
              <span className="font-mono text-xs text-muted-foreground">(no editable)</span>
            </Label>
            <Input value={form.key} disabled className="font-mono text-sm opacity-60" />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo de campo</Label>
            <Select
              value={form.fieldType}
              onValueChange={(v) => setForm((f) => ({ ...f, fieldType: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(FIELD_TYPE_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.fieldType === 'select' && (
            <div className="space-y-2">
              <Label>Opciones</Label>
              {form.options.map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    className="flex-1"
                    value={opt}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        options: f.options.map((o, idx) => (idx === i ? e.target.value : o)),
                      }))
                    }
                    placeholder={`Opción ${i + 1}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        options: f.options.length === 1 ? f.options : f.options.filter((_, idx) => idx !== i),
                      }))
                    }
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Quitar opción"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setForm((f) => ({ ...f, options: [...f.options, ''] }))}
              >
                <Plus className="mr-1 h-4 w-4" />
                Opción
              </Button>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Orden de visualización</Label>
            <Input
              type="number"
              min={0}
              value={form.displayOrder}
              onChange={(e) => setForm((f) => ({ ...f, displayOrder: e.target.value }))}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={save} disabled={update.isPending}>
              {update.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function CamposSection() {
  const [entity, setEntity] = useState<CustomFieldEntityType>('contact')
  const { data, isLoading } = useCustomFields(entity)
  const create = useCreateCustomField()
  const deleteField = useDeleteCustomField()
  const [open, setOpen] = useState(false)
  const [editField, setEditField] = useState<CustomField | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [form, setForm] = useState<FieldFormState>(emptyFieldForm())
  const [keyEdited, setKeyEdited] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleLabelChange(label: string) {
    setForm((f) => ({
      ...f,
      label,
      key: keyEdited ? f.key : slugifyKey(label),
    }))
  }

  async function saveNew() {
    setError(null)
    if (!form.label.trim()) {
      setError('La etiqueta es requerida')
      return
    }
    if (!form.key.trim()) {
      setError('La clave es requerida')
      return
    }
    const input: CreateCustomFieldInput = {
      entityType: entity,
      key: form.key.trim(),
      label: form.label.trim(),
      fieldType: form.fieldType as CreateCustomFieldInput['fieldType'],
      displayOrder: parseInt(form.displayOrder, 10) || 0,
      ...(form.fieldType === 'select' && {
        options: form.options.map((o) => o.trim()).filter(Boolean),
      }),
    }
    try {
      await create.mutateAsync(input)
      setForm(emptyFieldForm())
      setKeyEdited(false)
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el campo')
    }
  }

  async function confirmDelete(id: string) {
    await deleteField.mutateAsync(id)
    setConfirmId(null)
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        <strong className="text-foreground">¿Cómo funcionan los campos personalizados?</strong>{' '}
        Cada definición describe un campo extra para una entidad (Contacto, Deal o Empresa). Los valores
        que carguen los usuarios se guardan directamente en el campo <code className="rounded bg-muted px-1 font-mono text-xs">custom</code>{' '}
        (JSON) de cada registro — no afectan las columnas núcleo de la base de datos.
      </div>

      {/* Entity selector */}
      <Tabs value={entity} onValueChange={(v) => setEntity(v as CustomFieldEntityType)}>
        <TabsList className="h-auto rounded-lg bg-muted/60 p-1">
          {ENTITY_OPTIONS.map((o) => (
            <TabsTrigger
              key={o.value}
              value={o.value}
              className="rounded-md px-3 py-1.5 text-sm font-medium data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              {o.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* List */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            /* Skeleton de tabla de campos: imita las filas reales (etiqueta, clave, tipo, opciones, acción) */
            <div className="divide-y">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="grid grid-cols-5 gap-4 px-4 py-3 items-center">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-8 w-8 rounded-md ml-auto" />
                </div>
              ))}
            </div>
          ) : (data ?? []).length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyIllustration icon={Settings2} />
                <EmptyTitle>Sin Campos Personalizados</EmptyTitle>
                <EmptyDescription>
                  No hay campos para {ENTITY_OPTIONS.find((o) => o.value === entity)?.label ?? entity} todavía. Creá el primero arriba.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Etiqueta</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Clave</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Tipo</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Opciones</TableHead>
                  <TableHead className="px-4 py-3" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="px-4 py-3 font-medium">{f.label}</TableCell>
                    <TableCell className="px-4 py-3 font-mono text-xs text-muted-foreground">{f.key}</TableCell>
                    <TableCell className="px-4 py-3">
                      <span className="rounded-full border bg-muted px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {FIELD_TYPE_LABELS[f.fieldType] ?? f.fieldType}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground">
                      {f.fieldType === 'select' && f.options && f.options.length > 0 ? (
                        <span className="flex flex-wrap gap-1">
                          {f.options.slice(0, 3).map((o) => (
                            <span
                              key={o}
                              className="rounded-full border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                            >
                              {o}
                            </span>
                          ))}
                          {f.options.length > 3 && (
                            <span className="rounded-full border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                              +{f.options.length - 3}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditField(f)}
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {confirmId === f.id ? (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => confirmDelete(f.id)}
                              className="h-auto px-0 text-xs font-semibold text-destructive hover:underline hover:bg-transparent"
                            >
                              Confirmar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmId(null)}
                              className="h-auto px-0 text-xs text-muted-foreground hover:underline hover:bg-transparent"
                            >
                              Cancelar
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setConfirmId(f.id)}
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            title="Archivar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* New field button */}
      <div className="flex justify-end">
        <Button size="sm" onClick={() => { setOpen((o) => !o); setError(null) }}>
          {open ? 'Cancelar' : (
            <>
              <Plus className="mr-1.5 h-4 w-4" />
              Nuevo Campo
            </>
          )}
        </Button>
      </div>

      {/* New field form */}
      {open && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Etiqueta</Label>
                <Input
                  value={form.label}
                  onChange={(e) => handleLabelChange(e.target.value)}
                  placeholder="Ej: Presupuesto"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Clave (slug)</Label>
                <Input
                  value={form.key}
                  onChange={(e) => { setKeyEdited(true); setForm((f) => ({ ...f, key: e.target.value })) }}
                  placeholder="presupuesto"
                  className="font-mono text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  Solo minúsculas, números y guion bajo. No se puede cambiar después.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo de campo</Label>
                <Select
                  value={form.fieldType}
                  onValueChange={(v) => setForm((f) => ({ ...f, fieldType: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FIELD_TYPE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Orden de visualización</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.displayOrder}
                  onChange={(e) => setForm((f) => ({ ...f, displayOrder: e.target.value }))}
                />
              </div>
            </div>
            {form.fieldType === 'select' && (
              <div className="space-y-2">
                <Label>Opciones</Label>
                {form.options.map((opt, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      className="flex-1"
                      value={opt}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          options: f.options.map((o, idx) => (idx === i ? e.target.value : o)),
                        }))
                      }
                      placeholder={`Opción ${i + 1}`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          options:
                            f.options.length === 1
                              ? f.options
                              : f.options.filter((_, idx) => idx !== i),
                        }))
                      }
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Quitar opción"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setForm((f) => ({ ...f, options: [...f.options, ''] }))}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Opción
                </Button>
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end">
              <Button size="sm" onClick={saveNew} disabled={!form.label.trim() || create.isPending}>
                {create.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Crear Campo
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit dialog */}
      {editField && (
        <EditFieldDialog field={editField} onClose={() => setEditField(null)} />
      )}
    </div>
  )
}
