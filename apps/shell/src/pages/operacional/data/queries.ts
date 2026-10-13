import { DataverseError, chunk, cleanId, formatted, type DataverseClient, type Row } from '@betinhos/dataverse'
import type { Motorista, OperacionalData, PassageiroServico, Reserva } from '../domain/types'
import { dayRange } from '../domain/time'

export const ENTITIES = { reserva: 'cr40f_reservadeveculos', funcionario: 'cr40f_funcionarios', passageiro: 'cr40f_servicosporpassageiro' } as const
export type EntitySets = { reserva: string; funcionario: string; passageiro: string }

const BASE = [
  'cr40f_reservadeveculosid', 'cr40f_id', 'cr40f_idnovo', 'cr40f_status', 'cr40f_statusdefaturamento', 'cr40f_tipodoservico', 'cr40f_tipodeveiculo',
  'cr40f_dataehorriodesada', 'cr40f_horrioprevistoderetorno', 'cr40f_destino', 'cr40f_endereodesada', 'cr40f_passageirosetelefonedecontato',
  'cr40f_trajeto', 'cr40f_obsdeoperao', 'cr40f_observaointerna', '_cr40f_solicitante_value',
]
const PASSAGEIRO_LOOKUPS = ['_cr40f_passageiro1_value', '_cr40f_passageiro2_value', '_cr40f_passageiro3_value', '_cr40f_passageiro4_value']
const EXTRA = ['_cr40f_motorista_value', '_cr40f_veiculo_value', '_cr40f_cliente_value', ...PASSAGEIRO_LOOKUPS]

/** Erros de coluna inexistente que fazem o legado repetir a consulta só com os campos base. */
export const SAFE_MODE_ERROR = /column metadata is not available|could not find a property named|does not contain a definition/i

export function reservasPath(entitySet: string, key: string, mode: 'full' | 'safe') {
  const { start, end } = dayRange(key)
  const select = mode === 'full' ? [...BASE, ...EXTRA] : BASE
  const filter = `cr40f_dataehorriodesada ge ${start.toISOString()} and cr40f_dataehorriodesada lt ${end.toISOString()} and statecode eq 0`
  return `${entitySet}?$select=${select.join(',')}&$filter=${encodeURIComponent(filter)}&$orderby=${encodeURIComponent('cr40f_dataehorriodesada asc')}`
}

const id = (value: unknown) => (typeof value === 'string' && value ? cleanId(value) : null)
const date = (value: unknown) => (typeof value === 'string' && value ? new Date(value) : null)
const text = (row: Row, field: string) => formatted(row, field).trim()

export function mapReserva(row: Row): Reserva {
  return {
    id: id(row.cr40f_reservadeveculosid) ?? '',
    codigo: text(row, 'cr40f_idnovo') || text(row, 'cr40f_id'),
    statusValue: typeof row.cr40f_status === 'number' ? row.cr40f_status : null,
    status: text(row, 'cr40f_status'),
    faturamento: text(row, 'cr40f_statusdefaturamento'),
    tipoServico: text(row, 'cr40f_tipodoservico') || 'Outros',
    tipoVeiculo: text(row, 'cr40f_tipodeveiculo'),
    saida: date(row.cr40f_dataehorriodesada),
    retorno: date(row.cr40f_horrioprevistoderetorno),
    destino: text(row, 'cr40f_destino'),
    enderecoSaida: text(row, 'cr40f_endereodesada'),
    trajeto: text(row, 'cr40f_trajeto'),
    obsOperacao: text(row, 'cr40f_obsdeoperao'),
    obsInterna: text(row, 'cr40f_observaointerna'),
    motoristaId: id(row._cr40f_motorista_value),
    motorista: text(row, '_cr40f_motorista_value'),
    veiculo: text(row, '_cr40f_veiculo_value'),
    cliente: text(row, '_cr40f_cliente_value'),
    solicitante: text(row, '_cr40f_solicitante_value'),
    passageirosLookup: PASSAGEIRO_LOOKUPS.flatMap((field) => (id(row[field]) ? [{ id: id(row[field])!, nome: text(row, field) }] : [])),
    passageirosTexto: text(row, 'cr40f_passageirosetelefonedecontato'),
    veiculoId: id(row._cr40f_veiculo_value),
    linkAcompanhamento: '',
    linkExpiraEm: null,
  }
}

export function mapMotorista(row: Row): Motorista {
  return { id: id(row.cr40f_funcionariosid) ?? '', nome: text(row, 'cr40f_nomecompleto'), apelido: text(row, 'new_apelido'), celular: text(row, 'cr40f_celular'), veiculoAtualId: null, terceiro: false }
}

async function loadReservas(client: DataverseClient, entitySet: string, key: string) {
  try {
    return { rows: await client.getAll(reservasPath(entitySet, key, 'full')), queryMode: 'full' as const }
  } catch (error) {
    if (!(error instanceof Error) || !SAFE_MODE_ERROR.test(error.message)) throw error
    return { rows: await client.getAll(reservasPath(entitySet, key, 'safe')), queryMode: 'safe' as const }
  }
}

const isAuthError = (error: unknown) => error instanceof DataverseError && (error.status === 401 || error.status === 403)

async function loadMotoristas(client: DataverseClient, entitySet: string, reservas: Reserva[], warnings: string[]) {
  try {
    const rows = await client.getAll(`${entitySet}?$select=cr40f_funcionariosid,cr40f_nomecompleto,new_apelido,cr40f_funcao,cr40f_status,cr40f_celular&$filter=statecode eq 0&$orderby=cr40f_nomecompleto asc`)
    const motoristas = rows.filter((row) => /motorista/i.test(formatted(row, 'cr40f_funcao'))).map(mapMotorista)
    if (motoristas.length) return motoristas
  } catch (error) {
    if (isAuthError(error)) throw error
    warnings.push('Não foi possível carregar a lista de motoristas; mostrando os que aparecem nas reservas.')
  }
  const derived = new Map<string, Motorista>()
  for (const r of reservas) if (r.motoristaId && !derived.has(r.motoristaId)) derived.set(r.motoristaId, { id: r.motoristaId, nome: r.motorista, apelido: '', celular: '', veiculoAtualId: null, terceiro: false })
  return [...derived.values()]
}

async function loadPassageiros(client: DataverseClient, entitySet: string, reservaIds: string[], warnings: string[]) {
  const result: Record<string, PassageiroServico[]> = {}
  try {
    for (const ids of chunk(reservaIds, 10)) {
      const filter = ids.map((value) => `_cr40f_geral_value eq ${value}`).join(' or ')
      const rows = await client.getAll(`${entitySet}?$select=cr40f_servicosporpassageiroid,cr40f_ordemdeselecao,new_enderecodesaidacolunaservicosporpassageiro,_cr40f_geral_value,_cr40f_bancodedados_value&$filter=${encodeURIComponent(filter)}&$orderby=cr40f_ordemdeselecao asc`)
      for (const row of rows) {
        const reservaId = id(row._cr40f_geral_value)
        if (!reservaId) continue
        ;(result[reservaId] ??= []).push({
          id: id(row.cr40f_servicosporpassageiroid) ?? '',
          ordem: Number(row.cr40f_ordemdeselecao ?? 0),
          nome: text(row, '_cr40f_bancodedados_value'),
          enderecoSaida: text(row, 'new_enderecodesaidacolunaservicosporpassageiro'),
        })
      }
    }
  } catch (error) {
    if (isAuthError(error)) throw error
    warnings.push('Não foi possível carregar os passageiros vinculados.')
    return {}
  }
  return result
}

/** Dia inteiro (sem filtro de motorista no servidor: o filtro é local para manter conflitos e a troca de motorista corretos). */
export async function loadOperacional(client: DataverseClient, sets: EntitySets, key: string): Promise<OperacionalData> {
  const { rows, queryMode } = await loadReservas(client, sets.reserva, key)
  const reservas = rows.map(mapReserva)
  const warnings: string[] = []
  const [passageiros, motoristas] = await Promise.all([
    loadPassageiros(client, sets.passageiro, reservas.map((r) => r.id), warnings),
    loadMotoristas(client, sets.funcionario, reservas, warnings),
  ])
  return { reservas, motoristas, veiculos: [], passageiros, queryMode, warnings }
}
