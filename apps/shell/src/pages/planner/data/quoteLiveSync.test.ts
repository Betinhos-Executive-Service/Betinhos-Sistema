// Porte de Tela Planner/tests/quoteLiveSync.test.mjs (mesmas asserções).
import { describe, expect, test } from 'vitest'
import { createDataStore, type LiveState, type PlannerDataStore } from './dataverse'

const quoteId = '11111111-1111-4111-8111-111111111111'
const taskId = '22222222-2222-4222-8222-222222222222'

type Write = { url: string; method: string; body: Record<string, unknown> }
const g = globalThis as unknown as Record<string, unknown>

async function withDataverse(run: (store: PlannerDataStore, writes: Write[]) => Promise<void>) {
  const previous = { window: g.window, parent: g.parent, fetch: g.fetch }
  const writes: Write[] = []
  const optionId = '33333333-3333-4333-8333-333333333333'
  const xrm = { WebApi: {}, Utility: { getGlobalContext: () => ({ getClientUrl: () => 'https://test.crm.dynamics.com', userSettings: {} }) } }
  g.window = { Xrm: xrm, location: { origin: 'https://test.crm.dynamics.com' } }
  g.parent = g.window
  g.fetch = async (url: string, options: { method?: string; body?: string } = {}) => {
    if (options.method && options.method !== 'GET') writes.push({ url, method: options.method, body: JSON.parse(options.body || '{}') as Record<string, unknown> })
    const body = url.includes("EntityDefinitions(LogicalName='cr40f_cotacaoopcao')") ? { EntitySetName: 'cr40f_cotacaoopcaos' }
      : url.includes("EntityDefinitions(LogicalName='cr40f_cotacaoopcaoitem')") ? { EntitySetName: 'cr40f_cotacaoopcaoitems' }
      : url.includes("EntityDefinitions(LogicalName='cr40f_cotacaopropostaversao')") ? { EntitySetName: 'cr40f_cotacaopropostaversaos' }
      : url.includes('/cr40f_cotacaoopcaos?') ? { value: [{ cr40f_cotacaoopcaoid: optionId, cr40f_conteudo: JSON.stringify({ id: 'option-1' }) }] }
      : url.includes('ManyToOneRelationships')
      ? { value: [
        { ReferencingAttribute: 'cr40f_tarefa', ReferencedEntity: 'cr40f_plannertarefa', ReferencingEntityNavigationPropertyName: 'cr40f_Tarefa' },
        { ReferencingAttribute: 'cr40f_pedidocotacao', ReferencedEntity: 'cr40f_pedidodecotacao', ReferencingEntityNavigationPropertyName: 'cr40f_PedidoCotacao' },
        { ReferencingAttribute: 'cr40f_opcaoaceita', ReferencedEntity: 'cr40f_cotacaoopcao', ReferencingEntityNavigationPropertyName: 'cr40f_OpcaoAceita' },
        { ReferencingAttribute: 'cr40f_versaopropostaaceita', ReferencedEntity: 'cr40f_cotacaopropostaversao', ReferencingEntityNavigationPropertyName: 'cr40f_VersaoPropostaAceita' },
      ] }
      : { value: [], PrimaryNameAttribute: 'cr40f_name', cr40f_pedidodecotacaoid: quoteId, cr40f_plannertarefaid: taskId }
    return new Response(JSON.stringify(body), { status: 200 })
  }
  try { await run(createDataStore(), writes) }
  finally { Object.assign(globalThis, previous) }
}

function stateFor(status = 'Respondida ao cliente', responseSent = true) {
  const option = { id: 'option-1', recordId: '33333333-3333-4333-8333-333333333333', name: 'Executivo', items: [{ vehicleType: 'Executivo', quantity: '1' }], value: '800', commercialTerms: 'À vista' }
  return {
    quotes: [{ id: quoteId, status, responseSent, title: 'Transfer', value: '800', commercialTerms: 'À vista', options: [option], proposalVersions: [{ id: '44444444-4444-4444-8444-444444444444', number: 1, options: [option] }] }],
    tasks: [{ id: taskId, quoteId, quoteStatus: status, sourceType: 'quote', status: 'done', title: 'Transfer', assigneeIds: [], assigneeNames: [], history: [] }],
    employees: [], teams: [], notifications: [],
  } as LiveState
}

const findWrite = (writes: Write[], predicate: (item: Write) => boolean) => {
  const write = writes.find(predicate)
  if (!write) throw new Error('escrita não encontrada')
  return write
}

describe('quoteLiveSync', () => {
  for (const status of ['Nova', 'Cotada', 'Aceita pelo cliente', 'Perdida', 'Cancelada']) {
    test(`adapter live sincroniza cotação enviada ao mudar para ${status}`, async () => {
      await withDataverse(async (store, writes) => {
        await store.updateQuote(stateFor(), quoteId, { status })
        const quoteWrite = findWrite(writes, (item) => item.url.endsWith(`/cr40f_pedidodecotacaos(${quoteId})`))
        expect(quoteWrite.body.cr40f_respostaenviadacliente).toBe(false)
        expect(writes.some((item) => item.url.endsWith(`/cr40f_plannertarefas(${taskId})`))).toBe(true)
      })
    })
  }

  test('adapter live continua exigindo status respondida para confirmar envio', async () => {
    await withDataverse(async (store, writes) => {
      await expect(store.updateQuote(stateFor('Nova', false), quoteId, { responseSent: true })).rejects.toThrow(/Envio só pode ser confirmado/)
      expect(writes.length).toBe(0)
    })
  })

  test('adapter live cria nova cotação sem tarefa (V2) e sem confirmar envio', async () => {
    await withDataverse(async (store, writes) => {
      await store.createQuote({ quotes: [], tasks: [], employees: [], teams: [] }, { title: 'Transfer', status: 'Nova', priority: 'medium', route: 'GRU / Hotel' })
      const quoteWrite = findWrite(writes, (item) => item.method === 'POST' && item.url.endsWith('/cr40f_pedidodecotacaos'))
      expect(quoteWrite.body.cr40f_respostaenviadacliente).toBe(false)
      expect(writes.some((item) => item.method === 'POST' && item.url.endsWith('/cr40f_plannertarefas'))).toBe(false)
      expect(!writes.some((item) => item.method === 'DELETE')).toBe(true)
    })
  })

  test('adapter live preserva confirmação ao editar cotação respondida', async () => {
    await withDataverse(async (store, writes) => {
      await store.updateQuote(stateFor(), quoteId, { title: 'Transfer revisado' })
      const quoteWrite = findWrite(writes, (item) => item.url.endsWith(`/cr40f_pedidodecotacaos(${quoteId})`))
      expect(quoteWrite.body.cr40f_titulo).toBe('Transfer revisado')
      expect(!Object.hasOwn(quoteWrite.body, 'cr40f_respostaenviadacliente')).toBe(true)
    })
  })

  test('adapter live permite salvar após recarga com opção incompleta fora da versão confirmada', async () => {
    await withDataverse(async (store, writes) => {
      const state = stateFor()
      state.quotes[0].options!.push({ id: 'incomplete', name: 'Em composição', value: '' })
      const quote = state.quotes[0]
      await store.updateQuote(state, quoteId, { title: 'Contato atualizado', status: quote.status, responseSent: true, value: quote.value })
      const quoteWrite = findWrite(writes, (item) => item.url.endsWith(`/cr40f_pedidodecotacaos(${quoteId})`))
      expect(quoteWrite.body.cr40f_titulo).toBe('Contato atualizado')
      expect(state.quotes[0].proposalVersions![0].options!.length).toBe(1)
    })
  })

  for (const outcome of ['Aceita pelo cliente', 'Perdida', 'Cancelada']) {
    test(`Registrar resultado salva ${outcome} para cotação respondida`, async () => {
      await withDataverse(async (store, writes) => {
        const reason = outcome === 'Perdida' ? 'Preço' : ''
        const accepted = outcome === 'Aceita pelo cliente' ? { acceptedProposalVersionId: '44444444-4444-4444-8444-444444444444', acceptedOptionId: 'option-1' } : {}
        await store.setQuoteOutcome(stateFor(), quoteId, outcome, reason, accepted)
        const quoteWrite = findWrite(writes, (item) => item.url.endsWith(`/cr40f_pedidodecotacaos(${quoteId})`))
        expect(quoteWrite.body.cr40f_respostaenviadacliente).toBe(false)
        expect(quoteWrite.body.cr40f_motivoperda).toBe(reason)
        expect(Number.isFinite(Date.parse(String(quoteWrite.body.cr40f_datahorafinalizacao)))).toBe(true)
        expect(writes.some((item) => item.url.endsWith(`/cr40f_plannertarefas(${taskId})`))).toBe(true)
      })
    })
  }

  test('Registrar resultado continua exigindo motivo para perda', async () => {
    await withDataverse(async (store, writes) => {
      await expect(store.setQuoteOutcome(stateFor(), quoteId, 'Perdida', '')).rejects.toThrow(/Escolha o motivo da perda/)
      expect(writes.length).toBe(0)
    })
  })
})
