import { cleanId, type Row } from '@betinhos/dataverse'
import { normalizeSearch } from '@betinhos/ui'
import type { Host } from '../../../host'
import { mockProgressive, mockSearch } from '../../../app/mockVolume'
import type { ChoiceSet, Contato, Pagante, ServicoOp } from '../domain/types'
import type { KV } from '../domain/filters'
import { withFallback } from '../domain/choices'
import { MOCK_CHOICES, MOCK_CONTATOS, createMockPagantes, mockServicos } from './mock'
import { ENTITIES, loadContatos, loadPagantes, loadServicos, opFilter, periodFilter, searchPagantes, type EntitySets } from './queries'
import { abrirGeradorDeRecibo } from './recibo'

/** Tudo que a tela precisa do mundo externo; Dataverse em produção, memória no pnpm dev. */
export type Source = {
  mock: boolean
  /** Pagantes do período; `onFirstPage` recebe a primeira página antes (lista grande). */
  load: (since: Date | null, onFirstPage?: (list: Pagante[]) => void) => Promise<Pagante[]>
  /** Até 50 pagantes do período que batem com a busca (usada enquanto a lista não carregou inteira). */
  search: (since: Date | null, query: string) => Promise<Pagante[]>
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
    load: (since, onFirstPage) => mockProgressive(rows.filter((p) => !since || (p.criadoEm && p.criadoEm >= since)).map((p) => ({ ...p })), onFirstPage),
    search: (since, q) => { const t = normalizeSearch(q); return mockSearch(rows, (p) => (!since || (p.criadoEm != null && p.criadoEm >= since)) && normalizeSearch(p.codigo).startsWith(t)) },
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
    return { pagante: get(ENTITIES.pagante), pessoa: get(ENTITIES.pessoa), reserva: get(ENTITIES.reserva), composicao: get(ENTITIES.composicao) }
  }).catch((error) => { sets = null; throw error }))

  return {
    mock: false,
    load: async (since, onFirstPage) => loadPagantes(host.client, (await entitySets()).pagante, periodFilter(since), onFirstPage),
    search: async (since, q) => searchPagantes(host.client, (await entitySets()).pagante, periodFilter(since), q),
    // Rótulo é acessório: metadata fora do ar cai nos rótulos conhecidos em vez de travar a lista.
    async choices() {
      const [status, forma, recibo] = await Promise.all(
        ['cr40f_status', 'cr40f_formadepagamento', 'cr40f_statusdorecibo'].map((attribute) => host.metadata.choices(ENTITIES.pagante, attribute).catch(() => [])),
      )
      return withFallback({ status, forma, recibo })
    },
    contatos: async (ids) => loadContatos(host.client, (await entitySets()).pessoa, ids),
    rateio: async (opId) => loadPagantes(host.client, (await entitySets()).pagante, opFilter(opId)),
    servicos: async (opId) => loadServicos(host.client, await entitySets(), opId),
    update: async (id, payload) => host.client.update((await entitySets()).pagante, id, payload),
    gerarRecibo: (ids, onRefresh) => abrirGeradorDeRecibo(host.clientUrl, ENTITIES.pagante, ids, onRefresh),
    gerarPagantesUrl: (opId) => `${host.clientUrl}/WebResources/Tela_GerarPagantes/index.html?recordId=${encodeURIComponent(cleanId(opId))}&embedded=1`,
    kv: browserKV(),
  }
}
