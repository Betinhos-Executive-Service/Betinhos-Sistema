import { Car } from 'lucide-react'
import { useEffect, useState } from 'react'
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

function fotoUrl(source: DataSource, id: string) {
  let porId = cache.get(source)
  if (!porId) cache.set(source, (porId = new Map()))
  let url = porId.get(id)
  if (!url) {
    url = limitar(() => source.fotoVeiculo(id)).then((blob) => (blob ? URL.createObjectURL(blob) : null))
    url.catch(() => porId.delete(id))
    porId.set(id, url)
  }
  return url
}

/** Descarta a foto em cache e avisa quem mostra o veículo para buscar de novo. */
export function invalidarFoto(source: DataSource, id: string) {
  const porId = cache.get(source)
  void porId?.get(id)?.then((url) => { if (url) URL.revokeObjectURL(url) }, () => undefined)
  porId?.delete(id)
  listeners.forEach((listener) => listener(id))
}

export function useFotoVeiculo(source: DataSource, id: string) {
  const [state, setState] = useState<{ url: string | null; loading: boolean; error: string | null }>({ url: null, loading: true, error: null })
  const [versao, setVersao] = useState(0)
  useEffect(() => {
    const listener = (changed: string) => { if (changed === id) setVersao((v) => v + 1) }
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [id])
  useEffect(() => {
    let vivo = true
    setState((current) => ({ ...current, loading: true, error: null }))
    fotoUrl(source, id).then(
      (url) => { if (vivo) setState({ url, loading: false, error: null }) },
      (reason: unknown) => { if (vivo) setState({ url: null, loading: false, error: reason instanceof Error ? reason.message : String(reason) }) },
    )
    return () => { vivo = false }
  }, [source, id, versao])
  return state
}

export function FotoVeiculo({ source, id, alt, size = 'thumb' }: { source: DataSource; id: string; alt: string; size?: 'thumb' | 'hero' }) {
  const { url, loading, error } = useFotoVeiculo(source, id)
  return (
    <div className={`frota-foto frota-foto--${size}`} data-loading={loading || undefined} title={error ? `Foto indisponível: ${error}` : undefined}>
      {url ? <img src={url} alt={alt} loading="lazy" /> : !loading && <Car size={size === 'hero' ? 40 : 18} aria-label={error ? 'Foto indisponível' : 'Sem foto'} />}
    </div>
  )
}
