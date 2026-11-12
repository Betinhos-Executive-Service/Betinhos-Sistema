// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ViewManager } from './ViewManager'
import { defaultViewDefinition, type CatalogField, type SavedView, type ViewDefinition } from '../data/views'
import { moneyFields } from '../data/compositions'

afterEach(cleanup)

const catalog: CatalogField[] = [
  { id: 'client', label: 'Cliente', table: 'clientes', attribute: 'nome', path: [], type: 'String', available: true },
  { id: 'total', label: 'Total', table: 'precos', attribute: 'total', path: [], type: 'Money', available: true },
  { id: 'ajuste', label: 'Ajuste', table: 'precos', attribute: 'ajuste', path: [], type: 'Money', available: true },
  { id: 'route', label: 'Rota', table: 'reservas', attribute: 'trajeto', path: ['reservas'], relationships: [{ from: 'id', to: 'servico' }], type: 'String', available: true },
  { id: 'route_alt', label: 'Região', table: 'reservas', attribute: 'regiao', path: ['reservas'], relationships: [{ from: 'id', to: 'backup' }], type: 'String', available: true },
  { id: 'owner', label: 'Proprietário', table: 'precos', attribute: 'ownerid', path: [], type: 'Lookup', available: true, pickerEligible: false },
  { id: 'file', label: 'Arquivo', table: 'precos', attribute: 'file', path: [], type: 'File', available: false, reason: 'Tipo File não aceito' },
]
const initial: ViewDefinition = { columns: [{ id: 'client', width: 176, pinned: true }, { id: 'total', width: 128, pinned: false }], filters: [], sort: [] }

function setup(filterDrawerHost?: HTMLElement, startingDefinition = initial) {
  let definition = startingDefinition
  const save = vi.fn(async () => undefined)
  const onChange = (next: ViewDefinition) => { definition = next; view.rerender(<ViewManager catalog={catalog} views={[]} active={null} definition={definition} disabled={false} filterDrawerHost={filterDrawerHost} onChange={onChange} onSelect={vi.fn()} onSave={save} onDelete={vi.fn()} />) }
  const view = render(<ViewManager catalog={catalog} views={[]} active={null} definition={definition} disabled={false} filterDrawerHost={filterDrawerHost} onChange={onChange} onSelect={vi.fn()} onSave={save} onDelete={vi.fn()} />)
  return { getDefinition: () => definition, save }
}

describe('gestão separada de colunas, filtros e views', () => {
  it('abre colunas e filtros com uma visualização nativa selecionada', () => {
    const definition: ViewDefinition = { ...initial, filters: [{ id: 'total', operator: 'gt', value: '100' }] }
    const active: SavedView = { id: 'native', kind: 'public', name: 'Ativos', definition, managed: false, nativeOnly: true, nativeFiltersEditable: true, sourceFetchXml: '<fetch><entity name="cr40f_composicaodeprecos"><filter type="and"><condition attribute="total" operator="gt" value="100" /></filter></entity></fetch>' }
    const onChange = vi.fn()
    render(<ViewManager catalog={catalog} views={[active]} active={active} definition={definition} disabled={false} onChange={onChange} onSelect={vi.fn()} onSave={vi.fn()} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Gerenciar' }))
    expect(screen.getByRole('dialog', { name: 'Gerenciar Ativos' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar editor' }))
    fireEvent.click(screen.getByRole('button', { name: 'Colunas' }))
    expect(screen.getByRole('dialog', { name: 'Organizar colunas' })).toBeTruthy()
    expect(screen.getByText(/As colunas originais da visualização permanecem/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar colunas' }))
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }))
    expect(screen.getByRole('dialog', { name: 'Filtros' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Filtros originais da view' })).toBeNull()
    expect((screen.getByRole('spinbutton', { name: 'Valor do filtro de Total' }) as HTMLInputElement).value).toBe('100')
    expect(screen.getByRole('button', { name: 'Remover filtro de Total' })).toBeTruthy()
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Valor do filtro de Total' }), { target: { value: '200' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ filters: [{ id: 'total', operator: 'gt', value: '200' }] }))
  })

  it('mostra só o nome da view e usa ícone apenas na pessoal', () => {
    const views: SavedView[] = [
      { id: 'p1', kind: 'personal', name: 'Minha visualização', definition: initial, managed: false },
      { id: 's1', kind: 'public', name: 'Composições Ativas', definition: initial, managed: false },
    ]
    const onSelect = vi.fn()
    render(<ViewManager catalog={catalog} views={views} active={null} definition={initial} disabled={false} onChange={vi.fn()} onSelect={onSelect} onSave={vi.fn()} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByRole('combobox', { name: 'Selecionar view' }))
    const personal = screen.getByRole('option', { name: 'Pessoal: Minha visualização' })
    const system = screen.getByRole('option', { name: 'Composições Ativas' })
    expect(personal.textContent).toBe('Minha visualização')
    expect(system.textContent).toBe('Composições Ativas')
    expect(personal.querySelector('svg')).toBeTruthy()
    expect(system.querySelector('svg')).toBeNull()
    fireEvent.click(personal)
    expect(onSelect).toHaveBeenCalledWith('p1')
  })

  it('não marca a view padrão como alterada após limpar todos os filtros', () => {
    const definition = { ...defaultViewDefinition(moneyFields.map((field) => field.key)), filterGroups: [] }
    render(<ViewManager catalog={catalog} views={[]} active={null} definition={definition} disabled={false} onChange={vi.fn()} onSelect={vi.fn()} onSave={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.queryByText('Alterações não salvas')).toBeNull()
  })

  it('organiza apenas as selecionadas e aplica somente ao confirmar', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const state = setup(host)
    fireEvent.click(screen.getByRole('button', { name: 'Colunas' }))
    expect(host.querySelector('.view-column-drawer')).toBeTruthy()
    expect(screen.queryByRole('spinbutton', { name: 'Largura de Total' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remover Ajuste' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Fixar Total' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mover Total para cima' }))
    expect(state.getDefinition().columns[0].id).toBe('client')
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar colunas' }))
    expect(state.getDefinition().columns[0]).toMatchObject({ id: 'total', width: 128, pinned: true })
    fireEvent.click(screen.getByRole('button', { name: 'Colunas' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remover Total' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(state.getDefinition().columns).toHaveLength(2)
    host.remove()
  })

  it('adiciona campos de outra tabela, permite busca e oculta campos indisponíveis', () => {
    const state = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Colunas' }))
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar colunas' }))
    expect(screen.queryByRole('button', { name: 'Adicionar Total' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Adicionar Proprietário' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Adicionar Arquivo' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /reservas/ }))
    expect(screen.getAllByRole('button', { name: /reservas/ })).toHaveLength(1)
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar campo' }), { target: { value: 'Rota' } })
    fireEvent.click(screen.getByRole('button', { name: /Adicionar Rota via servico/ }))
    expect(screen.queryByRole('button', { name: /Adicionar Rota via servico/ })).toBeNull()
    expect(state.getDefinition().columns).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Organizar colunas' }))
    expect(screen.getByRole('button', { name: 'Remover Rota' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar colunas' }))
    expect(state.getDefinition().columns.map((item) => item.id)).toEqual(['client', 'total', 'route'])
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }))
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar filtro' }))
    expect(screen.getByRole('button', { name: 'Rota' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Rota' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Valor do filtro de Rota' }), { target: { value: 'Centro' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
    expect(state.getDefinition().filters).toEqual([{ id: 'route', operator: 'eq', value: 'Centro' }])
  })

  it('preserva coluna antiga na lista selecionada sem oferecê-la para nova seleção', () => {
    setup(undefined, { ...initial, columns: [...initial.columns, { id: 'owner', width: 128, pinned: false }] })
    fireEvent.click(screen.getByRole('button', { name: 'Colunas' }))
    expect(screen.getByRole('button', { name: 'Remover Proprietário' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar colunas' }))
    expect(screen.queryByRole('button', { name: 'Adicionar Proprietário' })).toBeNull()
  })

  it('aplica filtros só ao confirmar', () => {
    const state = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }))
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar filtro' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cliente' }))
    expect(state.getDefinition().filters).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Aplicar filtros' })).toHaveProperty('disabled', true)
    fireEvent.change(screen.getByRole('textbox', { name: 'Valor do filtro de Cliente' }), { target: { value: 'Alfa' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
    expect(state.getDefinition().filters).toHaveLength(1)
  })

  it('renderiza filtros no host lateral e libera a grade ao fechar', () => {
    const host = document.createElement('div')
    document.body.append(host)
    setup(host)
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }))
    expect(host.querySelector('[role="dialog"]')).toBeTruthy()
    expect(screen.queryByRole('combobox', { name: 'Ordenar por' })).toBeNull()
    expect(document.querySelector('.view-editor-backdrop')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar filtros' }))
    expect(host.childElementCount).toBe(0)
    host.remove()
  })

  it('salva a largura do drawer ao ajustar pelo teclado', () => {
    const host = document.createElement('div')
    document.body.append(host)
    window.localStorage.removeItem('tela-composicao-preco:filter-drawer-width')
    setup(host)
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }))
    fireEvent.keyDown(screen.getByRole('separator', { name: 'Redimensionar painel de filtros' }), { key: 'ArrowLeft' })
    expect(window.localStorage.getItem('tela-composicao-preco:filter-drawer-width')).toBe('640')
    expect(host.style.getPropertyValue('--filter-drawer-width')).toBe('640px')
    host.remove()
  })

  it('salva a largura do drawer ao arrastar a borda', () => {
    const host = document.createElement('div')
    document.body.append(host)
    setup(host)
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }))
    const separator = screen.getByRole('separator', { name: 'Redimensionar painel de filtros' })
    Object.defineProperty(separator, 'setPointerCapture', { value: vi.fn() })
    Object.defineProperty(separator, 'hasPointerCapture', { value: () => true })
    Object.defineProperty(separator, 'releasePointerCapture', { value: vi.fn() })
    fireEvent.pointerDown(separator, { pointerId: 1, clientX: 600 })
    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 500 })
    fireEvent.pointerUp(separator, { pointerId: 1, clientX: 500 })
    expect(window.localStorage.getItem('tela-composicao-preco:filter-drawer-width')).toBe(String(window.innerWidth - 500))
    host.remove()
  })

  it('usa grupos somente para E/OU e move filtros existentes para o primeiro grupo', () => {
    const state = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }))
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar filtro' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cliente' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Valor do filtro de Cliente' }), { target: { value: 'Alfa' } })
    fireEvent.click(screen.getByRole('button', { name: 'Avançado · combinar com E/OU' }))
    expect(screen.queryByText('Escolha o que filtrar')).toBeNull()
    expect(screen.getByText('Grupo 1')).toBeTruthy()
    expect(screen.queryByText('Grupo 2')).toBeNull()
    expect(screen.queryByRole('group', { name: 'Operador do grupo 1' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar grupo' }))
    expect(screen.queryByText('Escolha o que filtrar')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar condição' }))
    expect(screen.getByText('Escolha o que filtrar')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Total' }))
    expect(screen.getByRole('group', { name: 'Operador entre grupos' })).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Operador do grupo 2' })).toBeNull()
    expect(screen.getByText('Grupo 1')).toBeTruthy()
    expect(screen.getByText('Grupo 2')).toBeTruthy()
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Valor do filtro de Total' }), { target: { value: '1000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar condição' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ajuste' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Valor do filtro de Ajuste' }), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('group', { name: 'Operador do grupo 2' }).querySelectorAll('button')[1])
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
    expect(state.getDefinition().filters).toEqual([])
    expect(state.getDefinition().groupOperator).toBe('or')
    expect(state.getDefinition().filterGroups?.[0].filters[0]).toMatchObject({ id: 'client', value: 'Alfa' })
    expect(state.getDefinition().filterGroups?.[1].filters[0]).toMatchObject({ id: 'total', value: '1000' })
    expect(state.getDefinition().filterGroups?.[1]).toMatchObject({ operator: 'or', filters: [expect.anything(), { id: 'ajuste', value: '50', operator: 'eq' }] })
  })

  it('cria view diretamente com colunas, ordem e filtros aplicados na grade', () => {
    const current: ViewDefinition = { columns: [{ id: 'total', width: 128, pinned: true }, { id: 'client', width: 176, pinned: false }], filters: [{ id: 'client', operator: 'eq', value: 'Alfa' }], sort: [{ id: 'total', descending: true }] }
    const state = setup(undefined, current)
    fireEvent.click(screen.getByRole('button', { name: 'Nova view' }))
    expect(screen.getByRole('dialog', { name: 'Salvar configuração atual' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Próximo' })).toBeNull()
    expect(screen.getByText('2 colunas · 1 filtro · ordenação aplicada')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome da view' }), { target: { value: 'Minha view' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar view' }))
    expect(state.save).toHaveBeenCalledWith('Minha view', 'personal', false, current)
  })
})
