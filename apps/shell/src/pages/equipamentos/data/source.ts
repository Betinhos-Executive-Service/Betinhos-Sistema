import { cleanId } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import { getDataverseEnvironmentLabel } from '../../funcionarios/data/dataverse'
import { createSharePointDocs, pastaRegistro, type EnvVarApi } from '../../funcionarios/data/sharepoint'
import type { Documento } from '../../funcionarios/data/types'
import type { Changes } from '../domain/form'
import { caminhoDaCapa, type Foto } from '../domain/fotos'
import type { Equipamento, Pessoa, TipoEquipamento } from '../domain/types'
import { createMockEquipamentos, createMockFotos, createMockPessoas, createMockTipos, MOCK_ENV } from './mock'
import { ENTITIES, FOTO_ENTITY, capasPath, estadoPayload, FOTO_MAX_CAMINHO, fotoPayload, fotosPath, loadAll, mapCapas, mapFoto, responsavelRefPath, toPayload, type EntitySets } from './queries'

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
  /**
   * Envia uma foto (já validada): primeiro o arquivo para o SharePoint (`Equipamentos/<id>`), depois o registro com o
   * caminho. Se o registro falhar, o arquivo enviado é excluído e o erro do Dataverse segue para a tela.
   */
  addFoto: (equipamentoId: string, file: File, nome: string, capa: boolean) => Promise<Foto>
  setFotoCapa: (id: string, capa: boolean) => Promise<void>
  /** Apaga o arquivo no SharePoint e depois o registro (falha no arquivo deixa a foto no item, para tentar de novo). */
  deleteFoto: (foto: Foto) => Promise<void>
  /** Baixa a imagem pelo flow Consultar. */
  baixarFoto: (caminho: string) => Promise<Blob>
}

/** Pasta-raiz das fotos na biblioteca "Documentos Compartilhados" (a mesma de Funcionários). */
export const FOTO_ROOT = 'Equipamentos'
export const pastaFotos = (equipamentoId: string, envLabel: string) => pastaRegistro(FOTO_ROOT, cleanId(equipamentoId), envLabel)

const TIPO_POR_EXTENSAO: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp' }
const tipoImagem = (nome: string) => TIPO_POR_EXTENSAO[nome.split('.').pop()?.toLowerCase() ?? ''] ?? null

/**
 * `cr40f_caminho` guarda o caminho que o flow Salvar devolveu (ou o id do arquivo, se ele não devolver caminho):
 * com "/" é caminho, sem é id. Os flows Consultar e Excluir aceitam os dois.
 */
export function documentoDaFoto(caminho: string, nome = caminho.split('/').pop() || 'foto'): Documento {
  const ehCaminho = caminho.includes('/')
  return { id: ehCaminho ? '' : caminho, caminho: ehCaminho ? caminho : '', nome, tamanho: null, modificadoEm: null, mimeType: tipoImagem(nome) }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function createMockSource(): Source {
  let seq = 100
  const nextId = (prefix: string) => { seq += 1; return `${prefix}-0000-4000-8000-${String(seq).padStart(12, '0')}` }
  const equipamentos = new Set(createMockEquipamentos().map((e) => e.id))
  const tipos = new Set(createMockTipos().map((t) => t.id))
  const exists = (ids: Set<string>, id: string, what: string) => { if (!ids.has(cleanId(id))) throw new Error(`${what} não encontrado.`) }
  // Fotos em memória enquanto a página está aberta, com os arquivos num "SharePoint" de mentira (por caminho);
  // a capa da lista sai da marcada, como na consulta do Dataverse.
  const exemplo = createMockFotos()
  let fotos = exemplo.fotos
  const arquivos = new Map(exemplo.arquivos)
  const foto = (id: string) => { const f = fotos.find((x) => x.id === cleanId(id)); if (!f) throw new Error('Foto não encontrada.'); return f }
  const capaMarcada = (equipamentoId: string) => caminhoDaCapa(fotos.filter((f) => f.equipamentoId === equipamentoId))
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
      await wait(500)
      const caminho = `${pastaFotos(equipamentoId, MOCK_ENV)}/${nome}`
      arquivos.set(caminho, file)
      // Data crescente mesmo com envios no mesmo milissegundo: a ordem de envio é a ordem das fotos.
      const nova: Foto = { id: nextId('ffffffff'), equipamentoId: cleanId(equipamentoId), nome, capa, criadoEm: new Date(Date.now() + seq), caminho }
      fotos = [...fotos, nova]
      return { ...nova }
    },
    async setFotoCapa(id, capa) { await wait(250); foto(id); fotos = fotos.map((f) => (f.id === cleanId(id) ? { ...f, capa } : f)) },
    async deleteFoto(f) { await wait(250); foto(f.id); arquivos.delete(f.caminho); fotos = fotos.filter((x) => x.id !== cleanId(f.id)) },
    async baixarFoto(caminho) {
      await wait(400)
      const arquivo = arquivos.get(caminho)
      if (!arquivo) throw new Error('Arquivo não encontrado no SharePoint.')
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
  // Os flows do SharePoint leem a URL em variáveis de ambiente; o store de Funcionários lê pelo formato do Xrm.WebApi.
  const envVars: EnvVarApi = { retrieveMultipleRecords: async (entity, options = '') => ({ entities: await host.client.getAll(`${entity}s${options}`) }) }
  const envLabel = getDataverseEnvironmentLabel(host.clientUrl)
  const sharepoint = createSharePointDocs(envVars, envLabel, FOTO_ROOT, 'TELA_EQUIPAMENTOS')
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
      return (await host.client.getAll(fotosPath(set, equipamentoId))).map(mapFoto)
    },
    async addFoto(equipamentoId, file, nome, capa) {
      const [set, s] = await Promise.all([fotoSet(), entitySets()])
      const item = cleanId(equipamentoId)
      const doc = await sharepoint.enviar(item, file, nome)
      const caminho = doc.caminho || doc.id || `${pastaFotos(item, envLabel)}/${nome}`
      try {
        if (caminho.length > FOTO_MAX_CAMINHO) throw new Error(`O caminho do arquivo no SharePoint passou de ${FOTO_MAX_CAMINHO} caracteres.`)
        const id = cleanId(await host.client.create(set, fotoPayload(s.equipamento, item, nome, capa, caminho)))
        return { id, equipamentoId: item, nome, capa, criadoEm: new Date(), caminho }
      } catch (reason) {
        // Sem registro o arquivo ficaria perdido na pasta: exclui (se a exclusão também falhar, vale o erro do registro).
        await sharepoint.excluir(item, { ...doc, nome }).catch(() => undefined)
        throw reason
      }
    },
    setFotoCapa: async (id, capa) => host.client.update(await fotoSet(), id, { cr40f_capa: capa }),
    async deleteFoto(f) {
      const set = await fotoSet()
      if (f.caminho) await sharepoint.excluir(f.equipamentoId, documentoDaFoto(f.caminho, f.nome))
      await host.client.remove(set, f.id)
    },
    baixarFoto: async (caminho) => (await sharepoint.abrir(documentoDaFoto(caminho))).blob,
  }
}
