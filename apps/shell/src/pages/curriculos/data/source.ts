import { getHostXrm, type Row } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import type { ChoiceSet, Curriculo } from '../domain/types'
import type { KV } from '../domain/submission'
import { MOCK_CHOICES, createMockRows } from './mock'
import { ENTITY, loadCurriculos, mapCurriculo } from './queries'
import { flowBody, postToFlow, toBase64 } from './upload'

/** Tudo que a tela precisa do mundo externo; Dataverse em produção, memória no pnpm dev. */
export type Source = {
  mock: boolean
  /** false quando o build não tem VITE_CURRICULO_UPLOAD_URL. */
  uploadEnabled: boolean
  load: () => Promise<Curriculo[]>
  choices: () => Promise<ChoiceSet>
  create: (payload: Row) => Promise<string>
  update: (id: string, payload: Row) => Promise<void>
  /** Envia o arquivo ao Flow e devolve o webUrl (vazio quando o Flow não devolve). */
  upload: (recordId: string, file: File, payload: Row) => Promise<string>
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

function userName() {
  try {
    const context = getHostXrm()?.Utility?.getGlobalContext() as { userSettings?: { userName?: string } } | undefined
    return context?.userSettings?.userName || 'Usuário não identificado'
  } catch {
    return 'Usuário não identificado'
  }
}

function createMockSource(): Source {
  const rows = createMockRows(new Date())
  let seq = 0
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
    async upload(_recordId, file) {
      await wait(700) // upload simulado: nada sai do navegador
      return `https://exemplo.invalid/curriculos/${encodeURIComponent(file.name)}`
    },
    kv: browserKV(),
  }
}

export function createSource(host: Host, uploadUrl: string | undefined): Source {
  if (host.mode === 'mock') return createMockSource()
  const url = uploadUrl?.trim() ?? ''
  let set: Promise<string> | null = null
  const entitySet = () => (set ??= host.metadata.entities([ENTITY]).then((info) => {
    const value = info.get(ENTITY)?.entitySetName
    if (!value) throw new Error(`Tabela ${ENTITY} não encontrada na metadata.`)
    return value
  }).catch((error) => { set = null; throw error }))

  return {
    mock: false,
    uploadEnabled: url !== '',
    load: async () => loadCurriculos(host.client, await entitySet()),
    async choices() {
      const [status, cnh, origem, disponibilidade] = await Promise.all(
        ['new_statuscurriculo', 'new_categoriacnh', 'new_origemcurriculo', 'new_disponibilidade'].map((attribute) => host.metadata.choices(ENTITY, attribute)),
      )
      return { status, cnh, origem, disponibilidade }
    },
    create: async (payload) => host.client.create(await entitySet(), payload),
    update: async (id, payload) => host.client.update(await entitySet(), id, payload),
    async upload(recordId, file, payload) {
      if (!url) throw new Error('Envio de arquivo indisponível neste ambiente.')
      const base64 = await toBase64(file)
      return postToFlow(url, flowBody(recordId, { name: file.name, type: file.type, size: file.size, base64 }, payload, userName(), new Date().toISOString()))
    },
    kv: browserKV(),
  }
}
