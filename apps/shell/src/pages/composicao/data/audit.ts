import { getDataverseUrl } from './dataverse'

const entity = 'cr40f_composicaodeprecos'
const formatted = '@OData.Community.Display.V1.FormattedValue'

export type AuditRecord = {
  auditid: string
  createdon: string
  operation: number
  _objectid_value: string
  _userid_value?: string
  changedata?: string
  'userid'?: { fullname?: string }
}

export type AuditChange = { field: string; before: string; after: string }

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { headers: { Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' }, signal })
  if (!response.ok) throw new Error(response.status === 403 ? 'Sem permissão para ler o histórico de auditoria.' : `Erro HTTP ${response.status} ao buscar auditoria.`)
  return response.json() as Promise<T>
}

export async function loadAudit(ids: string[], signal?: AbortSignal) {
  const base = `${getDataverseUrl()}/api/data/v9.2`
  const filter = [`objecttypecode eq '${entity}'`, ids.length === 1
    ? `_objectid_value eq ${ids[0]}`
    : ids.length > 1 ? `(${ids.map((id) => `_objectid_value eq ${id}`).join(' or ')})` : ''].filter(Boolean).join(' and ')
  const auditUrl = `${base}/audits?$select=auditid,createdon,operation,objecttypecode,_objectid_value,_userid_value,changedata&$expand=userid($select=fullname)&$filter=${encodeURIComponent(filter)}&$orderby=createdon desc&$top=500`
  const metadataUrl = `${base}/EntityDefinitions(LogicalName='${entity}')?$select=EntitySetName,PrimaryNameAttribute,PrimaryIdAttribute`
  const attributesUrl = `${base}/EntityDefinitions(LogicalName='${entity}')/Attributes?$select=LogicalName,DisplayName`
  const [history, metadataResult, attributesResult] = await Promise.all([
    getJson<{ value: AuditRecord[] }>(auditUrl, signal),
    getJson<{ EntitySetName: string; PrimaryNameAttribute: string; PrimaryIdAttribute: string }>(metadataUrl, signal).catch(() => null),
    getJson<{ value: { LogicalName: string; DisplayName?: { UserLocalizedLabel?: { Label?: string } } }[] }>(attributesUrl, signal).catch(() => null),
  ])
  const fieldNames = Object.fromEntries((attributesResult?.value ?? []).map((item) => [item.LogicalName, item.DisplayName?.UserLocalizedLabel?.Label ?? item.LogicalName]))
  const recordNames: Record<string, string> = {}
  const recordIds = [...new Set(history.value.map((item) => item._objectid_value).filter(Boolean))]
  for (let start = 0; metadataResult && start < recordIds.length; start += 40) {
    const batch = recordIds.slice(start, start + 40)
    const query = `${base}/${metadataResult.EntitySetName}?$select=${metadataResult.PrimaryIdAttribute},${metadataResult.PrimaryNameAttribute}&$filter=${encodeURIComponent(batch.map((id) => `${metadataResult.PrimaryIdAttribute} eq ${id}`).join(' or '))}`
    try {
      const result = await getJson<{ value: Record<string, string>[] }>(query, signal)
      result.value.forEach((row) => { recordNames[row[metadataResult.PrimaryIdAttribute]?.toLowerCase()] = row[metadataResult.PrimaryNameAttribute] })
    } catch { /* O histórico continua legível pelo ID quando o registro foi excluído. */ }
  }
  return { records: history.value, fieldNames, recordNames }
}

export async function loadAuditDetails(id: string, fieldNames: Record<string, string>, signal?: AbortSignal): Promise<AuditChange[]> {
  const base = `${getDataverseUrl()}/api/data/v9.2`
  const response = await getJson<{ AuditDetail?: { NewValue?: Record<string, unknown>; OldValue?: Record<string, unknown> } }>(`${base}/audits(${id})/Microsoft.Dynamics.CRM.RetrieveAuditDetails`, signal)
  const newer = response.AuditDetail?.NewValue ?? {}
  const older = response.AuditDetail?.OldValue ?? {}
  const display = (row: Record<string, unknown>, key: string) => {
    const value = row[`${key}${formatted}`] ?? row[key]
    return value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
  }
  return [...new Set([...Object.keys(newer), ...Object.keys(older)].filter((key) => !key.includes('@')))].map((key) => {
    const logical = key.startsWith('_') && key.endsWith('_value') ? key.slice(1, -6) : key
    return { field: fieldNames[logical] ?? logical, before: display(older, key), after: display(newer, key) }
  })
}
