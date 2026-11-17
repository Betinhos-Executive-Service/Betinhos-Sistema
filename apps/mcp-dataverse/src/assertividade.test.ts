import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataverseSession } from './dataverse'
import { clean, limitJson } from './format'
import { env, json, mockFetch, tokenReply, type Call } from './helpers.test-util'
import { INSTRUCTIONS } from './instrucoes'
import { nullColumns, suggest, wrongOperators } from './dicas'
import { validateXml } from './metadata'
import { buildTools, promptInputs, type ToolDef } from './tools'

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
    expect(textOf(r)).toMatch(/Se for lookup, use _col_value/)
    expect(textOf(r)).toMatch(/Coluna principal: cr40f_nome/)
    expect(calls.some((c) => decodeURIComponent(c.url).includes('/Attributes'))).toBe(false)
  })

  it('escrita com lookup errado ensina a navegação@odata.bind com o entitySet do alvo', async () => {
    mockFetch(route((c) => (c.method === 'POST' && c.url.includes('/cr40f_reservas') ? json({ error: { code: '0x80060888', message: "Could not find a property named 'cr40f_cliente' on type 'Microsoft.Dynamics.CRM.cr40f_reserva'." } }, 400) : undefined)))
    const t = tools()
    await t('describe_table').handler({ tabela: 'cr40f_reserva' })
    const r = await t('create_record').handler({ tabela: 'cr40f_reserva', dados: { cr40f_cliente: '5d2b2f3a-0000-4000-8000-000000000001' } })
    expect(textOf(r)).toContain('"cr40f_Cliente@odata.bind":"/cr40f_clientes1s(<guid>)"')
    expect(textOf(r)).not.toMatch(/_cr40f_cliente_value/)
  })

  it('propriedade não declarada na escrita também é reconhecida (sem cache: dica de @odata.bind)', async () => {
    mockFetch(route((c) => (c.method === 'POST' && c.url.includes('/cr40f_reservas') ? json({ error: { code: '0x0', message: "An undeclared property 'cr40f_cliente' which only has property annotations in the payload but no property value was found." } }, 400) : undefined)))
    const r = await tools()('create_record').handler({ tabela: 'cr40f_reserva', dados: { cr40f_cliente: 'x' } })
    expect(textOf(r)).toMatch(/grave "<Navegacao>@odata.bind"/)
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
    expect(names.slice(0, 4)).toEqual(['cr40f_reservaid', 'cr40f_cliente', 'cr40f_data', 'createdon'])
    expect(names.at(-1)).toBe('statecode')
    expect(out.colunas.at(-1).sistema).toBe(true)
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
    for (const c of ['cr40f_nomecompleto', 'cr40f_placa', 'cr40f_titulo', 'cr40f_statuscotacao', 'cr40f_Passageiro1', 'cr40f_Veiculo', 'FetchXML aggregate']) expect(INSTRUCTIONS).toContain(c)
    for (const t of ['cr40f_reservadeveculos', 'cr40f_bancodedados', 'cr40f_clientes1', 'cr40f_funcionarios', 'cr40f_veiculos', 'cr40f_pagantes', 'cr40f_despesaoperacional', 'cr40f_pedidodecotacao']) {
      expect(INSTRUCTIONS).toContain(t)
    }
  })
})
