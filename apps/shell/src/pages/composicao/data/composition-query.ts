import { keywordTokens } from '../../../app/keywordSearch'
import { compositionKeywordFilter, compositionSearchCatalogFields } from './composition-search'
import { columnAliases, pruneOwnLinks } from './fetch-links'
import { allViewFilters, buildFetchXml, COMPOSITION_TABLE, viewValueKey, type CatalogField, type SavedView, type ViewDefinition, type ViewQuery } from './views'

function addCondition(document: Document, filter: Element, attribute: string, alias: string | null, operator: string, value: string) {
  const condition = document.createElement('condition')
  condition.setAttribute('attribute', attribute)
  condition.setAttribute('operator', operator)
  if (alias) condition.setAttribute('entityname', alias)
  condition.setAttribute('value', value)
  filter.appendChild(condition)
}

function insertFilter(entity: Element, filter: Element) {
  const next = [...entity.children].find((child) => child.tagName === 'order' || child.tagName === 'link-entity')
  entity.insertBefore(filter, next ?? null)
}

export function buildCompositionQuery(definition: ViewDefinition, catalog: CatalogField[], search: string, activeOnly = false) {
  const queryDefinition = { ...definition, columns: [...definition.columns] }
  const tokens = keywordTokens(search)
  const searchFields = tokens.length ? compositionSearchCatalogFields(catalog, definition) : []
  // Cliente e trajeto entram sempre (a linha os lê); os campos de outras tabelas só quando há busca, para o link-entity existir.
  const extraIds = ['client', 'route', ...searchFields.filter((field) => field.path.length).map((field) => field.id)]
  for (const id of extraIds) {
    if (!queryDefinition.columns.some((column) => column.id === id)) queryDefinition.columns.push({ id, width: 128, pinned: false })
  }
  const document = new DOMParser().parseFromString(buildFetchXml(queryDefinition, catalog), 'application/xml')
  const entity = document.querySelector('fetch > entity')!
  if (activeOnly) {
    const filter = document.createElement('filter')
    addCondition(document, filter, 'statecode', null, 'eq', '0')
    insertFilter(entity, filter)
  }
  if (tokens.length) {
    const filter = compositionKeywordFilter(document, tokens, searchFields, (field) => {
      const key = viewValueKey(field.id, queryDefinition, catalog)
      return key.includes('.') ? key.split('.')[0] : null
    })
    if (filter) insertFilter(entity, filter)
  }
  return new XMLSerializer().serializeToString(document)
}

/** Applies grid changes as extra criteria over a native Dataverse view. */
export function buildNativeCompositionQuery(fetchXml: string, definition: ViewDefinition, catalog: CatalogField[], search: string, replaceOriginalFilters = false) {
  const document = new DOMParser().parseFromString(fetchXml, 'application/xml')
  const fetch = document.querySelector('fetch')
  const entity = document.querySelector('fetch > entity')
  if (document.querySelector('parsererror') || !fetch || !entity || entity.getAttribute('name') !== COMPOSITION_TABLE) throw new Error('FetchXML da visualização nativa inválido.')
  if (fetch.getAttribute('aggregate') === 'true') throw new Error('Esta visualização agregada não aceita filtros adicionais nesta grade.')
  if (replaceOriginalFilters) {
    [...entity.children].filter((child) => child.tagName === 'filter').forEach((filter) => filter.remove())
    entity.querySelectorAll('link-entity filter').forEach((filter) => filter.remove())
  }
  // Vínculos que a tela criou em salvamentos anteriores e que nada usa: sem isto cada "Salvar" soma `r1, r2, ui_r1…`.
  pruneOwnLinks(entity, columnAliases(definition.columns))

  const available = new Set(catalog.filter((field) => field.available).map((field) => field.id))
  // A ordem escolhida na grade (Crescente/Decrescente) substitui a da view nativa; sem ela, vale a da view.
  const sort = definition.sort.filter((item) => available.has(item.id))
  const overlay = new DOMParser().parseFromString(buildCompositionQuery({ ...definition, columns: definition.columns.filter((column) => available.has(column.id)), sort }, catalog, search), 'application/xml')
  const overlayEntity = overlay.querySelector('fetch > entity')!
  const usedAliases = new Set([...entity.querySelectorAll('link-entity[alias]')].map((link) => link.getAttribute('alias')!))
  const aliases = new Map<string, string>()
  for (const link of overlayEntity.querySelectorAll('link-entity[alias]')) {
    const original = link.getAttribute('alias')!
    let alias = original
    while (usedAliases.has(alias)) alias = `ui_${alias}`
    aliases.set(original, alias)
    usedAliases.add(alias)
    link.setAttribute('alias', alias)
  }
  for (const condition of overlayEntity.querySelectorAll('condition[entityname], order[entityname]')) {
    const alias = condition.getAttribute('entityname')!
    if (aliases.has(alias)) condition.setAttribute('entityname', aliases.get(alias)!)
  }

  const attributes = new Set([...entity.children].filter((child) => child.tagName === 'attribute').map((child) => child.getAttribute('name')))
  for (const attribute of [...overlayEntity.children].filter((child) => child.tagName === 'attribute')) {
    if (!attributes.has(attribute.getAttribute('name'))) {
      const next = [...entity.children].find((child) => child.tagName !== 'attribute')
      entity.insertBefore(document.importNode(attribute, true), next ?? null)
    }
  }
  const originalFilters = [...entity.children].filter((child) => child.tagName === 'filter')
  const extraFilters = [...overlayEntity.children].filter((child) => child.tagName === 'filter')
  if (extraFilters.length) {
    const combined = document.createElement('filter')
    combined.setAttribute('type', 'and')
    const first = originalFilters[0]
    if (first) entity.insertBefore(combined, first)
    else insertFilter(entity, combined)
    originalFilters.forEach((filter) => combined.appendChild(filter))
    extraFilters.forEach((filter) => combined.appendChild(document.importNode(filter, true)))
  }
  if (sort.length) {
    entity.querySelectorAll('order').forEach((order) => order.remove())
    const firstLink = [...entity.children].find((child) => child.tagName === 'link-entity') ?? null
    for (const order of [...overlayEntity.children].filter((child) => child.tagName === 'order')) entity.insertBefore(document.importNode(order, true), firstLink)
  }
  for (const link of [...overlayEntity.children].filter((child) => child.tagName === 'link-entity')) entity.appendChild(document.importNode(link, true))
  return new XMLSerializer().serializeToString(document)
}

/** View nativa com filtros que a tela não lê: "Salvar como" grava uma cópia ainda nativa, com esses filtros no FetchXML. */
export function lockedNativeCopy(view: SavedView | null, overwrite: boolean) {
  // Sobrescrever só mantém o FetchXML original na própria cópia; nas outras nativas a gravação seria uma view nova.
  return Boolean((!overwrite || view?.nativeCopy) && view?.nativeOnly && !view.nativeFiltersEditable && view.sourceFetchXml)
}

/** FetchXML para gravar a partir de uma view nativa: filtros editáveis substituem os originais; os travados ficam e a grade soma os dela. */
export function nativeSaveSource(view: SavedView | null, definition: ViewDefinition, catalog: CatalogField[], overwrite: boolean) {
  if (!view?.nativeOnly || !view.sourceFetchXml) return undefined
  if (view.nativeFiltersEditable) return buildNativeCompositionQuery(view.sourceFetchXml, definition, catalog, '', true)
  return lockedNativeCopy(view, overwrite) ? buildNativeCompositionQuery(view.sourceFetchXml, definition, catalog, '', false) : undefined
}

/** FetchXML sem os vínculos que a tela deixou para trás; `null` quando não havia nenhum (ou o XML não é legível). */
function withoutOwnLinks(fetchXml: string, definition: ViewDefinition) {
  const document = new DOMParser().parseFromString(fetchXml, 'application/xml')
  const entity = document.querySelector('parsererror') ? null : document.querySelector('fetch > entity')
  if (!entity) return null
  const before = entity.querySelectorAll('link-entity').length
  pruneOwnLinks(entity, columnAliases(definition.columns))
  return entity.querySelectorAll('link-entity').length === before ? null : new XMLSerializer().serializeToString(document)
}

export type ResolvedCompositionQuery = { view: ViewQuery | undefined; error: string | null }

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

/** Resolve a consulta usada pela grade e pela exportação a partir da view, filtros e busca atuais. */
export function resolveCompositionQuery(activeView: SavedView | null, definition: ViewDefinition, catalog: CatalogField[], search: string): ResolvedCompositionQuery {
  const unchanged = Boolean(activeView) && !search && JSON.stringify(definition) === JSON.stringify(activeView!.definition)
  if (activeView?.nativeOnly) {
    // Filtro da definição que não está no FetchXML da visão (cópia nativa com os filtros do usuário) precisa entrar na consulta.
    const definitionFilters = activeView.nativeFiltersEditable || !allViewFilters(definition).length
    // Cópia da tela guarda só a visão original em `sourceFetchXml`: colunas e ordem do usuário saem sempre da definição.
    if (unchanged && definitionFilters && !activeView.nativeCopy) {
      // A grade lê colunas vinculadas pelos aliases gerados (r1, r2…), não pelos aliases da view nativa (a_67d5…).
      const linked = definition.columns.some((column) => catalog.find((field) => field.id === column.id && field.available)?.path.length)
      try {
        if (!linked) {
          // Visão gravada com vínculos da tela que sobraram: a consulta sai sem eles, sem precisar salvar de novo.
          const lean = withoutOwnLinks(activeView.sourceFetchXml ?? '', definition)
          return { view: lean ? { fetchXml: lean } : activeView, error: null }
        }
        return { view: { fetchXml: buildNativeCompositionQuery(activeView.sourceFetchXml ?? '', { ...definition, filters: [], filterGroups: [] }, catalog, '') }, error: null }
      } catch (error) { return { view: undefined, error: errorText(error, 'Não foi possível carregar a visualização nativa.') } }
    }
    try { return { view: { fetchXml: buildNativeCompositionQuery(activeView.sourceFetchXml ?? '', definition, catalog, search, activeView.nativeFiltersEditable) }, error: null } }
    catch (error) { return { view: undefined, error: errorText(error, 'Não foi possível aplicar os filtros à visualização nativa.') } }
  }
  if (!catalog.length) return { view: activeView ?? undefined, error: null }
  if (unchanged) return { view: activeView!, error: null }
  try {
    const available = new Set(catalog.filter((field) => field.available).map((field) => field.id))
    const queryDefinition = { ...definition, columns: definition.columns.filter((item) => available.has(item.id)).map((item) => ({ id: item.id, width: 128, pinned: false })), sort: definition.sort.filter((item) => available.has(item.id)) }
    return { view: { fetchXml: buildCompositionQuery(queryDefinition, catalog, search, !activeView) }, error: null }
  } catch (error) {
    return { view: undefined, error: errorText(error, 'Não foi possível aplicar o filtro.') }
  }
}

/** Converte o FetchXML da grade em uma contagem agregada com os mesmos filtros e vínculos. */
export function buildCountQuery(fetchXml: string) {
  const document = new DOMParser().parseFromString(fetchXml, 'application/xml')
  const fetch = document.querySelector('fetch')
  const entity = document.querySelector('fetch > entity')
  if (document.querySelector('parsererror') || !fetch || !entity || fetch.getAttribute('aggregate') === 'true') return null
  for (const name of ['count', 'page', 'top', 'paging-cookie', 'returntotalrecordcount']) fetch.removeAttribute(name)
  // Os vínculos da linha (reserva e cliente) são só de leitura: a contagem usa apenas os filtros da view.
  removeRowLinks(document)
  fetch.setAttribute('aggregate', 'true')
  fetch.removeAttribute('distinct')
  document.querySelectorAll('attribute, all-attributes, order').forEach((node) => node.remove())
  const count = document.createElement('attribute')
  count.setAttribute('name', `${entity.getAttribute('name')}id`)
  count.setAttribute('alias', 'total')
  count.setAttribute('aggregate', 'countcolumn')
  count.setAttribute('distinct', 'true')
  entity.insertBefore(count, entity.firstChild)
  return dedupeLinks(new XMLSerializer().serializeToString(document)).fetchXml
}

/** Garante tamanho de página e ordem estável no FetchXML para permitir paginação (views com top não são paginadas). */
export function withFetchPageSize(fetchXml: string, pageSize: number) {
  const document = new DOMParser().parseFromString(fetchXml, 'application/xml')
  const fetch = document.querySelector('fetch')
  if (document.querySelector('parsererror') || !fetch || fetch.hasAttribute('top') || fetch.getAttribute('aggregate') === 'true') return fetchXml
  if (!fetch.hasAttribute('count')) fetch.setAttribute('count', String(pageSize))
  // Sem ordem a página do Dataverse não é estável e, para quem não é administrador, o paging cookie pode vir vazio.
  const entity = document.querySelector('fetch > entity')
  if (entity && !document.querySelector('order')) {
    const order = document.createElement('order')
    order.setAttribute('attribute', `${entity.getAttribute('name')}id`)
    entity.appendChild(order)
  }
  return new XMLSerializer().serializeToString(document)
}

/** Garante que o FetchXML da grade traga os atributos base da linha; null quando a consulta não permite (agregada ou inválida). */
export function withBaseAttributes(fetchXml: string, names: readonly string[]) {
  const document = new DOMParser().parseFromString(fetchXml, 'application/xml')
  const fetch = document.querySelector('fetch')
  const entity = document.querySelector('fetch > entity')
  if (document.querySelector('parsererror') || !fetch || !entity || fetch.getAttribute('aggregate') === 'true') return null
  const children = [...entity.children]
  if (children.some((node) => node.tagName === 'all-attributes')) return fetchXml
  const existing = new Set(children.filter((node) => node.tagName === 'attribute').map((node) => node.getAttribute('name')))
  const anchor = children.find((node) => node.tagName !== 'attribute') ?? null
  for (const name of names) {
    if (existing.has(name)) continue
    const attribute = document.createElement('attribute')
    attribute.setAttribute('name', name)
    entity.insertBefore(attribute, anchor)
  }
  return new XMLSerializer().serializeToString(document)
}

/** Tamanho efetivo da página de um FetchXML (count próprio da view, ou o padrão informado). */
export function fetchPageSize(fetchXml: string, fallback: number) {
  const fetch = new DOMParser().parseFromString(fetchXml, 'application/xml').querySelector('fetch')
  const count = Number(fetch?.getAttribute('count'))
  return Number.isInteger(count) && count > 0 ? count : fallback
}

/**
 * Monta o FetchXML da próxima página a partir do fetchXmlPagingCookie do Xrm.WebApi,
 * que não devolve nextLink para consultas FetchXML. A página sempre avança a partir da página
 * pedida; o cookie só entra quando é dessa próxima página e não está vazio. Em views com ordem
 * na link-entity (ex.: distinct ordenado pela Reserva) o Dataverse devolve sempre pagenumber="2"
 * com cookie vazio, e seguir esse número repetia a página 2.
 */
export function nextFetchXmlPage(fetchXml: string, pagingCookie?: string) {
  const document = new DOMParser().parseFromString(fetchXml, 'application/xml')
  const fetch = document.querySelector('fetch')
  if (document.querySelector('parsererror') || !fetch) return null
  const cookie = pagingCookie ? new DOMParser().parseFromString(pagingCookie, 'application/xml').querySelector('cookie') : null
  const encoded = cookie?.getAttribute('pagingcookie')
  const page = (Number(fetch.getAttribute('page')) || 1) + 1
  fetch.setAttribute('page', String(page))
  if (encoded && Number(cookie?.getAttribute('pagenumber')) === page) fetch.setAttribute('paging-cookie', decodeURIComponent(decodeURIComponent(encoded)))
  else fetch.removeAttribute('paging-cookie')
  return new XMLSerializer().serializeToString(document)
}

/** Leva junto a chave (`from`) de cada vínculo com alias da view: sem ela a coluna relacionada não sabe qual registro editar. */
export function withLinkKeys(fetchXml: string) {
  const document = new DOMParser().parseFromString(fetchXml, 'application/xml')
  const fetch = document.querySelector('fetch')
  if (document.querySelector('parsererror') || !fetch || fetch.getAttribute('aggregate') === 'true') return fetchXml
  let changed = false
  for (const link of document.querySelectorAll('link-entity[alias]')) {
    const from = link.getAttribute('from')
    const children = [...link.children]
    if (!from || children.some((node) => node.tagName === 'all-attributes' || node.tagName === 'attribute' && node.getAttribute('name') === from)) continue
    const attribute = document.createElement('attribute')
    attribute.setAttribute('name', from)
    link.insertBefore(attribute, children.find((node) => node.tagName !== 'attribute') ?? null)
    changed = true
  }
  return changed ? new XMLSerializer().serializeToString(document) : fetchXml
}

/** Aliases fixos dos vínculos que levam reserva e cliente na consulta principal; não colidem com os da view (a_…, r1…). */
export const ROW_LINKS = { reserva: 'cmp_res', cliente: 'cmp_cli' } as const

const RESERVATION_LINK_ATTRIBUTES = ['cr40f_trajeto', 'cr40f_endereodesada', 'cr40f_destino', 'cr40f_dataehorriodesada', 'cr40f_cliente', 'cr40f_status', 'cr40f_tipodoservico', 'cr40f_tipodeveiculo', 'cr40f_passageiro1', 'cr40f_passageiro2', 'cr40f_passageiro3', 'cr40f_passageiro4']
const CLIENT_LINK_ATTRIBUTES = ['cr40f_nomedocliente', 'cr40f_registro', 'cr40f_endereco']

function linkWithAttributes(document: Document, attributes: { entity: string; from: string; to: string; alias: string; names: string[] }) {
  const link = document.createElement('link-entity')
  link.setAttribute('name', attributes.entity)
  link.setAttribute('from', attributes.from)
  link.setAttribute('to', attributes.to)
  link.setAttribute('link-type', 'outer')
  link.setAttribute('alias', attributes.alias)
  for (const name of attributes.names) {
    const attribute = document.createElement('attribute')
    attribute.setAttribute('name', name)
    link.appendChild(attribute)
  }
  return link
}

function removeRowLinks(document: Document) {
  document.querySelectorAll(`link-entity[alias="${ROW_LINKS.reserva}"], link-entity[alias="${ROW_LINKS.cliente}"]`).forEach((link) => link.remove())
}

/** Garante na consulta os vínculos reserva→cliente usados pela linha; idempotente, e devolve a consulta como veio quando é agregada ou inválida. */
export function withRowLinks(fetchXml: string) {
  const document = new DOMParser().parseFromString(fetchXml, 'application/xml')
  const fetch = document.querySelector('fetch')
  const entity = document.querySelector('fetch > entity')
  if (document.querySelector('parsererror') || !fetch || !entity || fetch.getAttribute('aggregate') === 'true') return fetchXml
  if (document.querySelector(`link-entity[alias="${ROW_LINKS.reserva}"]`)) return fetchXml
  const reservation = linkWithAttributes(document, { entity: 'cr40f_reservadeveculos', from: 'cr40f_reservadeveculosid', to: 'cr40f_servicorelacionadogeral', alias: ROW_LINKS.reserva, names: RESERVATION_LINK_ATTRIBUTES })
  reservation.appendChild(linkWithAttributes(document, { entity: 'cr40f_clientes1', from: 'cr40f_clientes1id', to: 'cr40f_cliente', alias: ROW_LINKS.cliente, names: CLIENT_LINK_ATTRIBUTES }))
  entity.appendChild(reservation)
  return new XMLSerializer().serializeToString(document)
}

const linkType = (link: Element) => link.getAttribute('link-type') ?? 'inner'
const hasFilter = (link: Element) => [...link.children].some((child) => child.tagName === 'filter')

/**
 * Funde vínculos repetidos (mesma tabela, from e to sob o mesmo pai): a view nativa, as colunas da grade e a linha
 * pedem a mesma reserva/cliente com aliases diferentes, e o Dataverse recusa mais de 15 link-entity.
 * Só funde vínculo outer sem filtro num igual sem filtro (o inner já restringe as linhas). `aliases` = [removido, mantido].
 */
export function dedupeLinks(fetchXml: string): { fetchXml: string; aliases: [string, string][] } {
  const document = new DOMParser().parseFromString(fetchXml, 'application/xml')
  const entity = document.querySelector('fetch > entity')
  if (document.querySelector('parsererror') || !entity) return { fetchXml, aliases: [] }
  const aliases: [string, string][] = []
  const merge = (parent: Element) => {
    const kept: Element[] = []
    for (const link of [...parent.children].filter((child) => child.tagName === 'link-entity')) {
      const alias = link.getAttribute('alias')
      const target = alias && linkType(link) === 'outer' && !hasFilter(link)
        ? kept.find((candidate) => ['name', 'from', 'to'].every((name) => candidate.getAttribute(name) === link.getAttribute(name)) && candidate.getAttribute('alias') && ['inner', 'outer'].includes(linkType(candidate)) && !hasFilter(candidate))
        : undefined
      if (!target) { kept.push(link); continue }
      const keptAlias = target.getAttribute('alias')!
      const names = new Set([...target.children].filter((child) => child.tagName === 'attribute').map((child) => child.getAttribute('name')))
      for (const child of [...link.children]) {
        if (child.tagName === 'attribute' && names.has(child.getAttribute('name'))) continue
        target.appendChild(child)
      }
      link.remove()
      document.querySelectorAll(`[entityname="${alias}"]`).forEach((node) => node.setAttribute('entityname', keptAlias))
      for (const pair of aliases) if (pair[1] === alias) pair[1] = keptAlias
      aliases.push([alias!, keptAlias])
    }
    kept.forEach(merge)
  }
  merge(entity)
  return aliases.length ? { fetchXml: new XMLSerializer().serializeToString(document), aliases } : { fetchXml, aliases }
}

/** Devolve à linha as colunas dos vínculos fundidos com o alias original (`removido.campo`), como se a consulta não tivesse sido fundida. */
export function expandLinkAliases<T extends Record<string, unknown>>(row: T, aliases: [string, string][]): T {
  if (!aliases.length) return row
  const result: Record<string, unknown> = { ...row }
  for (const [removed, kept] of aliases) {
    const prefix = `${kept}.`
    for (const [key, value] of Object.entries(row)) if (key.startsWith(prefix)) result[`${removed}.${key.slice(prefix.length)}`] = value
  }
  return result as T
}

/** Tira os vínculos da linha (caminho de quem não tem leitura na reserva ou no cliente). */
export function withoutRowLinks(fetchXml: string) {
  const document = new DOMParser().parseFromString(fetchXml, 'application/xml')
  if (document.querySelector('parsererror') || !document.querySelector(`link-entity[alias="${ROW_LINKS.reserva}"]`)) return fetchXml
  removeRowLinks(document)
  return new XMLSerializer().serializeToString(document)
}
