import { useEffect } from 'react'

/** Tempo com o ponteiro quase parado sobre o texto até o cartão abrir. */
export const REST_MS = 450
/** Movimento tolerado (px) durante a espera; passou disso, a espera recomeça de onde o ponteiro está. */
export const TOLERANCE_PX = 6
/** Folga para o ponteiro sair do texto e chegar ao cartão (ou voltar) sem ele fechar. */
export const CLOSE_MS = 120

const TRIGGER = '.lookup-preview'

/**
 * Intenção de hover dos cartões da grade (trajeto, cliente, registro relacionado): o cartão só abre com o ponteiro
 * quase parado sobre o texto, então passar o mouse pela grade não abre nada. Aberto, ele marca `data-open` no
 * `.lookup-preview` e fica aberto enquanto o ponteiro estiver no texto ou no cartão.
 */
export function LookupHoverIntent() {
  useEffect(() => {
    let pending: HTMLElement | null = null
    let open: HTMLElement | null = null
    let restTimer: number | null = null
    let closeTimer: number | null = null
    let anchor = { x: 0, y: 0 }

    const stopRest = () => { if (restTimer !== null) window.clearTimeout(restTimer); restTimer = null }
    const stopClose = () => { if (closeTimer !== null) window.clearTimeout(closeTimer); closeTimer = null }
    const close = () => { stopClose(); if (open) delete open.dataset.open; open = null }
    const startRest = (el: HTMLElement, x: number, y: number) => {
      stopRest()
      pending = el
      anchor = { x, y }
      restTimer = window.setTimeout(() => {
        restTimer = null
        pending = null
        if (open && open !== el) close()
        stopClose()
        open = el
        el.dataset.open = ''
      }, REST_MS)
    }
    const triggerOf = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>(TRIGGER) : null

    const onOver = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      const el = triggerOf(event.target)
      if (el && el === open) { stopClose(); return }
      if (el && el !== pending) startRest(el, event.clientX, event.clientY)
    }
    const onMove = (event: PointerEvent) => {
      if (!pending || restTimer === null) return
      // Movimento maior que a tolerância: ainda passando pela grade, a espera recomeça.
      if (Math.hypot(event.clientX - anchor.x, event.clientY - anchor.y) > TOLERANCE_PX) startRest(pending, event.clientX, event.clientY)
    }
    const onOut = (event: PointerEvent) => {
      const from = triggerOf(event.target)
      const to = triggerOf(event.relatedTarget)
      if (!from || from === to) return
      if (from === pending) { stopRest(); pending = null }
      if (from === open) { stopClose(); closeTimer = window.setTimeout(close, CLOSE_MS) }
    }
    const onDown = (event: PointerEvent) => {
      stopRest(); pending = null
      // Clicar dentro do cartão (copiar, selecionar) não fecha; fora dele, fecha na hora.
      if (open && !(event.target instanceof Node && open.contains(event.target))) close()
    }
    const onScroll = () => { stopRest(); pending = null; close() }

    document.addEventListener('pointerover', onOver)
    document.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerout', onOut)
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('blur', onScroll)
    return () => {
      stopRest(); close()
      document.removeEventListener('pointerover', onOver)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerout', onOut)
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('blur', onScroll)
    }
  }, [])
  return null
}
