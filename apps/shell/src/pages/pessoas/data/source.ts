import { cleanId, type Row } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import { browserKV } from '../../pagantes/data/source'
import { CHOICE_ATTRIBUTES, withFallback } from '../domain/choices'
import type { KV } from '../domain/filters'
import type { LookupBind } from '../domain/form'
import { mergeServicos } from '../domain/history'
import type { ChoiceKey, ChoiceSet, Cliente, Historico, Pessoa } from '../domain/types'
import { mockProgressive, mockSearch } from '../../../app/mockVolume'
import { normalizeSearch } from '@betinhos/ui'
import { MOCK_CLIENTES, createMockPessoas, mockHistorico, nextMockId } from './mock'
import { ENTITIES, loadPagantesDaPessoa, loadPessoas, loadServicosDaPessoa, searchClientes, searchPessoas, type EntitySets } from './queries'

/** Tudo que a tela precisa do mundo externo; Dataverse em produção, memória no pnpm dev. */
export type Source = {
  mock: boolean
  /** Cadastro inteiro; `onFirstPage` recebe a primeira página antes (lista grande). */
  load: (onFirstPage?: (list: Pessoa[]) => void) => Promise<Pessoa[]>
  /** Até 50 pessoas que batem com a busca (usada enquanto a lista não carregou inteira). */
  search: (query: string) => Promise<Pessoa[]>
  choices: () => Promise<ChoiceSet>
  searchClientes: (query: string) => Promise<Cliente[]>
  /** Navigation property e entity set do lookup de cliente (da metadata). */
  clienteBind: () => Promise<LookupBind>
  create: (payload: Row) => Promise<string>
  update: (id: string, payload: Row) => Promise<void>
  historico: (pessoaId: string) => Promise<Historico>
  kv: KV
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function createMockSource(): Source {
  const rows = createMockPessoas()
  return {
    mock: true,
    load: (onFirstPage) => mockProgressive(rows.map((p) => ({ ...p })), onFirstPage),
    search: (q) => { const t = normalizeSearch(q); return mockSearch(rows, (p) => normalizeSearch(`${p.nome} ${p.email}`).includes(t)) },
    choices: async () => withFallback({}),
    async searchClientes(q) { await wait(150); const t = q.trim().toLowerCase(); return MOCK_CLIENTES.filter((c) => c.nome.toLowerCase().startsWith(t)) },
    clienteBind: async () => ({ nav: 'cr40f_Cliente', set: 'cr40f_clientes1s' }),
    async create() { await wait(400); return nextMockId() },
    async update(id) { await wait(400); if (!rows.some((p) => p.id === id)) throw new Error('Pessoa não encontrada.') },
    async historico(id) { await wait(300); return mockHistorico(id, new Date()) },
    kv: browserKV(),
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
    return { pessoa: get(ENTITIES.pessoa), cliente: get(ENTITIES.cliente), reserva: get(ENTITIES.reserva), passageiro: get(ENTITIES.passageiro), pagante: get(ENTITIES.pagante) }
  }).catch((error) => { sets = null; throw error }))

  let bind: Promise<LookupBind> | null = null
  const clienteBind = () => (bind ??= (async () => {
    const rel = await host.client.request<{ value: { ReferencingEntityNavigationPropertyName: string }[] }>(
      `EntityDefinitions(LogicalName='${ENTITIES.pessoa}')/ManyToOneRelationships?$select=ReferencingEntityNavigationPropertyName&$filter=ReferencingAttribute eq 'cr40f_cliente'`,
    )
    const nav = rel.value[0]?.ReferencingEntityNavigationPropertyName
    if (!nav) throw new Error('Relação de cliente não encontrada na metadata.')
    return { nav, set: (await entitySets()).cliente }
  })().catch((error) => { bind = null; throw error }))

  return {
    mock: false,
    load: async (onFirstPage) => loadPessoas(host.client, (await entitySets()).pessoa, onFirstPage),
    search: async (q) => searchPessoas(host.client, (await entitySets()).pessoa, q),
    // Rótulo é acessório: metadata fora do ar cai nos rótulos conhecidos.
    async choices() {
      const keys = Object.keys(CHOICE_ATTRIBUTES) as ChoiceKey[]
      const lists = await Promise.all(keys.map((k) => host.metadata.choices(ENTITIES.pessoa, CHOICE_ATTRIBUTES[k]).catch(() => [])))
      return withFallback(Object.fromEntries(keys.map((k, i) => [k, lists[i]])) as Partial<ChoiceSet>)
    },
    searchClientes: async (q) => searchClientes(host.client, (await entitySets()).cliente, q),
    clienteBind,
    create: async (payload) => cleanId(await host.client.create((await entitySets()).pessoa, payload)),
    update: async (id, payload) => host.client.update((await entitySets()).pessoa, id, payload),
    async historico(id) {
      const s = await entitySets()
      const [{ servicos, limitado }, pagantes] = await Promise.all([loadServicosDaPessoa(host.client, s, id), loadPagantesDaPessoa(host.client, s.pagante, id)])
      return { servicos: mergeServicos(servicos), pagantes, limitado }
    },
    kv: browserKV(),
  }
}
