import { cleanId } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import { browserKV } from '../../pagantes/data/source'
import type { KV } from '../../pagantes/domain/filters'
import { CP, FAT, OP } from '../domain/codes'
import type { OpResumo, PaganteResumo, Reserva } from '../domain/types'
import { createMockPendencias } from './mock'
import { ENTITY_OP, ENTITY_PAGANTE, ENTITY_RESERVA, loadPendenciasData, resolveCpNav, type EntitySets } from './queries'

export type Mudanca = { entidade: string; id: string; campo: string; de: number | null; para: number | null; limparLookup: boolean; motivo: string }
export type Sincronizacao = { opId: string; modo: 'simular' | 'aplicar'; mudancas: Mudanca[]; aplicadas: boolean }
export type Source = {
  mock: boolean
  load: (since: Date | null) => Promise<{ ops: OpResumo[]; reservas: Reserva[]; pagantes: PaganteResumo[] }>
  sincronizar: (opId: string, modo: 'simular' | 'aplicar') => Promise<Sincronizacao>
  kv: KV
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const ENTITY_CP = 'cr40f_composicaodeprecos'

function createMockSource(): Source {
  const data = createMockPendencias(new Date())
  return {
    mock: true,
    async load(since) {
      await wait(350)
      return {
        ops: data.ops.map((o) => ({ ...o })),
        reservas: data.reservas.filter((r) => !since || !r.saida || r.saida >= since).map((r) => ({ ...r })),
        pagantes: data.pagantes.map((p) => ({ ...p })),
      }
    },
    async sincronizar(opId, modo) {
      await wait(400)
      const op = data.ops.find((o) => o.id === opId)
      if (!op) throw new Error('OP não encontrada.')
      const mudancas: Mudanca[] = []
      const rs = data.reservas.filter((r) => r.opId === opId)
      if (op.status === OP.paga) {
        for (const r of rs) {
          if (r.fatStatus !== FAT.pago) mudancas.push({ entidade: ENTITY_RESERVA, id: r.id, campo: 'cr40f_statusdefaturamento', de: r.fatStatus, para: FAT.pago, limparLookup: false, motivo: 'OP paga' })
          if (r.cpId && r.cpStatus !== CP.concluida) mudancas.push({ entidade: ENTITY_CP, id: r.cpId, campo: 'new_status', de: r.cpStatus, para: CP.concluida, limparLookup: false, motivo: 'OP paga' })
        }
      } else {
        const para = op.status === OP.cancelada ? FAT.pendente : FAT.pagamentoPendente
        for (const r of rs) {
          if (r.fatStatus === FAT.pago) mudancas.push({ entidade: ENTITY_RESERVA, id: r.id, campo: 'cr40f_statusdefaturamento', de: r.fatStatus, para, limparLookup: false, motivo: 'OP sem pagamento confirmado' })
        }
      }
      if (modo === 'aplicar') {
        for (const m of mudancas) {
          if (m.entidade === ENTITY_RESERVA) { const r = data.reservas.find((x) => x.id === m.id); if (r) r.fatStatus = m.para }
          else { const r = data.reservas.find((x) => x.cpId === m.id); if (r) r.cpStatus = m.para }
        }
      }
      return { opId, modo, mudancas, aplicadas: modo === 'aplicar' }
    },
    kv: browserKV(),
  }
}

export function createSource(host: Host): Source {
  if (host.mode === 'mock') return createMockSource()
  let sets: Promise<EntitySets> | null = null
  const entitySets = () => (sets ??= host.metadata.entities([ENTITY_RESERVA, ENTITY_OP, ENTITY_PAGANTE]).then((info) => {
    const get = (name: string) => {
      const value = info.get(name)?.entitySetName
      if (!value) throw new Error(`Tabela ${name} não encontrada na metadata.`)
      return value
    }
    return { reserva: get(ENTITY_RESERVA), op: get(ENTITY_OP), pagante: get(ENTITY_PAGANTE) }
  }).catch((error) => { sets = null; throw error }))
  let nav: Promise<string> | null = null
  const cpNav = () => (nav ??= resolveCpNav(host.client))

  return {
    mock: false,
    load: async (since) => { const [s, n] = await Promise.all([entitySets(), cpNav()]); return loadPendenciasData(host.client, s, since, n) },
    async sincronizar(opId, modo) {
      const { op } = await entitySets()
      const body = { cr40f_RequestJson: JSON.stringify({ modo, origem: 'manual' }) }
      const res = await host.client.request<{ cr40f_ResponseJson: string }>(
        `${op}(${cleanId(opId)})/Microsoft.Dynamics.CRM.cr40f_SincronizarFinanceiro`,
        { method: 'POST', body: JSON.stringify(body) },
      )
      return JSON.parse(res.cr40f_ResponseJson) as Sincronizacao
    },
    kv: browserKV(),
  }
}
