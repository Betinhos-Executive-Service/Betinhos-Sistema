// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { estimarRota } from './rota'

const CHAVE = 'chave-de-teste'
const resp = (c: unknown) => new Response(JSON.stringify(c), { status: 200 })

function tomtom(over: { geocode?: unknown; rota?: unknown } = {}) {
  return vi.fn(async (u: string) => {
    const url = new URL(u)
    if (url.pathname.includes('/geocode/')) {
      const q = decodeURIComponent(url.pathname)
      return resp(over.geocode ?? { results: [{ position: q.includes('Paulista') ? { lat: -23.56, lon: -46.65 } : { lat: -23.43, lon: -46.47 } }] })
    }
    return resp(over.rota ?? { routes: [{ summary: { lengthInMeters: 28450, travelTimeInSeconds: 2290 } }] })
  })
}

describe('estimarRota', () => {
  it('geocodifica os dois pontos e devolve km com 1 casa e minutos', async () => {
    const f = tomtom()
    const r = await estimarRota({ TOMTOM_KEY: CHAVE }, 'Av. Paulista, 1000', 'Aeroporto de Guarulhos', f as unknown as typeof fetch)
    expect(r).toEqual({ distanciaKm: 28.5, minutos: 38 })
    const urls = f.mock.calls.map((c) => new URL(String(c[0])))
    expect(urls).toHaveLength(3)
    const rota = urls.find((u) => u.pathname.includes('/routing/'))!
    expect(rota.pathname).toBe('/routing/1/calculateRoute/-23.56,-46.65:-23.43,-46.47/json')
    expect(rota.searchParams.get('traffic')).toBe('true')
    for (const u of urls) expect(u.searchParams.get('key')).toBe(CHAVE)
  })

  it('sem chave, texto curto ou pontos iguais: null e nenhuma chamada', async () => {
    const f = vi.fn()
    expect(await estimarRota({}, 'Av. Paulista', 'Guarulhos', f)).toBeNull()
    expect(await estimarRota({ TOMTOM_KEY: CHAVE }, 'Av', 'Guarulhos', f)).toBeNull()
    expect(await estimarRota({ TOMTOM_KEY: CHAVE }, 'Guarulhos', ' guarulhos ', f)).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })

  it('endereço não achado, rota malformada ou falha de rede: null', async () => {
    const k = { TOMTOM_KEY: CHAVE }
    expect(await estimarRota(k, 'Av. Paulista', 'Guarulhos', tomtom({ geocode: { results: [] } }) as unknown as typeof fetch)).toBeNull()
    expect(await estimarRota(k, 'Av. Paulista', 'Guarulhos', tomtom({ rota: { routes: [] } }) as unknown as typeof fetch)).toBeNull()
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await estimarRota(k, 'Av. Paulista', 'Guarulhos', vi.fn(async () => { throw new TypeError('rede') }))).toBeNull()
    expect(JSON.stringify(erro.mock.calls)).not.toContain(CHAVE)
    erro.mockRestore()
  })
})
