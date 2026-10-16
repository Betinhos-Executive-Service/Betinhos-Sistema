import type { DataverseClient } from '@betinhos/dataverse'
import { base64ToBlob } from '../../funcionarios/data/source'
import { mimeDoArquivo } from '../domain/arquivo'
import type { Anexo, Arquivo } from '../domain/types'

/** Flow HTTP "Flow - Consultar Arquivo OneDrive" (criado por packages/deploy/provision-flow-consultar-onedrive.ps1). */
export const FLOW_VAR = 'new_URLFlowConsultarArquivoOneDrive'

/** Comprovantes novos ficam no SharePoint do sistema; os antigos, no OneDrive do noreply (`betinhos-my`). */
const noSharePoint = (url: string | null) => !!url && /^https:\/\/[^/]+\.sharepoint\.com\//i.test(url) && !/^https:\/\/[^/]+-my\.sharepoint\.com\//i.test(url)

type FlowResult = { sucesso?: boolean; erro?: string; nomeArquivo?: string; mimeType?: string; conteudoBase64?: string }

/** Valor sobrescrito da variável primeiro; sem ele, o padrão da definição. */
async function readEnvVar(client: DataverseClient, schemaName: string) {
  const values = await client.getAll(`environmentvariablevalues?$select=value&$filter=${encodeURIComponent(`EnvironmentVariableDefinitionId/schemaname eq '${schemaName}'`)}`)
  const value = typeof values[0]?.value === 'string' ? values[0].value.trim() : ''
  if (value) return value
  const definitions = await client.getAll(`environmentvariabledefinitions?$select=defaultvalue&$filter=${encodeURIComponent(`schemaname eq '${schemaName}'`)}`)
  return typeof definitions[0]?.defaultvalue === 'string' ? definitions[0].defaultvalue.trim() : ''
}

/**
 * Lê o comprovante no OneDrive pelo flow (por id ou, nos antigos, pelo link) e devolve um blob URL local (sem depender do link do OneDrive,
 * que não abre em iframe). Cada arquivo é buscado uma vez por sessão.
 */
export function createArquivos(client: DataverseClient) {
  let url: Promise<string> | null = null
  const cache = new Map<string, Promise<Arquivo>>()

  const flowUrl = () => (url ??= readEnvVar(client, FLOW_VAR).then((value) => {
    if (!/^https:\/\//i.test(value)) throw new Error(`A prévia de comprovantes não está configurada neste ambiente (falta ${FLOW_VAR}).`)
    return value
  }).catch((error) => { url = null; throw error }))

  async function buscar(anexo: Anexo): Promise<Arquivo> {
    // Comprovantes antigos não gravaram o id do OneDrive: o flow resolve pelo link de compartilhamento.
    if (!anexo.driveItemId && !anexo.url) throw new Error('Este comprovante não tem o arquivo no OneDrive.')
    const body = anexo.driveItemId
      ? { id: anexo.driveItemId, nomeArquivo: anexo.nome, ...(noSharePoint(anexo.url) ? { origem: 'sharepoint' } : {}) }
      : { link: anexo.url, nomeArquivo: anexo.nome }
    const response = await fetch(await flowUrl(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    let result: FlowResult = {}
    try { result = await response.json() } catch { /* corpo vazio */ }
    if (!response.ok || result.sucesso !== true || !result.conteudoBase64) throw new Error(result.erro || `O OneDrive não respondeu (HTTP ${response.status}).`)
    // O nome no OneDrive tem a extensão (o gravado no Dataverse às vezes não: "comprovante-1").
    const nome = result.nomeArquivo?.trim() || anexo.nome
    const mime = mimeDoArquivo(nome, result.mimeType)
    return { nome, mime, url: URL.createObjectURL(base64ToBlob(result.conteudoBase64, mime)) }
  }

  return (anexo: Anexo) => {
    let item = cache.get(anexo.id)
    if (!item) {
      item = buscar(anexo)
      item.catch(() => cache.delete(anexo.id))
      cache.set(anexo.id, item)
    }
    return item
  }
}
