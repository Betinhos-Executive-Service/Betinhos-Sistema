/**
 * Limite de vínculos (`link-entity`) do Dataverse: mais de 15 em uma consulta FetchXML falha com
 * "Number of link entity: 16 exceed limit 15. isReport=False.". Toda tela que envia FetchXML com vínculos passa por
 * `prepareFetchXml` antes de enviar: junta vínculos repetidos, tira o que só enfeita e, sem saída, explica o problema em português.
 */

export const MAX_LINK_ENTITIES = 15

export const LINK_LIMIT_MESSAGE = 'A visão usa tabelas relacionadas demais para o Dataverse (o limite é de 15 vínculos por consulta). Tire da visão algumas colunas ou filtros de outras tabelas e tente de novo.'

/** Erro de quem não consegue caber no limite: a mensagem já é para o usuário. */
export class FetchLinkLimitError extends Error {
  constructor(public readonly total: number) {
    super(LINK_LIMIT_MESSAGE)
    this.name = 'FetchLinkLimitError'
  }
}

/** Vínculo `outer` retirado da consulta: só servia colunas de exibição, que voltam vazias. */
export type RemovedLink = { alias: string; table: string; columns: string[] }

export type PreparedFetch = {
  fetchXml: string
  /** [removido, mantido] dos vínculos repetidos fundidos; `expandLinkAliases` devolve às linhas os nomes originais. */
  aliases: [string, string][]
  degraded: {
    /** Os vínculos da linha (`dropRowLinks`) foram retirados: o chamador lê a reserva e o cliente à parte. */
    rowLinks: boolean
    /** Vínculos `outer` retirados: as colunas deles voltam vazias. */
    removed: RemovedLink[]
  }
}

const linkType = (link: Element) => link.getAttribute('link-type') ?? 'inner'
const hasFilter = (link: Element) => [...link.children].some((child) => child.tagName === 'filter')

/** Quantidade de `link-entity` do FetchXML (aninhados e `any`/`not any` inclusive); texto que não é XML conta 0. */
export function countLinkEntities(fetchXml: string) {
  const document = new DOMParser().parseFromString(fetchXml, 'application/xml')
  return document.querySelector('parsererror') ? 0 : document.querySelectorAll('link-entity').length
}

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

/** O vínculo e tudo o que há dentro dele só servem colunas de exibição: `outer`, sem filtro, ordem nem agregação. */
function onlyDisplays(link: Element) {
  return [link, ...link.querySelectorAll('link-entity')].every((node) => linkType(node) === 'outer' && !hasFilter(node))
    && !link.querySelector('order, filter, attribute[groupby], attribute[aggregate]')
}

/** Algum filtro ou ordem da consulta cita (`entityname`) o alias de um vínculo da subárvore. */
function referenced(document: Document, link: Element) {
  const aliases = [link, ...link.querySelectorAll('link-entity')].map((node) => node.getAttribute('alias')).filter((alias): alias is string => Boolean(alias))
  return aliases.some((alias) => [...document.querySelectorAll('[entityname]')].some((node) => node.getAttribute('entityname') === alias))
}

/** Tira vínculos `outer` que só enfeitam, dos últimos para os primeiros, até caber no limite. Nunca mexe no que mudaria o resultado. */
function removeDisplayLinks(document: Document, max: number) {
  const removed: RemovedLink[] = []
  for (const link of [...document.querySelectorAll('link-entity')].reverse()) {
    if (document.querySelectorAll('link-entity').length <= max) break
    if (!link.isConnected || !link.getAttribute('alias') || !onlyDisplays(link) || referenced(document, link)) continue
    const columns = [...link.querySelectorAll('attribute')].map((attribute) => attribute.getAttribute('alias') ?? attribute.getAttribute('name') ?? '').filter(Boolean)
    removed.push({ alias: link.getAttribute('alias')!, table: link.getAttribute('name') ?? '', columns })
    link.remove()
  }
  return removed
}

/**
 * Deixa o FetchXML dentro do limite de 15 vínculos antes de enviar. Até 15 devolve o texto como veio. Acima, em ordem:
 * (1) funde vínculos repetidos; (2) `dropRowLinks`, se o chamador der (a Composição lê a reserva e o cliente em lotes);
 * (3) tira vínculos `outer` sem filtro que só servem colunas de exibição. Se ainda passar, lança `FetchLinkLimitError`.
 */
export function prepareFetchXml(fetchXml: string, options: { dropRowLinks?: (fetchXml: string) => string; max?: number } = {}): PreparedFetch {
  const max = options.max ?? MAX_LINK_ENTITIES
  const result: PreparedFetch = { fetchXml, aliases: [], degraded: { rowLinks: false, removed: [] } }
  if (countLinkEntities(fetchXml) <= max) return result

  const merged = dedupeLinks(fetchXml)
  result.fetchXml = merged.fetchXml
  result.aliases = merged.aliases

  if (countLinkEntities(result.fetchXml) > max && options.dropRowLinks) {
    const plain = options.dropRowLinks(result.fetchXml)
    if (plain !== result.fetchXml) {
      result.fetchXml = plain
      result.degraded.rowLinks = true
    }
  }

  if (countLinkEntities(result.fetchXml) > max) {
    const document = new DOMParser().parseFromString(result.fetchXml, 'application/xml')
    result.degraded.removed = removeDisplayLinks(document, max)
    if (result.degraded.removed.length) result.fetchXml = new XMLSerializer().serializeToString(document)
  }

  const total = countLinkEntities(result.fetchXml)
  if (total > max) throw new FetchLinkLimitError(total)
  return result
}

/** Aviso para o usuário quando a consulta perdeu vínculos de exibição; null quando nada foi retirado. */
export function removedLinksNotice(removed: RemovedLink[]) {
  const columns = removed.flatMap((link) => link.columns)
  if (!removed.length) return null
  return `A visão usa tabelas relacionadas demais para o Dataverse (limite de 15 vínculos por consulta). ${columns.length ? `Estas colunas de outras tabelas ficaram vazias: ${columns.join(', ')}.` : 'Colunas de outras tabelas ficaram vazias.'} Tire colunas ou filtros de outras tabelas da visão para voltar a vê-las.`
}
