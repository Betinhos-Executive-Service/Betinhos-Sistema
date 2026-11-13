import type { DataverseClient } from '@betinhos/dataverse'
import { base64ToBlob } from '../../pages/funcionarios/data/source'
import { mimeDoArquivo, type Arquivo, type Comprovante } from './arquivo'

/** Flow HTTP "Flow - Consultar Arquivo OneDrive" (criado por packages/deploy/provision-flow-consultar-onedrive.ps1). */
export const FLOW_VAR = 'new_URLFlowConsultarArquivoOneDrive'

/** Comprovantes novos ficam no SharePoint do sistema; os antigos, no OneDrive do noreply (`betinhos-my`). */
const noSharePoint = (url: string | null) => !!url && /^https:\/\/[^/]+\.sharepoint\.com\//i.test(url) && !/^https:\/\/[^/]+-my\.sharepoint\.com\//i.test(url)

/** Buscas ao mesmo tempo: uma OP com 30 serviços não dispara 30 flows de uma vez. */
export const MAX_BUSCAS = 4
/** Estimativa: o flow devolve o arquivo inteiro em base64 (vídeo grande demora); acima disso, abrir no SharePoint. */
export const TEMPO_MAXIMO_MS = 60_000

type FlowResult = { sucesso?: boolean; erro?: string; nomeArquivo?: string; mimeType?: string; conteudoBase64?: string }

/** Fila simples: no máximo `limite` tarefas rodando; as outras esperam a vez, em ordem. */
export function criarFila(limite: number) {
  let rodando = 0
  const espera: (() => void)[] = []
  return async <T>(tarefa: () => Promise<T>): Promise<T> => {
    if (rodando >= limite) await new Promise<void>((vez) => espera.push(vez))
    rodando += 1
    try { return await tarefa() } finally { rodando -= 1; espera.shift()?.() }
  }
}

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
 * que não abre em iframe). Cada arquivo é buscado uma vez por sessão, no máximo `MAX_BUSCAS` ao mesmo tempo e por até `TEMPO_MAXIMO_MS`.
 */
export function createArquivos(client: DataverseClient, tempoMaximo = TEMPO_MAXIMO_MS) {
  let url: Promise<string> | null = null
  const naFila = criarFila(MAX_BUSCAS)
  const cache = new Map<string, Promise<Arquivo>>()

  const flowUrl = () => (url ??= readEnvVar(client, FLOW_VAR).then((value) => {
    if (!/^https:\/\//i.test(value)) throw new Error(`A prévia de comprovantes não está configurada neste ambiente (falta ${FLOW_VAR}).`)
    return value
  }).catch((error) => { url = null; throw error }))

  async function buscar(anexo: Comprovante): Promise<Arquivo> {
    // Comprovantes antigos não gravaram o id do OneDrive: o flow resolve pelo link de compartilhamento.
    if (!anexo.driveItemId && !anexo.url) throw new Error('Este comprovante não tem o arquivo no OneDrive.')
    const body = anexo.driveItemId
      ? { id: anexo.driveItemId, nomeArquivo: anexo.nome, ...(noSharePoint(anexo.url) ? { origem: 'sharepoint' } : {}) }
      : { link: anexo.url, nomeArquivo: anexo.nome }
    const endereco = await flowUrl()
    const controle = new AbortController()
    const prazo = setTimeout(() => controle.abort(), tempoMaximo)
    let response: Response
    let result: FlowResult = {}
    try {
      response = await fetch(endereco, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controle.signal })
      try { result = await response.json() } catch (erro) { if (controle.signal.aborted) throw erro /* senão, corpo vazio */ }
    } catch (erro) {
      if (controle.signal.aborted) throw new Error(`O arquivo demorou mais de ${Math.round(tempoMaximo / 1000)} s para chegar.`)
      throw erro
    } finally { clearTimeout(prazo) }
    if (!response.ok || result.sucesso !== true || !result.conteudoBase64) throw new Error(result.erro || `O OneDrive não respondeu (HTTP ${response.status}).`)
    // O nome no OneDrive tem a extensão (o gravado no Dataverse às vezes não: "comprovante-1").
    const nome = result.nomeArquivo?.trim() || anexo.nome
    const mime = mimeDoArquivo(nome, result.mimeType)
    return { nome, mime, url: URL.createObjectURL(base64ToBlob(result.conteudoBase64, mime)) }
  }

  return (anexo: Comprovante) => {
    let item = cache.get(anexo.id)
    if (!item) {
      item = naFila(() => buscar(anexo))
      item.catch(() => cache.delete(anexo.id))
      cache.set(anexo.id, item)
    }
    return item
  }
}
