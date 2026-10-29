// Cotações V2 no adapter Dataverse: sem tarefa, avisos no sininho e motivo de perda fixo.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { LiveState, PlannerDataStore } from './dataverse'

const quoteId = '11111111-1111-4111-8111-111111111111'
const financeId = '55555555-5555-4555-8555-555555555555'
const creatorId = '66666666-6666-4666-8666-666666666666'
const optionId = '33333333-3333-4333-8333-333333333333'

type Write = { url: string; method: string; body: Record<string, unknown> }
type Options = { missingAttributes?: string[]; existingDedupeKeys?: string[]; failNoticeFor?: string }
const g = globalThis as unknown as Record<string, unknown>
let previous: Record<string, unknown> = {}

beforeEach(() => { previous = { window: g.window, parent: g.parent, fetch: g.fetch }; vi.resetModules() })
afterEach(() => { Object.assign(globalThis, previous) })

async function setup(options: Options = {}): Promise<{ store: PlannerDataStore; writes: Write[]; gets: string[] }> {
  const writes: Write[] = []
  const gets: string[] = []
  const xrm = { WebApi: {}, Utility: { getGlobalContext: () => ({ getClientUrl: () => 'https://test.crm.dynamics.com', userSettings: { userId: creatorId, userName: 'Renan' } }) } }
  g.window = { Xrm: xrm, location: { origin: 'https://test.crm.dynamics.com' }, setTimeout }
  g.parent = g.window
  g.fetch = async (url: string, init: { method?: string; body?: string } = {}) => {
    const method = init.method || 'GET'
    if (method !== 'GET') writes.push({ url, method, body: url.includes('$batch') ? { raw: String(init.body) } : JSON.parse(init.body || '{}') as Record<string, unknown> })
    else gets.push(decodeURIComponent(url))
    const missing = (options.missingAttributes || []).find((name) => url.includes(`Attributes(LogicalName='${name}')`))
    if (missing) return new Response(JSON.stringify({ error: { message: 'not found' } }), { status: 404 })
    if (options.failNoticeFor && method === 'POST' && url.includes('/cr40f_plannernotificacaos') && String(init.body).includes(options.failNoticeFor)) return new Response(JSON.stringify({ error: { message: 'falha' } }), { status: 500 })
    const body = url.includes('ManyToOneRelationships') ? { value: [
          { ReferencingAttribute: 'cr40f_criador', ReferencedEntity: 'cr40f_funcionarios', ReferencingEntityNavigationPropertyName: 'cr40f_Criador' },
          { ReferencingAttribute: 'cr40f_destinatario', ReferencedEntity: 'cr40f_funcionarios', ReferencingEntityNavigationPropertyName: 'cr40f_Destinatario' },
          { ReferencingAttribute: 'cr40f_cotacao', ReferencedEntity: 'cr40f_pedidodecotacao', ReferencingEntityNavigationPropertyName: 'cr40f_Cotacao' },
          { ReferencingAttribute: 'cr40f_pedidocotacao', ReferencedEntity: 'cr40f_pedidodecotacao', ReferencingEntityNavigationPropertyName: 'cr40f_PedidoCotacao' },
          { ReferencingAttribute: 'cr40f_opcao', ReferencedEntity: 'cr40f_cotacaoopcao', ReferencingEntityNavigationPropertyName: 'cr40f_Opcao' },
          { ReferencingAttribute: 'cr40f_tarefa', ReferencedEntity: 'cr40f_plannertarefa', ReferencingEntityNavigationPropertyName: 'cr40f_Tarefa' },
        ] }
      : url.includes("EntityDefinitions(LogicalName='cr40f_cotacaoopcao')") ? { EntitySetName: 'cr40f_cotacaoopcaos' }
      : url.includes("EntityDefinitions(LogicalName='cr40f_cotacaoopcaoitem')") ? { EntitySetName: 'cr40f_cotacaoopcaoitems' }
      : url.includes("EntityDefinitions(LogicalName='cr40f_cotacaopropostaversao')") ? { EntitySetName: 'cr40f_cotacaopropostaversaos' }
      : url.includes('/cr40f_cotacaoopcaos?') ? { value: [{ cr40f_cotacaoopcaoid: optionId, cr40f_revisao: 'r1', _cr40f_pedidocotacao_value: quoteId, cr40f_conteudo: JSON.stringify({ id: 'option-1', name: 'Sedan', value: '350' }) }] }
      : method === 'GET' && url.includes('/cr40f_pedidodecotacaos?') ? { value: [{ cr40f_pedidodecotacaoid: quoteId, '@odata.etag': 'W/"2"', cr40f_numerodacotacao: 'COT-0100', cr40f_opcoesversao: 'r1' }] }
      : method === 'GET' && url.includes('/cr40f_plannernotificacaos?') ? { value: (options.existingDedupeKeys || []).map((key) => ({ cr40f_chavededupe: key })) }
        : { value: [], PrimaryNameAttribute: 'cr40f_name', cr40f_pedidodecotacaoid: quoteId, cr40f_numerodacotacao: 'COT-0100' }
    return new Response(JSON.stringify(body), { status: 200 })
  }
  const { createDataStore } = await import('./dataverse')
  return { store: createDataStore(), writes, gets }
}

const today = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const emptyState = (): LiveState => ({ quotes: [], tasks: [], employees: [], teams: [{ id: 'team-fin', name: 'Financeiro', memberIds: [financeId] }], notifications: [] } as unknown as LiveState)
const notificationPosts = (writes: Write[]) => writes.filter((item) => item.method === 'POST' && item.url.includes('/cr40f_plannernotificacaos'))

describe('cotações V2 no Dataverse', () => {
  test('criar não grava tarefa, envia o criador e avisa o Financeiro quando o prazo é hoje', async () => {
    const { store, writes } = await setup()
    await store.createQuote(emptyState(), { title: 'GRU', client: 'Tenaris', priority: 'medium', status: 'Nova', clientContact: 'Walter', notes: 'GRU → Centro', deadline: today(), today: today(), actorEmployeeId: creatorId })
    expect(writes.some((item) => item.url.includes('/cr40f_plannertarefas'))).toBe(false)
    const quotePost = writes.find((item) => item.method === 'POST' && item.url.endsWith('/cr40f_pedidodecotacaos'))
    expect(quotePost?.body['cr40f_Criador@odata.bind']).toBe(`/cr40f_funcionarioses(${creatorId})`)
    const [notice] = notificationPosts(writes)
    expect(notice.body.cr40f_tipo).toBe('quote_urgent')
    expect(notice.body['cr40f_Cotacao@odata.bind']).toBe(`/cr40f_pedidodecotacaos(${quoteId})`)
    expect(notice.body['cr40f_Destinatario@odata.bind']).toBe(`/cr40f_funcionarioses(${financeId})`)
  })

  test('falha ao gravar o aviso de um financeiro não impede o aviso dos outros', async () => {
    const otherFinanceId = '77777777-7777-4777-8777-777777777777'
    const { store, writes } = await setup({ failNoticeFor: financeId })
    const state = { ...emptyState(), teams: [{ id: 'team-fin', name: 'Financeiro', memberIds: [financeId, otherFinanceId] }] } as unknown as LiveState
    await store.createQuote(state, { title: 'GRU', client: 'Tenaris', priority: 'medium', status: 'Nova', clientContact: 'Walter', notes: 'GRU → Centro', deadline: today(), today: today(), actorEmployeeId: creatorId })
    expect(notificationPosts(writes).map((item) => item.body['cr40f_Destinatario@odata.bind'])).toContain(`/cr40f_funcionarioses(${otherFinanceId})`)
  })

  test('aviso com chave já gravada não é recriado', async () => {
    const { notificationDedupeKey } = await import('../domain/notifications')
    const key = notificationDedupeKey({ recipientId: financeId, taskId: quoteId, type: 'quote_urgent', referenceDate: '' })
    const { store, writes } = await setup({ existingDedupeKeys: [key] })
    await store.createQuote(emptyState(), { title: 'GRU', client: 'Tenaris', priority: 'medium', status: 'Nova', deadline: today(), today: today(), actorEmployeeId: creatorId })
    expect(notificationPosts(writes)).toHaveLength(0)
  })

  test('sem as colunas da V2, cria a cotação sem criador e sem aviso', async () => {
    const { store, writes } = await setup({ missingAttributes: ['cr40f_criador', 'cr40f_cotacao'] })
    await store.createQuote(emptyState(), { title: 'GRU', client: 'Tenaris', priority: 'medium', status: 'Nova', deadline: today(), today: today(), actorEmployeeId: creatorId })
    const quotePost = writes.find((item) => item.method === 'POST' && item.url.endsWith('/cr40f_pedidodecotacaos'))
    expect(quotePost).toBeTruthy()
    expect(quotePost?.body['cr40f_Criador@odata.bind']).toBeUndefined()
    expect(notificationPosts(writes)).toHaveLength(0)
  })

  test('Cotada derivada avisa o criador', async () => {
    const { store, writes } = await setup()
    const state = { ...emptyState(), quotes: [{ id: quoteId, code: 'COT-0100', title: 'GRU', status: 'Em análise pelo financeiro', etag: 'W/"1"', creatorEmployeeId: creatorId, options: [] }] } as unknown as LiveState
    await store.updateQuote(state, quoteId, { options: [{ id: 'option-1', name: 'Sedan', value: '350' }] })
    const [notice] = notificationPosts(writes)
    expect(notice?.body.cr40f_tipo).toBe('quote_ready')
    expect(notice?.body['cr40f_Destinatario@odata.bind']).toBe(`/cr40f_funcionarioses(${creatorId})`)
  })

  test('Enviei grava a versão com a data e não mexe em tarefa', async () => {
    const { store, writes } = await setup()
    const option = { id: 'option-1', recordId: optionId, name: 'Sedan', items: [], value: '350' }
    const state = { ...emptyState(), quotes: [{ id: quoteId, code: 'COT-0100', title: 'GRU', status: 'Cotada', etag: 'W/"1"', creatorEmployeeId: creatorId, options: [option], proposalVersions: [] }] } as unknown as LiveState
    await store.markQuoteSent(state, quoteId, {}).catch(() => undefined) // a releitura final do stub não importa aqui
    const batch = writes.find((item) => item.url.includes('$batch'))
    expect(batch).toBeTruthy()
    const raw = JSON.stringify(batch)
    expect(raw.includes('cr40f_cotacaopropostaversaos')).toBe(true)
    expect(raw.includes('cr40f_plannertarefas')).toBe(false)
  })

  const waitingQuote = () => ({ ...emptyState(), quotes: [{ id: quoteId, code: 'COT-0100', title: 'GRU', status: 'Em análise pelo financeiro', etag: 'W/"1"', creatorEmployeeId: creatorId, options: [] }] } as unknown as LiveState)
  const waiting = { status: 'Aguardando informação', waitingFor: 'Horário do voo', waitingFrom: 'Walter', waitingReturnDate: '2026-10-30' }
  const quotePatch = (writes: Write[]) => writes.find((item) => item.method === 'PATCH' && item.url.includes(`/cr40f_pedidodecotacaos(${quoteId})`))

  test('Aguardar informação grava as três colunas quando existem', async () => {
    const { store, writes } = await setup()
    await store.updateQuote(waitingQuote(), quoteId, waiting).catch(() => undefined)
    expect(quotePatch(writes)?.body).toMatchObject({ cr40f_aguardandooque: 'Horário do voo', cr40f_aguardandodequem: 'Walter', cr40f_aguardandoretorno: '2026-10-30' })
  })

  test('sem as colunas de espera, muda o status sem gravá-las', async () => {
    const { store, writes } = await setup({ missingAttributes: ['cr40f_aguardandooque'] })
    await store.updateQuote(waitingQuote(), quoteId, waiting).catch(() => undefined)
    const body = quotePatch(writes)?.body || {}
    expect(body.cr40f_statuscotacao).toBe(100004002)
    expect('cr40f_aguardandooque' in body).toBe(false)
  })

  test('Aguardar sem o que falta é recusado antes de gravar', async () => {
    const { store, writes } = await setup()
    await expect(store.updateQuote(waitingQuote(), quoteId, { status: 'Aguardando informação' })).rejects.toThrow('Informe o que falta.')
    expect(quotePatch(writes)).toBeUndefined()
  })

  test('nome do anexo é saneado, único e limitado a 10 MB', async () => {
    const { quoteAttachmentName } = await import('./dataverse')
    expect(quoteAttachmentName({ name: 'a/b:c.pdf', size: 10 }, [])).toBe('a_b_c.pdf')
    expect(quoteAttachmentName({ name: 'voo.pdf', size: 10 }, [{ name: 'voo.pdf' }])).toBe('voo (2).pdf')
    expect(() => quoteAttachmentName({ name: 'grande.zip', size: 10 * 1024 * 1024 + 1 }, [])).toThrow('10 MB')
  })

  test('anexo da cotação vai para Cotacoes/<id> pelo flow Salvar', async () => {
    const flowCalls: Array<{ url: string; body: Record<string, unknown> }> = []
    const { store } = await setup()
    const dataverseFetch = g.fetch as (url: string, init?: { method?: string; body?: string }) => Promise<Response>
    g.fetch = async (url: string, init: { method?: string; body?: string } = {}) => {
      if (url.includes('environmentvariabledefinitions')) return new Response(JSON.stringify({ value: [{ environmentvariabledefinitionid: 'def', defaultvalue: 'https://flow.test/salvar' }] }), { status: 200 })
      if (url.includes('environmentvariablevalues')) return new Response(JSON.stringify({ value: [] }), { status: 200 })
      if (url.startsWith('https://flow.test')) { flowCalls.push({ url, body: JSON.parse(init.body || '{}') }); return new Response(JSON.stringify({ sucesso: true, id: 'sp-1', caminhoSharePoint: 'x', tamanho: 3 }), { status: 200 }) }
      return dataverseFetch(url, init)
    }
    vi.stubGlobal('FileReader', class { result = ''; onload: () => void = () => {}; onerror: () => void = () => {}; readAsDataURL() { this.result = 'data:application/pdf;base64,YWJj'; this.onload() } })
    const file = new File(['abc'], 'voo.pdf', { type: 'application/pdf' })
    const attachment = await store.addQuoteAttachment(quoteId, file, [])
    expect(flowCalls[0].body).toMatchObject({ caminhoCompleto: `Cotacoes/${quoteId}`, nomeArquivo: 'voo.pdf', mimeType: 'application/pdf' })
    expect(attachment).toMatchObject({ name: 'voo.pdf', sharePointId: 'sp-1' })
    vi.unstubAllGlobals()
  })

  test('Perdida exige motivo da lista', async () => {
    const { store } = await setup()
    const state = { ...emptyState(), quotes: [{ id: quoteId, status: 'Respondida ao cliente' }] } as unknown as LiveState
    await expect(store.setQuoteOutcome(state, quoteId, 'Perdida', 'x')).rejects.toThrow('Escolha o motivo da perda.')
    await expect(store.setQuoteOutcome(state, quoteId, 'Perdida', '')).rejects.toThrow('Escolha o motivo da perda.')
  })
})
