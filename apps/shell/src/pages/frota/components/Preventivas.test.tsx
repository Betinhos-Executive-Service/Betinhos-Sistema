// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@betinhos/ui'
import { MANUT, PROPRIO, VEICULO } from '../data/schema'
import { EMPTY_DATA, type DataSource } from '../data/source'
import type { Baseline, FrotaData, ItemPlano, Manutencao, Veiculo } from '../data/types'
import { Preventivas } from './Preventivas'

const TODAY = '2026-10-14'
const veiculo = (id: string, placa: string, extra: Partial<Veiculo>): Veiculo => ({ id, placa, marca: null, modelo: null, cor: null, anoModelo: null, status: VEICULO.ATIVO, categoria: PROPRIO, motorista: null, hodometro: null, hodometroEm: null, ...extra })
const item = (id: string, nome: string, extra: Partial<ItemPlano>): ItemPlano => ({ id, nome, servico: null, intervaloKm: null, intervaloMeses: null, avisoKm: 1000, avisoDias: 30, ativo: true, ...extra })
const manut = (id: string, veiculoId: string, extra: Partial<Manutencao>): Manutencao => ({ id, codigo: id.toUpperCase(), descricao: null, status: MANUT.REALIZADO, grau: null, tipo: null, agendarPara: null, dataManutencao: null, valor: null, estabelecimento: null, servicoRealizado: null, comentarioAprovador: null, km: null, veiculo: { id: veiculoId, label: veiculoId }, solicitante: null, criadoEm: '2026-01-01T12:00:00Z', servicos: [], categorias: [], origemClassificacao: null, confiancaIa: null, ...extra }) as Manutencao
const base = (id: string, veiculoId: string, itemId: string, km: number | null, dia: string | null): Baseline => ({ id, veiculo: { id: veiculoId, label: veiculoId }, item: { id: itemId, label: itemId }, km, data: dia })

const data: FrotaData = {
  ...EMPTY_DATA,
  veiculos: [
    veiculo('v1', 'TST1A11', { hodometro: 171000, hodometroEm: '2026-10-14T13:37:00Z' }),
    veiculo('v2', 'TST2B22', {}),
    veiculo('v3', 'TST3C33', { status: VEICULO.VENDIDO }),
    veiculo('v4', 'TST4D44', { hodometro: 150000 }),
    veiculo('v5', 'TST5E55', {}),
  ],
  planoPreventivo: [
    item('i1', 'Troca de óleo', { servico: 100000000, intervaloKm: 10000 }),
    item('i2', 'Pastilhas de freio', { servico: 100000007, intervaloKm: 30000, intervaloMeses: 6 }),
    item('i3', 'Revisão anual', { servico: 100000035, intervaloMeses: 12 }),
    item('i4', 'Alinhamento', { servico: 100000012, intervaloMeses: 6 }),
  ],
  manutencoes: [
    manut('m4', 'v1', { km: 160000, dataManutencao: '2026-06-10', servicos: [100000000] }),
    manut('m5', 'v1', { status: MANUT.SOLICITADO, servicos: [100000012] }),
    manut('m6', 'v2', { km: 61000, dataManutencao: '2026-08-01' }),
    manut('m7', 'v4', { dataManutencao: '2026-09-01', servicos: [100000007] }),
  ],
  baselines: [
    base('b1', 'v1', 'i2', 141850, '2026-04-26'),
    base('b2', 'v1', 'i4', null, '2026-09-01'),
    base('b3', 'v2', 'i4', null, '2026-04-09'),
  ],
}

type FakeSource = DataSource & { salvarBaseline: ReturnType<typeof vi.fn> }
const fakeSource = () => ({ salvarBaseline: vi.fn(async () => {}) }) as unknown as FakeSource

function renderPrev(veiculoId: string, opts: { errors?: Record<string, string>; onOpen?: () => void; onReload?: () => void } = {}) {
  const source = fakeSource()
  render(<ToastProvider><Preventivas data={data} veiculoId={veiculoId} today={TODAY} source={source} errors={opts.errors ?? {}} onOpen={opts.onOpen ?? (() => {})} onReload={opts.onReload ?? (() => {})} /></ToastProvider>)
  return source
}

const linha = (nome: string) => screen.getByText(nome).closest('li') as HTMLElement

beforeEach(() => vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Preventivas', () => {
  it('mostra o hodômetro Infleet com a data e a hora da leitura', () => {
    renderPrev('v1')
    expect(screen.getByText('Hodômetro: 171.000 km · lido em 14/10/2026 10:37')).toBeTruthy()
  })

  it('sem hodômetro, mostra o km estimado pela última manutenção', () => {
    renderPrev('v2')
    expect(screen.getByText('Km estimado pela última manutenção: 61.000 km')).toBeTruthy()
  })

  it('mostra os quatro estados com badge e texto', () => {
    renderPrev('v1')
    expect(linha('Troca de óleo').textContent).toContain('Vencido')
    expect(linha('Troca de óleo').textContent).toContain('vencido há 1.000 km')
    expect(linha('Pastilhas de freio').textContent).toContain('A vencer')
    expect(linha('Pastilhas de freio').textContent).toContain('faltam 850 km · 12 dias')
    expect(linha('Pastilhas de freio').textContent).toContain('Última: 26/04/2026 · 141.850 km')
    expect(within(linha('Pastilhas de freio')).queryByRole('button')).toBeNull()
    expect(linha('Alinhamento').textContent).toContain('Em dia')
    expect(linha('Alinhamento').textContent).toContain('Em andamento')
    expect(linha('Revisão anual').textContent).toContain('Sem base')
    expect(within(linha('Revisão anual')).getByRole('button', { name: 'Informar última execução' })).toBeTruthy()
  })

  it('mostra "vencido há X dias" quando vence pela data', () => {
    renderPrev('v2')
    expect(linha('Alinhamento').textContent).toContain('vencido há 5 dias')
  })

  it('a última execução por manutenção abre o registro', () => {
    const onOpen = vi.fn()
    renderPrev('v1', { onOpen })
    fireEvent.click(within(linha('Troca de óleo')).getByRole('button', { name: 'Última: 10/06/2026 · 160.000 km' }))
    expect(onOpen).toHaveBeenCalledWith('manutencao', 'm4')
  })

  it('"Informar última execução" abre o drawer, valida e salva a baseline', async () => {
    const onReload = vi.fn()
    const source = renderPrev('v2', { onReload })
    fireEvent.click(within(linha('Revisão anual')).getByRole('button', { name: 'Informar última execução' }))
    const dialog = screen.getByRole('dialog', { name: 'Revisão anual' })
    expect(within(dialog).getByText('TST2B22')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    expect(within(dialog).getByText('Informe o km ou a data')).toBeTruthy()
    expect(source.salvarBaseline).not.toHaveBeenCalled()
    fireEvent.change(within(dialog).getByLabelText('Km'), { target: { value: '45000' } })
    fireEvent.change(within(dialog).getByLabelText('Data'), { target: { value: '2026-04-01' } })
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' })) })
    expect(source.salvarBaseline).toHaveBeenCalledTimes(1)
    expect(source.salvarBaseline).toHaveBeenCalledWith('v2', 'i3', 45000, '2026-04-01')
    expect(onReload).toHaveBeenCalled()
    expect(await screen.findByText('Última execução registrada.')).toBeTruthy()
  })

  it('manutenção sem km: mostra "Informar última execução" para completar o km', () => {
    renderPrev('v4')
    expect(linha('Pastilhas de freio').textContent).toContain('Em dia')
    expect(within(linha('Pastilhas de freio')).getByRole('button', { name: 'Informar última execução' })).toBeTruthy()
  })

  it('veículo sem km conhecido: avisa que a regra por km não é avaliada e mantém o botão no item sem base', () => {
    renderPrev('v5')
    const aviso = 'Veículo sem km conhecido: a regra por km não é avaliada'
    expect(within(linha('Troca de óleo')).getByText(aviso)).toBeTruthy()
    expect(within(linha('Troca de óleo')).getByRole('button', { name: 'Informar última execução' })).toBeTruthy()
    expect(within(linha('Pastilhas de freio')).getByText(aviso)).toBeTruthy()
    expect(within(linha('Pastilhas de freio')).getByRole('button', { name: 'Informar última execução' })).toBeTruthy()
    expect(within(linha('Revisão anual')).queryByText(aviso)).toBeNull()
    expect(within(linha('Revisão anual')).getByRole('button', { name: 'Informar última execução' })).toBeTruthy()
  })

  it('veículo vendido mostra só o aviso de escopo', () => {
    renderPrev('v3')
    expect(screen.getByText('Plano preventivo vale só para veículos ativos e próprios.')).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.queryByText(/Hodômetro|Km estimado|Sem km conhecido/)).toBeNull()
  })

  it('mostra o erro do plano preventivo em Alert', () => {
    renderPrev('v1', { errors: { planoPreventivo: 'Sem privilégio' } })
    expect(screen.getByRole('alert').textContent).toContain('Sem privilégio')
  })
})
