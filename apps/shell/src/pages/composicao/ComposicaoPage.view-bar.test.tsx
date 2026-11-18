// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { ComposicaoPage } from './ComposicaoPage'
afterEach(() => { cleanup(); window.localStorage.clear() })

it('linha de comando do DS: seleção mostra Gerar OP e Excluir, ✕ limpa e Auditoria abre a da tabela sem seleção', async () => {
  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  const toolbar = await screen.findByRole('toolbar', { name: 'Comandos da composição de preços' })
  await screen.findByRole('checkbox', { name: 'Selecionar Aurora Logística' })
  expect(within(toolbar).getByRole('button', { name: /^Visão: Todas as composições/ })).toBeTruthy()
  expect(within(toolbar).getByRole('searchbox', { name: 'Buscar OS, cliente, passageiro, placa…' })).toBeTruthy()
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

it('condição sem equivalente no DS fica no painel Filtros como só leitura e sai sozinha no ×', async () => {
  window.localStorage.setItem('tela-composicao-preco:mock-views:v1', JSON.stringify([{ id: 'v1', name: 'Sem Guarulhos', kind: 'personal', managed: true, definition: {
    columns: [{ id: 'client', width: 200, pinned: false }, { id: 'route', width: 240, pinned: false }],
    filters: [{ id: 'route', operator: 'not-begins-with', value: 'Guarulhos' }, { id: 'client', operator: 'like', value: 'a' }], sort: [],
  } }]))
  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  const toolbar = await screen.findByRole('toolbar', { name: 'Comandos da composição de preços' })
  fireEvent.click(within(toolbar).getByRole('button', { name: /^Visão:/ }))
  fireEvent.click(await screen.findByRole('menuitemradio', { name: /Sem Guarulhos/, hidden: true }))
  await within(toolbar).findByRole('button', { name: /^Visão: Sem Guarulhos/ })
  expect(screen.queryByRole('button', { name: /Filtros da visão/ })).toBeNull()

  fireEvent.click(within(toolbar).getByRole('button', { name: /^Filtros/ }))
  expect(screen.getByText('Sempre')).toBeTruthy()
  expect(screen.getByText(/Trajeto não começa com Guarulhos/)).toBeTruthy()
  expect(screen.getByRole('button', { name: /^Mostrar/ })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Remover condição da visão' }))
  expect(screen.queryByText(/não começa com Guarulhos/)).toBeNull()
  expect(screen.queryByText('Sempre')).toBeNull()
})

