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

/** Colunas a partir desta largura (px) encolhem; as menores (seleção, ícones) ficam fixas. */
const FIT_FROM = 64
/** Quanto uma coluna pode encolher: até esta fração da largura dela na visão, nunca abaixo de MIN_PX. */
const MIN_RATIO = 0.65
const MIN_PX = 72

/** Largura mínima da coluna, tirada da largura dela na visão (salva pelo usuário ou a padrão da tela). */
export const minimoDaColuna = (largura: number) => Math.min(largura, Math.max(MIN_PX, Math.round(largura * MIN_RATIO)))

/**
 * Modelo de colunas que encolhe para caber: `Npx` (≥ FIT_FROM) vira `max(mínimo, min(Npx, fatia))`, com a fatia
 * proporcional a N no espaço que sobra da largura visível da lista (`100cqw` do `.bt-table__scroll`) depois do recuo
 * lateral da linha (`pad`), das colunas fixas e dos espaçamentos, e o mínimo vindo da própria largura na visão
 * (`minimoDaColuna`). A base é o rolador e não a linha (`%`) para a linha poder passar da borda junto com as colunas. Se os mínimos não cabem, as colunas passam da borda e a barra presa ao pé (BarraHorizontal)
 * leva até elas. Exportada para teste.
 */
export function fitTemplate(template: string, pad = 0) {
  const tracks = template.match(/minmax\([^)]*\)|\S+/g) ?? []
  const px = (track: string) => (/^\d+(\.\d+)?px$/.test(track) ? Number.parseFloat(track) : null)
  const big = tracks.reduce((sum, t) => sum + ((px(t) ?? 0) >= FIT_FROM ? px(t)! : 0), 0)
  if (!big) return template
  const fixed = tracks.reduce((sum, t) => sum + ((px(t) ?? FIT_FROM) < FIT_FROM ? px(t)! : 0), 0)
  const free = `(100cqw - ${tracks.length - 1} * var(--bt-table-gap, 0px) - ${fixed + pad}px)`
  return tracks.map((t) => ((px(t) ?? 0) >= FIT_FROM ? `max(${minimoDaColuna(px(t)!)}px, min(${t}, calc(${free} * ${px(t)! / big})))` : t)).join(' ')
}

/**
 * `Table` do DS que desenha só as linhas perto da tela quando a lista passa de `VIRTUAL_FROM`; rola no `main` do shell.
 * O pacote não virtualiza: aqui o `Table` recebe só a janela de linhas e as de fora viram margem antes da primeira e
 * depois da última (`virtual.css`). Limitação: o Ctrl+F do navegador só acha as linhas desenhadas.
 */
/** Altura estimada da linha (px, com a borda) por densidade, a mesma do `Table` do DS. */
const rowEstimate = (density: string | undefined) => (density === 'minimal' ? 33 : density === 'dense' ? 45 : 57)

export function VirtualTable<Row>({ rows, rowKey, className, style, ...props }: TableProps<Row>) {
  const host = useRef<HTMLDivElement>(null)
  const [scroller, setScroller] = useState<HTMLElement | null>(null)
  const [scrollMargin, setScrollMargin] = useState(0)
  useLayoutEffect(() => { setScroller(host.current?.closest<HTMLElement>('.bt-shell__main') ?? null) }, [])
  const { virtual, visible, start, before, after, measure } = useVirtualRows(rows, rowKey, scroller, scrollMargin, rowEstimate(props.view?.density ?? props.density))

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
  // Colunas de visão encolhem para caber na largura da lista: cada largura salva vira teto e, sem espaço, todas encolhem
  // na mesma proporção até o mínimo de cada uma (o texto trunca). O DS grava o modelo em `--bt-table-columns`.
  useLayoutEffect(() => {
    const table = host.current?.querySelector<HTMLElement>('.bt-table--view')
    if (!table) return
    const fit = () => {
      const head = getComputedStyle(table.querySelector('.bt-table__head') ?? table)
      const pad = Number.parseFloat(head.paddingLeft) + Number.parseFloat(head.paddingRight) || 0
      for (const [from, to] of [['--bt-table-columns', '--vt-fit'], ['--bt-table-columns-compact', '--vt-fit-compact']]) {
        const value = fitTemplate(table.style.getPropertyValue(from), pad)
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
      <BarraHorizontal />
    </div>
  )
}

/**
 * Barra de rolagem horizontal presa ao pé da tela. A do `Table` fica no fim da lista, depois da última linha, e quem não
 * chega lá não vê as colunas da direita (ex.: Motorista em Despesas com colunas a mais). Esta acompanha a rolagem da
 * tabela nos dois sentidos e só aparece quando as colunas passam da largura.
 */
function BarraHorizontal() {
  const barra = useRef<HTMLDivElement>(null)
  const conteudo = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const bar = barra.current
    const inner = conteudo.current
    // Pelo pai no DOM, não pelo ref do `vt-host`: o React liga o ref do pai só depois dos efeitos dos filhos.
    const scroll = bar?.parentElement?.querySelector<HTMLElement>('.bt-table__scroll')
    if (!bar || !inner || !scroll) return
    const update = () => {
      const sobra = scroll.scrollWidth - scroll.clientWidth
      bar.hidden = sobra <= 1
      if (bar.hidden) return
      inner.style.width = `${bar.clientWidth + sobra}px`
      bar.scrollLeft = scroll.scrollLeft
    }
    const daTabela = () => { if (Math.abs(bar.scrollLeft - scroll.scrollLeft) > 1) bar.scrollLeft = scroll.scrollLeft }
    const daBarra = () => { if (Math.abs(scroll.scrollLeft - bar.scrollLeft) > 1) scroll.scrollLeft = bar.scrollLeft }
    update()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(scroll)
    // O cabeçalho tem a largura das colunas (max-content): muda ao mostrar, esconder ou alargar coluna.
    const head = scroll.querySelector<HTMLElement>('.bt-table__head')
    if (head) observer?.observe(head)
    scroll.addEventListener('scroll', daTabela, { passive: true })
    bar.addEventListener('scroll', daBarra, { passive: true })
    return () => {
      observer?.disconnect()
      scroll.removeEventListener('scroll', daTabela)
      bar.removeEventListener('scroll', daBarra)
    }
  })
  return <div ref={barra} className="vt-xbar" aria-hidden="true" hidden><div ref={conteudo} className="vt-xbar__fill" /></div>
}
