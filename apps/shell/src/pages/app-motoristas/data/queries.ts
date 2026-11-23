import { cleanId, type Row } from '@betinhos/dataverse'
import type { Matriz } from '@betinhos/app-config'
import { normalizarMarca } from '../domain/regras'
import type { EstadoVersao, Motorista, Registro, Versao } from '../domain/types'

export const ENTITIES = {
  versao: 'cr40f_appconfigversao',
  pessoa: 'cr40f_appconfigpessoa',
  funcionario: 'cr40f_funcionarios',
  push: 'new_inscricaopushmotorista',
} as const
/** Nomes dos entity sets resolvidos pela metadata; o de push varia por ambiente e é lido à parte. */
export type EntitySets = Record<Exclude<keyof typeof ENTITIES, 'push'>, string>

/** Custom APIs não vinculadas da configuração (plugin Acesso). */
export const API = {
  salvarRascunho: 'cr40f_AppConfigSalvarRascunho',
  publicar: 'cr40f_AppConfigPublicar',
  definirPessoa: 'cr40f_AppConfigDefinirPessoa',
} as const

const FORMATADO = '@OData.Community.Display.V1.FormattedValue'
const ESTADO: Record<number, EstadoVersao> = { 100000000: 'rascunho', 100000001: 'publicada', 100000002: 'substituida' }
const TIPO_PESSOA: Record<number, Registro['tipo']> = { 100000000: 'excecao', 100000001: 'piloto' }

const str = (v: unknown) => (typeof v === 'string' ? v : '')

export const versoesPath = (set: string) =>
  `${set}?$select=cr40f_appconfigversaoid,cr40f_numero,cr40f_estado,cr40f_conteudo,cr40f_nota,cr40f_publicadoem,_cr40f_publicadopor_value,_cr40f_alteradopor_value,modifiedon&$orderby=${encodeURIComponent('cr40f_numero desc')}`
export const pessoasPath = (set: string) =>
  `${set}?$select=cr40f_appconfigpessoaid,_cr40f_funcionario_value,cr40f_tipo,cr40f_chave,cr40f_ligado,cr40f_motivo,cr40f_validade,cr40f_encerradoem,_cr40f_criadopor_value,_cr40f_encerradopor_value,createdon&$orderby=${encodeURIComponent('createdon asc')}`
/** Mesmo critério do servidor (`TemAcesso`): funcionário ativo com e-mail Microsoft. */
export const motoristasPath = (set: string) =>
  `${set}?$select=cr40f_funcionariosid,cr40f_nomecompleto,cr40f_tipodevinculo&$filter=${encodeURIComponent('cr40f_status eq 0 and cr40f_emailmicrosoft ne null and cr40f_emailmicrosoft ne \'\'')}&$orderby=${encodeURIComponent('cr40f_nomecompleto asc')}`
/** Quem tem ao menos uma inscrição de Web Push (a inscrição vencida é apagada pelo flow de push). */
export const pushPath = (set: string) => `${set}?$select=_new_funcionario_value&$filter=${encodeURIComponent('_new_funcionario_value ne null')}`

/** Conteúdo do rascunho/versão: `{"proprio":{...},"terceiro":{...}}`; JSON ilegível vale matriz vazia (o servidor valida na publicação). */
export function lerMatriz(conteudo: unknown): Matriz {
  const booleanos = (o: unknown) => (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'boolean')) : undefined)
  try {
    const bruto: unknown = typeof conteudo === 'string' && conteudo.trim() ? JSON.parse(conteudo) : {}
    const perfis = (bruto && typeof bruto === 'object' ? bruto : {}) as Partial<Record<'proprio' | 'terceiro', unknown>>
    return { proprio: booleanos(perfis.proprio), terceiro: booleanos(perfis.terceiro) }
  } catch { return {} }
}

export function mapVersao(row: Row): Versao {
  const estado = ESTADO[Number(row.cr40f_estado)] ?? 'substituida'
  const alteradoEm = str(row.modifiedon)
  return {
    id: cleanId(str(row.cr40f_appconfigversaoid)),
    numero: Number(row.cr40f_numero) || 0,
    estado,
    matriz: lerMatriz(row.cr40f_conteudo),
    nota: str(row.cr40f_nota),
    publicadoEm: str(row.cr40f_publicadoem) || null,
    publicadoPor: str(row[`_cr40f_publicadopor_value${FORMATADO}`]),
    alteradoPor: str(row[`_cr40f_alteradopor_value${FORMATADO}`]),
    alteradoEm,
    marca: estado === 'rascunho' ? normalizarMarca(alteradoEm) : '',
  }
}

export function mapRegistro(row: Row): Registro {
  const validade = str(row.cr40f_validade).slice(0, 10)
  return {
    id: cleanId(str(row.cr40f_appconfigpessoaid)),
    funcionarioId: cleanId(str(row._cr40f_funcionario_value)),
    tipo: TIPO_PESSOA[Number(row.cr40f_tipo)] ?? 'excecao',
    chave: str(row.cr40f_chave),
    ligado: row.cr40f_ligado === true,
    motivo: str(row.cr40f_motivo),
    validade: validade || null,
    encerradoEm: str(row.cr40f_encerradoem) || null,
    criadoPor: str(row[`_cr40f_criadopor_value${FORMATADO}`]),
    encerradoPor: str(row[`_cr40f_encerradopor_value${FORMATADO}`]),
    criadoEm: str(row.createdon),
  }
}

export function montarMotoristas(funcionarios: Row[], registros: Registro[], comPush: ReadonlySet<string>): Motorista[] {
  const porPessoa = new Map<string, Registro[]>()
  for (const r of registros) {
    const lista = porPessoa.get(r.funcionarioId)
    if (lista) lista.push(r)
    else porPessoa.set(r.funcionarioId, [r])
  }
  return funcionarios.map((row) => {
    const id = cleanId(str(row.cr40f_funcionariosid))
    const regs = porPessoa.get(id) ?? []
    const vinculo = typeof row.cr40f_tipodevinculo === 'number' ? row.cr40f_tipodevinculo : null
    return { id, nome: str(row.cr40f_nomecompleto).trim() || 'Sem nome', vinculo, piloto: regs.some((r) => r.tipo === 'piloto' && !r.encerradoEm), push: comPush.has(id), registros: regs }
  })
}
