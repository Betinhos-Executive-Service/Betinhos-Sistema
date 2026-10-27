import { EXTRA_COLUMN_PREFIX } from '@betinhos/ui'
import type { ResolvedLinkColumn } from '../../../app/extraColumns'
import { parse } from './fetch'
import type { Column } from './types'

/**
 * Colunas adicionadas pelo painel (DS §10.9.1) na Geral: cada uma vira `link-entity` no FetchXML da visão, com alias
 * `x__nav1__nav2`, e coluna `alias.atributo` no layout. Assim ordenar, filtrar e "Salvar visão" seguem o caminho nativo.
 */

const ALIAS_PREFIX = 'x__'
const SEP = '__'

export const extraAlias = (navs: string[]) => `${ALIAS_PREFIX}${navs.join(SEP)}`

/** Coluna da Geral de uma coluna `x:` resolvida (`x__nav.campo`). */
export function extraColumn(c: ResolvedLinkColumn): Column {
  const alias = extraAlias(c.links.map((l) => l.nav))
  return { key: `${alias}.${c.attr.name}`, attribute: c.attr.name, alias, entity: null, width: 160, label: c.label }
}

/** `x__a__b.campo` ↔ `x:a/b/campo`: o painel usa a chave `x:`; a Geral, a do FetchXML. */
export function toConfigKey(columnKey: string): string {
  const dot = columnKey.indexOf('.')
  if (!columnKey.startsWith(ALIAS_PREFIX) || dot < 0) return columnKey
  return `${EXTRA_COLUMN_PREFIX}${[...columnKey.slice(ALIAS_PREFIX.length, dot).split(SEP), columnKey.slice(dot + 1)].join('/')}`
}
export function fromConfigKey(configKey: string): string {
  if (!configKey.startsWith(EXTRA_COLUMN_PREFIX)) return configKey
  const path = configKey.slice(EXTRA_COLUMN_PREFIX.length).split('/')
  return `${extraAlias(path.slice(0, -1))}.${path[path.length - 1]}`
}

/** Acrescenta os `link-entity` (outer) e atributos das colunas; reaproveita o link de mesmo alias, sem duplicar. */
export function addExtraLinks(fetchxml: string, columns: ResolvedLinkColumn[]): string {
  if (!columns.length) return fetchxml
  const { doc, entity } = parse(fetchxml)
  for (const c of columns) {
    let parent = entity
    c.links.forEach((link, i) => {
      const alias = extraAlias(c.links.slice(0, i + 1).map((l) => l.nav))
      let el = Array.from(parent.children).find((n) => n.tagName === 'link-entity' && n.getAttribute('alias') === alias)
      if (!el) {
        el = doc.createElement('link-entity')
        el.setAttribute('name', link.target)
        el.setAttribute('from', link.targetId)
        el.setAttribute('to', link.attribute)
        el.setAttribute('alias', alias)
        el.setAttribute('link-type', 'outer')
        parent.appendChild(el)
      }
      parent = el
    })
    const kids = Array.from(parent.children)
    if (!kids.some((n) => n.tagName === 'all-attributes' || (n.tagName === 'attribute' && n.getAttribute('name') === c.attr.name))) {
      const attribute = doc.createElement('attribute')
      attribute.setAttribute('name', c.attr.name)
      parent.appendChild(attribute)
    }
  }
  return new XMLSerializer().serializeToString(doc)
}
