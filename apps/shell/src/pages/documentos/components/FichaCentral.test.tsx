// @vitest-environment jsdom
import { cleanup, configure, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ToastProvider } from '@betinhos/ui'
import { createMockSource } from '../../frota/data/mock'
import { FichaVeiculoCentral } from './FichaCentral'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })
afterEach(cleanup)

// Como no Dataverse: a carga da Frota só traz os ativos; o veículo vendido só vem pelo `veiculo(id)`.
vi.mock('../../frota/data/hostSource', () => ({
  createFrotaSource: () => {
    const source = createMockSource()
    return { ...source, load: async () => { const r = await source.load(); return { ...r, data: { ...r.data, veiculos: r.data.veiculos.filter((v) => v.id !== 'v3') } } } }
  },
}))

it('veículo inativo, fora da carga da Frota, abre a ficha do mesmo jeito', async () => {
  render(<ToastProvider><FichaVeiculoCentral host={{ mode: 'mock' }} docs={null} id="v3" onClose={() => {}} onChanged={() => {}} /></ToastProvider>)
  expect(await screen.findByRole('dialog', { name: 'TST3C33' })).toBeTruthy()
  expect(screen.getByText('Vendido')).toBeTruthy()
})
