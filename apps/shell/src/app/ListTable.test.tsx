// @vitest-environment jsdom
import { defaultConfig, tableViewColumns } from '@betinhos/ui'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ListTable } from './ListTable'

type Row = { id: string; nome: string }
const rows: Row[] = [{ id: '1', nome: 'Ana' }, { id: '2', nome: 'Bruno' }]
const columns = [{ key: 'nome', header: 'Nome', cell: (r: Row) => r.nome }]
const view = { config: defaultConfig(tableViewColumns(columns)), onChange: () => undefined }

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('liga o encolher para caber e a barra horizontal no pé', () => {
  const { container } = render(<ListTable columns={columns} rows={rows} rowKey={(r) => r.id} view={view} />)
  const table = container.querySelector('.bt-table')!
  expect(table.classList.contains('bt-table--fit')).toBe(true)
  expect(table.classList.contains('bt-table--xbar')).toBe(true)
  expect(container.querySelector('.bt-table__xbar')).not.toBeNull()
})

it('primeira carga mostra o loader da marca com o rótulo da lista; recarga mantém as linhas', () => {
  const { rerender } = render(<ListTable columns={columns} rows={[]} rowKey={(r) => r.id} view={view} loading loadingLabel="Carregando OPs" />)
  expect(screen.getByText('Carregando OPs…')).toBeTruthy()
  rerender(<ListTable columns={columns} rows={rows} rowKey={(r) => r.id} view={view} loading loadingLabel="Carregando OPs" />)
  expect(screen.getByText('Ana')).toBeTruthy()
  expect(screen.queryByText('Carregando OPs…')).toBeNull()
})

it('sem visão continua funcionando (sem fit)', () => {
  const { container } = render(<ListTable columns={columns} rows={rows} rowKey={(r) => r.id} />)
  expect(container.querySelector('.bt-table--fit')).toBeNull()
  expect(screen.getByText('Bruno')).toBeTruthy()
})
