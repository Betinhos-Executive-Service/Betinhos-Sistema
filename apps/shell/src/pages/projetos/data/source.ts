import { cleanId, type Row } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import { latenciaMock } from '../../../app/latenciaMock'
import type { Anexo, Atualizacao, Projeto } from '../domain/types'
import { createMockArquivos, createMockAtualizacoes, createMockProjetos } from './mock'
import { ENTITIES, anexoPath, anexoPayload, atualizacaoPayload, atualizacoesPath, mapAtualizacao, mapProjeto, projetosPath, type EntitySets } from './queries'

export type Carga = { projetos: Projeto[]; atualizacoes: Atualizacao[] }
export type NovaAtualizacao = { projetoId: string; data: string; autor: number; texto: string; prova: boolean }

/** Tudo que a tela precisa do mundo externo; Dataverse em produção, memória no pnpm dev. */
export type Source = {
  mock: boolean
  load: () => Promise<Carga>
  create: (changes: Row) => Promise<string>
  update: (id: string, changes: Row) => Promise<void>
  /**
   * Grava a atualização e depois cada arquivo como anexo (nota). Se algum arquivo falhar, a atualização é
   * excluída (levando as notas já gravadas) e o erro segue para a tela: nada fica pela metade.
   */
  addAtualizacao: (nova: NovaAtualizacao, arquivos: File[]) => Promise<Atualizacao>
  /** Conteúdo do anexo (miniatura e abertura em nova aba). */
  baixarAnexo: (anexo: Anexo) => Promise<Blob>
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, latenciaMock(ms)))

/** Arquivo → base64 puro (sem o prefixo `data:`), em blocos para não estourar a pilha. */
export async function toBase64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

function fromBase64(base64: string, tipo: string): Blob {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: tipo })
}

function createMockSource(): Source {
  let seq = 100
  const next = (prefix: string) => { seq += 1; return `${prefix}-0000-4000-8000-${String(seq).padStart(12, '0')}` }
  const projetos = new Set(createMockProjetos().map((p) => p.id))
  const arquivos = createMockArquivos()
  let atualizacoes = createMockAtualizacoes()
  // Projetos criados/editados nesta visita voltam na próxima carga.
  let lista = createMockProjetos()
  return {
    mock: true,
    async load() { await wait(300); return { projetos: lista.map((p) => ({ ...p })), atualizacoes: atualizacoes.map((a) => ({ ...a, anexos: [...a.anexos] })) } },
    async create(changes) {
      await wait(400)
      const id = next('bbbbbbbb')
      projetos.add(id)
      lista = [...lista, { id, nome: String(changes.cr40f_name ?? ''), area: String(changes.cr40f_area ?? ''), status: Number(changes.cr40f_status), responsavel: String(changes.cr40f_responsavel ?? ''), prazo: (changes.cr40f_prazo as string) ?? null, andamento: Number(changes.cr40f_andamento ?? 0), linkPr: String(changes.cr40f_linkpr ?? ''), instrucoes: String(changes.cr40f_instrucoes ?? '') }]
      return id
    },
    async update(id) { await wait(400); if (!projetos.has(cleanId(id))) throw new Error('Projeto não encontrado.') },
    async addAtualizacao(nova, files) {
      if (!projetos.has(cleanId(nova.projetoId))) throw new Error('Projeto não encontrado.')
      await wait(500)
      const anexos: Anexo[] = files.map((f) => { const id = next('dddddddd'); arquivos.set(id, f); return { id, nome: f.name, tipo: f.type, tamanho: f.size } })
      const a: Atualizacao = { id: next('cccccccc'), projetoId: cleanId(nova.projetoId), data: nova.data, autor: nova.autor, texto: nova.texto, prova: nova.prova, anexos }
      atualizacoes = [...atualizacoes, a]
      return a
    },
    async baixarAnexo(anexo) {
      await wait(250)
      const arquivo = arquivos.get(anexo.id)
      if (!arquivo) throw new Error('Arquivo não encontrado.')
      return arquivo
    },
  }
}

export function createSource(host: Host): Source {
  if (host.mode === 'mock') return createMockSource()
  let sets: Promise<EntitySets> | null = null
  const entitySets = () => (sets ??= host.metadata.entities(Object.values(ENTITIES)).then((info) => {
    const get = (name: string) => {
      const value = info.get(name)?.entitySetName
      if (!value) throw new Error(`Tabela ${name} não encontrada na metadata. A migration de Projetos já foi aplicada neste ambiente?`)
      return value
    }
    return { projeto: get(ENTITIES.projeto), atualizacao: get(ENTITIES.atualizacao) }
  }).catch((error) => { sets = null; throw error }))

  return {
    mock: false,
    async load() {
      const s = await entitySets()
      const [projetos, atualizacoes] = await Promise.all([host.client.getAll(projetosPath(s.projeto)), host.client.getAll(atualizacoesPath(s.atualizacao))])
      return { projetos: projetos.map(mapProjeto), atualizacoes: atualizacoes.map(mapAtualizacao) }
    },
    create: async (changes) => cleanId(await host.client.create((await entitySets()).projeto, changes)),
    update: async (id, changes) => host.client.update((await entitySets()).projeto, id, changes),
    async addAtualizacao(nova, files) {
      const s = await entitySets()
      const id = cleanId(await host.client.create(s.atualizacao, atualizacaoPayload(nova, s)))
      const anexos: Anexo[] = []
      try {
        for (const f of files) {
          const anexoId = cleanId(await host.client.create('annotations', anexoPayload(s.atualizacao, id, f.name, f.type, await toBase64(f))))
          anexos.push({ id: anexoId, nome: f.name, tipo: f.type, tamanho: f.size })
        }
      } catch (reason) {
        // Sem os anexos a atualização perderia a prova: exclui (as notas gravadas vão junto) e mostra o erro original.
        await host.client.remove(s.atualizacao, id).catch(() => undefined)
        throw reason
      }
      return { id, projetoId: cleanId(nova.projetoId), data: nova.data, autor: nova.autor, texto: nova.texto, prova: nova.prova, anexos }
    },
    async baixarAnexo(anexo) {
      const row = await host.client.request<Row>(anexoPath(anexo.id))
      const corpo = typeof row.documentbody === 'string' ? row.documentbody : ''
      if (!corpo) throw new Error('O arquivo não tem conteúdo.')
      return fromBase64(corpo, anexo.tipo || String(row.mimetype ?? 'application/octet-stream'))
    },
  }
}
