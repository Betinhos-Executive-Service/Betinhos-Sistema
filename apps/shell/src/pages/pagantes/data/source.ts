import { cleanId, type Row } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import type { ChoiceSet, Contato, Pagante, ServicoOp } from '../domain/types'
import type { KV } from '../domain/filters'
import { MOCK_CHOICES, MOCK_CONTATOS, createMockPagantes, mockServicos } from './mock'
import { ENTITIES, loadContatos, loadPagantes, loadServicos, opFilter, periodFilter, type EntitySets } from './queries'
import { abrirGeradorDeRecibo } from './recibo'

/** Tudo que a tela precisa do mundo externo; Dataverse em produção, memória no pnpm dev. */
export type Source = {
  mock: boolean
  load: (since: Date | null) => Promise<Pagante[]>
  choices: () => Promise<ChoiceSet>
  contatos: (pessoaIds: string[]) => Promise<Map<string, Contato>>
  /** Todos os pagantes ativos da OP (o rateio completo, sem limite de período). */
  rateio: (opId: string) => Promise<Pagante[]>
  servicos: (opId: string) => Promise<ServicoOp[]>
  update: (id: string, payload: Row) => Promise<void>
  /** Abre o gerador de recibo do model-driven; `onRefresh` roda quando ele termina. */
  gerarRecibo: (ids: string[], onRefresh: () => void) => Promise<void>
  /** URL da Tela Gerar Pagantes embutida para a OP; null no mock. */
  gerarPagantesUrl: (opId: string) => string | null
  kv: KV
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function memoryKV(): KV {
  const data = new Map<string, string>()
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) }, removeItem: (k) => { data.delete(k) } }
}

/** localStorage quando disponível; memória em aba privada ou armazenamento bloqueado. */
export function browserKV(): KV {
  try {
    window.localStorage.getItem('betinhos.pagantes.probe')
    return window.localStorage
  } catch {
    return memoryKV()
  }
}

function createMockSource(): Source {
  const now = new Date()
  const rows = createMockPagantes(now)
  return {
    mock: true,
    async load(since) { await wait(350); return rows.filter((p) => !since || (p.criadoEm && p.criadoEm >= since)).map((p) => ({ ...p })) },
    choices: async () => MOCK_CHOICES,
    async contatos(ids) { await wait(150); return new Map(ids.flatMap((id) => (MOCK_CONTATOS.has(id) ? [[id, MOCK_CONTATOS.get(id)!] as const] : []))) },
    async rateio(opId) { await wait(250); return rows.filter((p) => p.opId === opId).map((p) => ({ ...p })) },
    async servicos(opId) { await wait(250); return mockServicos(opId, now) },
    async update(id, payload) {
      await wait(400)
      const row = rows.find((p) => p.id === id)
      if (!row) throw new Error('Pagante não encontrado.')
      if (payload.cr40f_status != null) row.status = payload.cr40f_status as number
      if (payload.cr40f_statusdorecibo != null) row.recibo = payload.cr40f_statusdorecibo as number
      row.alteradoEm = new Date()
    },
    async gerarRecibo() { await wait(300); throw new Error('O gerador de recibo só funciona dentro do Dataverse.') },
    gerarPagantesUrl: () => null,
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
    return { pagante: get(ENTITIES.pagante), pessoa: get(ENTITIES.pessoa), reserva: get(ENTITIES.reserva) }
  }).catch((error) => { sets = null; throw error }))

  return {
    mock: false,
    load: async (since) => loadPagantes(host.client, (await entitySets()).pagante, periodFilter(since)),
    async choices() {
      const [status, forma, recibo] = await Promise.all(
        ['cr40f_status', 'cr40f_formadepagamento', 'cr40f_statusdorecibo'].map((attribute) => host.metadata.choices(ENTITIES.pagante, attribute)),
      )
      return { status, forma, recibo }
    },
    contatos: async (ids) => loadContatos(host.client, (await entitySets()).pessoa, ids),
    rateio: async (opId) => loadPagantes(host.client, (await entitySets()).pagante, opFilter(opId)),
    servicos: async (opId) => loadServicos(host.client, (await entitySets()).reserva, opId),
    update: async (id, payload) => host.client.update((await entitySets()).pagante, id, payload),
    gerarRecibo: (ids, onRefresh) => abrirGeradorDeRecibo(host.clientUrl, ENTITIES.pagante, ids, onRefresh),
    gerarPagantesUrl: (opId) => `${host.clientUrl}/WebResources/Tela_GerarPagantes/index.html?recordId=${encodeURIComponent(cleanId(opId))}&embedded=1`,
    kv: browserKV(),
  }
}
