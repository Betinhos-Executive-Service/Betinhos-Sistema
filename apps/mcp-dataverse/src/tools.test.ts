import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataverseSession } from './dataverse'
import { baseRoute, env, json, mockFetch, type Call } from './helpers.test-util'
import { buildTools, type ToolDef } from './tools'

afterEach(() => vi.unstubAllGlobals())

const tools = () => {
  const session = new DataverseSession(env, 'rt')
  const list = buildTools({ session, identity: { email: 'ana@betinhos.com.br', name: 'Ana' } })
  return (name: string): ToolDef => list.find((t) => t.name === name)!
}
const dvCalls = (calls: Call[]) => calls.filter((c) => c.url.includes('/api/') && !c.url.includes('EntityDefinitions(LogicalName'))
const textOf = (r: { content: { text: string }[] }) => r.content[0].text

describe('catálogo de ferramentas', () => {
  it('expõe todas as ferramentas esperadas com anotações coerentes', () => {
    const list = buildTools({ session: new DataverseSession(env, 'rt'), identity: { email: '', name: '' } })
    const names = list.map((t) => t.name).sort()
    expect(names).toEqual(
      [
        'associate', 'create_record', 'create_table', 'delete_record', 'delete_table', 'describe_table', 'disassociate',
        'execute_action', 'execute_prompt', 'fetch', 'list_prompts', 'list_tables', 'read_query', 'search',
        'update_record', 'update_table', 'upsert_record', 'whoami',
      ].sort(),
    )
    for (const t of list.filter((t) => ['whoami', 'list_tables', 'describe_table', 'read_query', 'search', 'fetch', 'list_prompts'].includes(t.name))) {
      expect(t.annotations.readOnlyHint).toBe(true)
    }
    for (const n of ['delete_record', 'delete_table']) expect(list.find((t) => t.name === n)!.annotations.destructiveHint).toBe(true)
    expect(list.find((t) => t.name === 'read_query')!.description).toMatch(/SQL/)
    expect(list.find((t) => t.name === 'create_table')!.description).toMatch(/solu/i)
  })
})

describe('read_query', () => {
  it('monta o OData com a tabela resolvida, anotações e maxpagesize', async () => {
    const calls = mockFetch(baseRoute(() => json({ value: [{ a: 1 }], '@odata.nextLink': 'https://dev.crm.test/api/data/v9.2/cr40f_reservas?$skiptoken=2' })))
    const r = await tools()('read_query').handler({ tabela: 'cr40f_reserva', select: 'cr40f_name', filter: "statecode eq 0", top: 10, tamanhoPagina: 25 })
    const call = dvCalls(calls)[0]
    expect(call.method).toBe('GET')
    expect(decodeURIComponent(call.url)).toContain("cr40f_reservas?$select=cr40f_name&$filter=statecode eq 0&$top=10")
    expect(call.headers.Prefer).toContain('odata.maxpagesize=25')
    const out = JSON.parse(textOf(r))
    expect(out.proximaPagina).toContain('$skiptoken=2')
    expect(out.value).toEqual([{ a: 1 }])
  })

  it('limita tamanhoPagina a 200 (rejeita acima)', async () => {
    mockFetch(baseRoute(() => json({ value: [] })))
    const r = await tools()('read_query').handler({ tabela: 'cr40f_reserva', tamanhoPagina: 500 })
    expect(r.isError).toBe(true)
  })

  it('FetchXML: lê a tabela do XML, pagina e devolve pagingCookie', async () => {
    const calls = mockFetch(
      baseRoute(() => json({ value: [{ x: 1 }], '@Microsoft.Dynamics.CRM.morerecords': true, '@Microsoft.Dynamics.CRM.fetchxmlpagingcookie': '<cookie/>' })),
    )
    const xml = '<fetch><entity name="cr40f_reserva"><attribute name="cr40f_name"/></entity></fetch>'
    const r = await tools()('read_query').handler({ fetchXml: xml, pagina: 2, pagingCookie: '<c/>' })
    const url = decodeURIComponent(dvCalls(calls)[0].url)
    expect(url).toContain('cr40f_reservas?fetchXml=')
    expect(url).toContain('page="2"')
    expect(url).toContain('count="50"')
    const out = JSON.parse(textOf(r))
    expect(out.maisRegistros).toBe(true)
    expect(out.pagingCookie).toBe('<cookie/>')
  })

  it('proximaPagina de outro host é recusada (sem vazar token)', async () => {
    const calls = mockFetch(baseRoute(() => json({})))
    const r = await tools()('read_query').handler({ proximaPagina: 'https://evil.test/x' })
    expect(r.isError).toBe(true)
    expect(calls.some((c) => c.url.includes('evil.test'))).toBe(false)
  })

  it('trunca resposta grande e avisa', async () => {
    const value = Array.from({ length: 200 }, (_, i) => ({ i, texto: 'y'.repeat(1000) }))
    mockFetch(baseRoute(() => json({ value })))
    const r = await tools()('read_query').handler({ tabela: 'cr40f_reserva', tamanhoPagina: 200 })
    expect(textOf(r).length).toBeLessThanOrEqual(60_000)
    expect(JSON.parse(textOf(r))._truncado).toBe(true)
  })

  it('erro do Dataverse volta como isError com HTTP e código', async () => {
    mockFetch(baseRoute(() => json({ error: { code: '0x80060888', message: 'coluna inexistente' } }, 400)))
    const r = await tools()('read_query').handler({ tabela: 'cr40f_reserva', select: 'zzz' })
    expect(r.isError).toBe(true)
    expect(textOf(r)).toMatch(/400/)
    expect(textOf(r)).toMatch(/0x80060888/)
  })
})

describe('trava do PROD (confirmar)', () => {
  const writes: [string, Record<string, unknown>][] = [
    ['create_record', { tabela: 'cr40f_reserva', dados: { cr40f_name: 'x' } }],
    ['update_record', { tabela: 'cr40f_reserva', id: 'f9a9d2b2-4818-430f-9630-01e6629a0dc3', dados: { cr40f_observaointerna: '.' } }],
    ['upsert_record', { tabela: 'cr40f_reserva', chaves: { cr40f_codigo: 'A' }, dados: {} }],
    ['delete_record', { tabela: 'cr40f_reserva', id: 'f9a9d2b2-4818-430f-9630-01e6629a0dc3' }],
    ['create_table', { nomeSchema: 'cr40f_Novo', rotulo: 'Novo', rotuloPlural: 'Novos', colunaPrincipal: { nomeSchema: 'cr40f_name', rotulo: 'Nome' } }],
    ['update_table', { tabela: 'cr40f_reserva', rotulo: 'Reserva' }],
    ['delete_table', { tabela: 'cr40f_reserva' }],
    ['execute_action', { nome: 'cr40f_MinhaApi', parametros: {} }],
    ['associate', { tabela: 'cr40f_reserva', id: 'a', relacao: 'rel', tabelaAlvo: 'cr40f_reserva', idAlvo: 'b' }],
    ['disassociate', { tabela: 'cr40f_reserva', id: 'a', relacao: 'rel', tabelaAlvo: 'cr40f_reserva', idAlvo: 'b' }],
    ['execute_prompt', { promptId: 'a' }],
  ]

  it.each(writes)('%s no PROD sem confirmar devolve prévia e não escreve', async (name, args) => {
    const calls = mockFetch(baseRoute(() => json({})))
    const r = await tools()(name).handler({ ...args, ambiente: 'PROD' })
    expect(r.isError).toBe(true)
    expect(textOf(r)).toMatch(/PRÉVIA/)
    expect(textOf(r)).toMatch(/confirmar/)
    expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(calls.filter((c) => c.url.includes('login.')).length)
    expect(calls.some((c) => ['POST', 'PATCH', 'PUT', 'DELETE'].includes(c.method) && c.url.includes('/api/'))).toBe(false)
  })

  it('update_record no PROD com confirmar: true faz PATCH com If-Match: *', async () => {
    const calls = mockFetch(baseRoute((c) => (c.method === 'PATCH' ? new Response(null, { status: 204 }) : undefined)))
    const id = 'f9a9d2b2-4818-430f-9630-01e6629a0dc3'
    const r = await tools()('update_record').handler({ ambiente: 'PROD', tabela: 'cr40f_reserva', id, dados: { cr40f_observaointerna: '.' }, confirmar: true })
    expect(r.isError).toBeFalsy()
    const patch = calls.find((c) => c.method === 'PATCH')!
    expect(patch.url).toBe(`https://prod.crm.test/api/data/v9.2/cr40f_reservas(${id})`)
    expect(patch.headers['If-Match']).toBe('*')
    expect(patch.body).toEqual({ cr40f_observaointerna: '.' })
  })

  it('no DEV escreve sem confirmar', async () => {
    const calls = mockFetch(baseRoute((c) => (c.method === 'POST' ? new Response(null, { status: 204, headers: { 'OData-EntityId': 'https://dev.crm.test/api/data/v9.2/cr40f_reservas(11111111-1111-1111-1111-111111111111)' } }) : undefined)))
    const r = await tools()('create_record').handler({ tabela: 'cr40f_reserva', dados: { 'cr40f_Cliente@odata.bind': '/cr40f_clientes(1)', cr40f_name: 'x' } })
    expect(JSON.parse(textOf(r)).id).toBe('11111111-1111-1111-1111-111111111111')
    expect(calls.find((c) => c.method === 'POST' && c.url.includes('cr40f_reservas'))!.body['cr40f_Cliente@odata.bind']).toBe('/cr40f_clientes(1)')
  })

  it('leituras no PROD não exigem confirmar', async () => {
    mockFetch(baseRoute(() => json({ value: [] })))
    const r = await tools()('read_query').handler({ ambiente: 'PROD', tabela: 'cr40f_reserva' })
    expect(r.isError).toBeFalsy()
  })

  it('execute_action do tipo função (GET) no PROD não exige confirmar', async () => {
    const calls = mockFetch(baseRoute(() => json({ ok: 1 })))
    const r = await tools()('execute_action').handler({ ambiente: 'PROD', nome: 'WhoAmI', tipo: 'function' })
    expect(r.isError).toBeFalsy()
    expect(calls.some((c) => c.method === 'POST' && c.url.includes('/api/data'))).toBe(false)
  })
})

describe('upsert_record e delete_record', () => {
  it('upsert por chave alternativa envia PATCH tabela(chave) e If-None-Match no modo criar', async () => {
    const calls = mockFetch(baseRoute((c) => (c.method === 'PATCH' ? new Response(null, { status: 204 }) : undefined)))
    await tools()('upsert_record').handler({ tabela: 'cr40f_reserva', chaves: { cr40f_codigo: 'A' }, dados: { cr40f_name: 'n' }, modo: 'criar' })
    const p = calls.find((c) => c.method === 'PATCH')!
    expect(p.url).toContain("cr40f_reservas(cr40f_codigo='A')")
    expect(p.headers['If-None-Match']).toBe('*')
  })

  it('delete_record no DEV chama DELETE', async () => {
    const calls = mockFetch(baseRoute((c) => (c.method === 'DELETE' ? new Response(null, { status: 204 }) : undefined)))
    const r = await tools()('delete_record').handler({ tabela: 'cr40f_reserva', id: 'abc' })
    expect(r.isError).toBeFalsy()
    expect(calls.some((c) => c.method === 'DELETE' && c.url.endsWith('cr40f_reservas(abc)'))).toBe(true)
  })
})

describe('schema', () => {
  it('create_table monta a definição e envia a solução no cabeçalho', async () => {
    const calls = mockFetch(baseRoute((c) => (c.url.endsWith('/EntityDefinitions') && c.method === 'POST' ? new Response(null, { status: 204, headers: { 'OData-EntityId': 'https://dev.crm.test/api/data/v9.2/EntityDefinitions(22222222-2222-2222-2222-222222222222)' } }) : undefined)))
    const r = await tools()('create_table').handler({
      nomeSchema: 'cr40f_Novo', rotulo: 'Novo', rotuloPlural: 'Novos', solucao: 'BetinhosCore',
      colunaPrincipal: { nomeSchema: 'cr40f_name', rotulo: 'Nome' },
    })
    expect(r.isError).toBeFalsy()
    const post = calls.find((c) => c.method === 'POST' && c.url.endsWith('/EntityDefinitions'))!
    expect(post.headers['MSCRM.SolutionUniqueName']).toBe('BetinhosCore')
    expect(post.body.SchemaName).toBe('cr40f_Novo')
    expect(post.body.DisplayName.LocalizedLabels[0].LanguageCode).toBe(1046)
    expect(post.body.Attributes[0].IsPrimaryName).toBe(true)
  })

  it('update_table cria coluna via Attributes e lookup via RelationshipDefinitions', async () => {
    const calls = mockFetch(baseRoute((c) => (c.method === 'POST' ? new Response(null, { status: 204 }) : undefined)))
    const r = await tools()('update_table').handler({
      tabela: 'cr40f_reserva',
      adicionarColunas: [
        { tipo: 'texto', nomeSchema: 'cr40f_obs', rotulo: 'Obs' },
        { tipo: 'lookup', nomeSchema: 'cr40f_cliente', rotulo: 'Cliente', tabelaAlvo: 'account' },
      ],
    })
    expect(r.isError).toBeFalsy()
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith("EntityDefinitions(LogicalName='cr40f_reserva')/Attributes"))).toBe(true)
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/RelationshipDefinitions'))).toBe(true)
  })
})

describe('associate / execute_action', () => {
  it('associate usa $ref com @odata.id do mesmo ambiente', async () => {
    const calls = mockFetch(baseRoute((c) => (c.method === 'POST' ? new Response(null, { status: 204 }) : undefined)))
    await tools()('associate').handler({ tabela: 'cr40f_reserva', id: 'a', relacao: 'cr40f_rel', tabelaAlvo: 'cr40f_reserva', idAlvo: 'b' })
    const post = calls.find((c) => c.method === 'POST' && c.url.endsWith('/$ref'))!
    expect(post.url).toContain('cr40f_reservas(a)/cr40f_rel/$ref')
    expect(post.body['@odata.id']).toBe('https://dev.crm.test/api/data/v9.2/cr40f_reservas(b)')
  })

  it('função com parâmetros usa GET com aliases', async () => {
    const calls = mockFetch(baseRoute(() => json({ ok: 1 })))
    await tools()('execute_action').handler({ nome: 'cr40f_Fn', tipo: 'function', parametros: { Nome: 'x y' } })
    const call = dvCalls(calls).find((c) => c.url.includes('cr40f_Fn'))!
    expect(call.method).toBe('GET')
    expect(decodeURIComponent(call.url)).toContain("cr40f_Fn(Nome=@p0)?@p0='x y'")
  })
})

describe('search', () => {
  it('chama a API de search v2 do ambiente', async () => {
    const calls = mockFetch(baseRoute(() => json({ totalrecordcount: 1, value: [{ entityname: 'account' }] })))
    const r = await tools()('search').handler({ consulta: 'maria', tabelas: ['account'], limite: 5 })
    const call = calls.find((c) => c.url.includes('/api/search/v2.0/query'))!
    expect(call.url).toBe('https://dev.crm.test/api/search/v2.0/query')
    expect(call.method).toBe('POST')
    expect(call.body.search).toBe('maria')
    expect(JSON.parse(textOf(r)).total).toBe(1)
  })
})
