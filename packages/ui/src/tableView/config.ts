/** Modelo puro das visões de tabela (Design System §10.9.1): o que a visão guarda e como se ajusta às colunas do código. */

export const MIN_COLUMN_WIDTH = 90
export const MAX_COLUMN_WIDTH = 1200
export const CONFIG_VERSION = 1

/** O que a tela declara de cada coluna; a primeira é o título do registro. */
export type ViewColumnDef = {
  key: string
  /** Texto do painel de colunas e dos anúncios de leitor de tela. */
  label: string
  /** Começa oculta na visão padrão e quando aparece como coluna nova numa visão salva. */
  defaultHidden?: boolean
}

export type ViewColumnState = { key: string; visible: boolean; width?: number }
export type SortDir = 'asc' | 'desc'
export type ViewSort = { key: string; dir: SortDir } | null
export type ViewFilters = Record<string, unknown>

export type ViewConfig = { v: typeof CONFIG_VERSION; columns: ViewColumnState[]; sort: ViewSort; filters: ViewFilters }

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/** Largura aceita só entre 90 e 1200 px, inteira; fora disso a coluna volta à largura da tabela. */
export function cleanWidth(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_COLUMN_WIDTH && value <= MAX_COLUMN_WIDTH ? Math.round(value) : undefined
}

const column = (key: string, visible: boolean, width?: number): ViewColumnState => (width === undefined ? { key, visible } : { key, visible, width })

/** Visão padrão da tela: colunas na ordem do código, sem larguras salvas. */
export function defaultConfig(defs: ViewColumnDef[], sort: ViewSort = null, filters: ViewFilters = {}): ViewConfig {
  return enforce({ v: CONFIG_VERSION, columns: defs.map((d) => column(d.key, !d.defaultHidden)), sort, filters }, defs)
}

/** Primeira coluna do código sempre visível e em primeiro; ao menos uma coluna visível. */
function enforce(config: ViewConfig, defs: ViewColumnDef[]): ViewConfig {
  const first = defs[0]?.key
  if (!first) return config
  const head = config.columns.find((c) => c.key === first) ?? column(first, true)
  const columns = [{ ...head, visible: true }, ...config.columns.filter((c) => c.key !== first)]
  return { ...config, columns }
}

/**
 * Ajusta uma configuração salva (ou qualquer valor lido do Dataverse) às colunas atuais:
 * coluna que deixou de existir sai; coluna nova entra no fim, visível só se for visível na padrão;
 * larguras inválidas e ordenação por coluna inexistente voltam ao padrão.
 */
export function normalizeConfig(raw: unknown, defs: ViewColumnDef[], fallback: ViewConfig = defaultConfig(defs)): ViewConfig {
  if (!isObject(raw) || raw.v !== CONFIG_VERSION || !Array.isArray(raw.columns)) return fallback
  const known = new Map(defs.map((d) => [d.key, d]))
  const seen = new Set<string>()
  const columns: ViewColumnState[] = []
  for (const item of raw.columns) {
    if (!isObject(item) || typeof item.key !== 'string' || !known.has(item.key) || seen.has(item.key)) continue
    seen.add(item.key)
    columns.push(column(item.key, item.visible !== false, cleanWidth(item.width)))
  }
  for (const def of defs) if (!seen.has(def.key)) columns.push(column(def.key, !def.defaultHidden))
  const sort: ViewSort = isObject(raw.sort) && typeof raw.sort.key === 'string' && known.has(raw.sort.key) && (raw.sort.dir === 'asc' || raw.sort.dir === 'desc')
    ? { key: raw.sort.key, dir: raw.sort.dir }
    : raw.sort === null ? null : fallback.sort
  const filters = isObject(raw.filters) ? raw.filters : fallback.filters
  return enforce({ v: CONFIG_VERSION, columns, sort, filters }, defs)
}

/** Lê o texto gravado em `cr40f_configuracao`; texto inválido vira `null` (a tela usa a padrão). */
export function parseConfig(text: string | null | undefined): unknown {
  if (!text) return null
  try { return JSON.parse(text) as unknown } catch { return null }
}

export const serializeConfig = (config: ViewConfig) => JSON.stringify(config)

/** JSON com chaves em ordem, para comparar filtros sem depender da ordem de inserção. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (isObject(value)) return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

/** Mesma visão na tela: decide o rótulo "Alterada". */
export const sameConfig = (a: ViewConfig, b: ViewConfig) => stable(a) === stable(b)

/** Colunas visíveis, na ordem da visão. */
export const visibleColumns = (config: ViewConfig) => config.columns.filter((c) => c.visible)

/** Move a coluna para a posição `to` (0 = primeira); a primeira coluna do código não sai do lugar e nada passa à frente dela. */
export function moveColumn(config: ViewConfig, defs: ViewColumnDef[], key: string, to: number): ViewConfig {
  const first = defs[0]?.key
  const from = config.columns.findIndex((c) => c.key === key)
  if (from < 0 || key === first) return config
  const columns = [...config.columns]
  const [moved] = columns.splice(from, 1)
  const min = first ? 1 : 0
  columns.splice(Math.min(Math.max(to, min), columns.length), 0, moved)
  return { ...config, columns }
}

/**
 * Move entre as colunas visíveis (arraste no cabeçalho e `Alt+←/→`): `index` é a posição final entre as visíveis.
 * As ocultas não contam e ficam onde estavam em relação às demais.
 */
export function moveVisibleColumn(config: ViewConfig, defs: ViewColumnDef[], key: string, index: number): ViewConfig {
  const rest = config.columns.filter((c) => c.key !== key)
  const visible = rest.filter((c) => c.visible)
  if (!config.columns.some((c) => c.key === key) || !visible.length) return config
  const to = index < visible.length ? rest.indexOf(visible[Math.max(index, 0)]) : rest.indexOf(visible[visible.length - 1]) + 1
  return moveColumn(config, defs, key, to)
}

/** Mostra ou oculta; a primeira coluna e a última visível não podem ser ocultadas. */
export function toggleColumn(config: ViewConfig, defs: ViewColumnDef[], key: string): ViewConfig {
  const target = config.columns.find((c) => c.key === key)
  if (!target || key === defs[0]?.key) return config
  if (target.visible && visibleColumns(config).length <= 1) return config
  return { ...config, columns: config.columns.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c)) }
}

/** Ajusta a largura, presa entre 90 e 1200 px; `null` volta à largura da tabela. */
export function resizeColumn(config: ViewConfig, key: string, width: number | null): ViewConfig {
  const next = width === null ? undefined : Math.round(Math.min(Math.max(width, MIN_COLUMN_WIDTH), MAX_COLUMN_WIDTH))
  return { ...config, columns: config.columns.map((c) => (c.key === key ? column(c.key, c.visible, next) : c)) }
}

/** Clique no cabeçalho: outra coluna começa crescente; a mesma alterna o sentido. */
export function toggleSort(config: ViewConfig, key: string): ViewConfig {
  const dir: SortDir = config.sort?.key === key && config.sort.dir === 'asc' ? 'desc' : 'asc'
  return { ...config, sort: { key, dir } }
}

export const setFilters = (config: ViewConfig, filters: ViewFilters): ViewConfig => ({ ...config, filters })
