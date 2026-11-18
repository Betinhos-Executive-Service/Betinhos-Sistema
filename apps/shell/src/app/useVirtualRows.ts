import { useVirtualizer } from '@tanstack/react-virtual'
import { useCallback, useLayoutEffect, useRef } from 'react'

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
  // Densidade trocada: as alturas guardadas das linhas fora da tela ficaram velhas; recomeça da estimativa nova.
  useLayoutEffect(() => { virtualizer.measure() }, [virtualizer, estimate])
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
