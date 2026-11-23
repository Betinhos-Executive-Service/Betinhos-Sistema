// @vitest-environment jsdom
import { defaultConfig, tableViewColumns } from '@betinhos/ui'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ListTable, withAudit } from './ListTable'

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

const abrir = (row: Row) => [{ id: 'abrir', label: 'Abrir', onSelect: () => undefined, row }]

it('Auditoria entra logo depois de Abrir e abre as linhas do menu', () => {
  const open = vi.fn()
  const actions = withAudit<Row>(abrir, { entity: 'cr40f_x', name: (r) => r.nome }, (r) => r.id, open)(rows[0], rows)
  expect(actions.map((a) => a.id)).toEqual(['abrir', 'auditoria'])
  actions[1].onSelect()
  expect(open).toHaveBeenCalledWith({ entity: 'cr40f_x', ids: ['1', '2'], name: undefined, onOpenRecord: undefined })
})

it('uma linha só leva o nome; sem Abrir a Auditoria vai sozinha', () => {
  const open = vi.fn()
  const actions = withAudit<Row>(undefined, { entity: 'cr40f_x', name: (r) => r.nome }, (r) => r.id, open)(rows[1], [rows[1]])
  expect(actions.map((a) => a.id)).toEqual(['auditoria'])
  actions[0].onSelect()
  expect(open).toHaveBeenCalledWith(expect.objectContaining({ ids: ['2'], name: 'Bruno' }))
})

it('seleção com tabelas misturadas audita só as da tabela da linha clicada; sem id não mostra o item', () => {
  const open = vi.fn()
  const entity = (r: Row) => (r.id === '1' ? 'a' : 'b')
  withAudit<Row>(abrir, { entity }, (r) => r.id, open)(rows[0], rows).find((a) => a.id === 'auditoria')!.onSelect()
  expect(open).toHaveBeenCalledWith(expect.objectContaining({ entity: 'a', ids: ['1'] }))
  expect(withAudit<Row>(abrir, { entity: 'a', ids: () => [null] }, (r) => r.id, open)(rows[0], [rows[0]]).map((a) => a.id)).toEqual(['abrir'])
})
