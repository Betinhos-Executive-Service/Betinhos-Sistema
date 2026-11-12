// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createColumnHelper } from '@tanstack/react-table'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataTable } from './DataTable'
import { adjacentGridCell } from './grid-cell-focus'
import type { DataTableFeatures } from './features'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

type RecordRow = { id: string; value: number }
const column = createColumnHelper<DataTableFeatures, RecordRow>()
const data = Array.from({ length: 100 }, (_, value) => ({ id: String(value), value }))
const getRowId = (row: RecordRow) => row.id

describe('renderização incremental da grade', () => {
  it('atualiza apenas as linhas invalidadas e preserva alterações nos dados', () => {
    const cell = vi.fn(({ row }) => <span>{row.original.value}</span>)
    const columns = Array.from({ length: 8 }, (_, index) => column.accessor('value', { id: `value-${index}`, cell }))
    const props = { data, columns, getRowId }
    const { rerender } = render(<DataTable {...props} rowRenderKeys={new Map()} />)
    expect(cell).toHaveBeenCalledTimes(800)
    cell.mockClear()
    rerender(<DataTable {...props} rowRenderKeys={new Map([['0', 'editing']])} />)
    expect(cell).toHaveBeenCalledTimes(8)
    cell.mockClear()
    rerender(<DataTable {...props} rowRenderKeys={new Map([['0', 'editing']])} />)
    expect(cell).not.toHaveBeenCalled()
    rerender(<DataTable {...props} rowRenderKeys={new Map([['1', 'selected']])} />)
    expect(cell).toHaveBeenCalledTimes(16)
    rerender(<DataTable {...props} data={data.map((row) => row.id === '2' ? { ...row, value: 999 } : row)} rowRenderKeys={new Map()} />)
    expect(screen.getAllByText('999')).toHaveLength(8)
  })

  it('mantém seleção, ordenação e substituição de colunas atualizadas', () => {
    const columns = [column.display({ id: 'select', cell: ({ row }) => <input type="checkbox" aria-label={`Selecionar ${row.id}`} checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} /> }), column.accessor('value', { header: ({ column: item }) => <button onClick={item.getToggleSortingHandler()}>Ordenar</button>, cell: ({ row }) => <span>{row.original.value}</span> })]
    const onSelectionChange = vi.fn()
    const { rerender, container } = render(<DataTable data={data.slice(0, 3)} columns={columns} getRowId={getRowId} rowRenderKeys={new Map()} onSelectionChange={onSelectionChange} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar 1' }))
    expect((screen.getByRole('checkbox', { name: 'Selecionar 1' }) as HTMLInputElement).checked).toBe(true)
    expect(onSelectionChange).toHaveBeenLastCalledWith(['1'])
    fireEvent.click(screen.getByText('Ordenar'))
    expect(container.querySelector('tbody tr')?.textContent).toBe('2')
    rerender(<DataTable data={data.slice(0, 3)} columns={[column.accessor('value', { cell: ({ row }) => <span>Novo {row.original.value}</span> })]} getRowId={getRowId} rowRenderKeys={new Map()} />)
    expect(screen.getByText('Novo 1')).toBeTruthy()
  })

  it('agrupa movimentos por frame sem renderizar células e confirma somente ao soltar', () => {
    vi.stubGlobal('PointerEvent', MouseEvent)
    let frame: FrameRequestCallback | undefined
    const request = vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1 })
    vi.stubGlobal('requestAnimationFrame', request)
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const cell = vi.fn(({ row }) => <span>{row.original.value}</span>)
    const onResizeColumn = vi.fn()
    const { container, unmount } = render(<DataTable data={data} columns={[column.accessor('value', { cell })]} getRowId={getRowId} layout={[{ id: 'value', width: 120, pinned: true }]} rowRenderKeys={new Map()} onResizeColumn={onResizeColumn} />)
    cell.mockClear()
    const handle = screen.getByRole('separator')
    fireEvent.pointerDown(handle, { clientX: 100 })
    fireEvent.pointerMove(window, { clientX: 110 })
    fireEvent.pointerMove(window, { clientX: 150 })
    expect(request).toHaveBeenCalledTimes(1)
    act(() => frame?.(0))
    expect(cell).not.toHaveBeenCalled()
    expect(container.querySelector('table')?.style.getPropertyValue('--grid-width-0')).toBe('170px')
    expect(onResizeColumn).not.toHaveBeenCalled()
    fireEvent.pointerUp(window, { clientX: 160 })
    expect(onResizeColumn).toHaveBeenCalledExactlyOnceWith('value', 180)
    onResizeColumn.mockClear()
    fireEvent.pointerDown(handle, { clientX: 100 })
    fireEvent.pointerCancel(window)
    fireEvent.pointerUp(window, { clientX: 140 })
    expect(onResizeColumn).not.toHaveBeenCalled()
    expect(document.documentElement.classList.contains('is-resizing-column')).toBe(false)
    fireEvent.pointerDown(handle, { clientX: 100 })
    expect(document.documentElement.classList.contains('is-resizing-column')).toBe(true)
    unmount()
    expect(document.documentElement.classList.contains('is-resizing-column')).toBe(false)
    fireEvent.pointerUp(window, { clientX: 140 })
    expect(onResizeColumn).not.toHaveBeenCalled()
  })
  it('gravar a nova largura não renderiza as células de novo', () => {
    const cell = vi.fn(({ row }) => <span>{row.original.value}</span>)
    const columns = [column.accessor('value', { cell })]
    const props = { data, columns, getRowId, rowRenderKeys: new Map<string, string>() }
    const { rerender, container } = render(<DataTable {...props} layout={[{ id: 'value', width: 120, pinned: true }]} />)
    cell.mockClear()
    rerender(<DataTable {...props} layout={[{ id: 'value', width: 200, pinned: true }]} />)
    expect(cell).not.toHaveBeenCalled()
    expect(container.querySelector('table')?.style.getPropertyValue('--grid-width-0')).toBe('200px')
  })
})

describe('identidade das linhas e dos cabeçalhos', () => {
  it('não renderiza de novo as linhas mantidas quando os dados são filtrados ou reordenados', () => {
    const cell = vi.fn(({ row }) => <span>{row.original.value}</span>)
    const columns = Array.from({ length: 4 }, (_, index) => column.accessor('value', { id: `value-${index}`, cell }))
    const props = { columns, getRowId, rowRenderKeys: new Map<string, string>() }
    const { rerender } = render(<DataTable {...props} data={data.slice(0, 10)} />)
    expect(cell).toHaveBeenCalledTimes(40)
    cell.mockClear()
    rerender(<DataTable {...props} data={data.slice(0, 10).filter((row) => row.id !== '3')} />)
    expect(cell).not.toHaveBeenCalled()
    expect(screen.queryByText('3')).toBeNull()
    rerender(<DataTable {...props} data={[...data.slice(0, 10)].reverse()} />)
    expect(cell).toHaveBeenCalledTimes(4)
    expect(screen.getAllByText('3')).toHaveLength(4)
  })

  it('renderiza os cabeçalhos só quando o snapshot da coluna muda', () => {
    const header = vi.fn(() => <span>Coluna</span>)
    const columns = Array.from({ length: 3 }, (_, index) => column.accessor('value', { id: `value-${index}`, header, cell: ({ row }) => <span>{row.original.value}</span> }))
    const props = { data: data.slice(0, 2), columns, getRowId, rowRenderKeys: new Map<string, string>() }
    const { rerender } = render(<DataTable {...props} headerRenderKeys={new Map([['value-0', 'a'], ['value-1', 'a'], ['value-2', 'a']])} />)
    expect(header).toHaveBeenCalledTimes(3)
    header.mockClear()
    rerender(<DataTable {...props} headerRenderKeys={new Map([['value-0', 'a'], ['value-1', 'a'], ['value-2', 'a']])} />)
    expect(header).not.toHaveBeenCalled()
    rerender(<DataTable {...props} headerRenderKeys={new Map([['value-0', 'a'], ['value-1', 'b'], ['value-2', 'a']])} />)
    expect(header).toHaveBeenCalledTimes(1)
    header.mockClear()
    rerender(<DataTable {...props} />)
    expect(header).toHaveBeenCalledTimes(3)
  })
})

describe('virtualização das linhas', () => {
  const rows = Array.from({ length: 1200 }, (_, value) => ({ id: String(value), value }))
  const columns = [
    column.display({ id: 'select', header: ({ table }) => <input type="checkbox" aria-label="Selecionar todas" onChange={table.getToggleAllRowsSelectedHandler()} />, cell: ({ row }) => <input type="checkbox" aria-label={`Selecionar ${row.id}`} checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} /> }),
    column.accessor('value', { cell: ({ row }) => <div tabIndex={0} data-grid-cell={`${row.id}:value`}>{row.original.value}</div> }),
  ]
  // jsdom não calcula layout: o scroller ganha altura e as linhas da janela ocupam a altura fixa da grade.
  const scroller = () => {
    const element = document.createElement('div')
    Object.defineProperty(element, 'clientHeight', { value: 400, configurable: true })
    Object.defineProperty(element, 'offsetHeight', { value: 400, configurable: true })
    Object.defineProperty(element, 'offsetWidth', { value: 800, configurable: true })
    document.body.append(element)
    return element
  }
  const bodyRows = (container: HTMLElement) => container.querySelectorAll('tbody tr:not([data-spacer])')

  it('desenha só a janela de 1.200 linhas e mantém a altura total com linhas espaçadoras', () => {
    const element = scroller()
    const { container } = render(<DataTable data={rows} columns={columns} getRowId={getRowId} rowRenderKeys={new Map()} scroller={element} />)
    expect(bodyRows(container).length).toBeGreaterThan(0)
    expect(bodyRows(container).length).toBeLessThan(100)
    expect(container.querySelector('table')?.dataset.rowCount).toBe('1200')
    const after = container.querySelector<HTMLElement>('tr[data-spacer] td')
    expect(Number(after?.style.height.replace('px', ''))).toBeGreaterThan(1000 * 38)
    element.remove()
  })

  it('sem scroller desenha todas as linhas (jsdom, aba oculta)', () => {
    const { container } = render(<DataTable data={rows} columns={columns} getRowId={getRowId} rowRenderKeys={new Map()} />)
    expect(bodyRows(container).length).toBe(1200)
    expect(container.querySelector('tr[data-spacer]')).toBeNull()
  })

  it('selecionar todas marca as 1.200 linhas, também as que não estão no DOM', () => {
    const element = scroller()
    const onSelectionChange = vi.fn()
    render(<DataTable data={rows} columns={columns} getRowId={getRowId} rowRenderKeys={new Map()} scroller={element} onSelectionChange={onSelectionChange} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todas' }))
    expect(onSelectionChange).toHaveBeenLastCalledWith(rows.map((row) => row.id))
    element.remove()
  })

  it('seta para baixo na última linha desenhada rola até a próxima e foca nela', () => {
    const element = scroller()
    const { container } = render(<DataTable data={rows} columns={columns} getRowId={getRowId} rowRenderKeys={new Map()} scroller={element} />)
    const cells = Array.from(container.querySelectorAll<HTMLElement>('[data-grid-cell]'))
    const last = cells[cells.length - 1]
    const lastIndex = Number(last.dataset.gridCell?.split(':')[0])
    expect(adjacentGridCell(last, 'ArrowDown')).toBeNull()
    expect(element.scrollTop).toBeGreaterThan(0)
    act(() => { element.dispatchEvent(new Event('scroll')) })
    expect(document.activeElement).toBe(container.querySelector(`[data-grid-cell="${lastIndex + 1}:value"]`))
    element.remove()
  })

  it('salta para uma linha distante e foca nela depois que ela é desenhada', () => {
    const element = scroller()
    const { container } = render(<DataTable data={rows} columns={columns} getRowId={getRowId} rowRenderKeys={new Map()} scroller={element} />)
    container.querySelector('table')!.dispatchEvent(new CustomEvent('grid:reveal-row', { detail: { index: 900, column: 0 } }))
    expect(element.scrollTop).toBeGreaterThan(800 * 38)
    act(() => { element.dispatchEvent(new Event('scroll')) })
    expect(container.querySelector('[data-grid-cell="900:value"]')).not.toBeNull()
    element.remove()
  })
})
