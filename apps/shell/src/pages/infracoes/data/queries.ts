import { cleanId, formatted, type DataverseClient, type Row } from '@betinhos/dataverse'
import type { Infracao, MultaUso } from '../domain/types'

export const ENTITIES = { infracao: 'cr40f_infracaodetransito', multa: 'cr40f_multas' } as const
export type EntitySets = Record<keyof typeof ENTITIES, string>

const SELECT = [
  'cr40f_infracaodetransitoid', 'cr40f_codigodainfracao', 'cr40f_descricaodainfracao', 'cr40f_enquadramentonoctb', 'cr40f_gravidadedainfracao',
  'cr40f_pontosnacnh', 'cr40f_valordamulta', 'cr40f_competencia', 'cr40f_responsabilidade', 'statecode', 'modifiedon',
]
const MULTA_SELECT = ['cr40f_multasid', 'cr40f_novacoluna', 'cr40f_status', 'cr40f_dataehorario', '_cr40f_placa_value', '_cr40f_motorista_value', '_cr40f_codigodainfracao_value']

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const text = (v: unknown) => { const t = str(v).trim(); return /^(null|undefined)$/i.test(t) ? '' : t }
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const date = (v: unknown) => { if (typeof v !== 'string' || !v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d }

/** Multi-choice chega como "202410000,202410002" na Web API. */
export const parseMulti = (v: unknown) => str(v).split(',').filter((x) => x.trim()).map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n >= 0).sort((a, b) => a - b)

export const infracoesPath = (set: string) => `${set}?$select=${SELECT.join(',')}&$orderby=${encodeURIComponent('cr40f_codigodainfracao asc')}`
export const multasPath = (set: string) =>
  `${set}?$select=${MULTA_SELECT.join(',')}&$filter=${encodeURIComponent('statecode eq 0 and _cr40f_codigodainfracao_value ne null')}&$orderby=${encodeURIComponent('cr40f_dataehorario desc')}`

export function mapInfracao(row: Row): Infracao {
  return {
    id: cleanId(str(row.cr40f_infracaodetransitoid)),
    codigo: text(row.cr40f_codigodainfracao), descricao: text(row.cr40f_descricaodainfracao), enquadramento: text(row.cr40f_enquadramentonoctb),
    gravidade: num(row.cr40f_gravidadedainfracao), pontos: num(row.cr40f_pontosnacnh), valor: num(row.cr40f_valordamulta),
    competencia: parseMulti(row.cr40f_competencia), responsabilidade: num(row.cr40f_responsabilidade),
    ativo: row.statecode !== 1, modificadoEm: date(row.modifiedon),
  }
}

export function mapMultaUso(row: Row): MultaUso {
  const lookup = (k: string) => (row[k] ? formatted(row, k) : '')
  return {
    id: cleanId(str(row.cr40f_multasid)), infracaoId: cleanId(str(row._cr40f_codigodainfracao_value)), titulo: text(row.cr40f_novacoluna),
    status: row.cr40f_status == null ? '' : formatted(row, 'cr40f_status'), data: date(row.cr40f_dataehorario),
    placa: lookup('_cr40f_placa_value'), motorista: lookup('_cr40f_motorista_value'),
  }
}

export async function loadInfracoes(client: DataverseClient, set: string) {
  return (await client.getAll(infracoesPath(set))).map(mapInfracao)
}

export async function loadMultasUso(client: DataverseClient, set: string) {
  return (await client.getAll(multasPath(set))).map(mapMultaUso)
}

/** Inativar/reativar mexe só no estado; o statuscode acompanha (Ativo 1, Inativo 2). */
export const estadoPayload = (ativo: boolean): Row => ({ statecode: ativo ? 0 : 1, statuscode: ativo ? 1 : 2 })
