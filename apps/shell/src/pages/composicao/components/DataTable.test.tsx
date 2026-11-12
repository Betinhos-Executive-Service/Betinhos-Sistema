// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createColumnHelper } from '@tanstack/react-table'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataTable } from './DataTable'
import type { DataTableFeatures } from './features'

afterEach(cleanup)

type Row = { id: string; client: string }
const column = createColumnHelper<DataTableFeatures, Row>()
const columns = [column.accessor('client', { header: 'Cliente' })]

describe('redimensionamento de colunas', () => {
  it('aceita teclado, expõe a largura e respeita os limites', () => {
    const onResizeColumn = vi.fn()
    const props = { data: [{ id: '1', client: 'Cliente A' }], columns, getRowId: (row: Row) => row.id, layout: [{ id: 'client', width: 120, pinned: true }], onResizeColumn }
    const { rerender } = render(<DataTable {...props} />)
    const handle = screen.getByRole('separator', { name: 'Redimensionar client' })
    expect(handle.getAttribute('tabindex')).toBe('0')
    expect(handle.getAttribute('aria-valuenow')).toBe('120')

    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(onResizeColumn).toHaveBeenLastCalledWith('client', 130)
    rerender(<DataTable {...props} layout={[{ id: 'client', width: 130, pinned: true }]} />)
    fireEvent.keyDown(handle, { key: 'Home' })
    expect(onResizeColumn).toHaveBeenLastCalledWith('client', 100)
    fireEvent.keyDown(handle, { key: 'End' })
    expect(onResizeColumn).toHaveBeenLastCalledWith('client', 600)
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(onResizeColumn).toHaveBeenLastCalledWith('client', 120)
  })
})

function OpenableHeader() {
  const [open, setOpen] = useState(false)
  return <button type="button" onClick={() => setOpen(true)}>{open ? 'Filtro aberto' : 'Abrir filtro'}</button>
}

describe('cabeçalho com filtro rápido', () => {
  it('mantém o filtro aberto quando a grade recria as colunas', () => {
    const build = () => [column.accessor('client', { header: () => <OpenableHeader /> })]
    const props = { data: [{ id: '1', client: 'Cliente A' }], getRowId: (row: Row) => row.id }
    const { rerender } = render(<DataTable {...props} columns={build()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir filtro' }))
    rerender(<DataTable {...props} columns={build()} />)
    expect(screen.getByRole('button', { name: 'Filtro aberto' })).toBeTruthy()
  })
})
