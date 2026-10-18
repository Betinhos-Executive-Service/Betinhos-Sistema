import type { Host } from '../../../host'
import { createSource as createPagantesSource, browserKV, type Source as PagantesSource } from '../../pagantes/data/source'
import type { KV } from '../../pagantes/domain/filters'
import { OP_STATUS, withOpFallback } from '../domain/status'
import type { Op, OpChoices } from '../domain/types'
import { createMockOps } from './mock'
import { ENTITY_OP, loadValoresServicos, mapOp, opsPath } from './queries'

const ENTITY_RESERVA = 'cr40f_reservadeveculos'
const ENTITY_COMPOSICAO = 'cr40f_composicaodeprecos'

/** Tudo que a tela precisa do mundo externo. Rateio, serviços e contatos vêm do Source de Pagantes. */
export type Source = {
  mock: boolean
  load: (since: Date | null) => Promise<Op[]>
  choices: () => Promise<OpChoices>
  cancel: (id: string) => Promise<void>
  pagantes: Pick<PagantesSource, 'rateio' | 'servicos' | 'contatos' | 'choices' | 'gerarPagantesUrl'>
  kv: KV
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function createMockSource(host: Host): Source {
  const rows = createMockOps(new Date())
  return {
    mock: true,
    async load(since) { await wait(350); return rows.filter((op) => !since || (op.criadoEm && op.criadoEm >= since)).map((op) => ({ ...op })) },
    choices: async () => withOpFallback({}),
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

  return {
    mock: false,
    async load(since) {
      const ops = (await host.client.getAll(opsPath(await entitySet(), since))).map(mapOp)
      // O valor vem dos serviços; se essa parte falhar, a lista abre do mesmo jeito (valor "—").
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
    },
    // Rótulo é acessório: metadata fora do ar cai nos rótulos conhecidos.
    async choices() {
      const [status, idioma] = await Promise.all(['cr40f_status', 'cr40f_idioma'].map((attribute) => host.metadata.choices(ENTITY_OP, attribute).catch(() => [])))
      return withOpFallback({ status, idioma })
    },
    cancel: async (id) => host.client.update(await entitySet(), id, { cr40f_status: OP_STATUS.cancelada }),
    pagantes: createPagantesSource(host),
    kv: browserKV(),
  }
}
