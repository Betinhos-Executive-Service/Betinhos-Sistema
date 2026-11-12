// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SearchFilterSelect } from './SearchFilterSelect'
import type { CatalogField } from '../data/views'

vi.mock('../data/filter-options', () => ({
  resolveFilterOption: async (_field: CatalogField, value: string) => ({ value, label: value === '1' ? 'Pendente' : 'Tenaris' }),
  searchFilterOptions: async () => [],
}))

afterEach(cleanup)

it.each([
  ['Status', '1', 'Pendente'],
  ['Cliente', '2', 'Tenaris'],
] as const)('mostra %s selecionado como valor real no filtro', async (label, value, selectedLabel) => {
  const field: CatalogField = { id: label, label, table: 'composicoes', attribute: label, path: [], type: 'Picklist', available: true }
  render(<SearchFilterSelect field={field} value={value} onChange={vi.fn()} />)
  const input = screen.getByRole('combobox', { name: `Buscar ${label}` }) as HTMLInputElement
  await waitFor(() => expect(input.value).toBe(selectedLabel))
  expect(input.placeholder).toBe(`Buscar ${label}…`)
  fireEvent.focus(input)
  expect(input.value).toBe('')
  fireEvent.blur(input)
  await waitFor(() => expect(input.value).toBe(selectedLabel))
})
