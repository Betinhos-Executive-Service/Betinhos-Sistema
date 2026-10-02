import { createClient, createMetadata, createXrmShim, getHostXrm, isLocalHost, type DataverseClient } from '@betinhos/dataverse'

/** App model-driven que ainda atende as listas e formulários nativos. */
const MODEL_DRIVEN_APP = 'cr40f_ModelDrivenBetinhos'

export type Host =
  /** Aberto fora do Dataverse (pnpm dev): sem dados, só navegação. */
  | { mode: 'mock' }
  | {
      mode: 'dataverse'
      clientUrl: string
      client: DataverseClient
      metadata: ReturnType<typeof createMetadata>
      /** `true` quando o shell roda dentro do app model-driven. */
      insideModelDriven: boolean
      appId: () => Promise<string | undefined>
    }

async function lookupAppId(client: DataverseClient) {
  const page = await client.request<{ value: { appmoduleid: string }[] }>(`appmodules?$select=appmoduleid&$filter=uniquename eq '${MODEL_DRIVEN_APP}'`)
  return page.value[0]?.appmoduleid
}

export function createHost(): Host {
  if (isLocalHost()) return { mode: 'mock' }

  const hostXrm = getHostXrm()
  const clientUrl = (hostXrm?.Utility?.getGlobalContext().getClientUrl() ?? location.origin).replace(/\/+$/, '')
  const client = createClient(clientUrl)

  // As telas legadas em iframe chamam `parent.Xrm`: repassa o Xrm do model-driven
  // ou, por URL direta, um Xrm mínimo sobre a Web API.
  if (!window.Xrm) window.Xrm = hostXrm ?? createXrmShim(client, clientUrl)

  let appId: Promise<string | undefined> | null = null
  return {
    mode: 'dataverse',
    clientUrl,
    client,
    metadata: createMetadata(client),
    insideModelDriven: Boolean(hostXrm),
    appId: () => (appId ??= Promise.resolve(hostXrm?.Utility?.getGlobalContext().getCurrentAppProperties?.())
      .then((properties) => properties?.appId ?? lookupAppId(client))
      .catch(() => undefined)),
  }
}
