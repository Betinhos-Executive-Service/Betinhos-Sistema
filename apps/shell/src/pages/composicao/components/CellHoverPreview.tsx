import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { portalHost } from './portal-host'

type Preview = { text: string; formula: string | null; x: number; y: number; instant: boolean }

const DELAY_MS = 350
const OFFSET = 14
const CELL_SELECTOR = '.price-grid tbody td'

function isTruncated(cell: HTMLElement) {
  if (cell.scrollWidth > cell.clientWidth + 1) return true
  return Array.from(cell.querySelectorAll<HTMLElement>('*')).some((el) => el.scrollWidth > el.clientWidth + 1)
}

/** O que a célula sob o ponteiro tem a mostrar: texto cortado ou fórmula (resultado em cima, conta embaixo). */
function readCell(cell: HTMLElement): Pick<Preview, 'text' | 'formula'> | null {
  // Edição, seleção de linha e células com cartão próprio (lookup) ficam de fora.
  if (cell.querySelector('input, textarea, select, .lookup-preview, [role="checkbox"]')) return null
  const formula = cell.querySelector<HTMLElement>('[data-cell-formula]')?.dataset.cellFormula || null
  const text = (cell.querySelector<HTMLElement>('.money-cell-value')?.lastChild?.textContent ?? cell.innerText ?? cell.textContent ?? '').trim()
  if (!text || text === '—') return null
  if (!formula && !isTruncated(cell)) return null
  return { text, formula }
}

/** Popup rápido ao lado do mouse com o conteúdo completo da célula da grade. */
export function CellHoverPreview() {
  const [preview, setPreview] = useState<Preview | null>(null)
  const timer = useRef<number | null>(null)
  const current = useRef<HTMLElement | null>(null)
  const visible = useRef(false)

  useEffect(() => {
    if (!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return
    const clear = () => { if (timer.current !== null) window.clearTimeout(timer.current); timer.current = null }
    const hide = () => { clear(); current.current = null; visible.current = false; setPreview(null) }

    const onOver = (event: PointerEvent) => {
      const cell = (event.target as Element | null)?.closest?.<HTMLElement>(CELL_SELECTOR) ?? null
      if (cell === current.current) return
      current.current = cell
      clear()
      const content = cell ? readCell(cell) : null
      if (!content) { if (visible.current) { visible.current = false; setPreview(null) } return }
      const { clientX: x, clientY: y } = event
      // Depois do primeiro popup, as células vizinhas abrem na hora e sem animação.
      if (visible.current) { setPreview({ ...content, x, y, instant: true }); return }
      timer.current = window.setTimeout(() => { visible.current = true; setPreview({ ...content, x, y, instant: false }) }, DELAY_MS)
    }
    const onMove = (event: PointerEvent) => {
      if (timer.current === null || !current.current) return
      // Ainda esperando: o popup nasce onde o mouse parou.
      const content = readCell(current.current)
      clear()
      if (!content) return
      const { clientX: x, clientY: y } = event
      timer.current = window.setTimeout(() => { visible.current = true; setPreview({ ...content, x, y, instant: false }) }, DELAY_MS)
    }
    const onLeave = (event: PointerEvent) => { if (!(event.relatedTarget as Element | null)?.closest?.(CELL_SELECTOR)) hide() }

    document.addEventListener('pointerover', onOver)
    document.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerout', onLeave)
    document.addEventListener('pointerdown', hide, true)
    document.addEventListener('keydown', hide, true)
    document.addEventListener('scroll', hide, true)
    window.addEventListener('blur', hide)
    return () => {
      clear()
      document.removeEventListener('pointerover', onOver)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerout', onLeave)
      document.removeEventListener('pointerdown', hide, true)
      document.removeEventListener('keydown', hide, true)
      document.removeEventListener('scroll', hide, true)
      window.removeEventListener('blur', hide)
    }
  }, [])

  const card = useRef<HTMLDivElement>(null)
  const [flip, setFlip] = useState({ x: false, y: false })
  useLayoutEffect(() => {
    const el = card.current
    if (!el || !preview) return
    const rect = el.getBoundingClientRect()
    setFlip({ x: preview.x + OFFSET + rect.width > window.innerWidth - 8, y: preview.y + OFFSET + rect.height > window.innerHeight - 8 })
  }, [preview])

  if (!preview) return null
  const left = flip.x ? preview.x - OFFSET : preview.x + OFFSET
  const top = flip.y ? preview.y - OFFSET : preview.y + OFFSET
  return createPortal(
    <div
      ref={card}
      className="cell-hover-preview"
      aria-hidden="true"
      style={{ left, top, transform: `translate(${flip.x ? '-100%' : '0'}, ${flip.y ? '-100%' : '0'})` }}
    >
      <div className="cell-hover-preview__card" data-instant={preview.instant || undefined} style={{ transformOrigin: `${flip.y ? 'bottom' : 'top'} ${flip.x ? 'right' : 'left'}` }}>
        <div className="cell-hover-preview__value">{preview.text}</div>
        {preview.formula ? <div className="cell-hover-preview__formula"><span aria-hidden="true">ƒx</span>{preview.formula}</div> : null}
      </div>
    </div>,
    portalHost(),
  )
}
