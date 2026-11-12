// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { initialCompositions, moneyFields } from './compositions'
import { applyMockView, deleteMockView, loadMockViews, mockColumnCatalog, saveMockView } from './mock-views'
import { defaultViewDefinition } from './views'

const base = () => defaultViewDefinition(moneyFields.map((field) => field.key))

describe('views locais', () => {
  beforeEach(() => window.localStorage.clear())

  it('oferece as colunas disponíveis nos dados de demonstração', () => {
    const catalog = mockColumnCatalog()
    expect(catalog.find((field) => field.id === 'client')?.available).toBe(true)
    expect(catalog.find((field) => field.id === 'new_valortotal')?.available).toBe(true)
  })

  it('salva, atualiza e exclui views no navegador', () => {
    const first = saveMockView('Minha view', 'personal', base())
    expect(loadMockViews()).toHaveLength(1)
    expect(loadMockViews()[0].id).toBe(first.id)
    const updated = saveMockView('Compartilhada no teste', 'public', { ...base(), columns: [{ id: 'client', width: 240, pinned: false }] }, first)
    expect(loadMockViews()).toEqual([updated])
    deleteMockView(updated)
    expect(loadMockViews()).toEqual([])
  })

  it('filtra e ordena todos os registros antes da apresentação', () => {
    const definition = {
      ...base(),
      filters: [{ id: 'client', operator: 'like' as const, value: 'Aurora' }],
      sort: [{ id: 'new_valortotal', descending: true }],
    }
    expect(applyMockView(initialCompositions, definition).map((row) => row.client)).toEqual(['Aurora Logística'])
    const sorted = applyMockView(initialCompositions, { ...definition, filters: [] })
    expect(Number(sorted[0].values.new_valortotal)).toBeGreaterThan(Number(sorted.at(-1)!.values.new_valortotal))
    expect(initialCompositions[0].id).toBe('mock-1')
  })

  it('combina condições rápidas de texto e número', () => {
    const result = applyMockView(initialCompositions, { ...base(), filters: [
      { id: 'client', operator: 'begins-with', value: 'Aur' },
      { id: 'client', operator: 'not-like', value: 'Teste' },
      { id: 'new_valortotal', operator: 'gt', value: '0' },
    ] })
    expect(result.map((row) => row.client)).toEqual(['Aurora Logística'])
  })

  it('filtra Data pelo dia exibido, sem exigir a mesma hora', () => {
    const result = applyMockView(initialCompositions, { ...base(), filters: [{ id: 'date', operator: 'eq', value: '2026-09-22' }] })
    expect(result.map((row) => row.id)).toEqual(['mock-1'])
  })

  it('aplica E dentro do grupo e OU entre grupos', () => {
    const result = applyMockView(initialCompositions, { ...base(), filters: [], groupOperator: 'or', filterGroups: [
      { id: 'g1', operator: 'and', filters: [{ id: 'client', operator: 'begins-with', value: 'Aur' }, { id: 'client', operator: 'like', value: 'Logística' }] },
      { id: 'g2', operator: 'and', filters: [{ id: 'client', operator: 'eq', value: 'Inexistente' }] },
    ] })
    expect(result.map((row) => row.client)).toEqual(['Aurora Logística'])
  })

  it('trata booleanos e datas de campos adicionais no modo de demonstração', () => {
    const rows = [{ ...initialCompositions[0], values: { ...initialCompositions[0].values, programado: true, dataRelacionada: '2026-09-22T14:30:00Z' } }]
    const definition = { ...base(), filters: [
      { id: 'programado', operator: 'eq' as const, value: 'true' },
      { id: 'dataRelacionada', operator: 'eq' as const, value: '2026-09-22' },
    ] }
    expect(applyMockView(rows, definition)).toHaveLength(1)
  })
})
