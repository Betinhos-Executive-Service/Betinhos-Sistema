import { CONFIG_VERSION, emptyFilters, type FilterCondition, type FilterField, type FilterOption, type StoredView, type TableFilters, type ViewColumnDef, type ViewConfig, type ViewSort } from '@betinhos/ui'
import { sortRows } from '../../../app/listSort'
import { dataCurta } from './formato'
import { excecoesVigentes, perfilDe, ROTULO_PERFIL, rotuloChave, semVinculo, statusExcecao } from './regras'
import type { Motorista } from './types'

/** Lista de motoristas com acesso ao App, no padrão de listas do DS (§10.9.1/§10.9.2). */
export const TELA = 'app-motoristas'
export const MOTORISTA_SORT: ViewSort = { key: 'nome', dir: 'asc' }

export const MOTORISTA_COLUMNS: ViewColumnDef[] = [
  { key: 'nome', label: 'Motorista' },
  { key: 'perfil', label: 'Perfil' },
  { key: 'piloto', label: 'Piloto' },
  { key: 'excecoes', label: 'Exceções' },
  { key: 'push', label: 'Push' },
]

const PERFIL_FILTER: FilterOption[] = [{ value: 'proprio', label: 'Próprio' }, { value: 'terceiro', label: 'Terceiro' }, { value: 'sem-vinculo', label: 'Sem vínculo' }]
const SIM_NAO: FilterOption[] = [{ value: '1', label: 'Sim' }, { value: '0', label: 'Não' }]

export const MOTORISTA_FIELDS: FilterField[] = [
  { key: 'nome', label: 'Motorista', kind: 'text' },
  { key: 'perfil', label: 'Perfil', kind: 'choice', options: PERFIL_FILTER },
  { key: 'excecao', label: 'Com exceção vigente', kind: 'bool', options: SIM_NAO },
  { key: 'semVinculo', label: 'Sem vínculo', kind: 'bool', options: SIM_NAO },
  { key: 'semPush', label: 'Sem push ativo', kind: 'bool', options: SIM_NAO },
  { key: 'piloto', label: 'No grupo piloto', kind: 'bool', options: SIM_NAO, advancedOnly: true },
]

/** Texto da busca por palavras: nome, perfil, piloto, exceções (módulo, motivo, validade) e push. */
export function motoristaKeywordText(m: Motorista, hoje: string) {
  const vigentes = excecoesVigentes(m, hoje)
  return [
    m.nome, semVinculo(m) ? 'Sem vínculo' : ROTULO_PERFIL[perfilDe(m)], m.piloto ? 'Piloto' : '', m.push ? 'Push ativo' : 'Sem push',
    ...vigentes.flatMap((r) => [rotuloChave(r.chave), r.motivo, r.validade ? dataCurta(r.validade) : '']),
  ].filter(Boolean).join(' ')
}

export function sortMotoristas(list: Motorista[], sort: ViewSort | null, hoje: string) {
  if (!sort) return list
  return sortRows(list, (m) => {
    switch (sort.key) {
      case 'nome': return m.nome
      case 'perfil': return perfilDe(m)
      case 'piloto': return Number(m.piloto)
      case 'excecoes': return m.registros.filter((r) => r.tipo === 'excecao' && statusExcecao(r, hoje) === 'vigente').length
      case 'push': return Number(m.push)
      default: return null
    }
  }, sort.dir)
}

const quick = (field: string, op: 'yes' | 'no' = 'yes'): FilterCondition => ({ type: 'condition', id: `rapido-${field}`, field, op })
const withQuick = (cond: FilterCondition[]): TableFilters => ({ ...emptyFilters(), quick: Object.fromEntries(cond.map((c) => [c.field, c])) })
const configWith = (filters: TableFilters): ViewConfig => ({
  v: CONFIG_VERSION,
  columns: MOTORISTA_COLUMNS.map((c) => ({ key: c.key, visible: !c.defaultHidden })),
  sort: MOTORISTA_SORT,
  filters: filters as unknown as Record<string, unknown>,
})

export function builtinViews(): StoredView[] {
  const view = (id: string, name: string, ordem: number, filters: TableFilters): StoredView => ({ id, name, publica: true, mine: false, ordem, config: JSON.stringify(configWith(filters)) })
  return [
    view('com-excecao', 'Com exceção', 1, withQuick([quick('excecao')])),
    view('sem-vinculo', 'Sem vínculo', 2, withQuick([quick('semVinculo')])),
    view('sem-push', 'Sem push', 3, withQuick([quick('semPush')])),
  ]
}
