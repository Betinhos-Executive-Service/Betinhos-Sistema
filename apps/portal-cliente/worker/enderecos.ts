// Sugestão de endereço do Pedir: TomTom Search (typeahead) no servidor, para a chave nunca ir ao navegador.
// Sem TOMTOM_KEY ou com a TomTom falhando devolve [] sem erro: o campo continua texto livre.
import type { EnderecoSugerido, TipoLocal } from '../src/domain/types'
import type { Env } from './env'
import { json } from './http'

export const MIN_BUSCA = 3
export const MAX_BUSCA = 100
const TEMPO_MS = 4000

type ResultadoTomTom = {
  poi?: { name?: string; classifications?: { code?: string }[] }
  address?: { freeformAddress?: string; streetName?: string; streetNumber?: string }
}

/** Classificação da TomTom → local conhecido; as demais ficam sem tipo. */
const TIPOS_TOMTOM: Record<string, TipoLocal> = {
  AIRPORT: 'aeroporto',
  HOTEL_MOTEL: 'hotel',
  PUBLIC_TRANSPORT_STOP: 'rodoviaria',
  RAILWAY_STATION: 'estacao',
}

/** `[{rotulo, endereco, tipo?}]`: POI → nome + endereço formatado; rua/número → "Rua, nº" + endereço formatado. Sem endereço ou repetido, descarta. */
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
    const tipo = r.poi?.classifications?.map((c) => TIPOS_TOMTOM[c.code ?? '']).find(Boolean)
    saida.push(tipo ? { rotulo, endereco, tipo } : { rotulo, endereco })
  }
  return saida
}

/** Viés para a Grande São Paulo, onde roda quase toda a operação: ordena, não restringe (outras cidades continuam vindo). */
const PERTO = '&lat=-23.5505&lon=-46.6333'
const PARAMS = `&typeahead=true&countrySet=BR&language=pt-BR&limit=6${PERTO}`

/** Texto com cara de endereço (logradouro ou número): ruas primeiro; senão estabelecimentos primeiro. */
export function pareceEndereco(q: string): boolean {
  return /\d/.test(q) || /^(r|rua|av|avenida|al|alameda|tv|travessa|estr|estrada|rod|rodovia|p[çc]a|pra[çc]a|largo)(\.|\s|$)/i.test(q.trim())
}

async function consultar(f: typeof fetch, url: string): Promise<ResultadoTomTom[]> {
  try {
    const r = await f(url, { signal: AbortSignal.timeout(TEMPO_MS) })
    if (!r.ok) return []
    const corpo = (await r.json()) as { results?: unknown }
    return Array.isArray(corpo?.results) ? (corpo.results as ResultadoTomTom[]) : []
  } catch (e) {
    // Sem a URL: ela leva a chave.
    console.error('enderecos', e instanceof Error ? e.name : 'falha')
    return []
  }
}

/** Duas buscas em paralelo: a geral (endereços e POIs) e a só de estabelecimentos (hotéis, empresas), que a geral reconhece mal. */
export async function buscarEnderecos(env: Pick<Env, 'TOMTOM_KEY'>, texto: string, f: typeof fetch = fetch): Promise<EnderecoSugerido[]> {
  const q = texto.trim().slice(0, MAX_BUSCA)
  if (q.length < MIN_BUSCA || !env.TOMTOM_KEY) return []
  const base = `https://api.tomtom.com/search/2`
  const fim = `${encodeURIComponent(q)}.json?key=${encodeURIComponent(env.TOMTOM_KEY)}${PARAMS}`
  const [geral, locais] = await Promise.all([
    consultar(f, `${base}/search/${fim}&idxSet=PAD,POI,Addr,Str`),
    consultar(f, `${base}/poiSearch/${fim}`),
  ])
  const ordem = pareceEndereco(q) ? [...geral, ...locais] : [...locais, ...geral]
  return mapearTomTom({ results: ordem }).slice(0, 6)
}

export async function sugerirEnderecos(env: Env, q: string): Promise<Response> {
  return json(await buscarEnderecos(env, q))
}
