import type { AttributeInfo, Column } from './types'

/** Colunas do `layoutxml` de uma visão, na ordem do grid, sem as marcadas `ishidden`. */
export function parseLayout(layoutxml: string): Column[] {
  if (!layoutxml.trim()) return []
  const doc = new DOMParser().parseFromString(layoutxml, 'text/xml')
  if (doc.getElementsByTagName('parsererror').length) return []
  return Array.from(doc.querySelectorAll('row > cell'))
    .filter((cell) => cell.getAttribute('ishidden') !== '1')
    .flatMap((cell) => {
      const name = cell.getAttribute('name') ?? ''
      if (!name) return []
      const dot = name.indexOf('.')
      const alias = dot > 0 ? name.slice(0, dot) : null
      const attribute = dot > 0 ? name.slice(dot + 1) : name
      const width = Number(cell.getAttribute('width')) || 120
      return [{ key: name, attribute, alias, entity: null, width }]
    })
}

/** Chave do valor na linha da Web API: lookup vem como `_x_value`; coluna de link vem como `alias.atributo`. */
export function rowKey(column: Column, info: AttributeInfo | undefined) {
  if (column.alias) return column.key
  return info && (info.type === 'Lookup' || info.type === 'Customer' || info.type === 'Owner') ? `_${column.attribute}_value` : column.attribute
}

export function columnLabel(column: Column, info: AttributeInfo | undefined) {
  return info?.label || column.attribute
}
