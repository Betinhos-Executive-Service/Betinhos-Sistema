// @vitest-environment jsdom
import { cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { act } from 'react'
import type { Row } from '@betinhos/dataverse'
import { emptyFilters, type TableViewState, type ViewConfig } from '@betinhos/ui'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ID_ATTRIBUTE, type AttributeInfo, type AttributeMap, type CellStatus, type Column } from '../domain/types'
import { useGeralViewState } from '../useGeralViewState'
import { GeralDsTable } from './GeralDsTable'

const col = (key: string, width = 140): Column => ({ key, attribute: key, alias: null, entity: null, width })
const columns = [col('cr40f_id'), col('cr40f_cliente'), col('comprovantes', 90)]
const rows: Row[] = [
  { [ID_ATTRIBUTE]: 'a', cr40f_id: 'OS-1', cr40f_cliente: 'Particular' },
  { [ID_ATTRIBUTE]: 'b', cr40f_id: 'OS-2', cr40f_cliente: 'Empresa X' },
]
const config: ViewConfig = { v: 1, columns: columns.map((c) => ({ key: c.key, visible: true })), sort: null, filters: {} }
const viewOf = (setConfig = vi.fn()) => ({ config, setConfig, density: 'dense' } as unknown as TableViewState)

beforeEach(() => {
  // O menu do título abre num <dialog>; o jsdom não tem showModal.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.open = false }
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function montar(over: Partial<Parameters<typeof GeralDsTable>[0]> = {}) {
  const props = {
    columns, extraKeys: new Set<string>(), attributes: null, rows, loading: false, view: viewOf(),
    quickFilters: { fields: [], value: {}, onChange: vi.fn() }, selected: new Set<string>(), onSelectionChange: vi.fn(),
    onOpen: vi.fn(), onRowContextMenu: vi.fn(), virtualKeys: new Set(['comprovantes']),
    special: (row: Row, column: Column) => (column.key === 'comprovantes' ? <span>comp-{String(row[ID_ATTRIBUTE])}</span> : undefined),
    ...over,
  }
  render(<GeralDsTable {...props} />)
  return props
}

it('desenha os valores só leitura, as colunas virtuais pela tela e abre pela coluna-título', () => {
  const props = montar()
  expect(screen.getByText('Particular')).toBeTruthy()
  expect(screen.getByText('comp-b')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'OS-2' }))
  expect(props.onOpen).toHaveBeenCalledWith('b')
})

it('clique direito numa linha chama o menu da Geral com o id do serviço', () => {
  const props = montar()
  fireEvent.contextMenu(screen.getByText('Empresa X'))
  expect(props.onRowContextMenu).toHaveBeenCalledWith('b', expect.anything())
})

it('clique na linha seleciona pela tela (seleção controlada)', () => {
  const props = montar()
  fireEvent.click(screen.getByText('Particular'))
  expect([...vi.mocked(props.onSelectionChange).mock.calls[0][0]]).toEqual(['a'])
})

const menuDa = (key: string) => {
  const head = document.querySelector<HTMLElement>(`.bt-colhead[data-col="${key}"]`) ?? document.querySelector<HTMLElement>(`[data-col="${key}"] .bt-colhead`)
  fireEvent.click(head!)
  return screen.queryAllByRole('menuitem', { hidden: true }).map((m) => m.textContent)
}

it('coluna virtual não ordena', () => {
  montar()
  const itens = menuDa('comprovantes')
  expect(itens).toContain('Ocultar coluna')
  expect(itens).not.toContain('Ordenar A→Z')
})

it('coluna do Dataverse ordena e oferece fixar', () => {
  montar()
  expect(menuDa('cr40f_cliente')).toEqual(expect.arrayContaining(['Ordenar A→Z', 'Fixar coluna']))
})

it('useGeralViewState: coluna fixa vai para as preferências e volta como pinned na visão', () => {
  const setPrefs = vi.fn()
  const kv = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined }
  const base = {
    views: [], view: null, viewsError: null, columns, attributes: null, setPrefs, sort: null, setSort: vi.fn(), filters: emptyFilters(),
    setFilters: vi.fn(), group: null, setGroup: vi.fn(), selectView: vi.fn(), reloadViews: vi.fn(), createView: vi.fn(), updateView: vi.fn(),
    renameView: vi.fn(), deleteView: vi.fn(), kv, manutencoesAlteradas: false, resetManutencoes: vi.fn(),
  }
  const { result, rerender } = renderHook((props: { prefs: Parameters<typeof useGeralViewState>[0]['prefs'] }) => useGeralViewState({ ...base, ...props }), { initialProps: { prefs: null } })
  act(() => result.current.state.setConfig((c) => ({ ...c, columns: c.columns.map((x) => (x.key === 'cr40f_cliente' ? { ...x, pinned: true } : x)) })))
  const saved = setPrefs.mock.calls[0][0]
  expect(saved.pinned).toEqual(['cr40f_cliente'])
  rerender({ prefs: saved })
  expect(result.current.state.config.columns.find((c) => c.key === 'cr40f_cliente')?.pinned).toBe(true)
  expect(result.current.state.config.columns.find((c) => c.key === 'cr40f_id')?.pinned).toBeUndefined()
})

// ---------- parte 2: edição na célula ----------

const meta = (logicalName: string, type: string): [string, AttributeInfo] => [logicalName, { logicalName, type, label: logicalName, updatable: true, targets: [], options: [] }]
const attributes: AttributeMap = new Map([meta('cr40f_trajeto', 'String'), meta('cr40f_valor', 'Money'), meta('cr40f_receber', 'Boolean')])
const editCols = [col('cr40f_id'), col('cr40f_trajeto'), col('cr40f_valor'), col('cr40f_receber')]
const editRows: Row[] = [{ [ID_ATTRIBUTE]: 'a', cr40f_id: 'OS-1', cr40f_trajeto: 'GRU → Centro', cr40f_valor: 100, cr40f_receber: false }]
const editConfig: ViewConfig = { v: 1, columns: editCols.map((c) => ({ key: c.key, visible: true })), sort: null, filters: {} }

function montarEdicao(cells = new Map<string, CellStatus>()) {
  const save = vi.fn(async () => true)
  const reset = vi.fn()
  montar({
    columns: editCols, rows: editRows, attributes, view: { config: editConfig, setConfig: vi.fn(), density: 'dense' } as unknown as TableViewState,
    edit: { editable: true, cells, save, reset, search: vi.fn(async () => []) },
  })
  return { save, reset }
}
const celula = (text: string) => screen.getByText(text).closest('[role="gridcell"]') as HTMLElement

it('texto: duplo clique abre, Enter grava pela tela com o valor novo', () => {
  const { save } = montarEdicao()
  fireEvent.doubleClick(celula('GRU → Centro'))
  const input = screen.getByRole('textbox', { name: 'cr40f_trajeto' })
  fireEvent.change(input, { target: { value: 'GRU → Paulista' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(save).toHaveBeenCalledWith('a', editCols[1], 'GRU → Paulista')
})

it('dinheiro inválido recusa e a edição continua aberta, sem gravar', () => {
  const { save } = montarEdicao()
  fireEvent.doubleClick(celula('R$ 100,00'))
  const input = screen.getByRole('textbox', { name: 'cr40f_valor' })
  fireEvent.change(input, { target: { value: 'abc' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(save).not.toHaveBeenCalled()
  expect(screen.getByRole('textbox', { name: 'cr40f_valor' })).toBeTruthy()
})

it('Sim/Não grava no clique do switch', () => {
  const { save } = montarEdicao()
  fireEvent.click(screen.getByRole('switch', { name: 'cr40f_receber' }))
  expect(save).toHaveBeenCalledWith('a', editCols[3], true)
})

it('andamento da Geral vira o da célula do DS; erro com "Tentar de novo" limpa e regrava o último valor', () => {
  const cells = new Map<string, CellStatus>([['a|cr40f_trajeto', { kind: 'error', message: 'Sem permissão' }], ['a|cr40f_valor', { kind: 'saving' }]])
  const { save, reset } = montarEdicao(cells)
  expect(celula('R$ 100,00').classList.contains('is-saving')).toBe(true)
  const erro = celula('GRU → Centro')
  expect(erro.classList.contains('is-error')).toBe(true)
  // Sem valor tentado nesta sessão, o "Tentar de novo" só limpa o aviso.
  fireEvent.click(screen.getByRole('button', { name: /Tentar de novo/ }))
  expect(reset).toHaveBeenCalledWith('a', 'cr40f_trajeto')
  expect(save).not.toHaveBeenCalled()
})

it('sem edição (metadata ainda chegando) as células ficam só leitura', () => {
  const save = vi.fn(async () => true)
  montar({ columns: editCols, rows: editRows, attributes, view: { config: editConfig, setConfig: vi.fn(), density: 'dense' } as unknown as TableViewState, edit: { editable: false, cells: new Map(), save, reset: vi.fn(), search: vi.fn(async () => []) } })
  fireEvent.doubleClick(celula('GRU → Centro'))
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(screen.getByText('Não')).toBeTruthy()
})
