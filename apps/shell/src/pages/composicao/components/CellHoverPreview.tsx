import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { portalHost } from './portal-host'
import { CopyText } from './CopyText'

type Preview = { text: string; formula: string | null; x: number; y: number; instant: boolean }

const DELAY_MS = 350
const OFFSET = 14
/** Folga entre o ponteiro e a ponte invisível do popup: o ponteiro parado não fica em cima dele. */
const GAP = 2
/** Tempo para o ponteiro sair da célula e alcançar o popup sem ele sumir. */
const CLOSE_MS = 120
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

/** Popup rápido ao lado do mouse com o conteúdo completo da célula da grade; o ponteiro pode entrar nele para selecionar ou copiar. */
export function CellHoverPreview() {
  const [preview, setPreview] = useState<Preview | null>(null)
  const timer = useRef<number | null>(null)
  const current = useRef<HTMLElement | null>(null)
  const visible = useRef(false)
  const card = useRef<HTMLDivElement>(null)
  const closing = useRef<number | null>(null)

  useEffect(() => {
    if (!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return
    const inCard = (target: EventTarget | null) => target instanceof Node && Boolean(card.current?.contains(target))
    const stopClosing = () => { if (closing.current !== null) window.clearTimeout(closing.current); closing.current = null }
    const clear = () => { if (timer.current !== null) window.clearTimeout(timer.current); timer.current = null; stopClosing() }
    const hide = () => { clear(); current.current = null; visible.current = false; setPreview(null) }
    const hideSoon = () => { stopClosing(); closing.current = window.setTimeout(hide, CLOSE_MS) }

    const onOver = (event: PointerEvent) => {
      // Dentro do popup ele fica aberto, para selecionar ou copiar o texto.
      if (inCard(event.target)) { stopClosing(); return }
      const cell = (event.target as Element | null)?.closest?.<HTMLElement>(CELL_SELECTOR) ?? null
      if (cell === current.current) { stopClosing(); return }
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
      if (timer.current === null || !current.current || inCard(event.target)) return
      // Ainda esperando: o popup nasce onde o mouse parou.
      const content = readCell(current.current)
      clear()
      if (!content) return
      const { clientX: x, clientY: y } = event
      timer.current = window.setTimeout(() => { visible.current = true; setPreview({ ...content, x, y, instant: false }) }, DELAY_MS)
    }
    const onLeave = (event: PointerEvent) => {
      const next = event.relatedTarget as Element | null
      if (inCard(next) || next?.closest?.(CELL_SELECTOR)) return
      if (visible.current) hideSoon(); else hide()
    }
    const onPointerDown = (event: PointerEvent) => { if (!inCard(event.target)) hide() }
    // Ctrl+C com o texto do popup selecionado não fecha o popup.
    const onKeyDown = (event: KeyboardEvent) => { if (!inCard(window.getSelection()?.anchorNode ?? null) && !inCard(event.target)) hide() }

    document.addEventListener('pointerover', onOver)
    document.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerout', onLeave)
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('scroll', hide, true)
    window.addEventListener('blur', hide)
    return () => {
      clear()
      document.removeEventListener('pointerover', onOver)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerout', onLeave)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('scroll', hide, true)
      window.removeEventListener('blur', hide)
    }
  }, [])

  const [flip, setFlip] = useState({ x: false, y: false })
  useLayoutEffect(() => {
    const el = card.current
    if (!el || !preview) return
    const rect = el.getBoundingClientRect()
    setFlip({ x: preview.x + OFFSET + rect.width > window.innerWidth - 8, y: preview.y + OFFSET + rect.height > window.innerHeight - 8 })
  }, [preview])

  if (!preview) return null
  // A caixa começa colada no ponteiro e o espaço até o cartão é uma ponte invisível: o caminho até o popup não o fecha.
  const left = flip.x ? preview.x - GAP : preview.x + GAP
  const top = flip.y ? preview.y - GAP : preview.y + GAP
  const bridge = OFFSET - GAP
  return createPortal(
    <div
      ref={card}
      className="cell-hover-preview"
      role="tooltip"
      style={{
        left, top,
        transform: `translate(${flip.x ? '-100%' : '0'}, ${flip.y ? '-100%' : '0'})`,
        [flip.x ? 'paddingRight' : 'paddingLeft']: bridge,
        [flip.y ? 'paddingBottom' : 'paddingTop']: bridge,
      }}
    >
      <div className="cell-hover-preview__card" data-instant={preview.instant || undefined} style={{ transformOrigin: `${flip.y ? 'bottom' : 'top'} ${flip.x ? 'right' : 'left'}` }}>
        <div className="cell-hover-preview__value"><CopyText text={preview.text} /></div>
        {preview.formula ? <div className="cell-hover-preview__formula"><span aria-hidden="true">ƒx</span><CopyText text={preview.formula} /></div> : null}
      </div>
    </div>,
    portalHost(),
  )
}
