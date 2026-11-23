import { fetchAliasPaths } from './fetch-links'

/**
 * Cópias de visão nativa feitas antes do `nativeBase` guardavam no FetchXML os filtros do usuário misturados aos da
 * visão original, e ao reabrir ficavam travados. Aqui o FetchXML da cópia é comparado com o que a definição do pin
 * produz: se o último filtro do combinado é exatamente o dos filtros do usuário, ele sai e sobra a visão original.
 * Qualquer diferença devolve `null` (a cópia continua como está, travada: nunca se perde filtro).
 */

const normalize = (text: string) => text.trim().toLowerCase().replace(/[{}]/g, '')

/** Forma comparável: operador, valores sem caixa nem chaves e o vínculo pelo caminho (o texto do alias muda com `ui_`). */
function canonical(node: Element, aliasPaths: Map<string, string>): string {
  if (node.tagName === 'filter') return `F(${node.getAttribute('type') ?? 'and'}:${[...node.children].map((child) => canonical(child, aliasPaths)).join('|')})`
  const alias = node.getAttribute('entityname')
  const values = [...node.children].filter((child) => child.tagName === 'value').map((child) => normalize(child.textContent ?? ''))
  return `C(${node.getAttribute('attribute')}|${node.getAttribute('operator')}|${alias ? aliasPaths.get(alias) ?? `alias:${alias}` : ''}|${normalize(node.getAttribute('value') ?? '')}|${values.join(',')})`
}

function parse(fetchXml: string) {
  const document = new DOMParser().parseFromString(fetchXml, 'application/xml')
  const entity = document.querySelector('parsererror') ? null : document.querySelector('fetch > entity')
  return entity ? { document, entity, aliasPaths: fetchAliasPaths(entity) } : null
}

/** FetchXML da visão original dentro da cópia antiga, ou `null` quando não dá para provar que o resto são só os filtros do usuário. */
export function legacyNativeBase(copyFetchXml: string, expectedFetchXml: string): string | null {
  const copy = parse(copyFetchXml)
  const expected = parse(expectedFetchXml)
  if (!copy || !expected) return null
  const extras = [...expected.entity.children].filter((child) => child.tagName === 'filter')
  const tops = [...copy.entity.children].filter((child) => child.tagName === 'filter')
  if (!extras.length || tops.length !== 1 || (tops[0].getAttribute('type') ?? 'and') !== 'and') return null
  const combined = tops[0]
  const inside = [...combined.children]
  if (inside.length < extras.length) return null
  const tail = inside.slice(inside.length - extras.length)
  if (tail.some((node, index) => node.tagName !== 'filter' || canonical(node, copy.aliasPaths) !== canonical(extras[index], expected.aliasPaths))) return null
  tail.forEach((node) => node.remove())
  for (const node of [...combined.children]) copy.entity.insertBefore(node, combined)
  combined.remove()
  return new XMLSerializer().serializeToString(copy.document)
}
