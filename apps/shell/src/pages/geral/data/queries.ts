import { cleanId, odataString, type Row } from '@betinhos/dataverse'
import { ENTITY, ID_ATTRIBUTE, type Page, type View } from '../domain/types'

export const RESERVA_FILTER = `returnedtypecode eq '${ENTITY}' and statecode eq 0`

export const viewsPaths = () => [
  `savedqueries?$select=savedqueryid,name,fetchxml,layoutxml,isdefault&$filter=${encodeURIComponent(`${RESERVA_FILTER} and querytype eq 0`)}&$orderby=name asc`,
  `userqueries?$select=userqueryid,name,fetchxml,layoutxml&$filter=${encodeURIComponent(RESERVA_FILTER)}&$orderby=name asc`,
]
export const quickFindPath = () => `savedqueries?$select=fetchxml&$filter=${encodeURIComponent(`${RESERVA_FILTER} and isquickfindquery eq true`)}`

const str = (v: unknown) => (typeof v === 'string' ? v : '')

export function mapViews(system: Row[], mine: Row[]): View[] {
  const map = (rows: Row[], idKey: string, grupo: View['grupo']): View[] => rows
    .filter((r) => str(r.fetchxml) && str(r.layoutxml))
    .map((r) => ({ id: str(r[idKey]).replace(/[{}]/g, ''), nome: str(r.name).trim() || 'Sem nome', grupo, fetchxml: str(r.fetchxml), layoutxml: str(r.layoutxml), padrao: r.isdefault === true }))
  return [...map(system, 'savedqueryid', 'sistema'), ...map(mine, 'userqueryid', 'minhas')]
}

export const fetchPath = (set: string, fetchxml: string) => `${set}?fetchXml=${encodeURIComponent(fetchxml)}`

export type FetchResponse = {
  value: Row[]
  '@odata.count'?: number
  '@Microsoft.Dynamics.CRM.totalrecordcount'?: number
  '@Microsoft.Dynamics.CRM.morerecords'?: boolean
  '@Microsoft.Dynamics.CRM.fetchxmlpagingcookie'?: string
}

/** O cookie volta embrulhado e codificado duas vezes: `<cookie pagingcookie="%253c..." />`. */
export function parsePage(body: FetchResponse): Page {
  const wrapped = body['@Microsoft.Dynamics.CRM.fetchxmlpagingcookie'] ?? ''
  const match = /pagingcookie="([^"]*)"/.exec(wrapped)
  let cookie: string | null = null
  if (match?.[1]) { try { cookie = decodeURIComponent(decodeURIComponent(match[1])) } catch { cookie = null } }
  const count = body['@Microsoft.Dynamics.CRM.totalrecordcount'] ?? body['@odata.count']
  return { rows: body.value, cookie, more: body['@Microsoft.Dynamics.CRM.morerecords'] === true, total: typeof count === 'number' && count >= 0 ? count : null }
}

export function searchPath(set: string, idAttribute: string, nameAttribute: string, query: string) {
  const q = query.trim()
  const filter = q ? `statecode eq 0 and contains(${nameAttribute},'${odataString(q)}')` : 'statecode eq 0'
  return `${set}?$select=${idAttribute},${nameAttribute}&$filter=${encodeURIComponent(filter)}&$orderby=${encodeURIComponent(`${nameAttribute} asc`)}&$top=25`
}

/** Releitura da linha com as colunas da visão (lookups ficam como `_x_value`, único formato aceito no `$select`; colunas de link ficam de fora). */
export function reloadPath(set: string, id: string, keys: string[]) {
  const select = new Set([ID_ATTRIBUTE])
  for (const key of keys) {
    if (key.includes('.')) continue
    select.add(key)
  }
  return `${set}(${cleanId(id)})?$select=${Array.from(select).join(',')}`
}

export const relationshipPath = (attribute: string) =>
  `EntityDefinitions(LogicalName='${ENTITY}')/ManyToOneRelationships?$select=ReferencingEntityNavigationPropertyName,ReferencedEntity&$filter=${encodeURIComponent(`ReferencingAttribute eq '${odataString(attribute)}'`)}`

export const copyPath = (set: string, ids: string[], select: string[]) =>
  `${set}?$select=${select.join(',')}&$filter=${encodeURIComponent(ids.map((id) => `${ID_ATTRIBUTE} eq ${cleanId(id)}`).join(' or '))}`
