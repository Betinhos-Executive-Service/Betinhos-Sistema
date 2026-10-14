import { cleanId, type Row } from '@betinhos/dataverse'
import { agentePorValor } from '../domain/agentes'
import type { Agente, Execucao, Proposta, TipoAcao } from '../domain/types'

export const ENTITY_EXECUCAO = 'cr40f_agenteexecucao'
export const ENTITY_PROPOSTA = 'cr40f_agenteproposta'
export const AGENTE_VALOR: Record<Agente, number> = { financeiro: 100000000, logistica: 100000001, pessoas: 100000002 }

const SELECT_EXEC = ['cr40f_agenteexecucaoid', 'cr40f_agente', 'cr40f_origem', 'cr40f_pergunta', 'cr40f_status', 'cr40f_erro', 'cr40f_resumo', 'cr40f_modelo', 'cr40f_tokensentrada', 'cr40f_tokenssaida', 'createdon']
const SELECT_PROP = ['cr40f_agentepropostaid', '_cr40f_execucao_value', 'cr40f_tipo', 'cr40f_titulo', 'cr40f_justificativa', 'cr40f_prioridade', 'cr40f_entidadealvo', 'cr40f_idalvo', 'cr40f_acao', 'cr40f_decisao', 'cr40f_motivodescarte', '_cr40f_decididopor_value', 'cr40f_decididoem']

export const execucoesPath = (set: string, agente: Agente, top: number) => `${set}?$select=${SELECT_EXEC.join(',')}&$filter=${encodeURIComponent(`cr40f_agente eq ${AGENTE_VALOR[agente]}`)}&$orderby=createdon%20desc&$top=${top}`
export const execucaoPath = (set: string, id: string) => `${set}(${cleanId(id)})?$select=${SELECT_EXEC.join(',')}`
export const propostasPath = (set: string, execucaoId: string) => `${set}?$select=${SELECT_PROP.join(',')}&$filter=${encodeURIComponent(`_cr40f_execucao_value eq ${cleanId(execucaoId)}`)}&$orderby=cr40f_prioridade%20asc,createdon%20asc`

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const date = (v: unknown) => { const d = typeof v === 'string' && v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d : null }
const fmt = (row: Row, campo: string) => str(row[`${campo}@OData.Community.Display.V1.FormattedValue`])
const STATUS: Record<number, Execucao['status']> = { 100000000: 'pendente', 100000001: 'processando', 100000002: 'concluida', 100000003: 'erro' }
const PRIORIDADE: Record<number, Proposta['prioridade']> = { 100000000: 'alta', 100000001: 'media', 100000002: 'baixa' }
const DECISAO: Record<number, Proposta['decisao']> = { 100000000: 'pendente', 100000001: 'aprovada', 100000002: 'descartada' }

export function mapExecucao(row: Row): Execucao {
  return {
    id: cleanId(str(row.cr40f_agenteexecucaoid)), agente: agentePorValor(num(row.cr40f_agente)), origem: num(row.cr40f_origem) === 100000000 ? 'agendado' : 'manual',
    pergunta: str(row.cr40f_pergunta), status: STATUS[num(row.cr40f_status) ?? -1] ?? 'erro', erro: str(row.cr40f_erro), resumo: str(row.cr40f_resumo), modelo: str(row.cr40f_modelo),
    tokensEntrada: num(row.cr40f_tokensentrada) ?? 0, tokensSaida: num(row.cr40f_tokenssaida) ?? 0, criadaEm: date(row.createdon),
  }
}
const TIPOS_ACAO: readonly TipoAcao[] = ['CriarPendencia', 'AtribuirMotorista', 'AtribuirVeiculo', 'CriarComunicadoRascunho']

/** JSON de cr40f_acao vindo do flow; tipo desconhecido ou campos fora do formato viram `null` (só registra a decisão). */
export function parseAcao(bruto: string): Proposta['acao'] {
  if (!bruto) return null
  let v: unknown
  try { v = JSON.parse(bruto) } catch { return null }
  if (!v || typeof v !== 'object') return null
  const { tipo, campos } = v as { tipo?: unknown; campos?: unknown }
  if (typeof tipo !== 'string' || !(TIPOS_ACAO as readonly string[]).includes(tipo)) return null
  if (campos != null && (typeof campos !== 'object' || Array.isArray(campos))) return null
  return { tipo: tipo as TipoAcao, campos: (campos ?? {}) as Record<string, string | number | null> }
}

export function mapProposta(row: Row): Proposta {
  const acao = parseAcao(str(row.cr40f_acao))
  return {
    id: cleanId(str(row.cr40f_agentepropostaid)), execucaoId: cleanId(str(row._cr40f_execucao_value)), tipo: fmt(row, 'cr40f_tipo') || String(num(row.cr40f_tipo) ?? ''),
    titulo: str(row.cr40f_titulo), justificativa: str(row.cr40f_justificativa), prioridade: PRIORIDADE[num(row.cr40f_prioridade) ?? -1] ?? 'media',
    entidadeAlvo: str(row.cr40f_entidadealvo), idAlvo: str(row.cr40f_idalvo), acao, decisao: DECISAO[num(row.cr40f_decisao) ?? -1] ?? 'pendente',
    motivoDescarte: str(row.cr40f_motivodescarte), decididoPor: fmt(row, '_cr40f_decididopor_value'), decididoEm: date(row.cr40f_decididoem),
  }
}
