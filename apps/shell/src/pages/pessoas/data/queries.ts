import { chunk, cleanId, formatted, odataString, type DataverseClient, type Row } from '@betinhos/dataverse'
import { andFilter, getAllWithFirstPage, odataSearchFilter, searchRows } from '../../../app/pagedLoad'
import type { Cliente, PagantePessoa, Papel, Pessoa, ServicoPessoa } from '../domain/types'

export const ENTITIES = {
  pessoa: 'cr40f_bancodedados', cliente: 'cr40f_clientes1', reserva: 'cr40f_reservadeveculos',
  passageiro: 'cr40f_servicosporpassageiro', pagante: 'cr40f_pagantes',
} as const
export type EntitySets = Record<keyof typeof ENTITIES, string>

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export function guid(value: string) {
  const id = cleanId(value.trim())
  if (!GUID.test(id)) throw new Error(`Identificador inválido: ${value}`)
  return id
}

const SELECT = [
  'cr40f_bancodedadosid', 'cr40f_nomedopassageiro', '_cr40f_cliente_value', 'cr40f_telefone', 'cr40f_email', 'cr40f_cargo', 'cr40f_classificacao',
  'cr40f_idioma', 'cr40f_status', 'cr40f_sexo', 'new_tipodoveiculo', 'cr40f_departamento', 'cr40f_cr', 'cr40f_enderecodesaida',
  'cr40f_preferenciasdopassageiro', 'cr40f_datadenascimento', 'cr40f_datadecadastro', 'cr40f_datadoultimoservico', 'new_linkdafoto', 'createdon',
]

const str = (v: unknown) => (typeof v === 'string' ? v : '')
/** Texto livre gravado por flow: "null"/"undefined" literais contam como vazio. */
const text = (v: unknown) => { const t = str(v).trim(); return /^(null|undefined)$/i.test(t) ? '' : t }
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const date = (v: unknown) => { if (typeof v !== 'string' || !v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d }
const dateOnly = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : '')

export const pessoasPath = (set: string, search: string | null = null) =>
  `${set}?$select=${SELECT.join(',')}&$filter=${encodeURIComponent(andFilter('statecode eq 0', search))}&$orderby=${encodeURIComponent('cr40f_nomedopassageiro asc')}`

/** Busca no servidor: nome em qualquer posição (sobrenome), e-mail pelo começo. */
export const pessoasSearchFilter = (query: string) => odataSearchFilter(query, { startsWith: ['cr40f_email'], contains: ['cr40f_nomedopassageiro'] })

export function mapPessoa(row: Row): Pessoa {
  return {
    id: cleanId(str(row.cr40f_bancodedadosid)),
    nome: text(row.cr40f_nomedopassageiro),
    clienteId: row._cr40f_cliente_value ? cleanId(str(row._cr40f_cliente_value)) : '',
    cliente: row._cr40f_cliente_value ? formatted(row, '_cr40f_cliente_value') : '',
    telefone: text(row.cr40f_telefone), email: text(row.cr40f_email),
    cargo: num(row.cr40f_cargo), classificacao: num(row.cr40f_classificacao), idioma: num(row.cr40f_idioma), status: num(row.cr40f_status),
    sexo: num(row.cr40f_sexo), tipoVeiculo: num(row.new_tipodoveiculo),
    departamento: text(row.cr40f_departamento), cr: text(row.cr40f_cr), endereco: text(row.cr40f_enderecodesaida), preferencias: text(row.cr40f_preferenciasdopassageiro),
    nascimento: dateOnly(row.cr40f_datadenascimento), cadastro: dateOnly(row.cr40f_datadecadastro), ultimoServico: dateOnly(row.cr40f_datadoultimoservico),
    foto: text(row.new_linkdafoto), criadoEm: date(row.createdon),
  }
}

/** Cadastro inteiro (ativos); a primeira página aparece antes, enquanto o resto carrega. */
export async function loadPessoas(client: DataverseClient, set: string, onFirstPage?: (list: Pessoa[]) => void) {
  return (await getAllWithFirstPage(client, pessoasPath(set), onFirstPage && ((rows) => onFirstPage(rows.map(mapPessoa))))).map(mapPessoa)
}

/** Até 50 pessoas que batem com a busca, enquanto a lista ainda não carregou inteira. */
export async function searchPessoas(client: DataverseClient, set: string, query: string) {
  const filter = pessoasSearchFilter(query)
  return filter ? (await searchRows(client, pessoasPath(set, filter))).map(mapPessoa) : []
}

/** Até 25 clientes ativos cujo nome começa com o texto (o seletor busca no servidor, não carrega todos). */
export async function searchClientes(client: DataverseClient, set: string, query: string): Promise<Cliente[]> {
  const q = query.trim()
  const filter = q ? `statecode eq 0 and startswith(cr40f_nomedocliente,'${odataString(q)}')` : 'statecode eq 0'
  const page = await client.request<{ value: Row[] }>(`${set}?$select=cr40f_clientes1id,cr40f_nomedocliente&$filter=${encodeURIComponent(filter)}&$orderby=cr40f_nomedocliente asc&$top=25`)
  return page.value.map((r) => ({ id: cleanId(str(r.cr40f_clientes1id)), nome: text(r.cr40f_nomedocliente) })).filter((c) => c.nome)
}

const PASSAGEIRO_LOOKUPS = ['_cr40f_passageiro1_value', '_cr40f_passageiro2_value', '_cr40f_passageiro3_value', '_cr40f_passageiro4_value']
const RESERVA_SELECT = ['cr40f_reservadeveculosid', 'cr40f_id', 'cr40f_dataehorriodesada', 'cr40f_destino', 'cr40f_status', 'cr40f_tipodoservico', '_cr40f_solicitante_value', ...PASSAGEIRO_LOOKUPS].join(',')

function mapServico(row: Row, pessoaId: string, fallback: Papel): Omit<ServicoPessoa, 'papeis'> & { papel: Papel } {
  const id = (k: string) => (row[k] ? cleanId(str(row[k])) : '')
  const papel: Papel = id('_cr40f_solicitante_value') === pessoaId ? 'Solicitante' : PASSAGEIRO_LOOKUPS.some((k) => id(k) === pessoaId) ? 'Passageiro' : fallback
  return {
    id: cleanId(str(row.cr40f_reservadeveculosid)), codigo: text(row.cr40f_id), data: date(row.cr40f_dataehorriodesada),
    destino: text(row.cr40f_destino), status: formatted(row, 'cr40f_status'), tipo: formatted(row, 'cr40f_tipodoservico'), papel,
  }
}

/** Serviços mais recentes lidos por consulta; passou disso, a ficha avisa que o total é "mais de". */
export const HIST_TOP = 500

/**
 * Reservas como solicitante ou passageiro 1–4 e as ligadas por Serviços por Passageiro, as mais recentes primeiro.
 * As duas consultas saem juntas; as reservas que só aparecem pelos vínculos vêm em blocos de 15, 4 por vez.
 */
export async function loadServicosDaPessoa(client: DataverseClient, sets: Pick<EntitySets, 'reserva' | 'passageiro'>, pessoaId: string) {
  const id = guid(pessoaId)
  const direct = ['_cr40f_solicitante_value', ...PASSAGEIRO_LOOKUPS].map((k) => `${k} eq ${id}`).join(' or ')
  const recentes = encodeURIComponent('cr40f_dataehorriodesada desc')
  const [diretas, vinculos] = await Promise.all([
    client.request<{ value: Row[] }>(`${sets.reserva}?$select=${RESERVA_SELECT}&$filter=${encodeURIComponent(direct)}&$orderby=${recentes}&$top=${HIST_TOP}`),
    client.request<{ value: Row[] }>(`${sets.passageiro}?$select=_cr40f_geral_value&$filter=${encodeURIComponent(`_cr40f_bancodedados_value eq ${id}`)}&$orderby=${encodeURIComponent('createdon desc')}&$top=${HIST_TOP}`),
  ]).then((pages) => pages.map((page) => page.value))
  const conhecidas = new Set(diretas.map((r) => cleanId(str(r.cr40f_reservadeveculosid))))
  const faltam = [...new Set(vinculos.map((v) => (v._cr40f_geral_value ? cleanId(str(v._cr40f_geral_value)) : '')).filter((g) => GUID.test(g) && !conhecidas.has(g)))]
  const extras: Row[] = []
  for (const wave of chunk(chunk(faltam, 15), 4)) {
    const pages = await Promise.all(wave.map((part) => {
      const f = part.map((g) => `cr40f_reservadeveculosid eq ${g}`).join(' or ')
      return client.getAll(`${sets.reserva}?$select=${RESERVA_SELECT}&$filter=${encodeURIComponent(f)}&$orderby=${recentes}`)
    }))
    extras.push(...pages.flat())
  }
  const servicos = [...diretas.map((r) => mapServico(r, id, 'Passageiro')), ...extras.map((r) => mapServico(r, id, 'Passageiro'))]
  return { servicos, limitado: diretas.length >= HIST_TOP || vinculos.length >= HIST_TOP }
}

export async function loadPagantesDaPessoa(client: DataverseClient, set: string, pessoaId: string): Promise<PagantePessoa[]> {
  const rows = await client.getAll(`${set}?$select=cr40f_pagantesid,cr40f_id,_cr40f_financeiro_value,cr40f_valor,cr40f_status,createdon&$filter=${encodeURIComponent(`statecode eq 0 and _cr40f_bancodedados_value eq ${guid(pessoaId)}`)}&$orderby=createdon desc&$top=${HIST_TOP}`)
  return rows.map((r) => ({
    id: cleanId(str(r.cr40f_pagantesid)), codigo: text(r.cr40f_id), op: r._cr40f_financeiro_value ? formatted(r, '_cr40f_financeiro_value') : '',
    valor: num(r.cr40f_valor), status: formatted(r, 'cr40f_status'), criadoEm: date(r.createdon),
  }))
}
