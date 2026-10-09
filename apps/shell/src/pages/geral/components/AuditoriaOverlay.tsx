import { useCallback, useEffect, useRef, useState } from 'react'

const EXIT_MS = 160

/** Auditoria em iframe sobre a tela (92% x 88%); fecha por Esc ou clique no fundo. */
export function AuditoriaOverlay({ url, onClose }: { url: string; onClose: () => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const closing = useRef(false)
  const timer = useRef<number | undefined>(undefined)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Entrada: a classe só entra no quadro seguinte, para a transição de opacidade rodar.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = requestAnimationFrame(() => { setOpen(true); rootRef.current?.focus() })
    return () => { cancelAnimationFrame(frame); window.clearTimeout(timer.current); previous?.focus?.() }
  }, [])

  const close = useCallback(() => {
    if (closing.current) return
    closing.current = true
    setOpen(false)
    timer.current = window.setTimeout(() => onCloseRef.current(), EXIT_MS)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey) }
  }, [close])

  return (
    <div ref={rootRef} className={`gr-auditoria${open ? ' is-open' : ''}`} role="dialog" aria-modal="true" aria-label="Auditoria" tabIndex={-1}>
      <div className="gr-auditoria__backdrop" onMouseDown={close} />
      <iframe className="gr-auditoria__frame" title="Auditoria" src={url} />
    </div>
  )
}
