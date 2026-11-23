import { cleanId, type Row } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import { latenciaMock } from '../../../app/latenciaMock'
import { STATUS } from '../domain/choices'
import type { Anexo, Atualizacao, Etapa, Perfil, Projeto } from '../domain/types'
import { createMockArquivos, createMockAtualizacoes, createMockEtapas, createMockProjetos } from './mock'
import {
  ENTITIES, PAPEIS_RENAN, anexoPath, anexoPayload, atualizacaoPayload, atualizacoesPath, etapaPayload, etapasPath, mapAtualizacao, mapEtapa, mapProjeto,
  papeisPath, projetoCodigoPath, projetosPath, type EntitySets, type NovaAtualizacaoDados,
} from './queries'

export type Carga = { projetos: Projeto[]; etapas: Etapa[]; atualizacoes: Atualizacao[] }
export type NovaAtualizacao = NovaAtualizacaoDados
export type NovaEtapa = { projetoId: string; numero: number; codigo: string }

/** Tudo que a tela precisa do mundo externo; Dataverse em produção, memória no pnpm dev. */
export type Source = {
  mock: boolean
  load: () => Promise<Carga>
  /** Cria o projeto e devolve o id e o código (`PRJ-n`) que o Dataverse gerou. */
  createProjeto: (changes: Row) => Promise<{ id: string; codigo: string }>
  updateProjeto: (id: string, changes: Row) => Promise<void>
  createEtapa: (changes: Row, nova: NovaEtapa) => Promise<string>
  updateEtapa: (id: string, changes: Row) => Promise<void>
  /**
   * Grava a atualização e depois cada arquivo como anexo (nota). Se algum arquivo falhar, a atualização é
   * excluída (levando as notas já gravadas) e o erro segue para a tela: nada fica pela metade.
   */
  addAtualizacao: (nova: NovaAtualizacao, arquivos: File[]) => Promise<Atualizacao>
  /** Conteúdo do anexo (miniatura, áudio e abertura em nova aba). */
  baixarAnexo: (anexo: Anexo) => Promise<Blob>
  /** Renan = usuário com papel de administrador do ambiente; qualquer outro (ou erro na leitura) = gestor. */
  perfil: () => Promise<Perfil>
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

const s = (v: unknown) => (typeof v === 'string' ? v : '')

function createMockSource(): Source {
  let seq = 100
  const next = (prefix: string) => { seq += 1; return `${prefix}-0000-4000-8000-${String(seq).padStart(12, '0')}` }
  const arquivos = createMockArquivos()
  // Criados nesta visita voltam na próxima carga.
  let projetos = createMockProjetos()
  let etapas = createMockEtapas()
  let atualizacoes = createMockAtualizacoes()
  let codigo = projetos.length
  const existe = (id: string) => projetos.some((p) => p.id === cleanId(id))
  return {
    mock: true,
    async load() {
      await wait(300)
      return { projetos: projetos.map((p) => ({ ...p })), etapas: etapas.map((e) => ({ ...e })), atualizacoes: atualizacoes.map((a) => ({ ...a, anexos: [...a.anexos] })) }
    },
    async createProjeto(c) {
      await wait(400)
      const p: Projeto = { id: next('bbbbbbbb'), codigo: `PRJ-${++codigo}`, nome: s(c.cr40f_name), area: s(c.cr40f_area), responsavel: s(c.cr40f_responsavel), briefing: s(c.cr40f_briefing), instrucoes: s(c.cr40f_instrucoes) }
      projetos = [...projetos, p]
      return { id: p.id, codigo: p.codigo }
    },
    async updateProjeto(id) { await wait(400); if (!existe(id)) throw new Error('Projeto não encontrado.') },
    async createEtapa(c, nova) {
      await wait(400)
      if (!existe(nova.projetoId)) throw new Error('Projeto não encontrado.')
      if (etapas.some((e) => e.codigo === nova.codigo)) throw new Error(`Já existe a etapa ${nova.codigo}. Atualize a lista e tente de novo.`)
      const e: Etapa = {
        id: next('eeeeeeee'), projetoId: cleanId(nova.projetoId), numero: nova.numero, codigo: nova.codigo, nome: s(c.cr40f_name),
        status: Number(c.cr40f_status ?? STATUS.ideia), descricao: s(c.cr40f_descricao), prazo: s(c.cr40f_prazo) || null,
        andamento: Number(c.cr40f_andamento ?? 0), linkPr: s(c.cr40f_linkpr), publicadoProd: null,
      }
      etapas = [...etapas, e]
      return e.id
    },
    async updateEtapa(id) { await wait(400); if (!etapas.some((e) => e.id === cleanId(id))) throw new Error('Etapa não encontrada.') },
    async addAtualizacao(nova, files) {
      if (!existe(nova.projetoId)) throw new Error('Projeto não encontrado.')
      await wait(500)
      const anexos: Anexo[] = files.map((f) => { const id = next('dddddddd'); arquivos.set(id, f); return { id, nome: f.name, tipo: f.type, tamanho: f.size } })
      const a: Atualizacao = { id: next('cccccccc'), projetoId: cleanId(nova.projetoId), etapaId: nova.etapaId ? cleanId(nova.etapaId) : null, data: nova.data, autor: nova.autor, texto: nova.texto, prova: nova.prova, transcricao: '', anexos }
      atualizacoes = [...atualizacoes, a]
      return a
    },
    async baixarAnexo(anexo) {
      await wait(250)
      const arquivo = arquivos.get(anexo.id)
      if (!arquivo) throw new Error('Arquivo não encontrado.')
      return arquivo
    },
    // No pnpm dev o perfil é escolhido na própria tela (seletor "Perfil (exemplo)").
    perfil: async () => 'renan',
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
    return { projeto: get(ENTITIES.projeto), etapa: get(ENTITIES.etapa), atualizacao: get(ENTITIES.atualizacao) }
  }).catch((error) => { sets = null; throw error }))

  return {
    mock: false,
    async load() {
      const st = await entitySets()
      const [projetos, etapas, atualizacoes] = await Promise.all([
        host.client.getAll(projetosPath(st.projeto)), host.client.getAll(etapasPath(st.etapa)), host.client.getAll(atualizacoesPath(st.atualizacao)),
      ])
      return { projetos: projetos.map(mapProjeto), etapas: etapas.map(mapEtapa), atualizacoes: atualizacoes.map(mapAtualizacao) }
    },
    async createProjeto(changes) {
      const st = await entitySets()
      const id = cleanId(await host.client.create(st.projeto, changes))
      // O código (PRJ-n) é autonumber: só existe depois do create.
      const row = await host.client.request<Row>(projetoCodigoPath(st.projeto, id))
      return { id, codigo: s(row.cr40f_codigo) }
    },
    updateProjeto: async (id, changes) => host.client.update((await entitySets()).projeto, id, changes),
    async createEtapa(changes, nova) {
      const st = await entitySets()
      return cleanId(await host.client.create(st.etapa, etapaPayload(changes, nova, st)))
    },
    updateEtapa: async (id, changes) => host.client.update((await entitySets()).etapa, id, changes),
    async addAtualizacao(nova, files) {
      const st = await entitySets()
      const id = cleanId(await host.client.create(st.atualizacao, atualizacaoPayload(nova, st)))
      const anexos: Anexo[] = []
      try {
        for (const f of files) {
          const anexoId = cleanId(await host.client.create('annotations', anexoPayload(st.atualizacao, id, f.name, f.type, await toBase64(f))))
          anexos.push({ id: anexoId, nome: f.name, tipo: f.type, tamanho: f.size })
        }
      } catch (reason) {
        // Sem os anexos a atualização perderia a prova: exclui (as notas gravadas vão junto) e mostra o erro original.
        await host.client.remove(st.atualizacao, id).catch(() => undefined)
        throw reason
      }
      return { id, projetoId: cleanId(nova.projetoId), etapaId: nova.etapaId ? cleanId(nova.etapaId) : null, data: nova.data, autor: nova.autor, texto: nova.texto, prova: nova.prova, transcricao: '', anexos }
    },
    async baixarAnexo(anexo) {
      const row = await host.client.request<Row>(anexoPath(anexo.id))
      const corpo = typeof row.documentbody === 'string' ? row.documentbody : ''
      if (!corpo) throw new Error('O arquivo não tem conteúdo.')
      return fromBase64(corpo, anexo.tipo || String(row.mimetype ?? 'application/octet-stream'))
    },
    async perfil() {
      try {
        const me = await host.client.request<{ UserId: string }>('WhoAmI')
        const roles = await host.client.request<{ value: { name: string }[] }>(papeisPath(me.UserId))
        return roles.value.some((r) => PAPEIS_RENAN.includes(r.name)) ? 'renan' : 'gestor'
      } catch { return 'gestor' }
    },
  }
}
