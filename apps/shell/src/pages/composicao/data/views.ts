import { getXrmHost } from './xrm'

export const COMPOSITION_TABLE = 'cr40f_composicaodeprecos'
export const VIEW_MARKER = 'TelaComposicaoPreco:v1'
const PIN_TABLE = 'new_configuracaovisualizacaocomposicao'

export type ViewColumn = { id: string; width: number; pinned: boolean }
export type ViewFilter = { id: string; operator: 'eq' | 'ne' | 'in' | 'like' | 'not-like' | 'begins-with' | 'not-begins-with' | 'ends-with' | 'not-ends-with' | 'gt' | 'ge' | 'lt' | 'le' | 'null' | 'not-null'; value: string; values?: string[]; nativeAlias?: string }
export type ViewFilterGroup = { id: string; operator: 'and' | 'or'; filters: ViewFilter[] }
export type ViewSort = { id: string; descending: boolean }
export type ViewDefinition = { columns: ViewColumn[]; filters: ViewFilter[]; filterGroups?: ViewFilterGroup[]; groupOperator?: 'and' | 'or'; sort: ViewSort[] }
export type SavedView = { id: string; kind: 'personal' | 'public'; name: string; definition: ViewDefinition; managed: boolean; nativeOnly?: boolean; nativeFiltersEditable?: boolean; sourceFetchXml?: string }
export type ViewQuery = SavedView | { fetchXml: string }
export type CatalogField = { id: string; label: string; table: string; tableLabel?: string; attribute: string; primaryIdAttribute?: string; primaryNameAttribute?: string; path: string[]; relationships?: { from: string; to: string }[]; type: string; available: boolean; pickerEligible?: boolean; writable?: boolean; reason?: string }

type Api = {
  retrieveMultipleRecords: (entity: string, options?: string) => Promise<{ entities: Record<string, unknown>[]; nextLink?: string }>
  retrieveRecord: (entity: string, id: string, options?: string) => Promise<Record<string, unknown>>
  createRecord: (entity: string, data: Record<string, unknown>) => Promise<{ id: string }>
  updateRecord: (entity: string, id: string, data: Record<string, unknown>) => Promise<unknown>
  deleteRecord: (entity: string, id: string) => Promise<unknown>
}

function api(): Api {
  const host = getXrmHost()
  if (!host?.WebApi) throw new Error('Abra a tela pelo Dataverse para usar views.')
  return host.WebApi as unknown as Api
}

function clientUrl() {
  const host = getXrmHost()
  const url = host?.Utility?.getGlobalContext().getClientUrl()
  if (!url) throw new Error('Contexto Dataverse indisponível.')
  return url.replace(/\/+$/, '')
}

type AttributeMetadata = { LogicalName: string; AttributeType: string; DisplayName?: { UserLocalizedLabel?: { Label?: string } }; IsValidForRead?: boolean; IsValidForUpdate?: boolean; IsCustomAttribute?: boolean }
type RelationshipMetadata = { ReferencingEntity: string; ReferencedEntity: string; ReferencingAttribute: string; ReferencedAttribute: string; SchemaName: string }
type EntityMetadata = { LogicalName: string; ObjectTypeCode: number; DisplayName?: { UserLocalizedLabel?: { Label?: string } }; IsCustomEntity?: boolean; PrimaryIdAttribute?: string; PrimaryNameAttribute?: string; Attributes: AttributeMetadata[]; ManyToOneRelationships: RelationshipMetadata[] }

async function entityMetadata(table: string): Promise<EntityMetadata> {
  const url = `${clientUrl()}/api/data/v9.2/EntityDefinitions(LogicalName='${encodeURIComponent(table)}')?$select=LogicalName,ObjectTypeCode,DisplayName,IsCustomEntity,PrimaryIdAttribute,PrimaryNameAttribute&$expand=Attributes($select=LogicalName,AttributeType,DisplayName,IsValidForRead,IsValidForUpdate,IsCustomAttribute),ManyToOneRelationships($select=ReferencingEntity,ReferencedEntity,ReferencingAttribute,ReferencedAttribute,SchemaName)`
  const result = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
  if (!result.ok) throw new Error(`Metadata de ${table}: HTTP ${result.status}`)
  return result.json() as Promise<EntityMetadata>
}

const SIMPLE_TYPES = new Set(['String', 'Memo', 'Integer', 'BigInt', 'Decimal', 'Double', 'Money', 'DateTime', 'Boolean', 'Picklist', 'State', 'Status', 'Lookup', 'Uniqueidentifier'])
const pathSignature = (path: string[], relationships?: { from: string; to: string }[], count = path.length) => path.slice(0, count).map((table, index) => `${table}@${relationships?.[index]?.to ?? ''}`).join('/')

export async function loadColumnCatalog(): Promise<CatalogField[]> {
  const cache = new Map<string, Promise<EntityMetadata>>()
  const get = (table: string) => {
    if (!cache.has(table)) cache.set(table, entityMetadata(table))
    return cache.get(table)!
  }
  // Cada tabela devolve seus campos seguidos dos campos das relações, na ordem das relações; as relações
  // irmãs são buscadas em paralelo (antes eram sequenciais, e cada metadata leva centenas de ms).
  const visit = async (table: string, path: string[], relationships: { from: string; to: string }[], ancestry: string[], customPath = true, lookupPath = true): Promise<CatalogField[]> => {
    const metadata = await get(table)
    const customTablePath = customPath && metadata.IsCustomEntity === true
    const own: CatalogField[] = []
    for (const attribute of metadata.Attributes ?? []) {
      const type = attribute.AttributeType ?? 'Unknown'
      const available = attribute.IsValidForRead !== false && SIMPLE_TYPES.has(type)
      const auditDate = !path.length && table === COMPOSITION_TABLE && (attribute.LogicalName === 'createdon' || attribute.LogicalName === 'modifiedon')
      own.push({ id: relationships.length ? `${pathSignature(path, relationships)}.${attribute.LogicalName}` : attribute.LogicalName, label: auditDate ? attribute.LogicalName === 'createdon' ? 'Criado em' : 'Modificado em' : attribute.DisplayName?.UserLocalizedLabel?.Label || attribute.LogicalName, table, tableLabel: metadata.DisplayName?.UserLocalizedLabel?.Label || table, attribute: attribute.LogicalName, primaryIdAttribute: metadata.PrimaryIdAttribute, primaryNameAttribute: metadata.PrimaryNameAttribute, path, relationships, type, available, writable: attribute.IsValidForUpdate === true, pickerEligible: available && ((!path.length || path.length === 1) && customTablePath && lookupPath && attribute.IsCustomAttribute === true && attribute.LogicalName !== metadata.PrimaryIdAttribute || auditDate), reason: available ? undefined : attribute.IsValidForRead === false ? 'Campo sem leitura disponível' : `Tipo ${type} não aceito como coluna da view` })
    }
    if (path.length === 2) return own
    const related = await Promise.all((metadata.ManyToOneRelationships ?? []).map(async (relation) => {
      if (ancestry.includes(relation.ReferencedEntity)) return []
      const lookup = metadata.Attributes?.find((attribute) => attribute.LogicalName === relation.ReferencingAttribute)
      const directLookup = path.length === 0 && lookup?.AttributeType === 'Lookup'
      try {
        return await visit(relation.ReferencedEntity, [...path, relation.ReferencedEntity], [...relationships, { from: relation.ReferencedAttribute, to: relation.ReferencingAttribute }], [...ancestry, relation.ReferencedEntity], customTablePath, directLookup)
      } catch { return [] /* Relação sem metadata legível: seus campos não podem ser selecionados. */ }
    }))
    return [...own, ...related.flat()]
  }
  const fields = await visit(COMPOSITION_TABLE, [], [], [COMPOSITION_TABLE])
  const route = fields.find((field) => field.table === 'cr40f_reservadeveculos' && field.attribute === 'cr40f_trajeto' && field.relationships?.[0]?.to === 'cr40f_servicorelacionadogeral')
  const client = fields.find((field) => field.table === 'cr40f_clientes1' && field.attribute === 'cr40f_nomedocliente' && field.relationships?.[0]?.to === 'cr40f_servicorelacionadogeral' && field.relationships?.[1]?.to === 'cr40f_cliente')
  if (route) { route.pickerEligible = false; fields.push({ ...route, id: 'route', label: 'Trajeto', pickerEligible: route.available }) }
  if (client) { client.pickerEligible = false; fields.push({ ...client, id: 'client', label: 'Cliente', pickerEligible: false }) }
  const date = fields.find((field) => !field.path.length && field.attribute === 'new_dataehorariodesaidacalculado')
  if (date) date.pickerEligible = false
  fields.push({ id: 'date', label: 'Data', table: COMPOSITION_TABLE, tableLabel: fields.find((field) => field.table === COMPOSITION_TABLE)?.tableLabel, attribute: 'new_dataehorariodesaidacalculado', path: [], type: 'DateTime', available: true, pickerEligible: true })
  return fields
}

function xml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!)
}

export const DEFAULT_COLUMNS: ViewColumn[] = [
  { id: 'client', width: 176, pinned: true },
  { id: 'route', width: 220, pinned: true },
  { id: 'date', width: 138, pinned: true },
]

export function defaultViewDefinition(moneyIds: string[]): ViewDefinition {
  return { columns: [...DEFAULT_COLUMNS, ...moneyIds.map((id) => ({ id, width: 128, pinned: false }))], filters: [], sort: [{ id: 'modifiedon', descending: true }] }
}

function fieldParts(id: string, catalog: CatalogField[]): Pick<CatalogField, 'table' | 'attribute' | 'path' | 'relationships'> {
  const found = catalog.find((field) => field.id === id)
  if (found) return found
  if (id === 'client' || id === 'route') throw new Error(`Metadata de ${id} indisponível.`)
  if (id === 'date') return { table: COMPOSITION_TABLE, attribute: 'new_dataehorariodesaidacalculado', path: [] }
  return { table: COMPOSITION_TABLE, attribute: id, path: [] }
}

export function buildFetchXml(definition: ViewDefinition, catalog: CatalogField[]) {
  const allFilters = [...definition.filters, ...(definition.filterGroups ?? []).flatMap((group) => group.filters)]
  const used = new Set([...definition.columns.map((item) => item.id), ...allFilters.map((item) => item.id), ...definition.sort.map((item) => item.id)])
  for (const id of used) {
    const field = catalog.find((candidate) => candidate.id === id)
    if (!field?.available) throw new Error(`Campo ${id} indisponível para views nativas.`)
  }
  for (const filter of allFilters) {
    const field = catalog.find((candidate) => candidate.id === filter.id)!
    if (['like', 'not-like', 'begins-with', 'not-begins-with', 'ends-with', 'not-ends-with'].includes(filter.operator) && field.type !== 'String' && field.type !== 'Memo') throw new Error(`Operador de texto não é válido para ${field.label}.`)
    if (filter.operator === 'in' ? !filter.values?.length || filter.values.some((value) => !value.trim()) : filter.operator !== 'null' && filter.operator !== 'not-null' && !filter.value.trim()) throw new Error(`Informe um valor para o filtro de ${field.label}.`)
  }
  const fields = [...used].map((id) => ({ id, ...fieldParts(id, catalog) }))
  const links = new Map<string, { table: string; parent: string; from: string; to: string; alias: string; attributes: Set<string> }>()
  for (const field of fields.filter((item) => item.path.length)) {
    let parentKey = ''
    for (const [index, table] of field.path.entries()) {
      const key = pathSignature(field.path, field.relationships, index + 1)
      if (!links.has(key)) {
        const relation = catalog.find((item) => item.id === field.id)?.relationships?.[index]
        if (!relation) throw new Error(`Relação de ${field.id} não disponível no metadata.`)
        const primaryId = catalog.find((candidate) => candidate.table === table)?.primaryIdAttribute ?? relation.from
        links.set(key, { table, parent: parentKey, from: relation.from, to: relation.to, alias: `r${links.size + 1}`, attributes: new Set([relation.from, primaryId]) })
      }
      parentKey = key
    }
    links.get(parentKey)!.attributes.add(field.attribute)
  }
  const baseAttributes = new Set(['cr40f_composicaodeprecosid', 'cr40f_servicorelacionadogeral'])
  fields.filter((item) => !item.path.length).forEach((item) => baseAttributes.add(item.attribute))
  const conditionXml = (filter: ViewFilter) => {
    const field = fieldParts(filter.id, catalog)
    const fieldType = catalog.find((item) => item.id === filter.id)?.type
    const relation = field.path.length ? links.get(pathSignature(field.path, field.relationships)) : null
    const entityname = filter.nativeAlias ? ` entityname="${xml(filter.nativeAlias)}"` : relation ? ` entityname="${relation.alias}"` : ''
    if (filter.operator === 'in') return `<condition attribute="${xml(field.attribute)}" operator="in"${entityname}>${(filter.values ?? []).map((value) => `<value>${xml(value)}</value>`).join('')}</condition>`
    const pattern = fieldType === 'Boolean' ? filter.value === 'true' ? '1' : filter.value === 'false' ? '0' : filter.value : filter.operator === 'like' || filter.operator === 'not-like' ? `%${filter.value}%` : filter.operator === 'begins-with' || filter.operator === 'not-begins-with' ? `${filter.value}%` : filter.operator === 'ends-with' || filter.operator === 'not-ends-with' ? `%${filter.value}` : filter.value
    const value = filter.operator === 'null' || filter.operator === 'not-null' ? '' : ` value="${xml(pattern)}"`
    const operator = fieldType === 'DateTime' && /^\d{4}-\d{2}-\d{2}$/.test(filter.value)
      ? ({ eq: 'on', ge: 'on-or-after', le: 'on-or-before' } as Record<string, string>)[filter.operator] ?? filter.operator
      : filter.operator
    return `<condition attribute="${xml(field.attribute)}" operator="${operator}"${entityname}${value} />`
  }
  const groupedXml = (definition.filterGroups ?? []).filter((group) => group.filters.length).map((group) => `<filter type="${group.operator}">${group.filters.map(conditionXml).join('')}</filter>`).join('')
  const filterXml = definition.filters.map(conditionXml).join('') + (groupedXml ? `<filter type="${definition.groupOperator ?? 'and'}">${groupedXml}</filter>` : '')
  const orderXml = definition.sort.map((sort) => {
    const field = fieldParts(sort.id, catalog)
    const relation = field.path.length ? links.get(pathSignature(field.path, field.relationships)) : null
    return `<order attribute="${xml(field.attribute)}" descending="${sort.descending}"${relation ? ` entityname="${relation.alias}"` : ''} />`
  }).join('')
  const renderLinks = (parent: string): string => [...links.entries()].filter(([, link]) => link.parent === parent).map(([key, link]) =>
    `<link-entity name="${xml(link.table)}" from="${xml(link.from)}" to="${xml(link.to)}" link-type="outer" alias="${link.alias}">${[...link.attributes].map((name) => `<attribute name="${xml(name)}" />`).join('')}${renderLinks(key)}</link-entity>`).join('')
  return `<fetch><entity name="${COMPOSITION_TABLE}">${[...baseAttributes].map((name) => `<attribute name="${xml(name)}" />`).join('')}${filterXml ? `<filter type="and">${filterXml}</filter>` : ''}${orderXml}<order attribute="cr40f_composicaodeprecosid" />${renderLinks('')}</entity></fetch>`
}

function aliases(definition: ViewDefinition, catalog: CatalogField[]) {
  const result = new Map<string, string>()
  const ids = [...new Set([...definition.columns.map((item) => item.id), ...definition.filters.map((item) => item.id), ...(definition.filterGroups ?? []).flatMap((group) => group.filters.map((filter) => filter.id)), ...definition.sort.map((item) => item.id)])]
  for (const id of ids) {
    const path = fieldParts(id, catalog).path
    for (let index = 0; index < path.length; index++) {
      const relationships = fieldParts(id, catalog).relationships
      const key = pathSignature(path, relationships, index + 1)
      if (!result.has(key)) result.set(key, `r${result.size + 1}`)
    }
  }
  return result
}

export function viewValueKey(id: string, definition: ViewDefinition, catalog: CatalogField[]) {
  const field = fieldParts(id, catalog)
  const alias = field.path.length ? aliases(definition, catalog).get(pathSignature(field.path, field.relationships)) : null
  return alias ? `${alias}.${field.attribute}` : field.attribute
}

export function buildLayoutXml(definition: ViewDefinition, catalog: CatalogField[], objectTypeCode: number) {
  const linkAliases = aliases(definition, catalog)
  const cells = definition.columns.map(({ id, width }) => {
    const field = fieldParts(id, catalog)
    const alias = field.path.length ? `${linkAliases.get(pathSignature(field.path, field.relationships))}.` : ''
    return `<cell name="${xml(alias + field.attribute)}" width="${Math.max(60, Math.min(600, Math.round(width)))}" />`
  }).join('')
  return `<grid name="resultset" object="${objectTypeCode}" jump="cr40f_composicaodeprecosid" select="1" icon="1" preview="1"><row name="result" id="cr40f_composicaodeprecosid">${cells}</row></grid>`
}

export function parseLayoutXml(layout: string): ViewColumn[] {
  const document = new DOMParser().parseFromString(layout, 'application/xml')
  if (document.querySelector('parsererror')) return []
  return [...document.querySelectorAll('row > cell')].map((cell) => ({ id: cell.getAttribute('name') ?? '', width: Number(cell.getAttribute('width')) || 128, pinned: false })).filter((cell) => cell.id)
}

export function parseNativeFilters(fetchXml: string, catalog: CatalogField[]): Pick<ViewDefinition, 'filters' | 'filterGroups' | 'groupOperator'> | null {
  const document = new DOMParser().parseFromString(fetchXml, 'application/xml')
  const entity = document.querySelector('fetch > entity')
  if (!entity || document.querySelector('parsererror')) return null
  const aliases = new Map<string, string>()
  const scan = (parent: Element, path: string[]) => {
    for (const link of [...parent.children].filter((child) => child.tagName === 'link-entity')) {
      const next = [...path, `${link.getAttribute('name') ?? ''}@${link.getAttribute('to') ?? ''}`]
      if (link.getAttribute('alias')) aliases.set(link.getAttribute('alias')!, next.join('/'))
      scan(link, next)
    }
  }
  scan(entity, [])
  const condition = (node: Element, link?: Element): ViewFilter | null => {
    const alias = node.getAttribute('entityname')
    const attribute = node.getAttribute('attribute')
    const field = catalog.find((item) => item.available && item.attribute === attribute && (link ? item.table === link.getAttribute('name') : pathSignature(item.path, item.relationships) === (alias ? aliases.get(alias) : '')))
    const rawOperator = node.getAttribute('operator')
    const operator = ({ on: 'eq', 'on-or-after': 'ge', 'on-or-before': 'le' } as Record<string, string>)[rawOperator ?? ''] ?? rawOperator
    if (!field || !operator || !['eq', 'ne', 'in', 'like', 'not-like', 'begins-with', 'not-begins-with', 'ends-with', 'not-ends-with', 'gt', 'ge', 'lt', 'le', 'null', 'not-null'].includes(operator)) return null
    const rawValue = node.getAttribute('value') ?? ''
    const value = field.type === 'Boolean' && (rawValue === '0' || rawValue === '1') ? rawValue === '1' ? 'true' : 'false' : field.type === 'Lookup' ? rawValue.replace(/^\{([0-9a-f-]{36})\}$/i, '$1') : rawValue
    return { id: field.id, operator: operator as ViewFilter['operator'], value: operator === 'like' || operator === 'not-like' ? value.replace(/^%|%$/g, '') : operator === 'begins-with' || operator === 'not-begins-with' ? value.replace(/%$/g, '') : operator === 'ends-with' || operator === 'not-ends-with' ? value.replace(/^%/g, '') : value, ...(operator === 'in' ? { values: [...node.querySelectorAll('value')].map((item) => item.textContent ?? '') } : {}), ...(link ? { nativeAlias: link.getAttribute('alias') ?? undefined } : {}) }
  }
  const filters: ViewFilter[] = []
  const filterGroups: ViewFilterGroup[] = []
  let groupOperator: 'and' | 'or' = 'and'
  const roots = [...entity.children].filter((child) => child.tagName === 'filter')
  for (const [rootIndex, root] of roots.entries()) {
    const rootOperator = root.getAttribute('type') === 'or' ? 'or' : 'and'
    const direct = [...root.children].filter((child) => child.tagName === 'condition')
    const nested = [...root.children].filter((child) => child.tagName === 'filter')
    if (direct.length + nested.length !== root.children.length || (rootOperator === 'or' && (roots.length > 1 || filters.length))) return null
    const parsedDirect = direct.map((child) => condition(child))
    if (parsedDirect.some((item) => !item)) return null
    if (rootOperator === 'and') filters.push(...parsedDirect as ViewFilter[])
    else if (parsedDirect.length) filterGroups.push({ id: `native-${rootIndex}-direct`, operator: 'or', filters: parsedDirect as ViewFilter[] })
    for (const [index, group] of nested.entries()) {
      if ([...group.children].some((child) => child.tagName !== 'condition')) return null
      const parsed = [...group.children].map((child) => condition(child))
      if (parsed.some((item) => !item)) return null
      filterGroups.push({ id: `native-${rootIndex}-${index}`, operator: group.getAttribute('type') === 'or' ? 'or' : 'and', filters: parsed as ViewFilter[] })
    }
    if (rootOperator === 'or') groupOperator = 'or'
  }
  for (const link of [...entity.querySelectorAll('link-entity')]) {
    const linkFilters = [...link.children].filter((child) => child.tagName === 'filter')
    if (!linkFilters.length) continue
    if (link.getAttribute('link-type') !== 'inner' || !link.getAttribute('alias')) return null
    for (const filter of linkFilters) {
      if (filter.getAttribute('type') !== 'and' || [...filter.children].some((child) => child.tagName !== 'condition')) return null
      const parsed = [...filter.children].map((child) => condition(child, link))
      if (parsed.some((item) => !item)) return null
      filters.push(...parsed as ViewFilter[])
    }
  }
  return { filters, ...(filterGroups.length ? { filterGroups, groupOperator } : {}) }
}

function parseNativeDefinition(fetchXml: string, layoutXml: string, catalog: CatalogField[]): ViewDefinition | null {
  const document = new DOMParser().parseFromString(fetchXml, 'application/xml')
  const entity = document.querySelector('fetch > entity')
  if (!entity || entity.getAttribute('name') !== COMPOSITION_TABLE || document.querySelector('parsererror')) return null
  const aliases = new Map<string, string>()
  let supportedLinks = true
  const scan = (parent: Element, relations: string[]) => {
    for (const link of [...parent.children].filter((child) => child.tagName === 'link-entity')) {
      const alias = link.getAttribute('alias')
      const to = link.getAttribute('to')
      const segment = `${link.getAttribute('name') ?? ''}@${to ?? ''}`
      const signature = [...relations, segment].join('/')
      if (!catalog.some((field) => pathSignature(field.path, field.relationships) === signature && field.relationships?.at(-1)?.from === link.getAttribute('from')) || link.querySelector('filter')) supportedLinks = false
      if (alias && to) aliases.set(alias, [...relations, segment].join('/'))
      scan(link, [...relations, segment])
    }
  }
  scan(entity, [])
  if (!supportedLinks) return null
  const resolve = (name: string) => {
    const [alias, attribute] = name.includes('.') ? name.split('.', 2) : ['', name]
    const prefix = alias ? aliases.get(alias) : ''
    const field = catalog.find((item) => item.available && item.attribute === attribute && pathSignature(item.path, item.relationships) === prefix)
    return field?.id
  }
  const rawColumns = parseLayoutXml(layoutXml)
  const columns = rawColumns.map((item) => ({ ...item, id: resolve(item.id) ?? '' }))
  if (!columns.length || columns.some((item) => !item.id)) return null
  const parsedFilters = parseNativeFilters(fetchXml, catalog)
  if (!parsedFilters) return null
  const sort: ViewSort[] = []
  for (const order of [...entity.children].filter((child) => child.tagName === 'order')) {
    const name = `${order.getAttribute('entityname') ? `${order.getAttribute('entityname')}.` : ''}${order.getAttribute('attribute') ?? ''}`
    const id = resolve(name)
    if (!id) return null
    sort.push({ id, descending: order.getAttribute('descending') === 'true' })
  }
  return { columns, ...parsedFilters, sort }
}

function nativeLayoutDefinition(fetchXml: string, layoutXml: string, catalog: CatalogField[]): ViewDefinition {
  const document = new DOMParser().parseFromString(fetchXml, 'application/xml')
  const aliases = new Map<string, string>()
  const scan = (parent: Element, relations: string[]) => {
    for (const link of [...parent.children].filter((child) => child.tagName === 'link-entity')) {
      const next = [...relations, `${link.getAttribute('name') ?? ''}@${link.getAttribute('to') ?? ''}`]
      if (link.getAttribute('alias')) aliases.set(link.getAttribute('alias')!, next.join('/'))
      scan(link, next)
    }
  }
  const entity = document.querySelector('fetch > entity')
  if (entity) scan(entity, [])
  const columns = parseLayoutXml(layoutXml).map(({ id, width }) => {
    const dot = id.indexOf('.')
    const prefix = dot < 0 ? '' : aliases.get(id.slice(0, dot))
    const attribute = dot < 0 ? id : id.slice(dot + 1)
    const field = catalog.find((candidate) => candidate.available && candidate.attribute === attribute && pathSignature(candidate.path, candidate.relationships) === prefix)
    return { id: field?.id ?? id, width, pinned: false }
  })
  return { ...defaultViewDefinition([]), ...parseNativeFilters(fetchXml, catalog), columns: columns.length ? columns : [], sort: [] }
}

export type ViewRows = { personal: Record<string, unknown>[]; publicViews: Record<string, unknown>[]; pins: Record<string, unknown>[] }

/** Busca as views do Dataverse sem depender do catálogo; permite disparar em paralelo com a metadata. */
export async function fetchViewRows(): Promise<ViewRows> {
  const webApi = api()
  const [personal, publicViews, pins] = await Promise.all([
    webApi.retrieveMultipleRecords('userquery', `?$select=userqueryid,name,description,fetchxml,layoutxml&$filter=returnedtypecode eq '${COMPOSITION_TABLE}' and statecode eq 0`),
    webApi.retrieveMultipleRecords('savedquery', `?$select=savedqueryid,name,description,fetchxml,layoutxml,querytype&$filter=returnedtypecode eq '${COMPOSITION_TABLE}' and querytype eq 0 and statecode eq 0`),
    webApi.retrieveMultipleRecords(PIN_TABLE, '?$select=new_viewid,new_pins,new_definition').catch(() => ({ entities: [] as Record<string, unknown>[] })),
  ])
  return { personal: personal.entities, publicViews: publicViews.entities, pins: pins.entities }
}

/** Aceita o catálogo pronto ou em carregamento: as views são buscadas de imediato, em paralelo com a metadata. */
export async function loadViews(catalog: CatalogField[] | Promise<CatalogField[]>): Promise<SavedView[]> {
  const [rows, fields] = await Promise.all([fetchViewRows(), catalog])
  return buildViews(rows, fields)
}

/** Interpreta as views já buscadas com o catálogo disponível. */
export function buildViews({ personal, publicViews, pins }: ViewRows, catalog: CatalogField[]): SavedView[] {
  const pinned = new Map(pins.map((row) => [String(row.new_viewid), String(row.new_pins ?? '').split(',').filter(Boolean)]))
  const definitions = new Map(pins.map((row) => [String(row.new_viewid), String(row.new_definition ?? '')]))
  return [
    ...personal.map((row) => ({ row, kind: 'personal' as const, id: String(row.userqueryid) })),
    ...publicViews.map((row) => ({ row, kind: 'public' as const, id: String(row.savedqueryid) })),
  ].map(({ row, kind, id }) => {
    const description = String(row.description ?? '')
    let stored: ViewDefinition | null = null
    if (description.startsWith(VIEW_MARKER)) {
      try { stored = JSON.parse(definitions.get(id) ?? '') as ViewDefinition } catch { stored = null }
    }
    const parsed = stored ?? parseNativeDefinition(String(row.fetchxml ?? ''), String(row.layoutxml ?? ''), catalog)
    const supported = parsed && parsed.columns.every((column) => catalog.some((field) => field.id === column.id && field.available))
    const definition = supported ? parsed : nativeLayoutDefinition(String(row.fetchxml ?? ''), String(row.layoutxml ?? ''), catalog)
    const hasNativeAlias = [...definition.filters, ...(definition.filterGroups ?? []).flatMap((group) => group.filters)].some((filter) => filter.nativeAlias)
    return { id, kind, name: String(row.name ?? ''), managed: description.startsWith(VIEW_MARKER), nativeOnly: !supported || !description.startsWith(VIEW_MARKER) || hasNativeAlias, nativeFiltersEditable: Boolean(parseNativeFilters(String(row.fetchxml ?? ''), catalog) || stored && hasNativeAlias), sourceFetchXml: String(row.fetchxml ?? ''), definition: { ...definition, columns: definition.columns.map((item) => ({ ...item, pinned: (pinned.get(id) ?? []).includes(item.id) })) } }
  })
}

export async function saveView(name: string, kind: 'personal' | 'public', definition: ViewDefinition, catalog: CatalogField[], existing?: SavedView, fetchXmlOverride?: string) {
  const webApi = api()
  const entity = kind === 'personal' ? 'userquery' : 'savedquery'
  const objectTypeCode = (await entityMetadata(COMPOSITION_TABLE)).ObjectTypeCode
  if (!Number.isInteger(objectTypeCode)) throw new Error('ObjectTypeCode da Composição não encontrado.')
  const source = fetchXmlOverride ? new DOMParser().parseFromString(fetchXmlOverride, 'application/xml') : null
  source?.querySelector('fetch')?.removeAttribute('savedqueryid')
  const payload = { name, description: VIEW_MARKER, returnedtypecode: COMPOSITION_TABLE, querytype: 0, fetchxml: source ? new XMLSerializer().serializeToString(source) : buildFetchXml(definition, catalog), layoutxml: buildLayoutXml(definition, catalog, objectTypeCode) }
  let created = false
  if (existing) {
    if (!existing.managed || existing.kind !== kind) throw new Error('Esta view existente não pode ser alterada por esta tela.')
    await webApi.updateRecord(entity, existing.id, { name, description: VIEW_MARKER, fetchxml: payload.fetchxml, layoutxml: payload.layoutxml })
  } else {
    const result = await webApi.createRecord(entity, payload)
    existing = { id: result.id, kind, name, definition, managed: true }
    created = true
  }
  try {
    const pinRows = await webApi.retrieveMultipleRecords(PIN_TABLE, `?$select=new_configuracaovisualizacaocomposicaoid&$filter=new_viewid eq '${existing.id}'`)
    const pins = definition.columns.filter((item) => item.pinned).map((item) => item.id).join(',')
    if (pinRows.entities[0]) await webApi.updateRecord(PIN_TABLE, String(pinRows.entities[0].new_configuracaovisualizacaocomposicaoid), { new_pins: pins, new_definition: JSON.stringify(definition) })
    else await webApi.createRecord(PIN_TABLE, { new_name: name, new_viewid: existing.id, new_pins: pins, new_definition: JSON.stringify(definition) })
  } catch (error) {
    if (created) {
      try { await webApi.deleteRecord(entity, existing.id) } catch { throw new Error(`View ${existing.id} foi criada, mas a configuração falhou e não pôde ser revertida: ${String(error)}`) }
    }
    throw error
  }
  if (kind === 'public') await publishCompositionViews()
  await webApi.retrieveRecord(entity, existing.id, '?$select=name,layoutxml,fetchxml')
  return existing
}

export async function deleteView(view: SavedView) {
  if (!view.managed) throw new Error('Esta view existente não pode ser excluída por esta tela.')
  const webApi = api()
  await webApi.deleteRecord(view.kind === 'personal' ? 'userquery' : 'savedquery', view.id)
  const pins = await webApi.retrieveMultipleRecords(PIN_TABLE, `?$select=new_configuracaovisualizacaocomposicaoid&$filter=new_viewid eq '${view.id}'`)
  await Promise.all(pins.entities.map((row) => webApi.deleteRecord(PIN_TABLE, String(row.new_configuracaovisualizacaocomposicaoid))))
  if (view.kind === 'public') await publishCompositionViews()
}

async function publishCompositionViews() {
  const response = await fetch(`${clientUrl()}/api/data/v9.2/PublishXml`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ ParameterXml: `<importexportxml><entities><entity>${COMPOSITION_TABLE}</entity></entities></importexportxml>` }) })
  if (!response.ok) throw new Error(`View salva, mas a publicação falhou (HTTP ${response.status}).`)
}
