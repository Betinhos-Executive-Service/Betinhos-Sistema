// Prévia do trajeto do Pedir: geocodifica saída e destino e calcula a rota na TomTom, no servidor (a chave não vai ao navegador).
// Sem TOMTOM_KEY, endereço não achado ou TomTom falhando devolve null: a prévia só não aparece.
import type { EstimativaRota } from '../src/domain/types'
import type { Env } from './env'
import { json } from './http'
import { MAX_BUSCA, MIN_BUSCA } from './enderecos'

const TEMPO_MS = 4000
const BASE = 'https://api.tomtom.com'

type Posicao = { lat: number; lon: number }

async function pedirJson(f: typeof fetch, url: string): Promise<unknown> {
  try {
    const r = await f(url, { signal: AbortSignal.timeout(TEMPO_MS) })
    return r.ok ? await r.json() : null
  } catch (e) {
    // Sem a URL: ela leva a chave.
    console.error('rota', e instanceof Error ? e.name : 'falha')
    return null
  }
}

async function geocodificar(f: typeof fetch, chave: string, texto: string): Promise<Posicao | null> {
  const url = `${BASE}/search/2/geocode/${encodeURIComponent(texto)}.json?key=${encodeURIComponent(chave)}&countrySet=BR&language=pt-BR&limit=1&lat=-23.5505&lon=-46.6333`
  const p = ((await pedirJson(f, url)) as { results?: { position?: Posicao }[] } | null)?.results?.[0]?.position
  return p && Number.isFinite(p.lat) && Number.isFinite(p.lon) ? p : null
}

export async function estimarRota(env: Pick<Env, 'TOMTOM_KEY'>, origem: string, destino: string, f: typeof fetch = fetch): Promise<EstimativaRota | null> {
  const o = origem.trim().slice(0, MAX_BUSCA)
  const d = destino.trim().slice(0, MAX_BUSCA)
  if (!env.TOMTOM_KEY || o.length < MIN_BUSCA || d.length < MIN_BUSCA || o.toLowerCase() === d.toLowerCase()) return null
  const [a, b] = await Promise.all([geocodificar(f, env.TOMTOM_KEY, o), geocodificar(f, env.TOMTOM_KEY, d)])
  if (!a || !b) return null
  const url = `${BASE}/routing/1/calculateRoute/${a.lat},${a.lon}:${b.lat},${b.lon}/json?key=${encodeURIComponent(env.TOMTOM_KEY)}&traffic=true&travelMode=car`
  const s = ((await pedirJson(f, url)) as { routes?: { summary?: { lengthInMeters?: number; travelTimeInSeconds?: number } }[] } | null)?.routes?.[0]?.summary
  if (!s || !Number.isFinite(s.lengthInMeters) || !Number.isFinite(s.travelTimeInSeconds)) return null
  return { distanciaKm: Math.round((s.lengthInMeters as number) / 100) / 10, minutos: Math.max(1, Math.round((s.travelTimeInSeconds as number) / 60)) }
}

export async function responderRota(env: Env, o: string, d: string): Promise<Response> {
  return json(await estimarRota(env, o, d))
}
