import { cleanId, formatted, type Row } from '@betinhos/dataverse'
import { VEICULO } from '../../frota/data/schema'
import type { Novo } from '../domain/importacao'
import { normalizar } from '../domain/parse'
import { ORIGEM_VALOR, type Abastecimento, type Motorista, type Origem, type Veiculo } from '../domain/types'

export const ENTITIES = { abastecimento: 'cr40f_abastecimento', veiculo: 'cr40f_veiculos', funcionario: 'cr40f_funcionarios', despesa: 'cr40f_despesaoperacional', categoria: 'cr40f_categoriadespesaoperacional' } as const
export type EntitySets = Record<keyof typeof ENTITIES, string>
/** Propriedades de navegação dos lookups (SchemaName em provision-abastecimento.ps1). */
export const NAV = { veiculo: 'cr40f_Veiculo', motorista: 'cr40f_Motorista' } as const

const SELECT = ['cr40f_abastecimentoid', 'cr40f_data', '_cr40f_veiculo_value', '_cr40f_motorista_value', 'cr40f_litros', 'cr40f_valor', 'cr40f_precolitro', 'cr40f_posto', 'cr40f_combustivel', 'cr40f_origem', 'cr40f_odometro', 'cr40f_chave', 'cr40f_placa', 'cr40f_motoristaextrato', 'cr40f_arquivo']
/** Colunas do veículo; `cr40f_capacidadetanque` só existe depois do provision, por isso fica à parte. */
const VEICULO_SELECT = ['cr40f_veiculosid', 'cr40f_placa', 'cr40f_marca', 'cr40f_modelo', '_cr40f_motoristaatual_value', 'cr40f_statusdoveiculo', 'statecode']
export const CAPACIDADE = 'cr40f_capacidadetanque'
const DESPESA_SELECT = ['cr40f_despesaoperacionalid', 'cr40f_datagasto', 'cr40f_valor', 'cr40f_estabelecimento', 'cr40f_litros', 'cr40f_kminformado', '_cr40f_veiculo_value', '_cr40f_motorista_value']

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const date = (v: unknown) => { const d = typeof v === 'string' && v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d : null }
const lookupId = (row: Row, campo: string) => (row[campo] ? cleanId(str(row[campo])) : null)
const lookupNome = (row: Row, campo: string) => (row[campo] ? formatted(row, campo) : '')
const filtro = (f: string) => `&$filter=${encodeURIComponent(f)}`
const ORIGEM_POR_VALOR = new Map<number, Origem>(Object.entries(ORIGEM_VALOR).map(([k, v]) => [v, k as Origem]))

export const abastecimentosPath = (set: string, since: Date | null) =>
  `${set}?$select=${SELECT.join(',')}${filtro(since ? `statecode eq 0 and cr40f_data ge ${since.toISOString()}` : 'statecode eq 0')}&$orderby=${encodeURIComponent('cr40f_data desc')}`
/** Só as chaves de deduplicação dos abastecimentos entre duas datas (inclusive); a importação confere o que o arquivo cobre, além da janela carregada na tela. */
export const chavesPath = (set: string, de: Date, ate: Date) =>
  `${set}?$select=cr40f_chave${filtro(`statecode eq 0 and cr40f_data ge ${de.toISOString()} and cr40f_data le ${ate.toISOString()}`)}`
export const veiculosPath = (set: string, comCapacidade: boolean) => `${set}?$select=${[...VEICULO_SELECT, ...(comCapacidade ? [CAPACIDADE] : [])].join(',')}&$orderby=${encodeURIComponent('cr40f_placa asc')}`
export const motoristasPath = (set: string) => `${set}?$select=cr40f_funcionariosid,cr40f_nomecompleto,cr40f_status${filtro('statecode eq 0')}&$orderby=${encodeURIComponent('cr40f_nomecompleto asc')}`
export const categoriasPath = (set: string) => `${set}?$select=cr40f_categoriadespesaoperacionalid,cr40f_nome`
/** Despesas do App nas categorias de combustível, do período. */
export const despesasPath = (set: string, since: Date | null, categoriaIds: string[]) => {
  const cats = categoriaIds.map((id) => `_cr40f_categoria_value eq ${id}`).join(' or ')
  return `${set}?$select=${DESPESA_SELECT.join(',')}${filtro(`statecode eq 0 and (${cats})${since ? ` and cr40f_datagasto ge ${since.toISOString()}` : ''}`)}&$orderby=${encodeURIComponent('cr40f_datagasto desc')}`
}

/** Categorias de despesa que são combustível ("Abastecimento" na frota, "Combustível" no App). */
export const categoriasCombustivel = (rows: Row[]) => rows.filter((r) => ['abastecimento', 'combustivel'].includes(normalizar(str(r.cr40f_nome)))).map((r) => cleanId(str(r.cr40f_categoriadespesaoperacionalid)))

export function mapAbastecimento(row: Row): Abastecimento {
  const veiculoId = lookupId(row, '_cr40f_veiculo_value')
  return {
    id: cleanId(str(row.cr40f_abastecimentoid)), data: date(row.cr40f_data) ?? new Date(0), veiculoId,
    placa: str(row.cr40f_placa) || lookupNome(row, '_cr40f_veiculo_value'),
    motoristaId: lookupId(row, '_cr40f_motorista_value'), motorista: lookupNome(row, '_cr40f_motorista_value') || str(row.cr40f_motoristaextrato),
    litros: num(row.cr40f_litros), valor: num(row.cr40f_valor), precoLitro: num(row.cr40f_precolitro), posto: str(row.cr40f_posto), combustivel: str(row.cr40f_combustivel),
    origem: ORIGEM_POR_VALOR.get(num(row.cr40f_origem) ?? -1) ?? 'ctf', odometro: num(row.cr40f_odometro), chave: str(row.cr40f_chave), arquivo: str(row.cr40f_arquivo),
  }
}

/** Despesa de combustível do App como abastecimento de origem `app` (não é gravada em cr40f_abastecimento). */
export function mapDespesa(row: Row, placaDe: (veiculoId: string) => string): Abastecimento {
  const veiculoId = lookupId(row, '_cr40f_veiculo_value')
  const litros = num(row.cr40f_litros)
  const valor = num(row.cr40f_valor)
  return {
    id: `despesa:${cleanId(str(row.cr40f_despesaoperacionalid))}`, data: date(row.cr40f_datagasto) ?? new Date(0), veiculoId, placa: veiculoId ? placaDe(veiculoId) : '',
    motoristaId: lookupId(row, '_cr40f_motorista_value'), motorista: lookupNome(row, '_cr40f_motorista_value'),
    litros, valor, precoLitro: litros && valor != null ? valor / litros : null, posto: str(row.cr40f_estabelecimento), combustivel: '', origem: 'app', odometro: num(row.cr40f_kminformado), chave: '', arquivo: '',
  }
}

export const mapVeiculo = (row: Row): Veiculo => ({
  id: cleanId(str(row.cr40f_veiculosid)), placa: str(row.cr40f_placa), modelo: [str(row.cr40f_marca), str(row.cr40f_modelo)].filter(Boolean).join(' '),
  motoristaId: lookupId(row, '_cr40f_motoristaatual_value'), motorista: lookupNome(row, '_cr40f_motoristaatual_value'),
  capacidadeTanque: num(row[CAPACIDADE]), ativo: row.statecode !== 1 && row.cr40f_statusdoveiculo !== VEICULO.VENDIDO,
})
/** Desligado (`cr40f_status` 1) continua na lista para os abastecimentos antigos, mas fora do seletor de filtro. */
export const mapMotorista = (row: Row): Motorista => ({ id: cleanId(str(row.cr40f_funcionariosid)), nome: str(row.cr40f_nomecompleto), ativo: row.cr40f_status !== 1 })

const fmtNome = (d: Date) => d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export function toPayload(n: Novo, sets: EntitySets): Row {
  const p: Row = {
    cr40f_name: `${n.placa} · ${fmtNome(n.data)}`, cr40f_data: n.data.toISOString(), cr40f_placa: n.placa, cr40f_motoristaextrato: n.motorista,
    cr40f_litros: n.litros, cr40f_valor: n.valor, cr40f_precolitro: n.precoLitro, cr40f_posto: n.posto, cr40f_combustivel: n.combustivel,
    cr40f_origem: ORIGEM_VALOR[n.origem], cr40f_odometro: n.odometro, cr40f_chave: n.chave, cr40f_arquivo: n.arquivo,
  }
  if (n.veiculoId) p[`${NAV.veiculo}@odata.bind`] = `/${sets.veiculo}(${cleanId(n.veiculoId)})`
  if (n.motoristaId) p[`${NAV.motorista}@odata.bind`] = `/${sets.funcionario}(${cleanId(n.motoristaId)})`
  return p
}

export const vinculoPayload = (veiculoId: string, sets: EntitySets): Row => ({ [`${NAV.veiculo}@odata.bind`]: `/${sets.veiculo}(${cleanId(veiculoId)})` })
