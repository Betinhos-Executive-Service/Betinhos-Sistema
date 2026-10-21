import { cleanId } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import type { Changes } from '../domain/form'
import type { Equipamento, Pessoa, TipoEquipamento } from '../domain/types'
import { createMockEquipamentos, createMockPessoas, createMockTipos } from './mock'
import { ENTITIES, estadoPayload, loadAll, responsavelRefPath, toPayload, type EntitySets } from './queries'

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
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function createMockSource(): Source {
  let seq = 100
  const nextId = (prefix: string) => { seq += 1; return `${prefix}-0000-4000-8000-${String(seq).padStart(12, '0')}` }
  return {
    mock: true,
    async load() { await wait(300); return { equipamentos: createMockEquipamentos(), tipos: createMockTipos(), pessoas: createMockPessoas() } },
    async create() { await wait(400); return nextId('eeeeeeee') },
    async update() { await wait(400) },
    async createTipo() { await wait(300); return nextId('dddddddd') },
    async renameTipo() { await wait(300) },
    async setTipoAtivo() { await wait(300) },
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

  return {
    mock: false,
    load: async () => loadAll(host.client, await entitySets()),
    create: async (c) => { const s = await entitySets(); return cleanId(await host.client.create(s.equipamento, toPayload(c, s))) },
    async update(id, c) {
      const s = await entitySets()
      const payload = toPayload(c, s)
      if (Object.keys(payload).length) await host.client.update(s.equipamento, id, payload)
      // Limpar lookup: DELETE na referência, nunca `@odata.bind: null` (padrão de operacional/data/mutations.ts).
      if (c.responsavelId === null) await host.client.request(responsavelRefPath(s.equipamento, id), { method: 'DELETE' })
    },
    createTipo: async (nome) => cleanId(await host.client.create((await entitySets()).tipo, { cr40f_name: nome.trim() })),
    renameTipo: async (id, nome) => host.client.update((await entitySets()).tipo, id, { cr40f_name: nome.trim() }),
    setTipoAtivo: async (id, ativo) => host.client.update((await entitySets()).tipo, id, estadoPayload(ativo)),
  }
}
