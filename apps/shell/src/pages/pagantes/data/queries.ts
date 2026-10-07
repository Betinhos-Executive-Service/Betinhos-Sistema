import { DataverseError, chunk, cleanId, formatted, type DataverseClient, type Row } from '@betinhos/dataverse'
import type { Contato, Pagante, ServicoOp } from '../domain/types'

export const ENTITIES = { pagante: 'cr40f_pagantes', pessoa: 'cr40f_bancodedados', reserva: 'cr40f_reservadeveculos' } as const
export type EntitySets = Record<keyof typeof ENTITIES, string>

const BASE = [
  'cr40f_pagantesid', 'cr40f_id', '_cr40f_bancodedados_value', '_cr40f_financeiro_value', 'cr40f_valor', 'cr40f_formadepagamento',
  'cr40f_status', 'cr40f_statusdorecibo', 'cr40f_linkdepagamento', 'cr40f_linkdorecibo', 'cr40f_datadoultimolembrete', 'createdon', 'modifiedon',
]
/** Colunas criadas pelo provisionamento do Gerar Pagantes; podem faltar em ambientes antigos. */
const ENVIO = ['cr40f_statusgeracaolink', 'cr40f_errogeracaolink', 'cr40f_statusenvioemail', 'cr40f_erroenvioemail', 'cr40f_dataenvioemail']

export const SAFE_MODE_ERROR = /column metadata is not available|could not find a property named|does not contain a definition/i

export function pagantesPath(entitySet: string, filter: string, mode: 'full' | 'safe') {
  const select = mode === 'full' ? [...BASE, ...ENVIO] : BASE
  return `${entitySet}?$select=${select.join(',')}&$filter=${encodeURIComponent(filter)}&$orderby=${encodeURIComponent('createdon desc')}`
}

export function periodFilter(since: Date | null) {
  return since ? `statecode eq 0 and createdon ge ${since.toISOString()}` : 'statecode eq 0'
}

const str = (value: unknown) => (typeof value === 'string' ? value : '')
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null)
const date = (value: unknown) => (typeof value === 'string' && value ? new Date(value) : null)

export function mapPagante(row: Row): Pagante {
  return {
    id: cleanId(str(row.cr40f_pagantesid)),
    codigo: str(row.cr40f_id),
    pessoaId: row._cr40f_bancodedados_value ? cleanId(str(row._cr40f_bancodedados_value)) : '',
    pessoa: formatted(row, '_cr40f_bancodedados_value'),
    opId: row._cr40f_financeiro_value ? cleanId(str(row._cr40f_financeiro_value)) : '',
    op: formatted(row, '_cr40f_financeiro_value'),
    valor: num(row.cr40f_valor),
    forma: num(row.cr40f_formadepagamento),
    status: num(row.cr40f_status),
    recibo: num(row.cr40f_statusdorecibo),
    linkPagamento: str(row.cr40f_linkdepagamento),
    linkRecibo: str(row.cr40f_linkdorecibo),
    ultimoLembrete: date(row.cr40f_datadoultimolembrete),
    criadoEm: date(row.createdon),
    alteradoEm: date(row.modifiedon),
    link: { status: num(row.cr40f_statusgeracaolink), erro: str(row.cr40f_errogeracaolink) },
    email: { status: num(row.cr40f_statusenvioemail), erro: str(row.cr40f_erroenvioemail), enviadoEm: date(row.cr40f_dataenvioemail) },
  }
}

/** Tenta com as colunas de envio; se o ambiente não as tem, repete só com as básicas. */
export async function loadPagantes(client: DataverseClient, entitySet: string, filter: string) {
  try {
    return (await client.getAll(pagantesPath(entitySet, filter, 'full'))).map(mapPagante)
  } catch (error) {
    if (!(error instanceof DataverseError) || !SAFE_MODE_ERROR.test(error.message)) throw error
    return (await client.getAll(pagantesPath(entitySet, filter, 'safe'))).map(mapPagante)
  }
}

export const opFilter = (opId: string) => `statecode eq 0 and _cr40f_financeiro_value eq ${cleanId(opId)}`

export function mapContato(row: Row): Contato {
  return { nome: str(row.cr40f_nomedopassageiro), telefone: str(row.cr40f_telefone), email: str(row.cr40f_email), cliente: formatted(row, '_cr40f_cliente_value') }
}

/** Contato de cada pessoa em blocos de 15 ids, para não estourar a URL. */
export async function loadContatos(client: DataverseClient, entitySet: string, ids: string[]) {
  const map = new Map<string, Contato>()
  const unique = [...new Set(ids.filter(Boolean).map(cleanId))]
  const pages = await Promise.all(chunk(unique, 15).map((part) => {
    const filter = part.map((id) => `cr40f_bancodedadosid eq ${id}`).join(' or ')
    return client.getAll(`${entitySet}?$select=cr40f_bancodedadosid,cr40f_nomedopassageiro,cr40f_telefone,cr40f_email,_cr40f_cliente_value&$filter=${encodeURIComponent(filter)}`)
  }))
  for (const row of pages.flat()) map.set(cleanId(str(row.cr40f_bancodedadosid)), mapContato(row))
  return map
}

export function mapServico(row: Row): ServicoOp {
  return {
    id: cleanId(str(row.cr40f_reservadeveculosid)),
    codigo: str(row.cr40f_id),
    data: date(row.cr40f_dataehorriodesada),
    destino: str(row.cr40f_destino),
    status: formatted(row, 'cr40f_status'),
  }
}

export async function loadServicos(client: DataverseClient, entitySet: string, opId: string) {
  const filter = `_cr40f_financeiro_value eq ${cleanId(opId)}`
  const rows = await client.getAll(`${entitySet}?$select=cr40f_reservadeveculosid,cr40f_id,cr40f_dataehorriodesada,cr40f_destino,cr40f_status&$filter=${encodeURIComponent(filter)}&$orderby=${encodeURIComponent('cr40f_dataehorriodesada asc')}`)
  return rows.map(mapServico)
}
