'use client'

import { useState } from 'react'
import { Plus, Loader2, Trash2, ClipboardList } from 'lucide-react'
import { useIntakeForms, useCreateIntakeForm } from '@/lib/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'

const FIELD_TYPES = ['text', 'textarea', 'email', 'number', 'date', 'file']

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

export function FormulariosSection() {
  const { data, isLoading } = useIntakeForms()
  const create = useCreateIntakeForm()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [rows, setRows] = useState<{ label: string; type: string }[]>([{ label: '', type: 'text' }])
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setError(null)
    if (!name.trim()) return
    const fields = rows
      .filter((r) => r.label.trim())
      .map((r) => ({ name: slugifyField(r.label), label: r.label.trim(), type: r.type }))
    try {
      await create.mutateAsync({ name: name.trim(), description: description.trim() || undefined, fields })
      setName('')
      setDescription('')
      setRows([{ label: '', type: 'text' }])
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen((o) => !o)}>
          {open ? 'Cancelar' : (
            <>
              <Plus className="mr-1.5 h-4 w-4" />
              Nuevo Formulario
            </>
          )}
        </Button>
      </div>

      {open && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Branding" />
            </div>
            <div className="space-y-1.5">
              <Label>Descripción (opcional)</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Para qué sirve este formulario"
              />
            </div>
            <div className="space-y-2">
              <Label>Campos</Label>
              {rows.map((row, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    className="flex-1"
                    value={row.label}
                    onChange={(e) =>
                      setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, label: e.target.value } : r)))
                    }
                    placeholder="Etiqueta del campo"
                  />
                  <Select
                    value={row.type}
                    onValueChange={(v) =>
                      setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, type: v } : r)))
                    }
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
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setRows((rs) => (rs.length === 1 ? rs : rs.filter((_, idx) => idx !== i)))}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Quitar campo"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRows((rs) => [...rs, { label: '', type: 'text' }])}
              >
                <Plus className="mr-1 h-4 w-4" />
                Campo
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div>
              <Button size="sm" onClick={save} disabled={!name.trim() || create.isPending}>
                {create.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Guardar formulario
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando…
            </div>
          ) : (data ?? []).length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyIllustration icon={ClipboardList} />
                <EmptyTitle>Sin Formularios de Intake Todavía</EmptyTitle>
                <EmptyDescription>Creá el primero con el formulario de arriba.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="divide-y">
              {(data ?? []).map((f) => (
                <li key={f.id} className="flex items-start justify-between px-4 py-4">
                  <div className="space-y-0.5">
                    <p className="font-semibold">{f.name}</p>
                    {f.description && <p className="text-sm text-muted-foreground">{f.description}</p>}
                    <p className="font-mono text-xs text-muted-foreground">
                      /{f.slug} &middot; {f.fields.length} campo{f.fields.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {f.fields.slice(0, 4).map((field) => (
                      <span
                        key={field.name}
                        className="rounded-full border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                      >
                        {field.label}
                      </span>
                    ))}
                    {f.fields.length > 4 && (
                      <span className="rounded-full border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        +{f.fields.length - 4}
                      </span>
                    )}
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
