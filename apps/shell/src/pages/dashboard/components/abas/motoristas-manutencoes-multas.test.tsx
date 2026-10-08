// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ManutencoesTab } from './ManutencoesTab'
import { MotoristasTab, type FrotaMotorista } from './MotoristasTab'
import { MultasTab } from './MultasTab'
import { filtrarServicos } from '../../domain/base'
import { MULTA_NOTIFICAR } from '../../domain/codes'
import { dadosVazios, funcionario, manutencao, multa, reserva, veiculo } from '../../domain/test-utils'
import type { Dados, Filtros } from '../../domain/types'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const telaCelular = (mobile: boolean) => vi.stubGlobal('matchMedia', (query: string) => ({ matches: mobile && query.includes('820px'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  telaCelular(false)
})
/** Recharts avisa que o contêiner tem 0 x 0 no jsdom; o aviso é esperado nos testes que desenham gráficos. */
function semAvisoDeGrafico<T>(fn: () => T): T {
  const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try { return fn() } finally { aviso.mockRestore() }
}
const PERIODO = '01/10/2026 a 15/10/2026'
const FILTROS: Filtros = { atalho: 'esteMes', inicio: '2026-10-01', fim: '2026-10-15', status: [], clientes: [], motoristas: [], tipos: [] }
const AGORA = new Date('2026-10-15T15:00:00Z')
const props = (dados: Dados | null) => ({ ctx: dados ? { todas: dados.reservas, rv: filtrarServicos(dados.reservas, FILTROS), f: FILTROS, now: AGORA } : null, dados, periodo: PERIODO })
/** A aba com o filtro Próprios/Terceiros em estado, como a página faz. */
function Motoristas({ dados }: { dados: Dados | null }) {
  const [frota, setFrota] = useState<FrotaMotorista>('todos')
  return <MotoristasTab {...props(dados)} frota={frota} onFrota={setFrota} />
}
const kpi = (rotulo: string) => screen.getByRole('article', { name: rotulo })
const card = (titulo: string) => screen.getByRole('heading', { name: titulo }).closest('section') as HTMLElement
/** Títulos dos blocos (eyebrow do card), na ordem da página; os estados vazios também são h2 e ficam de fora. */
const titulosDosBlocos = () => screen.getAllByRole('heading', { level: 2 }).filter((h) => h.classList.contains('dash-card__titulo')).map((h) => h.textContent)
const linhaDe = (raiz: HTMLElement, texto: string) => within(raiz).getAllByRole('row').find((r) => within(r).queryAllByText(texto).length > 0) as HTMLElement

/** Ana dirige o veículo próprio (2 serviços), Beto o terceirizado (1 serviço); Ana tem CNH vencendo em 10 dias. */
function dadosMotoristas(p: Partial<Dados> = {}): Dados {
  return dadosVazios({
    funcionarios: [
      funcionario({ id: 'f1', nome: 'Ana Souza', apelido: 'Ana', funcao: 'Motorista', cnhMs: AGORA.getTime() + 10 * 86_400_000 }),
      funcionario({ id: 'f2', nome: 'Beto Lima', apelido: 'Beto', funcao: 'Motorista', cnhMs: Date.parse('2028-01-01T12:00:00Z') }),
      funcionario({ id: 'f3', nome: 'Caio Inativo', statusLabel: 'Inativo' }),
    ],
    veiculos: [veiculo({ id: 'v1', categoria: 'Propria' }), veiculo({ id: 'v2', categoria: 'Terceirizada' })],
    reservas: [
      reserva({ motoristaId: 'f1', motorista: 'Ana', veiculoId: 'v1', valor: 500, saidaRaw: '2026-10-03T15:00:00Z' }),
      reserva({ motoristaId: 'f1', motorista: 'Ana', veiculoId: 'v1', valor: 300, saidaRaw: '2026-10-08T15:00:00Z' }),
      reserva({ motoristaId: 'f2', motorista: 'Beto', veiculoId: 'v2', valor: 200, saidaRaw: '2026-10-09T15:00:00Z' }),
    ],
    ...p,
  })
}

describe('MotoristasTab', () => {
  it('mostra os três KPIs e os blocos na ordem do brief', () => {
    semAvisoDeGrafico(() => render(<Motoristas dados={dadosMotoristas()} />))
    expect(within(kpi('Motoristas ativos')).getByText('2')).toBeTruthy()
    expect(within(kpi('CNH em atenção')).getByText('1')).toBeTruthy()
    expect(within(kpi('Score médio')).getByText('—')).toBeTruthy()
    expect(titulosDosBlocos()).toEqual(['Ranking de motoristas', 'CNH vencendo', 'Nota de condução por mês', 'Score por motorista e mês', 'Ranking mensal'])
    expect(within(card('CNH vencendo')).getByText('Vence em 10 dias')).toBeTruthy()
    expect(within(card('CNH vencendo')).getByText('Validade 25/10/2026')).toBeTruthy()
  })

  it('filtra o ranking por Próprios e Terceiros', () => {
    semAvisoDeGrafico(() => render(<Motoristas dados={dadosMotoristas()} />))
    const ranking = card('Ranking de motoristas')
    expect(within(ranking).getByText('Ana')).toBeTruthy()
    expect(within(ranking).getByText('Beto')).toBeTruthy()
    fireEvent.click(within(ranking).getByRole('radio', { name: 'Terceiros' }))
    expect(within(ranking).queryByText('Ana')).toBeNull()
    expect(within(ranking).getByText('Beto')).toBeTruthy()
    expect(within(ranking).getByText('1 motorista')).toBeTruthy()
    fireEvent.click(within(ranking).getByRole('radio', { name: 'Próprios' }))
    expect(within(ranking).getByText('Ana')).toBeTruthy()
    expect(within(ranking).queryByText('Beto')).toBeNull()
  })

  it('abre e fecha os meses de um motorista', () => {
    semAvisoDeGrafico(() => render(<Motoristas dados={dadosMotoristas()} />))
    const botao = screen.getByRole('button', { name: 'Ver meses de Ana' })
    expect(botao.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('list', { name: 'Serviços de Ana por mês' })).toBeNull()
    fireEvent.click(botao)
    const meses = screen.getByRole('list', { name: 'Serviços de Ana por mês' })
    expect(within(meses).getByText('out/26')).toBeTruthy()
    expect(within(meses).getByText('66,7% do mês')).toBeTruthy()
    const fechar = screen.getByRole('button', { name: 'Ocultar meses de Ana' })
    expect(fechar.getAttribute('aria-controls')).toBe(meses.id)
    fireEvent.click(fechar)
    expect(screen.queryByRole('list', { name: 'Serviços de Ana por mês' })).toBeNull()
  })

  it('sem veículos, desabilita Próprios/Terceiros e avisa em texto', () => {
    semAvisoDeGrafico(() => render(<Motoristas dados={dadosMotoristas({ indisponiveis: ['veiculos'] })} />))
    const ranking = card('Ranking de motoristas')
    expect((within(ranking).getByRole('radio', { name: 'Próprios' }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(ranking).getByRole('radio', { name: 'Terceiros' }) as HTMLButtonElement).disabled).toBe(true)
    expect(within(ranking).getByText(/o filtro próprio\/terceiro não se aplica/)).toBeTruthy()
    expect(within(ranking).getByText('Ana')).toBeTruthy()
  })

  it('mostra s/dado quando funcionários e Infleet não carregam', () => {
    render(<Motoristas dados={dadosMotoristas({ indisponiveis: ['funcionarios', 'viagens'] })} />)
    for (const rotulo of ['Motoristas ativos', 'CNH em atenção', 'Score médio']) expect(within(kpi(rotulo)).getByText('s/dado')).toBeTruthy()
    expect(within(card('Ranking de motoristas')).getByText(/cadastro de funcionários não respondeu/)).toBeTruthy()
    expect(within(card('Ranking mensal')).getByText(/Infleet não respondeu/)).toBeTruthy()
  })

  it('no celular, o ranking vira lista com rótulo inline e "Ver meses"', () => {
    telaCelular(true)
    semAvisoDeGrafico(() => render(<Motoristas dados={dadosMotoristas()} />))
    const ranking = card('Ranking de motoristas')
    const ana = linhaDe(ranking, 'Ana')
    expect(within(ana).getByText(/2 serviços .* · Faturamento R\$/)).toBeTruthy()
    fireEvent.click(within(ana).getByRole('button', { name: 'Ver meses' }))
    expect(within(ana).getByText('out/26: 2 · 66,7% do mês')).toBeTruthy()
  })

  it('na primeira carga mostra os KPIs ocupados, sem números', () => {
    render(<Motoristas dados={null} />)
    expect(screen.getByRole('region', { name: 'Indicadores de motoristas' }).getAttribute('aria-busy')).toBe('true')
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
  })
})

describe('ManutencoesTab', () => {
  const dados = () => dadosVazios({
    reservas: [reserva({ valor: 10_000 })],
    manutencoes: [
      manutencao({ dia: '2026-10-05', valor: 1_000, tipoReparo: 'Corretiva crítica', statusLabel: 'Em andamento', dataMs: Date.parse('2026-10-05T12:00:00Z'), criadoMs: Date.parse('2026-10-01T12:00:00Z') }),
      manutencao({ dia: '2026-10-06', valor: 500, tipoReparo: 'Preventiva sistemática', aprovacaoDia: '2026-10-02', statusLabel: 'Realizado', dataMs: Date.parse('2026-10-06T12:00:00Z'), criadoMs: Date.parse('2026-09-20T12:00:00Z') }),
    ],
  })

  it('mostra os cinco KPIs com % da receita e prazo médio', () => {
    semAvisoDeGrafico(() => render(<ManutencoesTab {...props(dados())} />))
    expect(within(kpi('Manutenções')).getByText('2')).toBeTruthy()
    expect(within(kpi('Custo total')).getByText(/1\.500,00/)).toBeTruthy()
    expect(within(kpi('Custo total')).getByText('15,0%')).toBeTruthy()
    expect(within(kpi('Em andamento')).getByText('1')).toBeTruthy()
    expect(within(kpi('Custo médio')).getByText(/750,00/)).toBeTruthy()
    expect(within(kpi('Prazo médio')).getByText('10,0 dias')).toBeTruthy()
    expect(within(kpi('Prazo médio')).getByText('50,0%')).toBeTruthy()
  })

  it('dá o selo Dentro/Fora da meta em texto a cada categoria', () => {
    semAvisoDeGrafico(() => render(<ManutencoesTab {...props(dados())} />))
    const categorias = card('Categorias com metas')
    expect(within(linhaDe(categorias, 'Corretiva crítica')).getByText('Fora da meta')).toBeTruthy()
    expect(within(linhaDe(categorias, 'Corretiva não crítica')).getByText('Dentro da meta')).toBeTruthy()
    expect(within(linhaDe(categorias, 'Preventiva programada')).getByText('Dentro da meta')).toBeTruthy()
    expect(within(linhaDe(categorias, 'Avaria')).getByText('Sem meta')).toBeTruthy()
    expect(within(categorias).getByText('1 fora da meta')).toBeTruthy()
  })

  it('mostra s/dado nos KPIs e nos blocos quando a tabela não carrega', () => {
    render(<ManutencoesTab {...props(dadosVazios({ indisponiveis: ['manutencoes'] }))} />)
    for (const rotulo of ['Manutenções', 'Custo total', 'Em andamento', 'Custo médio', 'Prazo médio']) expect(within(kpi(rotulo)).getByText('s/dado')).toBeTruthy()
    expect(within(card('Categorias com metas')).getByText(/tabela de manutenções não respondeu/)).toBeTruthy()
    expect(within(card('Categorias com metas')).queryByText('Dentro da meta')).toBeNull()
  })
})

describe('MultasTab', () => {
  const dados = () => dadosVazios({
    multas: [
      multa({ dia: '2026-10-02', status: MULTA_NOTIFICAR, statusLabel: 'Notificar o Condutor', motorista: 'Ana', infracaoCodigo: '7455', infracaoDescricao: 'Excesso de velocidade' }),
      multa({ dia: '2026-10-04', statusLabel: 'Pago', motorista: 'Ana', infracaoCodigo: '7455', infracaoDescricao: 'Excesso de velocidade' }),
      multa({ dia: '2026-10-09', statusLabel: 'Indicada', motorista: 'Beto' }),
    ],
  })

  it('mostra total, pendentes e resolvidas e os três blocos', () => {
    semAvisoDeGrafico(() => render(<MultasTab {...props(dados())} />))
    expect(within(kpi('Multas')).getByText('3')).toBeTruthy()
    expect(within(kpi('Pendentes')).getByText('1')).toBeTruthy()
    expect(within(kpi('Resolvidas')).getByText('1')).toBeTruthy()
    expect(titulosDosBlocos()).toEqual(['Multas por mês', 'Por motorista', 'Por infração'])
    expect(within(linhaDe(card('Por motorista'), 'Ana')).getByText('2')).toBeTruthy()
    expect(within(card('Por infração')).getByText('7455 - Excesso de velocidade')).toBeTruthy()
    expect(within(card('Por infração')).getByText('Sem tipo')).toBeTruthy()
  })

  it('mostra s/dado quando a tabela de multas não carrega', () => {
    render(<MultasTab {...props(dadosVazios({ indisponiveis: ['multas'] }))} />)
    for (const rotulo of ['Multas', 'Pendentes', 'Resolvidas']) expect(within(kpi(rotulo)).getByText('s/dado')).toBeTruthy()
    expect(within(card('Por infração')).getByText(/tabela de multas não respondeu/)).toBeTruthy()
  })
})
