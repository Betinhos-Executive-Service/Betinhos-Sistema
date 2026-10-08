import { cleanId, type Row } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import type { Infracao, MultaUso } from '../domain/types'
import { createMockInfracoes, createMockMultas } from './mock'
import { ENTITIES, estadoPayload, loadInfracoes, loadMultasUso, type EntitySets } from './queries'

/** Tudo que a tela precisa do mundo externo; Dataverse em produção, memória no pnpm dev. */
export type Source = {
  mock: boolean
  load: () => Promise<Infracao[]>
  multas: () => Promise<MultaUso[]>
  create: (payload: Row) => Promise<string>
  update: (id: string, payload: Row) => Promise<void>
  setAtivo: (id: string, ativo: boolean) => Promise<void>
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function createMockSource(): Source {
  const rows = createMockInfracoes()
  const multas = createMockMultas()
  let seq = 100
  const exists = (id: string) => { if (!rows.some((i) => i.id === id)) throw new Error('Infração não encontrada.') }
  return {
    mock: true,
    async load() { await wait(300); return rows.map((i) => ({ ...i, competencia: [...i.competencia] })) },
    async multas() { await wait(400); return multas.map((m) => ({ ...m })) },
    async create() { await wait(400); seq += 1; return `cccccccc-0000-4000-8000-${String(seq).padStart(12, '0')}` },
    async update(id) { await wait(400); exists(id) },
    async setAtivo(id) { await wait(300); exists(id) },
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
    return { infracao: get(ENTITIES.infracao), multa: get(ENTITIES.multa) }
  }).catch((error) => { sets = null; throw error }))

  return {
    mock: false,
    load: async () => loadInfracoes(host.client, (await entitySets()).infracao),
    multas: async () => loadMultasUso(host.client, (await entitySets()).multa),
    create: async (payload) => cleanId(await host.client.create((await entitySets()).infracao, payload)),
    update: async (id, payload) => host.client.update((await entitySets()).infracao, id, payload),
    setAtivo: async (id, ativo) => host.client.update((await entitySets()).infracao, id, estadoPayload(ativo)),
  }
}
