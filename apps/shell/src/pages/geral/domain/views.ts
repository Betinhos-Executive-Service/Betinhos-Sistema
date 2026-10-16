import type { Column, Sort } from './types'
import { ID_ATTRIBUTE } from './types'
import { applySort, parse } from './fetch'
import type { FilterField, TableFilters } from '@betinhos/ui'
import { injectTableFilters } from './tableFilters'

/**
 * FetchXML para gravar numa visão pessoal: o da visão atual com os filtros por coluna e a ordenação corrente.
 * Sem paginação, contagem nem busca por palavra-chave (nada disso pertence à visão).
 */
export function buildViewFetch(baseFetch: string, filters: TableFilters, sort: Sort, fields: FilterField[]): string {
  const injected = injectTableFilters(baseFetch, filters, fields)
  const { doc, root, entity } = parse(injected)
  for (const name of ['count', 'page', 'paging-cookie', 'returntotalrecordcount']) root.removeAttribute(name)
  if (sort) applySort(doc, entity, sort)
  return new XMLSerializer().serializeToString(doc)
}

const escapeAttr = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** `layoutxml` das colunas visíveis, na ordem; `widths` (preferências) vale sobre a largura da coluna. `object` só entra quando a metadata o informou. */
export function buildLayout(columns: Column[], widths: Record<string, number> | undefined, objectTypeCode: number | null): string {
  const object = objectTypeCode != null ? ` object="${objectTypeCode}"` : ''
  const cells = columns.map((c) => `<cell name="${escapeAttr(c.key)}" width="${Math.round(widths?.[c.key] ?? c.width)}" />`).join('')
  return `<grid name="resultset"${object} jump="cr40f_id" select="1" icon="1" preview="1"><row name="result" id="${ID_ATTRIBUTE}">${cells}</row></grid>`
}
