// Capas do Radar: imagem og:image da notícia, lida pelo microlink (o Dataverse não guarda a capa).
// O microlink grátis é lento na primeira chamada (~17 s) e limita a cota: poucas por vez, na ordem da tela
// (destaque primeiro), timeout folgado e cache local de 7 dias por URL,
// então da segunda visita em diante a capa sai do cache sem rede.

const CHAVE = 'bt-inicio-capas'
const VALIDADE = 7 * 86400000
const TIMEOUT = 20000
const SIMULTANEAS = 4

type Cache = Record<string, { src: string | null; em: number }>

function lerCache(): Cache {
  try { return JSON.parse(localStorage.getItem(CHAVE) || '{}') as Cache } catch { return {} }
}

function gravarCache(cache: Cache, agora: number) {
  try {
    const validas = Object.fromEntries(Object.entries(cache).filter(([, v]) => agora - v.em < VALIDADE))
    localStorage.setItem(CHAVE, JSON.stringify(validas))
  } catch { /* sem storage: só não guarda */ }
}

/** Capas já conhecidas (só cache, síncrono): a primeira pintura já sai com elas. `null` = sem capa. */
export function capasEmCache(urls: string[], agora = Date.now()): Record<string, string | null> {
  const cache = lerCache()
  return Object.fromEntries(urls.flatMap((url) => { const v = cache[url]; return v && agora - v.em < VALIDADE ? [[url, v.src]] : [] }))
}

/** Só imagem http(s) ou data:image entra no <img>. */
export const imagemSegura = (src: string | null | undefined) => (src && (/^https?:\/\//i.test(src) || /^data:image\//i.test(src)) ? src : undefined)

async function buscarCapa(url: string, fetchImpl: typeof fetch, signal: AbortSignal) {
  const controller = new AbortController()
  const abortar = () => controller.abort()
  signal.addEventListener('abort', abortar)
  const timer = setTimeout(abortar, TIMEOUT)
  try {
    const resposta = await fetchImpl(`https://api.microlink.io?url=${encodeURIComponent(url)}&meta=true`, { signal: controller.signal })
    // 429/5xx não é "sem imagem": lança para não ir ao cache e tentar de novo na próxima visita.
    if (!resposta.ok) throw new Error(`microlink ${resposta.status}`)
    const corpo = await resposta.json() as { data?: { image?: { url?: string } | string } }
    const image = corpo.data?.image
    return imagemSegura(typeof image === 'string' ? image : image?.url) ?? null
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abortar)
  }
}

/**
 * Busca as capas que faltam no cache, até SIMULTANEAS por vez na ordem recebida, e avisa cada uma assim que chega.
 * Falha de rede ou cota não entra no cache (tenta de novo na próxima visita); "sem imagem" entra.
 */
export async function carregarCapas(urls: string[], onCapa: (url: string, src: string | null) => void, signal: AbortSignal, fetchImpl: typeof fetch = (...a) => fetch(...a)) {
  const conhecidas = capasEmCache(urls)
  const fila = [...new Set(urls)].filter((url) => !(url in conhecidas))
  const trabalhar = async () => {
    for (let url = fila.shift(); url && !signal.aborted; url = fila.shift()) {
      try {
        const src = await buscarCapa(url, fetchImpl, signal)
        if (signal.aborted) return
        const cache = lerCache()
        cache[url] = { src, em: Date.now() }
        gravarCache(cache, Date.now())
        onCapa(url, src)
      } catch { /* timeout, rede ou cota: fica o fallback */ }
    }
  }
  await Promise.all(Array.from({ length: SIMULTANEAS }, trabalhar))
}
