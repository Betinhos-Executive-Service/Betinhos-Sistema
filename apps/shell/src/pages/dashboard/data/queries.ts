import { formatted, type Row } from '@betinhos/dataverse'
import { CP_CONCLUIDA, CP_PENDENTE, SEM_CLIENTE, SEM_MOTORISTA, VEICULO_PROPRIO, VEICULO_TERCEIRO } from '../domain/codes'
import { normL } from '../domain/format'
import { DIA_MS, dayKey, inicioMs } from '../domain/periodo'
import type { CategoriaVeiculo, Funcionario, Manutencao, Multa, Ocorrencia, Reserva, Veiculo } from '../domain/types'

export const ENTITIES = {
  reserva: 'cr40f_reservadeveculos', composicao: 'cr40f_composicaodeprecos', manutencao: 'cr40f_manutencoes', multa: 'cr40f_multas',
  ocorrencia: 'cr40f_errooperacional', funcionario: 'cr40f_funcionarios', veiculo: 'cr40f_veiculos',
} as const
export type EntitySets = Record<keyof typeof ENTITIES, string>

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const lower = (v: unknown) => str(v).toLowerCase()
const asRow = (v: unknown) => (v && typeof v === 'object' ? (v as Row) : null)

const RESERVA_SELECT = [
  'cr40f_reservadeveculosid', 'cr40f_dataehorriodesada', 'createdon', 'cr40f_status', 'cr40f_statusdefaturamento', 'cr40f_tipodoservico',
  'cr40f_tipodeveiculo', '_cr40f_veiculo_value', 'new_categoriadoitem', '_new_composicaodepreco_value', '_cr40f_financeiro_value',
]
const RESERVA_EXPAND = 'cr40f_Motorista($select=cr40f_funcionariosid,cr40f_nomecompleto,new_apelido),cr40f_Cliente($select=cr40f_nomedocliente)'

/** Reservas com saída de `desde` 00:00 até o fim de `ate` em Brasília, na ordem do legado. */
export function reservasPath(set: string, desde: string, ate: string) {
  const filtro = `cr40f_dataehorriodesada ge ${new Date(inicioMs(desde)).toISOString()} and cr40f_dataehorriodesada lt ${new Date(inicioMs(ate) + DIA_MS).toISOString()}`
  return `${set}?$select=${RESERVA_SELECT.join(',')}&$expand=${RESERVA_EXPAND}&$filter=${encodeURIComponent(filtro)}&$orderby=${encodeURIComponent('cr40f_dataehorriodesada desc')}`
}
export const composicoesPath = (set: string) => `${set}?$select=cr40f_composicaodeprecosid,new_valortotal,new_status`
export const manutencoesPath = (set: string) => `${set}?$select=cr40f_datamanutencao,cr40f_valor`
export const multasPath = (set: string) => `${set}?$select=cr40f_dataehorario,cr40f_status`
export const ocorrenciasPath = (set: string) => `${set}?$select=cr40f_dataocorrencia`
export const funcionariosPath = (set: string) => `${set}?$select=cr40f_funcionariosid,cr40f_nomecompleto,cr40f_status,cr40f_validadedacnh`
export const veiculosPath = (set: string) => `${set}?$select=cr40f_veiculosid,cr40f_statusdoveiculo,new_categoriadoveiculo`

export type Cp = { valor: number; pendente: boolean; concluida: boolean }
export function mapCps(rows: Row[]) {
  const map = new Map<string, Cp>()
  for (const p of rows) {
    const id = lower(p.cr40f_composicaodeprecosid)
    if (!id) continue
    const status = num(p.new_status)
    map.set(id, { valor: Number(p.new_valortotal) || 0, pendente: status === CP_PENDENTE, concluida: status === CP_CONCLUIDA })
  }
  return map
}

/** `enrichReservas` do legado para uma linha do Dataverse. */
export function mapReserva(row: Row, cps: Map<string, Cp>): Reserva {
  const saidaRaw = str(row.cr40f_dataehorriodesada)
  const dia = dayKey(saidaRaw)
  const mot = asRow(row.cr40f_Motorista)
  const nome = str(mot?.cr40f_nomecompleto) || SEM_MOTORISTA
  const motorista = str(mot?.new_apelido) || nome
  const motoristaId = lower(mot?.cr40f_funcionariosid)
  const cpId = lower(row._new_composicaodepreco_value)
  const cp = cps.get(cpId)
  return {
    id: lower(row.cr40f_reservadeveculosid), saidaRaw, saidaMs: saidaRaw ? Date.parse(saidaRaw) : NaN, dia, mes: dia.slice(0, 7),
    criadoRaw: str(row.createdon),
    status: num(row.cr40f_status), statusLabel: formatted(row, 'cr40f_status') || 'Sem status',
    fatStatus: num(row.cr40f_statusdefaturamento), fatStatusLabel: formatted(row, 'cr40f_statusdefaturamento') || '—',
    categoriaItem: num(row.new_categoriadoitem), categoriaItemLabel: formatted(row, 'new_categoriadoitem'),
    tipoVeiculoRaw: row.cr40f_tipodeveiculo == null ? '' : String(row.cr40f_tipodeveiculo),
    tipoVeiculo: formatted(row, 'cr40f_tipodeveiculo') || '—',
    veiculoId: lower(row._cr40f_veiculo_value),
    motoristaId, motoristaKey: motoristaId || `nome:${motorista.toLowerCase()}`, motorista,
    cliente: str(asRow(row.cr40f_Cliente)?.cr40f_nomedocliente) || SEM_CLIENTE,
    cpId, valor: cp?.valor ?? 0, cpPendente: cp?.pendente ?? false, cpConcluida: cp?.concluida ?? false,
    opId: lower(row._cr40f_financeiro_value),
  }
}

export const mapManutencao = (row: Row): Manutencao => ({ dia: dayKey(str(row.cr40f_datamanutencao)), valor: Number(row.cr40f_valor) || 0 })
export const mapMulta = (row: Row): Multa => ({ dia: dayKey(str(row.cr40f_dataehorario)), status: num(row.cr40f_status) })
export const mapOcorrencia = (row: Row): Ocorrencia => ({ dia: dayKey(str(row.cr40f_dataocorrencia)) })
export const mapFuncionario = (row: Row): Funcionario => {
  const cnh = str(row.cr40f_validadedacnh)
  return { statusLabel: formatted(row, 'cr40f_status'), cnhMs: cnh ? Date.parse(cnh) : NaN }
}
/** Categoria pelo código ou pelo rótulo, como o legado (L14175–14180). */
export function mapVeiculo(row: Row): Veiculo {
  const raw = row.new_categoriadoveiculo == null ? '' : String(row.new_categoriadoveiculo)
  const label = normL(formatted(row, 'new_categoriadoveiculo'))
  const categoria: CategoriaVeiculo = raw === VEICULO_PROPRIO || label.includes('proprio') ? 'Propria' : raw === VEICULO_TERCEIRO || label.includes('terceiro') ? 'Terceirizada' : ''
  return { id: lower(row.cr40f_veiculosid), statusLabel: formatted(row, 'cr40f_statusdoveiculo'), categoria }
}
