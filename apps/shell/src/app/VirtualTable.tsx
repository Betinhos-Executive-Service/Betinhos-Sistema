import { Table, type TableProps } from '@betinhos/ui'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import './virtual.css'

/** Até aqui a lista desenha todas as linhas (o primeiro lote da rolagem infinita fica como sempre foi). */
export const VIRTUAL_FROM = 100

/**
 * Janela de linhas perto da tela dentro de `scroller`. `before`/`after` são as alturas (px) das linhas que ficaram de
 * fora, para a lista manter a altura total e a barra de rolagem. `scrollMargin` = onde a primeira linha começa no conteúdo
 * do `scroller`. Sem `scroller` com altura (jsdom, aba oculta) ou com poucas linhas devolve a lista inteira.
 */
export function useVirtualRows<T>(rows: T[], rowKey: (row: T) => string, scroller: HTMLElement | null, scrollMargin: number, estimate: number) {
  const enabled = rows.length > VIRTUAL_FROM && scroller != null && scroller.clientHeight > 0
  // Chave estável enquanto a lista não muda: função nova a cada quadro faria o virtualizador recalcular todas as linhas.
  const keyOf = useRef(rowKey)
  keyOf.current = rowKey
  const getItemKey = useCallback((index: number) => keyOf.current(rows[index]), [rows])
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller,
    estimateSize: () => estimate,
    getItemKey,
    overscan: 10,
    scrollMargin,
    enabled,
  })
  const items = virtualizer.getVirtualItems()
  if (!enabled || !items.length) return { virtual: false, visible: rows, start: 0, before: 0, after: 0, measure: undefined }
  const first = items[0]
  const last = items[items.length - 1]
  return {
    virtual: true,
    visible: rows.slice(first.index, last.index + 1),
    start: first.index,
    before: first.start - scrollMargin,
    after: Math.max(0, virtualizer.getTotalSize() - (last.end - scrollMargin)),
    measure: virtualizer.measureElement,
  }
}

/** Colunas a partir desta largura (px) encolhem; as menores (seleção, ícones) ficam fixas. */
const FIT_FROM = 64

/**
 * Modelo de colunas que cabe na largura: `Npx` (≥ FIT_FROM) vira `max(48px, min(Npx, fatia))`, com a fatia proporcional
 * a N no espaço que sobra depois das colunas fixas e dos espaçamentos. Exportada para teste.
 */
export function fitTemplate(template: string) {
  const tracks = template.match(/minmax\([^)]*\)|\S+/g) ?? []
  const px = (track: string) => (/^\d+(\.\d+)?px$/.test(track) ? Number.parseFloat(track) : null)
  const big = tracks.reduce((sum, t) => sum + ((px(t) ?? 0) >= FIT_FROM ? px(t)! : 0), 0)
  if (!big) return template
  const fixed = tracks.reduce((sum, t) => sum + ((px(t) ?? FIT_FROM) < FIT_FROM ? px(t)! : 0), 0)
  const free = `(100% - ${tracks.length - 1} * var(--bt-table-gap, 0px) - ${fixed}px)`
  return tracks.map((t) => ((px(t) ?? 0) >= FIT_FROM ? `max(48px, min(${t}, calc(${free} * ${px(t)! / big})))` : t)).join(' ')
}

/**
 * `Table` do DS que desenha só as linhas perto da tela quando a lista passa de `VIRTUAL_FROM`; rola no `main` do shell.
 * O pacote não virtualiza: aqui o `Table` recebe só a janela de linhas e as de fora viram margem antes da primeira e
 * depois da última (`virtual.css`). Limitação: o Ctrl+F do navegador só acha as linhas desenhadas.
 */
export function VirtualTable<Row>({ rows, rowKey, className, style, ...props }: TableProps<Row>) {
  const host = useRef<HTMLDivElement>(null)
  const [scroller, setScroller] = useState<HTMLElement | null>(null)
  const [scrollMargin, setScrollMargin] = useState(0)
  useLayoutEffect(() => { setScroller(host.current?.closest<HTMLElement>('.bt-shell__main') ?? null) }, [])
  const { virtual, visible, start, before, after, measure } = useVirtualRows(rows, rowKey, scroller, scrollMargin, 57)

  // Onde as linhas começam: muda com a barra de comandos acima (quebra de linha, chips), não com a rolagem.
  useLayoutEffect(() => {
    const table = host.current?.querySelector<HTMLElement>('.bt-table')
    if (!scroller || !table || !virtual) return
    const update = () => {
      const head = table.querySelector<HTMLElement>('.bt-table__head')
      const top = table.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop + (head?.offsetHeight ?? 0)
      setScrollMargin((current) => (Math.abs(top - current) > 1 ? top : current))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(scroller)
    return () => observer.disconnect()
  }, [scroller, virtual, rows])

  // Cada linha nova é medida uma vez (altura real, inclusive no celular); depois o ResizeObserver do virtualizador acompanha.
  // `aria-rowindex` mantém a posição real para o leitor de tela (o cabeçalho é a linha 1).
  const measured = useRef(new WeakSet<HTMLElement>())
  useLayoutEffect(() => {
    const nodes = host.current?.querySelectorAll<HTMLElement>('.bt-table__row:not(.bt-table__row--loading)') ?? []
    if (!measure) {
      measured.current = new WeakSet()
      nodes.forEach((node) => node.removeAttribute('aria-rowindex'))
      return
    }
    nodes.forEach((node, offset) => {
      const index = String(start + offset)
      if (node.dataset.index === index && measured.current.has(node)) return
      node.dataset.index = index
      node.setAttribute('aria-rowindex', String(start + offset + 2))
      measured.current.add(node)
      measure(node)
    })
  })

  const hasView = props.view != null
  // Colunas de visão cabem na largura da lista: cada largura salva vira teto e, sem espaço, todas encolhem na mesma
  // proporção (o texto trunca) em vez de empurrar as últimas para fora. O DS grava o modelo em `--bt-table-columns`.
  useLayoutEffect(() => {
    const table = host.current?.querySelector<HTMLElement>('.bt-table--view')
    if (!table) return
    const fit = () => {
      for (const [from, to] of [['--bt-table-columns', '--vt-fit'], ['--bt-table-columns-compact', '--vt-fit-compact']]) {
        const value = fitTemplate(table.style.getPropertyValue(from))
        if (table.style.getPropertyValue(to) !== value) table.style.setProperty(to, value)
      }
    }
    fit()
    const observer = new MutationObserver(fit)
    observer.observe(table, { attributes: true, attributeFilter: ['style'] })
    return () => observer.disconnect()
  }, [hasView])

  return (
    <div ref={host} className="vt-host">
      <Table {...props} aria-rowcount={virtual ? rows.length + 1 : undefined} rows={visible} rowKey={rowKey} className={[className, 'vt-table'].filter(Boolean).join(' ')} style={{ ...style, '--vt-before': `${before}px`, '--vt-after': `${after}px` } as CSSProperties} />
    </div>
  )
}
