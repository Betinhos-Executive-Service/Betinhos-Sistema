import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Dialog } from '@betinhos/ui'

/** Mensagem que o Formulário Geral envia ao shell (`?host=shell`) quando o usuário fecha o formulário. */
export const FORM_CLOSE_MESSAGE = 'betinhos:formulario-geral:fechar'
const EXIT_MS = 160

/**
 * Formulário Geral em iframe sobre a tela, dentro do shell (não abre outra aba).
 * Fecha pela mensagem do próprio formulário ou por Esc; clicar no fundo pede confirmação,
 * porque o shell não enxerga se há alteração não salva lá dentro.
 */
export function FormOverlay({ url, onClose }: { url: string; onClose: () => void }) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const closing = useRef(false)
  const timer = useRef<number | undefined>(undefined)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = requestAnimationFrame(() => { setOpen(true); rootRef.current?.focus() })
    return () => { cancelAnimationFrame(frame); window.clearTimeout(timer.current); previous?.focus?.() }
  }, [])

  const close = useCallback(() => {
    if (closing.current) return
    closing.current = true
    setConfirming(false)
    setOpen(false)
    timer.current = window.setTimeout(() => onCloseRef.current(), EXIT_MS)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !confirming) setConfirming(true) }
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown } | null
      if (event.origin === window.location.origin && data?.type === FORM_CLOSE_MESSAGE) close()
    }
    document.addEventListener('keydown', onKey)
    window.addEventListener('message', onMessage)
    return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('message', onMessage) }
  }, [close, confirming])

  return (
    <div ref={rootRef} className={`gr-form${open ? ' is-open' : ''}`} role="dialog" aria-modal="true" aria-label="Formulário do serviço" tabIndex={-1}>
      <div className="gr-form__backdrop" onMouseDown={() => setConfirming(true)} />
      <iframe className="gr-form__frame" title="Formulário do serviço" src={url} />
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        tone="danger"
        title="Fechar o formulário?"
        actions={<>
          <Button variant="secondary" onClick={() => setConfirming(false)}>Continuar editando</Button>
          <Button variant="danger" onClick={close}>Fechar formulário</Button>
        </>}
      >
        Alterações que ainda não foram salvas no formulário serão perdidas.
      </Dialog>
    </div>
  )
}
