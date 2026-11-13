import type { CatalogField } from './views'

/**
 * Cache do catálogo de campos (metadata do Dataverse) no navegador, compartilhado entre abas e sessões:
 * sem ele, cada aba nova relia a metadata das tabelas relacionadas antes de mostrar a grade.
 * Dentro da validade, o catálogo é usado imediatamente e a metadata não sai na abertura: é conferida com o navegador ocioso,
 * depois da primeira página, e só muda a tela quando o schema realmente mudou. Não guarda dados de registros.
 *
 * O catálogo cru do DEV tem 16 mil campos e 8,4 milhões de caracteres, acima da cota do `localStorage`.
 * Por isso é gravado enxuto: dados de tabela e caminho uma vez por grupo e textos repetidos num dicionário.
 */
const CACHE_VERSION = 2
const MAX_AGE_MS = 12 * 60 * 60 * 1000

/** Dados de tabela e caminho, iguais em todos os campos do grupo; o JSON descarta os ausentes e mantém os nulos da metadata. */
type Group = Pick<CatalogField, 'table' | 'tableLabel' | 'primaryIdAttribute' | 'primaryNameAttribute' | 'path' | 'relationships'>
/** Grupo, atributo, rótulo (-1 = igual ao atributo), tipo, flags e, quando preciso, motivo e id fora do padrão. */
type Row = [group: number, attribute: number, label: number, type: number, flags: number, reason?: number | null, id?: string]
type CompactCatalog = { strings: string[]; groups: Group[]; rows: Row[] }
type CachedCatalog = { version: number; savedAt: number } & CompactCatalog

export function catalogCacheKey(clientUrl: string) {
  return `tela-composicao-preco:catalog:v${CACHE_VERSION}:${clientUrl.replace(/\/+$/, '').toLocaleLowerCase('en-US')}`
}

function storage(): Storage | null {
  try { return window.localStorage } catch { return null }
}

const defaultId = (field: Pick<CatalogField, 'path' | 'relationships' | 'attribute'>) =>
  field.relationships?.length ? `${field.path.map((table, index) => `${table}@${field.relationships?.[index]?.to ?? ''}`).join('/')}.${field.attribute}` : field.attribute
/** Booleano opcional em três estados (ausente, falso, verdadeiro), para a volta ser idêntica. */
const tri = (value: boolean | undefined) => value === undefined ? 0 : value ? 2 : 1
const untri = (value: number) => value === 0 ? undefined : value === 2

function compact(fields: CatalogField[]): CompactCatalog {
  const strings = new Map<string, number>()
  const text = (value: string) => {
    let index = strings.get(value)
    if (index === undefined) { index = strings.size; strings.set(value, index) }
    return index
  }
  const groups = new Map<string, number>()
  const rows = fields.map((field): Row => {
    const groupKey = JSON.stringify({ table: field.table, tableLabel: field.tableLabel, primaryIdAttribute: field.primaryIdAttribute, primaryNameAttribute: field.primaryNameAttribute, path: field.path, relationships: field.relationships } satisfies Group)
    let group = groups.get(groupKey)
    if (group === undefined) { group = groups.size; groups.set(groupKey, group) }
    const row: Row = [group, text(field.attribute), field.label === field.attribute ? -1 : text(field.label), text(field.type), tri(field.available) + 3 * tri(field.writable) + 9 * tri(field.pickerEligible)]
    const customId = field.id !== defaultId(field)
    if (field.reason !== undefined || customId) row.push(field.reason === undefined ? null : text(field.reason))
    if (customId) row.push(field.id)
    return row
  })
  return { strings: [...strings.keys()], groups: [...groups.keys()].map((key) => JSON.parse(key) as Group), rows }
}

function expand({ strings, groups, rows }: CompactCatalog): CatalogField[] {
  const text = (index: number) => {
    const value = strings[index]
    if (typeof value !== 'string') throw new Error('Cache do catálogo inválido.')
    return value
  }
  return rows.map(([groupIndex, attributeIndex, labelIndex, typeIndex, flags, reasonIndex, id]) => {
    const group = groups[groupIndex]
    if (!group || typeof group.table !== 'string' || !Array.isArray(group.path)) throw new Error('Cache do catálogo inválido.')
    const attribute = text(attributeIndex)
    const field: CatalogField = { ...group, id: '', label: labelIndex === -1 ? attribute : text(labelIndex), attribute, type: text(typeIndex), available: untri(flags % 3) === true }
    const writable = untri(Math.floor(flags / 3) % 3)
    const pickerEligible = untri(Math.floor(flags / 9) % 3)
    if (writable !== undefined) field.writable = writable
    if (pickerEligible !== undefined) field.pickerEligible = pickerEligible
    if (typeof reasonIndex === 'number') field.reason = text(reasonIndex)
    field.id = typeof id === 'string' ? id : defaultId(field)
    return field
  })
}

export function readCachedCatalog(key: string, now = Date.now()): CatalogField[] | null {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CachedCatalog>
    if (parsed.version !== CACHE_VERSION || typeof parsed.savedAt !== 'number' || !Array.isArray(parsed.strings) || !Array.isArray(parsed.groups) || !Array.isArray(parsed.rows)) return null
    if (now - parsed.savedAt > MAX_AGE_MS || !parsed.rows.length) return null
    return expand(parsed as CachedCatalog)
  } catch {
    return null
  }
}

export function writeCachedCatalog(key: string, fields: CatalogField[], now = Date.now()) {
  const store = storage()
  if (!store) return
  try { store.setItem(key, JSON.stringify({ version: CACHE_VERSION, savedAt: now, ...compact(fields) } satisfies CachedCatalog)) }
  catch { /* Cota cheia ou armazenamento bloqueado: a tela segue sem cache. */ }
}

/** Compara pelo formato enxuto: não depende da ordem das propriedades, que muda na volta do cache. */
export function sameCatalog(left: CatalogField[], right: CatalogField[]) {
  return left.length === right.length && JSON.stringify(compact(left)) === JSON.stringify(compact(right))
}
