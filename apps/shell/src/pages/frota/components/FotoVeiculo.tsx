import { Car } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { DataSource } from '../data/source'

// Cache por veículo: cada foto custa 2 chamadas de Flow, então a lista busca no máximo 3 por vez.
const cache = new WeakMap<DataSource, Map<string, Promise<string | null>>>()
const listeners = new Set<(id: string) => void>()
const MAX_PARALELO = 3
let ativos = 0
const fila: (() => void)[] = []

function limitar<T>(task: () => Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      ativos++
      task().then(resolve, reject).finally(() => { ativos--; fila.shift()?.() })
    }
    if (ativos < MAX_PARALELO) run()
    else fila.push(run)
  })
}

// Cache persistente (Cache Storage): a foto já vista aparece na hora e é revalidada em segundo plano uma vez por sessão.
const CACHE_NOME = 'frota-fotos-v1'
const cacheKey = (id: string) => `/__frota-foto/${encodeURIComponent(id)}`

async function lerPersistido(id: string) {
  try {
    if (typeof caches === 'undefined') return null
    const resp = await (await caches.open(CACHE_NOME)).match(cacheKey(id))
    return resp ? await resp.blob() : null
  } catch { return null }
}

async function gravarPersistido(id: string, blob: Blob | null) {
  try {
    if (typeof caches === 'undefined') return
    const store = await caches.open(CACHE_NOME)
    if (blob) await store.put(cacheKey(id), new Response(blob, { headers: { 'Content-Type': blob.type } }))
    else await store.delete(cacheKey(id))
  } catch { /* Sem Cache Storage: segue só com a memória. */ }
}

function buscarRemoto(source: DataSource, id: string) {
  return limitar(() => source.fotoVeiculo(id)).then(async (blob) => { await gravarPersistido(id, blob); return blob })
}

function fotoUrl(source: DataSource, id: string) {
  let porId = cache.get(source)
  if (!porId) cache.set(source, (porId = new Map()))
  let url = porId.get(id)
  if (!url) {
    const mapa = porId
    const atual: Promise<string | null> = lerPersistido(id).then((salvo) => {
      if (!salvo) return buscarRemoto(source, id).then((blob) => (blob ? URL.createObjectURL(blob) : null))
      const local = URL.createObjectURL(salvo)
      // Revalida sem bloquear; troca a imagem só se mudou.
      buscarRemoto(source, id).then((blob) => {
        if (mapa.get(id) !== atual || (blob && blob.size === salvo.size && blob.type === salvo.type)) return
        mapa.set(id, Promise.resolve(blob ? URL.createObjectURL(blob) : null))
        URL.revokeObjectURL(local)
        listeners.forEach((listener) => listener(id))
      }, () => undefined)
      return local
    })
    atual.catch(() => mapa.delete(id))
    porId.set(id, (url = atual))
  }
  return url
}

/** Descarta a foto em cache e avisa quem mostra o veículo para buscar de novo. */
export function invalidarFoto(source: DataSource, id: string) {
  const porId = cache.get(source)
  void porId?.get(id)?.then((url) => { if (url) URL.revokeObjectURL(url) }, () => undefined)
  porId?.delete(id)
  void gravarPersistido(id, null)
  listeners.forEach((listener) => listener(id))
}

export function useFotoVeiculo(source: DataSource, id: string, ativo = true) {
  const [state, setState] = useState<{ url: string | null; loading: boolean; error: string | null }>({ url: null, loading: true, error: null })
  const [versao, setVersao] = useState(0)
  useEffect(() => {
    const listener = (changed: string) => { if (changed === id) setVersao((v) => v + 1) }
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [id])
  useEffect(() => {
    if (!ativo) return
    let vivo = true
    setState((current) => ({ ...current, loading: true, error: null }))
    fotoUrl(source, id).then(
      (url) => { if (vivo) setState({ url, loading: false, error: null }) },
      (reason: unknown) => { if (vivo) setState({ url: null, loading: false, error: reason instanceof Error ? reason.message : String(reason) }) },
    )
    return () => { vivo = false }
  }, [source, id, versao, ativo])
  return state
}

export function FotoVeiculo({ source, id, alt, size = 'thumb' }: { source: DataSource; id: string; alt: string; size?: 'thumb' | 'hero' }) {
  // Só busca quando o card chega perto da tela: as fotos visíveis vêm primeiro na fila.
  const ref = useRef<HTMLDivElement>(null)
  const [visivel, setVisivel] = useState(typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const el = ref.current
    if (visivel || !el) return
    const obs = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { setVisivel(true); obs.disconnect() } }, { rootMargin: '300px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [visivel])
  const { url, loading, error } = useFotoVeiculo(source, id, visivel)
  return (
    <div ref={ref} className={`frota-foto frota-foto--${size}`} data-loading={loading || undefined} title={error ? `Foto indisponível: ${error}` : undefined}>
      {url ? <img src={url} alt={alt} decoding="async" /> : !loading && <Car size={size === 'hero' ? 40 : 18} aria-label={error ? 'Foto indisponível' : 'Sem foto'} />}
    </div>
  )
}
