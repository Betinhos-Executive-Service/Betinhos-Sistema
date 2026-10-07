import { useCallback, useMemo, useRef, type MouseEvent, type PointerEvent } from 'react'
import { passedThreshold, resolveDrop } from './domain/drag'

type Session = { id: string; from: number; el: HTMLElement; x: number; y: number; pointerId: number; dragging: boolean }
export type BoardDrag = ReturnType<typeof useBoardDrag>

const SETTLE = 'transform var(--bt-duration-normal) var(--bt-ease-out)'

function columnAt(x: number, y: number) {
  const column = document.elementsFromPoint(x, y).find((node): node is HTMLElement => node instanceof HTMLElement && node.matches('[data-stage]'))
  return column ? Number(column.dataset.stage) : null
}

/** Marca a coluna-alvo direto no DOM, sem re-render a cada movimento. */
function markOver(value: number | null) {
  document.querySelectorAll('[data-stage][data-over]').forEach((node) => node.removeAttribute('data-over'))
  if (value != null) document.querySelector(`[data-stage="${value}"]`)?.setAttribute('data-over', '')
}

/** Leva o elemento de um deslocamento até a posição natural em 200 ms (FLIP). */
export function playSettle(el: HTMLElement, x: number, y: number) {
  el.style.transition = 'none'
  el.style.transform = `translate3d(${x}px, ${y}px, 0)`
  void el.offsetWidth // força o layout com o deslocamento antes de animar
  el.style.transition = SETTLE
  el.style.transform = ''
  el.addEventListener('transitionend', () => { el.style.transition = '' }, { once: true })
}

/**
 * Arrasto de cards entre colunas `[data-stage]` com pointer events e pointer capture.
 * Só mouse e caneta; toque usa o menu "Mover para…". `onDrop` devolve false quando a mudança espera confirmação.
 */
export function useBoardDrag(onDrop: (id: string, target: number) => boolean) {
  const session = useRef<Session | null>(null)
  const suppressClick = useRef(false)
  const pendingSettle = useRef<{ id: string; left: number; top: number } | null>(null)
  const dropRef = useRef(onDrop)
  dropRef.current = onDrop

  const finish = useCallback((event: PointerEvent<HTMLElement>, drop: boolean) => {
    const s = session.current
    if (!s || s.pointerId !== event.pointerId) return
    session.current = null
    if (!s.dragging) return
    suppressClick.current = true
    window.setTimeout(() => { suppressClick.current = false }, 0)
    markOver(null)
    s.el.classList.remove('is-dragging')
    const dx = event.clientX - s.x
    const dy = event.clientY - s.y
    const target = drop ? resolveDrop(s.from, columnAt(event.clientX, event.clientY)) : null
    if (target != null) {
      const rect = s.el.getBoundingClientRect()
      pendingSettle.current = { id: s.id, left: rect.left, top: rect.top }
      s.el.style.transform = ''
      if (dropRef.current(s.id, target)) return
      pendingSettle.current = null
    }
    playSettle(s.el, dx, dy)
  }, [])

  const bind = useCallback((id: string, from: number) => ({
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.button !== 0 || event.pointerType === 'touch') return
      if ((event.target as HTMLElement).closest('[data-no-drag]')) return
      session.current = { id, from, el: event.currentTarget, x: event.clientX, y: event.clientY, pointerId: event.pointerId, dragging: false }
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const s = session.current
      if (!s || s.pointerId !== event.pointerId) return
      const dx = event.clientX - s.x
      const dy = event.clientY - s.y
      if (!s.dragging) {
        if (!passedThreshold(dx, dy)) return
        s.dragging = true
        s.el.setPointerCapture(event.pointerId)
        s.el.classList.add('is-dragging')
      }
      s.el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`
      const over = columnAt(event.clientX, event.clientY)
      markOver(over === s.from ? null : over)
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => finish(event, true),
    onPointerCancel: (event: PointerEvent<HTMLElement>) => finish(event, false),
    onClickCapture(event: MouseEvent<HTMLElement>) {
      if (!suppressClick.current) return
      suppressClick.current = false
      event.preventDefault()
      event.stopPropagation()
    },
  }), [finish])

  return useMemo(() => ({ bind, pendingSettle }), [bind])
}
