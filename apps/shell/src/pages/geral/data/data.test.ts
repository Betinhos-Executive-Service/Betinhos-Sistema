// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { Host } from '../../../host'
import { fetchPath, mapViews, parsePage, reloadPath, searchPath } from './queries'
import { applyMockFetch, createMockRows, createMockViews } from './mock'
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
    expect(reloadPath('cr40f_reservadeveculoses', '{ABC}', ['cr40f_id', '_cr40f_motorista_value', 'a_1.new_valortotal'])).toBe('cr40f_reservadeveculoses(abc)?$select=cr40f_reservadeveculosid,cr40f_id,_cr40f_motorista_value')
  })
})

describe('mock', () => {
  it('visões, linhas e fetch simulado', () => {
    const now = new Date('2026-10-08T12:00:00Z')
    const views = createMockViews()
    const rows = createMockRows(now)
    expect(views.find((v) => v.padrao)?.nome).toContain('Agenda')
    expect(rows.length).toBeGreaterThanOrEqual(60)
    const page = applyMockFetch(rows, views[0].fetchxml, { page: 1, pageSize: 50, sort: null, query: '', quickFind: ['cr40f_id'], now })
    expect(page.rows.length).toBe(50)
    expect(page.more).toBe(true)
    expect(page.total).toBe(rows.length)
    const hoje = applyMockFetch(rows, views.find((v) => v.nome === 'Hoje')!.fetchxml, { page: 1, pageSize: 50, sort: null, query: '', quickFind: [], now })
    expect(hoje.rows.every((r) => String(r.cr40f_dataehorriodesada).startsWith('2026-10-08'))).toBe(true)
    const busca = applyMockFetch(rows, views[0].fetchxml, { page: 1, pageSize: 50, sort: null, query: 'OS-10', quickFind: ['cr40f_id'], now })
    expect(busca.rows.every((r) => String(r.cr40f_id).includes('OS-10'))).toBe(true)
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
    expect(semMotorista.total).toBe(12)
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
    const host = {
      mode: 'dataverse', clientUrl: 'https://org.crm.dynamics.com', insideModelDriven: false, appId: async () => undefined,
      client: { request, update, getAll },
      metadata: {
        entities: async () => new Map([['cr40f_reservadeveculos', { entitySetName: 'cr40f_reservadeveculoses' }]]),
        entity: async (name: string) => ({ logicalName: name, entitySetName: `${name}s`, primaryName: overrides.primaryName ?? 'cr40f_nome' }),
        attributes: async () => [
          { logicalName: 'cr40f_status', type: 'Picklist', label: 'Status', updatable: true, targets: [] },
          { logicalName: 'cr40f_receber', type: 'Boolean', label: 'Receber', updatable: true, targets: [] },
          { logicalName: 'cr40f_motorista', type: 'Lookup', label: 'Motorista', updatable: true, targets: ['cr40f_funcionarios'] },
        ],
        choices: async () => [{ value: 1, label: 'Confirmado' }],
      },
    } as unknown as Host
    return { host, request, update, getAll }
  }

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
    expect(url).toContain('count="50"')
    expect(url).toContain('page="2"')
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
  it('URLs do voucher e da Escala FDS; formulário fora do model-driven abre outra aba', async () => {
    const source = createSource(fakeHost().host)
    expect(source.openVoucher(['a'])).toMatch(/^https:\/\/org\.crm\.dynamics\.com\/WebResources\/cr40f_VoucherConfirmacao\.html\?ids=%5B%22a%22%5D&cacheBust=\d+$/)
    expect(source.escalaFdsUrl()).toBe('https://org.crm.dynamics.com/WebResources/cr40f_EscalaFDS.html')
    const open = vi.fn()
    vi.stubGlobal('open', open)
    expect(await source.openForm('edit', 'x1')).toBe('external')
    expect(open).toHaveBeenCalledWith(expect.stringContaining('new_formulario_geral.html?data='), '_blank', 'noopener')
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
