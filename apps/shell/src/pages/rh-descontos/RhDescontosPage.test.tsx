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
const abrir = async (h = host()) => { render(<RhDescontosPage host={h} />); await screen.findByRole('heading', { name: `Folha de ${mesPorExtenso(HOJE)}` }); await screen.findAllByRole('article'); return h }

beforeEach(() => {
  window.location.hash = '#/rh-descontos'
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
  vi.mocked(baixarXlsx).mockClear()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const holerite = (nome: RegExp) => screen.getByRole('article', { name: nome })
const passo = (nome: RegExp) => fireEvent.click(screen.getByRole('button', { name: nome }))

describe('Descontos em folha', () => {
  it('abre no mês atual, em Conferir, com título e total', async () => {
    await abrir()
    expect(screen.getByRole('button', { name: /Conferir/ }).getAttribute('aria-current')).toBe('step')
    expect(screen.getByText(/4 motoristas · 4 parcelas/)).toBeTruthy()
  })

  it('a faixa tem 7 meses e clicar troca a folha', async () => {
    await abrir()
    const faixa = screen.getByRole('group', { name: 'Meses da folha' })
    const botoes = within(faixa).getAllByRole('button')
    expect(botoes).toHaveLength(7)
    fireEvent.click(botoes[3])
    expect(await screen.findByRole('heading', { name: `Folha de ${mesPorExtenso(somaMes(HOJE, 1))}` })).toBeTruthy()
  })

  it('mostra um holerite por colaborador com subtotal e parcela x/y', async () => {
    await abrir()
    expect(screen.getAllByRole('article')).toHaveLength(4)
    const bruno = holerite(/Bruno/)
    expect(within(bruno).getByText('2/3')).toBeTruthy()
    expect(within(bruno).getByText(/Multa TST0002/)).toBeTruthy()
    expect(within(bruno).getByText(/Subtotal/)).toBeTruthy()
    expect(within(holerite(/Carla/)).getByText(/^Lançado/)).toBeTruthy()
  })

  it('a linha do tempo mostra colaborador × mês com a coluna da folha destacada', async () => {
    await abrir()
    fireEvent.click(screen.getByRole('radio', { name: 'Linha do tempo' }))
    const grade = await screen.findByRole('table', { name: 'Descontos por colaborador e mês' })
    expect(within(grade).getAllByRole('columnheader')).toHaveLength(8)
    expect(grade.querySelectorAll('[aria-current="date"]').length).toBeGreaterThan(0)
  })

  it('o aviso de atrasadas troca a folha para o mês mais antigo', async () => {
    await abrir()
    expect(await screen.findByText(/1 parcela de meses anteriores ainda prevista/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: `Ver ${mesPorExtenso(somaMes(HOJE, -2))}` }))
    expect(await screen.findByRole('heading', { name: `Folha de ${mesPorExtenso(somaMes(HOJE, -2))}` })).toBeTruthy()
  })

  it('lança os marcados e desfaz', async () => {
    await abrir()
    passo(/Lançar/)
    expect((screen.getByRole('button', { name: 'Marque quem já foi lançado' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: /Marcar Ana/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Marcar Diego/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Lançar os 2 marcados' }))
    expect((await screen.findByRole('status')).textContent).toMatch(/^2 parcelas · R\$ .+ lançadas\.$/)
    passo(/Conferir/)
    expect(await within(holerite(/Ana/)).findByText(/^Lançado/)).toBeTruthy()
    passo(/Lançar/)
    fireEvent.click(screen.getByRole('button', { name: /Ana Teste/ }))
    fireEvent.click(await screen.findByRole('button', { name: /^Desfazer 1 lançamento \(R\$/ }))
    await waitFor(() => expect((screen.getByRole('checkbox', { name: /Marcar Ana/ }) as HTMLInputElement).disabled).toBe(false))
    expect(screen.getByRole('status').textContent).toMatch(/voltou a prevista/)
  })

  it('mostra a recusa do servidor como veio', async () => {
    const h = host()
    const source = createFrotaSource(h)
    vi.spyOn(source, 'lancarDescontoFolha').mockImplementation(async (ids) => ({ parcelas: ids.map((id) => ({ id, ok: false, erro: 'A multa foi cancelada (fictício).' })), encerradas: [], reabertas: [] }))
    await abrir(h)
    passo(/Lançar/)
    fireEvent.click(screen.getByRole('checkbox', { name: /Marcar Ana/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Lançar o 1 marcado' }))
    passo(/Conferir/)
    expect(await within(holerite(/Ana/)).findByText('A multa foi cancelada (fictício).')).toBeTruthy()
  })

  it('Enviar baixa o Excel do mês', async () => {
    await abrir()
    passo(/Enviar/)
    fireEvent.click(screen.getByRole('button', { name: 'Baixar Excel' }))
    expect(baixarXlsx).toHaveBeenCalledWith(`descontos-folha-${HOJE}.xlsx`, expect.objectContaining({ colunas: expect.any(Array) }))
    expect(await screen.findByText(/Excel baixado às/)).toBeTruthy()
  })

  it('mês sem parcelas mostra o vazio', async () => {
    await abrir()
    for (let i = 0; i < 12; i++) fireEvent.click(screen.getByRole('button', { name: 'Próximo mês' }))
    const alvo = mesPorExtenso(somaMes(HOJE, 12))
    expect(await screen.findByText(`Nenhum desconto para ${alvo}.`)).toBeTruthy()
  })

  it('clicar numa linha de multa abre a multa na Frota', async () => {
    await abrir()
    fireEvent.click(within(holerite(/Ana/)).getByRole('button', { name: /Multa TST0001/ }))
    expect(window.location.hash).toBe('#/frota-multas?registro=multa:u12')
  })
})
