import type { RefObject } from 'react'
import { Alert, Button, Spinner } from '@betinhos/ui'
import { LoadSentinel } from '../../../app/LazyList'

export { LoadSentinel }

/** "100 de 220 serviços" (com total), "100+ serviços" (sem total, ainda há mais) ou "220 serviços" (tudo carregado). */
export function statusText(loaded: number, total: number | null, more: boolean): string {
  const count = (n: number) => `${n} ${n === 1 ? 'serviço' : 'serviços'}`
  if (!more) return count(total ?? loaded)
  return total != null ? `${loaded} de ${total} serviços` : `${loaded}+ serviços`
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
  /** Celular: botão de nova tentativa com 44 px. */
  touch?: boolean
}

/**
 * Rodapé de estado da lista: quantas linhas há, carregando, fim da lista ou erro com nova tentativa.
 * Não há paginação visível: a próxima página vem pelo sentinela (rolagem infinita), nunca por botão.
 */
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
          {!more && !loading && loaded > 0 ? <span>Fim da lista</span> : null}
          {error ? <Alert tone="danger" className="gr-loadmore__error" action={<Button variant="secondary" size={size} onClick={onRetry}>Tentar novamente</Button>}>{error}</Alert> : null}
        </div>
      </div>
    </>
  )
}
