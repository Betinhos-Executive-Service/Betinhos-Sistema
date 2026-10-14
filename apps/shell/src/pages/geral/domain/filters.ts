import { formatMoney } from './format'
import { parse } from './fetch'
import type { AttributeInfo, AttributeMap, CellKind, LookupOption } from './types'

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

/** Filtro sem o valor que a operação exige: é ignorado na consulta e não vira chip. */
export function isEmptyFilter(f: Filter): boolean {
  switch (f.kind) {
    case 'text': return f.op === 'empty' || f.op === 'not-empty' ? false : !f.value?.trim()
    case 'choice': case 'lookup': return f.op === 'empty' ? false : !f.values?.length
    case 'date': return f.op === 'range' ? !isDay(f.from) && !isDay(f.to) : false
    case 'number':
      if (f.op === 'empty') return false
      return f.op === 'between' ? !isNum(f.value) || !isNum(f.to) : !isNum(f.value)
    case 'bool': return false
  }
}

function condition(doc: Document, attribute: string, operator: string, value?: string | number, values?: Array<string | number>) {
  const el = doc.createElement('condition')
  el.setAttribute('attribute', attribute)
  el.setAttribute('operator', operator)
  if (value !== undefined) el.setAttribute('value', String(value))
  for (const item of values ?? []) {
    const child = doc.createElement('value')
    child.textContent = String(item)
    el.appendChild(child)
  }
  return el
}

/** `%`, `_` e `[` são curingas do `like`: escapados entre colchetes. */
const escapeLike = (text: string) => text.replace(/[%_[]/g, (m) => `[${m}]`)

function conditionsFor(doc: Document, attribute: string, f: Filter): Element[] {
  const c = (operator: string, value?: string | number) => condition(doc, attribute, operator, value)
  switch (f.kind) {
    case 'text': {
      const value = (f.value ?? '').trim()
      switch (f.op) {
        case 'contains': return [c('like', `%${escapeLike(value)}%`)]
        case 'not-contains': return [c('not-like', `%${escapeLike(value)}%`)]
        case 'begins': return [c('like', `${escapeLike(value)}%`)]
        case 'eq': return [c('eq', value)]
        case 'empty': return [c('null')]
        case 'not-empty': return [c('not-null')]
      }
      return []
    }
    case 'choice': return f.op === 'empty' ? [c('null')] : [condition(doc, attribute, 'in', undefined, f.values)]
    case 'lookup': return f.op === 'empty' ? [c('null')] : [condition(doc, attribute, 'in', undefined, f.values?.map((v) => v.id))]
    case 'date':
      switch (f.op) {
        case 'today': case 'tomorrow': case 'yesterday': case 'this-week': case 'this-month': return [c(f.op)]
        case 'next-7': return [c('next-x-days', 7)]
        case 'last-7': return [c('last-x-days', 7)]
        case 'empty': return [c('null')]
        case 'range': return [...(isDay(f.from) ? [c('on-or-after', f.from)] : []), ...(isDay(f.to) ? [c('on-or-before', f.to)] : [])]
      }
      return []
    case 'number':
      switch (f.op) {
        case 'eq': case 'ge': case 'le': return [c(f.op, f.value)]
        case 'between': return [c('ge', f.value), c('le', f.to)]
        case 'empty': return [c('null')]
      }
      return []
    case 'bool': return [c('eq', f.op === 'yes' ? 1 : 0)]
  }
}

/**
 * FetchXML da visão com os filtros por coluna num `<filter type="and">` próprio, último filho da entidade.
 * Recebe sempre o FetchXML da visão (nunca o já injetado). Filtros vazios e de atributos fora do mapa são ignorados.
 */
export function injectFilters(fetchxml: string, filters: FilterSet, attributes: AttributeMap): string {
  const { doc, entity } = parse(fetchxml)
  const conditions = Object.entries(filters)
    .filter(([attribute, f]) => attributes.has(attribute) && !isEmptyFilter(f))
    .flatMap(([attribute, f]) => conditionsFor(doc, attribute, f))
  if (conditions.length) {
    const filter = doc.createElement('filter')
    filter.setAttribute('type', 'and')
    for (const item of conditions) filter.appendChild(item)
    entity.appendChild(filter)
  }
  return new XMLSerializer().serializeToString(doc)
}

const brDate = (day: string | undefined) => (day ? day.split('-').reverse().join('/') : '')
const NUMBER = new Intl.NumberFormat('pt-BR')

/** Texto do chip do filtro: `Rótulo: descrição`. */
export function describeFilter(attribute: string, f: Filter, info: AttributeInfo | undefined): string {
  return `${info?.label || attribute}: ${describeValue(f, info)}`
}

function describeValue(f: Filter, info: AttributeInfo | undefined): string {
  switch (f.kind) {
    case 'text':
      switch (f.op) {
        case 'contains': return `contém ${f.value ?? ''}`
        case 'not-contains': return `não contém ${f.value ?? ''}`
        case 'eq': return `igual a ${f.value ?? ''}`
        case 'begins': return `começa com ${f.value ?? ''}`
        case 'empty': return 'vazio'
        case 'not-empty': return 'preenchido'
      }
      return ''
    case 'choice':
      if (f.op === 'empty') return 'vazio'
      return (f.values ?? []).map((v) => info?.options.find((o) => o.value === v)?.label ?? String(v)).join(', ')
    case 'lookup':
      return f.op === 'empty' ? 'vazio' : (f.values ?? []).map((v) => v.nome).join(', ')
    case 'date':
      switch (f.op) {
        case 'today': return 'hoje'
        case 'tomorrow': return 'amanhã'
        case 'yesterday': return 'ontem'
        case 'this-week': return 'esta semana'
        case 'next-7': return 'próximos 7 dias'
        case 'last-7': return 'últimos 7 dias'
        case 'this-month': return 'este mês'
        case 'empty': return 'vazio'
        case 'range':
          if (isDay(f.from) && isDay(f.to)) return `de ${brDate(f.from)} a ${brDate(f.to)}`
          return isDay(f.from) ? `a partir de ${brDate(f.from)}` : `até ${brDate(f.to)}`
      }
      return ''
    case 'number': {
      const show = (n: number | undefined) => (info?.type === 'Money' ? formatMoney(n ?? null) : n == null ? '—' : NUMBER.format(n))
      switch (f.op) {
        case 'eq': return `= ${show(f.value)}`
        case 'ge': return `≥ ${show(f.value)}`
        case 'le': return `≤ ${show(f.value)}`
        case 'between': return `entre ${show(f.value)} e ${show(f.to)}`
        case 'empty': return 'vazio'
      }
      return ''
    }
    case 'bool': {
      const want = f.op === 'yes' ? 1 : 0
      return info?.options.find((o) => o.value === want)?.label ?? (f.op === 'yes' ? 'Sim' : 'Não')
    }
  }
}

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
