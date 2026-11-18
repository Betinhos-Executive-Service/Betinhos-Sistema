import { conditionProblem, emptyFilters, readFilters, type FilterCondition, type FilterField, type FilterLocked, type TableFilters } from '@betinhos/ui'

/**
 * Filtros que já vêm no FetchXML de uma visão do Dataverse (savedquery/userquery) vistos pelo painel "Filtros" do
 * Design System: o que a tela sabe ler vira condição editável (e sai do FetchXML base, para não valer duas vezes);
 * o resto continua no FetchXML e aparece só para leitura, com rótulo legível.
 */

const OPERATORS: Record<string, string> = {
  eq: 'igual a', ne: 'diferente de', in: 'é um de', 'not-in': 'não é nenhum de', between: 'entre', like: 'contém', 'not-like': 'não contém',
  'begins-with': 'começa com', 'not-begins-with': 'não começa com', 'ends-with': 'termina com', 'not-ends-with': 'não termina com',
  gt: 'maior que', ge: 'maior ou igual a', lt: 'menor que', le: 'menor ou igual a', null: 'está vazio', 'not-null': 'está preenchido',
  on: 'em', 'on-or-after': 'a partir de', 'on-or-before': 'até', today: 'hoje', tomorrow: 'amanhã', yesterday: 'ontem', 'this-week': 'esta semana',
  'this-month': 'este mês', 'last-month': 'mês passado', 'next-x-days': 'nos próximos dias', 'last-x-days': 'nos últimos dias',
  'this-year': 'este ano', 'last-year': 'ano passado', 'last-week': 'semana passada', 'next-week': 'próxima semana', 'next-month': 'próximo mês',
  'eq-userid': 'sou eu', 'ne-userid': 'não sou eu', 'eq-businessid': 'é a minha empresa', above: 'acima de', under: 'abaixo de',
}
export const operatorLabel = (operator: string) => OPERATORS[operator] ?? operator.replace(/-/g, ' ')

/** Motivo do "só leitura" no painel de filtros. */
export const LOCKED_REASON = "Condição da visão que esta tela não sabe editar. Ela continua valendo; para mudar, edite a visão no Dynamics ou use 'Salvar como'."

export const lockedSentence = (field: string, operator: string, value: string) => [field, operatorLabel(operator), value].filter(Boolean).join(' ')

/** Rótulo de um atributo que não é campo filtrável (ex.: tipo sem filtro na tela). `undefined` = sem nome conhecido. */
export type AttributeLabel = (attribute: string) => string | undefined

export type ViewFetchFilters = {
  /** FetchXML da visão sem as condições que viraram `filters`. */
  base: string
  /** Condições que a tela sabe editar (rápidos por campo; repetidas no grupo avançado). */
  filters: TableFilters
  /** O que ficou no FetchXML: itens só leitura, sem ×. */
  locked: FilterLocked[]
}

const DATE_PRESETS = new Set(['today', 'tomorrow', 'yesterday', 'this-week', 'this-month', 'last-month'])
const GUID = /^\{?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\}?$/i
const DAY = /^(\d{4}-\d{2}-\d{2})(?:[T ].*)?$/

const children = (el: Element) => Array.from(el.children)
const valuesOf = (el: Element) => children(el).filter((c) => c.tagName === 'value')
const guid = (text: string) => GUID.exec(text.trim())?.[1].toLowerCase() ?? null

function addDays(day: string, days: number) {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Texto de `like` sem curingas no meio: devolve o texto literal ou `null` (curinga que a tela não representa). */
function likeText(raw: string): string | null {
  // Ímpares = caracteres escapados (`[%]`, `[_]`, `[[]`); curinga solto nos pares a tela não representa.
  const parts = raw.split(/\[([%_[])\]/)
  return parts.some((part, i) => i % 2 === 0 && /[%_[\]]/.test(part)) ? null : parts.join('')
}

/** Uma `<condition>` do FetchXML como condição do painel; `null` quando a tela não sabe representá-la. */
export function readFetchCondition(el: Element, field: FilterField): FilterCondition | null {
  if (el.getAttribute('entityname') || el.getAttribute('valueof')) return null
  const operator = el.getAttribute('operator') ?? ''
  const value = el.getAttribute('value')
  const list = valuesOf(el)
  const base = { type: 'condition' as const, id: `visao-${field.key}`, field: field.key }
  const empty = operator === 'null' ? 'empty' : operator === 'not-null' ? 'not-empty' : null

  switch (field.kind) {
    case 'text': {
      if (empty) return { ...base, op: empty }
      if (value == null) return null
      if (operator === 'eq' || operator === 'ne') return { ...base, op: operator, value }
      if (operator !== 'like' && operator !== 'not-like') return null
      const contains = value.length > 1 && value.startsWith('%') && value.endsWith('%')
      if (contains) {
        const text = likeText(value.slice(1, -1))
        return text ? { ...base, op: operator === 'like' ? 'contains' : 'not-contains', value: text } : null
      }
      if (operator !== 'like') return null
      const begins = value.endsWith('%') ? likeText(value.slice(0, -1)) : null
      if (begins) return { ...base, op: 'begins', value: begins }
      const ends = value.startsWith('%') ? likeText(value.slice(1)) : null
      return ends ? { ...base, op: 'ends', value: ends } : null
    }
    case 'choice': case 'lookup': {
      if (empty) return { ...base, op: empty }
      const items = operator === 'eq' || operator === 'ne' ? (value != null ? [{ text: value, name: el.getAttribute('uiname') }] : [])
        : operator === 'in' || operator === 'not-in' ? list.map((v) => ({ text: v.textContent ?? '', name: v.getAttribute('uiname') }))
          : []
      if (!items.length) return null
      const values = items.map(({ text, name }) => {
        if (field.kind === 'lookup') {
          const id = guid(text)
          return id ? { value: id, label: name || id } : null
        }
        const option = field.options?.find((o) => o.value === text.trim())
        return option ? { value: option.value, label: option.label } : null
      })
      if (values.some((v) => !v)) return null
      return { ...base, op: operator === 'eq' || operator === 'in' ? 'in' : 'not-in', values: values as Array<{ value: string; label: string }> }
    }
    case 'date': {
      if (empty) return { ...base, op: empty }
      if (DATE_PRESETS.has(operator)) return { ...base, op: operator as FilterCondition['op'] }
      if ((operator === 'next-x-days' || operator === 'last-x-days') && value === '7') return { ...base, op: operator === 'next-x-days' ? 'next-7' : 'last-7' }
      const day = value != null ? DAY.exec(value.trim())?.[1] : undefined
      if (!day) return null
      if (operator === 'on') return { ...base, op: 'on', value: day }
      // "antes de" é `lt`; "depois de" (exclui o dia) é `on-or-after` do dia seguinte. Os dois `on-or-…` são o mesmo intervalo em dias.
      if (operator === 'lt' && day === value?.trim()) return { ...base, op: 'before', value: day }
      if (operator === 'on-or-before') return { ...base, op: 'before', value: addDays(day, 1) }
      if (operator === 'on-or-after') return { ...base, op: 'after', value: addDays(day, -1) }
      return null
    }
    case 'number': {
      if (operator === 'null') return { ...base, op: 'empty' }
      const n = value != null && value.trim() !== '' ? Number(value) : NaN
      return ['eq', 'ne', 'gt', 'ge', 'lt', 'le'].includes(operator) && Number.isFinite(n) ? { ...base, op: operator as FilterCondition['op'], value: n } : null
    }
    case 'bool': {
      if (operator !== 'eq' && operator !== 'ne') return null
      const yes = value === '1' || value === 'true' ? true : value === '0' || value === 'false' ? false : null
      if (yes == null) return null
      return { ...base, op: yes === (operator === 'eq') ? 'yes' : 'no' }
    }
  }
}

/** Valor de uma condição só leitura já com nome: lookup pelo `uiname`, escolha pela opção, data em dd/mm/aaaa. */
function describeValue(el: Element, field: FilterField | undefined): string {
  const raw = el.getAttribute('value') != null ? [{ text: el.getAttribute('value') as string, name: el.getAttribute('uiname') }] : valuesOf(el).map((v) => ({ text: v.textContent ?? '', name: v.getAttribute('uiname') }))
  const operator = el.getAttribute('operator') ?? ''
  const state = el.getAttribute('attribute') === 'statecode'
  const shown = raw.map(({ text, name }) => {
    if (name) return name
    // Estado padrão das tabelas personalizadas do Dataverse (as opções de `State` não vêm na metadata da tela).
    if (state && (text === '0' || text === '1')) return text === '0' ? 'Ativo' : 'Inativo'
    const option = field?.options?.find((o) => o.value === text.trim())
    if (option) return option.label
    const day = DAY.exec(text.trim())?.[1]
    if (day) return day.split('-').reverse().join('/')
    if (guid(text)) return 'registro selecionado'
    if (operator.includes('like')) return `"${text.replace(/%/g, '…')}"`
    return text
  })
  return shown.join(operator === 'between' ? ' e ' : ', ')
}

function describeCondition(el: Element, fieldOf: (attribute: string) => FilterField | undefined, labelOf: AttributeLabel, linked: boolean): string {
  const attribute = el.getAttribute('attribute') ?? ''
  const field = linked ? undefined : fieldOf(attribute)
  const name = linked ? 'Campo de tabela relacionada' : field?.label ?? labelOf(attribute) ?? 'Campo da visão'
  return lockedSentence(name, el.getAttribute('operator') ?? 'condição', describeValue(el, field))
}

function describeFilter(filter: Element, describe: (el: Element) => string): string {
  const parts = children(filter).flatMap((child) => (child.tagName === 'condition' ? [describe(child)] : child.tagName === 'filter' ? [`(${describeFilter(child, describe)})`] : []))
  return `${filter.getAttribute('type') === 'or' ? 'uma destas' : 'todas estas'}: ${parts.join('; ')}`
}

const isAnd = (filter: Element) => (filter.getAttribute('type') ?? 'and') === 'and'

/**
 * Separa os filtros da entidade raiz do FetchXML da visão. Só condições diretas de um `<filter>` E da raiz viram
 * editáveis (somam por E com o resto, então tirá-las do FetchXML e reinjetá-las dá o mesmo resultado); filtro OU,
 * aninhado e de `link-entity` ficam no FetchXML como só leitura. O filtro de localização rápida fica intacto e calado.
 */
export function splitViewFilters(fetchxml: string, fields: FilterField[], labelOf: AttributeLabel = () => undefined): ViewFetchFilters {
  const untouched: ViewFetchFilters = { base: fetchxml, filters: emptyFilters(), locked: [] }
  const doc = new DOMParser().parseFromString(fetchxml, 'text/xml')
  const entity = doc.documentElement?.tagName === 'fetch' ? children(doc.documentElement).find((c) => c.tagName === 'entity') : undefined
  if (!entity || doc.getElementsByTagName('parsererror').length) return untouched

  const byKey = new Map(fields.map((f) => [f.attribute ?? f.key, f]))
  const fieldOf = (attribute: string) => byKey.get(attribute)
  const rootDescribe = (el: Element) => describeCondition(el, fieldOf, labelOf, false)
  const linkDescribe = (el: Element) => describeCondition(el, fieldOf, labelOf, true)

  const filters = emptyFilters()
  const labels: string[] = []
  let changed = false
  for (const filter of children(entity).filter((c) => c.tagName === 'filter' && c.getAttribute('isquickfindfields') !== '1')) {
    if (!isAnd(filter)) { labels.push(describeFilter(filter, rootDescribe)); continue }
    for (const child of children(filter)) {
      if (child.tagName === 'filter') { labels.push(describeFilter(child, rootDescribe)); continue }
      if (child.tagName !== 'condition') continue
      const field = fieldOf(child.getAttribute('attribute') ?? '')
      const read = field ? readFetchCondition(child, field) : null
      const condition = read && !conditionProblem(read, field) ? read : null
      if (!condition) { labels.push(rootDescribe(child)); continue }
      if (filters.quick[condition.field]) filters.advanced.items.push({ ...condition, id: `${condition.id}-${filters.advanced.items.length + 1}` })
      else filters.quick[condition.field] = condition
      child.remove()
      changed = true
    }
    if (!children(filter).length) filter.remove()
  }
  for (const link of Array.from(entity.querySelectorAll('link-entity'))) {
    for (const filter of children(link).filter((c) => c.tagName === 'filter')) labels.push(describeFilter(filter, linkDescribe))
  }

  return {
    base: changed ? new XMLSerializer().serializeToString(doc) : fetchxml,
    // Conferidos como os de qualquer outra origem: o que o painel não aceitaria nem chega a sair do FetchXML.
    filters: readFilters(filters, fields),
    locked: labels.map((label, index) => ({ id: `n:${index}`, label, reason: LOCKED_REASON, removable: false })),
  }
}
