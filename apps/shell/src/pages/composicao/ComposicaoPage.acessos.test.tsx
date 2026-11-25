// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ComAcessos } from '../../app/ComAcessos'
import { ComposicaoPage } from './ComposicaoPage'

afterEach(cleanup)

async function selecionar(perfis: string) {
  render(<ComAcessos perfis={perfis}><ComposicaoPage host={{ mode: 'mock' }} /></ComAcessos>)
  await screen.findByRole('checkbox', { name: 'Selecionar Aurora Logística' })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Aurora Logística' }))
  await screen.findByRole('button', { name: 'Gerar OP' })
}

describe('Composição por nível', () => {
  it('Financeiro Operador seleciona e gera OP, mas não vê Excluir', async () => {
    await selecionar('financeiro:operador')
    expect(screen.queryByRole('button', { name: 'Excluir' })).toBeNull()
  })

  it('Financeiro Gestor vê Excluir', async () => {
    await selecionar('financeiro:gestor')
    expect(screen.getByRole('button', { name: 'Excluir' })).toBeTruthy()
  })
})
