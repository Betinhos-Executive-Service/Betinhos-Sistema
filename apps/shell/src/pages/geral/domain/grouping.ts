import type { Row } from '@betinhos/dataverse'
import { EMPTY_GROUP_ID, GROUP_LIMIT, OTHERS_GROUP_ID, groupableFields, type FilterField, type FilterOption, type ViewGroup } from '@betinhos/ui'
import { COMPROVANTES_KEY } from './comprovantes'

/**
 * Agrupamento da Geral no servidor: quais campos agrupam, os baldes (valor + contagem real vinda do FetchXML agregado)
 * e a condição que abre um grupo. A ordem e o rótulo dos baldes seguem `groupRows` do Design System (§10.9.1).
 */

export type GroupBy = 'value' | 'month' | 'year'
export type GroupSpec = { attribute: string; kind: FilterField['kind']; by: GroupBy; options: FilterOption[] }
/** `exclude`: IDs dos grupos mostrados à parte; só o balde "Outros" da relação os usa. */
export type GroupBucket = { id: string; label: string; count: number; exclude?: string[] }
/** Um balde a abrir: o campo e o ID do balde (`''` = vazio, `OTHERS_GROUP_ID` = o resto da relação). */
export type GroupTarget = Pick<GroupSpec, 'attribute' | 'kind' | 'by'> & Pick<GroupBucket, 'id' | 'exclude'>

/** Apelidos das colunas do FetchXML agregado e as propriedades que a Web API devolve com eles. */
export const GROUP_VALUE = 'grupo'
export const GROUP_YEAR = 'grupo_ano'
export const GROUP_MONTH = 'grupo_mes'
export const GROUP_TOTAL = 'total'

const FORMATTED = '@OData.Community.Display.V1.FormattedValue'
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** Campos que a Geral agrupa no servidor (a coluna virtual Comprovantes não existe no FetchXML). */
export const groupFields = (fields: FilterField[]) => groupableFields(fields).filter((f) => f.key !== COMPROVANTES_KEY)

/** Campo e período do agrupamento da visão; `null` quando não há agrupamento ou a Geral não agrupa o campo. */
export function resolveGroup(group: ViewGroup | null | undefined, fields: FilterField[]): GroupSpec | null {
  const field = group ? groupFields(fields).find((f) => f.key === group.key) : undefined
  if (!group || !field) return null
  return { attribute: field.attribute ?? field.key, kind: field.kind, by: field.kind === 'date' ? (group.by ?? 'month') : 'value', options: field.options ?? [] }
}

export const sameViewGroup = (a: ViewGroup | null | undefined, b: ViewGroup | null | undefined) => (a?.key ?? null) === (b?.key ?? null) && (a?.by ?? null) === (b?.by ?? null)

function idOf(row: Row, spec: GroupSpec): string | null {
  if (spec.kind === 'date') {
    const year = row[GROUP_YEAR]
    if (year == null || year === '') return null
    if (spec.by === 'year') return String(year)
    const month = row[GROUP_MONTH]
    return month == null || month === '' ? null : `${year}-${String(month).padStart(2, '0')}`
  }
  const raw = row[GROUP_VALUE]
  if (raw == null || raw === '') return null
  if (spec.kind === 'bool') return raw === false || raw === 0 || raw === '0' || raw === 'false' ? '0' : '1'
  return String(raw)
}

function labelOf(row: Row, spec: GroupSpec, id: string): string {
  if (spec.kind === 'date') return spec.by === 'year' ? id : `${MONTHS[Number(id.slice(5, 7)) - 1]} de ${id.slice(0, 4)}`
  const option = spec.options.find((o) => o.value === id)?.label
  if (spec.kind === 'bool') return option ?? (id === '1' ? 'Sim' : 'Não')
  const formatted = row[`${GROUP_VALUE}${FORMATTED}`]
  return option ?? (typeof formatted === 'string' && formatted ? formatted : id)
}

/** Linhas do FetchXML agregado (`buildGroupsFetch`) em baldes ordenados como o Design System ordena. */
export function bucketsFromRows(rows: Row[], spec: GroupSpec): GroupBucket[] {
  const merged = new Map<string, GroupBucket>()
  let empty = 0
  for (const row of rows) {
    const count = Number(row[GROUP_TOTAL]) || 0
    const id = idOf(row, spec)
    if (id == null) { empty += count; continue }
    const bucket = merged.get(id)
    if (bucket) bucket.count += count
    else merged.set(id, { id, label: labelOf(row, spec, id), count })
  }

  let list = [...merged.values()]
  if (spec.kind === 'date') list.sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
  else if (spec.kind === 'bool') list.sort((a, b) => b.id.localeCompare(a.id))
  else if (spec.kind === 'choice') {
    const order = new Map(spec.options.map((o, i) => [o.value, i]))
    list.sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity) || a.label.localeCompare(b.label, 'pt-BR'))
  } else {
    list.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'))
    if (list.length > GROUP_LIMIT) {
      const shown = list.slice(0, GROUP_LIMIT)
      const rest = list.slice(GROUP_LIMIT)
      list = [...shown, { id: OTHERS_GROUP_ID, label: `Outros (${rest.length})`, count: rest.reduce((sum, b) => sum + b.count, 0), exclude: shown.map((b) => b.id) }]
    }
  }
  return empty > 0 ? [...list, { id: EMPTY_GROUP_ID, label: 'Vazio', count: empty }] : list
}

/**
 * `[início, fim)` do mês (`AAAA-MM`) ou do ano (`AAAA`) do balde, só com a data (`AAAA-MM-DD`): o Dataverse resolve o valor
 * no fuso do usuário, o mesmo do `dategrouping` que formou o balde (instantes UTC fixos errariam na borda do mês).
 */
export function periodRange(id: string): [string, string] {
  const [year, month] = id.split('-').map(Number)
  if (month) {
    const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`
    return [`${id}-01`, `${next}-01`]
  }
  return [`${year}-01-01`, `${year + 1}-01-01`]
}

/** Aviso quando o servidor recusa agrupar: o agregado do Dataverse falha acima de 50.000 registros (`AggregateQueryRecordLimit`, 0x8004E023). */
export const GROUPS_LIMIT_MESSAGE = 'Esta visão tem registros demais para agrupar; filtre mais.'
export const isAggregateLimit = (error: unknown) => error instanceof Error && /AggregateQueryRecordLimit|8004E023|50[.,]?000/i.test(error.message)
