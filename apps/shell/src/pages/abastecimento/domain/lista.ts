import { CONFIG_VERSION, emptyFilters, type FilterCondition, type FilterField, type FilterOption, type StoredView, type TableFilters, type ViewColumnDef, type ViewConfig, type ViewSort } from '@betinhos/ui'
import { sortRows } from '../../../app/listSort'
import { ORIGEM_ROTULO, ORIGENS, type Abastecimento } from './types'

/** Lista de abastecimentos no padrão de listas do DS (§10.9.1/§10.9.2), como Despesas e Equipamentos. */
export const TELA = 'abastecimento'
export const SORT: ViewSort = { key: 'data', dir: 'desc' }

export const COLUMNS: ViewColumnDef[] = [
  { key: 'data', label: 'Data' },
  { key: 'veiculo', label: 'Veículo' },
  { key: 'motorista', label: 'Motorista' },
  { key: 'litros', label: 'Litros' },
  { key: 'valor', label: 'Valor' },
  { key: 'precoLitro', label: 'Preço/L' },
  { key: 'kmPorLitro', label: 'km/l' },
  { key: 'origem', label: 'Origem' },
  { key: 'posto', label: 'Posto' },
  { key: 'odometro', label: 'Odômetro', defaultHidden: true },
]

const ORIGEM_OPTIONS: FilterOption[] = ORIGENS.map((o) => ({ value: o, label: ORIGEM_ROTULO[o] }))

export function fields(veiculos: FilterOption[], motoristas: FilterOption[]): FilterField[] {
  return [
    { key: 'data', label: 'Data', kind: 'date' },
    { key: 'veiculo', label: 'Veículo', kind: 'choice', options: veiculos },
    { key: 'motorista', label: 'Motorista', kind: 'choice', options: motoristas },
    { key: 'litros', label: 'Litros', kind: 'number' },
    { key: 'valor', label: 'Valor', kind: 'number', money: true },
    { key: 'precoLitro', label: 'Preço por litro', kind: 'number', money: true },
    { key: 'kmPorLitro', label: 'km/l', kind: 'number' },
    { key: 'origem', label: 'Origem', kind: 'choice', options: ORIGEM_OPTIONS },
    { key: 'posto', label: 'Posto', kind: 'text' },
    { key: 'odometro', label: 'Odômetro', kind: 'number' },
    { key: 'arquivo', label: 'Arquivo importado', kind: 'text', advancedOnly: true },
  ]
}

export type Linha = Abastecimento & { kmPorLitro: number | null; veiculoChave: string; motoristaChave: string }

export function readLinha(a: Linha, key: string): unknown {
  switch (key) {
    case 'data': return a.data
    case 'veiculo': return a.veiculoChave
    case 'motorista': return a.motoristaChave
    case 'litros': return a.litros
    case 'valor': return a.valor
    case 'precoLitro': return a.precoLitro
    case 'kmPorLitro': return a.kmPorLitro
    case 'origem': return a.origem
    case 'posto': return a.posto
    case 'odometro': return a.odometro
    case 'arquivo': return a.arquivo
    default: return null
  }
}

export const textoBusca = (a: Linha) => [a.placa, a.motorista, a.posto, a.combustivel, a.arquivo, ORIGEM_ROTULO[a.origem]].filter(Boolean).join(' ')

export function sortLinhas(list: Linha[], sort: ViewSort | null | undefined) {
  if (!sort) return list
  const value = (a: Linha): string | number | null => {
    switch (sort.key) {
      case 'data': return a.data.getTime()
      case 'veiculo': return a.placa || null
      case 'motorista': return a.motorista || null
      case 'origem': return ORIGEM_ROTULO[a.origem]
      case 'posto': return a.posto || null
      default: { const v = readLinha(a, sort.key); return typeof v === 'number' ? v : null }
    }
  }
  return sortRows(list, value, sort.dir)
}

const quick = (field: string, values: FilterOption[]): FilterCondition => ({ type: 'condition', id: `rapido-${field}`, field, op: 'in', values })
const configWith = (filters: TableFilters): ViewConfig => ({ v: CONFIG_VERSION, columns: COLUMNS.map((c) => ({ key: c.key, visible: !c.defaultHidden })), sort: SORT, filters: filters as unknown as Record<string, unknown> })
const view = (id: string, name: string, ordem: number, filters: TableFilters): StoredView => ({ id, name, publica: true, mine: false, ordem, config: JSON.stringify(configWith(filters)) })

/** Visões prontas: por origem e só os sem odômetro. */
export function builtinViews(): StoredView[] {
  const porOrigem = (o: FilterOption) => ({ ...emptyFilters(), quick: { origem: quick('origem', [o]) } })
  return [
    ...ORIGEM_OPTIONS.map((o, i) => view(`origem-${o.value}`, `Só ${o.label}`, i + 1, porOrigem(o))),
    view('sem-odometro', 'Sem odômetro', 9, { ...emptyFilters(), advanced: { ...emptyFilters().advanced, items: [{ type: 'condition', id: 'odometro-empty', field: 'odometro', op: 'empty' }] } }),
  ]
}
