// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@betinhos/ui'
import { Frota } from './FrotaPage'
import { VEICULO } from './data/schema'
import { EMPTY_DATA, type DataSource, type LoadResult } from './data/source'

function fakeSource(mode: DataSource['mode'], envLabel: string): DataSource {
  return {
    mode, envLabel,
    load: vi.fn(async () => ({ data: EMPTY_DATA, errors: {} })),
    currentStatus: async () => null,
    dateBehaviors: async () => ({}),
    update: async () => {},
    openForm: async () => {},
    prepareFlow: async () => {},
    classificacao: async () => ({ servicos: [], categorias: [], origem: null, confianca: null }),
    classificarAgora: async () => { throw new Error('indisponível') },
    fotoVeiculo: async () => null,
    enviarFotoVeiculo: async () => {},
    runFlow: async () => ({ message: null, shareUrl: null }),
  }
}

const renderFrota = (source: DataSource) => render(<ToastProvider><Frota source={source} /></ToastProvider>)

afterEach(cleanup)

describe('Frota', () => {
  it('abre a ficha do veículo só depois que a carga termina', async () => {
    let resolver!: (value: LoadResult) => void
    const source = fakeSource('xrm', 'DEV')
    source.load = vi.fn(() => new Promise<LoadResult>((resolve) => { resolver = resolve }))
    renderFrota(source)
    expect(screen.getByRole('status', { name: '' })).toBeTruthy()
    await act(async () => {
      resolver({ data: { ...EMPTY_DATA, veiculos: [{ id: 'v1', placa: 'TST1A11', marca: null, modelo: null, cor: null, anoModelo: null, status: VEICULO.ATIVO, categoria: null, motorista: null, hodometro: null, hodometroEm: null }] }, errors: {} })
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Veículos' }))
    fireEvent.click(await screen.findByText('TST1A11'))
    expect(await screen.findByRole('dialog', { name: 'TST1A11' })).toBeTruthy()
  })

  it.each([['xrm', 'PROD', 'Ambiente PROD'], ['mock', 'MOCK', 'Dados de exemplo']] as const)('mostra o selo do ambiente (%s)', async (mode, envLabel, texto) => {
    renderFrota(fakeSource(mode, envLabel))
    expect(await screen.findByText('Nenhuma pendência de frota no momento')).toBeTruthy()
    expect(screen.getByText(texto)).toBeTruthy()
  })

  it('guarda aba e ficha na URL; a aba padrão não aparece', async () => {
    const source = fakeSource('xrm', 'DEV')
    source.load = vi.fn(async () => ({ data: { ...EMPTY_DATA, veiculos: [{ id: 'v1', placa: 'TST1A11', marca: null, modelo: null, cor: null, anoModelo: null, status: VEICULO.ATIVO, categoria: null, motorista: null, hodometro: null, hodometroEm: null }] }, errors: {} }))
    history.replaceState(null, '', '#/frota?aba=veiculos&q=TST')
    renderFrota(source)
    expect(screen.getByRole('tab', { name: 'Veículos' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(await screen.findByText('TST1A11'))
    expect(await screen.findByRole('dialog', { name: 'TST1A11' })).toBeTruthy()
    expect(location.hash).toBe('#/frota?aba=veiculos&q=TST&ficha=v1')
    fireEvent.click(screen.getByRole('tab', { name: 'Pendências' }))
    expect(location.hash).toBe('#/frota')
  })
})
