import { fileToBase64, base64ToBlob } from './source'
import type { Documento } from './types'
import type { XrmWebApi } from './xrm'

// Flows HTTP do AppBetinhos (os mesmos do Planner + "Listar"), site BetinhosGestoInterna,
// biblioteca "Documentos Compartilhados". As URLs ficam em variáveis de ambiente do Dataverse.
export const FLOW_VARS = {
  salvar: 'new_URLFlowsalvararquivosSharePoint',
  consultar: 'new_URLFlowConsultarArquivosSharePoint',
  excluir: 'new_URLFlowExcluirArquivoSharePoint',
  listar: 'new_URLFlowListarArquivosSharePoint',
} as const
type FlowKey = keyof typeof FLOW_VARS

export const DOC_MAX_BYTES = 10 * 1024 * 1024
export const DOC_ROOT = 'Funcionarios'

/** Pasta estável por colaborador (id não muda quando o nome muda). DEV fica separado. */
export function pastaFuncionario(id: string, envLabel: string, root = DOC_ROOT) {
  return `${root}/${envLabel === 'DEV' ? 'DEV/' : ''}${id}`
}

/** O flow Salvar recusa "/", "\" e "..". Mantém a extensão e limita o tamanho. */
export function sanitizeFileName(name: string) {
  const clean = name.replace(/[\\/:*?"<>|#%]+/g, '_').replace(/\.{2,}/g, '.').replace(/\s+/g, ' ').trim().replace(/^\.+/, '')
  const dot = clean.lastIndexOf('.')
  const base = dot > 0 ? clean.slice(0, dot) : clean
  const ext = dot > 0 ? clean.slice(dot) : ''
  return `${(base || 'arquivo').slice(0, 120)}${ext.slice(0, 12)}`
}

/** Prefixo de data/hora (São Paulo) para anexos de anotação não colidirem: "20261002-153012 foto.png". */
export function nomeComData(nome: string, agora = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(agora)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00'
  return sanitizeFileName(`${get('year')}${get('month')}${get('day')}-${get('hour')}${get('minute')}${get('second')} ${nome}`)
}

/** "laudo.pdf" já existe → "laudo (2).pdf". */
export function uniqueName(name: string, existing: Iterable<string>) {
  const taken = new Set([...existing].map((item) => item.toLowerCase()))
  if (!taken.has(name.toLowerCase())) return name
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})${ext}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}

type FlowResult = Record<string, unknown> & { sucesso?: boolean; erro?: string; mensagem?: string }

export async function callFlow(url: string, body: unknown): Promise<FlowResult> {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  let result: FlowResult = {}
  try { result = await response.json() } catch { /* corpo vazio */ }
  if (!response.ok || result.sucesso !== true) {
    throw new Error(String(result.erro || result.mensagem || `O SharePoint não respondeu (HTTP ${response.status})`))
  }
  return result
}

function toDocumento(item: Record<string, unknown>): Documento {
  const size = Number(item.tamanho)
  return {
    id: String(item.id ?? item.identificador ?? ''),
    nome: String(item.nomeArquivo ?? ''),
    caminho: String(item.caminhoSharePoint ?? ''),
    tamanho: Number.isFinite(size) ? size : null,
    modificadoEm: typeof item.modificadoEm === 'string' ? item.modificadoEm : null,
    mimeType: typeof item.mimeType === 'string' && item.mimeType ? item.mimeType : null,
  }
}

/** `root` é a pasta-raiz do módulo na biblioteca (Funcionarios, Curriculos…). */
export function createSharePointDocs(api: XrmWebApi, envLabel: string, root = DOC_ROOT) {
  const urls = new Map<FlowKey, Promise<string>>()

  async function readEnvVar(schemaName: string) {
    const definitions = await api.retrieveMultipleRecords('environmentvariabledefinition', `?$select=environmentvariabledefinitionid,defaultvalue&$filter=schemaname eq '${schemaName}'`)
    const definition = definitions.entities[0]
    if (!definition) throw new Error(`Documentos não configurados neste ambiente (falta ${schemaName}).`)
    const values = await api.retrieveMultipleRecords('environmentvariablevalue', `?$select=value&$filter=_environmentvariabledefinitionid_value eq ${definition.environmentvariabledefinitionid}`)
    const value = String(values.entities[0]?.value ?? definition.defaultvalue ?? '').trim()
    if (!/^https:\/\//i.test(value)) throw new Error(`Documentos não configurados neste ambiente (${schemaName} sem URL).`)
    return value
  }

  function flowUrl(key: FlowKey) {
    let url = urls.get(key)
    if (!url) {
      url = readEnvVar(FLOW_VARS[key])
      url.catch(() => urls.delete(key))
      urls.set(key, url)
    }
    return url
  }

  return {
    pasta: (id: string) => pastaFuncionario(id, envLabel, root),

    async listar(id: string, subpasta?: string): Promise<Documento[]> {
      const pasta = pastaFuncionario(id, envLabel, root)
      const result = await callFlow(await flowUrl('listar'), { caminhoCompleto: subpasta ? `${pasta}/${subpasta}` : pasta })
      const itens = Array.isArray(result.arquivos) ? (result.arquivos as Record<string, unknown>[]) : []
      return itens.map(toDocumento).sort((a, b) => String(b.modificadoEm).localeCompare(String(a.modificadoEm)))
    },

    async enviar(id: string, file: File, nome: string, subpasta?: string): Promise<Documento> {
      const result = await callFlow(await flowUrl('salvar'), {
        caminhoCompleto: subpasta ? `${pastaFuncionario(id, envLabel, root)}/${subpasta}` : pastaFuncionario(id, envLabel, root),
        nomeArquivo: nome,
        conteudoBase64: await fileToBase64(file),
        mimeType: file.type || 'application/octet-stream',
        metadados: { tarefaId: id, origem: 'TELA_FUNCIONARIOS' },
      })
      return { ...toDocumento(result), nome, tamanho: Number(result.tamanho) || file.size, modificadoEm: new Date().toISOString(), mimeType: file.type || null }
    },

    async abrir(doc: Documento) {
      const result = await callFlow(await flowUrl('consultar'), { id: doc.id || doc.caminho, fileLocator: doc.id, caminhoSharePoint: doc.caminho, nomeArquivo: doc.nome })
      const mime = String(result.mimeType || doc.mimeType || 'application/octet-stream')
      return { nome: doc.nome, blob: base64ToBlob(String(result.conteudoBase64 ?? ''), mime) }
    },

    async excluir(id: string, doc: Documento) {
      await callFlow(await flowUrl('excluir'), { id: doc.id || doc.caminho, fileLocator: doc.id, caminhoSharePoint: doc.caminho, nomeArquivo: doc.nome, tarefaId: id })
    },
  }
}
