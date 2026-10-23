// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@betinhos/ui'
import { Frota, type Tab } from './FrotaPage'
import { MANUT, PROPRIO, VEICULO } from './data/schema'
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
    salvarItemPlano: async () => {},
    inativarItemPlano: async () => {},
    salvarBaseline: async () => {}, temAditivo: async () => false, listarTermos: async () => [], enviarTermoMulta: async () => 't1', cancelarTermoMulta: async () => {}, baixarPdfTermo: async () => ({ nome: 't.pdf', blob: new Blob() }), lembrarTermoMulta: async () => {}, listarParcelasTermo: async () => [],
  }
}

const renderFrota = (source: DataSource, aba?: Tab) => render(<ToastProvider><Frota source={source} aba={aba} /></ToastProvider>)

afterEach(() => { cleanup(); history.replaceState(null, '', '#/frota') })

describe('Frota', () => {
  it('abre a ficha do veículo só depois que a carga termina', async () => {
    let resolver!: (value: LoadResult) => void
    const source = fakeSource('xrm', 'DEV')
    source.load = vi.fn(() => new Promise<LoadResult>((resolve) => { resolver = resolve }))
    renderFrota(source, 'veiculos')
    expect(screen.getByRole('status', { name: '' })).toBeTruthy()
    await act(async () => {
      resolver({ data: { ...EMPTY_DATA, veiculos: [{ id: 'v1', placa: 'TST1A11', marca: null, modelo: null, cor: null, anoModelo: null, status: VEICULO.ATIVO, categoria: null, motorista: null, hodometro: null, hodometroEm: null }] }, errors: {} })
    })
    fireEvent.click(await screen.findByText('TST1A11'))
    expect(await screen.findByRole('dialog', { name: 'TST1A11' })).toBeTruthy()
  })

  it.each([['xrm', 'PROD', 'Ambiente PROD'], ['mock', 'MOCK', 'Dados de exemplo']] as const)('mostra o selo do ambiente (%s)', async (mode, envLabel, texto) => {
    renderFrota(fakeSource(mode, envLabel))
    expect(await screen.findByText('Nenhuma pendência de frota no momento')).toBeTruthy()
    expect(screen.getByText(texto)).toBeTruthy()
  })

  it('cada visão vem do menu, sem barra de abas; a ficha fica na URL', async () => {
    const source = fakeSource('xrm', 'DEV')
    source.load = vi.fn(async () => ({ data: { ...EMPTY_DATA, veiculos: [{ id: 'v1', placa: 'TST1A11', marca: null, modelo: null, cor: null, anoModelo: null, status: VEICULO.ATIVO, categoria: null, motorista: null, hodometro: null, hodometroEm: null }] }, errors: {} }))
    history.replaceState(null, '', '#/frota-veiculos?q=TST')
    renderFrota(source, 'veiculos')
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull() // lista: sem PageHeader (DS §11.2)
    expect(screen.queryByRole('tablist')).toBeNull()
    fireEvent.click(await screen.findByText('TST1A11'))
    expect(await screen.findByRole('dialog', { name: 'TST1A11' })).toBeTruthy()
    expect(location.hash).toBe('#/frota-veiculos?q=TST&ficha=v1')
  })

  it('Multas tem a aba Infrações; Colisões fica separada', async () => {
    const source = fakeSource('mock', 'MOCK')
    history.replaceState(null, '', '#/frota-multas?q=abc')
    renderFrota(source, 'multas')
    expect(screen.getByRole('tab', { name: 'Multas' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('tab', { name: 'Infrações' }))
    expect(location.hash).toBe('#/frota-multas?sub=infracoes')
    expect(await screen.findByRole('button', { name: 'Nova infração' }, { timeout: 15_000 })).toBeTruthy()
    cleanup()
    renderFrota(source, 'colisoes')
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull() // lista: sem PageHeader (DS §11.2)
    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it('a visão "Plano preventivo" mostra a tabela dos itens', async () => {
    const source = fakeSource('xrm', 'DEV')
    source.load = vi.fn(async () => ({ data: { ...EMPTY_DATA, planoPreventivo: [{ id: 'i1', nome: 'Troca de óleo e filtro', servico: null, intervaloKm: 10000, intervaloMeses: null, avisoKm: 1000, avisoDias: 30, ativo: true }] }, errors: {} }))
    renderFrota(source, 'plano')
    expect(await screen.findByRole('table', { name: 'Itens do plano preventivo' })).toBeTruthy()
    expect(screen.getByText('Troca de óleo e filtro')).toBeTruthy()
  })

  it('pendência de preventiva abre a ficha do veículo na seção Preventivas', async () => {
    const source = fakeSource('xrm', 'DEV')
    const hoje = new Date()
    hoje.setMonth(hoje.getMonth() - 3)
    const dia = hoje.toISOString().slice(0, 10)
    source.load = vi.fn(async () => ({ data: {
      ...EMPTY_DATA,
      veiculos: [{ id: 'v1', placa: 'TST1A11', marca: null, modelo: null, cor: null, anoModelo: null, status: VEICULO.ATIVO, categoria: PROPRIO, motorista: null, hodometro: 171000, hodometroEm: dia }],
      planoPreventivo: [{ id: 'i1', nome: 'Troca de óleo', servico: 100000000, intervaloKm: 10000, intervaloMeses: null, avisoKm: 1000, avisoDias: 30, ativo: true }],
      manutencoes: [{ id: 'm1', codigo: 'M1', descricao: 'Óleo', status: MANUT.REALIZADO, grau: null, tipo: null, agendarPara: null, dataManutencao: dia, valor: null, estabelecimento: null, servicoRealizado: null, comentarioAprovador: null, km: 160000, veiculo: { id: 'v1', label: 'TST1A11' }, solicitante: null, criadoEm: `${dia}T12:00:00Z`, servicos: [100000000], categorias: [], origemClassificacao: null, confiancaIa: null }],
    }, errors: {} }))
    history.replaceState(null, '', '#/frota')
    renderFrota(source)
    expect(await screen.findByRole('heading', { name: 'Preventiva do plano' })).toBeTruthy()
    fireEvent.click(screen.getByText(/Troca de óleo/).closest('button')!)
    expect(await screen.findByRole('dialog', { name: 'TST1A11' })).toBeTruthy()
    expect(location.hash).toContain('ficha=v1')
    expect(location.hash).toContain('secao=preventivas')
    fireEvent.click(screen.getByRole('button', { name: /fechar/i }))
    expect(location.hash).not.toContain('secao=')
  })
})
