import { useEffect, useRef, type RefObject } from 'react'
import { Alert, Button, Spinner } from '@betinhos/ui'

/** "100 de 220 serviços" (com total), "100+ serviços" (sem total, ainda há mais) ou "220 serviços" (tudo carregado). */
export function statusText(loaded: number, total: number | null, more: boolean): string {
  const count = (n: number) => `${n} ${n === 1 ? 'serviço' : 'serviços'}`
  if (!more) return count(total ?? loaded)
  return total != null ? `${loaded} de ${total} serviços` : `${loaded}+ serviços`
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

type Props = {
  root: RefObject<HTMLElement | null> | null
  more: boolean
  /** Primeira carga (ou recarga) em andamento: o rodapé não pede mais enquanto isso. */
  loading: boolean
  loadingMore: boolean
  error: string | null
  loaded: number
  total: number | null
  onLoadMore: () => void
  onRetry: () => void
  /** `false` quando o sentinela vive dentro do contêiner de rolagem (tabela), fora do rodapé. */
  sentinel?: boolean
  /** Celular: botões com 44 px. */
  touch?: boolean
}

/** Rodapé de estado da lista: quantas linhas há, carregando, "Carregar mais", fim da lista ou erro com nova tentativa. */
export function LoadMore({ root, more, loading, loadingMore, error, loaded, total, onLoadMore, onRetry, sentinel = true, touch = false }: Props) {
  const size = touch ? 'touch' : 'compact'
  const idle = more && !loading && !loadingMore && !error
  return (
    <>
      {sentinel ? <LoadSentinel root={root} active={idle} loaded={loaded} onLoadMore={onLoadMore} /> : null}
      <div className="gr-loadmore" role="status">
        <span>{loading && loaded === 0 ? 'Carregando…' : loaded === 0 && !more ? 'Nenhum serviço' : statusText(loaded, total, more)}</span>
        <div className="gr-loadmore__right">
          {loadingMore ? <><Spinner size={16} label="Carregando mais serviços" /><span>Carregando mais…</span></> : null}
          {idle ? <Button variant="ghost" size={size} onClick={onLoadMore}>Carregar mais</Button> : null}
          {!more && !loading && loaded > 0 ? <span>Fim da lista</span> : null}
          {error ? <Alert tone="danger" className="gr-loadmore__error" action={<Button variant="secondary" size={size} onClick={onRetry}>Tentar novamente</Button>}>{error}</Alert> : null}
        </div>
      </div>
    </>
  )
}
