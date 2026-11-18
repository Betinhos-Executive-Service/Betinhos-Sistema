import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { highlightRanges } from './keywordSearch'
import './SearchHighlight.css'

const NAME = 'search-hit'
/** Texto que não se marca: cabeçalho da tabela, campos de digitação e o que está escondido de leitores de tela. */
const SKIP = '.bt-table__head, input, textarea, select, [contenteditable], [aria-hidden="true"], [data-search-hits="off"]'

// Um registro só para a página inteira; cada área entra e sai com os seus trechos.
let shared: Highlight | null = null
function registry() {
  if (typeof CSS === 'undefined' || !('highlights' in CSS) || typeof Highlight === 'undefined') return null
  if (!shared) { shared = new Highlight(); CSS.highlights.set(NAME, shared) }
  return shared
}

function rangesIn(root: Element, tokens: string[]) {
  const found: Range[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => node.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  })
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    for (const [start, end] of highlightRanges(node.textContent ?? '', tokens)) {
      const range = document.createRange()
      range.setStart(node, start)
      range.setEnd(node, end)
      found.push(range)
    }
  }
  return found
}

/**
 * Marca as palavras da busca no texto já desenhado dentro da área (tabela, cartões), sem mexer nas células: usa o
 * CSS Custom Highlight (`::highlight(search-hit)`) e refaz quando a área muda (rolagem virtual, página nova).
 * Navegador sem a API fica sem destaque, e a busca continua igual.
 */
export function SearchHits({ tokens, children }: { tokens: string[]; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const key = tokens.join('\u0000')
  useLayoutEffect(() => {
    const highlight = registry()
    const root = ref.current
    if (!highlight || !root || !key) return
    const words = key.split('\u0000')
    let mine: Range[] = []
    let frame = 0
    const paint = () => {
      frame = 0
      for (const range of mine) highlight.delete(range)
      mine = rangesIn(root, words)
      for (const range of mine) highlight.add(range)
    }
    paint()
    const observer = new MutationObserver(() => { if (!frame) frame = requestAnimationFrame(paint) })
    observer.observe(root, { childList: true, subtree: true, characterData: true })
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      for (const range of mine) highlight.delete(range)
    }
  }, [key])
  return <div ref={ref} className="search-hits">{children}</div>
}
