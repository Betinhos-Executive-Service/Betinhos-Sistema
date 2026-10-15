import { chunk, cleanId, formatted, type DataverseClient, type Row } from '@betinhos/dataverse'
import { ENTITY_OP, mapOp, opsPath } from '../../ops/data/queries'
import { guid } from '../../pagantes/data/queries'
import { FAT } from '../domain/codes'
import type { OpResumo, PaganteResumo, Reserva } from '../domain/types'

export const ENTITY_RESERVA = 'cr40f_reservadeveculos'
export const ENTITY_PAGANTE = 'cr40f_pagantes'
export const CHUNK = 10

const SELECT = [
  'cr40f_reservadeveculosid', 'cr40f_id', 'cr40f_dataehorriodesada', 'cr40f_status', 'cr40f_statusdefaturamento',
  '_cr40f_financeiro_value', '_new_composicaodepreco_value', '_cr40f_cliente_value',
]

const str = (value: unknown) => (typeof value === 'string' ? value : '')
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null)
const date = (value: unknown) => {
  if (typeof value !== 'string' || !value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}
const id = (value: unknown) => (value ? cleanId(str(value)) : null)

/** Navegação da reserva para a CP, resolvida pela metadata (mesma consulta do Dashboard); '' se não resolver. */
export async function resolveCpNav(client: DataverseClient): Promise<string> {
  try {
    const r = await client.request<{ value: { ReferencingEntityNavigationPropertyName?: string }[] }>(
      `EntityDefinitions(LogicalName='${ENTITY_RESERVA}')/ManyToOneRelationships?$select=ReferencingEntityNavigationPropertyName&$filter=${encodeURIComponent("ReferencingAttribute eq 'new_composicaodepreco'")}`,
    )
    return r.value[0]?.ReferencingEntityNavigationPropertyName ?? ''
  } catch (error) {
    console.warn('Pendências: navegação da composição não resolvida; CP virá sem status/valor.', String(error))
    return ''
  }
}

/** Reservas ativas que já estão em OP ou marcadas como Pago, desde `since` (data de saída). */
export function reservasPath(entitySet: string, since: Date | null, cpNav = '') {
  const base = since ? `statecode eq 0 and cr40f_dataehorriodesada ge ${since.toISOString()}` : 'statecode eq 0'
  const filter = `${base} and (cr40f_statusdefaturamento eq ${FAT.pago} or cr40f_statusdefaturamento eq ${FAT.mensal} or _cr40f_financeiro_value ne null)`
  const expand = cpNav ? `&$expand=${cpNav}($select=new_status,new_valortotal)` : ''
  return `${entitySet}?$select=${SELECT.join(',')}${expand}&$filter=${encodeURIComponent(filter)}`
}

export function mapReserva(row: Row, cpNav = ''): Reserva {
  const cp = cpNav && row[cpNav] && typeof row[cpNav] === 'object' ? (row[cpNav] as Row) : null
  return {
    id: cleanId(str(row.cr40f_reservadeveculosid)),
    codigo: str(row.cr40f_id),
    saida: date(row.cr40f_dataehorriodesada),
    cliente: row._cr40f_cliente_value ? formatted(row, '_cr40f_cliente_value') : '',
    clienteId: id(row._cr40f_cliente_value) ?? '',
    status: num(row.cr40f_status),
    fatStatus: num(row.cr40f_statusdefaturamento),
    fatLabel: formatted(row, 'cr40f_statusdefaturamento'),
    opId: id(row._cr40f_financeiro_value),
    opCodigo: row._cr40f_financeiro_value ? formatted(row, '_cr40f_financeiro_value') : '',
    cpId: id(row._new_composicaodepreco_value),
    cpStatus: cp ? num(cp.new_status) : null,
    cpValor: cp ? num(cp.new_valortotal) : null,
  }
}

export function opsChunkPath(entitySet: string, ids: string[]) {
  const filter = ids.map((x) => `cr40f_financeiroid eq ${guid(x)}`).join(' or ')
  return `${opsPath(entitySet, null).split('&$filter=')[0]}&$filter=${encodeURIComponent(filter)}`
}

export function pagantesChunkPath(entitySet: string, ids: string[]) {
  const filter = `statecode eq 0 and (${ids.map((x) => `_cr40f_financeiro_value eq ${guid(x)}`).join(' or ')})`
  return `${entitySet}?$select=cr40f_pagantesid,_cr40f_financeiro_value,cr40f_status,cr40f_valor&$filter=${encodeURIComponent(filter)}`
}

export function mapPaganteResumo(row: Row): PaganteResumo {
  return { id: cleanId(str(row.cr40f_pagantesid)), opId: id(row._cr40f_financeiro_value) ?? '', status: num(row.cr40f_status), valor: num(row.cr40f_valor) }
}

export type EntitySets = { reserva: string; op: string; pagante: string }

export async function loadPendenciasData(client: DataverseClient, sets: EntitySets, since: Date | null, cpNav: string) {
  const reservas = (await client.getAll(reservasPath(sets.reserva, since, cpNav))).map((r) => mapReserva(r, cpNav))
  const opIds = [...new Set(reservas.map((r) => r.opId).filter((x): x is string => !!x))]
  const blocks = chunk(opIds, CHUNK)
  const ops: OpResumo[] = (await Promise.all(blocks.map((b) => client.getAll(opsChunkPath(sets.op, b)))))
    .flat().map(mapOp).map((o) => ({ id: o.id, codigo: o.codigo, status: o.status, valor: o.valor, cliente: o.cliente }))
  const pagantes = (await Promise.all(blocks.map((b) => client.getAll(pagantesChunkPath(sets.pagante, b))))).flat().map(mapPaganteResumo)
  return { ops, reservas, pagantes }
}

export { ENTITY_OP }
