// Metadados do Dataverse: atributos obrigatórios e nomes de navegação de lookups (com cache).
import { dataverseLog, dataverseWarn, describeDataverseError, escapeODataText, getWebApiEntityName, retrieveMultiple } from "./cliente.ts";
import { getClientUrl } from "./registros.ts";

type RelationshipMetadataRecord = {
  SchemaName?: string;
  ReferencedEntity?: string;
  ReferencingEntity?: string;
  ReferencingAttribute?: string;
  ReferencingEntityNavigationPropertyName?: string;
};

type RelationshipMetadataResult = {
  value?: RelationshipMetadataRecord[];
};

export type LookupNavigationRequest = {
  referencingEntitySetName: string;
  referencedEntitySetName: string;
  referencingAttribute: string;
  label: string;
  required?: boolean;
};

const lookupNavigationNameCache = new Map<string, string>();

function normalizeMetadataName(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

async function fetchDataverseMetadataJson<T>(path: string): Promise<T> {
  const response = await fetch(encodeURI(`${getClientUrl()}/api/data/v9.2/${path}`), {
    headers: {
      Accept: "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0"
    }
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GET ${path}\n${response.status} ${response.statusText}\n${text}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

async function fetchManyToOneRelationshipMetadata(referencingEntityName: string) {
  const select = "$select=SchemaName,ReferencedEntity,ReferencingEntity,ReferencingAttribute,ReferencingEntityNavigationPropertyName";
  try {
    const metadata = await fetchDataverseMetadataJson<RelationshipMetadataResult>(
      `EntityDefinitions(LogicalName='${escapeODataText(referencingEntityName)}')/ManyToOneRelationships?${select}`
    );
    return metadata.value ?? [];
  } catch (error) {
    dataverseWarn("Consulta de relacionamentos pela EntityDefinitions falhou. Tentando RelationshipDefinitions.", describeDataverseError(error));
    const metadata = await fetchDataverseMetadataJson<RelationshipMetadataResult>(
      `RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata?${select}&$filter=ReferencingEntity eq '${escapeODataText(referencingEntityName)}'`
    );
    return metadata.value ?? [];
  }
}

export async function assertEntityHasAttributes(entitySetName: string, label: string, requiredAttributes: string[]) {
  try {
    await retrieveMultiple(entitySetName, `$select=${requiredAttributes.join(",")}&$top=1`);
  } catch (error) {
    throw new Error(
      `Schema de ${label} nao passou na consulta real do Dataverse. Confirme tabela, campos e relacionamentos no ambiente real. Detalhe: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

export async function resolveLookupNavigationName({
  referencingEntitySetName,
  referencedEntitySetName,
  referencingAttribute,
  label
}: LookupNavigationRequest) {
  const referencingEntityName = getWebApiEntityName(referencingEntitySetName);
  const referencedEntityName = getWebApiEntityName(referencedEntitySetName);
  const cacheKey = `${referencingEntityName}:${referencedEntityName}:${referencingAttribute}`;
  const cached = lookupNavigationNameCache.get(cacheKey);
  if (cached) return cached;

  const relationships = await fetchManyToOneRelationshipMetadata(referencingEntityName);
  const match = relationships.find((relationship) =>
    normalizeMetadataName(relationship.ReferencingAttribute) === normalizeMetadataName(referencingAttribute) &&
    normalizeMetadataName(relationship.ReferencedEntity) === normalizeMetadataName(referencedEntityName)
  );
  const navigationName = String(match?.ReferencingEntityNavigationPropertyName ?? "").trim();
  if (!navigationName) {
    const candidates = relationships
      .filter((relationship) => normalizeMetadataName(relationship.ReferencingAttribute) === normalizeMetadataName(referencingAttribute))
      .map((relationship) => ({
        schemaName: relationship.SchemaName,
        referencedEntity: relationship.ReferencedEntity,
        referencingAttribute: relationship.ReferencingAttribute,
        navigationName: relationship.ReferencingEntityNavigationPropertyName
      }));
    throw new Error(`Navigation property nao encontrado para ${label} (${referencingEntityName}.${referencingAttribute}). Candidatos: ${JSON.stringify(candidates)}`);
  }

  lookupNavigationNameCache.set(cacheKey, navigationName);
  dataverseLog("Navigation property resolvido.", {
    label,
    referencingEntityName,
    referencedEntityName,
    referencingAttribute,
    navigationName,
    schemaName: match?.SchemaName
  });
  return navigationName;
}
