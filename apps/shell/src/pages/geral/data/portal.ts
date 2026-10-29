import { chunk, cleanId, type Row } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import { COMPOSICAO_CONCLUIDA, RESERVA_CANCELADA, STATUS_VALIDACAO, prazoTacita, statusDoValor, type Candidato, type StatusValidacao } from '../domain/portal'
import { ENTITY } from '../domain/types'

export const VALIDACAO_ENTITY = 'cr40f_validacaoservico'

export type Liberacao = { ok: string[]; failed: { id: string; message: string }[] }

/** Liberação de serviços para o portal do cliente (tabela `cr40f_validacaoservico`, uma por reserva). */
export type PortalSource = {
  /** Dados de cada reserva para classificar (cliente, portal, composição, validação), na ordem dos ids. */
  candidatos(ids: string[]): Promise<Candidato[]>
  /** Cria ou reativa a validação de cada reserva pronta; falhas por serviço, sem abortar as demais. */
  liberar(prontos: Candidato[], observacao: string): Promise<Liberacao>
  /** Status da validação por reserva (só as que têm validação). */
  status(ids: string[]): Promise<Map<string, StatusValidacao>>
}

export const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
const BLOCO = 10

function settle(items: Candidato[], results: PromiseSettledResult<unknown>[]): Liberacao {
  const out: Liberacao = { ok: [], failed: [] }
  results.forEach((r, i) => (r.status === 'fulfilled' ? out.ok.push(items[i].id) : out.failed.push({ id: items[i].id, message: message(r.reason) })))
  return out
}

/** Campos gravados ao liberar: status Liberado, prazo reaberto e valor da composição. `cr40f_statusdefaturamento` da reserva não muda. */
export function liberacaoPatch(c: Candidato, observacao: string, agoraIso: string) {
  return {
    cr40f_name: c.codigo,
    cr40f_status: STATUS_VALIDACAO.liberado,
    cr40f_liberadoem: agoraIso,
    cr40f_prazotacita: prazoTacita(agoraIso),
    cr40f_observacao: observacao.trim() || null,
    cr40f_valorliberado: c.valor,
    cr40f_aprovadoem: null,
    cr40f_aprovadopor: null,
  }
}

// ---------- mock (pnpm dev): clientes com e sem portal, composições concluídas e pendentes ----------

/** Perfil fictício pelo número da OS (OS-1000 → 0): a cada 6, o 2º é sem composição e o 3º de cliente sem portal. */
function mockPerfil(id: string, codigo: string, cancelado: boolean): Candidato {
  const index = Number(codigo.replace(/\D/g, '')) || 0
  const tipo = index % 6
  const valor = 180 + ((index * 37) % 9) * 45.5
  const tenaris = { id: 'bbbbbbbb-0003-4000-8000-000000000001', nome: 'Tenaris' }
  return {
    id, codigo, valor, cancelado,
    cliente: tipo === 3 ? { id: 'bbbbbbbb-0003-4000-8000-000000000002', nome: 'Grupo Atlântico' } : tenaris,
    portalHabilitado: tipo !== 3,
    composicaoConcluida: tipo !== 2,
    validacao: null,
  }
}

export function createMockPortalSource(rowsOf: () => Row[], { latency = 1 } = {}): PortalSource {
  const wait = (ms: number) => (latency === 0 ? Promise.resolve() : new Promise((r) => setTimeout(r, ms * latency)))
  const validacoes = new Map<string, StatusValidacao>()
  const perfil = (id: string): Candidato => {
    const row = rowsOf().find((r) => cleanId(String(r.cr40f_reservadeveculosid)) === cleanId(id))
    const c = mockPerfil(id, String(row?.cr40f_id ?? id), row?.cr40f_status === RESERVA_CANCELADA)
    const status = validacoes.get(cleanId(id))
    return status ? { ...c, validacao: { id: `val-${id}`, status } } : c
  }
  return {
    async candidatos(ids) { await wait(250); return ids.map(perfil) },
    async liberar(prontos) {
      await wait(400)
      for (const c of prontos) validacoes.set(cleanId(c.id), 'liberado')
      return { ok: prontos.map((c) => c.id), failed: [] }
    },
    async status(ids) {
      return new Map(ids.flatMap((id) => { const s = validacoes.get(cleanId(id)); return s ? [[id, s] as const] : [] }))
    },
  }
}

// ---------- Dataverse ----------

const F = '@OData.Community.Display.V1.FormattedValue'
const inFilter = (attr: string, ids: string[]) => ids.map((id) => `${attr} eq ${cleanId(id)}`).join(' or ')

export function createDataversePortalSource(host: Extract<Host, { mode: 'dataverse' }>): PortalSource {
  const setOf = (entity: string) => host.metadata.entity(entity).then((info) => info.entitySetName)
  let me: Promise<string> | null = null
  const userId = () => (me ??= host.client.request<{ UserId: string }>('WhoAmI').then((r) => r.UserId).catch((e) => { me = null; throw e }))

  async function validacoesDe(ids: string[]): Promise<Map<string, { id: string; status: StatusValidacao }>> {
    const set = await setOf(VALIDACAO_ENTITY)
    const blocks = await Promise.all(chunk(ids, BLOCO).map((block) =>
      host.client.getAll(`${set}?$select=cr40f_validacaoservicoid,cr40f_status,_cr40f_reserva_value&$filter=${encodeURIComponent(inFilter('_cr40f_reserva_value', block))}`)))
    const map = new Map<string, { id: string; status: StatusValidacao }>()
    for (const row of blocks.flat()) {
      const status = statusDoValor(row.cr40f_status)
      if (status) map.set(cleanId(String(row._cr40f_reserva_value)), { id: String(row.cr40f_validacaoservicoid), status })
    }
    return map
  }

  return {
    async candidatos(ids) {
      const [reservaSet, clienteSet, validacoes] = await Promise.all([setOf(ENTITY), setOf('cr40f_clientes1'), validacoesDe(ids)])
      const reservas = (await Promise.all(chunk(ids, BLOCO).map((block) => host.client.getAll(
        `${reservaSet}?$select=cr40f_reservadeveculosid,cr40f_id,cr40f_status,_cr40f_cliente_value&$expand=new_ComposicaodePreco($select=new_status,new_valortotal)&$filter=${encodeURIComponent(inFilter('cr40f_reservadeveculosid', block))}`)))).flat()
      const clienteIds = [...new Set(reservas.flatMap((r) => (r._cr40f_cliente_value ? [cleanId(String(r._cr40f_cliente_value))] : [])))]
      const clientes = (await Promise.all(chunk(clienteIds, BLOCO).map((block) => host.client.getAll(
        `${clienteSet}?$select=cr40f_clientes1id,cr40f_portalhabilitado&$filter=${encodeURIComponent(inFilter('cr40f_clientes1id', block))}`)))).flat()
      const portal = new Map(clientes.map((c) => [cleanId(String(c.cr40f_clientes1id)), c.cr40f_portalhabilitado === true]))
      const byId = new Map(reservas.map((r) => [cleanId(String(r.cr40f_reservadeveculosid)), r]))
      return ids.flatMap((id) => {
        const r = byId.get(cleanId(id))
        if (!r) return []
        const composicao = r.new_ComposicaodePreco as Row | null | undefined
        const clienteId = r._cr40f_cliente_value ? cleanId(String(r._cr40f_cliente_value)) : null
        return [{
          id,
          codigo: String(r.cr40f_id ?? id),
          cliente: clienteId ? { id: clienteId, nome: String(r[`_cr40f_cliente_value${F}`] ?? '') } : null,
          portalHabilitado: clienteId ? portal.get(clienteId) === true : false,
          composicaoConcluida: composicao?.new_status === COMPOSICAO_CONCLUIDA,
          valor: typeof composicao?.new_valortotal === 'number' ? composicao.new_valortotal : null,
          cancelado: r.cr40f_status === RESERVA_CANCELADA,
          validacao: validacoes.get(cleanId(id)) ?? null,
        }]
      })
    },
    async liberar(prontos, observacao) {
      const [set, reservaSet, clienteSet, uid] = await Promise.all([setOf(VALIDACAO_ENTITY), setOf(ENTITY), setOf('cr40f_clientes1'), userId()])
      const agora = new Date().toISOString()
      return settle(prontos, await Promise.allSettled(prontos.map((c) => {
        const data: Row = {
          ...liberacaoPatch(c, observacao, agora),
          'cr40f_Reserva@odata.bind': `/${reservaSet}(${cleanId(c.id)})`,
          'cr40f_Cliente@odata.bind': `/${clienteSet}(${cleanId(c.cliente?.id ?? '')})`,
          'cr40f_LiberadoPor@odata.bind': `/systemusers(${cleanId(uid)})`,
        }
        // Retirada volta a Liberado no mesmo registro: a chave cr40f_reservaunica não deixa duplicar.
        return c.validacao ? host.client.update(set, c.validacao.id, data) : host.client.create(set, data)
      })))
    },
    async status(ids) {
      const map = await validacoesDe(ids)
      return new Map(ids.flatMap((id) => { const v = map.get(cleanId(id)); return v ? [[id, v.status] as const] : [] }))
    },
  }
}

export function createPortalSource(host: Host, rowsOf: () => Row[], options: { latency?: number } = {}): PortalSource {
  return host.mode === 'mock' ? createMockPortalSource(rowsOf, options) : createDataversePortalSource(host)
}
