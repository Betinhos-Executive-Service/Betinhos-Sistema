import { getXrmHost } from './xrm'
import type { CatalogField } from './views'

export type EditOption = { value: string; label: string; table?: string; tableLabel?: string; entitySet?: string; navigation?: string }
export type SavedFieldValue = { value: unknown; formatted?: string; table: string; recordId: string; attribute: string; rowVersion?: string; refreshWarning?: string }
export type DateFieldConfig = { behavior: string; dateOnly: boolean }

type EntityInfo = {
  EntitySetName: string
  PrimaryIdAttribute: string
  PrimaryNameAttribute: string
  DisplayName?: { UserLocalizedLabel?: { Label?: string } }
  ManyToOneRelationships?: { ReferencingAttribute: string; ReferencedEntity: string; ReferencingEntityNavigationPropertyName: string }[]
}

function host() {
  const xrm = getXrmHost()
  if (!xrm?.WebApi || !xrm.Utility) throw new Error('Edição disponível apenas no Dataverse.')
  return xrm
}

const infoCache = new Map<string, Promise<EntityInfo>>()
function entityInfo(table: string): Promise<EntityInfo> {
  if (!infoCache.has(table)) {
    const base = host().Utility!.getGlobalContext().getClientUrl().replace(/\/+$/, '')
    const url = `${base}/api/data/v9.2/EntityDefinitions(LogicalName='${encodeURIComponent(table)}')?$select=EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute,DisplayName&$expand=ManyToOneRelationships($select=ReferencingAttribute,ReferencedEntity,ReferencingEntityNavigationPropertyName)`
    infoCache.set(table, fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } }).then((response) => {
      if (!response.ok) throw new Error(`Metadata de ${table}: HTTP ${response.status}`)
      return response.json() as Promise<EntityInfo>
    }).catch((error) => { infoCache.delete(table); throw error }))
  }
  return infoCache.get(table)!
}

export function relatedRecordId(field: CatalogField, fields: Record<string, unknown> | undefined, valueKey: string, baseId: string): string | null {
  if (!field.path.length) return baseId
  const alias = valueKey.slice(0, valueKey.lastIndexOf('.'))
  const id = fields?.[`${alias}.${field.primaryIdAttribute ?? field.relationships?.at(-1)?.from}`]
  return typeof id === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id) ? id : null
}

export async function lookupOptions(field: CatalogField, search: string): Promise<EditOption[]> {
  const source = await entityInfo(field.table)
  const relations = (source.ManyToOneRelationships ?? []).filter((item) => item.ReferencingAttribute === field.attribute)
  if (!relations.length) throw new Error(`Relacionamento do campo ${field.label} não encontrado.`)
  const api = host().WebApi!
  const options = await Promise.all(relations.map(async (relation) => {
    const target = await entityInfo(relation.ReferencedEntity)
    if (!target.PrimaryIdAttribute || !target.PrimaryNameAttribute || !target.EntitySetName || !relation.ReferencingEntityNavigationPropertyName) return []
    const escaped = search.trim().replace(/'/g, "''")
    const filter = escaped ? `&$filter=${encodeURIComponent(`contains(${target.PrimaryNameAttribute},'${escaped}')`)}` : ''
    const query = `?$select=${target.PrimaryIdAttribute},${target.PrimaryNameAttribute}${filter}&$orderby=${target.PrimaryNameAttribute} asc&$top=25`
    const result = await api.retrieveMultipleRecords(relation.ReferencedEntity, query)
    return result.entities.map((row) => ({ value: String(row[target.PrimaryIdAttribute] ?? ''), label: String(row[target.PrimaryNameAttribute] ?? ''), table: relation.ReferencedEntity, tableLabel: target.DisplayName?.UserLocalizedLabel?.Label, entitySet: target.EntitySetName, navigation: relation.ReferencingEntityNavigationPropertyName })).filter((option) => option.value && option.label)
  }))
  return options.flat().slice(0, 25)
}

const optionsCache = new Map<string, Promise<EditOption[]>>()
export function choiceOptions(field: CatalogField): Promise<EditOption[]> {
  const key = `${field.table}:${field.attribute}`
  if (!optionsCache.has(key)) optionsCache.set(key, loadChoiceOptions(field).catch((error) => { optionsCache.delete(key); throw error }))
  return optionsCache.get(key)!
}

async function loadChoiceOptions(field: CatalogField): Promise<EditOption[]> {
  const kind = field.type === 'Boolean' ? 'Boolean' : field.type === 'Status' ? 'Status' : field.type === 'State' ? 'State' : 'Picklist'
  const base = host().Utility!.getGlobalContext().getClientUrl().replace(/\/+$/, '')
  const url = `${base}/api/data/v9.2/EntityDefinitions(LogicalName='${encodeURIComponent(field.table)}')/Attributes(LogicalName='${encodeURIComponent(field.attribute)}')/Microsoft.Dynamics.CRM.${kind}AttributeMetadata?$select=LogicalName&$expand=OptionSet`
  const response = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Opções de ${field.label}: HTTP ${response.status}`)
  type Choice = { Value?: number; Label?: { UserLocalizedLabel?: { Label?: string } } }
  const metadata = await response.json() as { OptionSet?: { Options?: Choice[]; TrueOption?: Choice; FalseOption?: Choice } }
  if (field.type === 'Boolean') return [{ value: 'true', label: metadata.OptionSet?.TrueOption?.Label?.UserLocalizedLabel?.Label ?? 'Sim' }, { value: 'false', label: metadata.OptionSet?.FalseOption?.Label?.UserLocalizedLabel?.Label ?? 'Não' }]
  return (metadata.OptionSet?.Options ?? []).filter((item) => item.Value !== undefined).map((item) => ({ value: String(item.Value), label: item.Label?.UserLocalizedLabel?.Label ?? String(item.Value) }))
}

export async function dateFieldConfig(field: CatalogField): Promise<DateFieldConfig> {
  const base = host().Utility!.getGlobalContext().getClientUrl().replace(/\/+$/, '')
  const response = await fetch(`${base}/api/data/v9.2/EntityDefinitions(LogicalName='${encodeURIComponent(field.table)}')/Attributes(LogicalName='${encodeURIComponent(field.attribute)}')/Microsoft.Dynamics.CRM.DateTimeAttributeMetadata?$select=DateTimeBehavior,Format`, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Configuração de ${field.label}: HTTP ${response.status}`)
  const metadata = await response.json() as { DateTimeBehavior?: { Value?: string }; Format?: string }
  return { behavior: metadata.DateTimeBehavior?.Value ?? 'UserLocal', dateOnly: metadata.Format === 'DateOnly' }
}

export async function saveRelatedField(field: CatalogField, recordId: string, value: unknown, option?: EditOption): Promise<SavedFieldValue> {
  if (field.writable !== true) throw new Error(`${field.label} não permite atualização no Dataverse.`)
  let payload: Record<string, unknown>
  if (field.type === 'Lookup' && value === null) {
    const source = await entityInfo(field.table)
    const relations = (source.ManyToOneRelationships ?? []).filter((item) => item.ReferencingAttribute === field.attribute)
    let navigation = relations.length === 1 ? relations[0].ReferencingEntityNavigationPropertyName : undefined
    if (!navigation) {
      const row = await host().WebApi!.retrieveRecord(field.table, recordId, `?$select=_${field.attribute}_value`)
      const target = row[`_${field.attribute}_value@Microsoft.Dynamics.CRM.lookuplogicalname`]
      navigation = relations.find((item) => item.ReferencedEntity === target)?.ReferencingEntityNavigationPropertyName
    }
    if (!navigation) throw new Error('Não foi possível identificar o relacionamento para limpar o campo.')
    payload = { [navigation]: null }
  } else payload = field.type === 'Lookup'
    ? option?.navigation && option.entitySet && option.value
      ? { [`${option.navigation}@odata.bind`]: `/${option.entitySet}(${option.value})` }
      : (() => { throw new Error('Selecione um registro válido para o lookup.') })()
    : { [field.attribute]: value }
  await host().WebApi!.updateRecord(field.table, recordId, payload)
  const fallback: SavedFieldValue = { value, formatted: option?.label, table: field.table, recordId, attribute: field.attribute }
  try {
    const key = field.type === 'Lookup' ? `_${field.attribute}_value` : field.attribute
    const row = await host().WebApi!.retrieveRecord(field.table, recordId, `?$select=${key}`)
    return { ...fallback, value: row[key] ?? null, formatted: row[`${key}@OData.Community.Display.V1.FormattedValue`] as string | undefined, rowVersion: row['@odata.etag'] as string | undefined }
  } catch {
    return { ...fallback, refreshWarning: 'Campo salvo. Não foi possível conferir o valor atualizado; atualize a grade.' }
  }
}
