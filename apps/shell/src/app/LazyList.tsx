import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import './lazy.css'

export const LAZY_BATCH = 50

/**
 * Lazy loading de renderização para listas já carregadas em memória (filtro no cliente):
 * mostra `size` linhas e revela mais `size` a cada pedido. `resetKey` mudando (filtros) volta ao primeiro lote.
 */
export function useLazySlice<T>(list: T[], resetKey: unknown, size = LAZY_BATCH) {
  const [limit, setLimit] = useState(size)
  useEffect(() => { setLimit(size) }, [resetKey, size])
  const slice = useMemo(() => list.slice(0, limit), [list, limit])
  const loadMore = useCallback(() => setLimit((n) => n + size), [size])
  return { slice, more: list.length > slice.length, loadMore }
}

type SentinelProps = {
  /** Contêiner de rolagem (desktop); `null` = a janela (cards no celular). */
  root: RefObject<HTMLElement | null> | null
  /** Só existe sentinela quando há mais linhas e nada está carregando nem em erro. */
  active: boolean
  /** Linhas carregadas: ao mudar, o observador é recriado e avalia de novo se o sentinela ainda está perto da tela. */
  loaded: number
  onLoadMore: () => void
}

/** Marca depois da última linha: ao chegar a 800 px da tela pede a próxima página. Sem `IntersectionObserver`, o botão do rodapé cobre. */
export function LoadSentinel({ root, active, loaded, onLoadMore }: SentinelProps) {
  const node = useRef<HTMLDivElement>(null)
  const callback = useRef(onLoadMore)
  callback.current = onLoadMore
  useEffect(() => {
    const target = node.current
    if (!active || !target || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) callback.current()
    }, { root: root?.current ?? null, rootMargin: '800px 0px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [active, loaded, root])
  return active ? <div ref={node} className="gr-sentinel" aria-hidden="true" /> : null
}

type FooterProps = {
  loaded: number
  more: boolean
  onLoadMore: () => void
  /** A carga completa ainda está chegando do servidor: o fim da lista avisa em vez de parecer o fim. */
  pending?: boolean
}

/**
 * Fim da lista com rolagem infinita na janela. Sem paginação visível (decisão do Renan, 20/10/2026): nada de botão
 * "Carregar mais" nem contador de lote; só o aviso discreto enquanto o resto da lista chega do servidor.
 */
export function LazyFooter({ loaded, more, onLoadMore, pending = false }: FooterProps) {
  // Sem `IntersectionObserver` (navegador muito antigo) não há como saber da rolagem: revela o resto aos poucos.
  useEffect(() => {
    if (more && typeof IntersectionObserver === 'undefined') onLoadMore()
  }, [more, loaded, onLoadMore])
  return (
    <>
      <LoadSentinel root={null} active={more} loaded={loaded} onLoadMore={onLoadMore} />
      {pending && !more ? <div className="lazy-footer" role="status"><span className="lazy-footer__spin" aria-hidden="true" />Carregando o restante da lista…</div> : null}
    </>
  )
}
