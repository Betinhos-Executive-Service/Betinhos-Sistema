import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import { Skeleton, Spinner } from '@betinhos/ui'

/** Paginação incremental: avisa quando o fim da lista chega perto (700 px), com fallback de scroll/resize. */
export function LoadMoreSentinel({ label, text, onVisible }: { label: string; text: string; onVisible: () => void }) {
  const node = useRef<HTMLDivElement | null>(null)
  const callback = useRef(onVisible)
  callback.current = onVisible
  useLayoutEffect(() => {
    const element = node.current
    if (!element) return
    if (typeof IntersectionObserver === 'function') {
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) callback.current()
      }, { rootMargin: '700px 0px' })
      observer.observe(element)
      return () => observer.disconnect()
    }
    const checkPosition = () => {
      if (element.getBoundingClientRect().top <= window.innerHeight + 700) callback.current()
    }
    document.addEventListener('scroll', checkPosition, true)
    window.addEventListener('resize', checkPosition)
    window.requestAnimationFrame(checkPosition)
    return () => {
      document.removeEventListener('scroll', checkPosition, true)
      window.removeEventListener('resize', checkPosition)
    }
  }, [])
  return (
    <div ref={node} className="list-load-sentinel">
      <Spinner label={label} size={16} />
      <span aria-hidden="true">{text}</span>
    </div>
  )
}

export function SkeletonList() {
  return (
    <div className="skeleton-list" role="status" aria-busy="true" aria-label="Carregando serviços">
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="skeleton-card" style={{ '--item-index': index } as CSSProperties} aria-hidden="true">
          <Skeleton shape="rect" width={56} height={40} />
          <span className="skeleton-stack"><Skeleton width="30%" /><Skeleton /><Skeleton width="60%" /></span>
        </div>
      ))}
    </div>
  )
}

export const ListHead = () => (
  <div className="list-head" aria-hidden="true"><span>Saída</span><span>Pedido</span><span>Trajeto e cliente</span><span>Motorista</span><span></span></div>
)
