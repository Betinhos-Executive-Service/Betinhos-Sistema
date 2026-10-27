// Porte de Tela Planner/tests/quoteVersionLoad.test.mjs: avalia o trecho de
// loadQuoteScenarioData do fonte (sem tipos) com dependências falsas. Mesmas asserções;
// a única dependência nova é o helper `s` (coerção `valor || ""`) do fonte TS.
import { describe, expect, test } from 'vitest'
import { evaluateSnippet, readDataverseSource } from './dataverseSource'

type Version = { id: string; sentAt?: string; createdAt?: string }
type Loaded = { proposalVersions: Version[]; etag: string }

describe('quoteVersionLoad', () => {
  test('Dataverse recarrega todas as versões pelo lookup real sem presumir data de envio antiga', async () => {
    const source = await readDataverseSource()
    const start = source.indexOf('async function loadQuoteScenarioData(')
    const end = source.indexOf('\n}', start) + 2
    const load = evaluateSnippet<(xrm: unknown, rows: unknown[]) => Promise<Loaded[]>>(source.slice(start, end), 'loadQuoteScenarioData', {
      normalizeQuote: (row: { cr40f_pedidodecotacaoid: string }) => ({ id: row.cr40f_pedidodecotacaoid }),
      retrieveMany: async (_: unknown, table: string) => table === 'versions' ? [
        { _cr40f_pedidocotacao_value: 'quote-1', cr40f_cotacaopropostaversaoid: 'v3', cr40f_enviadoem: null, cr40f_conteudo: JSON.stringify({ number: 3, createdAt: '2026-09-30T12:00:00Z' }) },
        { _cr40f_pedidocotacao_value: 'quote-1', cr40f_cotacaopropostaversaoid: 'v1', cr40f_enviadoem: '2026-09-01T10:00:00Z', cr40f_conteudo: JSON.stringify({ number: 1 }) },
        { _cr40f_pedidocotacao_value: 'quote-1', cr40f_cotacaopropostaversaoid: 'v2', cr40f_enviadoem: '2026-09-02T10:00:00Z', cr40f_conteudo: JSON.stringify({ number: 2, createdAt: '2026-09-02T11:00:00Z', sentAt: '2026-09-02T10:00:00Z' }) },
      ] : [],
      cleanId: (id: unknown) => String(id || ''),
      scenarioJson: (json: string) => JSON.parse(json || '{}') as unknown,
      quoteIdsFilter: () => '',
      QUOTE_OPTION_TABLE: 'options',
      QUOTE_PROPOSAL_VERSION_TABLE: 'versions',
      QUOTE_OPTION_ITEM_TABLE: 'items',
      s: (value: unknown) => (value ? String(value) : ''),
    })
    const [quote] = await load({}, [{ cr40f_pedidodecotacaoid: 'quote-1', '@odata.etag': 'W/"2"' }])
    expect(quote.proposalVersions.length).toBe(3)
    expect(quote.proposalVersions[0].sentAt).toBe(undefined)
    expect(quote.proposalVersions[1].createdAt).toBe('2026-09-02T11:00:00Z')
    expect(quote.proposalVersions[1].sentAt).toBe('2026-09-02T10:00:00Z')
    expect(quote.etag).toBe('W/"2"')
    expect(quote.proposalVersions.at(-1)?.id).toBe('v3')
    expect(quote.proposalVersions.at(-1)?.sentAt).toBe(undefined)
  })
})
