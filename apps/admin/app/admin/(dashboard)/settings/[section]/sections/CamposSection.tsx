'use client'

import { useState } from 'react'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Loader2, Trash2, Pencil, Settings2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useCustomFields,
  useCreateCustomField,
  useUpdateCustomField,
  useDeleteCustomField,
} from '@/lib/hooks'
import { ApiError } from '@/lib/api'
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

// ── Schema (espeja CreateCustomFieldSchema / UpdateCustomFieldSchema de apps/api) ──

const OptionSchema = z.object({ value: z.string() })

const baseFieldShape = {
  label: z.string().min(1, 'La etiqueta es requerida'),
  fieldType: z.enum(['text', 'number', 'date', 'select', 'boolean']),
  options: z.array(OptionSchema),
  displayOrder: z.coerce
    .number({ invalid_type_error: 'Debe ser un número' })
    .int('Debe ser un número entero')
    .min(0, 'Debe ser mayor o igual a 0'),
}

const NewFieldSchema = z.object({
  ...baseFieldShape,
  key: z
    .string()
    .min(1, 'La clave es requerida')
    .regex(
      /^[a-z][a-z0-9_]*$/,
      'La clave debe comenzar con una letra minúscula y contener solo letras, números y guion bajo',
    ),
})
type NewFieldValues = z.infer<typeof NewFieldSchema>

const EditFieldSchema = z.object(baseFieldShape)
type EditFieldValues = z.infer<typeof EditFieldSchema>

function emptyOptions(options?: string[] | null): { value: string }[] {
  return options && options.length > 0 ? options.map((v) => ({ value: v })) : [{ value: '' }]
}

interface EditDialogProps {
  field: CustomField
  onClose: () => void
}

function EditFieldDialog({ field, onClose }: EditDialogProps) {
  const update = useUpdateCustomField()
  const [error, setError] = useState<string | null>(null)

  const form = useForm<EditFieldValues>({
    resolver: zodResolver(EditFieldSchema),
    defaultValues: {
      label: field.label,
      fieldType: field.fieldType,
      options: emptyOptions(field.options),
      displayOrder: field.displayOrder as unknown as number,
    },
  })
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = form
  const { fields: optionFields, append, remove } = useFieldArray({ control, name: 'options' })
  const fieldType = watch('fieldType')

  async function onSubmit(values: EditFieldValues): Promise<void> {
    setError(null)
    try {
      await update.mutateAsync({
        id: field.id,
        input: {
          label: values.label.trim(),
          fieldType: values.fieldType,
          displayOrder: values.displayOrder,
          options:
            values.fieldType === 'select'
              ? values.options.map((o) => o.value.trim()).filter(Boolean)
              : null,
        },
      })
      onClose()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar')
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
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-field-label">Etiqueta</Label>
            <Input
              id="edit-field-label"
              aria-invalid={!!errors.label}
              aria-describedby={errors.label ? 'edit-field-label-error' : undefined}
              {...register('label')}
            />
            {errors.label && (
              <p id="edit-field-label-error" className="text-sm text-destructive">
                {errors.label.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-field-key">
              Clave{' '}
              <span className="font-mono text-xs text-muted-foreground">(no editable)</span>
            </Label>
            <Input id="edit-field-key" value={field.key} disabled className="font-mono text-sm opacity-60" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-field-type">Tipo de campo</Label>
            <Controller
              control={control}
              name="fieldType"
              render={({ field: f }) => (
                <Select value={f.value} onValueChange={f.onChange}>
                  <SelectTrigger id="edit-field-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FIELD_TYPE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          {fieldType === 'select' && (
            <div className="space-y-2">
              <Label>Opciones</Label>
              {optionFields.map((opt, i) => (
                <div key={opt.id} className="flex gap-2">
                  <Input
                    className="flex-1"
                    {...register(`options.${i}.value`)}
                    placeholder={`Opción ${i + 1}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => (optionFields.length === 1 ? undefined : remove(i))}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Quitar opción"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={() => append({ value: '' })}>
                <Plus className="mr-1 h-4 w-4" />
                Opción
              </Button>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="edit-field-order">Orden de visualización</Label>
            <Input
              id="edit-field-order"
              type="number"
              min={0}
              aria-invalid={!!errors.displayOrder}
              aria-describedby={errors.displayOrder ? 'edit-field-order-error' : undefined}
              {...register('displayOrder')}
            />
            {errors.displayOrder && (
              <p id="edit-field-order-error" className="text-sm text-destructive">
                {errors.displayOrder.message}
              </p>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </div>
        </form>
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
  const [keyEdited, setKeyEdited] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const newFieldDefaults: NewFieldValues = {
    label: '',
    key: '',
    fieldType: 'text',
    options: [{ value: '' }],
    displayOrder: 0 as unknown as number,
  }

  const form = useForm<NewFieldValues>({
    resolver: zodResolver(NewFieldSchema),
    defaultValues: newFieldDefaults,
  })
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = form
  const { fields: optionFields, append, remove } = useFieldArray({ control, name: 'options' })
  const fieldType = watch('fieldType')

  async function saveNew(values: NewFieldValues): Promise<void> {
    setError(null)
    try {
      await create.mutateAsync({
        entityType: entity,
        key: values.key.trim(),
        label: values.label.trim(),
        fieldType: values.fieldType,
        displayOrder: values.displayOrder,
        ...(values.fieldType === 'select' && {
          options: values.options.map((o) => o.value.trim()).filter(Boolean),
        }),
      })
      reset(newFieldDefaults)
      setKeyEdited(false)
      setOpen(false)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo crear el campo')
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
          <form onSubmit={handleSubmit(saveNew)}>
            <CardContent className="space-y-4 p-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="new-field-label">Etiqueta</Label>
                  <Input
                    id="new-field-label"
                    placeholder="Ej: Presupuesto"
                    aria-invalid={!!errors.label}
                    aria-describedby={errors.label ? 'new-field-label-error' : undefined}
                    {...register('label', {
                      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                        if (!keyEdited) setValue('key', slugifyKey(e.target.value))
                      },
                    })}
                  />
                  {errors.label && (
                    <p id="new-field-label-error" className="text-[11px] text-destructive">
                      {errors.label.message}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-field-key">Clave (slug)</Label>
                  <Input
                    id="new-field-key"
                    placeholder="presupuesto"
                    className="font-mono text-sm"
                    aria-invalid={!!errors.key}
                    aria-describedby={errors.key ? 'new-field-key-error' : undefined}
                    {...register('key', { onChange: () => setKeyEdited(true) })}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Solo minúsculas, números y guion bajo. No se puede cambiar después.
                  </p>
                  {errors.key && (
                    <p id="new-field-key-error" className="text-[11px] text-destructive">
                      {errors.key.message}
                    </p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="new-field-type">Tipo de campo</Label>
                  <Controller
                    control={control}
                    name="fieldType"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="new-field-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(FIELD_TYPE_LABELS).map(([v, l]) => (
                            <SelectItem key={v} value={v}>{l}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-field-order">Orden de visualización</Label>
                  <Input
                    id="new-field-order"
                    type="number"
                    min={0}
                    aria-invalid={!!errors.displayOrder}
                    aria-describedby={errors.displayOrder ? 'new-field-order-error' : undefined}
                    {...register('displayOrder')}
                  />
                  {errors.displayOrder && (
                    <p id="new-field-order-error" className="text-[11px] text-destructive">
                      {errors.displayOrder.message}
                    </p>
                  )}
                </div>
              </div>
              {fieldType === 'select' && (
                <div className="space-y-2">
                  <Label>Opciones</Label>
                  {optionFields.map((opt, i) => (
                    <div key={opt.id} className="flex gap-2">
                      <Input
                        className="flex-1"
                        {...register(`options.${i}.value`)}
                        placeholder={`Opción ${i + 1}`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => (optionFields.length === 1 ? undefined : remove(i))}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Quitar opción"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="ghost" size="sm" onClick={() => append({ value: '' })}>
                    <Plus className="mr-1 h-4 w-4" />
                    Opción
                  </Button>
                </div>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Crear Campo
                </Button>
              </div>
            </CardContent>
          </form>
        </Card>
      )}

      {/* Edit dialog */}
      {editField && (
        <EditFieldDialog field={editField} onClose={() => setEditField(null)} />
      )}
    </div>
  )
}
