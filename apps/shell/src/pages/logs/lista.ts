import { CONFIG_VERSION, emptyFilters, normalizeSearch, type FilterField, type FilterOption, type StoredView, type TableFilters, type ViewColumnDef, type ViewConfig, type ViewSort } from '@betinhos/ui'
import { sortRows } from '../../app/listSort'
import type { LogApp } from './data'

/** Lista de logs no padrão das listas do Design System (§10.9.1 e §10.9.2). O período fica fora da visão: decide o que carrega. */

export const TELA = 'logs-apps'
export const LOG_SORT: ViewSort = { key: 'data', dir: 'desc' }

export const PERIODOS: FilterOption[] = [
  { value: '1', label: 'Últimas 24 horas' },
  { value: '7', label: 'Últimos 7 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
]
export const PERIODO_PADRAO = '7'
export const periodoValido = (v: string) => (PERIODOS.some((p) => p.value === v) ? v : PERIODO_PADRAO)
export const periodoStart = (dias: string, now: Date) => new Date(now.getTime() - Number(periodoValido(dias)) * 86_400_000)

export const SEVERIDADES: FilterOption[] = [
  { value: 'critical', label: 'Crítico' },
  { value: 'error', label: 'Erro' },
  { value: 'warning', label: 'Aviso' },
  { value: 'info', label: 'Info' },
]
export const severidadeLabel = (s: string) => SEVERIDADES.find((o) => o.value === s)?.label ?? (s || 'Sem severidade')
export const severidadeTone = (s: string) => (s === 'critical' || s === 'error' ? 'danger' : s === 'warning' ? 'warning' : s === 'info' ? 'info' : 'neutral')

/** Colunas na ordem padrão; a primeira (Mensagem) é fixa. */
export const LOG_COLUMNS: ViewColumnDef[] = [
  { key: 'mensagem', label: 'Mensagem' },
  { key: 'data', label: 'Data' },
  { key: 'app', label: 'App' },
  { key: 'severidade', label: 'Severidade' },
  { key: 'tela', label: 'Tela' },
  { key: 'usuario', label: 'Usuário' },
  { key: 'versao', label: 'Versão' },
]

/** Opções de App vêm dos dados carregados: a tabela recebe de qualquer app que use o logger. */
export function logFields(list: LogApp[]): FilterField[] {
  const apps = [...new Set(list.map((l) => l.app).filter(Boolean))].sort().map((a) => ({ value: a, label: a }))
  return [
    { key: 'mensagem', label: 'Mensagem', kind: 'text' },
    { key: 'data', label: 'Data', kind: 'date' },
    { key: 'app', label: 'App', kind: 'choice', options: apps },
    { key: 'severidade', label: 'Severidade', kind: 'choice', options: SEVERIDADES },
    { key: 'tela', label: 'Tela', kind: 'text' },
    { key: 'usuario', label: 'Usuário', kind: 'text' },
    { key: 'versao', label: 'Versão', kind: 'text' },
    { key: 'codigo', label: 'Código do erro', kind: 'text', advancedOnly: true },
    { key: 'plataforma', label: 'Plataforma', kind: 'text', advancedOnly: true },
  ]
}

export const quemFoi = (l: LogApp) => l.usuario || l.email

export function readLog(l: LogApp, key: string): unknown {
  switch (key) {
    case 'mensagem': return [l.erro, l.mensagem].filter(Boolean).join(' ')
    case 'data': return l.data
    case 'app': return l.app
    case 'severidade': return l.severidade
    case 'tela': return l.tela
    case 'usuario': return [l.usuario, l.email].filter(Boolean).join(' ')
    case 'versao': return l.versao
    case 'codigo': return l.codigo
    case 'plataforma': return l.plataforma
    default: return null
  }
}

/** Busca por palavra-chave: mensagem, erro, código, tela, usuário e app. */
export function matchesKeyword(l: LogApp, query: string) {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = normalizeSearch([l.mensagem, l.erro, l.codigo, l.tela, l.usuario, l.email, l.app, l.versao].join(' '))
  return words.every((w) => hay.includes(w))
}

const PESO: Record<string, number> = { critical: 4, error: 3, warning: 2, info: 1 }

export function sortLogs(list: LogApp[], sort: ViewSort | null) {
  if (!sort) return list
  return sortRows(list, (l) => {
    switch (sort.key) {
      case 'data': return l.data?.getTime()
      case 'severidade': return PESO[l.severidade] ?? 0
      case 'usuario': return quemFoi(l)
      case 'mensagem': case 'app': case 'tela': case 'versao': return l[sort.key] || null
      default: return null
    }
  }, sort.dir)
}

const configWith = (filters: TableFilters): ViewConfig => ({
  v: CONFIG_VERSION,
  columns: LOG_COLUMNS.map((c) => ({ key: c.key, visible: true })),
  sort: LOG_SORT,
  filters: filters as unknown as Record<string, unknown>,
})

/** Visões prontas: uma por app que grava hoje e "só erros e críticos". */
export function builtinViews(): StoredView[] {
  const quick = (field: string, values: string[]): TableFilters => ({
    ...emptyFilters(),
    quick: { [field]: { type: 'condition', id: `rapido-${field}`, field, op: 'in', values: values.map((v) => ({ value: v, label: field === 'severidade' ? severidadeLabel(v) : v })) } },
  })
  const view = (id: string, name: string, ordem: number, filters: TableFilters): StoredView => ({ id, name, publica: true, mine: false, ordem, config: JSON.stringify(configWith(filters)) })
  return [
    view('erros', 'Erros e críticos', 1, quick('severidade', ['critical', 'error'])),
    view('app-motoristas', 'App Motoristas', 2, quick('app', ['App Motoristas'])),
    view('escala-fds', 'Escala FDS', 3, quick('app', ['Escala FDS'])),
    view('sistema', 'Sistema Betinhos', 4, quick('app', ['Sistema Betinhos'])),
  ]
}

/** Payload JSON formatado; se vier cortado ou inválido, mostra o texto como chegou. */
export function formatPayload(raw: string) {
  if (!raw) return ''
  try { return JSON.stringify(JSON.parse(raw), null, 2) } catch { return raw }
}
