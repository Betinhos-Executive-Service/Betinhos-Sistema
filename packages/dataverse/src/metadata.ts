import type { DataverseClient } from './client'
import { chunk, odataString } from './format'

export type EntityInfo = { logicalName: string; entitySetName: string; label: string }

type EntityDefinition = {
  LogicalName: string
  EntitySetName: string
  DisplayCollectionName?: { UserLocalizedLabel?: { Label?: string } | null }
}

const SELECT = '$select=LogicalName,EntitySetName,DisplayCollectionName'

/** Nomes reais (entity set e rótulo plural) lidos da metadata, com cache por cliente. */
export function createMetadata(client: DataverseClient) {
  const cache = new Map<string, Promise<EntityInfo>>()

  function toInfo(definition: EntityDefinition): EntityInfo {
    return {
      logicalName: definition.LogicalName,
      entitySetName: definition.EntitySetName,
      label: definition.DisplayCollectionName?.UserLocalizedLabel?.Label || definition.LogicalName,
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

  return { entity, entities }
}
