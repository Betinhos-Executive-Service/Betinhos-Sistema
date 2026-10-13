import { cleanId, formatted, type Row } from '@betinhos/dataverse'
import type { Op } from '../domain/types'

export const ENTITY_OP = 'cr40f_financeiro'

const SELECT = [
  'cr40f_financeiroid', 'cr40f_idfinanceiro', 'cr40f_status', 'cr40f_valor', 'new_clientedaop', 'new_passageirosdaop', 'cr40f_trajetos',
  'cr40f_datado1servico', 'cr40f_datadoultimoservico', 'cr40f_idioma', 'createdon', 'modifiedon', '_createdby_value',
]

export function opsPath(entitySet: string, since: Date | null) {
  const filter = since ? `statecode eq 0 and createdon ge ${since.toISOString()}` : 'statecode eq 0'
  return `${entitySet}?$select=${SELECT.join(',')}&$filter=${encodeURIComponent(filter)}&$orderby=${encodeURIComponent('createdon desc')}`
}

const str = (value: unknown) => (typeof value === 'string' ? value : '')
/** Texto de flow: "null"/"undefined" literais contam como vazio. */
const text = (value: unknown) => { const s = str(value).trim(); return /^(null|undefined)$/i.test(s) ? '' : s }
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null)
const date = (value: unknown) => {
  if (typeof value !== 'string' || !value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}
/**
 * Coluna "Somente data" chega como "2026-07-27T00:00:00" (às vezes com hora gravada por flow, sem fuso).
 * Lida como data local: `new Date` a trataria como UTC e mostraria o dia anterior em São Paulo.
 */
export const dateOnly = (value: unknown) => {
  const m = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : null
}

export function mapOp(row: Row): Op {
  return {
    id: cleanId(str(row.cr40f_financeiroid)),
    codigo: text(row.cr40f_idfinanceiro),
    status: num(row.cr40f_status),
    valor: num(row.cr40f_valor),
    cliente: text(row.new_clientedaop),
    passageiros: text(row.new_passageirosdaop),
    trajetos: text(row.cr40f_trajetos),
    primeiroServico: dateOnly(row.cr40f_datado1servico),
    ultimoServico: dateOnly(row.cr40f_datadoultimoservico),
    idioma: num(row.cr40f_idioma),
    criadoEm: date(row.createdon),
    criadoPor: row._createdby_value ? formatted(row, '_createdby_value') : '',
    alteradoEm: date(row.modifiedon),
  }
}
