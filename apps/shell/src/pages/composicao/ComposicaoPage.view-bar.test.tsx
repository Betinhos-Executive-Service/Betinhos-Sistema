// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { ComposicaoPage } from './ComposicaoPage'
import { ReadOnlyFilters } from './components/ReadOnlyFilters'
import type { CatalogField } from './data/views'

afterEach(cleanup)

it('linha de comando do DS: seleção mostra Gerar OP e Excluir, ✕ limpa e Auditoria abre a da tabela sem seleção', async () => {
  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  const toolbar = await screen.findByRole('toolbar', { name: 'Comandos da composição de preços' })
  await screen.findByRole('checkbox', { name: 'Selecionar Aurora Logística' })
  expect(within(toolbar).getByRole('button', { name: /^Visão: Todas as composições/ })).toBeTruthy()
  expect(within(toolbar).getByRole('searchbox', { name: 'Buscar cliente ou trajeto' })).toBeTruthy()
  expect(within(toolbar).getByRole('button', { name: 'Atualizar' })).toBeTruthy()
  expect(within(toolbar).getByText('18 registros')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Gerar OP' })).toBeNull()
  // "⋮ Mais ações" leva Extrair para Excel (o jsdom não abre o popover: o item conta como oculto).
  const more = within(toolbar).getByRole('button', { name: 'Mais ações' })
  fireEvent.click(more)
  expect(within(toolbar).getByRole('menuitem', { name: /Extrair para Excel/, hidden: true })).toBeTruthy()
  fireEvent.click(more)

  fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Aurora Logística' }))
  expect(await within(toolbar).findByRole('button', { name: 'Gerar OP' })).toBeTruthy()
  expect(within(toolbar).getByRole('button', { name: 'Excluir' })).toBeTruthy()
  expect(within(toolbar).getByText('1 selecionada')).toBeTruthy()
  const moreWithSelection = within(toolbar).getByRole('button', { name: /^Mais ações/ })
  fireEvent.click(moreWithSelection)
  expect(within(toolbar).getByRole('menuitem', { name: /Extrair 1 para Excel/, hidden: true })).toBeTruthy()
  fireEvent.click(moreWithSelection)

  fireEvent.click(within(toolbar).getByRole('button', { name: 'Limpar seleção' }))
  expect((screen.getByRole('checkbox', { name: 'Selecionar Aurora Logística' }) as HTMLInputElement).checked).toBe(false)
  expect(screen.queryByRole('button', { name: 'Gerar OP' })).toBeNull()

  fireEvent.click(within(toolbar).getByRole('button', { name: /Auditoria/ }))
  expect(await screen.findByRole('dialog', { name: 'Histórico de Auditoria' })).toBeTruthy()
})

it('filtros da visão nativa e condições sem equivalente ficam visíveis só para leitura', () => {
  const catalog = [{ id: 'cr40f_nome', label: 'Nome', table: 'cr40f_composicaodeprecos', attribute: 'cr40f_nome', path: [], type: 'String', available: true }] as CatalogField[]
  const fetchXml = '<fetch><entity name="cr40f_composicaodeprecos"><filter type="and"><condition attribute="cr40f_nome" operator="not-like" value="%Teste%" /></filter></entity></fetch>'
  render(<ReadOnlyFilters catalog={catalog} nativeFetchXml={fetchXml} locked={{ filters: [{ id: 'cr40f_nome', operator: 'not-begins-with', value: 'X' }], groups: [], orGroups: [] }} onClear={() => undefined} />)
  fireEvent.click(screen.getByRole('button', { name: 'Filtros da visão (2)' }))
  const dialog = screen.getByLabelText('Filtros originais da view')
  expect(within(dialog).getByText('Nome · não contém · %Teste%')).toBeTruthy()
  expect(within(dialog).getByText('Nome · não começa com · X')).toBeTruthy()
})
