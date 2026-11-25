// Sugestão de endereço do Pedir: TomTom Search (typeahead) no servidor, para a chave nunca ir ao navegador.
// Sem TOMTOM_KEY ou com a TomTom falhando devolve [] sem erro: o campo continua texto livre.
import type { EnderecoSugerido } from '../src/domain/types'
import type { Env } from './env'
import { json } from './http'

export const MIN_BUSCA = 3
export const MAX_BUSCA = 100
const TEMPO_MS = 4000

type ResultadoTomTom = {
  poi?: { name?: string }
  address?: { freeformAddress?: string; streetName?: string; streetNumber?: string }
}

/** `[{rotulo, endereco}]`: POI → nome + endereço formatado; rua/número → "Rua, nº" + endereço formatado. Sem endereço ou repetido, descarta. */
export function mapearTomTom(corpo: unknown): EnderecoSugerido[] {
  const resultados = (corpo as { results?: ResultadoTomTom[] } | null)?.results
  if (!Array.isArray(resultados)) return []
  const vistos = new Set<string>()
  const saida: EnderecoSugerido[] = []
  for (const r of resultados) {
    const endereco = r.address?.freeformAddress?.trim()
    if (!endereco) continue
    const rua = [r.address?.streetName, r.address?.streetNumber].filter(Boolean).join(', ')
    const rotulo = (r.poi?.name || rua || endereco.split(',')[0]).trim()
    const chave = `${rotulo}|${endereco}`.toLowerCase()
    if (vistos.has(chave)) continue
    vistos.add(chave)
    saida.push({ rotulo, endereco })
  }
  return saida
}

export async function buscarEnderecos(env: Pick<Env, 'TOMTOM_KEY'>, texto: string, f: typeof fetch = fetch): Promise<EnderecoSugerido[]> {
  const q = texto.trim().slice(0, MAX_BUSCA)
  if (q.length < MIN_BUSCA || !env.TOMTOM_KEY) return []
  const url =
    `https://api.tomtom.com/search/2/search/${encodeURIComponent(q)}.json?key=${encodeURIComponent(env.TOMTOM_KEY)}` +
    '&typeahead=true&countrySet=BR&language=pt-BR&limit=6&idxSet=PAD,POI,Addr,Str'
  try {
    const r = await f(url, { signal: AbortSignal.timeout(TEMPO_MS) })
    return r.ok ? mapearTomTom(await r.json()) : []
  } catch (e) {
    // Sem a URL: ela leva a chave.
    console.error('enderecos', e instanceof Error ? e.name : 'falha')
    return []
  }
}

export async function sugerirEnderecos(env: Env, q: string): Promise<Response> {
  return json(await buscarEnderecos(env, q))
}
