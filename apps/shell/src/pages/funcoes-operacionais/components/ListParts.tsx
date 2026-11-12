import { useLayoutEffect, useRef } from 'react'
import { Spinner } from '@betinhos/ui'
import { BrandLoader } from '../../../app/BrandLoader'

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

/** Primeira carga das listas: loader da marca no lugar dos cards (nome mantido pelos chamadores). */
export function SkeletonList() {
  return <BrandLoader variant="inline" label="Carregando serviços" text="Carregando serviços…" />
}

export const ListHead = () => (
  <div className="list-head" aria-hidden="true"><span>Saída</span><span>Pedido</span><span>Trajeto e cliente</span><span>Motorista</span><span></span></div>
)
