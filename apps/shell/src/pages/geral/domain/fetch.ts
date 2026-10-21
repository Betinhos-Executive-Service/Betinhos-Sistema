import { searchConditions } from './search'
import { ID_ATTRIBUTE, type Sort } from './types'

type BuildOptions = { page: number; pageSize: number; cookie: string | null; sort: Sort; query: string; quickFind: string[] }

export function parse(fetchxml: string) {
  const doc = new DOMParser().parseFromString(fetchxml, 'text/xml')
  const root = doc.documentElement
  const entity = root?.tagName === 'fetch' ? Array.from(root.children).find((c) => c.tagName === 'entity') : undefined
  if (!root || doc.getElementsByTagName('parsererror').length || !entity) throw new Error('FetchXML da visão inválido.')
  return { doc, root, entity }
}

/** Substitui todos os `<order>` da entidade pela ordenação da coluna (na entidade raiz ou no link-entity do alias). */
export function applySort(doc: Document, entity: Element, sort: NonNullable<Sort>) {
  for (const order of Array.from(entity.children).filter((c) => c.tagName === 'order')) order.remove()
  const order = doc.createElement('order')
  order.setAttribute('attribute', sort.attribute)
  order.setAttribute('descending', String(sort.descending))
  const link = sort.alias ? Array.from(entity.querySelectorAll('link-entity')).find((l) => l.getAttribute('alias') === sort.alias) : null
  if (sort.alias && !link) throw new Error(`Coluna ${sort.alias}.${sort.attribute} não pertence a esta visão.`)
  ;(link ?? entity).appendChild(order)
}

/** Busca por palavra-chave: filtro OR com `like '%termo%'` nos campos de localização rápida (ver `searchConditions`). */
function injectSearch(doc: Document, entity: Element, query: string, quickFind: string[]) {
  const conditions = searchConditions(query, quickFind)
  if (!conditions.length) return
  const filter = doc.createElement('filter')
  filter.setAttribute('type', 'or')
  for (const { attribute, value } of conditions) {
    const condition = doc.createElement('condition')
    condition.setAttribute('attribute', attribute)
    condition.setAttribute('operator', 'like')
    condition.setAttribute('value', value)
    filter.appendChild(condition)
  }
  entity.appendChild(filter)
}

/**
 * FetchXML da visão com paginação, ordenação da coluna e busca por palavra-chave injetadas; o resto fica intacto.
 * Não pede `returntotalrecordcount`: o total custaria uma contagem no servidor a cada página. Ele vem à parte (`buildCountFetch`).
 */
export function buildFetch(fetchxml: string, { page, pageSize, cookie, sort, query, quickFind }: BuildOptions) {
  const { doc, root, entity } = parse(fetchxml)

  for (const name of ['count', 'page', 'paging-cookie', 'returntotalrecordcount']) root.removeAttribute(name)
  root.setAttribute('count', String(pageSize))
  root.setAttribute('page', String(page))
  if (cookie) root.setAttribute('paging-cookie', cookie)

  // Os comandos Desativar/Ativar dependem do estado da linha: toda visão precisa trazê-lo.
  // `all-attributes` já inclui o estado; misturar os dois é inválido.
  const has = Array.from(entity.children).some((c) => c.tagName === 'all-attributes' || (c.tagName === 'attribute' && c.getAttribute('name') === 'statecode'))
  if (!has) {
    const attribute = doc.createElement('attribute')
    attribute.setAttribute('name', 'statecode')
    entity.insertBefore(attribute, entity.firstChild)
  }

  if (sort) applySort(doc, entity, sort)

  injectSearch(doc, entity, query, quickFind)

  return new XMLSerializer().serializeToString(doc)
}

/** FetchXML da visão convertido em contagem total (`aggregate`): sem paginação, ordem nem atributos; filtros, links e busca ficam. */
export function buildCountFetch(fetchxml: string, { query, quickFind }: { query: string; quickFind: string[] }) {
  const { doc, root, entity } = parse(fetchxml)

  for (const name of ['count', 'page', 'paging-cookie', 'returntotalrecordcount', 'distinct']) root.removeAttribute(name)
  root.setAttribute('aggregate', 'true')
  for (const node of Array.from(entity.querySelectorAll('order, attribute, all-attributes'))) node.remove()

  const total = doc.createElement('attribute')
  total.setAttribute('name', ID_ATTRIBUTE)
  total.setAttribute('alias', 'total')
  total.setAttribute('aggregate', 'count')
  entity.insertBefore(total, entity.firstChild)

  injectSearch(doc, entity, query, quickFind)
  return new XMLSerializer().serializeToString(doc)
}

export function linkEntities(fetchxml: string) {
  const { entity } = parse(fetchxml)
  return Array.from(entity.querySelectorAll('link-entity')).flatMap((link) => {
    const alias = link.getAttribute('alias')
    const name = link.getAttribute('name')
    return alias && name ? [{ alias, name }] : []
  })
}

/** Atributos da visão de localização rápida: condições do filtro `isquickfindfields` com valor `{0}`. */
export function quickFindAttributes(fetchxml: string) {
  const { entity } = parse(fetchxml)
  return Array.from(entity.querySelectorAll('filter[isquickfindfields="1"] > condition'))
    .filter((c) => c.getAttribute('value') === '{0}')
    .flatMap((c) => (c.getAttribute('attribute') ? [c.getAttribute('attribute') as string] : []))
}

export function defaultSort(fetchxml: string): Sort {
  const { entity } = parse(fetchxml)
  const order = Array.from(entity.children).find((c) => c.tagName === 'order')
  const attribute = order?.getAttribute('attribute')
  return attribute ? { attribute, alias: null, descending: order?.getAttribute('descending') === 'true' } : null
}
