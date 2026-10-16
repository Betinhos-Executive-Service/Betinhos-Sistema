/**
 * Formato antigo dos filtros da Geral (um filtro por atributo, só E). A tela usa os filtros do Design System
 * (`domain/tableFilters.ts`); este formato fica só para abrir links compartilhados antes da troca e para o tipo de
 * filtro de cada célula (`filterKindFor`).
 */
import type { AttributeInfo, CellKind, LookupOption } from './types'

export type TextOp = 'contains' | 'not-contains' | 'eq' | 'begins' | 'empty' | 'not-empty'
export type ChoiceOp = 'in' | 'empty'
export type LookupOp = 'in' | 'empty'
export type DateOp = 'today' | 'tomorrow' | 'yesterday' | 'this-week' | 'next-7' | 'last-7' | 'this-month' | 'range' | 'empty'
export type NumberOp = 'eq' | 'ge' | 'le' | 'between' | 'empty'
export type BoolOp = 'yes' | 'no'

export type Filter =
  | { kind: 'text'; op: TextOp; value?: string }
  | { kind: 'choice'; op: ChoiceOp; values?: number[] }
  | { kind: 'lookup'; op: LookupOp; values?: LookupOption[] }
  | { kind: 'date'; op: DateOp; from?: string; to?: string }
  | { kind: 'number'; op: NumberOp; value?: number; to?: number }
  | { kind: 'bool'; op: BoolOp }

/** Chave = atributo lógico da raiz da visão. */
export type FilterSet = Record<string, Filter>

const OPS: { [K in Filter['kind']]: readonly string[] } = {
  text: ['contains', 'not-contains', 'eq', 'begins', 'empty', 'not-empty'],
  choice: ['in', 'empty'],
  lookup: ['in', 'empty'],
  date: ['today', 'tomorrow', 'yesterday', 'this-week', 'next-7', 'last-7', 'this-month', 'range', 'empty'],
  number: ['eq', 'ge', 'le', 'between', 'empty'],
  bool: ['yes', 'no'],
}

/** Tipo de filtro oferecido para a coluna; `null` quando a coluna não filtra. Campos somente leitura de texto (ex.: ID) filtram. */
export function filterKindFor(kind: CellKind, info: AttributeInfo | undefined): Filter['kind'] | null {
  switch (kind) {
    case 'text': case 'memo': return 'text'
    case 'choice': return 'choice'
    case 'lookup': return 'lookup'
    case 'datetime': return 'date'
    case 'money': return 'number'
    case 'boolean': return 'bool'
    default: return info?.type === 'String' || info?.type === 'Memo' ? 'text' : null
  }
}

const isDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
const isNum = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/** JSON compacto em base64url (UTF-8, sem `=`), para viajar na URL. */
export function encodeFilters(filters: FilterSet): string {
  const bytes = new TextEncoder().encode(JSON.stringify(filters))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function sanitize(raw: unknown): Filter | null {
  if (!raw || typeof raw !== 'object') return null
  const f = raw as Record<string, unknown>
  const kind = f.kind as Filter['kind']
  if (!(kind in OPS) || typeof f.op !== 'string' || !OPS[kind].includes(f.op)) return null
  const op = f.op
  switch (kind) {
    case 'text': return { kind, op: op as TextOp, ...(typeof f.value === 'string' ? { value: f.value } : {}) }
    case 'choice': return { kind, op: op as ChoiceOp, ...(Array.isArray(f.values) ? { values: f.values.filter(isNum) } : {}) }
    case 'lookup':
      return { kind, op: op as LookupOp, ...(Array.isArray(f.values) ? { values: f.values.flatMap((v) => (v && typeof v.id === 'string' && typeof v.nome === 'string' ? [{ id: v.id, nome: v.nome }] : [])) } : {}) }
    case 'date': return { kind, op: op as DateOp, ...(isDay(f.from) ? { from: f.from } : {}), ...(isDay(f.to) ? { to: f.to } : {}) }
    case 'number': return { kind, op: op as NumberOp, ...(isNum(f.value) ? { value: f.value } : {}), ...(isNum(f.to) ? { to: f.to } : {}) }
    case 'bool': return { kind, op: op as BoolOp }
  }
}

/** Inverso de `encodeFilters`; texto inválido vira `{}` e entradas malformadas são descartadas. */
export function decodeFilters(text: string): FilterSet {
  try {
    const base64 = text.trim().replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    const json: unknown = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))))
    if (!json || typeof json !== 'object' || Array.isArray(json)) return {}
    return Object.fromEntries(Object.entries(json).flatMap(([attribute, raw]) => {
      const f = sanitize(raw)
      return f ? [[attribute, f] as const] : []
    }))
  } catch {
    return {}
  }
}
