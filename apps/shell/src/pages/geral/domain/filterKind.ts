import { cellKind } from './cells'
import { filterKindFor, type Filter } from './filters'
import type { AttributeInfo } from './types'

/** Tipo de filtro de um atributo da raiz; independe de o campo ser editável na célula. `null` = não filtra. */
export function filterKindOf(attribute: string, info: AttributeInfo | undefined): Filter['kind'] | null {
  if (!info) return null
  const column = { key: attribute, attribute, alias: null, entity: null, width: 100 }
  return filterKindFor(cellKind(column, { ...info, updatable: true }), info)
}
