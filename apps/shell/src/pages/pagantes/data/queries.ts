import { DataverseError, chunk, cleanId, formatted, type DataverseClient, type Row } from '@betinhos/dataverse'
import type { Contato, Pagante, ServicoOp } from '../domain/types'

export const ENTITIES = { pagante: 'cr40f_pagantes', pessoa: 'cr40f_bancodedados', reserva: 'cr40f_reservadeveculos', composicao: 'cr40f_composicaodeprecos' } as const
export type EntitySets = Record<keyof typeof ENTITIES, string>

const BASE = [
  'cr40f_pagantesid', 'cr40f_id', '_cr40f_bancodedados_value', '_cr40f_financeiro_value', 'cr40f_valor', 'cr40f_formadepagamento',
  'cr40f_status', 'cr40f_statusdorecibo', 'cr40f_linkdepagamento', 'cr40f_linkdorecibo', 'cr40f_datadoultimolembrete', 'createdon', 'modifiedon',
]
/** Colunas criadas pelo provisionamento do Gerar Pagantes; podem faltar em ambientes antigos. */
const ENVIO = [
  'cr40f_statusgeracaolink', 'cr40f_errogeracaolink', 'cr40f_statusenvioemail', 'cr40f_erroenvioemail', 'cr40f_dataenvioemail',
  'new_statusgeracaorecibo', 'new_errogeracaorecibo', 'cr40f_datadoprimeiropagamento',
]

export const SAFE_MODE_ERROR = /column metadata is not available|could not find a property named|does not contain a definition/i

export function pagantesPath(entitySet: string, filter: string, mode: 'full' | 'safe') {
  const select = mode === 'full' ? [...BASE, ...ENVIO] : BASE
  return `${entitySet}?$select=${select.join(',')}&$filter=${encodeURIComponent(filter)}&$orderby=${encodeURIComponent('createdon desc')}`
}

export function periodFilter(since: Date | null) {
  return since ? `statecode eq 0 and createdon ge ${since.toISOString()}` : 'statecode eq 0'
}

const str = (value: unknown) => (typeof value === 'string' ? value : '')
/** Texto livre gravado por flow: "null"/"undefined" literais (já vistos em DEV) contam como vazio. */
const text = (value: unknown) => { const s = str(value).trim(); return /^(null|undefined)$/i.test(s) ? '' : s }
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Id limpo e validado antes de entrar num $filter. */
export function guid(value: string) {
  const id = cleanId(value.trim())
  if (!GUID.test(id)) throw new Error(`Identificador inválido: ${value}`)
  return id
}
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null)
const date = (value: unknown) => {
  if (typeof value !== 'string' || !value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

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
    link: { status: num(row.cr40f_statusgeracaolink), erro: text(row.cr40f_errogeracaolink) },
    email: { status: num(row.cr40f_statusenvioemail), erro: text(row.cr40f_erroenvioemail), enviadoEm: date(row.cr40f_dataenvioemail) },
    reciboGeracao: { status: num(row.new_statusgeracaorecibo), erro: text(row.new_errogeracaorecibo) },
    pagoEm: date(row.cr40f_datadoprimeiropagamento),
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

export const opFilter = (opId: string) => `statecode eq 0 and _cr40f_financeiro_value eq ${guid(opId)}`

export function mapContato(row: Row): Contato {
  return { nome: text(row.cr40f_nomedopassageiro), telefone: text(row.cr40f_telefone), email: text(row.cr40f_email), cliente: row._cr40f_cliente_value ? formatted(row, '_cr40f_cliente_value') : '' }
}

/**
 * Contato de cada pessoa em blocos de 15 ids (limite de URL), no máximo 4 blocos
 * ao mesmo tempo para não esbarrar no limite de requisições do Dataverse.
 */
export async function loadContatos(client: DataverseClient, entitySet: string, ids: string[]) {
  const map = new Map<string, Contato>()
  const unique = [...new Set(ids.map((id) => cleanId(id.trim())).filter((id) => GUID.test(id)))]
  const blocks = chunk(unique, 15)
  for (const wave of chunk(blocks, 4)) {
    const pages = await Promise.all(wave.map((part) => {
      const filter = part.map((id) => `cr40f_bancodedadosid eq ${id}`).join(' or ')
      return client.getAll(`${entitySet}?$select=cr40f_bancodedadosid,cr40f_nomedopassageiro,cr40f_telefone,cr40f_email,_cr40f_cliente_value&$filter=${encodeURIComponent(filter)}`)
    }))
    for (const row of pages.flat()) map.set(cleanId(str(row.cr40f_bancodedadosid)), mapContato(row))
  }
  return map
}

export function mapServico(row: Row): ServicoOp {
  return {
    id: cleanId(str(row.cr40f_reservadeveculosid)),
    codigo: str(row.cr40f_id),
    data: date(row.cr40f_dataehorriodesada),
    destino: text(row.cr40f_destino),
    status: formatted(row, 'cr40f_status'),
    valor: null,
  }
}

/**
 * Serviços da OP com o valor de cada um (soma de `new_valortotal` da composição de preços,
 * a mesma conta do plugin do Gerar Pagantes). Sem composição legível, o valor fica null.
 */
export async function loadServicos(client: DataverseClient, sets: Pick<EntitySets, 'reserva' | 'composicao'>, opId: string) {
  const filter = `_cr40f_financeiro_value eq ${guid(opId)}`
  const rows = await client.getAll(`${sets.reserva}?$select=cr40f_reservadeveculosid,cr40f_id,cr40f_dataehorriodesada,cr40f_destino,cr40f_status&$filter=${encodeURIComponent(filter)}&$orderby=${encodeURIComponent('cr40f_dataehorriodesada asc')}`)
  const servicos = rows.map(mapServico)
  if (!servicos.length) return servicos
  try {
    const valores = new Map<string, number>()
    for (const part of chunk(servicos.map((s) => s.id).filter((id) => GUID.test(id)), 15)) {
      const f = part.map((id) => `_cr40f_servicorelacionadogeral_value eq ${id}`).join(' or ')
      const comps = await client.getAll(`${sets.composicao}?$select=new_valortotal,_cr40f_servicorelacionadogeral_value&$filter=${encodeURIComponent(`statecode eq 0 and (${f})`)}`)
      for (const c of comps) {
        const id = cleanId(str(c._cr40f_servicorelacionadogeral_value))
        valores.set(id, (valores.get(id) ?? 0) + (num(c.new_valortotal) ?? 0))
      }
    }
    return servicos.map((s) => ({ ...s, valor: valores.has(s.id) ? valores.get(s.id)! : null }))
  } catch {
    return servicos
  }
}

/** Total da OP; null se algum serviço não tem valor (não dá para afirmar a soma). */
export function totalOp(servicos: ServicoOp[]) {
  if (!servicos.length || servicos.some((s) => s.valor == null)) return null
  return servicos.reduce((sum, s) => sum + (s.valor ?? 0), 0)
}
