// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { buscarEnderecos, mapearTomTom } from './enderecos'

const CHAVE = 'chave-de-teste'
const corpo = (results: unknown[]) => new Response(JSON.stringify({ results }), { status: 200 })

describe('mapearTomTom', () => {
  it('POI vira nome + endereço; rua vira "Rua, nº"; sem endereço ou repetido sai', () => {
    const lista = mapearTomTom({
      results: [
        { poi: { name: 'Aeroporto de Guarulhos' }, address: { freeformAddress: 'Rodovia Hélio Smidt, Guarulhos, SP' } },
        { address: { streetName: 'Avenida Paulista', streetNumber: '1000', freeformAddress: 'Avenida Paulista 1000, São Paulo, SP' } },
        { address: { freeformAddress: 'Praça da Sé, São Paulo, SP' } },
        { poi: { name: 'Sem endereço' }, address: {} },
        { poi: { name: 'aeroporto de guarulhos' }, address: { freeformAddress: 'rodovia hélio smidt, guarulhos, sp' } },
      ],
    })
    expect(lista).toEqual([
      { rotulo: 'Aeroporto de Guarulhos', endereco: 'Rodovia Hélio Smidt, Guarulhos, SP' },
      { rotulo: 'Avenida Paulista, 1000', endereco: 'Avenida Paulista 1000, São Paulo, SP' },
      { rotulo: 'Praça da Sé', endereco: 'Praça da Sé, São Paulo, SP' },
    ])
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

  it('chama a TomTom com os parâmetros combinados e devolve o mapeamento', async () => {
    const f = vi.fn(async () => corpo([{ poi: { name: 'Congonhas' }, address: { freeformAddress: 'Av. Washington Luís, São Paulo, SP' } }]))
    const r = await buscarEnderecos({ TOMTOM_KEY: CHAVE }, ' Congonhas & cia ', f as unknown as typeof fetch)
    expect(r).toEqual([{ rotulo: 'Congonhas', endereco: 'Av. Washington Luís, São Paulo, SP' }])
    const url = new URL(String((f.mock.calls[0] as unknown[])[0]))
    expect(url.hostname).toBe('api.tomtom.com')
    expect(decodeURIComponent(url.pathname)).toBe('/search/2/search/Congonhas & cia.json')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ key: CHAVE, typeahead: 'true', countrySet: 'BR', language: 'pt-BR', limit: '6', idxSet: 'PAD,POI,Addr,Str' })
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
