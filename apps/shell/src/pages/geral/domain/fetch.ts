import type { Sort } from './types'

type BuildOptions = { page: number; pageSize: number; cookie: string | null; sort: Sort; query: string; quickFind: string[] }

function parse(fetchxml: string) {
  const doc = new DOMParser().parseFromString(fetchxml, 'text/xml')
  const root = doc.documentElement
  const entity = root?.tagName === 'fetch' ? Array.from(root.children).find((c) => c.tagName === 'entity') : undefined
  if (!root || doc.getElementsByTagName('parsererror').length || !entity) throw new Error('FetchXML da visão inválido.')
  return { doc, root, entity }
}

/** FetchXML da visão com paginação, ordenação da coluna e busca por palavra-chave injetadas; o resto fica intacto. */
export function buildFetch(fetchxml: string, { page, pageSize, cookie, sort, query, quickFind }: BuildOptions) {
  const { doc, root, entity } = parse(fetchxml)

  for (const name of ['count', 'page', 'paging-cookie', 'returntotalrecordcount']) root.removeAttribute(name)
  root.setAttribute('count', String(pageSize))
  root.setAttribute('page', String(page))
  if (cookie) root.setAttribute('paging-cookie', cookie)
  root.setAttribute('returntotalrecordcount', 'true')

  if (sort) {
    for (const order of Array.from(entity.children).filter((c) => c.tagName === 'order')) order.remove()
    const order = doc.createElement('order')
    order.setAttribute('attribute', sort.attribute)
    order.setAttribute('descending', String(sort.descending))
    const link = sort.alias ? Array.from(entity.querySelectorAll('link-entity')).find((l) => l.getAttribute('alias') === sort.alias) : null
    if (sort.alias && !link) throw new Error(`Coluna ${sort.alias}.${sort.attribute} não pertence a esta visão.`)
    ;(link ?? entity).appendChild(order)
  }

  const text = query.trim()
  if (text && quickFind.length) {
    const filter = doc.createElement('filter')
    filter.setAttribute('type', 'or')
    for (const attribute of quickFind) {
      const condition = doc.createElement('condition')
      condition.setAttribute('attribute', attribute)
      condition.setAttribute('operator', 'like')
      condition.setAttribute('value', `%${text}%`)
      filter.appendChild(condition)
    }
    entity.appendChild(filter)
  }

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
