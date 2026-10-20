// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@betinhos/ui'
import { MANUT } from '../data/schema'
import { EMPTY_DATA, type DataSource } from '../data/source'
import type { Colisao, FrotaData, Manutencao, Multa } from '../data/types'
import { linhasDaTabela } from '../testUtils'
import { Registros } from './Registros'

const manut = (id: string, extra: Partial<Manutencao>): Manutencao => ({ id, codigo: id, descricao: `Serviço ${id}`, status: MANUT.SOLICITADO, grau: 1, tipo: 1, agendarPara: null, dataManutencao: null, valor: null, estabelecimento: null, servicoRealizado: null, comentarioAprovador: null, km: null, veiculo: { id: 'v1', label: 'TST1A11' }, solicitante: { id: 'f1', label: 'Ana' }, criadoEm: '2026-09-10T12:00:00Z', servicos: [], categorias: [], origemClassificacao: null, confiancaIa: null, ...extra })
const data: FrotaData = { ...EMPTY_DATA, manutencoes: [manut('a', {}), manut('b', { status: MANUT.REALIZADO, veiculo: { id: 'v2', label: 'TST2B22' }, solicitante: { id: 'f2', label: 'Bruno' }, criadoEm: '2026-06-01T12:00:00Z' })] }
const source = { openForm: vi.fn(async () => {}) } as unknown as DataSource
const rows = linhasDaTabela

afterEach(cleanup)

describe('Registros', () => {
  it('lista e filtra pela busca (depois da pausa na digitação)', async () => {
    render(<Registros kinds={['manutencao']} data={data} source={source} onOpen={() => {}} onReload={() => {}} />)
    expect(rows()).toHaveLength(2)
    fireEvent.change(screen.getByPlaceholderText(/Buscar/), { target: { value: 'bruno' } })
    await waitFor(() => expect(rows()).toHaveLength(1))
  })

  it('link antigo com status e período abre filtrado e passa a usar f=', async () => {
    window.location.hash = `#/frota?aba=manutencoes&status=${MANUT.SOLICITADO}&de=2026-09-01`
    render(<Registros kinds={['manutencao']} data={data} source={source} onOpen={() => {}} onReload={() => {}} />)
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(rows()[0]).toContain('Serviço a')
    await waitFor(() => expect(window.location.hash).toMatch(/[?&]f=/))
    expect(window.location.hash).not.toMatch(/[?&](status|de)=/)
  })

  it('abre o detalhe ao clicar na linha e o formulário nativo em Novo', () => {
    const onOpen = vi.fn()
    render(<Registros kinds={['manutencao']} data={data} source={source} onOpen={onOpen} onReload={() => {}} />)
    fireEvent.click(screen.getByText('Serviço a'))
    expect(onOpen).toHaveBeenCalledWith('manutencao', 'a')
    fireEvent.click(screen.getByRole('button', { name: /Novo/ }))
    expect(source.openForm).toHaveBeenCalledWith('manutencao')
  })

  it('mostra o erro real quando o formulário nativo falha e não recarrega', async () => {
    const onReload = vi.fn()
    const falha = { openForm: vi.fn(async () => { throw new Error('Sem permissão para criar') }) } as unknown as DataSource
    render(<ToastProvider><Registros kinds={['manutencao']} data={data} source={falha} onOpen={() => {}} onReload={onReload} /></ToastProvider>)
    fireEvent.click(screen.getByRole('button', { name: /Novo/ }))
    expect(await screen.findByText(/Sem permissão para criar/)).toBeTruthy()
    await waitFor(() => expect(falha.openForm).toHaveBeenCalledWith('manutencao'))
    expect(onReload).not.toHaveBeenCalled()
  })

  const multa = (id: string, veiculo: string): Multa => ({ id, titulo: `Multa ${id}`, status: null, dataHora: '2026-09-10T12:00:00Z', local: null, dataParaIndicar: null, indicado: false, dataAviso: null, dataIndicacao: null, veiculo: { id: veiculo, label: veiculo.toUpperCase() }, motorista: { id: 'm1', label: 'Maria' }, infracaoId: null, criadoEm: '2026-09-10T12:00:00Z' })
  const colisao = (id: string, veiculo: string): Colisao => ({ id, titulo: `Colisão ${id}`, status: null, tipo: null, dataHora: '2026-09-11T12:00:00Z', local: null, descricao: null, houveTerceiro: false, veiculo: { id: veiculo, label: veiculo.toUpperCase() }, motorista: { id: 'm1', label: 'Maria' }, criadoEm: '2026-09-11T12:00:00Z' })

  it('ao trocar entre multas e colisões, o filtro de veículo não passa para o outro tipo', async () => {
    window.location.hash = '#/frota?aba=ocorrencias&veiculo=v2'
    const mista: FrotaData = { ...EMPTY_DATA, multas: [multa('m1', 'v1'), multa('m2', 'v2')], colisoes: [colisao('c1', 'v1'), colisao('c2', 'v1')] }
    render(<Registros kinds={['multa', 'colisao']} data={mista} source={source} onOpen={() => {}} onReload={() => {}} />)
    await waitFor(() => expect(rows()).toHaveLength(1))
    fireEvent.click(screen.getByRole('radio', { name: 'Colisões' }))
    await waitFor(() => expect(rows()).toHaveLength(2))
  })

  it('filtro por um veículo que saiu dos dados após recarga continua visível e pode ser limpo', async () => {
    window.location.hash = '#/frota?aba=ocorrencias&veiculo=v2'
    const antes: FrotaData = { ...EMPTY_DATA, multas: [multa('m1', 'v1'), multa('m2', 'v2')] }
    const depois: FrotaData = { ...EMPTY_DATA, multas: [multa('m1', 'v1'), multa('m3', 'v1')] }
    const { rerender } = render(<Registros kinds={['multa']} data={antes} source={source} onOpen={() => {}} onReload={() => {}} />)
    await waitFor(() => expect(rows()).toHaveLength(1))
    rerender(<Registros kinds={['multa']} data={depois} source={source} onOpen={() => {}} onReload={() => {}} />)
    expect(await screen.findByText(/Nenhum registro de multa com estes filtros/)).toBeTruthy()
    expect(screen.getByText(/Veículo: V2/)).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Limpar filtros' })[0])
    await waitFor(() => expect(rows()).toHaveLength(2))
  })
})
