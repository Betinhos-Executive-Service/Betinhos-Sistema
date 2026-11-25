// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { buscarEnderecos, mapearTomTom, pareceEndereco } from './enderecos'

const CHAVE = 'chave-de-teste'
const corpo = (results: unknown[]) => new Response(JSON.stringify({ results }), { status: 200 })

describe('mapearTomTom', () => {
  it('POI vira nome + endereço; rua vira "Rua, nº"; sem endereço ou repetido sai', () => {
    const lista = mapearTomTom({
      results: [
        { poi: { name: 'Aeroporto de Guarulhos', classifications: [{ code: 'AIRPORT' }] }, address: { freeformAddress: 'Rodovia Hélio Smidt, Guarulhos, SP' } },
        { address: { streetName: 'Avenida Paulista', streetNumber: '1000', freeformAddress: 'Avenida Paulista 1000, São Paulo, SP' } },
        { address: { freeformAddress: 'Praça da Sé, São Paulo, SP' } },
        { poi: { name: 'Sem endereço' }, address: {} },
        { poi: { name: 'aeroporto de guarulhos' }, address: { freeformAddress: 'rodovia hélio smidt, guarulhos, sp' } },
      ],
    })
    expect(lista).toEqual([
      { rotulo: 'Aeroporto de Guarulhos', endereco: 'Rodovia Hélio Smidt, Guarulhos, SP', tipo: 'aeroporto' },
      { rotulo: 'Avenida Paulista, 1000', endereco: 'Avenida Paulista 1000, São Paulo, SP' },
      { rotulo: 'Praça da Sé', endereco: 'Praça da Sé, São Paulo, SP' },
    ])
  })

  it('classificação conhecida vira tipo; desconhecida fica sem tipo', () => {
    const lista = mapearTomTom({
      results: [
        { poi: { name: 'Hotel Unique', classifications: [{ code: 'HOTEL_MOTEL' }] }, address: { freeformAddress: 'Av. Brigadeiro Luís Antônio, 4700' } },
        { poi: { name: 'Terminal Tietê', classifications: [{ code: 'PUBLIC_TRANSPORT_STOP' }] }, address: { freeformAddress: 'Av. Cruzeiro do Sul, 1800' } },
        { poi: { name: 'Padaria', classifications: [{ code: 'RESTAURANT' }] }, address: { freeformAddress: 'Rua X, 1' } },
      ],
    })
    expect(lista.map((s) => s.tipo)).toEqual(['hotel', 'rodoviaria', undefined])
  })

  it.each([[null], [undefined], [{}], [{ results: 'x' }], ['texto']])('corpo malformado (%j) vira lista vazia', (c) => {
    expect(mapearTomTom(c)).toEqual([])
  })
})

describe('buscarEnderecos', () => {
  it('sem TOMTOM_KEY ou com menos de 3 letras: [] e nenhuma chamada', async () => {
    const f = vi.fn()
    expect(await buscarEnderecos({}, 'Avenida Paulista', f)).toEqual([])
    expect(await buscarEnderecos({ TOMTOM_KEY: CHAVE }, 'av', f)).toEqual([])
    expect(await buscarEnderecos({ TOMTOM_KEY: CHAVE }, '   ab  ', f)).toEqual([])
    expect(f).not.toHaveBeenCalled()
  })

  it('chama a busca geral e a de estabelecimentos, perto de São Paulo, e devolve o mapeamento', async () => {
    const f = vi.fn(async () => corpo([{ poi: { name: 'Congonhas' }, address: { freeformAddress: 'Av. Washington Luís, São Paulo, SP' } }]))
    const r = await buscarEnderecos({ TOMTOM_KEY: CHAVE }, ' Congonhas & cia ', f as unknown as typeof fetch)
    expect(r).toEqual([{ rotulo: 'Congonhas', endereco: 'Av. Washington Luís, São Paulo, SP' }])
    const urls = f.mock.calls.map((c) => new URL(String((c as unknown[])[0])))
    expect(urls.map((u) => decodeURIComponent(u.pathname)).sort()).toEqual(['/search/2/poiSearch/Congonhas & cia.json', '/search/2/search/Congonhas & cia.json'])
    for (const url of urls) {
      expect(url.hostname).toBe('api.tomtom.com')
      expect(Object.fromEntries(url.searchParams)).toMatchObject({ key: CHAVE, typeahead: 'true', countrySet: 'BR', language: 'pt-BR', limit: '6', lat: '-23.5505', lon: '-46.6333' })
    }
    expect(urls.find((u) => u.pathname.includes('/search/2/search/'))?.searchParams.get('idxSet')).toBe('PAD,POI,Addr,Str')
  })

  it('nome de lugar põe estabelecimentos primeiro; endereço põe ruas primeiro', async () => {
    const hotel = { poi: { name: 'Hotel Fasano', classifications: [{ code: 'HOTEL_MOTEL' }] }, address: { freeformAddress: 'Rua Vittorio Fasano, 88, São Paulo' } }
    const rua = { address: { streetName: 'Rua Fasano', freeformAddress: 'Rua Fasano, Osasco' } }
    const f = (async (u: string) => corpo(u.includes('/poiSearch/') ? [hotel] : [rua])) as unknown as typeof fetch
    expect((await buscarEnderecos({ TOMTOM_KEY: CHAVE }, 'fasano', f)).map((s) => s.rotulo)).toEqual(['Hotel Fasano', 'Rua Fasano'])
    expect((await buscarEnderecos({ TOMTOM_KEY: CHAVE }, 'rua fasano', f)).map((s) => s.rotulo)).toEqual(['Rua Fasano', 'Hotel Fasano'])
  })

  it('uma das buscas falhando não derruba a outra', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const f = (async (u: string) => (u.includes('/poiSearch/') ? new Response('x', { status: 503 }) : corpo([{ address: { freeformAddress: 'Praça da Sé, São Paulo' } }]))) as unknown as typeof fetch
    expect(await buscarEnderecos({ TOMTOM_KEY: CHAVE }, 'Praça da Sé', f)).toHaveLength(1)
    log.mockRestore()
  })

  it.each([['Av. Paulista', true], ['rua augusta 10', true], ['Alameda Santos', true], ['Paulista 1000', true], ['Hotel Unique', false], ['Rodoviária Tietê', false], ['Alphaville', false]])('pareceEndereco(%j) = %s', (q, esperado) => {
    expect(pareceEndereco(q)).toBe(esperado)
  })

  it('limita o tamanho da busca', async () => {
    const f = vi.fn(async () => corpo([]))
    await buscarEnderecos({ TOMTOM_KEY: CHAVE }, 'a'.repeat(500), f as unknown as typeof fetch)
    const caminho = decodeURIComponent(new URL(String((f.mock.calls[0] as unknown[])[0])).pathname)
    expect(caminho.length).toBeLessThan(150)
  })

  it('TomTom fora do ar, resposta de erro ou JSON ruim: [] e a chave não vai para o log', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const chave = { TOMTOM_KEY: CHAVE }
    expect(await buscarEnderecos(chave, 'Paulista', (async () => { throw new TypeError(`falhou ${CHAVE}`) }) as unknown as typeof fetch)).toEqual([])
    expect(await buscarEnderecos(chave, 'Paulista', (async () => new Response('x', { status: 503 })) as unknown as typeof fetch)).toEqual([])
    expect(await buscarEnderecos(chave, 'Paulista', (async () => new Response('não é json', { status: 200 })) as unknown as typeof fetch)).toEqual([])
    expect(JSON.stringify(log.mock.calls)).not.toContain(CHAVE)
    log.mockRestore()
  })
})
