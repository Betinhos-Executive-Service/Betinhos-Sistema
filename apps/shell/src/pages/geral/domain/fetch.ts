import type { SearchCondition } from './search'
import { ID_ATTRIBUTE, type Sort } from './types'
import { CAMPOS_PROTEGIDOS } from './protecao'

type BuildOptions = { page: number; pageSize: number; cookie: string | null; sort: Sort; search: SearchCondition[] }

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

/** Busca por palavra-chave: filtro OR com as condições de `buildSearch` (`like` em texto, `in` em choice e lookup). */
function injectSearch(doc: Document, entity: Element, search: SearchCondition[]) {
  if (!search.length) return
  const filter = doc.createElement('filter')
  filter.setAttribute('type', 'or')
  for (const item of search) {
    const condition = doc.createElement('condition')
    condition.setAttribute('attribute', item.attribute)
    condition.setAttribute('operator', item.operator)
    if (item.operator === 'like') condition.setAttribute('value', item.value)
    else for (const text of item.values) {
      const value = doc.createElement('value')
      value.textContent = text
      condition.appendChild(value)
    }
    filter.appendChild(condition)
  }
  entity.appendChild(filter)
}

/**
 * FetchXML da visão com paginação, ordenação da coluna e busca por palavra-chave injetadas; o resto fica intacto.
 * Não pede `returntotalrecordcount`: o total custaria uma contagem no servidor a cada página. Ele vem à parte (`buildCountFetch`).
 */
export function buildFetch(fetchxml: string, { page, pageSize, cookie, sort, search }: BuildOptions) {
  const { doc, root, entity } = parse(fetchxml)

  for (const name of ['count', 'page', 'paging-cookie', 'returntotalrecordcount']) root.removeAttribute(name)
  root.setAttribute('count', String(pageSize))
  root.setAttribute('page', String(page))
  if (cookie) root.setAttribute('paging-cookie', cookie)

  // Toda visão traz o estado (comandos Desativar/Ativar) e os campos protegidos da Tenaris (escudo na célula).
  // `all-attributes` já inclui tudo; misturar os dois é inválido.
  const children = Array.from(entity.children)
  if (!children.some((c) => c.tagName === 'all-attributes')) {
    for (const name of ['statecode', CAMPOS_PROTEGIDOS]) {
      if (children.some((c) => c.tagName === 'attribute' && c.getAttribute('name') === name)) continue
      const attribute = doc.createElement('attribute')
      attribute.setAttribute('name', name)
      entity.insertBefore(attribute, entity.firstChild)
    }
  }

  if (sort) applySort(doc, entity, sort)

  injectSearch(doc, entity, search)

  return new XMLSerializer().serializeToString(doc)
}

/** FetchXML da visão convertido em contagem total (`aggregate`): sem paginação, ordem nem atributos; filtros, links e busca ficam. */
export function buildCountFetch(fetchxml: string, { search }: { search: SearchCondition[] }) {
  const { doc, root, entity } = parse(fetchxml)

  for (const name of ['count', 'page', 'paging-cookie', 'returntotalrecordcount', 'distinct']) root.removeAttribute(name)
  root.setAttribute('aggregate', 'true')
  for (const node of Array.from(entity.querySelectorAll('order, attribute, all-attributes'))) node.remove()

  const total = doc.createElement('attribute')
  total.setAttribute('name', ID_ATTRIBUTE)
  total.setAttribute('alias', 'total')
  total.setAttribute('aggregate', 'count')
  entity.insertBefore(total, entity.firstChild)

  injectSearch(doc, entity, search)
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
