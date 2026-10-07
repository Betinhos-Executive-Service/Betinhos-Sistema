import { getHostXrm, type Row } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import type { ChoiceSet, Curriculo } from '../domain/types'
import type { KV } from '../domain/submission'
import { MOCK_CHOICES, createMockRows } from './mock'
import { ENTITY, loadCurriculos, mapCurriculo } from './queries'
import { getDataverseEnvironmentLabel } from '../../funcionarios/data/dataverse'
import { createSharePointDocs, nomeComData } from '../../funcionarios/data/sharepoint'
import type { Documento } from '../../funcionarios/data/types'
import type { XrmHost } from '../../funcionarios/data/xrm'

/** Tudo que a tela precisa do mundo externo; Dataverse em produção, memória no pnpm dev. */
export type Source = {
  mock: boolean
  uploadEnabled: boolean
  load: () => Promise<Curriculo[]>
  choices: () => Promise<ChoiceSet>
  create: (payload: Row) => Promise<string>
  update: (id: string, payload: Row) => Promise<void>
  /**
   * Salva o arquivo na pasta do candidato no SharePoint (Flows comuns do AppBetinhos).
   * Devolve '' porque o Flow não gera link web; o arquivo é aberto por `openFile`.
   */
  upload: (recordId: string, file: File, payload: Row) => Promise<string>
  files: (recordId: string) => Promise<Documento[]>
  openFile: (doc: Documento) => Promise<{ nome: string; blob: Blob }>
  kv: KV
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function memoryKV(): KV {
  const data = new Map<string, string>()
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) }, removeItem: (k) => { data.delete(k) } }
}

/** localStorage quando disponível; memória em aba privada ou armazenamento bloqueado. */
function browserKV(): KV {
  try {
    window.localStorage.getItem(DRAFT_PROBE)
    return window.localStorage
  } catch {
    return memoryKV()
  }
}
const DRAFT_PROBE = 'betinhos.curriculos.probe'

function createMockSource(): Source {
  const rows = createMockRows(new Date())
  let seq = 0
  const files = new Map<string, Documento[]>()
  const blobs = new Map<string, Blob>()
  return {
    mock: true,
    uploadEnabled: true,
    async load() { await wait(350); return rows.map(mapCurriculo) },
    choices: async () => MOCK_CHOICES,
    async create(payload) {
      await wait(400)
      seq += 1
      const id = `mock-novo-${seq}`
      rows.unshift({ ...payload, new_curriculoid: id, createdon: new Date().toISOString() })
      return id
    },
    async update(id, payload) {
      await wait(400)
      const row = rows.find((r) => r.new_curriculoid === id)
      if (!row) throw new Error('Currículo não encontrado.')
      Object.assign(row, payload)
    },
    async upload(recordId, file) {
      await wait(700) // upload simulado: nada sai do navegador
      const nome = nomeComData(file.name)
      const doc: Documento = { id: `mock-doc-${++seq}`, nome, caminho: `/Documentos Compartilhados/Curriculos/DEV/${recordId}/${nome}`, tamanho: file.size, modificadoEm: new Date().toISOString(), mimeType: file.type || null }
      files.set(recordId, [doc, ...(files.get(recordId) ?? [])])
      blobs.set(doc.id, file)
      return ''
    },
    async files(recordId) { await wait(250); return files.get(recordId) ?? [] },
    async openFile(doc) { return { nome: doc.nome, blob: blobs.get(doc.id) ?? new Blob([]) } },
    kv: browserKV(),
  }
}

export function createSource(host: Host): Source {
  if (host.mode === 'mock') return createMockSource()
  const xrm = (getHostXrm() ?? window.Xrm) as XrmHost | undefined
  if (!xrm?.WebApi) throw new Error('A API do Dataverse não está disponível nesta janela')
  const docs = createSharePointDocs(xrm.WebApi, getDataverseEnvironmentLabel(host.clientUrl), 'Curriculos')
  let set: Promise<string> | null = null
  const entitySet = () => (set ??= host.metadata.entities([ENTITY]).then((info) => {
    const value = info.get(ENTITY)?.entitySetName
    if (!value) throw new Error(`Tabela ${ENTITY} não encontrada na metadata.`)
    return value
  }).catch((error) => { set = null; throw error }))

  return {
    mock: false,
    uploadEnabled: true,
    load: async () => loadCurriculos(host.client, await entitySet()),
    async choices() {
      const [status, cnh, origem, disponibilidade] = await Promise.all(
        ['new_statuscurriculo', 'new_categoriacnh', 'new_origemcurriculo', 'new_disponibilidade'].map((attribute) => host.metadata.choices(ENTITY, attribute)),
      )
      return { status, cnh, origem, disponibilidade }
    },
    create: async (payload) => host.client.create(await entitySet(), payload),
    update: async (id, payload) => host.client.update(await entitySet(), id, payload),
    async upload(recordId, file) {
      await docs.enviar(recordId, file, nomeComData(file.name))
      return ''
    },
    files: (recordId) => docs.listar(recordId),
    openFile: (doc) => docs.abrir(doc),
    kv: browserKV(),
  }
}
