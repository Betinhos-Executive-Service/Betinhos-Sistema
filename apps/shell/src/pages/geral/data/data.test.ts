// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { Host } from '../../../host'
import { fetchPath, mapViews, parseCount, parsePage, reloadPath, searchPath } from './queries'
import { applyMockFetch, createMockRows, createMockViews, MOCK_ATTRIBUTES, MOCK_ROW_COUNT } from './mock'
import type { FilterSet } from '../domain/filters'
import { fromLegacy, geralFilterFields, injectTableFilters } from '../domain/tableFilters'
import { PAGE_SIZE } from '../domain/types'
import { createSource } from './source'

describe('queries', () => {
  it('mapeia visões do sistema e pessoais, marcando a padrão', () => {
    const views = mapViews(
      [{ savedqueryid: 'A', name: '🗓️Agenda', fetchxml: '<fetch/>', layoutxml: '<grid/>', isdefault: true }, { savedqueryid: 'B', name: 'Hoje', fetchxml: '<fetch/>', layoutxml: '<grid/>', isdefault: false }],
      [{ userqueryid: 'U', name: 'Tenaris', fetchxml: '<fetch/>', layoutxml: '<grid/>' }],
    )
    expect(views.map((v) => [v.id, v.grupo, v.padrao])).toEqual([['A', 'sistema', true], ['B', 'sistema', false], ['U', 'minhas', false]])
  })
  it('fetchPath codifica o FetchXML', () => {
    expect(fetchPath('cr40f_reservadeveculoses', '<fetch count="50"/>')).toBe('cr40f_reservadeveculoses?fetchXml=%3Cfetch%20count%3D%2250%22%2F%3E')
  })
  it('parseCount lê o total da agregação ou devolve null', () => {
    expect(parseCount({ value: [{ total: 220 }] })).toBe(220)
    expect(parseCount({ value: [] })).toBeNull()
    expect(parseCount({ value: [{ total: 'x' }] })).toBeNull()
  })
  it('parsePage extrai total, cookie decodificado e se há mais', () => {
    const page = parsePage({
      value: [{ cr40f_id: 'OS-1' }],
      '@Microsoft.Dynamics.CRM.totalrecordcount': 120,
      '@Microsoft.Dynamics.CRM.morerecords': true,
      '@Microsoft.Dynamics.CRM.fetchxmlpagingcookie': '<cookie pagenumber="2" pagingcookie="%253ccookie%2520page%253d%25221%2522%253e%253c%252fcookie%253e" istracking="False" />',
    })
    expect(page.total).toBe(120)
    expect(page.more).toBe(true)
    expect(page.cookie).toBe('<cookie page="1"></cookie>')
    expect(parsePage({ value: [] })).toEqual({ rows: [], cookie: null, more: false, total: null })
    expect(parsePage({ value: [], '@Microsoft.Dynamics.CRM.totalrecordcount': -1 }).total).toBeNull()
  })
  it('busca de lookup e releitura da linha', () => {
    expect(searchPath('cr40f_funcionarioses', 'cr40f_funcionariosid', 'cr40f_nomecompleto', "jo'ao")).toBe("cr40f_funcionarioses?$select=cr40f_funcionariosid,cr40f_nomecompleto&$filter=statecode%20eq%200%20and%20contains(cr40f_nomecompleto%2C'jo''ao')&$orderby=cr40f_nomecompleto%20asc&$top=25")
    const filter = (q: string) => decodeURIComponent(/\$filter=([^&]*)/.exec(searchPath('s', 'id', 'nome', q))?.[1] ?? '')
    expect(filter('  Lima ')).toBe("statecode eq 0 and contains(nome,'Lima')")
    expect(filter('50%_[x]')).toBe("statecode eq 0 and contains(nome,'50[%][_][[]x]')")
    expect(filter("d'água")).toBe("statecode eq 0 and contains(nome,'d''água')")
    expect(filter('  ')).toBe('statecode eq 0')
    expect(searchPath('s', 'id', 'nome', 'a')).toContain('$top=25')
    expect(reloadPath('cr40f_reservadeveculoses', '{ABC}', ['cr40f_id', '_cr40f_motorista_value', 'a_1.new_valortotal'])).toBe('cr40f_reservadeveculoses(abc)?$select=cr40f_reservadeveculosid,cr40f_id,_cr40f_motorista_value,statecode')
  })
})

describe('mock', () => {
  it('visões, linhas e fetch simulado', () => {
    const now = new Date('2026-10-08T12:00:00Z')
    const views = createMockViews()
    const rows = createMockRows(now)
    expect(views.find((v) => v.padrao)?.nome).toContain('Agenda')
    expect(rows.length).toBe(MOCK_ROW_COUNT)
    const page = applyMockFetch(rows, views[0].fetchxml, { page: 1, pageSize: PAGE_SIZE, sort: null, query: '', quickFind: ['cr40f_id'], now })
    expect(page.rows.length).toBe(PAGE_SIZE)
    expect(page.more).toBe(true)
    expect(page.total).toBe(rows.length)
    // A OS-1013 (linha bloqueada dos testes) fica entre as 100 primeiras da Agenda.
    expect(page.rows.some((r) => r.cr40f_id === 'OS-1013')).toBe(true)
    const hoje = applyMockFetch(rows, views.find((v) => v.nome === 'Hoje')!.fetchxml, { page: 1, pageSize: PAGE_SIZE, sort: null, query: '', quickFind: [], now })
    expect(hoje.rows.every((r) => String(r.cr40f_dataehorriodesada).startsWith('2026-10-08'))).toBe(true)
    const busca = applyMockFetch(rows, views[0].fetchxml, { page: 1, pageSize: PAGE_SIZE, sort: null, query: 'OS-10', quickFind: ['cr40f_id'], now })
    expect(busca.rows.every((r) => String(r.cr40f_id).includes('OS-10'))).toBe(true)
  })
  it('source mock devolve páginas de 100 linhas', async () => {
    const source = createSource({ mode: 'mock' }, { latency: 0 })
    const [view] = await source.views()
    const request = { fetchxml: view.fetchxml, page: 1, cookie: null, sort: null, query: '', quickFind: [] }
    expect((await source.page(request)).rows).toHaveLength(PAGE_SIZE)
    expect((await source.page({ ...request, page: 2 })).rows).toHaveLength(PAGE_SIZE)
    expect((await source.page({ ...request, page: 3 })).rows).toHaveLength(MOCK_ROW_COUNT - 2 * PAGE_SIZE)
  })
  it('source mock conta o total da visão e o filtrado', async () => {
    const source = createSource({ mode: 'mock' }, { latency: 0 })
    const views = await source.views()
    const agenda = views.find((v) => v.padrao)!
    expect(await source.count({ fetchxml: agenda.fetchxml, query: '', quickFind: [] })).toBe(MOCK_ROW_COUNT)
    const sem = views.find((v) => v.nome.includes('Sem motorista'))!
    const filtrado = await source.count({ fetchxml: sem.fetchxml, query: '', quickFind: [] })
    const pagina = await source.page({ fetchxml: sem.fetchxml, page: 1, cookie: null, sort: null, query: '', quickFind: [] })
    // Como no Dataverse, a página não traz total: ele vem só da contagem.
    expect(pagina.total).toBeNull()
    expect(pagina.more).toBe(false)
    expect(filtrado).toBe(pagina.rows.length)
    expect(filtrado).toBeLessThan(MOCK_ROW_COUNT)
  })
  it('source mock grava e relê', async () => {
    const source = createSource({ mode: 'mock' })
    const views = await source.views()
    const first = (await source.page({ fetchxml: views[0].fetchxml, page: 1, cookie: null, sort: null, query: '', quickFind: [] })).rows[0]
    const id = String(first.cr40f_reservadeveculosid)
    await source.update(id, { cr40f_trajeto: 'Nova rota' })
    expect((await source.reload(id, ['cr40f_trajeto'])).cr40f_trajeto).toBe('Nova rota')
    expect((await source.search('cr40f_motorista', 'a')).length).toBeGreaterThan(0)
    expect(await source.openForm('create')).toBe('mock')
    expect(source.openVoucher([id])).toBeNull()
  })
})

describe('mock — contrato da tela', () => {
  it('a OS-1013 fica nas 50 primeiras da Agenda, que traz trajeto e cotação, e rejeita gravação', async () => {
    const source = createSource({ mode: 'mock' })
    const views = await source.views()
    expect(views[0].layoutxml).toContain('cr40f_trajeto')
    expect(views[0].layoutxml).toContain('cr40f_cotao')
    const { rows } = await source.page({ fetchxml: views[0].fetchxml, page: 1, cookie: null, sort: null, query: '', quickFind: [] })
    const blocked = rows.find((r) => r.cr40f_id === 'OS-1013')
    expect(blocked).toBeDefined()
    await expect(source.update(String(blocked?.cr40f_reservadeveculosid), { cr40f_trajeto: 'x' })).rejects.toThrow('Sem permissão para alterar este serviço.')
  })
  it('Sem motorista só traz linhas sem motorista e a escolha de lookup atualiza o nome', async () => {
    const source = createSource({ mode: 'mock' })
    const views = await source.views()
    const semMotorista = await source.page({ fetchxml: views[2].fetchxml, page: 1, cookie: null, sort: null, query: '', quickFind: [] })
    expect(semMotorista.rows.length).toBe(createMockRows(new Date()).filter((r) => r._cr40f_motorista_value == null).length)
    expect(semMotorista.rows.length).toBeLessThanOrEqual(50)
    expect(semMotorista.rows.every((r) => r._cr40f_motorista_value == null)).toBe(true)
    const id = String(semMotorista.rows[0].cr40f_reservadeveculosid)
    const bind = await source.lookupBind('cr40f_motorista')
    const [ana] = await source.search('cr40f_motorista', 'ana')
    await source.update(id, { [`${bind.nav}@odata.bind`]: `/${bind.set}(${ana.id})` })
    expect((await source.reload(id, []))['_cr40f_motorista_value@OData.Community.Display.V1.FormattedValue']).toBe('Ana Souza')
  })
})

describe('source Dataverse', () => {
  function fakeHost(overrides: { request?: (path: string, init?: RequestInit) => unknown; getAll?: (path: string) => Promise<unknown[]>; primaryName?: string } = {}) {
    const request = vi.fn(async (path: string, init?: RequestInit) => overrides.request?.(path, init) ?? { value: [] })
    const update = vi.fn(async (_set: string, id: string) => { if (id === 'ruim') throw new Error('Sem permissão.') })
    const getAll = vi.fn(overrides.getAll ?? (async () => []))
    const create = vi.fn(async (_set: string, _data: unknown) => '{0F8FAD5B-D9CB-469F-A165-70867728950E}')
    const remove = vi.fn(async (_set: string, _id: string) => undefined)
    const host = {
      mode: 'dataverse', clientUrl: 'https://org.crm.dynamics.com', insideModelDriven: false, appId: async () => undefined,
      client: { request, update, getAll, create, remove },
      metadata: {
        entities: async () => new Map([['cr40f_reservadeveculos', { entitySetName: 'cr40f_reservadeveculoses' }]]),
        entity: async (name: string) => ({ logicalName: name, entitySetName: `${name}s`, primaryName: overrides.primaryName ?? 'cr40f_nome', objectTypeCode: name === 'cr40f_reservadeveculos' ? 10580 : null }),
        attributes: async () => [
          { logicalName: 'cr40f_status', type: 'Picklist', label: 'Status', updatable: true, targets: [] },
          { logicalName: 'cr40f_receber', type: 'Boolean', label: 'Receber', updatable: true, targets: [] },
          { logicalName: 'cr40f_motorista', type: 'Lookup', label: 'Motorista', updatable: true, targets: ['cr40f_funcionarios'] },
        ],
        choices: async () => [{ value: 1, label: 'Confirmado' }],
      },
    } as unknown as Host
    return { host, request, update, getAll, create, remove }
  }

  it('createView posta a visão pessoal em userqueries com o corpo certo e devolve a visão da lista', async () => {
    const { host, create } = fakeHost()
    const view = await createSource(host).createView({ name: 'Minha', fetchxml: '<fetch/>', layoutxml: '<grid/>' })
    expect(create).toHaveBeenCalledWith('userqueries', { name: 'Minha', returnedtypecode: 'cr40f_reservadeveculos', querytype: 0, fetchxml: '<fetch/>', layoutxml: '<grid/>', description: 'Criada no Sistema Betinhos' })
    expect(view).toEqual({ id: '0f8fad5b-d9cb-469f-a165-70867728950e', nome: 'Minha', grupo: 'minhas', fetchxml: '<fetch/>', layoutxml: '<grid/>', padrao: false })
  })

  it('updateView, renameView e deleteView usam userqueries; objectTypeCode vem da metadata', async () => {
    const { host, update, remove } = fakeHost()
    const source = createSource(host)
    await source.updateView('{ABC}', { fetchxml: '<f/>', layoutxml: '<g/>' })
    await source.renameView('{ABC}', 'Novo nome')
    await source.deleteView('{ABC}')
    expect(update).toHaveBeenNthCalledWith(1, 'userqueries', '{ABC}', { fetchxml: '<f/>', layoutxml: '<g/>' })
    expect(update).toHaveBeenNthCalledWith(2, 'userqueries', '{ABC}', { name: 'Novo nome' })
    expect(remove).toHaveBeenCalledWith('userqueries', '{ABC}')
    expect(await source.objectTypeCode()).toBe(10580)
  })

  it('quickFind aquece a metadata da busca; a página busca choice pelo rótulo e lookup pelos IDs do nome, numa resolução só', async () => {
    const quickFindXml = '<fetch><entity name="cr40f_reservadeveculos"><filter isquickfindfields="1">'
      + ['cr40f_status', 'cr40f_receber', 'cr40f_motorista'].map((a) => `<condition attribute="${a}" operator="like" value="{0}" />`).join('')
      + '</filter></entity></fetch>'
    const { host, request } = fakeHost({
      getAll: async () => [{ fetchxml: quickFindXml }],
      request: (path) => (path.startsWith('cr40f_funcionarioss?') ? { value: [{ cr40f_funcionariosid: '{AAA}' }] } : { value: [] }),
    })
    const entity = vi.spyOn(host.metadata, 'entity')
    const source = createSource(host)
    const quickFind = await source.quickFind()
    expect(quickFind).toEqual(['cr40f_status', 'cr40f_receber', 'cr40f_motorista'])
    await vi.waitFor(() => expect(entity).toHaveBeenCalledWith('cr40f_funcionarios'))

    const view = '<fetch><entity name="cr40f_reservadeveculos"><attribute name="cr40f_id" /></entity></fetch>'
    await source.page({ fetchxml: view, page: 1, cookie: null, sort: null, query: 'confirm', quickFind })
    await source.count({ fetchxml: view, query: 'confirm', quickFind })
    const fetches = request.mock.calls.map(([path]) => decodeURIComponent(path)).filter((path) => path.includes('?fetchXml='))
    expect(fetches).toHaveLength(2)
    for (const xml of fetches) {
      expect(xml).toContain('<condition attribute="cr40f_status" operator="in"><value>1</value></condition>')
      expect(xml).toContain('<condition attribute="cr40f_motorista" operator="in"><value>aaa</value></condition>')
      expect(xml).not.toContain('operator="like"')
    }
    // Página e contagem do mesmo termo reaproveitam a resolução dos IDs.
    expect(request.mock.calls.filter(([path]) => path.startsWith('cr40f_funcionarioss?'))).toHaveLength(1)
  })

  it('mock: cria, atualiza, renomeia e exclui visões pessoais em memória', async () => {
    const source = createSource({ mode: 'mock' }, { latency: 0 })
    const created = await source.createView({ name: 'Minha', fetchxml: '<fetch/>', layoutxml: '<grid/>' })
    expect((await source.views()).filter((v) => v.grupo === 'minhas').map((v) => v.nome)).toEqual(['Minha'])
    await source.renameView(created.id, 'Outra')
    await source.updateView(created.id, { fetchxml: '<fetch x="1"/>', layoutxml: '<grid/>' })
    expect((await source.views()).find((v) => v.id === created.id)).toMatchObject({ nome: 'Outra', fetchxml: '<fetch x="1"/>' })
    await source.deleteView(created.id)
    expect((await source.views()).some((v) => v.id === created.id)).toBe(false)
    await expect(source.deleteView('mock-agenda')).rejects.toThrow()
    expect(await source.objectTypeCode()).toBe(10580)
  })

  it('visões pessoais com 403 não derrubam as do sistema', async () => {
    const { host } = fakeHost({ getAll: async (path) => { if (path.startsWith('userqueries')) throw new Error('403'); return [{ savedqueryid: 'a', name: 'Agenda', fetchxml: '<fetch/>', layoutxml: '<grid/>', isdefault: true }] } })
    expect((await createSource(host).views()).map((v) => v.nome)).toEqual(['Agenda'])
  })
  it('atributos trazem opções de choice e booleanos sem chamada extra', async () => {
    const map = await createSource(fakeHost().host).attributes('cr40f_reservadeveculos')
    expect(map.get('cr40f_status')?.options).toEqual([{ value: 1, label: 'Confirmado' }])
    expect(map.get('cr40f_receber')?.options.map((o) => o.label)).toEqual(['Sim', 'Não'])
  })
  it('page injeta paginação no FetchXML e decodifica o cookie', async () => {
    const { host, request } = fakeHost({ request: () => ({ value: [], '@Microsoft.Dynamics.CRM.morerecords': true, '@Microsoft.Dynamics.CRM.fetchxmlpagingcookie': '<cookie pagingcookie="%253cc%252f%253e" />' }) })
    const page = await createSource(host).page({ fetchxml: '<fetch><entity name="cr40f_reservadeveculos" /></fetch>', page: 2, cookie: '<c/>', sort: null, query: '', quickFind: [] })
    expect(page.cookie).toBe('<c/>')
    const url = decodeURIComponent(String(request.mock.calls[0][0]))
    expect(url).toContain('cr40f_reservadeveculoses?fetchXml=')
    expect(url).toContain('count="100"')
    expect(url).toContain('page="2"')
  })
  it('page e count repassam o sinal de cancelamento ao cliente', async () => {
    const { host, request } = fakeHost({ request: () => ({ value: [{ total: 3 }] }) })
    const source = createSource(host)
    const controller = new AbortController()
    const fetchxml = '<fetch><entity name="cr40f_reservadeveculos" /></fetch>'
    await source.page({ fetchxml, page: 1, cookie: null, sort: null, query: 'x', quickFind: ['cr40f_id'], signal: controller.signal })
    await source.count({ fetchxml, query: 'x', quickFind: ['cr40f_id'], signal: controller.signal })
    expect(request.mock.calls.map((call) => call[1]?.signal)).toEqual([controller.signal, controller.signal])
    expect(decodeURIComponent(String(request.mock.calls[0][0]))).not.toContain('returntotalrecordcount')
  })
  it('count cancelado vira null, sem erro', async () => {
    const { host } = fakeHost({ request: () => { throw new DOMException('cancelado', 'AbortError') } })
    expect(await createSource(host).count({ fetchxml: '<fetch><entity name="cr40f_reservadeveculos" /></fetch>', query: '', quickFind: [] })).toBeNull()
  })
  it('busca do mock segue o FetchXML real: termo em qualquer parte', async () => {
    const source = createSource({ mode: 'mock' }, { latency: 0 })
    const fetchxml = (await source.views()).find((v) => v.padrao)!.fetchxml
    const quickFind = await source.quickFind()
    const ask = async (query: string) => (await source.page({ fetchxml, page: 1, cookie: null, sort: null, query, quickFind })).rows
    expect((await ask('Unique')).every((r) => String(r.cr40f_trajeto).includes('Unique'))).toBe(true)
    expect((await ask('Unique')).length).toBeGreaterThan(0)
    // Meio do código e do trajeto também acham.
    expect((await ask('1013')).map((r) => r.cr40f_id)).toContain('OS-1013')
    expect((await ask('S-1013')).map((r) => r.cr40f_id)).toEqual(['OS-1013'])
    expect((await ask('fasano')).every((r) => String(r.cr40f_trajeto).includes('Fasano'))).toBe(true)
    // Lookup do mock com o termo em qualquer parte, como o contains real.
    expect((await source.search('cr40f_motorista', 'lima')).map((o) => o.nome)).toEqual(['Carlos Lima'])
    expect(await source.search('cr40f_motorista', 'zzz')).toEqual([])
  })
  it('count pede a agregação por FetchXML e devolve o número; erro vira null', async () => {
    const { host, request } = fakeHost({ request: () => ({ value: [{ total: 1234 }] }) })
    const total = await createSource(host).count({ fetchxml: '<fetch count="100" page="2"><entity name="cr40f_reservadeveculos"><attribute name="cr40f_id" /><order attribute="cr40f_id" /></entity></fetch>', query: '', quickFind: [] })
    expect(total).toBe(1234)
    const url = decodeURIComponent(String(request.mock.calls[0][0]))
    expect(url).toContain('cr40f_reservadeveculoses?fetchXml=')
    expect(url).toContain('aggregate="true"')
    expect(url).not.toContain('<order')
    const ruim = fakeHost({ request: () => { throw new Error('boom') } })
    expect(await createSource(ruim.host).count({ fetchxml: '<fetch><entity name="cr40f_reservadeveculos" /></fetch>', query: '', quickFind: [] })).toBeNull()
    expect(await createSource(fakeHost().host).count({ fetchxml: '<fetch><entity>', query: '', quickFind: [] })).toBeNull()
  })
  it('lookupBind lê a relação e falha com mensagem clara quando não existe', async () => {
    const ok = fakeHost({ request: () => ({ value: [{ ReferencingEntityNavigationPropertyName: 'cr40f_Motorista', ReferencedEntity: 'cr40f_funcionarios' }] }) })
    expect(await createSource(ok.host).lookupBind('cr40f_motorista')).toEqual({ nav: 'cr40f_Motorista', set: 'cr40f_funcionarioss' })
    await expect(createSource(fakeHost().host).lookupBind('cr40f_motorista')).rejects.toThrow('Relação de cr40f_motorista não encontrada na metadata.')
  })
  it('search usa o nome primário da metadata e recusa tabela sem nome primário', async () => {
    const { host, request } = fakeHost({ request: () => ({ value: [{ cr40f_funcionariosid: '{ABC}', cr40f_nome: 'Ana' }] }) })
    expect(await createSource(host).search('cr40f_motorista', 'an')).toEqual([{ id: 'abc', nome: 'Ana' }])
    expect(decodeURIComponent(String(request.mock.calls[0][0]))).toContain('cr40f_funcionarioss?$select=cr40f_funcionariosid,cr40f_nome')
    await expect(createSource(fakeHost({ primaryName: '' }).host).search('cr40f_motorista', 'an')).rejects.toThrow('Tabela cr40f_funcionarios sem nome primário na metadata.')
  })
  it('setState separa o que gravou do que falhou; clearLookup remove a referência', async () => {
    const { host, request } = fakeHost({ request: () => ({ value: [{ ReferencingEntityNavigationPropertyName: 'cr40f_Motorista', ReferencedEntity: 'cr40f_funcionarios' }] }) })
    const source = createSource(host)
    expect(await source.setState(['a', 'ruim'], false)).toEqual({ ok: ['a'], failed: [{ id: 'ruim', message: 'Sem permissão.' }] })
    await source.clearLookup('{ABC}', 'cr40f_motorista')
    expect(request.mock.calls.at(-1)).toEqual(['cr40f_reservadeveculoses(abc)/cr40f_Motorista/$ref', { method: 'DELETE' }])
  })
  it('URLs do voucher e da Escala FDS; formulário fora do model-driven abre no shell (não em outra aba)', async () => {
    const source = createSource(fakeHost().host)
    expect(source.openVoucher(['a'])).toMatch(/^https:\/\/org\.crm\.dynamics\.com\/WebResources\/cr40f_VoucherConfirmacao\.html\?ids=%5B%22a%22%5D&cacheBust=\d+$/)
    expect(source.escalaFdsUrl()).toBe('https://org.crm.dynamics.com/WebResources/cr40f_EscalaFDS.html')
    const open = vi.fn()
    vi.stubGlobal('open', open)
    expect(await source.openForm('edit', 'x1')).toBe('external')
    expect(open).not.toHaveBeenCalled()
    const url = source.formUrl('edit', 'x1')!
    expect(url.startsWith('https://org.crm.dynamics.com/WebResources/new_formulario_geral.html?data=')).toBe(true)
    expect(url.endsWith('&host=shell')).toBe(true)
    expect(JSON.parse(decodeURIComponent(new URL(url).searchParams.get('data')!))).toEqual({ mode: 'edit', entityName: 'cr40f_reservadeveculos', id: 'x1', recordId: 'x1', entityId: 'x1' })
    vi.unstubAllGlobals()
  })
  it('copyRows devolve na ordem dos ids pedidos', async () => {
    const { host } = fakeHost({ getAll: async () => [{ cr40f_reservadeveculosid: 'B-2', cr40f_id: 'OS-2' }, { cr40f_reservadeveculosid: 'a-1', cr40f_id: 'OS-1' }] })
    const rows = await createSource(host).copyRows(['{A-1}', 'b-2', 'sem-linha'])
    expect(rows.map((r) => r.cr40f_id)).toEqual(['OS-1', 'OS-2'])
  })
})

describe('mock — releitura com chave de lookup', () => {
  it('reload com _x_value devolve o lookup e o nome formatado', async () => {
    const source = createSource({ mode: 'mock' })
    const views = await source.views()
    const first = (await source.page({ fetchxml: views[0].fetchxml, page: 1, cookie: null, sort: null, query: '', quickFind: [] })).rows[0]
    const fresh = await source.reload(String(first.cr40f_reservadeveculosid), ['cr40f_id', '_cr40f_cliente_value'])
    expect(fresh._cr40f_cliente_value).toBe(first._cr40f_cliente_value)
  })
})

describe('mock: filtros por coluna', () => {
  const now = new Date('2026-10-08T12:00:00Z') // quinta-feira; semana de 05/10 a 11/10 em São Paulo
  const rows = createMockRows(now)
  const agenda = createMockViews()[0].fetchxml
  const runAt = (at: Date, base: typeof rows, filters: FilterSet, extra: { query?: string; quickFind?: string[] } = {}) =>
    applyMockFetch(base, injectTableFilters(agenda, fromLegacy(filters, MOCK_ATTRIBUTES), geralFilterFields(MOCK_ATTRIBUTES)), { page: 1, pageSize: 1000, sort: null, query: extra.query ?? '', quickFind: extra.quickFind ?? [], now: at })
  const run = (filters: FilterSet) => runAt(now, rows, filters).rows
  type R = (typeof rows)[number]
  const day = (r: R) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(String(r.cr40f_dataehorriodesada)))
  const cotacao = (r: R) => r.cr40f_cotao as number

  it('sem filtros devolve a visão inteira', () => {
    expect(run({})).toHaveLength(MOCK_ROW_COUNT)
  })
  it('texto: contains, not-contains, begins, eq, empty e not-empty', () => {
    const gru = run({ cr40f_trajeto: { kind: 'text', op: 'contains', value: 'gru' } })
    expect(gru.length).toBeGreaterThan(0)
    expect(gru.every((r) => String(r.cr40f_trajeto).toLowerCase().includes('gru'))).toBe(true)
    const sem = run({ cr40f_trajeto: { kind: 'text', op: 'not-contains', value: 'GRU' } })
    expect(sem.every((r) => !String(r.cr40f_trajeto).toLowerCase().includes('gru'))).toBe(true)
    expect(gru.length + sem.length).toBe(MOCK_ROW_COUNT)
    expect(run({ cr40f_trajeto: { kind: 'text', op: 'begins', value: 'GRU' } }).every((r) => String(r.cr40f_trajeto).startsWith('GRU'))).toBe(true)
    expect(run({ cr40f_id: { kind: 'text', op: 'eq', value: 'OS-1013' } }).map((r) => r.cr40f_id)).toEqual(['OS-1013'])
    const vazias = run({ cr40f_observaointerna: { kind: 'text', op: 'empty' } })
    const cheias = run({ cr40f_observaointerna: { kind: 'text', op: 'not-empty' } })
    expect(vazias.every((r) => r.cr40f_observaointerna == null)).toBe(true)
    expect(cheias.length).toBeGreaterThan(0)
    expect(vazias.length + cheias.length).toBe(MOCK_ROW_COUNT)
  })
  it('texto: not-like não devolve vazios, como no SQL', () => {
    expect(run({ cr40f_observaointerna: { kind: 'text', op: 'not-contains', value: 'placa' } })).toHaveLength(0)
    const outros = run({ cr40f_observaointerna: { kind: 'text', op: 'not-contains', value: 'zzz' } })
    expect(outros.length).toBeGreaterThan(0)
    expect(outros.every((r) => r.cr40f_observaointerna != null)).toBe(true)
  })
  it('texto: curingas escapados viram literais', () => {
    expect(run({ cr40f_trajeto: { kind: 'text', op: 'contains', value: 'GRU _ Hotel' } })).toHaveLength(0)
    expect(run({ cr40f_trajeto: { kind: 'text', op: 'contains', value: '→' } }).length).toBeGreaterThan(0)
    expect(run({ cr40f_trajeto: { kind: 'text', op: 'contains', value: '%' } })).toHaveLength(0)
    expect(run({ cr40f_trajeto: { kind: 'text', op: 'contains', value: '[' } })).toHaveLength(0)
  })
  it('choice e lookup: in e empty', () => {
    const status = run({ cr40f_status: { kind: 'choice', op: 'in', values: [202410001, 202410005] } })
    expect(status.length).toBeGreaterThan(0)
    expect(status.every((r) => [202410001, 202410005].includes(r.cr40f_status as number))).toBe(true)
    const withDriver = rows.find((r) => r._cr40f_motorista_value)!
    const one = run({ cr40f_motorista: { kind: 'lookup', op: 'in', values: [{ id: String(withDriver._cr40f_motorista_value).toUpperCase(), nome: 'x' }] } })
    expect(one.length).toBeGreaterThan(0)
    expect(one.every((r) => r._cr40f_motorista_value === withDriver._cr40f_motorista_value)).toBe(true)
    const sem = run({ cr40f_motorista: { kind: 'lookup', op: 'empty' } })
    expect(sem.length).toBeGreaterThan(0)
    expect(sem.every((r) => r._cr40f_motorista_value == null)).toBe(true)
    const ids = [...new Set(rows.map((r) => r._cr40f_motorista_value).filter(Boolean))].map((id) => ({ id: String(id), nome: '' }))
    expect(sem.length + run({ cr40f_motorista: { kind: 'lookup', op: 'in', values: ids } }).length).toBe(MOCK_ROW_COUNT)
  })
  it('data: hoje, amanhã, ontem, esta semana, este mês, próximos e últimos 7 dias', () => {
    const only = (op: 'today' | 'tomorrow' | 'yesterday' | 'this-week' | 'this-month' | 'next-7' | 'last-7') => run({ cr40f_dataehorriodesada: { kind: 'date', op } }).map(day)
    expect(new Set(only('today'))).toEqual(new Set(['2026-10-08']))
    expect(new Set(only('tomorrow'))).toEqual(new Set(['2026-10-09']))
    expect(new Set(only('yesterday'))).toEqual(new Set(['2026-10-07']))
    const week = only('this-week')
    expect(week.length).toBe(rows.filter((r) => day(r) >= '2026-10-05' && day(r) <= '2026-10-11').length)
    expect(week.every((d) => d >= '2026-10-05' && d <= '2026-10-11')).toBe(true)
    expect(only('this-month').length).toBe(rows.filter((r) => day(r).startsWith('2026-10')).length)
    const next = only('next-7')
    expect(next.length).toBe(rows.filter((r) => day(r) >= '2026-10-08' && day(r) <= '2026-10-15').length)
    const last = only('last-7')
    expect(last.length).toBe(rows.filter((r) => day(r) >= '2026-10-01' && day(r) <= '2026-10-08').length)
    expect(next.length).toBeGreaterThan(0)
    expect(last.length).toBeGreaterThan(0)
  })
  it('data: semana vai de segunda a domingo e intervalo usa o dia de São Paulo', () => {
    const sunday = new Date('2026-10-11T12:00:00Z')
    const monday = new Date('2026-10-12T12:00:00Z')
    const base = createMockRows(sunday)
    const weekOf = (at: Date) => runAt(at, base, { cr40f_dataehorriodesada: { kind: 'date', op: 'this-week' } }).rows.map(day)
    const onSunday = weekOf(sunday)
    expect(onSunday.length).toBeGreaterThan(0)
    expect(onSunday.every((d) => d >= '2026-10-05' && d <= '2026-10-11')).toBe(true)
    const onMonday = weekOf(monday)
    expect(onMonday.length).toBeGreaterThan(0)
    expect(onMonday.every((d) => d >= '2026-10-12' && d <= '2026-10-18')).toBe(true)
    const ranged = run({ cr40f_dataehorriodesada: { kind: 'date', op: 'range', from: '2026-10-08', to: '2026-10-09' } })
    expect(new Set(ranged.map(day))).toEqual(new Set(['2026-10-08', '2026-10-09']))
    expect(run({ cr40f_dataehorriodesada: { kind: 'date', op: 'range', from: '2026-10-20' } }).every((r) => day(r) >= '2026-10-20')).toBe(true)
    expect(run({ cr40f_dataehorriodesada: { kind: 'date', op: 'range', to: '2026-10-07' } }).every((r) => day(r) <= '2026-10-07')).toBe(true)
    expect(run({ cr40f_dataehorriodesada: { kind: 'date', op: 'empty' } })).toHaveLength(0)
  })
  it('número: eq, ge, le, between e empty', () => {
    expect(run({ cr40f_cotao: { kind: 'number', op: 'eq', value: 347.5 } }).map(cotacao)).toEqual([347.5])
    const ge = run({ cr40f_cotao: { kind: 'number', op: 'ge', value: 5000 } })
    expect(ge.length).toBeGreaterThan(0)
    expect(ge.every((r) => cotacao(r) >= 5000)).toBe(true)
    const le = run({ cr40f_cotao: { kind: 'number', op: 'le', value: 5000 } })
    expect(le.every((r) => cotacao(r) <= 5000)).toBe(true)
    expect(ge.length + le.length).toBeGreaterThanOrEqual(MOCK_ROW_COUNT)
    const between = run({ cr40f_cotao: { kind: 'number', op: 'between', value: 1000, to: 2000 } })
    expect(between.length).toBeGreaterThan(0)
    expect(between.every((r) => cotacao(r) >= 1000 && cotacao(r) <= 2000)).toBe(true)
    expect(run({ cr40f_cotao: { kind: 'number', op: 'empty' } })).toHaveLength(0)
  })
  it('booleano: yes e no', () => {
    const yes = run({ cr40f_receber: { kind: 'bool', op: 'yes' } })
    const no = run({ cr40f_receber: { kind: 'bool', op: 'no' } })
    expect(yes.every((r) => r.cr40f_receber === true)).toBe(true)
    expect(no.every((r) => r.cr40f_receber === false)).toBe(true)
    expect(no.length).toBeGreaterThan(0)
    expect(yes.length + no.length).toBe(MOCK_ROW_COUNT)
  })
  it('combina filtros (and) com a busca por palavra-chave e a contagem', () => {
    const combined = run({ cr40f_receber: { kind: 'bool', op: 'yes' }, cr40f_trajeto: { kind: 'text', op: 'contains', value: 'GRU' } })
    expect(combined.length).toBeGreaterThan(0)
    expect(combined.every((r) => r.cr40f_receber === true && String(r.cr40f_trajeto).includes('GRU'))).toBe(true)
    const searched = runAt(now, rows, { cr40f_receber: { kind: 'bool', op: 'yes' } }, { query: 'OS-101', quickFind: ['cr40f_id'] })
    expect(searched.rows.length).toBeGreaterThan(0)
    expect(searched.rows.every((r) => r.cr40f_receber === true && String(r.cr40f_id).includes('OS-101'))).toBe(true)
    expect(searched.total).toBe(searched.rows.length)
  })
})

describe('comandos (caminhos e fonte)', () => {
  it('caminhos de variável de ambiente e contagem', async () => {
    const { envVarDefaultPath, envVarPath, contagemPath, motoristasPath } = await import('./queries')
    expect(decodeURIComponent(envVarPath("new_Flow'X"))).toBe("environmentvariablevalues?$select=value&$expand=EnvironmentVariableDefinitionId($select=schemaname)&$filter=EnvironmentVariableDefinitionId/schemaname eq 'new_Flow''X'")
    expect(decodeURIComponent(envVarDefaultPath('new_FlowUrlCriarOP'))).toBe("environmentvariabledefinitions?$select=defaultvalue&$filter=schemaname eq 'new_FlowUrlCriarOP'")
    const path = decodeURIComponent(contagemPath('cr40f_reservadeveculoses', '2026-10-08T03:00:00.000Z', '2026-10-09T03:00:00.000Z'))
    expect(path).toContain('_cr40f_motorista_value ne null and cr40f_dataehorriodesada ge 2026-10-08T03:00:00.000Z and cr40f_dataehorriodesada lt 2026-10-09T03:00:00.000Z')
    expect(path).toContain('$orderby=cr40f_dataehorriodesada asc')
    expect(motoristasPath('cr40f_funcionarioses')).toContain('cr40f_funcao')
  })
  it('flowUrl: valor, depois padrão, depois null', async () => {
    const make = (answers: unknown[][]) => {
      const request = vi.fn(async () => ({ value: answers.shift() ?? [] }))
      const host = { mode: 'dataverse', clientUrl: 'https://org.crm.dynamics.com', insideModelDriven: false, client: { request }, metadata: {} } as unknown as Host
      return { source: createSource(host), request }
    }
    const a = make([[{ value: ' https://flow/a ' }]])
    expect(await a.source.flowUrl('s')).toBe('https://flow/a')
    expect(a.request).toHaveBeenCalledTimes(1)
    expect(await make([[], [{ defaultvalue: 'https://flow/d' }]]).source.flowUrl('s')).toBe('https://flow/d')
    expect(await make([[], []]).source.flowUrl('s')).toBeNull()
  })
  it('triggerFlow faz POST JSON e devolve o status', async () => {
    const fetchMock = vi.fn(async () => ({ status: 202 }))
    vi.stubGlobal('fetch', fetchMock)
    try {
      const host = { mode: 'dataverse', clientUrl: 'https://org', insideModelDriven: false } as unknown as Host
      expect(await createSource(host).triggerFlow('https://flow/x', { guids: ['a'] })).toEqual({ status: 202 })
      expect(fetchMock).toHaveBeenCalledWith('https://flow/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"guids":["a"]}' })
    } finally { vi.unstubAllGlobals() }
  })
  it('mock: flowUrl, triggerFlow, programar parcial e contagem', async () => {
    const source = createSource({ mode: 'mock' }, { latency: 0 })
    expect(await source.flowUrl('x')).toBe('https://flow.mock/op')
    expect(await source.triggerFlow('u', {})).toEqual({ status: 202 })
    const page = await source.page({ fetchxml: createMockViews()[0].fetchxml, page: 1, cookie: null, sort: null, query: '', quickFind: [] })
    const ruim = page.rows.find((r) => r.cr40f_id === 'OS-1013')
    const bom = page.rows.find((r) => r.cr40f_id !== 'OS-1013')
    expect(ruim && bom).toBeTruthy()
    const ids = [String(bom!.cr40f_reservadeveculosid), String(ruim!.cr40f_reservadeveculosid)]
    const result = await source.programar(ids)
    expect(result.ok).toEqual([ids[0]])
    expect(result.failed).toEqual([{ id: ids[1], message: 'Sem permissão para alterar este serviço.' }])
    const reloaded = await source.reload(ids[0], ['cr40f_status'])
    expect(reloaded.cr40f_status).toBe(202410005)
    expect(reloaded.new_foiprogramado).toBe(true)
    expect(await source.openAuditoria(ids)).toBe('mock')
    expect(source.auditoriaUrl(ids)).toBeNull()
    expect(await source.openErroOperacional(ids[0])).toBe('mock')
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
    const dia = await source.contagem(hoje)
    expect(dia.motoristas).toHaveLength(4)
    expect(dia.reservas.length).toBeGreaterThan(0)
    expect(dia.reservas.every((r) => r._cr40f_motorista_value)).toBe(true)
  })
  it('mock: OS-1004 já tem OP', () => {
    const row = createMockRows(new Date('2026-10-08T12:00:00Z')).find((r) => r.cr40f_id === 'OS-1004')
    expect(row?._cr40f_financeiro_value).toBeTruthy()
  })
  it('openAuditoria e openErroOperacional fora do model-driven devolvem external', async () => {
    const host = {
      mode: 'dataverse', clientUrl: 'https://org.crm.dynamics.com', insideModelDriven: false,
      metadata: { entities: async () => new Map([['cr40f_reservadeveculos', { entitySetName: 'cr40f_reservadeveculoses' }]]) },
    } as unknown as Host
    const open = vi.fn()
    vi.stubGlobal('open', open)
    try {
      const source = createSource(host)
      const id = 'ABCDEF01-2345-4678-89AB-CDEF01234567'
      expect(await source.openAuditoria([id])).toBe('external')
      const url = source.auditoriaUrl([id])!
      expect(url.startsWith('https://org.crm.dynamics.com/WebResources/new_betinhos_AuditoriaViewer?data=')).toBe(true)
      expect(JSON.parse(decodeURIComponent(url.split('data=')[1]))).toMatchObject({ entitySetName: 'cr40f_reservadeveculoses', validIds: [id.toLowerCase()] })
      expect(await source.openErroOperacional(id)).toBe('external')
      expect(open.mock.calls[0][0]).toBe('https://org.crm.dynamics.com/WebResources/new_gestao_erros_operacionais.html?data=reservaId%3Dabcdef01-2345-4678-89ab-cdef01234567')
    } finally { vi.unstubAllGlobals() }
  })
})
