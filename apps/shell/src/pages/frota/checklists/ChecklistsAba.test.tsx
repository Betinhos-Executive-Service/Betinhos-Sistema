// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FrotaPage } from '../FrotaPage'
import { resetMock } from './domain/gestaoChecklists'

// O jsdom roda em localhost: a aba usa o mock em memória de domain/gestaoChecklists.ts.
afterEach(() => { cleanup(); resetMock() })

describe('Frota › Checklists de Veículos', () => {
  it('mostra as 4 subabas e troca entre elas', async () => {
    render(<FrotaPage host={{ mode: 'mock' }} aba="checklists" />)
    const subabas = within(await screen.findByRole('tablist', { name: 'Seções' }))
    const nomes = subabas.getAllByRole('tab').map((tab) => tab.textContent)
    expect(nomes.map((nome) => nome?.split(' · ')[0])).toEqual(['Veículos', 'Checklists', 'Modelos', 'Padrões'])

    expect(await screen.findByRole('heading', { name: 'Situação por veículo' })).toBeTruthy()
    fireEvent.click(subabas.getByRole('tab', { name: /^Checklists/ }))
    expect(await screen.findByRole('heading', { name: 'Checklists' })).toBeTruthy()
    fireEvent.click(subabas.getByRole('tab', { name: /^Modelos/ }))
    expect(await screen.findByRole('heading', { name: 'Modelos de checklist' })).toBeTruthy()
    fireEvent.click(subabas.getByRole('tab', { name: 'Padrões' }))
    expect(subabas.getByRole('tab', { name: 'Padrões' }).getAttribute('aria-selected')).toBe('true')
  })

  it('não mostra título nem versão próprios: o cabeçalho é o do shell', async () => {
    const { container } = render(<FrotaPage host={{ mode: 'mock' }} aba="checklists" />)
    await screen.findByRole('tablist', { name: 'Seções' })
    expect(container.querySelector('.gestao-checklists')).toBeTruthy()
    expect(container.querySelector('.gestao-version')).toBeNull()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })
})
