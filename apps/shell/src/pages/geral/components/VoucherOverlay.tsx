import { useCallback, useEffect, useRef, useState } from 'react'

const CLOSE_MESSAGE = 'cr40f-voucher-confirmacao:close'
const EXIT_MS = 160

/** Voucher de confirmação em iframe sobre a tela; fecha por Esc, clique no fundo ou postMessage do próprio voucher. */
export function VoucherOverlay({ url, onClose }: { url: string; onClose: () => void }) {
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
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown } | null
      if (event.origin === window.location.origin && data?.type === CLOSE_MESSAGE) close()
    }
    document.addEventListener('keydown', onKey)
    window.addEventListener('message', onMessage)
    return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('message', onMessage) }
  }, [close])

  return (
    <div ref={rootRef} className={`gr-voucher${open ? ' is-open' : ''}`} role="dialog" aria-modal="true" aria-label="Voucher de confirmação" tabIndex={-1}>
      <div className="gr-voucher__backdrop" onMouseDown={close} />
      <iframe className="gr-voucher__frame" title="Voucher de confirmação" src={url} />
    </div>
  )
}
