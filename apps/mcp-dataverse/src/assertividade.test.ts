import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataverseSession } from './dataverse'
import { clean, limitJson } from './format'
import { env, json, mockFetch, tokenReply, type Call } from './helpers.test-util'
import { INSTRUCTIONS } from './instrucoes'
import { glossario } from './glossario'
import { AGGREGATE_HINT, EMPTY_FILTER_HINT, FILTER_HELP, cleanExpandChildren, dateOnlyEq, dropCurrencyAux, fetchAttributeMissing, nullColumns, outerWithoutNullCheck, promptSummary, suggest, wrongOperators } from './dicas'
import { columnSchema, validateXml } from './metadata'
import { buildTools, nowInfo, promptInputs, type ToolDef } from './tools'

afterEach(() => vi.unstubAllGlobals())

const tools = () => {
  const session = new DataverseSession(env, 'rt')
  const list = buildTools({ session, identity: { email: 'ana@betinhos.com.br', name: 'Ana' } })
  return (name: string): ToolDef => list.find((t) => t.name === name)!
}
const textOf = (r: { content: { text: string }[] }) => r.content[0].text

const TABELAS = [
  { LogicalName: 'cr40f_clientes1', EntitySetName: 'cr40f_clientes1s', DisplayName: { UserLocalizedLabel: { Label: 'Cliente' } }, IsCustomEntity: true, PrimaryIdAttribute: 'cr40f_clientes1id', PrimaryNameAttribute: 'cr40f_nomedocliente' },
  { LogicalName: 'account', EntitySetName: 'accounts', DisplayName: { UserLocalizedLabel: { Label: 'Conta' } }, IsCustomEntity: false, PrimaryIdAttribute: 'accountid', PrimaryNameAttribute: 'name' },
  { LogicalName: 'cr40f_veiculos', EntitySetName: 'cr40f_veiculoses', DisplayName: { UserLocalizedLabel: { Label: 'Veículos' } }, IsCustomEntity: true, PrimaryIdAttribute: 'cr40f_veiculosid', PrimaryNameAttribute: 'cr40f_placa' },
]

/** Roteador com a metadata de `cr40f_reserva` (um lookup, dois campos obrigatórios); `extra` trata as chamadas de dados. */
const route = (extra?: (c: Call) => Response | undefined) => (call: Call): Response => {
  const u = decodeURIComponent(call.url)
  if (u.includes('login.microsoftonline.com')) return tokenReply()
  const base = "EntityDefinitions(LogicalName='cr40f_reserva')"
  if (u.includes(base)) {
    if (call.method !== 'GET') {
      const written = extra?.(call)
      if (written) return written
    }
    // Sondas baratas de 1 coluna (Attributes(LogicalName='x')/...): lookup, choice e tipo.
    const probe = u.match(/\/Attributes\(LogicalName='([^']+)'\)(?:\/Microsoft\.Dynamics\.CRM\.(\w+))?/)
    if (probe) {
      const [, col, cast] = probe
      const notFound = json({ error: { code: '0x80060888', message: 'não é desse tipo' } }, 404)
      if (cast === 'LookupAttributeMetadata') return col === 'cr40f_cliente' ? json({ LogicalName: col, Targets: ['cr40f_clientes1'] }) : notFound
      if (cast === 'PicklistAttributeMetadata') {
        const label = (Label: string) => ({ UserLocalizedLabel: { Label } })
        return col === 'cr40f_status' ? json({ LogicalName: col, OptionSet: { Options: [{ Value: 100, Label: label('Aberto') }, { Value: 200, Label: label('Fechado') }] } }) : notFound
      }
      if (cast) return notFound
      return json({ AttributeType: col === 'cr40f_valor' ? 'Money' : col === 'cr40f_status' ? 'Picklist' : 'String' })
    }
    if (u.includes('/OneToManyRelationships') && u.includes('IsCustomRelationship')) return json({ value: [{ ReferencingEntity: 'cr40f_outra', ReferencingAttribute: 'cr40f_reserva' }] })
    if (u.includes('/Attributes/Microsoft.Dynamics.CRM.LookupAttributeMetadata')) return json({ value: [{ LogicalName: 'cr40f_cliente', Targets: ['cr40f_clientes1'] }] })
    if (u.includes('/Attributes?')) {
      return json({
        value: [
          { LogicalName: 'cr40f_reservaid', AttributeType: 'Uniqueidentifier', RequiredLevel: { Value: 'SystemRequired' } },
          { LogicalName: 'cr40f_cliente', AttributeType: 'Lookup', DisplayName: { UserLocalizedLabel: { Label: 'Cliente' } }, RequiredLevel: { Value: 'ApplicationRequired' } },
          { LogicalName: 'cr40f_valor', AttributeType: 'Money', RequiredLevel: { Value: 'None' } },
          { LogicalName: 'statecode', AttributeType: 'State', RequiredLevel: { Value: 'SystemRequired' } },
          { LogicalName: 'cr40f_data', AttributeType: 'DateTime', RequiredLevel: { Value: 'ApplicationRequired' } },
          { LogicalName: 'createdon', AttributeType: 'DateTime', RequiredLevel: { Value: 'SystemRequired' }, IsValidForCreate: false },
          { LogicalName: 'ownerid', AttributeType: 'Owner', RequiredLevel: { Value: 'SystemRequired' } },
        ],
      })
    }
    if (u.includes('/ManyToOneRelationships')) {
      return json({ value: [{ SchemaName: 'rel_cliente', ReferencedEntity: 'cr40f_clientes1', ReferencingAttribute: 'cr40f_cliente', ReferencingEntityNavigationPropertyName: 'cr40f_Cliente' }] })
    }
    if (u.includes('/Attributes/') || u.includes('/OneToMany') || u.includes('/ManyToMany') || u.includes('/Keys')) return json({ value: [] })
    return json({ LogicalName: 'cr40f_reserva', EntitySetName: 'cr40f_reservas', PrimaryIdAttribute: 'cr40f_reservaid', PrimaryNameAttribute: 'cr40f_nome', SchemaName: 'cr40f_Reserva' })
  }
  if (u.includes('EntityDefinitions?') && u.includes('IsPrivate')) return json({ value: TABELAS })
  if (u.includes("EntityDefinitions(LogicalName='")) return json({ error: { code: '0x80060888', message: 'não existe' } }, 404)
  if (u.includes('EntityDefinitions?')) return json({ value: [] })
  return extra?.(call) ?? json({ error: { code: '0x1', message: `rota não mockada: ${call.url}` } }, 500)
}

describe('erros que ensinam', () => {
  it('rótulo em vez de nome lógico sugere tabelas parecidas (sem acento)', async () => {
    mockFetch(route())
    const r = await tools()('read_query').handler({ tabela: 'Veículos' })
    expect(r.isError).toBe(true)
    expect(textOf(r)).toMatch(/Tabelas parecidas: cr40f_veiculos \("Veículos"\)/)
    expect(textOf(r)).toMatch(/list_tables\(filtro\)/)
  })

  it('tabela inexistente sugere nomes parecidos', async () => {
    mockFetch(route())
    const r = await tools()('read_query').handler({ tabela: 'cr40f_cliente' })
    expect(textOf(r)).toMatch(/não encontrada/)
    expect(textOf(r)).toMatch(/cr40f_clientes1/)
  })

  it('coluna que é lookup: ensina _x_value e a navegação real', async () => {
    mockFetch(
      route((c) =>
        c.url.includes('/cr40f_reservas') ? json({ error: { code: '0x80060888', message: "Could not find a property named 'cr40f_cliente' on type 'Microsoft.Dynamics.CRM.cr40f_reserva'." } }, 400) : undefined,
      ),
    )
    const t = tools()
    await t('describe_table').handler({ tabela: 'cr40f_reserva' })
    const r = await t('read_query').handler({ tabela: 'cr40f_reserva', select: 'cr40f_cliente' })
    expect(textOf(r)).toMatch(/"cr40f_cliente" é lookup: use _cr40f_cliente_value em select\/filter e cr40f_Cliente\(\$select=colunas\) em expand/)
  })

  it('coluna inexistente: parecidas, coluna principal e describe_table', async () => {
    mockFetch(
      route((c) =>
        c.url.includes('/cr40f_reservas') ? json({ error: { code: '0x80060888', message: "Could not find a property named 'cr40f_valr' on type 'Microsoft.Dynamics.CRM.cr40f_reserva'." } }, 400) : undefined,
      ),
    )
    const t = tools()
    await t('describe_table').handler({ tabela: 'cr40f_reserva' })
    const r = await t('read_query').handler({ tabela: 'cr40f_reserva', select: 'cr40f_valr' })
    expect(textOf(r)).toMatch(/Parecidas: cr40f_valor/)
    expect(textOf(r)).toMatch(/Coluna principal: cr40f_nome/)
    expect(textOf(r)).toMatch(/describe_table\(tabela:"cr40f_reserva", filtroColuna/)
  })

  it('sem metadata em cache a dica de coluna é genérica e não faz as 13 chamadas de describe', async () => {
    const calls = mockFetch(route((c) => (c.url.includes('/cr40f_reservas') ? json({ error: { code: '0x80060888', message: "Could not find a property named 'cr40f_valr' on type 'Microsoft.Dynamics.CRM.cr40f_reserva'." } }, 400) : undefined)))
    const r = await tools()('read_query').handler({ tabela: 'cr40f_reserva', select: 'cr40f_valr' })
    expect(textOf(r)).not.toMatch(/Se for lookup/)
    expect(textOf(r)).toMatch(/não tem a coluna "cr40f_valr"/)
    expect(textOf(r)).toMatch(/Coluna principal: cr40f_nome/)
    expect(calls.some((c) => decodeURIComponent(c.url).includes('/Attributes?'))).toBe(false)
  })

  it('escrita com lookup errado ensina a navegação@odata.bind com o entitySet do alvo', async () => {
    mockFetch(route((c) => (c.method === 'POST' && c.url.includes('/cr40f_reservas') ? json({ error: { code: '0x80060888', message: "Could not find a property named 'cr40f_cliente' on type 'Microsoft.Dynamics.CRM.cr40f_reserva'." } }, 400) : undefined)))
    const t = tools()
    await t('describe_table').handler({ tabela: 'cr40f_reserva' })
    const r = await t('create_record').handler({ tabela: 'cr40f_reserva', dados: { cr40f_cliente: '5d2b2f3a-0000-4000-8000-000000000001' } })
    expect(textOf(r)).toContain('"cr40f_Cliente@odata.bind":"/cr40f_clientes1s(<guid>)"')
    expect(textOf(r)).not.toMatch(/_cr40f_cliente_value/)
  })

  it('propriedade não declarada na escrita também é reconhecida (sem cache: 2 chamadas baratas dão a navegação)', async () => {
    mockFetch(route((c) => (c.method === 'POST' && c.url.includes('/cr40f_reservas') ? json({ error: { code: '0x0', message: "An undeclared property 'cr40f_cliente' which only has property annotations in the payload but no property value was found." } }, 400) : undefined)))
    const r = await tools()('create_record').handler({ tabela: 'cr40f_reserva', dados: { cr40f_cliente: 'x' } })
    expect(textOf(r)).toContain('"cr40f_Cliente@odata.bind":"/cr40f_clientes1s(<guid>)"')
  })

  it('apply agrupando por lookup: dica de FetchXML aggregate, não de _x_value', async () => {
    mockFetch(route((c) => (c.url.includes('/cr40f_reservas') ? json({ error: { code: '0x80041103', message: "'cr40f_Reserva' entity doesn't contain attribute with Name = '_cr40f_cliente_value' and NameMapping = 'Platform'." } }, 400) : undefined)))
    const r = await tools()('read_query').handler({ tabela: 'cr40f_reserva', apply: 'groupby((_cr40f_cliente_value),aggregate($count as total))' })
    expect(textOf(r)).toMatch(/fetchXml: <fetch aggregate="true"><entity name="cr40f_reserva">.*groupby="true".*<order alias="total" descending="true"\/>/)
    expect(textOf(r)).not.toMatch(/use _cr40f_cliente_value em select/)
  })

  it.each(['cr40f_status = 1', 'a == 1', 'a <> 1', 'a != 1', 'a eq 1 && b eq 2'])('filtro %s: dica específica de operadores', async (filter) => {
    mockFetch(route((c) => (c.url.includes('/cr40f_reservas') ? json({ error: { code: '0x1', message: 'Bad request' } }, 400) : undefined)))
    const r = await tools()('read_query').handler({ tabela: 'cr40f_reserva', filter })
    expect(textOf(r)).toMatch(/Use eq\/ne\/and\/or/)
  })

  it('filtro correto com "=" dentro de texto não aciona a dica de operadores', () => {
    expect(wrongOperators("nome eq 'a=b' and x eq 1")).toBe(false)
    expect(wrongOperators('x ge 1')).toBe(false)
  })

  it('erro de sintaxe no filtro acrescenta a dica de operadores', async () => {
    mockFetch(route((c) => (c.url.includes('/cr40f_reservas') ? json({ error: { code: '0x80060888', message: "Syntax error at position 14 in 'cr40f_status = 1'." } }, 400) : undefined)))
    const r = await tools()('read_query').handler({ tabela: 'cr40f_reserva', filter: 'cr40f_status = 1' })
    expect(textOf(r)).toMatch(/Syntax error/)
    expect(textOf(r)).toMatch(/eq ne gt ge lt le/)
    expect(textOf(r)).toMatch(/LastXDays/)
  })

  it('FetchXML malformado é recusado antes de enviar, com a posição', async () => {
    const calls = mockFetch(route())
    const r = await tools()('read_query').handler({ fetchXml: '<fetch><entity name="cr40f_reserva"><attribute name="a"></entity></fetch>' })
    expect(r.isError).toBe(true)
    expect(textOf(r)).toMatch(/FetchXML malformado \(nada foi enviado\).*<attribute>/)
    expect(textOf(r)).toMatch(/linha 1, coluna/)
    expect(calls.some((c) => c.url.includes('fetchXml'))).toBe(false)
  })

  it('Search desativado sugere read_query com contains na coluna principal', async () => {
    mockFetch(route((c) => (c.url.includes('/api/search/') ? json({ error: { code: '0x80048d0b', message: 'Dataverse Search feature is disabled for this organization.' } }, 400) : undefined)))
    const r = await tools()('search').handler({ consulta: "o'brien", tabelas: ['cr40f_reserva'] })
    expect(textOf(r)).toMatch(/desativado/)
    expect(textOf(r)).toMatch(/contains\(cr40f_nome,'o''brien'\)/)
    expect(textOf(r)).toMatch(/cliente = cr40f_clientes1 \/ cr40f_nomedocliente; passageiro = cr40f_bancodedados \/ cr40f_nomedopassageiro/)
  })

  it('GUID inválido mostra o valor recebido (truncado)', async () => {
    mockFetch(route())
    const r = await tools()('fetch').handler({ tabela: 'cr40f_reserva', id: 'abc' })
    expect(textOf(r)).toMatch(/GUID inválido \(recebido "abc"/)
    const long = await tools()('fetch').handler({ tabela: 'cr40f_reserva', id: 'x'.repeat(100) })
    expect(textOf(long)).not.toContain('x'.repeat(41))
  })

  it('remove orgIndex e id da organização da mensagem do Dataverse', async () => {
    mockFetch(route((c) => (c.url.includes('/cr40f_reservas') ? json({ error: { code: '0x1', message: 'Falhou (orgIndex: 12, org id: 7a1b-33) no servidor' } }, 400) : undefined)))
    const r = await tools()('read_query').handler({ tabela: 'cr40f_reserva' })
    expect(textOf(r)).not.toMatch(/orgIndex|org id/i)
    expect(textOf(r)).toMatch(/Falhou/)
  })
})

describe('read_query: resultado', () => {
  it('select + apply: ignora o select e avisa', async () => {
    const calls = mockFetch(route((c) => (c.url.includes('/cr40f_reservas') ? json({ value: [{ total: 3 }] }) : undefined)))
    const r = await tools()('read_query').handler({ tabela: 'cr40f_reserva', select: 'cr40f_valor', apply: 'aggregate($count as total)' })
    const url = decodeURIComponent(calls.find((c) => c.url.includes('/cr40f_reservas'))!.url)
    expect(url).not.toContain('$select')
    expect(url).toContain('$apply=aggregate($count as total)')
    const out = JSON.parse(textOf(r))
    expect(out.value).toEqual([{ total: 3 }])
    expect(out._aviso).toMatch(/select ignorado/)
  })

  it('agregação mantém o grupo nulo como null explícito', async () => {
    mockFetch(route((c) => (c.url.includes('/cr40f_reservas') ? json({ value: [{ cr40f_valor: null, total: 2 }, { cr40f_valor: 5, total: 1 }] }) : undefined)))
    const r = await tools()('read_query').handler({ tabela: 'cr40f_reserva', apply: 'groupby((cr40f_valor),aggregate($count as total))' })
    expect(JSON.parse(textOf(r)).value[0]).toEqual({ cr40f_valor: null, total: 2 })
  })

  it('consulta comum continua omitindo nulos', async () => {
    mockFetch(route((c) => (c.url.includes('/cr40f_reservas') ? json({ value: [{ a: null, b: 1 }] }) : undefined)))
    const r = await tools()('read_query').handler({ tabela: 'cr40f_reserva', select: 'a,b' })
    expect(JSON.parse(textOf(r)).value[0]).toEqual({ b: 1 })
  })

  it('colunas do select nulas em todas as linhas vão em _nulas', async () => {
    mockFetch(route((c) => (c.url.includes('/cr40f_reservas') ? json({ value: [{ a: 1, b: null }, { a: 2 }] }) : undefined)))
    const r = await tools()('read_query').handler({ tabela: 'cr40f_reserva', select: 'a,b' })
    expect(JSON.parse(textOf(r))._nulas).toEqual(['b'])
  })

  it('resultado vazio com filtro traz _dica sobre UTC', async () => {
    mockFetch(route((c) => (c.url.includes('/cr40f_reservas') ? json({ value: [] }) : undefined)))
    const r = await tools()('read_query').handler({ tabela: 'cr40f_reserva', select: 'a', filter: 'a eq 1' })
    expect(JSON.parse(textOf(r))._dica).toMatch(/UTC/)
    const semFiltro = await tools()('read_query').handler({ tabela: 'cr40f_reserva', select: 'a' })
    expect(JSON.parse(textOf(semFiltro))._dica).toBeUndefined()
  })

  it('apply só com filter mantém o select (não é agregação)', async () => {
    const calls = mockFetch(route((c) => (c.url.includes('/cr40f_reservas') ? json({ value: [{ a: 1 }] }) : undefined)))
    const r = await tools()('read_query').handler({ tabela: 'cr40f_reserva', select: 'a', apply: 'filter(a eq 1)' })
    expect(decodeURIComponent(calls.find((c) => c.url.includes('/cr40f_reservas'))!.url)).toContain('$select=a')
    expect(JSON.parse(textOf(r))._aviso).toBeUndefined()
  })

  it('fetch de registro único não emite _nulas', async () => {
    mockFetch(route((c) => (c.url.includes('/cr40f_reservas(') ? json({ a: 1, b: null }) : undefined)))
    const r = await tools()('fetch').handler({ tabela: 'cr40f_reserva', id: '5d2b2f3a-0000-4000-8000-000000000001', colunas: 'a,b' })
    expect(JSON.parse(textOf(r))._nulas).toBeUndefined()
  })

  const xml = '<fetch><entity name="cr40f_reserva"><attribute name="a"/></entity></fetch>'
  it('FetchXML: página cheia sem a anotação não vira maisRegistros false', async () => {
    mockFetch(route((c) => (c.url.includes('fetchXml') ? json({ value: Array.from({ length: 50 }, (_, i) => ({ i })) }) : undefined)))
    const r = await tools()('read_query').handler({ fetchXml: xml })
    expect(JSON.parse(textOf(r)).maisRegistros).toBe(true)
  })

  it('FetchXML agregado sem a anotação morerecords: maisRegistros false mesmo com página cheia', async () => {
    mockFetch(route((c) => (c.url.includes('fetchXml') ? json({ value: Array.from({ length: 50 }, (_, i) => ({ i })) }) : undefined)))
    const agg = '<fetch aggregate="true"><entity name="cr40f_reserva"><attribute name="a" groupby="true" alias="g"/></entity></fetch>'
    expect(JSON.parse(textOf(await tools()('read_query').handler({ fetchXml: agg }))).maisRegistros).toBe(false)
  })

  it('FetchXML: sem _dica de vazio a partir da página 2', async () => {
    mockFetch(route((c) => (c.url.includes('fetchXml') ? json({ value: [] }) : undefined)))
    const f = '<fetch><entity name="cr40f_reserva"><filter><condition attribute="a" operator="eq" value="1"/></filter></entity></fetch>'
    expect(JSON.parse(textOf(await tools()('read_query').handler({ fetchXml: f }))) ._dica).toMatch(/UTC/)
    expect(JSON.parse(textOf(await tools()('read_query').handler({ fetchXml: f, pagina: 2 })))._dica).toBeUndefined()
  })

  it('FetchXML: página incompleta sem anotação e anotação explícita false continuam false', async () => {
    mockFetch(route((c) => (c.url.includes('fetchXml') ? json({ value: [{ i: 1 }] }) : undefined)))
    expect(JSON.parse(textOf(await tools()('read_query').handler({ fetchXml: xml }))).maisRegistros).toBe(false)
  })
})

describe('limitJson', () => {
  it('sem lista para cortar devolve JSON válido com _truncado', () => {
    const out = limitJson({ registro: { memo: 'x'.repeat(5000) } }, 1000)
    expect(out.length).toBeLessThanOrEqual(1000)
    const p = JSON.parse(out)
    expect(p._truncado).toBe(true)
    expect(p._aviso).toMatch(/Refine/)
  })

  it('lista cortada marca maisRegistros true', () => {
    const p = JSON.parse(limitJson({ value: Array.from({ length: 500 }, (_, i) => ({ i, t: 'y'.repeat(50) })), maisRegistros: false }, 2000))
    expect(p._truncado).toBe(true)
    expect(p.maisRegistros).toBe(true)
  })

  it('clean com keepNull preserva null', () => {
    expect(clean({ a: null, b: [{ c: null }] }, true)).toEqual({ a: null, b: [{ c: null }] })
    expect(clean({ a: null })).toEqual({})
  })
})

describe('describe_table', () => {
  it('somenteObrigatorias: só o exigido ao criar, sem chave, estado nem coluna não criável', async () => {
    mockFetch(route())
    const r = await tools()('describe_table').handler({ tabela: 'cr40f_reserva', somenteObrigatorias: true })
    const out = JSON.parse(textOf(r))
    expect(out.colunas.map((c: any) => c.nome).sort()).toEqual(['cr40f_cliente', 'cr40f_data'])
    expect(out.relacoes.muitosParaUm).toHaveLength(1)
    expect(out.relacoes.umParaMuitos).toBeUndefined()
    expect(out.colunas.some((c: any) => c.nome === 'ownerid')).toBe(false)
  })

  it('obrigatórias primeiro, statecode por último e marcado como sistema', async () => {
    mockFetch(route())
    const out = JSON.parse(textOf(await tools()('describe_table').handler({ tabela: 'cr40f_reserva' })))
    const names = out.colunas.map((c: any) => c.nome)
    expect(names.slice(0, 3)).toEqual(['cr40f_reservaid', 'cr40f_cliente', 'cr40f_data'])
    expect(names.indexOf('ownerid')).toBeGreaterThan(names.indexOf('cr40f_data'))
    expect(out.colunas.slice(-2).every((c: any) => c.sistema)).toBe(true)
    expect(out.colunas.find((c: any) => c.nome === 'ownerid').automatico).toBe(true)
  })

  it('filtroColuna também filtra as relações', async () => {
    mockFetch(route())
    const out = JSON.parse(textOf(await tools()('describe_table').handler({ tabela: 'cr40f_reserva', filtroColuna: 'zzz' })))
    expect(out.colunas).toEqual([])
    expect(out.relacoes.muitosParaUm).toEqual([])
    const hit = JSON.parse(textOf(await tools()('describe_table').handler({ tabela: 'cr40f_reserva', filtroColuna: 'cliente' })))
    expect(hit.relacoes.muitosParaUm).toHaveLength(1)
  })

  it('alvoEntitySet entra nos lookups (a lista de tabelas é carregada uma vez e fica em cache)', async () => {
    mockFetch(route())
    const t = tools()
    const out = JSON.parse(textOf(await t('describe_table').handler({ tabela: 'cr40f_reserva', filtroColuna: 'cliente' })))
    expect(out.colunas[0].alvoEntitySet).toBe('cr40f_clientes1s')
  })
})

describe('list_tables', () => {
  it('com filtro, personalizadas antes das de sistema', async () => {
    mockFetch(route())
    const out = JSON.parse(textOf(await tools()('list_tables').handler({ filtro: 'c' })))
    expect(out.itens.map((i: any) => i.nome)).toEqual(['cr40f_clientes1', 'cr40f_veiculos', 'account'])
  })
})

describe('list_prompts', () => {
  it('lê as variáveis de entrada da configuração de execução', async () => {
    mockFetch(
      route((c) => {
        if (c.url.includes('msdyn_aimodels?')) return json({ value: [{ msdyn_aimodelid: '2bcd7b94-50bc-4767-af4a-367c63fb5487', msdyn_name: 'AI Classify', statecode: 0 }] })
        if (c.url.includes('msdyn_aiconfigurations?')) {
          return json({
            value: [
              {
                _msdyn_aimodelid_value: '2bcd7b94-50bc-4767-af4a-367c63fb5487',
                msdyn_customconfiguration: JSON.stringify({ prompt: [{ type: 'literal', text: 'x' }, { type: 'inputVariable', id: 'inputText' }, { type: 'inputVariable', id: 'inputText' }] }),
              },
            ],
          })
        }
        return undefined
      }),
    )
    const out = JSON.parse(textOf(await tools()('list_prompts').handler({})))
    expect(out.itens[0].entradas).toEqual(['inputText'])
  })

  it('promptInputs tolera JSON inválido', () => {
    expect(promptInputs('{{')).toEqual([])
    expect(promptInputs(undefined)).toEqual([])
  })
})

describe('auxiliares', () => {
  it('suggest ignora acento e prefixo do publisher', () => {
    const items = [{ nome: 'cr40f_despesaoperacional', rotulo: 'Despesa Operacional' }, { nome: 'account', rotulo: 'Conta' }]
    expect(suggest('Despesa Operacional', items).map((i) => i.nome)).toEqual(['cr40f_despesaoperacional'])
    expect(suggest('despezaoperacional', items).map((i) => i.nome)).toEqual(['cr40f_despesaoperacional'])
    expect(suggest('xyz', items)).toEqual([])
  })

  it('nullColumns só olha nomes simples e exige linhas', () => {
    expect(nullColumns([], 'a')).toEqual([])
    expect(nullColumns([{ a: 1 }], 'a, b, c($select=x)')).toEqual(['b'])
  })

  it('validateXml aceita XML bom e aponta o defeito', () => {
    expect(validateXml('<?xml version="1.0"?><fetch top="5"><entity name="a"><!-- c --><attribute name="x"/></entity></fetch>')).toBeUndefined()
    expect(validateXml('<fetch><entity name="a">')).toMatch(/<entity> aberta em linha 1.*nunca foi fechada/)
    expect(validateXml('<fetch><entity name=a/></fetch>')).toMatch(/tag malformada/)
    expect(validateXml('<fetch>\n<entity name="a & b"/></fetch>')).toMatch(/"&" sem escape/)
    expect(validateXml('<entity name="a"/>')).toMatch(/raiz.*<fetch>/)
    expect(validateXml('</fetch>')).toMatch(/não tem tag de abertura/)
  })

  it('instruções trazem padrão DEV, PROD com confirmar, fuso e o glossário', () => {
    expect(INSTRUCTIONS).toMatch(/DEV/)
    expect(INSTRUCTIONS).toMatch(/confirmar/)
    expect(INSTRUCTIONS).toMatch(/UTC-3/)
    for (const c of ['cr40f_nomecompleto', 'cr40f_placa', 'cr40f_titulo', 'glossario(termo)', 'cr40f_Passageiro1', 'FetchXML aggregate']) expect(INSTRUCTIONS).toContain(c)
    for (const t of ['cr40f_reservadeveculos', 'cr40f_bancodedados', 'cr40f_clientes1', 'cr40f_funcionarios', 'cr40f_veiculos', 'cr40f_pagantes', 'cr40f_despesaoperacional', 'cr40f_pedidodecotacao']) {
      expect(INSTRUCTIONS).toContain(t)
    }
  })

  it('instruções: choice não é 0/1, status 0 só em funcionários e categoria de despesa', () => {
    expect(INSTRUCTIONS).toMatch(/NÃO é 0\/1/)
    expect(glossario('funcionário')).toMatch(/0 Ativo.*só nesta tabela/)
    expect(glossario('pagante')).toMatch(/202410001 Pendente/)
    expect(glossario('despesa')).toContain('cr40f_categoriadespesaoperacional')
    expect(INSTRUCTIONS).toContain('<link-entity')
  })
})

const GUID = '5d2b2f3a-0000-4000-8000-000000000001'
const RESERVA = `cr40f_reservas(${GUID})`
const PREFIX = "Error identified in Payload provided by the user for Entity :'cr40f_reservas', For more information on this error please follow this help link https://go.microsoft.com/fwlink/?linkid=2195293  ---->  InnerException : Microsoft.OData.ODataException: "
const STACK = "\n   at Microsoft.OData.ODataPayloadValueConverter.ConvertFromPayloadValue(Object value)\n   at Microsoft.Crm.Extensibility.X.Y()"
const writeError = (message: string) => route((c) => (c.method === 'POST' && c.url.includes('/cr40f_reservas') ? json({ error: { code: '0x80048d19', message: PREFIX + message + STACK } }, 400) : undefined))

describe('escrita: veracidade e erros', () => {
  it.each([
    [201, 'criado'],
    [200, 'atualizado'],
    [204, 'gravado (criado ou atualizado)'],
  ])('upsert com status %i diz "%s" e pede return=representation', async (status, resultado) => {
    const calls = mockFetch(route((c) => (c.method === 'PATCH' ? (status === 204 ? new Response(null, { status }) : json({ cr40f_reservaid: GUID }, status, { 'OData-EntityId': `https://dev.crm.test/api/data/v9.2/${RESERVA}` })) : undefined)))
    const r = await tools()('upsert_record').handler({ tabela: 'cr40f_reserva', chaves: { cr40f_reservaid: GUID }, dados: { cr40f_nome: 'x' } })
    expect(JSON.parse(textOf(r)).resultado).toBe(resultado)
    expect(calls.find((c) => c.method === 'PATCH')!.headers.Prefer).toBe('return=representation')
  })

  it('create_table usa timeout de 110 s e, se estourar, diz que pode ter concluído e não repetir', async () => {
    const spy = vi.spyOn(AbortSignal, 'timeout')
    mockFetch(
      route((c) => {
        if (c.method === 'POST' && c.url.endsWith('EntityDefinitions')) throw Object.assign(new Error('timeout'), { name: 'TimeoutError' })
        return undefined
      }),
    )
    const r = await tools()('create_table').handler({ nomeSchema: 'cr40f_Teste', rotulo: 'Teste', rotuloPlural: 'Testes', colunaPrincipal: { nomeSchema: 'cr40f_nome', rotulo: 'Nome' } })
    expect(r.isError).toBe(true)
    expect(textOf(r)).toMatch(/pode ter concluído; não repita\. Confira com list_tables\(filtro, atualizar:true\) em 1–2 min/)
    expect(spy).toHaveBeenCalledWith(110_000)
    spy.mockRestore()
  })

  it('delete_table também tem o timeout maior; leitura continua com 25 s', async () => {
    const spy = vi.spyOn(AbortSignal, 'timeout')
    mockFetch(route((c) => (c.method === 'DELETE' ? new Response(null, { status: 204 }) : undefined)))
    const t = tools()
    await t('delete_table').handler({ tabela: 'cr40f_reserva' })
    expect(spy.mock.calls.map((x) => x[0])).toContain(110_000)
    spy.mockClear()
    mockFetch(route((c) => (c.url.includes('/cr40f_reservas') ? json({ value: [] }) : undefined)))
    await tools()('read_query').handler({ tabela: 'cr40f_reserva', select: 'cr40f_nome' })
    expect(spy.mock.calls.map((x) => x[0])).not.toContain(110_000)
    spy.mockRestore()
  })

  it('lookup gravado como valor simples: dica primeiro, sem stack trace nem link de ajuda', async () => {
    mockFetch(writeError("A 'PrimitiveValue' node with non-null value was found when trying to read the value of the property 'cr40f_Cliente'; however, a 'StartArray' node was expected."))
    const r = await tools()('create_record').handler({ tabela: 'cr40f_reserva', dados: { cr40f_Cliente: GUID } })
    const out = textOf(r)
    expect(out.startsWith('"cr40f_cliente" é lookup: grave "cr40f_Cliente@odata.bind":"/cr40f_clientes1s(<guid>)"')).toBe(true)
    expect(out).not.toMatch(/\n\s+at |go\.microsoft\.com|InnerException/)
    expect(out).toMatch(/A 'PrimitiveValue' node/)
  })

  it('lookup gravado como _x_value: ensina a navegação e o entitySet reais', async () => {
    mockFetch(route((c) => (c.method === 'PATCH' ? json({ error: { code: '0x80060888', message: 'CRM do not support direct update of Entity Reference properties, Use Navigation properties instead.' } }, 400) : undefined)))
    const r = await tools()('update_record').handler({ tabela: 'cr40f_reserva', id: GUID, dados: { _cr40f_cliente_value: GUID } })
    expect(textOf(r)).toMatch(/^"cr40f_cliente" é lookup: grave "cr40f_Cliente@odata.bind":"\/cr40f_clientes1s\(<guid>\)"/)
  })

  it('bind com nome lógico: manda usar o EntitySetName (plural) e sugere o certo', async () => {
    mockFetch(route((c) => (c.method === 'POST' ? json({ error: { code: '0x80060888', message: "URL was not parsed due to an ODataUnrecognizedPathException. Resource not found for the segment 'cr40f_clientes1' provided in the URL." } }, 400) : undefined)))
    const r = await tools()('create_record').handler({ tabela: 'cr40f_reserva', dados: { 'cr40f_Cliente@odata.bind': `/cr40f_clientes1(${GUID})` } })
    expect(textOf(r)).toMatch(/^No bind use o EntitySetName \(plural\).*"\/cr40f_clientes1s\(<guid>\)"/)
  })

  it('campo inexistente na escrita: sem a frase "Se for lookup" quando a coluna não é lookup', async () => {
    mockFetch(writeError("Invalid property 'cr40f_zzz' was found in entity 'Microsoft.Dynamics.CRM.cr40f_reserva'. ---> Microsoft.OData.ODataException: The property 'cr40f_zzz' does not exist on type 'Microsoft.Dynamics.CRM.cr40f_reserva'."))
    const r = await tools()('create_record').handler({ tabela: 'cr40f_reserva', dados: { cr40f_zzz: 1 } })
    expect(textOf(r)).toMatch(/não tem a coluna "cr40f_zzz"/)
    expect(textOf(r)).not.toMatch(/Se for lookup/)
  })

  it('choice com rótulo em vez do número: diz o tipo esperado e lista os valores aceitos', async () => {
    mockFetch(writeError("Cannot convert the literal 'Aberto' to the expected type 'Edm.Int32'. ---> System.FormatException: Input string was not in a correct format."))
    const r = await tools()('create_record').handler({ tabela: 'cr40f_reserva', dados: { cr40f_nome: 'x', cr40f_status: 'Aberto' } })
    expect(textOf(r)).toMatch(/^Coluna cr40f_status espera Edm\.Int32 \(Picklist\); recebeu "Aberto"\. Valores aceitos \(use o número\): 100=Aberto, 200=Fechado\./)
  })

  it('texto em campo numérico: diz qual coluna espera qual tipo', async () => {
    mockFetch(writeError("Cannot convert a value to target type 'Edm.Decimal' because of conflict between input format string/number and parameter 'IEEE754Compatible' false/true."))
    const r = await tools()('create_record').handler({ tabela: 'cr40f_reserva', dados: { cr40f_nome: 'x', cr40f_valor: 'abc' } })
    expect(textOf(r)).toMatch(/^Coluna cr40f_valor espera Edm\.Decimal \(Money\); recebeu "abc"\./)
  })

  it('execute_action 404 sugere tipo:"function" ou conferir o nome', async () => {
    mockFetch(route((c) => (c.url.includes('WhoAmI') ? json({ error: { code: '', message: "No HTTP resource was found that matches the request URI 'x/WhoAmI'." } }, 404) : undefined)))
    const r = await tools()('execute_action').handler({ nome: 'WhoAmI' })
    expect(textOf(r)).toMatch(/Se for função \(WhoAmI, Retrieve\*, Get\*\) use tipo:'function'; senão confira o nome exato/)
  })

  it('delete_table com dependências: manda apagar a relação antes e lista os lookups', async () => {
    mockFetch(route((c) => (c.method === 'DELETE' ? json({ error: { code: '0x8004f01f', message: 'The Entity(1) component cannot be deleted because it is referenced by 5 other components.' } }, 400) : undefined)))
    const r = await tools()('delete_table').handler({ tabela: 'cr40f_reserva' })
    expect(textOf(r)).toMatch(/Apague primeiro a tabela cr40f_outra \(a que tem o lookup cr40f_reserva\)\. Não há ferramenta para excluir só a coluna/)
  })

  it('update_record com dados vazios é recusado sem chamar a API', async () => {
    const calls = mockFetch(route())
    const r = await tools()('update_record').handler({ tabela: 'cr40f_reserva', id: GUID, dados: {} })
    expect(r.isError).toBe(true)
    expect(textOf(r)).toMatch(/"dados" está vazio/)
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(0)
  })

  it('update_table com falha no meio diz o que foi aplicado, o que falhou e o que não rodou', async () => {
    mockFetch(
      route((c) => {
        if (c.url.includes('RelationshipDefinitions')) return json({ error: { code: '0x80040217', message: 'Could not find an entity' } }, 404)
        if (c.method === 'POST' || c.method === 'PUT') return new Response(null, { status: 204 })
        return undefined
      }),
    )
    const r = await tools()('update_table').handler({
      tabela: 'cr40f_reserva',
      adicionarColunas: [
        { tipo: 'texto', nomeSchema: 'cr40f_obs', rotulo: 'Obs' },
        { tipo: 'lookup', nomeSchema: 'cr40f_alvo', rotulo: 'Alvo', tabelaAlvo: 'cr40f_nada' },
        { tipo: 'texto', nomeSchema: 'cr40f_fim', rotulo: 'Fim' },
      ],
    })
    expect(r.isError).toBe(true)
    expect(textOf(r)).toMatch(/PARCIAL em cr40f_reserva: aplicado: coluna cr40f_obs \(texto\); falhou: coluna cr40f_alvo \(lookup\); não tentado: coluna cr40f_fim \(texto\)\./)
  })
})

describe('leitura: avisos da rodada 3', () => {
  it('resultado vazio com choice fora das opções avisa os valores válidos (e não avisa com valor válido)', async () => {
    mockFetch(route((c) => (c.url.includes('/cr40f_reservas') ? json({ value: [] }) : undefined)))
    const t = tools()
    const bad = JSON.parse(textOf(await t('read_query').handler({ tabela: 'cr40f_reserva', select: 'cr40f_nome', filter: 'cr40f_status eq 0' })))
    expect(bad._aviso).toMatch(/cr40f_status eq 0: 0 não é valor de cr40f_status; válidos: 100=Aberto, 200=Fechado\. Choice não é 0\/1/)
    const good = JSON.parse(textOf(await t('read_query').handler({ tabela: 'cr40f_reserva', select: 'cr40f_nome', filter: 'cr40f_status eq 100' })))
    expect(good._aviso).toBeUndefined()
  })

  it('describe_table com filtroColuna sem resultado avisa e informa o total de colunas', async () => {
    mockFetch(route())
    const r = JSON.parse(textOf(await tools()('describe_table').handler({ tabela: 'cr40f_reserva', filtroColuna: 'xyzqq' })))
    expect(r.colunas).toEqual([])
    expect(r._aviso).toMatch(/^Nenhuma coluna casa com 'xyzqq' \(7 colunas\); tente outro trecho\./)
  })

  it('FetchXML aggregate: grupo sem valor sai como null e "(vazio)"', async () => {
    mockFetch(route((c) => (c.url.includes('/cr40f_reservas') ? json({ value: [{ total: 5, c: GUID, 'c@OData.Community.Display.V1.FormattedValue': 'Acme' }, { total: 2 }] }) : undefined)))
    const xml = '<fetch aggregate="true"><entity name="cr40f_reserva"><attribute name="cr40f_cliente" groupby="true" alias="c"/><attribute name="cr40f_valor" aggregate="sum" alias="total"/></entity></fetch>'
    const r = JSON.parse(textOf(await tools()('read_query').handler({ fetchXml: xml })))
    expect(r.value[1]).toEqual({ total: 2, c: null, 'c@txt': '(vazio)' })
    expect(r.value[0].c).toBe(GUID)
  })

  it('expand com todos os lookups nulos entra em _nulas', async () => {
    mockFetch(route((c) => (c.url.includes('/cr40f_reservas') ? json({ value: [{ cr40f_nome: 'a', cr40f_Cliente: null }, { cr40f_nome: 'b', cr40f_Cliente: null }] }) : undefined)))
    const r = JSON.parse(textOf(await tools()('read_query').handler({ tabela: 'cr40f_reserva', select: 'cr40f_nome', expand: 'cr40f_Cliente($select=cr40f_nomedocliente)' })))
    expect(r._nulas).toEqual(['cr40f_Cliente'])
  })
})

describe('rodada 4', () => {
  const OUTER = '<fetch><entity name="cr40f_reserva"><attribute name="cr40f_nome"/><link-entity name="cr40f_x" from="a" to="b" link-type="outer" alias="s"/></entity></fetch>'
  const OUTER_OK = '<fetch><entity name="cr40f_reserva"><attribute name="cr40f_nome"/><link-entity name="cr40f_x" from="a" to="b" link-type="outer" alias="s"/><filter><condition entityname="s" attribute="cr40f_xid" operator="null"/></filter></entity></fetch>'
  const dados = (c: Call) => (c.url.includes('/cr40f_reservas') ? json({ value: [{ cr40f_nome: 'a' }] }) : undefined)

  it('A1: outer sem condição null avisa; com a condição não avisa', async () => {
    expect(outerWithoutNullCheck(OUTER)).toEqual(['s'])
    expect(outerWithoutNullCheck(OUTER_OK)).toEqual([])
    mockFetch(route(dados))
    const bad = JSON.parse(textOf(await tools()('read_query').handler({ fetchXml: OUTER })))
    expect(bad._dica).toMatch(/outer "s" sem condição null/)
    const ok = JSON.parse(textOf(await tools()('read_query').handler({ fetchXml: OUTER_OK })))
    expect(ok._dica).toBeUndefined()
  })

  it('A2, A4, A7, A8 e A3 (linha): instruções com os fatos confirmados', () => {
    expect(INSTRUCTIONS).toMatch(/bancodedados/)
    expect(glossario('op')).toMatch(/new_clientedaop/)
    expect(glossario('pagante')).toMatch(/202410002/)
    expect(glossario('faturamento')).toMatch(/202410010/)
    expect(glossario('faturamento')).toMatch(/cr40f_valor_a_receber/)
    expect(INSTRUCTIONS).toMatch(/Search está desativado no DEV/)
    expect(INSTRUCTIONS).toMatch(/Passageiro1 a 4/)
    expect(INSTRUCTIONS).toMatch(/whoami \(agora\)/)
    expect(INSTRUCTIONS).toMatch(/Quem NÃO tem/)
  })

  it('A3: nowInfo traz UTC, São Paulo e dia da semana', () => {
    expect(nowInfo(new Date('2026-11-17T14:14:13Z'))).toEqual({ utc: '2026-11-17T14:14:13.000Z', saoPaulo: '2026-11-17T11:14:13-03:00', diaDaSemana: 'terça-feira' })
  })

  it('A5: list_prompts põe ativos primeiro, com descrição e aviso quando nenhum está ativo', async () => {
    const modelos = (ativo: boolean) =>
      route((c) => {
        if (c.url.includes('msdyn_aimodels?')) return json({ value: [{ msdyn_aimodelid: 'a', msdyn_name: 'A', statecode: 1 }, { msdyn_aimodelid: 'b', msdyn_name: 'B', statecode: ativo ? 0 : 1 }] })
        if (c.url.includes('msdyn_aiconfigurations?')) return json({ value: [{ _msdyn_aimodelid_value: 'b', msdyn_customconfiguration: JSON.stringify({ prompt: [{ type: 'literal', text: 'Oi ' }, { type: 'inputVariable', text: 'nome', id: 'nome' }] }) }] })
        return undefined
      })
    mockFetch(modelos(true))
    const a = JSON.parse(textOf(await tools()('list_prompts').handler({})))
    expect(a.itens.map((i: { nome: string }) => i.nome)).toEqual(['B', 'A'])
    expect(a.itens[0].descricao).toBe('Oi {nome}')
    expect(a._aviso).toBeUndefined()
    mockFetch(modelos(false))
    const n = JSON.parse(textOf(await tools()('list_prompts').handler({})))
    expect(n._aviso).toMatch(/nenhum ativo: execute_prompt deve falhar/)
    expect(promptSummary('{{')).toBeUndefined()
  })

  it('A6: agregação com grupo explica o "(vazio)"', async () => {
    mockFetch(route((c) => (c.url.includes('/cr40f_reservas') ? json({ value: [{ total: 2 }] }) : undefined)))
    const xml = '<fetch aggregate="true"><entity name="cr40f_reserva"><attribute name="cr40f_cliente" groupby="true" alias="c"/><attribute name="cr40f_valor" aggregate="sum" alias="total"/></entity></fetch>'
    const r = JSON.parse(textOf(await tools()('read_query').handler({ fetchXml: xml })))
    expect(r._dica).toBe(AGGREGATE_HINT)
  })

  it('A9: filtroColuna sem resultado lista Lookup e Money', async () => {
    mockFetch(route())
    const r = JSON.parse(textOf(await tools()('describe_table').handler({ tabela: 'cr40f_reserva', filtroColuna: 'xyzqq' })))
    expect(r._aviso).toMatch(/Lookups: .*cr40f_cliente/)
    expect(r._aviso).toMatch(/Money: .*cr40f_valor/)
  })

  it('A10: colunas auxiliares de moeda só saem se pedidas', async () => {
    const row = { cr40f_valor: 1, _transactioncurrencyid_value: 'g', '_transactioncurrencyid_value@OData.Community.Display.V1.FormattedValue': 'BRL', exchangerate: 1 }
    expect(dropCurrencyAux([row], 'cr40f_valor')).toEqual([{ cr40f_valor: 1 }])
    expect(dropCurrencyAux([row], 'cr40f_valor,_transactioncurrencyid_value')[0]).toHaveProperty('_transactioncurrencyid_value')
    mockFetch(route((c) => (c.url.includes('/cr40f_reservas') ? json({ value: [row] }) : undefined)))
    const r = JSON.parse(textOf(await tools()('read_query').handler({ tabela: 'cr40f_reserva', select: 'cr40f_valor' })))
    expect(r.value[0]).toEqual({ cr40f_valor: 1 })
  })

  it('B1: alterarColunas faz PUT com MergeLabels e InsertOptionValue; "já existe" diz como', async () => {
    const inner = route((c) => (c.method === 'POST' || c.method === 'PUT' ? new Response(null, { status: 204 }) : undefined))
    const calls = mockFetch((c) => {
      const m = decodeURIComponent(c.url).match(/Attributes\(LogicalName='([^']+)'\)\/Microsoft\.Dynamics\.CRM\.(?!Lookup)\w+AttributeMetadata/)
      return c.method === 'GET' && m ? json({ LogicalName: m[1], AttributeType: 'String', DisplayName: { LocalizedLabels: [] } }) : inner(c)
    })
    const r = await tools()('update_table').handler({
      tabela: 'cr40f_reserva',
      alterarColunas: [{ nomeSchema: 'cr40f_valor', rotulo: 'Valor novo', descricao: 'd' }, { nomeSchema: 'cr40f_status', adicionarOpcoes: [{ rotulo: 'Pendente' }] }],
    })
    expect(textOf(r)).not.toMatch(/falhou/)
    const put = calls.find((c) => c.method === 'PUT' && c.url.includes("LogicalName='cr40f_valor'"))!
    expect(JSON.stringify(put.headers ?? {})).toMatch(/MSCRM\.MergeLabels/i)
    expect(JSON.stringify(put.body)).toMatch(/Valor novo/)
    const ins = calls.find((c) => c.method === 'POST' && c.url.includes('InsertOptionValue'))!
    expect(JSON.stringify(ins.body)).toMatch(/cr40f_status/)
    expect(JSON.stringify(ins.body)).toMatch(/Pendente/)
    mockFetch(route((c) => (c.method === 'POST' ? json({ error: { code: '0x80048403', message: 'Attribute with the same name already exists' } }, 400) : undefined)))
    const dup = await tools()('update_table').handler({ tabela: 'cr40f_reserva', adicionarColunas: [{ tipo: 'texto', nomeSchema: 'cr40f_valor', rotulo: 'V' }] })
    expect(textOf(dup)).toMatch(/Para mudar rótulo\/descrição use alterarColunas/)
  })

  it('B2, B5 e B6: descrições das ferramentas', () => {
    const t = tools()
    for (const n of ['create_table', 'update_table', 'delete_table']) expect(t(n).description).toMatch(/30 a 70 s/)
    expect((t('upsert_record').schema.chaves as { description?: string }).description).toMatch(/<tabela>id/)
    expect(columnSchema.shape.somenteData.description).toMatch(/padrão data e hora/)
  })

  it('B4: choice por rótulo vira valor e informa; ambíguo ou desconhecido mantém o erro', async () => {
    const opcoes = (c: Call) => {
      if (!decodeURIComponent(c.url).includes('/Attributes/Microsoft.Dynamics.CRM.PicklistAttributeMetadata')) return undefined
      const Label = (l: string) => ({ UserLocalizedLabel: { Label: l } })
      return json({ value: [{ LogicalName: 'cr40f_status', OptionSet: { Options: [{ Value: 100, Label: Label('Aberto') }, { Value: 200, Label: Label('Fechado') }] } }] })
    }
    const inner = route((c) => (c.method === 'POST' && c.url.includes('/cr40f_reservas') ? json({ cr40f_reservaid: GUID }) : undefined))
    const calls = mockFetch((c) => opcoes(c) ?? inner(c))
    const out = textOf(await tools()('create_record').handler({ tabela: 'cr40f_reserva', dados: { cr40f_status: 'fechado' } }))
    const r = JSON.parse(out)
    expect(r.resolvidos).toEqual(["cr40f_status: 'fechado' → 200"])
    expect((calls.find((c) => c.method === 'POST' && c.url.includes('/cr40f_reservas'))!.body as { cr40f_status: number }).cr40f_status).toBe(200)
    mockFetch(route((c) => (c.method === 'POST' && c.url.includes('/cr40f_reservas') ? json({ error: { code: '0x1', message: "Cannot convert the literal 'Zzz' to the expected type 'Edm.Int32'." } }, 400) : undefined)))
    const bad = await tools()('create_record').handler({ tabela: 'cr40f_reserva', dados: { cr40f_status: 'Zzz' } })
    expect(bad.isError).toBe(true)
    expect(textOf(bad)).not.toMatch(/resolvidos/)
  })

  it('B7: com filtroColuna, relações de sistema ficam fora e o lookup casa pelo nome', async () => {
    mockFetch(route())
    const r = JSON.parse(textOf(await tools()('describe_table').handler({ tabela: 'cr40f_reserva', filtroColuna: 'cliente' })))
    expect(r.relacoes.muitosParaUm.map((x: { coluna: string }) => x.coluna)).toEqual(['cr40f_cliente'])
    expect(r.relacoes.umParaMuitos).toEqual([])
  })

  it('B8: fetch com colunas devolve null explícito', async () => {
    mockFetch(route((c) => (c.url.includes('/cr40f_reservas(') ? json({ cr40f_reservaid: GUID, cr40f_nome: 'a' }) : undefined)))
    const r = JSON.parse(textOf(await tools()('fetch').handler({ tabela: 'cr40f_reserva', id: GUID, colunas: 'cr40f_nome,_cr40f_cliente_value' })))
    expect(r.registro._cr40f_cliente_value).toBeNull()
    expect(r.registro.cr40f_nome).toBe('a')
  })
})

describe('rodada 5', () => {
  const fx = (g: string) => `<fetch aggregate="true"><entity name="cr40f_reserva"><attribute name="cr40f_status" groupby="true" alias="g"/>${g}<attribute name="cr40f_valor" aggregate="sum" alias="soma"/></entity></fetch>`

  it('A1 a A8: glossario traz as regras de cada tabela e as instruções só apontam para ele', () => {
    const t = (n: string) => glossario(n)
    expect(t('faturamento')).toMatch(/new_valortotal/)
    expect(t('faturamento')).toMatch(/cr40f_valor_a_receber/)
    expect(t('faturamento')).toMatch(/202410012 Pagamento Em Atraso/)
    expect(t('serviço')).toMatch(/202410008 Concluído/)
    expect(t('cotação')).toMatch(/100004007 "Convertida em serviço"/)
    expect(t('cotação')).toMatch(/cr40f_prazoresponder/)
    expect(t('pagante')).toMatch(/_cr40f_financeiro_value/)
    expect(t('pagante')).toMatch(/_cr40f_bancodedados_value/)
    expect(t('funcionário')).toMatch(/cr40f_nomedaempresa/)
    expect(t('despesa')).toMatch(/cr40f_datagasto/)
    expect(t('despesa')).toMatch(/Abastecimento/)
    expect(t('op')).toMatch(/202410003 Paga/)
    expect(t('veiculo')).toMatch(/cr40f_statusdoveiculo/)
    expect(t('veiculo')).toMatch(/multa/)
    expect(t('zzz')).toMatch(/^Sem bloco para "zzz"/)
    expect(INSTRUCTIONS).toMatch(/glossario\(termo\)/)
    expect(INSTRUCTIONS.length).toBeLessThan(2400)
  })

  it('A1: a ferramenta glossario é de leitura e não usa a rede', async () => {
    const calls = mockFetch(route())
    const r = textOf(await tools()('glossario').handler({ termo: 'pagante' }))
    expect(r).toMatch(/cr40f_pagantes/)
    expect(calls).toHaveLength(0)
  })

  it('B1: agregação FetchXML não pagina por count e devolve todos os grupos', async () => {
    const grupos = Array.from({ length: 8 }, (_, i) => ({ g: 100 + i, soma: i }))
    const calls = mockFetch(route((c) => (c.url.includes('/cr40f_reservas') ? json({ value: grupos }) : undefined)))
    const out = JSON.parse(textOf(await tools()('read_query').handler({ fetchXml: fx(''), tamanhoPagina: 3 })))
    expect(out.value).toHaveLength(8)
    expect(out.maisRegistros).toBe(false)
    expect(decodeURIComponent(calls.find((c) => c.url.includes('/cr40f_reservas'))!.url)).not.toMatch(/count=/)
  })

  it('B2: dategrouping não deixa @txt "2.026"', async () => {
    mockFetch(route((c) => (c.url.includes('/cr40f_reservas') ? json({ value: [{ y: 2026, 'y@OData.Community.Display.V1.FormattedValue': '2.026', soma: 1 }] }) : undefined)))
    const xml = fx('<attribute name="cr40f_data" groupby="true" dategrouping="year" alias="y"/>')
    const out = JSON.parse(textOf(await tools()('read_query').handler({ fetchXml: xml })))
    expect(out.value[0].y).toBe(2026)
    expect(out.value[0]['y@txt']).toBeUndefined()
  })

  it('B3: texto vazio não culpa o acento; descrição diz que ignora acento e caixa', () => {
    expect(EMPTY_FILTER_HINT).not.toMatch(/acento.*difer|difer.*acento/i)
    expect(EMPTY_FILTER_HINT).toMatch(/ignora acento e caixa/)
    expect(tools()('read_query').description).toMatch(/ignora acento e caixa/)
  })

  it('B4: DateOnly em FILTER_HELP, na descrição e dica no eq do cache', () => {
    expect(FILTER_HELP).toMatch(/DateOnly.*ge dia and lt dia\+1/)
    expect(tools()('read_query').description).toMatch(/DateOnly: intervalo ge dia and lt dia\+1/)
    const cols = [{ nome: 'cr40f_data', formato: 'DateOnly/DateOnly' }, { nome: 'createdon', formato: 'DateAndTime/UserLocal' }]
    expect(dateOnlyEq("cr40f_data eq 2026-11-17 and createdon eq 2026-11-17", cols)).toEqual(['cr40f_data'])
    expect(dateOnlyEq('cr40f_data ge 2026-11-17', cols)).toEqual([])
  })

  it('B4: filtro eq em DateOnly do cache sem resultado traz a dica do intervalo', async () => {
    const inner = route((c) => (c.url.includes('/cr40f_reservas?') ? json({ value: [] }) : undefined))
    mockFetch((c) => {
      const u = decodeURIComponent(c.url)
      if (u.includes('/Attributes/Microsoft.Dynamics.CRM.DateTimeAttributeMetadata')) return json({ value: [{ LogicalName: 'cr40f_data', Format: 'DateOnly', DateTimeBehavior: { Value: 'DateOnly' } }] })
      return inner(c)
    })
    const t = tools()
    await t('describe_table').handler({ tabela: 'cr40f_reserva' })
    const out = JSON.parse(textOf(await t('read_query').handler({ tabela: 'cr40f_reserva', select: 'cr40f_reservaid', filter: 'cr40f_data eq 2026-11-17' })))
    expect(out._dica).toMatch(/cr40f_data é DateOnly.*ge dia and lt dia\+1/)
  })

  it('B5: expand de coleção sem nextLink, com _dica e sem a volta ao pai', async () => {
    const pai = 'cr40f_clientes1id'
    const rows = [{ [pai]: GUID, 'rel@odata.nextLink': 'https://x/next', rel: [{ id: 'a', _cr40f_cliente_value: GUID, '_cr40f_cliente_value@OData.Community.Display.V1.FormattedValue': 'X', _cr40f_outro_value: 'zzz' }] }]
    expect(cleanExpandChildren(rows, ['rel'], pai)).toBe(true)
    expect(rows[0]).not.toHaveProperty('rel@odata.nextLink')
    expect(rows[0].rel[0]).toEqual({ id: 'a', _cr40f_outro_value: 'zzz' })
    mockFetch(route((c) => (c.url.includes('/cr40f_reservas?') ? json({ value: [{ cr40f_reservaid: GUID, rel: [{ id: 'a', _cr40f_cliente_value: GUID }], 'rel@odata.nextLink': 'https://x/next' }] }) : undefined)))
    const out = JSON.parse(textOf(await tools()('read_query').handler({ tabela: 'cr40f_reserva', select: 'cr40f_reservaid', expand: 'rel($select=id;$top=1)' })))
    expect(out._dica).toMatch(/há mais filhos: consulte a tabela filha com filter _col_value eq <id>/)
    expect(JSON.stringify(out)).not.toMatch(/nextLink/)
    expect(out.value[0].rel[0]._cr40f_cliente_value).toBeUndefined()
  })

  it('B5: erro de $count dentro de $expand explica a 1:N reversa; descrição traz o padrão', async () => {
    mockFetch(route((c) => (c.url.includes('/cr40f_reservas?') ? json({ error: { code: '0x1', message: 'The query parameter $skip, $count, $search, and $levels are not supported inside $expand.' } }, 400) : undefined)))
    const r = await tools()('read_query').handler({ tabela: 'cr40f_reserva', select: 'cr40f_nome', expand: 'rel($count=true)' })
    expect(textOf(r)).toMatch(/1:N reversa.*umParaMuitos.*contar:true/)
    expect(tools()('read_query').description).toMatch(/1:N reversa: expand=<navegacao de umParaMuitos>\(\$select=col;\$top=n\)/)
  })

  it('B6: aspa dentro do texto no FILTER_HELP e no erro de literal sem fechar', async () => {
    expect(FILTER_HELP).toMatch(/D''Avila/)
    mockFetch(route((c) => (c.url.includes('/cr40f_reservas?') ? json({ error: { code: '0x1', message: 'There is an unterminated literal at position 39 in ...' } }, 400) : undefined)))
    const r = await tools()('read_query').handler({ tabela: 'cr40f_reserva', select: 'cr40f_nome', filter: "cr40f_nome eq 'D'Avila'" })
    expect(textOf(r)).toMatch(/Aspa dentro do texto se dobra: 'D''Avila'/)
  })

  it('B7: atributo inexistente no FetchXML sugere coluna parecida (cache) como no OData', async () => {
    expect(fetchAttributeMissing("'cr40f_reserva' entity doesn't contain attribute with Name = 'cr40f_valr' and NameMapping = 'Logical'.")).toEqual({ type: 'cr40f_reserva', property: 'cr40f_valr' })
    mockFetch(route((c) => (c.url.includes('/cr40f_reservas?') ? json({ error: { code: '0x80041103', message: "'cr40f_reserva' entity doesn't contain attribute with Name = 'cr40f_valr' and NameMapping = 'Logical'." } }, 400) : undefined)))
    const t = tools()
    await t('describe_table').handler({ tabela: 'cr40f_reserva' })
    const r = await t('read_query').handler({ fetchXml: '<fetch><entity name="cr40f_reserva"><attribute name="cr40f_valr"/></entity></fetch>' })
    expect(textOf(r)).toMatch(/não tem a coluna "cr40f_valr".*Parecidas: cr40f_valor/)
  })

  it('B8: FetchXML pagina por número, sem pagingCookie; proximaPagina vai inteira', () => {
    const s = tools()('read_query').schema as Record<string, { description?: string }>
    expect(s.pagingCookie).toBeUndefined()
    expect(s.pagina.description).toMatch(/sem cookie/)
    expect(s.proximaPagina.description).toMatch(/cole inteira, sem repetir filtros/)
  })

  it('B9: describe_table põe colunas de sistema por último e recomenda filtroColuna', async () => {
    mockFetch(route())
    const out = JSON.parse(textOf(await tools()('describe_table').handler({ tabela: 'cr40f_reserva' })))
    const names: string[] = out.colunas.map((c: { nome: string }) => c.nome)
    expect(names.indexOf('cr40f_data')).toBeLessThan(names.indexOf('createdon'))
    expect(names.indexOf('cr40f_valor')).toBeLessThan(names.indexOf('ownerid'))
    expect(out.colunas.find((c: { nome: string }) => c.nome === 'ownerid').sistema).toBe(true)
    expect(tools()('describe_table').description).toMatch(/filtroColuna/)
  })

  it('B10: relação casou e nenhuma coluna: aviso curto "relações abaixo"', async () => {
    mockFetch(route())
    const out = JSON.parse(textOf(await tools()('describe_table').handler({ tabela: 'cr40f_reserva', filtroColuna: 'rel_cliente' })))
    expect(out.colunas).toEqual([])
    expect(out._aviso).toMatch(/Nenhuma coluna casa com 'rel_cliente'; relações abaixo/)
  })

  it('B11: decimal com ponto nas descrições de create_record e update_record', () => {
    expect(tools()('create_record').description).toMatch(/número com ponto \(12\.5\)/)
    expect(tools()('update_record').description).toMatch(/número com ponto \(12\.5\)/)
  })

  it('B12: delete_record 404 diz "já excluído ou id errado"', async () => {
    mockFetch(route((c) => (c.method === 'DELETE' ? json({ error: { code: '0x80040217', message: 'Does Not Exist' } }, 404) : undefined)))
    const r = await tools()('delete_record').handler({ tabela: 'cr40f_reserva', id: GUID })
    expect(r.isError).toBe(true)
    expect(textOf(r)).toMatch(/Já excluído ou id errado: cr40f_reserva\(/)
  })

  it('B13: N:N traz a navegação do lado da tabela descrita; associate diz qual usar', async () => {
    const inner = route()
    mockFetch((c) => {
      const u = decodeURIComponent(c.url)
      if (u.includes("EntityDefinitions(LogicalName='cr40f_reserva')/ManyToManyRelationships")) {
        return json({ value: [{ SchemaName: 'rel_nn', Entity1LogicalName: 'cr40f_outra', Entity2LogicalName: 'cr40f_reserva', Entity1NavigationPropertyName: 'nav_outra', Entity2NavigationPropertyName: 'nav_reserva', IntersectEntityName: 'x' }] })
      }
      return inner(c)
    })
    const out = JSON.parse(textOf(await tools()('describe_table').handler({ tabela: 'cr40f_reserva' })))
    expect(out.relacoes.muitosParaMuitos[0].navegacao).toBe('nav_reserva')
    expect((tools()('associate').schema.relacao as { description?: string }).description).toMatch(/lado de `tabela` \(origem\).*muitosParaMuitos\[\]\.navegacao/)
  })

  it('B14: contagem barata documentada', () => {
    expect(tools()('read_query').description).toMatch(/contar:true com top:1/)
  })
})
