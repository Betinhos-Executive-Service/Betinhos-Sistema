import type { DataverseClient } from './client'
import { chunk, odataString } from './format'

export type EntityInfo = { logicalName: string; entitySetName: string; label: string; primaryName: string; objectTypeCode: number | null }

type EntityDefinition = {
  LogicalName: string
  EntitySetName: string
  PrimaryNameAttribute?: string
  ObjectTypeCode?: number
  DisplayCollectionName?: { UserLocalizedLabel?: { Label?: string } | null }
}

export type ChoiceOption = { value: number; label: string }

export type AttributeMeta = { logicalName: string; type: string; label: string; updatable: boolean; targets: string[] }

type AttributeDefinition = {
  LogicalName: string
  AttributeType: string
  IsValidForUpdate?: boolean
  DisplayName?: { UserLocalizedLabel?: { Label?: string } | null }
}

type PicklistDefinition = {
  OptionSet?: { Options: { Value: number; Label?: { UserLocalizedLabel?: { Label?: string } | null } }[] }
}

const SELECT = '$select=LogicalName,EntitySetName,PrimaryNameAttribute,DisplayCollectionName,ObjectTypeCode'

/** Nomes reais (entity set e rótulo plural) lidos da metadata, com cache por cliente. */
export function createMetadata(client: DataverseClient) {
  const cache = new Map<string, Promise<EntityInfo>>()

  function toInfo(definition: EntityDefinition): EntityInfo {
    return {
      logicalName: definition.LogicalName,
      entitySetName: definition.EntitySetName,
      label: definition.DisplayCollectionName?.UserLocalizedLabel?.Label || definition.LogicalName,
      primaryName: definition.PrimaryNameAttribute ?? '',
      objectTypeCode: typeof definition.ObjectTypeCode === 'number' ? definition.ObjectTypeCode : null,
    }
  }

  function entity(logicalName: string) {
    let info = cache.get(logicalName)
    if (!info) {
      info = client.request<EntityDefinition>(`EntityDefinitions(LogicalName='${odataString(logicalName)}')?${SELECT}`).then(toInfo)
      info.catch(() => cache.delete(logicalName))
      cache.set(logicalName, info)
    }
    return info
  }

  /** Carrega várias tabelas em poucas chamadas; tabelas inexistentes ficam fora do resultado. */
  async function entities(logicalNames: string[]) {
    const result = new Map<string, EntityInfo>()
    for (const group of chunk(logicalNames, 15)) {
      const filter = group.map((name) => `LogicalName eq '${odataString(name)}'`).join(' or ')
      const page = await client.request<{ value: EntityDefinition[] }>(`EntityDefinitions?${SELECT}&$filter=${encodeURIComponent(filter)}`)
      for (const definition of page.value) {
        const info = toInfo(definition)
        result.set(info.logicalName, info)
        cache.set(info.logicalName, Promise.resolve(info))
      }
    }
    return result
  }

  const choiceCache = new Map<string, Promise<ChoiceOption[]>>()

  /** Opções reais de uma coluna choice (nunca valores fixos no código), com cache por cliente. */
  function choices(entityName: string, attribute: string) {
    const key = `${entityName}.${attribute}`
    let options = choiceCache.get(key)
    if (!options) {
      const path = `EntityDefinitions(LogicalName='${odataString(entityName)}')/Attributes(LogicalName='${odataString(attribute)}')`
        + '/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options)'
      options = client.request<PicklistDefinition>(path).then((definition) => (definition.OptionSet?.Options ?? []).map((option) => ({
        value: option.Value,
        label: option.Label?.UserLocalizedLabel?.Label || String(option.Value),
      })))
      options.catch(() => choiceCache.delete(key))
      choiceCache.set(key, options)
    }
    return options
  }

  const attributeCache = new Map<string, Promise<AttributeMeta[]>>()

  /** Tipo, rótulo e alvos de lookup de todas as colunas de uma tabela, em duas chamadas, com cache. */
  function attributes(entityName: string) {
    let list = attributeCache.get(entityName)
    if (!list) {
      const base = `EntityDefinitions(LogicalName='${odataString(entityName)}')/Attributes`
      list = Promise.all([
        client.request<{ value: AttributeDefinition[] }>(`${base}?$select=LogicalName,AttributeType,DisplayName,IsValidForUpdate`),
        client.request<{ value: { LogicalName: string; Targets?: string[] }[] }>(`${base}/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=LogicalName,Targets`),
      ]).then(([all, lookups]) => {
        const targets = new Map(lookups.value.map((l) => [l.LogicalName, l.Targets ?? []]))
        return all.value.map((a) => ({
          logicalName: a.LogicalName,
          type: a.AttributeType,
          label: a.DisplayName?.UserLocalizedLabel?.Label || a.LogicalName,
          updatable: a.IsValidForUpdate === true,
          targets: targets.get(a.LogicalName) ?? [],
        }))
      })
      list.catch(() => attributeCache.delete(entityName))
      attributeCache.set(entityName, list)
    }
    return list
  }

  return { entity, entities, choices, attributes }
}
