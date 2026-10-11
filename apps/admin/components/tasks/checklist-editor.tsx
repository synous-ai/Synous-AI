'use client'

import { useEffect, useState } from 'react'
import { CornerDownRight, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { checklistProgress, percent } from '@/lib/projects'
import type { ChecklistStep } from '@/lib/types'

/**
 * Editor de checklist con un nivel de anidación (pasos + sub-pasos).
 * Controlado: cada cambio devuelve el array completo por `onChange` y el padre
 * decide cuándo persistir. `showDone=false` oculta checkboxes y progreso
 * (plantillas de proceso: el `done` no tiene sentido ahí).
 */
export function ChecklistEditor({
  steps,
  onChange,
  showDone = true,
  disabled = false,
}: {
  steps: readonly ChecklistStep[]
  onChange: (next: ChecklistStep[]) => void
  showDone?: boolean
  disabled?: boolean
}): React.JSX.Element {
  const { done, total } = checklistProgress(steps)
  const pct = percent(done, total)
  const [addingChildOf, setAddingChildOf] = useState<number | null>(null)

  function updateStep(i: number, patch: Partial<ChecklistStep>): void {
    onChange(steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }
  function removeStep(i: number): void {
    onChange(steps.filter((_, idx) => idx !== i))
  }
  function addStep(text: string): void {
    onChange([...steps, { text, done: false }])
  }
  function updateChild(i: number, j: number, patch: { text?: string; done?: boolean }): void {
    onChange(
      steps.map((s, idx) =>
        idx === i ? { ...s, children: (s.children ?? []).map((c, cj) => (cj === j ? { ...c, ...patch } : c)) } : s,
      ),
    )
  }
  function removeChild(i: number, j: number): void {
    onChange(
      steps.map((s, idx) => {
        if (idx !== i) return s
        const children = (s.children ?? []).filter((_, cj) => cj !== j)
        // Sin hijos, quitamos la clave para no persistir `children: []`.
        const { children: _drop, ...rest } = s
        void _drop
        return children.length > 0 ? { ...rest, children } : rest
      }),
    )
  }
  function addChild(i: number, text: string): void {
    onChange(
      steps.map((s, idx) =>
        idx === i ? { ...s, children: [...(s.children ?? []), { text, done: false }] } : s,
      ),
    )
  }

  return (
    <div className="space-y-3">
      {showDone && total > 0 && (
        <div className="flex items-center gap-3">
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label="Progreso del checklist"
          >
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            {done}/{total}
          </span>
        </div>
      )}

      {steps.length === 0 && <p className="text-sm text-muted-foreground">Sin pasos todavía.</p>}

      <ul className="space-y-1">
        {steps.map((step, i) => (
          <li key={i}>
            <StepRow
              text={step.text}
              done={!!step.done}
              showDone={showDone}
              disabled={disabled}
              onToggle={(v) => updateStep(i, { done: v })}
              onText={(t) => updateStep(i, { text: t })}
              onRemove={() => removeStep(i)}
              extra={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground"
                  disabled={disabled}
                  aria-label={`Agregar sub-paso a "${step.text}"`}
                  onClick={() => setAddingChildOf(addingChildOf === i ? null : i)}
                >
                  <CornerDownRight className="h-3.5 w-3.5" />
                </Button>
              }
            />
            {((step.children?.length ?? 0) > 0 || addingChildOf === i) && (
              <ul className="ml-7 mt-1 space-y-1 border-l pl-3">
                {(step.children ?? []).map((c, j) => (
                  <li key={j}>
                    <StepRow
                      text={c.text}
                      done={!!c.done}
                      showDone={showDone}
                      disabled={disabled}
                      onToggle={(v) => updateChild(i, j, { done: v })}
                      onText={(t) => updateChild(i, j, { text: t })}
                      onRemove={() => removeChild(i, j)}
                    />
                  </li>
                ))}
                {addingChildOf === i && (
                  <li>
                    <AddRow
                      placeholder="Nuevo sub-paso…"
                      disabled={disabled}
                      autoFocus
                      onAdd={(t) => addChild(i, t)}
                      onCancel={() => setAddingChildOf(null)}
                    />
                  </li>
                )}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <AddRow placeholder="Agregar paso…" disabled={disabled} onAdd={addStep} />
    </div>
  )
}

function StepRow({
  text,
  done,
  showDone,
  disabled,
  onToggle,
  onText,
  onRemove,
  extra,
}: {
  text: string
  done: boolean
  showDone: boolean
  disabled: boolean
  onToggle: (done: boolean) => void
  onText: (text: string) => void
  onRemove: () => void
  extra?: React.ReactNode
}): React.JSX.Element {
  const [draft, setDraft] = useState(text)
  useEffect(() => setDraft(text), [text])

  function commit(): void {
    const t = draft.trim()
    if (!t) {
      setDraft(text) // un paso no puede quedar vacío: se revierte
      return
    }
    if (t !== text) onText(t)
  }

  return (
    <div className="group flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-muted/50">
      {showDone && (
        <Checkbox
          checked={done}
          disabled={disabled}
          onCheckedChange={(c) => onToggle(c === true)}
          aria-label={`Marcar "${text}" como ${done ? 'pendiente' : 'hecho'}`}
        />
      )}
      <input
        value={draft}
        disabled={disabled}
        maxLength={500}
        aria-label="Texto del paso"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setDraft(text)
            e.currentTarget.blur()
          }
        }}
        className={cn(
          'min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring',
          showDone && done && 'text-muted-foreground line-through',
        )}
      />
      <div className="flex items-center opacity-100 sm:opacity-0 sm:transition-opacity sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
        {extra}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          disabled={disabled}
          aria-label={`Quitar "${text}"`}
          onClick={onRemove}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

function AddRow({
  placeholder,
  disabled,
  autoFocus = false,
  onAdd,
  onCancel,
}: {
  placeholder: string
  disabled: boolean
  autoFocus?: boolean
  onAdd: (text: string) => void
  onCancel?: () => void
}): React.JSX.Element {
  const [value, setValue] = useState('')

  function submit(): void {
    const t = value.trim()
    if (!t) return
    onAdd(t)
    setValue('')
  }

  return (
    <div className="flex items-center gap-2">
      <Plus className="ml-1 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      <input
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        maxLength={500}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            submit()
          }
          if (e.key === 'Escape') onCancel?.()
        }}
        onBlur={() => {
          if (value.trim()) submit()
          else onCancel?.()
        }}
        className="min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
      />
    </div>
  )
}
