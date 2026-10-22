import { cleanId } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import { fileToBase64 } from '../../funcionarios/data/source'
import type { Changes } from '../domain/form'
import { miniaturaDaCapa, type Foto } from '../domain/fotos'
import type { Equipamento, Pessoa, TipoEquipamento } from '../domain/types'
import { createMockEquipamentos, createMockFotos, createMockPessoas, createMockTipos } from './mock'
import { ENTITIES, FOTO_ENTITY, capasPath, estadoPayload, fotoPath, fotoPayload, fotosPath, loadAll, mapCapas, mapFoto, responsavelRefPath, toPayload, type EntitySets } from './queries'

export type Carga = { equipamentos: Equipamento[]; tipos: TipoEquipamento[]; pessoas: Pessoa[] }

/** Tudo que a tela precisa do mundo externo; Dataverse em produção, memória no pnpm dev. */
export type Source = {
  mock: boolean
  load: () => Promise<Carga>
  create: (c: Changes) => Promise<string>
  update: (id: string, c: Changes) => Promise<void>
  createTipo: (nome: string) => Promise<string>
  renameTipo: (id: string, nome: string) => Promise<void>
  setTipoAtivo: (id: string, ativo: boolean) => Promise<void>
  /** Fotos do item, da mais antiga para a mais nova. */
  fotos: (equipamentoId: string) => Promise<Foto[]>
  /** Envia uma foto (já validada) e devolve como ficou gravada, com a miniatura. */
  addFoto: (equipamentoId: string, file: File, nome: string, capa: boolean) => Promise<Foto>
  setFotoCapa: (id: string, capa: boolean) => Promise<void>
  deleteFoto: (id: string) => Promise<void>
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const lerComoDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler o arquivo.'))
  reader.readAsDataURL(file)
})

function createMockSource(): Source {
  let seq = 100
  const nextId = (prefix: string) => { seq += 1; return `${prefix}-0000-4000-8000-${String(seq).padStart(12, '0')}` }
  const equipamentos = new Set(createMockEquipamentos().map((e) => e.id))
  const tipos = new Set(createMockTipos().map((t) => t.id))
  const exists = (ids: Set<string>, id: string, what: string) => { if (!ids.has(cleanId(id))) throw new Error(`${what} não encontrado.`) }
  // Fotos em memória enquanto a página está aberta; a capa da lista sai da marcada, como na consulta do Dataverse.
  let fotos = createMockFotos()
  const foto = (id: string) => { const f = fotos.find((x) => x.id === cleanId(id)); if (!f) throw new Error('Foto não encontrada.'); return f }
  const capaMarcada = (equipamentoId: string) => miniaturaDaCapa(fotos.filter((f) => f.equipamentoId === equipamentoId))
  return {
    mock: true,
    async load() {
      await wait(300)
      return { equipamentos: createMockEquipamentos().map((e) => ({ ...e, capa: capaMarcada(e.id) })), tipos: createMockTipos(), pessoas: createMockPessoas() }
    },
    async create() { await wait(400); const id = nextId('eeeeeeee'); equipamentos.add(id); return id },
    async update(id) { await wait(400); exists(equipamentos, id, 'Equipamento') },
    async createTipo() { await wait(300); const id = nextId('dddddddd'); tipos.add(id); return id },
    async renameTipo(id) { await wait(300); exists(tipos, id, 'Tipo') },
    async setTipoAtivo(id) { await wait(300); exists(tipos, id, 'Tipo') },
    async fotos(equipamentoId) { await wait(250); return fotos.filter((f) => f.equipamentoId === cleanId(equipamentoId)).map((f) => ({ ...f })) },
    async addFoto(equipamentoId, file, nome, capa) {
      exists(equipamentos, equipamentoId, 'Equipamento')
      const imagem = await lerComoDataUrl(file)
      await wait(500)
      // Data crescente mesmo com envios no mesmo milissegundo: a ordem de envio é a ordem das fotos.
      const nova: Foto = { id: nextId('ffffffff'), equipamentoId: cleanId(equipamentoId), nome, capa, criadoEm: new Date(Date.now() + seq), miniatura: imagem, url: imagem }
      fotos = [...fotos, nova]
      return { ...nova }
    },
    async setFotoCapa(id, capa) { await wait(250); foto(id); fotos = fotos.map((f) => (f.id === cleanId(id) ? { ...f, capa } : f)) },
    async deleteFoto(id) { await wait(250); foto(id); fotos = fotos.filter((f) => f.id !== cleanId(id)) },
  }
}

export function createSource(host: Host): Source {
  if (host.mode === 'mock') return createMockSource()
  let sets: Promise<EntitySets> | null = null
  const entitySets = () => (sets ??= host.metadata.entities(Object.values(ENTITIES)).then((info) => {
    const get = (name: string) => {
      const value = info.get(name)?.entitySetName
      if (!value) throw new Error(`Tabela ${name} não encontrada na metadata.`)
      return value
    }
    return { equipamento: get(ENTITIES.equipamento), tipo: get(ENTITIES.tipo), funcionario: get(ENTITIES.funcionario) }
  }).catch((error) => { sets = null; throw error }))
  let fotoSetPromise: Promise<string> | null = null
  const fotoSet = () => (fotoSetPromise ??= host.metadata.entities([FOTO_ENTITY]).then((info) => {
    const value = info.get(FOTO_ENTITY)?.entitySetName
    if (!value) throw new Error(`Tabela ${FOTO_ENTITY} não encontrada na metadata.`)
    return value
  }).catch((error) => { fotoSetPromise = null; throw error }))
  // A miniatura na lista é complemento: sem a tabela de fotos (antes do provision) ou sem acesso a ela, a lista carrega sem capas.
  const capas = () => fotoSet().then((set) => host.client.getAll(capasPath(set))).then(mapCapas).catch(() => new Map<string, string>())

  return {
    mock: false,
    async load() {
      const [carga, porItem] = await Promise.all([entitySets().then((s) => loadAll(host.client, s)), capas()])
      return { ...carga, equipamentos: carga.equipamentos.map((e) => ({ ...e, capa: porItem.get(e.id) ?? null })) }
    },
    create: async (c) => { const s = await entitySets(); return cleanId(await host.client.create(s.equipamento, toPayload(c, s))) },
    async update(id, c) {
      const s = await entitySets()
      // Limpar lookup: DELETE na referência, nunca `@odata.bind: null` (padrão de operacional/data/mutations.ts).
      // Vem ANTES do PATCH: se o PATCH falhar depois, o item fica sem responsável com o status antigo;
      // na ordem inversa, uma falha no DELETE deixaria "Baixado com responsável".
      if (c.responsavelId === null) await host.client.request(responsavelRefPath(s.equipamento, id), { method: 'DELETE' })
      const payload = toPayload(c, s)
      if (Object.keys(payload).length) await host.client.update(s.equipamento, id, payload)
    },
    createTipo: async (nome) => cleanId(await host.client.create((await entitySets()).tipo, { cr40f_name: nome.trim() })),
    renameTipo: async (id, nome) => host.client.update((await entitySets()).tipo, id, { cr40f_name: nome.trim() }),
    setTipoAtivo: async (id, ativo) => host.client.update((await entitySets()).tipo, id, estadoPayload(ativo)),
    async fotos(equipamentoId) {
      const set = await fotoSet()
      return (await host.client.getAll(fotosPath(set, equipamentoId))).map((row) => mapFoto(row, host.client.apiUrl, set))
    },
    async addFoto(equipamentoId, file, nome, capa) {
      const [set, s] = await Promise.all([fotoSet(), entitySets()])
      const id = cleanId(await host.client.create(set, fotoPayload(s.equipamento, equipamentoId, nome, capa, await fileToBase64(file))))
      // Relê para pegar a miniatura gerada pelo Dataverse e a data de criação (ordem das fotos). A foto já foi gravada:
      // se a releitura falhar, entra sem miniatura (a próxima abertura do item busca de novo) em vez de dizer que não foi enviada.
      try { return mapFoto(await host.client.request(fotoPath(set, id)), host.client.apiUrl, set) }
      catch { return { id, equipamentoId: cleanId(equipamentoId), nome, capa, criadoEm: new Date(), miniatura: null, url: null } }
    },
    setFotoCapa: async (id, capa) => host.client.update(await fotoSet(), id, { cr40f_capa: capa }),
    deleteFoto: async (id) => host.client.remove(await fotoSet(), id),
  }
}
