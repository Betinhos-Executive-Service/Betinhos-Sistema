import { cleanId, type Row } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import { mapPessoa, pessoasPath } from '../../equipamentos/data/queries'
import { addDays, dateKey } from '../../operacional/domain/time'
import { ehCandidata, MOTIVO_REABERTA, SITUACAO, type CartaoForm } from '../domain/regras'
import type { Cartao, DespesaCandidata, Pessoa, Transacao } from '../domain/types'
import { createMockCartoes, createMockDespesas, createMockMotoristas, createMockTransacoes } from './mock'
import {
  candidatasPath, cartaoPayload, cartoesPath, casarPayload, ENTITIES, formaCartaoPath, mapCartao, mapDespesa, mapTransacao,
  reprocessarPayload, transacoesPath, type EntitySets,
} from './queries'

export type Carga = { transacoes: Transacao[]; cartoes: Cartao[]; motoristas: Pessoa[] }

/** Tudo que a tela precisa do mundo externo; Dataverse em produção, memória no pnpm dev. */
export type Source = {
  mock: boolean
  load: () => Promise<Carga>
  /** Despesas do motorista que casam com a transação (critério do flow diário). */
  candidatas: (t: Transacao) => Promise<DespesaCandidata[]>
  /** Marca a despesa como conciliada e liga à transação (Conciliada manual). */
  casar: (t: Transacao, despesaId: string) => Promise<void>
  ignorar: (t: Transacao, motivo: string) => Promise<void>
  reabrir: (t: Transacao) => Promise<void>
  /** Liga cartão e motorista do cartão vigente e volta a transação para Pendente. */
  reprocessar: (t: Transacao, c: Cartao) => Promise<void>
  salvarCartao: (id: string | null, f: CartaoForm) => Promise<string>
}

export const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function createMockSource(): Source {
  let seq = 100
  const despesas = createMockDespesas()
  return {
    mock: true,
    async load() {
      await wait(300)
      return { transacoes: createMockTransacoes(), cartoes: createMockCartoes(), motoristas: createMockMotoristas() }
    },
    async candidatas(t) { await wait(300); return despesas.filter((d) => ehCandidata(d, t)) },
    async casar(_t, despesaId) {
      await wait(400)
      const d = despesas.find((x) => x.id === despesaId)
      if (!d || d.conciliada) throw new Error('A despesa já foi conciliada com outra transação.')
      d.conciliada = true
    },
    ignorar: () => wait(300),
    reabrir: () => wait(300),
    reprocessar: () => wait(300),
    async salvarCartao(id) { await wait(400); if (id) return id; seq += 1; return `cccccccc-0000-4000-8000-${String(seq).padStart(12, '0')}` },
  }
}

export function createSource(host: Host): Source {
  if (host.mode === 'mock') return createMockSource()
  const { client } = host
  let sets: Promise<EntitySets> | null = null
  const entitySets = () => (sets ??= host.metadata.entities(Object.values(ENTITIES)).then((info) => {
    const get = (name: string) => {
      const value = info.get(name)?.entitySetName
      if (!value) throw new Error(`Tabela ${name} não encontrada na metadata.`)
      return value
    }
    return { cartao: get(ENTITIES.cartao), transacao: get(ENTITIES.transacao), despesa: get(ENTITIES.despesa), funcionario: get(ENTITIES.funcionario), forma: get(ENTITIES.forma) }
  }).catch((error) => { sets = null; throw error }))
  let forma: Promise<string> | null = null
  const formaCartao = () => (forma ??= entitySets().then((s) => client.getAll(formaCartaoPath(s.forma))).then((rows) => {
    if (rows.length !== 1) throw new Error('Forma de pagamento "Cartão de crédito" não encontrada (ou repetida).')
    return cleanId(String(rows[0].cr40f_formapagamentodespesaid))
  }).catch((error) => { forma = null; throw error }))
  const patch = async (t: Transacao, payload: Record<string, unknown>) => client.update((await entitySets()).transacao, t.id, payload)

  return {
    mock: false,
    async load() {
      const s = await entitySets()
      const [transacoes, cartoes, motoristas] = await Promise.all([
        client.getAll(transacoesPath(s.transacao, addDays(dateKey(new Date()), -365))), client.getAll(cartoesPath(s.cartao)), client.getAll(pessoasPath(s.funcionario)),
      ])
      return { transacoes: transacoes.map(mapTransacao), cartoes: cartoes.map(mapCartao), motoristas: motoristas.map(mapPessoa) }
    },
    async candidatas(t) {
      const [s, f] = await Promise.all([entitySets(), formaCartao()])
      return (await client.getAll(candidatasPath(s.despesa, t, f))).map(mapDespesa)
    },
    async casar(t, despesaId) {
      const s = await entitySets()
      // O flow diário pode ter conciliado a transação ou a despesa depois da carga da tela: confere antes de gravar.
      const [atual, despesa] = await Promise.all([
        client.request<Row>(`${s.transacao}(${cleanId(t.id)})?$select=_cr40f_despesa_value`),
        client.request<Row>(`${s.despesa}(${cleanId(despesaId)})?$select=cr40f_conciliadacartao`),
      ])
      if (atual._cr40f_despesa_value) throw new Error('A transação já foi conciliada com outra despesa. Atualize a tela.')
      if (despesa.cr40f_conciliadacartao === true) throw new Error('A despesa já foi conciliada com outra transação.')
      // Mesma ordem do flow: marca a despesa antes; se a transação falhar, desmarca para ela voltar a ser candidata.
      await client.update(s.despesa, despesaId, { cr40f_conciliadacartao: true })
      try {
        await client.update(s.transacao, t.id, casarPayload(s, despesaId))
      } catch (reason) {
        await client.update(s.despesa, despesaId, { cr40f_conciliadacartao: false }).catch(() => {
          throw new Error(`${message(reason)} A despesa ficou marcada como conciliada sem transação; desmarque "Conciliada com o cartão" nela.`)
        })
        throw reason
      }
    },
    ignorar: (t, motivo) => patch(t, { cr40f_situacao: SITUACAO.ignorada, cr40f_motivo: motivo.trim() }),
    reabrir: (t) => patch(t, { cr40f_situacao: SITUACAO.pendente, cr40f_motivo: MOTIVO_REABERTA }),
    reprocessar: async (t, c) => patch(t, reprocessarPayload(await entitySets(), c)),
    async salvarCartao(id, f) {
      const s = await entitySets()
      if (id) { await client.update(s.cartao, id, cartaoPayload(s, f)); return id }
      return cleanId(await client.create(s.cartao, cartaoPayload(s, f)))
    },
  }
}
