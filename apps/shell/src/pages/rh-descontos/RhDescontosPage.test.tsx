// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { baixarXlsx } from '../../lib/xlsx'
import { createFrotaSource } from '../frota/data/hostSource'
import { todaySP } from '../frota/data/dates'
import { mesPorExtenso, somaMes } from './domain/descontos'
import { RhDescontosPage } from './RhDescontosPage'

vi.mock('../../lib/xlsx', () => ({ baixarXlsx: vi.fn() }))
configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

const HOJE = todaySP().slice(0, 7)
const host = () => ({ mode: 'mock' as const })
const titulo = (mes: string) => ({ name: `Descontos de ${mesPorExtenso(mes)}` })
const abrir = async (h = host()) => { render(<RhDescontosPage host={h} />); await screen.findByRole('table', titulo(HOJE)); return h }
const linha = (nome: RegExp) => screen.getByRole('button', { name: nome }).closest('tr') as HTMLElement

beforeEach(() => {
  window.location.hash = '#/rh-descontos'
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
  vi.mocked(baixarXlsx).mockClear()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('Descontos em folha', () => {
  it('abre no mês atual com uma linha por parcela e o que falta lançar', async () => {
    await abrir()
    expect(screen.getByRole('heading', titulo(HOJE))).toBeTruthy()
    expect(screen.getAllByRole('button', { expanded: false })).toHaveLength(4)
    expect(screen.getByText(/Faltam/).textContent).toMatch(/Faltam 3 de 4 motoristas · R\$/)
    expect(within(linha(/Bruno/)).getByRole('cell', { name: /^Multa .+ · parcela 2 de 3$/ })).toBeTruthy()
    expect(within(linha(/Carla/)).getByText(/^Lançada/)).toBeTruthy()
    expect(within(linha(/Ana/)).getByText('A lançar')).toBeTruthy()
  })

  it('as setas trocam o mês e "Mês atual" volta', async () => {
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Próximo mês' }))
    expect(await screen.findByRole('heading', titulo(somaMes(HOJE, 1)))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Mês atual' }))
    expect(await screen.findByRole('heading', titulo(HOJE))).toBeTruthy()
  })

  it('expandir a linha mostra a corrente de parcelas e abre a multa', async () => {
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: /Bruno/ }))
    const corrente = await screen.findByRole('list', { name: 'Parcelas mês a mês' })
    expect(within(corrente).getAllByRole('listitem').length).toBeGreaterThan(1)
    expect(corrente.querySelector('[aria-current="date"]')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir a multa na Frota' }))
    expect(window.location.hash).toMatch(/^#\/frota-multas\?registro=multa:/)
  })

  it('o aviso de atrasadas leva ao mês mais antigo', async () => {
    await abrir()
    const alvo = mesPorExtenso(somaMes(HOJE, -2))
    expect(screen.getByRole('note').textContent).toMatch(new RegExp(`1 desconto de meses anteriores ainda não foi lançado, desde ${alvo}`))
    fireEvent.click(screen.getByRole('button', { name: `Ver ${alvo}` }))
    expect(await screen.findByRole('heading', titulo(somaMes(HOJE, -2)))).toBeTruthy()
  })

  it('marca uma linha como lançada e desfaz', async () => {
    await abrir()
    fireEvent.click(within(linha(/Ana/)).getByRole('button', { name: 'Marcar lançado' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/^1 parcela · R\$ .+ marcada como lançada\.$/))
    await waitFor(() => expect(within(linha(/Ana/)).getByText(/^Lançada/)).toBeTruthy())
    fireEvent.click(within(linha(/Ana/)).getByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/voltou para a lançar/))
    expect(within(linha(/Ana/)).getByText('A lançar')).toBeTruthy()
  })

  it('seleciona várias e marca em lote', async () => {
    await abrir()
    expect(screen.queryByRole('button', { name: /como lançadas?$/ })).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: /^Selecionar Ana Teste/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /^Selecionar Diego Teste/ }))
    expect(screen.getByText(/^2 selecionadas · R\$/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Marcar as 2 como lançadas' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/^2 parcelas · R\$ .+ marcadas como lançadas\.$/))
    expect(screen.getByText(/Faltam/).textContent).toMatch(/Faltam 1 de 4 motoristas/)
  })

  it('selecionar todas marca só as que faltam lançar', async () => {
    await abrir()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todas a lançar' }))
    expect(screen.getByRole('button', { name: 'Marcar as 3 como lançadas' })).toBeTruthy()
  })

  it('mostra a recusa do servidor na linha', async () => {
    const h = host()
    const source = createFrotaSource(h)
    vi.spyOn(source, 'lancarDescontoFolha').mockImplementation(async (ids) => ({ parcelas: ids.map((id) => ({ id, ok: false, erro: 'A multa foi cancelada (fictício).' })), encerradas: [], reabertas: [] }))
    await abrir(h)
    fireEvent.click(within(linha(/Ana/)).getByRole('button', { name: 'Marcar lançado' }))
    expect(await within(linha(/Ana/)).findByText('A multa foi cancelada (fictício).')).toBeTruthy()
  })

  it('Baixar Excel gera o arquivo do mês', async () => {
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Baixar Excel' }))
    expect(baixarXlsx).toHaveBeenCalledWith(`descontos-folha-${HOJE}.xlsx`, expect.objectContaining({ colunas: expect.any(Array) }))
    expect(await screen.findByText(/Excel baixado às/)).toBeTruthy()
  })

  it('mês sem parcelas mostra o vazio', async () => {
    await abrir()
    for (let i = 0; i < 12; i++) fireEvent.click(screen.getByRole('button', { name: 'Próximo mês' }))
    expect(await screen.findByText(`Nenhum desconto para ${mesPorExtenso(somaMes(HOJE, 12))}.`)).toBeTruthy()
  })
})
