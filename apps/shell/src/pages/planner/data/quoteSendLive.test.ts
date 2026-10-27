// Teste do adapter Dataverse de Tela Planner/tests/quoteResponseConfirmation.test.mjs
// ("adapter Dataverse registra o envio em transação..."). Avalia o trecho de
// markLiveQuoteSent do fonte sem tipos, com as mesmas dependências e asserções.
import { describe, expect, test } from 'vitest'
import { buildQuoteEmailHtml, buildQuotePlainText } from '../domain/quoteDomain'
import { createQuoteProposalVersion, normalizeQuoteOptions, prepareQuoteResponse } from '../domain/quoteScenarios'
import { clientDecisionWaitingContext } from '../domain/quoteTaskFlow'
import { evaluateSnippet, readDataverseSource } from './dataverseSource'

const send = { channel: 'E-mail', recipient: 'cliente@empresa.com', sentAt: '2026-10-23T15:00:00.000Z' }

type Operation = { etag?: string; body: Record<string, unknown> }
type Option = { id: string; name: string; value: string }

describe('quoteResponseConfirmation — adapter Dataverse', () => {
  test('adapter Dataverse registra o envio em transação e deixa a tarefa aguardando o cliente', async () => {
    const source = await readDataverseSource()
    const start = source.indexOf('async function markLiveQuoteSent(')
    const end = source.indexOf('\nexport interface QuoteAcceptance', start)
    const requestId = '11111111-1111-4111-8111-111111111111'
    const quote = { id: 'q', status: 'Cotada', etag: 'W/"1"', code: 'COT-QA', options: [
      { id: 'a', name: 'Executivo', value: '1200' },
      { id: 'b', name: 'Premium', value: '1800' },
      { id: 'empty', name: 'Em composição', value: '' },
    ] }
    const state = { quotes: [quote], tasks: [{ id: 't', quoteId: 'q' }] }
    let operations: Operation[] = []
    const dependencies = {
      cleanId: (id: unknown) => id, QUOTE_COMPLETED_STATUSES: ['Cotada', 'Respondida ao cliente'],
      loadLiveState: async () => state, scenarioId: () => requestId, normalizeQuoteOptions, prepareQuoteResponse,
      updateLiveQuote: async (_: unknown, current: typeof state, _id: string, patch: { options: Option[] }) => ({ ...current, quotes: [{ ...quote, ...patch, etag: 'W/"2"', options: patch.options.map((option) => ({ ...option, recordId: `record-${option.id}` })) }] }),
      createQuoteProposalVersion, buildQuoteEmailHtml, buildQuotePlainText, clientDecisionWaitingContext,
      waitingContextPayload: (context: { subject: string; onName: string }) => ({ cr40f_contextoespera: context.subject, cr40f_aguardandonome: context.onName }),
      resolveLookupNavigation: async (_: unknown, _table: string, attribute: string) => attribute,
      QUOTE_PROPOSAL_VERSION_TABLE: 'versions', QUOTE_TABLE: 'quotes', EVENT_TABLE: 'events', TASK_TABLE: 'tasks',
      entitySetName: (name: string) => name, quotePayload: (value: unknown) => value, STATUS_VALUES: { done: 3, waiting: 2 },
      commitQuoteSend: async (_: unknown, writes: Operation[]) => { operations = writes },
      apiUrl: () => 'https://example.invalid/api',
    }
    const mark = evaluateSnippet<(xrm: unknown, state: unknown, id: string, proposal: Record<string, unknown>) => Promise<unknown>>(source.slice(start, end), 'markLiveQuoteSent', dependencies)
    const xrm = { Utility: { getGlobalContext: () => ({ userSettings: { userId: 'renan', userName: 'Renan' }, getClientUrl: () => 'https://example.invalid' }) } }
    await expect(mark(xrm, state, 'q', { requestId })).rejects.toThrow(/canal/i)
    await mark(xrm, state, 'q', { requestId, send, html: '<p>editado</p>' })
    expect(operations.length).toBe(4)
    expect(operations[0].body.cr40f_enviadoem).toBe(undefined)
    const version = JSON.parse(String(operations[0].body.cr40f_conteudo)) as { options: Option[]; authorName: string; sentAt: string; channel: string; html: string; createdAt: string }
    expect(version.options.map((option) => option.id)).toEqual(['a', 'b'])
    expect(version.authorName).toBe('Renan')
    expect(version.sentAt).toBe(send.sentAt)
    expect(version.channel).toBe('E-mail')
    expect(version.html).toBe('<p>editado</p>')
    expect(operations[1].etag).toBe('W/"2"')
    expect(operations[1].body.status).toBe('Respondida ao cliente')
    expect(operations[2].body.cr40f_status).toBe(2)
    expect(operations[2].body.cr40f_contextoespera).toBe('Decisão do cliente sobre a proposta')
    expect((JSON.parse(String(operations[3].body.cr40f_valornovo)) as { confirmedAt: string }).confirmedAt).toBe(version.createdAt)
    expect((JSON.parse(String(operations[3].body.cr40f_valornovo)) as { channel: string }).channel).toBe('E-mail')
  })
})
