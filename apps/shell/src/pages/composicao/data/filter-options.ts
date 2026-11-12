import type { CatalogField } from './views'
import { getXrmHost } from './xrm'

export type FilterOption = { value: string; label: string }

function context() {
  const host = getXrmHost()
  if (!host?.WebApi) throw new Error('Busca de valores disponível apenas no Dataverse.')
  return host
}

function clientUrl() {
  const url = context().Utility?.getGlobalContext().getClientUrl()
  if (!url) throw new Error('Contexto Dataverse indisponível.')
  return url.replace(/\/+$/, '')
}

type EntityInfo = {
  PrimaryIdAttribute?: string
  PrimaryNameAttribute?: string
  ManyToOneRelationships?: { ReferencingAttribute: string; ReferencedEntity: string }[]
}

async function entityInfo(table: string): Promise<EntityInfo> {
  const url = `${clientUrl()}/api/data/v9.2/EntityDefinitions(LogicalName='${encodeURIComponent(table)}')?$select=PrimaryIdAttribute,PrimaryNameAttribute&$expand=ManyToOneRelationships($select=ReferencingAttribute,ReferencedEntity)`
  const response = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Não foi possível consultar o metadata de ${table}.`)
  return response.json() as Promise<EntityInfo>
}

const choiceCache = new Map<string, Promise<FilterOption[]>>()

async function choiceOptions(field: CatalogField): Promise<FilterOption[]> {
  const kind = field.type === 'Status' ? 'Status' : field.type === 'State' ? 'State' : 'Picklist'
  const url = `${clientUrl()}/api/data/v9.2/EntityDefinitions(LogicalName='${encodeURIComponent(field.table)}')/Attributes(LogicalName='${encodeURIComponent(field.attribute)}')/Microsoft.Dynamics.CRM.${kind}AttributeMetadata?$select=LogicalName&$expand=OptionSet`
  const response = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Não foi possível consultar as opções de ${field.label}.`)
  const metadata = await response.json() as { OptionSet?: { Options?: { Value?: number; Label?: { UserLocalizedLabel?: { Label?: string } } }[] } }
  return (metadata.OptionSet?.Options ?? []).filter((item) => item.Value !== undefined).map((item) => ({ value: String(item.Value), label: item.Label?.UserLocalizedLabel?.Label ?? String(item.Value) }))
}

export async function searchFilterOptions(field: CatalogField, search: string): Promise<FilterOption[]> {
  if (field.type !== 'Lookup') {
    const key = `${field.table}:${field.attribute}`
    if (!choiceCache.has(key)) choiceCache.set(key, choiceOptions(field).catch((error) => { choiceCache.delete(key); throw error }))
    const options = await choiceCache.get(key)!
    return options.filter((item) => item.label.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')))
  }
  const source = await entityInfo(field.table)
  const targets = [...new Set((source.ManyToOneRelationships ?? []).filter((item) => item.ReferencingAttribute === field.attribute).map((item) => item.ReferencedEntity))]
  if (!targets.length) throw new Error(`Destino do lookup ${field.label} não encontrado no metadata.`)
  const api = context().WebApi as unknown as { retrieveMultipleRecords: (table: string, query: string) => Promise<{ entities: Record<string, unknown>[] }> }
  const matches = await Promise.all(targets.map(async (table) => {
    const target = await entityInfo(table)
    if (!target.PrimaryIdAttribute || !target.PrimaryNameAttribute) return []
    const escaped = search.trim().replace(/'/g, "''")
    const filter = escaped ? `&$filter=${encodeURIComponent(`contains(${target.PrimaryNameAttribute},'${escaped}')`).replace(/'/g, '%27')}` : ''
    const result = await api.retrieveMultipleRecords(table, `?$select=${target.PrimaryIdAttribute},${target.PrimaryNameAttribute}${filter}&$orderby=${target.PrimaryNameAttribute} asc&$top=25`)
    return result.entities.map((row) => ({ value: String(row[target.PrimaryIdAttribute!] ?? ''), label: String(row[target.PrimaryNameAttribute!] ?? '') })).filter((item) => item.value && item.label)
  }))
  return matches.flat().sort((a, b) => a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' })).slice(0, 25)
}

export async function resolveFilterOption(field: CatalogField, value: string): Promise<FilterOption | undefined> {
  if (!value) return undefined
  if (field.type !== 'Lookup') return (await searchFilterOptions(field, '')).find((option) => option.value === value)
  const source = await entityInfo(field.table)
  const targets = [...new Set((source.ManyToOneRelationships ?? []).filter((item) => item.ReferencingAttribute === field.attribute).map((item) => item.ReferencedEntity))]
  const api = context().WebApi as unknown as { retrieveRecord: (table: string, id: string, query: string) => Promise<Record<string, unknown>> }
  for (const table of targets) {
    const target = await entityInfo(table)
    if (!target.PrimaryNameAttribute) continue
    try {
      const row = await api.retrieveRecord(table, value, `?$select=${target.PrimaryNameAttribute}`)
      const label = String(row[target.PrimaryNameAttribute] ?? '')
      if (label) return { value, label }
    } catch { /* O GUID pode pertencer a outro destino de lookup. */ }
  }
  return undefined
}
