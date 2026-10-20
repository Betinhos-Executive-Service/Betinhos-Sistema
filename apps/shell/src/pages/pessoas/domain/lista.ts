import { CONFIG_VERSION, emptyFilters, normalizeSearch, type FilterCondition, type FilterField, type FilterOption, type StoredView, type TableFilters, type ViewColumnDef, type ViewConfig } from '@betinhos/ui'
import { CLASSIFICACAO, STATUS, label } from './choices'
import type { Filters, ViewFilters } from './filters'
import type { ChoiceSet, Pessoa } from './types'

/**
 * A lista de Pessoas no padrão do Design System (§10.9.1 e §10.9.2): colunas da visão, campos de filtro, leitura de
 * cada campo para filtrar em memória (a tela carrega o cadastro inteiro) e as visões prontas.
 */

export const TELA = 'pessoas'

/** Colunas na ordem padrão; a primeira (Pessoa) é fixa. */
export const PESSOA_COLUMNS: ViewColumnDef[] = [
  { key: 'nome', label: 'Pessoa' },
  { key: 'cliente', label: 'Cliente' },
  { key: 'contato', label: 'Contato' },
  { key: 'tags', label: 'Classificação' },
  { key: 'ultimo', label: 'Último serviço' },
  { key: 'acoes', label: 'Ações rápidas' },
]

const options = (list: { value: number; label: string }[]): FilterOption[] => list.map((o) => ({ value: String(o.value), label: o.label }))

/** Campos filtráveis: os das colunas entram no filtro rápido; os demais só no avançado. */
export function pessoaFields(choices: ChoiceSet, clientes: FilterOption[]): FilterField[] {
  return [
    { key: 'nome', label: 'Pessoa', kind: 'text' },
    { key: 'cliente', label: 'Cliente', kind: 'choice', options: clientes },
    { key: 'contato', label: 'Contato', kind: 'text' },
    { key: 'tags', label: 'Classificação', kind: 'choice', options: options(choices.classificacao) },
    { key: 'ultimo', label: 'Último serviço', kind: 'date' },
    { key: 'status', label: 'Status', kind: 'choice', options: options(choices.status), advancedOnly: true },
    { key: 'idioma', label: 'Idioma', kind: 'choice', options: options(choices.idioma), advancedOnly: true },
    { key: 'cargo', label: 'Cargo', kind: 'choice', options: options(choices.cargo), advancedOnly: true },
    { key: 'departamento', label: 'Departamento', kind: 'text', advancedOnly: true },
    { key: 'duplicado', label: 'Possível duplicado', kind: 'bool', options: [{ value: '1', label: 'Sim' }, { value: '0', label: 'Não' }], advancedOnly: true },
  ]
}

const asText = (v: number | null) => (v == null ? null : String(v))

/** Valor de cada campo na pessoa (para `matchesFilters` e para ordenar). */
export function readPessoa(p: Pessoa, key: string, dupIds: Set<string>): unknown {
  switch (key) {
    case 'nome': return p.nome
    case 'cliente': return p.clienteId || null
    case 'contato': return [p.telefone, p.telefone.replace(/\D/g, ''), p.email].filter(Boolean).join(' ')
    case 'tags': return asText(p.classificacao)
    case 'ultimo': return p.ultimoServico || null
    case 'status': return asText(p.status)
    case 'idioma': return asText(p.idioma)
    case 'cargo': return asText(p.cargo)
    case 'departamento': return p.departamento
    case 'duplicado': return dupIds.has(p.id)
    default: return null
  }
}

/** Texto em que a busca procura (não fica na visão): nome, cliente, celular, e-mail, departamento e cargo. */
export const pessoaKeywordText = (p: Pessoa, cargo: string) => [p.nome, p.cliente, p.telefone, p.telefone.replace(/\D/g, ''), p.email, p.departamento, cargo].filter(Boolean).join(' ')

/** Busca por palavra-chave: todas as palavras aparecem no texto da pessoa. */
export function matchesKeyword(p: Pessoa, query: string, cargo: string) {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const text = normalizeSearch(pessoaKeywordText(p, cargo))
  return words.every((w) => text.includes(w))
}

/** Ordena pela coluna da visão; vazios por último. */
export function sortPessoas(list: Pessoa[], key: string, dir: 'asc' | 'desc', choices: ChoiceSet) {
  const value = (p: Pessoa) => {
    if (key === 'nome') return p.nome
    if (key === 'cliente') return p.cliente
    if (key === 'ultimo') return p.ultimoServico
    if (key === 'tags') return label(choices.classificacao, p.classificacao)
    return ''
  }
  const sign = dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    const x = value(a)
    const y = value(b)
    if (!x || !y) return x === y ? 0 : x ? -1 : 1
    return x.localeCompare(y, 'pt-BR') * sign
  })
}

const cond = (field: string, op: FilterCondition['op'], values?: FilterOption[]): FilterCondition => ({ type: 'condition', id: `${field}-${op}`, field, op, ...(values ? { values } : {}) })
const one = (value: number, list: { value: number; label: string }[]): FilterOption[] => [{ value: String(value), label: label(list, value) }]

/** Filtros do formato antigo (barra de Pessoas e visões salvas no navegador) no formato novo. */
export function fromLegacyFilters(f: ViewFilters | Filters, choices: ChoiceSet, clientes: FilterOption[]): TableFilters {
  const filters = emptyFilters()
  if (f.clienteId) filters.quick.cliente = { ...cond('cliente', 'in', [clientes.find((c) => c.value === f.clienteId) ?? { value: f.clienteId, label: f.clienteId }]), id: 'rapido-cliente' }
  if (f.classificacao.length) filters.quick.tags = { ...cond('tags', 'in', f.classificacao.flatMap((v) => one(v, choices.classificacao))), id: 'rapido-tags' }
  if (f.idioma != null) filters.advanced.items.push(cond('idioma', 'in', one(f.idioma, choices.idioma)))
  if (f.status != null) filters.advanced.items.push(cond('status', 'in', one(f.status, choices.status)))
  if (f.duplicados) filters.advanced.items.push(cond('duplicado', 'yes'))
  return filters
}

const configWith = (filters: TableFilters): ViewConfig => ({
  v: CONFIG_VERSION,
  columns: PESSOA_COLUMNS.map((c) => ({ key: c.key, visible: true })),
  sort: { key: 'nome', dir: 'asc' },
  filters: filters as unknown as Record<string, unknown>,
})

/** Visões prontas (públicas e só leitura), as mesmas que a tela tinha antes. */
export function builtinViews(choices: ChoiceSet): StoredView[] {
  const view = (id: string, name: string, ordem: number, filters: TableFilters): StoredView => ({ id, name, publica: true, mine: false, ordem, config: JSON.stringify(configWith(filters)) })
  const quickTags = (value: number) => ({ ...emptyFilters(), quick: { tags: { ...cond('tags', 'in', one(value, choices.classificacao)), id: 'rapido-tags' } } })
  const advanced = (...items: FilterCondition[]) => ({ ...emptyFilters(), advanced: { ...emptyFilters().advanced, items } })
  return [
    view('ativos', 'Ativos', 1, advanced(cond('status', 'in', one(STATUS.ativo, choices.status)))),
    view('frequentes', 'Passageiros frequentes', 2, quickTags(CLASSIFICACAO.frequente)),
    view('solicitantes', 'Solicitantes', 3, quickTags(CLASSIFICACAO.solicitante)),
    view('duplicados', 'Possíveis duplicados', 4, advanced(cond('duplicado', 'yes'))),
  ]
}

/** Configuração de uma visão salva no navegador (formato antigo), para importar para o Dataverse. */
export const legacyViewConfig = (f: ViewFilters, choices: ChoiceSet, clientes: FilterOption[]) => JSON.stringify(configWith(fromLegacyFilters(f, choices, clientes)))
