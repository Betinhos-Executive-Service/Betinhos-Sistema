// WebApi mínimo sobre fetch para o app aberto pela URL direta do web resource
// (sem Xrm.WebApi). Usa o cookie da sessão do Dataverse na mesma origem e
// imita o contrato do Xrm.WebApi que o app consome.

export type FetchWebApiRecord = Record<string, any>;

type ExecuteRequest = Record<string, unknown> & {
  getMetadata: () => {
    boundParameter: string | null;
    operationType: number;
    operationName: string;
    parameterTypes: Record<string, { typeName: string; structuralProperty: number }>;
  };
};

export const SESSION_EXPIRED_EVENT = "app-motoristas:session-expired";
export const SESSION_EXPIRED_MESSAGE = "Sua sessão da Microsoft expirou. Entre de novo para continuar.";

const JSON_HEADERS = {
  Accept: "application/json",
  "Content-Type": "application/json; charset=utf-8",
  "OData-MaxVersion": "4.0",
  "OData-Version": "4.0",
  Prefer: 'odata.include-annotations="*"'
};

function cleanGuid(value = "") {
  return value.replace(/[{}]/g, "").toLowerCase();
}

export function createFetchWebApi(clientUrl: string, entitySetByName: Record<string, string>) {
  const base = `${clientUrl.replace(/\/$/, "")}/api/data/v9.2`;
  const entitySetCache = new Map<string, string>(Object.entries(entitySetByName));

  async function resolveEntitySet(entityName: string) {
    const cached = entitySetCache.get(entityName);
    if (cached) return cached;
    const response = await fetch(`${base}/EntityDefinitions(LogicalName='${entityName}')?$select=EntitySetName`, { headers: JSON_HEADERS, credentials: "same-origin" });
    await rejectIfFailed(response);
    const body = (await response.json()) as { EntitySetName?: string };
    const entitySet = String(body.EntitySetName ?? "");
    if (!entitySet) throw { message: `Conjunto de entidades de '${entityName}' nao encontrado.`, errorCode: "" };
    entitySetCache.set(entityName, entitySet);
    return entitySet;
  }

  async function rejectIfFailed(response: Response) {
    if (response.ok) return;
    if (response.status === 401 || response.status === 403) {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { status: response.status } }));
      throw { message: SESSION_EXPIRED_MESSAGE, errorCode: String(response.status), status: response.status };
    }
    let body: { error?: { message?: string; code?: string } } = {};
    try {
      body = await response.json();
    } catch {
      // corpo vazio ou não JSON
    }
    throw {
      message: body.error?.message || `HTTP ${response.status} ${response.statusText}`,
      errorCode: body.error?.code ?? String(response.status),
      status: response.status
    };
  }

  async function request(method: string, path: string, data?: unknown) {
    const response = await fetch(`${base}/${path}`, {
      method,
      headers: JSON_HEADERS,
      credentials: "same-origin",
      body: data === undefined ? undefined : JSON.stringify(data)
    });
    await rejectIfFailed(response);
    return response;
  }

  function withOptions(path: string, options?: string) {
    const query = String(options ?? "").trim();
    if (!query) return path;
    return `${path}${query.startsWith("?") ? "" : "?"}${query}`;
  }

  return {
    async retrieveMultipleRecords(entityName: string, options?: string) {
      const entitySet = await resolveEntitySet(entityName);
      const body = (await (await request("GET", withOptions(entitySet, options))).json()) as { value?: FetchWebApiRecord[]; "@odata.nextLink"?: string };
      return { entities: body.value ?? [], nextLink: body["@odata.nextLink"] };
    },
    async retrieveRecord(entityName: string, id: string, options?: string) {
      const entitySet = await resolveEntitySet(entityName);
      return (await (await request("GET", withOptions(`${entitySet}(${cleanGuid(id)})`, options))).json()) as FetchWebApiRecord;
    },
    async updateRecord(entityName: string, id: string, data: Record<string, unknown>) {
      const entitySet = await resolveEntitySet(entityName);
      await request("PATCH", `${entitySet}(${cleanGuid(id)})`, data);
      return { id: cleanGuid(id) };
    },
    async createRecord(entityName: string, data: Record<string, unknown>) {
      const entitySet = await resolveEntitySet(entityName);
      const response = await request("POST", entitySet, data);
      const entityId = response.headers.get("OData-EntityId") ?? "";
      return { id: cleanGuid(entityId.match(/\(([^)]+)\)\s*$/)?.[1] ?? "") };
    },
    async deleteRecord(entityName: string, id: string) {
      const entitySet = await resolveEntitySet(entityName);
      await request("DELETE", `${entitySet}(${cleanGuid(id)})`);
      return { id: cleanGuid(id) };
    },
    online: {
      async execute(rawRequest: Record<string, unknown>) {
        const { getMetadata, ...params } = rawRequest as ExecuteRequest;
        const metadata = getMetadata();
        let path = metadata.operationName;
        if (metadata.boundParameter) {
          const bound = params[metadata.boundParameter] as { entityType?: string; id?: string } | undefined;
          delete params[metadata.boundParameter];
          if (!bound?.entityType || !bound.id) throw { message: `Parametro vinculado '${metadata.boundParameter}' ausente.`, errorCode: "" };
          const entitySet = await resolveEntitySet(bound.entityType);
          path = `${entitySet}(${cleanGuid(bound.id)})/Microsoft.Dynamics.CRM.${metadata.operationName}`;
        }
        // operationType 0 = Action (POST com corpo); 1 = Function (GET).
        if (metadata.operationType === 1) {
          const args = Object.entries(params).map(([key, value]) => `${key}=${encodeURIComponent(JSON.stringify(value))}`).join(",");
          return request("GET", `${path}(${args})`);
        }
        return request("POST", path, params);
      }
    }
  };
}
