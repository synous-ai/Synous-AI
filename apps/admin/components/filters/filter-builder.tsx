'use client'

import { useState } from 'react'
import { Plus, X, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface FilterField {
  field: string
  label: string
  kind: 'text' | 'enum' | 'number'
  options?: { value: string; label: string }[]
}

interface Row {
  field: string
  operator: string
  value: string
}

const OPERATORS: Record<FilterField['kind'], { value: string; label: string }[]> = {
  text: [
    { value: 'contains', label: 'contiene' },
    { value: 'eq', label: 'es igual a' },
    { value: 'neq', label: 'es distinto de' },
  ],
  enum: [
    { value: 'eq', label: 'es' },
    { value: 'neq', label: 'no es' },
  ],
  number: [
    { value: 'eq', label: '=' },
    { value: 'gt', label: '>' },
    { value: 'gte', label: '≥' },
    { value: 'lt', label: '<' },
    { value: 'lte', label: '≤' },
  ],
}

export function FilterBuilder({ fields, onApply }: { fields: FilterField[]; onApply: (filter: unknown | null) => void }) {
  const first = fields[0]!
  const emptyRow = (): Row => ({ field: first.field, operator: OPERATORS[first.kind][0]!.value, value: '' })

  const [open, setOpen] = useState(false)
  const [combinator, setCombinator] = useState<'and' | 'or'>('and')
  const [rows, setRows] = useState<Row[]>([emptyRow()])

  const kindOf = (field: string) => fields.find((f) => f.field === field)?.kind ?? 'text'

  function setRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  function addRow() {
    setRows((rs) => [...rs, emptyRow()])
  }
  function removeRow(i: number) {
    setRows((rs) => (rs.length === 1 ? rs : rs.filter((_, idx) => idx !== i)))
  }

  function apply() {
    const conds = rows
      .filter((r) => r.value.trim() !== '')
      .map((r) => {
        const kind = kindOf(r.field)
        return { field: r.field, operator: r.operator, value: kind === 'number' ? Number(r.value) : r.value }
      })
    onApply(conds.length === 0 ? null : { [combinator]: conds })
  }

  function clear() {
    setRows([emptyRow()])
    onApply(null)
  }

  return (
    <div className="mb-4">
      <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
        <SlidersHorizontal className="h-3.5 w-3.5" /> {open ? 'Ocultar filtros' : 'Filtros'}
      </Button>

      {open && (
        <div className="mt-3 space-y-3 rounded-2xl border bg-card p-4 shadow-card">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            Coincidir con
            <Select value={combinator} onValueChange={(v) => setCombinator(v as 'and' | 'or')}>
              <SelectTrigger className="h-8 w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="and">TODAS (Y)</SelectItem>
                <SelectItem value="or">ALGUNA (O)</SelectItem>
              </SelectContent>
            </Select>
            las condiciones
          </div>

          {rows.map((r, i) => {
            const field = fields.find((f) => f.field === r.field)
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Select
                  value={r.field}
                  onValueChange={(f) => {
                    setRow(i, { field: f, operator: OPERATORS[kindOf(f)][0]!.value, value: '' })
                  }}
                >
                  <SelectTrigger className="h-9 w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {fields.map((f) => (
                      <SelectItem key={f.field} value={f.field}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={r.operator} onValueChange={(v) => setRow(i, { operator: v })}>
                  <SelectTrigger className="h-9 w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERATORS[kindOf(r.field)].map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {field?.kind === 'enum' && field.options ? (
                  <Select value={r.value} onValueChange={(v) => setRow(i, { value: v })}>
                    <SelectTrigger className="h-9 w-40">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    className="h-9 w-44"
                    type={field?.kind === 'number' ? 'number' : 'text'}
                    value={r.value}
                    onChange={(e) => setRow(i, { value: e.target.value })}
                    placeholder="valor"
                  />
                )}
                <Button variant="ghost" size="icon" onClick={() => removeRow(i)} className="h-9 w-9 text-muted-foreground hover:text-destructive" aria-label="Quitar condición">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )
          })}

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={addRow}>
              <Plus className="h-4 w-4" /> Condición
            </Button>
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={clear}>Limpiar</Button>
            <Button size="sm" onClick={apply}>Aplicar</Button>
          </div>
        </div>
      )}
    </div>
  )
}
