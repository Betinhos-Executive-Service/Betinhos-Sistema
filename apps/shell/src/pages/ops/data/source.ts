import { normalizeSearch } from '@betinhos/ui'
import type { Host } from '../../../host'
import { getAllWithFirstPage, searchRows } from '../../../app/pagedLoad'
import { mockProgressive, mockSearch } from '../../../app/mockVolume'
import { createSource as createPagantesSource, browserKV, type Source as PagantesSource } from '../../pagantes/data/source'
import type { KV } from '../../pagantes/domain/filters'
import { OP_STATUS, withOpFallback } from '../domain/status'
import type { Op, OpChoices } from '../domain/types'
import { createMockOps } from './mock'
import { ENTITY_OP, loadValoresServicos, mapOp, opsPath, opsSearchFilter } from './queries'
import { latenciaMock } from '../../../app/latenciaMock'
import { guid } from '../../pagantes/data/queries'

const ENTITY_RESERVA = 'cr40f_reservadeveculos'
const ENTITY_COMPOSICAO = 'cr40f_composicaodeprecos'

/** Tudo que a tela precisa do mundo externo. Rateio, serviços e contatos vêm do Source de Pagantes. */
export type Source = {
  mock: boolean
  /**
   * OPs do período. `onPartial` mostra antes o que já chegou: a primeira página e depois a lista toda ainda sem o
   * valor dos serviços (a soma vem por último).
   */
  load: (since: Date | null, onPartial?: (list: Op[]) => void) => Promise<Op[]>
  /** Até 50 OPs do período que batem com a busca (usada enquanto a lista não carregou inteira). */
  search: (since: Date | null, query: string) => Promise<Op[]>
  /** Uma OP pelo ID (gaveta aberta por cima de outra lista); `null` se não existe ou está inativa. */
  get: (id: string) => Promise<Op | null>
  choices: () => Promise<OpChoices>
  /** Valor atual da OP, relido ao abrir a ficha: o plugin soma os serviços um a um logo depois de criar a OP. */
  valor: (id: string) => Promise<number | null>
  cancel: (id: string) => Promise<void>
  pagantes: Pick<PagantesSource, 'rateio' | 'servicos' | 'contatos' | 'choices' | 'gerarPagantesUrl'>
  kv: KV
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, latenciaMock(ms)))

function createMockSource(host: Host): Source {
  const rows = createMockOps(new Date())
  return {
    mock: true,
    load: (since, onPartial) => mockProgressive(rows.filter((op) => !since || (op.criadoEm && op.criadoEm >= since)).map((op) => ({ ...op })), onPartial),
    search: (since, q) => {
      const t = normalizeSearch(q)
      return mockSearch(rows, (op) => (!since || (op.criadoEm != null && op.criadoEm >= since)) && normalizeSearch(`${op.codigo} ${op.cliente} ${op.passageiros}`).includes(t))
    },
    async get(id) { const op = rows.find((x) => x.id === id); return op ? { ...op } : null },
    choices: async () => withOpFallback({}),
    valor: async (id) => rows.find((op) => op.id === id)?.valor ?? null,
    async cancel(id) {
      await wait(400)
      const row = rows.find((op) => op.id === id)
      if (!row) throw new Error('OP não encontrada.')
      row.status = OP_STATUS.cancelada
      row.alteradoEm = new Date()
    },
    pagantes: createPagantesSource(host),
    kv: browserKV(),
  }
}

export function createSource(host: Host): Source {
  if (host.mode === 'mock') return createMockSource(host)
  let set: Promise<string> | null = null
  const entitySet = () => (set ??= host.metadata.entities([ENTITY_OP]).then((info) => {
    const value = info.get(ENTITY_OP)?.entitySetName
    if (!value) throw new Error(`Tabela ${ENTITY_OP} não encontrada na metadata.`)
    return value
  }).catch((error) => { set = null; throw error }))

  // O valor vem dos serviços; se essa parte falhar, a OP abre do mesmo jeito (valor "—").
  const comValorServicos = async (ops: Op[]) => {
    try {
      const info = await host.metadata.entities([ENTITY_RESERVA, ENTITY_COMPOSICAO])
      const reserva = info.get(ENTITY_RESERVA)?.entitySetName
      const composicao = info.get(ENTITY_COMPOSICAO)?.entitySetName
      if (!reserva || !composicao) return ops
      const valores = await loadValoresServicos(host.client, { reserva, composicao }, ops.map((op) => op.id))
      return ops.map((op) => ({ ...op, valorServicos: valores.get(op.id.toLowerCase()) ?? null }))
    } catch {
      return ops
    }
  }
  return {
    mock: false,
    async load(since, onPartial) {
      const ops = (await getAllWithFirstPage(host.client, opsPath(await entitySet(), since), onPartial && ((rows) => onPartial(rows.map(mapOp))))).map(mapOp)
      onPartial?.(ops)
      return comValorServicos(ops)
    },
    async search(since, q) {
      const filter = opsSearchFilter(q)
      return filter ? (await searchRows(host.client, opsPath(await entitySet(), since, filter))).map(mapOp) : []
    },
    async get(id) {
      const rows = (await host.client.getAll(opsPath(await entitySet(), null, `cr40f_financeiroid eq ${guid(id)}`))).map(mapOp)
      return rows.length ? (await comValorServicos(rows))[0] : null
    },
    // Rótulo é acessório: metadata fora do ar cai nos rótulos conhecidos.
    async choices() {
      const [status, idioma] = await Promise.all(['cr40f_status', 'cr40f_idioma'].map((attribute) => host.metadata.choices(ENTITY_OP, attribute).catch(() => [])))
      return withOpFallback({ status, idioma })
    },
    async valor(id) {
      const [row] = await host.client.getAll(`${await entitySet()}?$select=cr40f_valor&$filter=cr40f_financeiroid eq ${id}`)
      return typeof row?.cr40f_valor === 'number' ? row.cr40f_valor : null
    },
    cancel: async (id) => host.client.update(await entitySet(), id, { cr40f_status: OP_STATUS.cancelada }),
    pagantes: createPagantesSource(host),
    kv: browserKV(),
  }
}
