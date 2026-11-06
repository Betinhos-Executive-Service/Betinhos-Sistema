import { describe, expect, it, vi } from 'vitest'
import { chunk, createClient, createMetadata, createXrmShim, formatted, reportingFetch } from './index'

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init })
}

describe('format', () => {
  it('divide em blocos preservando a ordem', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([], 10)).toEqual([])
  })

  it('prefere o valor formatado e cai no valor cru', () => {
    const row = { status: 2, 'status@OData.Community.Display.V1.FormattedValue': 'Confirmado', nome: 'Ana' }
    expect(formatted(row, 'status')).toBe('Confirmado')
    expect(formatted(row, 'nome')).toBe('Ana')
    expect(formatted(row, 'ausente')).toBe('')
  })
})

describe('client', () => {
  it('segue o nextLink até o fim', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ value: [{ id: 1 }], '@odata.nextLink': 'https://org.example/api/data/v9.2/contas?$skiptoken=x' }))
      .mockResolvedValueOnce(json({ value: [{ id: 2 }] }))
    const client = createClient('https://org.example/', fetchMock)
    expect(await client.getAll('contas?$select=id')).toEqual([{ id: 1 }, { id: 2 }])
    expect(fetchMock.mock.calls[0][0]).toBe('https://org.example/api/data/v9.2/contas?$select=id')
    expect(fetchMock.mock.calls[1][0]).toBe('https://org.example/api/data/v9.2/contas?$skiptoken=x')
  })

  it('pede só as anotações lidas pelas telas, com o tamanho de página quando informado', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ value: [] }))
    const client = createClient('https://org.example', fetchMock)
    await client.request('contas?$select=id', { maxPageSize: 100 })
    const prefer = (fetchMock.mock.calls[0][1] as { headers: Record<string, string> }).headers.Prefer
    expect(prefer).toBe('odata.include-annotations="OData.Community.Display.V1.FormattedValue,Microsoft.Dynamics.CRM.fetchxmlpagingcookie,Microsoft.Dynamics.CRM.morerecords,Microsoft.Dynamics.CRM.totalrecordcount",odata.maxpagesize=100')
  })

  it('update usa PATCH com If-Match * para nunca virar upsert', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    await createClient('https://org.example', fetchMock).update('contas', '{ABC}', { nome: 'x' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://org.example/api/data/v9.2/contas(abc)')
    expect(init.method).toBe('PATCH')
    expect(init.headers['If-Match']).toBe('*')
  })
  it('expõe a mensagem de erro do Dataverse', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ error: { message: 'Coluna inexistente' } }, { status: 400 }))
    await expect(createClient('https://org.example', fetchMock).request('contas')).rejects.toMatchObject({ message: 'Coluna inexistente', status: 400 })
  })

  it('devolve o id criado a partir do cabeçalho OData-EntityId', async () => {
    const id = '0F8FAD5B-D9CB-469F-A165-70867728950E'
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204, headers: { 'OData-EntityId': `https://org.example/api/data/v9.2/contas(${id})` } }))
    expect(await createClient('https://org.example', fetchMock).create('contas', { nome: 'x' })).toBe(id.toLowerCase())
  })
})

describe('xrm shim', () => {
  it('resolve o entity set pela metadata, com cache, e devolve entities/nextLink', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('EntityDefinitions')) return json({ LogicalName: 'cr40f_reserva', EntitySetName: 'cr40f_reservas' })
      return json({ value: [{ a: 1 }], '@odata.nextLink': 'https://org.example/next' })
    })
    const xrm = createXrmShim(createClient('https://org.example', fetchMock as unknown as typeof fetch), 'https://org.example')
    const page = await xrm.WebApi!.retrieveMultipleRecords('cr40f_reserva', '?$select=a', 50)
    expect(page).toEqual({ entities: [{ a: 1 }], nextLink: 'https://org.example/next' })
    expect(fetchMock.mock.calls[1][0]).toBe('https://org.example/api/data/v9.2/cr40f_reservas?$select=a')
    await xrm.WebApi!.retrieveMultipleRecords('cr40f_reserva')
    expect(fetchMock.mock.calls.filter(([url]) => url.includes('EntityDefinitions'))).toHaveLength(1)
    expect(xrm.Utility!.getGlobalContext().getClientUrl()).toBe('https://org.example')
  })

  it('repassa o cookie de paginação do FetchXML (telas com views só carregavam a 1ª página)', async () => {
    const cookie = '<cookie pagenumber="2" pagingcookie="%253ccookie" />'
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('EntityDefinitions')) return json({ LogicalName: 'cr40f_reserva', EntitySetName: 'cr40f_reservas' })
      return json({ value: [{ a: 1 }], '@Microsoft.Dynamics.CRM.fetchxmlpagingcookie': cookie })
    })
    const xrm = createXrmShim(createClient('https://org.example', fetchMock as unknown as typeof fetch), 'https://org.example')
    const page = await xrm.WebApi!.retrieveMultipleRecords('cr40f_reserva', '?fetchXml=%3Cfetch%2F%3E')
    expect(page.fetchXmlPagingCookie).toBe(cookie)
  })

  it('executa Custom API sem vínculo por POST e devolve o erro do servidor como Response', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json({ error: { message: 'Veículo sem motorista.' } }, { status: 400 }))
    const xrm = createXrmShim(createClient('https://org.example', fetchMock as unknown as typeof fetch), 'https://org.example')
    const request = (operationName: string) => ({ new_VeiculoId: 'abc', getMetadata: () => ({ boundParameter: null, operationType: 0, operationName, parameterTypes: { new_VeiculoId: {} } }) })
    const ok = await xrm.WebApi!.online!.execute(request('new_SolicitarChecklistVeiculo'))
    expect(ok.ok).toBe(true)
    expect(fetchMock.mock.calls[0][0]).toBe('https://org.example/api/data/v9.2/new_SolicitarChecklistVeiculo')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ new_VeiculoId: 'abc' })
    const failed = await xrm.WebApi!.online!.execute(request('new_SolicitarChecklistVeiculo'))
    expect(failed.status).toBe(400)
    expect((await failed.json()).error.message).toContain('Veículo sem motorista.')
  })

  it('executeMultiple manda os Updates num changeset de $batch e rejeita se o changeset falhar', async () => {
    // Como no DEV: changeset com falha devolve o status do erro no $batch inteiro, com o JSON dentro do multipart.
    const multipart = (text: string, status = 200) => new Response(text, { status, headers: { 'Content-Type': 'multipart/mixed; boundary=batchresponse_x' } })
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('EntityDefinitions')) return json({ LogicalName: 'new_checklistmodelo', EntitySetName: 'new_checklistmodelos' })
      return fetchMock.mock.calls.filter(([u]) => u.endsWith('$batch')).length === 1
        ? multipart('--batchresponse_x\r\nHTTP/1.1 204 No Content\r\n\r\n--x\r\nHTTP/1.1 204 No Content\r\n')
        : multipart('--batchresponse_x\r\nHTTP/1.1 404 Not Found\r\nContent-Type: application/json\r\n\r\n{"error":{"code":"0x80040217","message":"Entity \'new_ChecklistModelo\' With Id = bbb Does Not Exist"}}\r\n', 404)
    })
    const xrm = createXrmShim(createClient('https://org.example', fetchMock as unknown as typeof fetch), 'https://org.example')
    const update = (id: string, payload: Record<string, unknown>) => ({ etn: 'new_checklistmodelo', id, payload, getMetadata: () => ({ boundParameter: null, operationType: 2, operationName: 'Update', parameterTypes: {} }) })
    const changeset = [update('{AAA}', { new_padraoquinzenal: false }), update('bbb', { new_padraoquinzenal: true })]

    const responses = await xrm.WebApi!.online!.executeMultiple!([changeset])
    expect(responses.map((r) => r.status)).toEqual([204, 204])
    const [url, init] = fetchMock.mock.calls.find(([u]) => u.endsWith('$batch'))! as unknown as [string, RequestInit & { headers: Record<string, string> }]
    expect(url).toBe('https://org.example/api/data/v9.2/$batch')
    const boundary = /boundary=(\S+)/.exec(init.headers['Content-Type'])![1]
    const body = String(init.body)
    expect(body.startsWith(`--${boundary}\r\nContent-Type: multipart/mixed; boundary=changeset_`)).toBe(true)
    expect(body).toContain('PATCH https://org.example/api/data/v9.2/new_checklistmodelos(aaa) HTTP/1.1\r\nContent-Type: application/json\r\nIf-Match: *\r\n\r\n{"new_padraoquinzenal":false}')
    expect(body).toContain('Content-ID: 2\r\n\r\nPATCH https://org.example/api/data/v9.2/new_checklistmodelos(bbb) HTTP/1.1')
    expect(body.endsWith(`--${boundary}--\r\n`)).toBe(true)

    await expect(xrm.WebApi!.online!.executeMultiple!([changeset])).rejects.toMatchObject({ message: "Entity 'new_ChecklistModelo' With Id = bbb Does Not Exist", status: 404 })
    const create = { ...update('ccc', {}), getMetadata: () => ({ boundParameter: null, operationType: 2, operationName: 'Create', parameterTypes: {} }) }
    await expect(xrm.WebApi!.online!.executeMultiple!([[create]])).rejects.toThrow('só aceita Update: Create')
  })
})

describe('metadata.choices', () => {
  it('lê as opções reais da coluna e guarda em cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({
      OptionSet: { Options: [
        { Value: 202410001, Label: { UserLocalizedLabel: { Label: 'Confirmado' } } },
        { Value: 202410008, Label: { UserLocalizedLabel: null } },
      ] },
    }))
    const metadata = createMetadata(createClient('https://org.example', fetchMock))
    const options = await metadata.choices('cr40f_reservadeveculos', 'cr40f_status')
    expect(options).toEqual([{ value: 202410001, label: 'Confirmado' }, { value: 202410008, label: '202410008' }])
    await metadata.choices('cr40f_reservadeveculos', 'cr40f_status')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe("https://org.example/api/data/v9.2/EntityDefinitions(LogicalName='cr40f_reservadeveculos')/Attributes(LogicalName='cr40f_status')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options)")
  })
})

describe('metadata.choices: cor cadastrada', () => {
  it('traz a cor hex da choice e ignora ausente ou inválida', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({
      OptionSet: { Options: [
        { Value: 1, Color: '#16A34A', Label: { UserLocalizedLabel: { Label: 'A' } } },
        { Value: 2, Color: null, Label: { UserLocalizedLabel: { Label: 'B' } } },
        { Value: 3, Color: 'verde', Label: { UserLocalizedLabel: { Label: 'C' } } },
      ] },
    }))
    const options = await createMetadata(createClient('https://org.example', fetchMock)).choices('cr40f_reservadeveculos', 'cr40f_tipodeveiculo')
    expect(options).toEqual([{ value: 1, label: 'A', color: '#16A34A' }, { value: 2, label: 'B' }, { value: 3, label: 'C' }])
  })
})

describe('metadata attributes', () => {
  it('lê tipo, rótulo, updatable e alvos de lookup em duas chamadas', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ value: [
        { LogicalName: 'cr40f_status', AttributeType: 'Picklist', IsValidForUpdate: true, DisplayName: { UserLocalizedLabel: { Label: 'Status de Operação' } } },
        { LogicalName: 'cr40f_motorista', AttributeType: 'Lookup', IsValidForUpdate: true, DisplayName: { UserLocalizedLabel: { Label: 'Motorista' } } },
        { LogicalName: 'cr40f_id', AttributeType: 'String', IsValidForUpdate: false, DisplayName: { UserLocalizedLabel: null } },
      ] }))
      .mockResolvedValueOnce(json({ value: [{ LogicalName: 'cr40f_motorista', Targets: ['cr40f_funcionarios'] }] }))
    const meta = createMetadata(createClient('https://org.example', fetchMock))
    const list = await meta.attributes('cr40f_reservadeveculos')
    expect(list).toEqual([
      { logicalName: 'cr40f_status', type: 'Picklist', label: 'Status de Operação', updatable: true, targets: [] },
      { logicalName: 'cr40f_motorista', type: 'Lookup', label: 'Motorista', updatable: true, targets: ['cr40f_funcionarios'] },
      { logicalName: 'cr40f_id', type: 'String', label: 'cr40f_id', updatable: false, targets: [] },
    ])
    expect(fetchMock.mock.calls[0][0]).toContain("EntityDefinitions(LogicalName='cr40f_reservadeveculos')/Attributes?$select=LogicalName,AttributeType,DisplayName,IsValidForUpdate")
    expect(fetchMock.mock.calls[1][0]).toContain('/Attributes/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=LogicalName,Targets')
    // segunda leitura vem do cache
    await meta.attributes('cr40f_reservadeveculos')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('expõe o nome primário da tabela', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ LogicalName: 'cr40f_veiculos', EntitySetName: 'cr40f_veiculoses', PrimaryNameAttribute: 'cr40f_placa', DisplayCollectionName: { UserLocalizedLabel: { Label: 'Veículos' } } }))
    const info = await createMetadata(createClient('https://org.example', fetchMock)).entity('cr40f_veiculos')
    expect(info.primaryName).toBe('cr40f_placa')
    expect(fetchMock.mock.calls[0][0]).toContain('PrimaryNameAttribute')
  })

  it('expõe o ObjectTypeCode da tabela (null quando a metadata não traz)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ LogicalName: 'cr40f_reservadeveculos', EntitySetName: 'cr40f_reservadeveculoses', ObjectTypeCode: 10580 }))
      .mockResolvedValueOnce(json({ LogicalName: 'cr40f_outra', EntitySetName: 'cr40f_outras' }))
    const meta = createMetadata(createClient('https://org.example', fetchMock))
    expect((await meta.entity('cr40f_reservadeveculos')).objectTypeCode).toBe(10580)
    expect(fetchMock.mock.calls[0][0]).toContain('ObjectTypeCode')
    expect((await meta.entity('cr40f_outra')).objectTypeCode).toBeNull()
  })
})

describe('reportingFetch', () => {
  it('avisa erro HTTP com status e corpo, ignora 404 e devolve a resposta intacta', async () => {
    const report = vi.fn()
    const base = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ error: { code: '0x1', message: 'falhou' } }, { status: 500 }))
      .mockResolvedValueOnce(json({}, { status: 404 }))
      .mockResolvedValueOnce(json({ value: [] }))
    const wrapped = reportingFetch(report, base)
    const response = await wrapped('https://org/api/data/v9.2/contacts', { method: 'post' })
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: { code: '0x1', message: 'falhou' } })
    await wrapped('https://org/api/data/v9.2/contacts(1)')
    await wrapped('https://org/api/data/v9.2/contacts')
    expect(report).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith({ method: 'POST', path: 'https://org/api/data/v9.2/contacts', status: 500, body: { error: { code: '0x1', message: 'falhou' } } })
  })

  it('avisa falha de rede e repassa o erro; cancelamento não é falha', async () => {
    const report = vi.fn()
    const rede = new TypeError('Failed to fetch')
    const base = vi.fn<typeof fetch>().mockRejectedValueOnce(rede).mockRejectedValueOnce(new DOMException('cancelado', 'AbortError'))
    const wrapped = reportingFetch(report, base)
    await expect(wrapped('https://org/api/data/v9.2/WhoAmI')).rejects.toBe(rede)
    await expect(wrapped('https://org/api/data/v9.2/WhoAmI')).rejects.toThrow('cancelado')
    expect(report).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith({ method: 'GET', path: 'https://org/api/data/v9.2/WhoAmI', error: rede })
  })
})

/** Dataverse falso de metadata: cada URL pedida fica registrada; tabelas em `ausentes` não vêm no filtro. */
function metadataFake(options: { ausentes?: string[]; falhas?: number } = {}) {
  const urls: string[] = []
  let falhas = options.falhas ?? 0
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = decodeURIComponent(String(input)).replace('https://org.example/api/data/v9.2/', '')
    urls.push(url)
    await new Promise((resolve) => setTimeout(resolve, 1))
    if (falhas > 0) { falhas -= 1; return json({ error: { message: 'indisponível' } }, { status: 500 }) }
    if (url.startsWith('EntityDefinitions?')) {
      const names = [...url.matchAll(/LogicalName eq '([^']+)'/g)].map((m) => m[1]).filter((name) => !options.ausentes?.includes(name))
      return json({ value: names.map((name) => ({ LogicalName: name, EntitySetName: `${name}s`, PrimaryNameAttribute: 'nome' })) })
    }
    const single = /^EntityDefinitions\(LogicalName='([^']+)'\)\?/.exec(url)
    if (single) return json({ LogicalName: single[1], EntitySetName: `${single[1]}s`, PrimaryNameAttribute: 'nome' })
    if (url.includes('/Attributes/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?')) {
      return json({ value: ['cr40f_a', 'cr40f_b'].map((name, i) => ({ LogicalName: name, OptionSet: { Options: [{ Value: i + 1, Label: { UserLocalizedLabel: { Label: name } } }] } })) })
    }
    return json({ value: [] })
  })
  return { urls, fetchMock, metadata: createMetadata(createClient('https://org.example', fetchMock as unknown as typeof fetch)) }
}

describe('metadata: uma requisição por tabela', () => {
  it('várias chamadas simultâneas da mesma tabela resultam em 1 requisição', async () => {
    const { urls, metadata } = metadataFake()
    const infos = await Promise.all(Array.from({ length: 6 }, () => metadata.entity('cr40f_a')))
    expect(new Set(infos.map((info) => info.entitySetName))).toEqual(new Set(['cr40f_as']))
    expect(urls).toHaveLength(1)
  })

  it('entities() e entity() simultâneos da mesma tabela compartilham a requisição', async () => {
    const { urls, metadata } = metadataFake()
    const [lote, unica] = await Promise.all([metadata.entities(['cr40f_a', 'cr40f_b']), metadata.entity('cr40f_a')])
    expect(lote.get('cr40f_a')?.entitySetName).toBe('cr40f_as')
    expect(unica.logicalName).toBe('cr40f_a')
    expect(urls).toHaveLength(1)
    expect(urls[0]).toContain("LogicalName eq 'cr40f_a'")
  })

  it('entity() depois de entities() e entities() repetido vêm do cache', async () => {
    const { urls, metadata } = metadataFake()
    await metadata.entities(['cr40f_a', 'cr40f_b'])
    await Promise.all([metadata.entities(['cr40f_a']), metadata.entities(['cr40f_b', 'cr40f_a']), metadata.entity('cr40f_b')])
    expect(urls).toHaveLength(1)
  })

  it('entities() só pede as tabelas que ainda faltam', async () => {
    const { urls, metadata } = metadataFake()
    await metadata.entity('cr40f_a')
    const result = await metadata.entities(['cr40f_a', 'cr40f_c'])
    expect([...result.keys()].sort()).toEqual(['cr40f_a', 'cr40f_c'])
    expect(urls).toHaveLength(2)
    expect(urls[1]).toContain("LogicalName eq 'cr40f_c'")
    expect(urls[1]).not.toContain("'cr40f_a'")
  })

  it('tabelas diferentes não colidem', async () => {
    const { metadata } = metadataFake()
    const [a, b] = await Promise.all([metadata.entity('cr40f_a'), metadata.entity('cr40f_b')])
    expect([a.entitySetName, b.entitySetName]).toEqual(['cr40f_as', 'cr40f_bs'])
  })

  it('falha do lote não fica em cache: a próxima chamada tenta de novo', async () => {
    const { urls, metadata } = metadataFake({ falhas: 1 })
    await expect(metadata.entities(['cr40f_a'])).rejects.toThrow()
    expect((await metadata.entity('cr40f_a')).entitySetName).toBe('cr40f_as')
    expect((await metadata.entities(['cr40f_a'])).get('cr40f_a')?.entitySetName).toBe('cr40f_as')
    expect(urls).toHaveLength(2)
  })

  it('quem esperava um lote que falhou refaz a consulta sem herdar o erro', async () => {
    const { metadata } = metadataFake({ falhas: 1 })
    const [lote, unica] = await Promise.allSettled([metadata.entities(['cr40f_a']), metadata.entity('cr40f_a')])
    expect(lote.status).toBe('rejected')
    expect(unica.status).toBe('rejected')
    expect((await metadata.entity('cr40f_a')).entitySetName).toBe('cr40f_as')
  })

  it('tabela inexistente fica fora do resultado e a ausência não é guardada', async () => {
    const { urls, metadata } = metadataFake({ ausentes: ['cr40f_x'] })
    expect([...(await metadata.entities(['cr40f_a', 'cr40f_x'])).keys()]).toEqual(['cr40f_a'])
    expect([...(await metadata.entities(['cr40f_x'])).keys()]).toEqual([])
    expect(urls).toHaveLength(2)
  })

  it('cada instância (usuário ou ambiente) tem o próprio cache', async () => {
    const um = metadataFake()
    const outro = metadataFake()
    await um.metadata.entity('cr40f_a')
    await outro.metadata.entity('cr40f_a')
    expect(um.urls).toHaveLength(1)
    expect(outro.urls).toHaveLength(1)
  })
})

describe('metadata.picklists: todas as choices da tabela numa consulta', () => {
  it('lê as opções de todas as colunas em 1 requisição e abastece choices()', async () => {
    const { urls, metadata } = metadataFake()
    const [lote] = await Promise.all([metadata.picklists('cr40f_t'), metadata.picklists('cr40f_t')])
    expect([...lote.keys()]).toEqual(['cr40f_a', 'cr40f_b'])
    expect(lote.get('cr40f_b')).toEqual([{ value: 2, label: 'cr40f_b' }])
    expect(await metadata.choices('cr40f_t', 'cr40f_a')).toEqual([{ value: 1, label: 'cr40f_a' }])
    expect(urls).toHaveLength(1)
    expect(urls[0]).toContain("EntityDefinitions(LogicalName='cr40f_t')/Attributes/Microsoft.Dynamics.CRM.PicklistAttributeMetadata")
  })

  it('tabelas diferentes não colidem e a falha não fica em cache', async () => {
    const { urls, metadata } = metadataFake({ falhas: 1 })
    await expect(metadata.picklists('cr40f_t')).rejects.toThrow()
    await metadata.picklists('cr40f_t')
    await metadata.picklists('cr40f_u')
    await metadata.picklists('cr40f_t')
    expect(urls).toHaveLength(3)
  })
})
