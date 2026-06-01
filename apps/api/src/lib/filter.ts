import {
  and,
  or,
  eq,
  ne,
  ilike,
  gt,
  gte,
  lt,
  lte,
  inArray,
  isNull,
  isNotNull,
  type SQL,
  type AnyColumn,
} from 'drizzle-orm'
import { z } from 'zod'
import { Errors } from './errors'

/**
 * Motor de filtros (filterBranch) seguro.
 * Las condiciones SOLO pueden referirse a campos de una whitelist (FieldMap),
 * y cada campo restringe qué operadores acepta. Nunca se interpola un nombre
 * de columna ni un operador provenientes del request.
 */
export type FieldKind = 'text' | 'number' | 'enum' | 'date'
export interface FieldDef {
  column: AnyColumn
  kind: FieldKind
}
export type FieldMap = Record<string, FieldDef>

const ConditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(['eq', 'neq', 'contains', 'gt', 'gte', 'lt', 'lte', 'in', 'is_null', 'is_not_null']),
  value: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()])), z.null()])
    .optional(),
})
type Condition = z.infer<typeof ConditionSchema>

export type FilterNode = { and: FilterNode[] } | { or: FilterNode[] } | Condition

export const FilterNodeSchema: z.ZodType<FilterNode> = z.lazy(() =>
  z.union([
    z.object({ and: z.array(FilterNodeSchema) }),
    z.object({ or: z.array(FilterNodeSchema) }),
    ConditionSchema,
  ]),
)

export const SearchBodySchema = z.object({
  filter: FilterNodeSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
})
export type SearchBody = z.infer<typeof SearchBodySchema>

const OPERATORS_BY_KIND: Record<FieldKind, ReadonlySet<Condition['operator']>> = {
  text: new Set(['eq', 'neq', 'contains', 'is_null', 'is_not_null']),
  number: new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is_null', 'is_not_null']),
  date: new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is_null', 'is_not_null']),
  enum: new Set(['eq', 'neq', 'in', 'is_null', 'is_not_null']),
}

function coerce(kind: FieldKind, value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (kind === 'number') {
    const n = Number(value)
    if (Number.isNaN(n)) throw Errors.badRequest('Valor numérico inválido')
    return n
  }
  if (kind === 'date') {
    const d = new Date(value as string)
    if (Number.isNaN(d.getTime())) throw Errors.badRequest('Fecha inválida')
    return value // se pasa como string; Postgres castea a date/timestamptz en la comparación
  }
  return value
}

function compileCondition(c: Condition, fields: FieldMap): SQL {
  const def = fields[c.field]
  if (!def) throw Errors.badRequest(`Campo no permitido: ${c.field}`)
  if (!OPERATORS_BY_KIND[def.kind].has(c.operator)) {
    throw Errors.badRequest(`Operador "${c.operator}" no válido para "${c.field}"`)
  }
  const col = def.column
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = coerce(def.kind, c.value) as any

  switch (c.operator) {
    case 'is_null':
      return isNull(col)
    case 'is_not_null':
      return isNotNull(col)
    case 'contains':
      return ilike(col, `%${String(c.value ?? '')}%`)
    case 'in':
      if (!Array.isArray(c.value)) throw Errors.badRequest('El operador "in" requiere un array')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return inArray(col, c.value.map((x) => coerce(def.kind, x)) as any[])
    case 'eq':
      return eq(col, v)
    case 'neq':
      return ne(col, v)
    case 'gt':
      return gt(col, v)
    case 'gte':
      return gte(col, v)
    case 'lt':
      return lt(col, v)
    case 'lte':
      return lte(col, v)
    default:
      throw Errors.badRequest('Operador desconocido')
  }
}

/** Compila un filterBranch a una condición SQL de Drizzle (o undefined si vacío). */
export function buildFilter(node: FilterNode, fields: FieldMap): SQL | undefined {
  if ('and' in node) {
    const parts = node.and.map((n) => buildFilter(n, fields)).filter((x): x is SQL => Boolean(x))
    return parts.length > 0 ? and(...parts) : undefined
  }
  if ('or' in node) {
    const parts = node.or.map((n) => buildFilter(n, fields)).filter((x): x is SQL => Boolean(x))
    return parts.length > 0 ? or(...parts) : undefined
  }
  return compileCondition(node, fields)
}
