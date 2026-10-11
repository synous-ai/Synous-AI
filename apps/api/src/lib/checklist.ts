import { z } from 'zod'
import type { ChecklistStep } from '../db/schema'

/**
 * Checklist de una tarea / tarea de proceso:
 * [{ text, done?, children?: [{ text, done? }] }] — un nivel de anidación.
 */
const ChecklistChildSchema = z.object({
  text: z.string().trim().min(1).max(500),
  done: z.boolean().optional(),
})

export const ChecklistStepSchema = z.object({
  text: z.string().trim().min(1).max(500),
  done: z.boolean().optional(),
  children: z.array(ChecklistChildSchema).max(50).optional(),
})

export const ChecklistStepsSchema = z.array(ChecklistStepSchema).max(100)

/** Normaliza una checklist: toda marca `done` vuelve a false (copias de plantilla / duplicados). */
export function resetChecklist(steps: readonly ChecklistStep[]): ChecklistStep[] {
  return steps.map((s) => ({
    text: s.text,
    done: false,
    ...(s.children ? { children: s.children.map((c) => ({ text: c.text, done: false })) } : {}),
  }))
}

/** Normaliza una checklist entrante: `done` siempre presente (default false). */
export function normalizeChecklist(steps: readonly ChecklistStep[]): ChecklistStep[] {
  return steps.map((s) => ({
    text: s.text,
    done: s.done ?? false,
    ...(s.children ? { children: s.children.map((c) => ({ text: c.text, done: c.done ?? false })) } : {}),
  }))
}
