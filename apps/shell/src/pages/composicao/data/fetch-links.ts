/** Vínculos (`link-entity`) do FetchXML: caminho de cada um, alias e limpeza dos que a própria tela criou. */

export type LinkPath = { name: string; to: string }[]

/** `tabela@coluna/tabela@coluna`: o caminho de relacionamentos, igual ao do catálogo de colunas. */
export const pathSignature = (path: string[], relationships?: { from: string; to: string }[], count = path.length) => path.slice(0, count).map((table, index) => `${table}@${relationships?.[index]?.to ?? ''}`).join('/')

/** Caminho de cada `link-entity` do FetchXML (com ou sem alias), na ordem do documento. */
export function fetchLinks(entity: Element) {
  const result: { link: Element; path: string }[] = []
  const scan = (parent: Element, path: string[]) => {
    for (const link of [...parent.children].filter((child) => child.tagName === 'link-entity')) {
      const next = [...path, `${link.getAttribute('name') ?? ''}@${link.getAttribute('to') ?? ''}`]
      result.push({ link, path: next.join('/') })
      scan(link, next)
    }
  }
  scan(entity, [])
  return result
}

/** Alias → caminho de cada vínculo do FetchXML. */
export function fetchAliasPaths(entity: Element) {
  const result = new Map<string, string>()
  for (const { link, path } of fetchLinks(entity)) if (link.getAttribute('alias')) result.set(link.getAttribute('alias')!, path)
  return result
}

/** Alias de cada caminho de vínculo do FetchXML; com o mesmo caminho repetido vale o último (o da grade, que traz as colunas). */
export function fetchLinkAliases(fetchXml: string) {
  const result = new Map<string, string>()
  const entity = new DOMParser().parseFromString(fetchXml, 'application/xml').querySelector('fetch > entity')
  if (entity) for (const [alias, path] of fetchAliasPaths(entity)) result.set(path, alias)
  return result
}

/** Alias que a tela dá aos vínculos que cria (`r1`, `r2`…; `ui_r1` quando o FetchXML de origem já tinha o mesmo). */
const OWN_ALIAS = /^(ui_)*r\d+$/

/**
 * Tira do FetchXML os vínculos que a própria tela criou e que não servem a nada: alias `r<n>` (com prefixos `ui_`),
 * junção externa, sem filtro e sem condição ou ordem que os cite. Cada salvamento antigo somava vínculos novos; o
 * Dataverse aceita só 15. Os vínculos da visão original (alias `a_…`, junção interna, com filtro) nunca saem.
 */
export function pruneOwnLinks(entity: Element) {
  const referenced = new Set([...entity.querySelectorAll('condition[entityname], order[entityname]')].map((node) => node.getAttribute('entityname')!))
  // Do mais fundo para o mais raso: o vínculo pai só sai depois dos filhos.
  for (const link of [...entity.querySelectorAll('link-entity')].reverse()) {
    const alias = link.getAttribute('alias') ?? ''
    if (!OWN_ALIAS.test(alias) || link.getAttribute('link-type') !== 'outer' || referenced.has(alias)) continue
    if (link.querySelector('filter, link-entity')) continue
    link.remove()
  }
}
