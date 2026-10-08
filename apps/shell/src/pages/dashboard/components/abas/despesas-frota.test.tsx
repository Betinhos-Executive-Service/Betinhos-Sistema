// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { filtrarServicos } from '../../domain/base'
import { dadosVazios, manutencao, reserva, telemetria, veiculo } from '../../domain/test-utils'
import type { Dados, Despesa, Filtros } from '../../domain/types'
import { DespesasTab, FILTROS_DESPESA_VAZIOS, type FiltrosDespesaProprios } from './DespesasTab'
import { FrotaTab } from './FrotaTab'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
  // Recharts avisa que o contêiner tem 0 x 0 no jsdom; o aviso é esperado.
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

const FILTROS: Filtros = { atalho: 'esteMes', inicio: '2026-10-01', fim: '2026-10-15', status: [], clientes: [], motoristas: [], tipos: [] }
const AGORA = new Date('2026-10-15T15:00:00Z')
const PERIODO = '01/10/2026 a 15/10/2026'
/** Texto do elemento com espaços normais (o Intl usa espaço rígido em "R$ 1,00"). */
const texto = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ')
const kpi = (rotulo: string) => texto(screen.getByRole('article', { name: rotulo }))
const ctxDe = (dados: Dados, f: Filtros = FILTROS) => ({ todas: dados.reservas, rv: filtrarServicos(dados.reservas, f), f, now: AGORA })

const despesa = (p: Partial<Despesa> = {}): Despesa => ({
  id: Math.random().toString(36).slice(2), dia: '2026-10-05', mes: '2026-10', valor: 0, categoriaId: '', categoria: '', formaId: '', forma: '',
  empresa: 'BETINHOS', motoristaId: '', motorista: 'Sem motorista', reservaId: '', statusFinanceiro: null, statusAnexo: null, anexos: 0, descricao: '', ...p,
})
const dadosDespesas = (p: Partial<Dados> = {}) => dadosVazios({
  categoriasDespesa: [{ id: 'c-hosp', nome: 'Hospedagem', grupoDre: 'Viagens' }, { id: 'c-alim', nome: 'Alimentação', grupoDre: 'Custos operacionais' }],
  formasPagamento: [{ id: 'f-pix', nome: 'Pix' }, { id: 'f-cartao', nome: 'Cartão' }],
  despesas: [
    despesa({ valor: 140, categoriaId: 'c-hosp', categoria: 'Hospedagem', formaId: 'f-pix', forma: 'Pix', motoristaId: 'm1', motorista: 'Ana Souza' }),
    despesa({ valor: 60, categoriaId: 'c-alim', categoria: 'Alimentação', formaId: 'f-cartao', forma: 'Cartão', empresa: 'DEPAULA', motoristaId: 'm2', motorista: 'Bruno Lima', anexos: 1 }),
    // Período anterior (16/09 a 30/09): base do chip "ANT.".
    despesa({ dia: '2026-09-20', mes: '2026-09', valor: 50, categoriaId: 'c-alim', categoria: 'Alimentação', formaId: 'f-cartao', forma: 'Cartão', anexos: 1 }),
  ],
  ...p,
})

/** A aba com os filtros próprios em estado, como a página faz. */
function DespesasComEstado({ dados }: { dados: Dados }) {
  const [proprios, setProprios] = useState<FiltrosDespesaProprios>(FILTROS_DESPESA_VAZIOS)
  return <DespesasTab ctx={ctxDe(dados)} dados={dados} periodo={PERIODO} proprios={proprios} onProprios={setProprios} />
}

describe('DespesasTab', () => {
  it('mostra os seis KPIs com o chip ANT. e a faixa da hospedagem com texto', () => {
    render(<DespesasComEstado dados={dadosDespesas()} />)
    for (const r of ['Despesa realizada', 'Alimentação', 'Aguardando pagamento', 'Ticket médio', 'Sem comprovante', 'Média hospedagem']) {
      expect(screen.getByRole('article', { name: r })).toBeTruthy()
    }
    expect(kpi('Despesa realizada')).toContain('R$ 200,00')
    // Anterior R$ 50 → +300%: subir é desfavorável, dito em texto.
    expect(kpi('Despesa realizada')).toMatch(/ANT\..*R\$ 50,00.*\+300,0%.*desfavorável/)
    expect(kpi('Sem comprovante')).toMatch(/^Sem comprovante1/)
    expect(kpi('Média hospedagem')).toContain('R$ 140,00')
    expect(kpi('Média hospedagem')).toContain('Dentro da meta')
    expect(kpi('Média hospedagem')).not.toContain('ANT.')
    expect(screen.getByRole('heading', { name: 'Por motorista' })).toBeTruthy()
    expect(screen.getByText('Ana Souza')).toBeTruthy()
  })

  it('filtros próprios (categoria) mudam os números e o botão limpa', () => {
    render(<DespesasComEstado dados={dadosDespesas()} />)
    fireEvent.click(screen.getByRole('combobox', { name: 'Categoria' }))
    // O painel abre como popover; o jsdom não implementa :popover-open e o trata como oculto.
    fireEvent.click(screen.getByRole('option', { name: /Alimentação/, hidden: true }))
    expect(kpi('Despesa realizada')).toContain('R$ 60,00')
    expect(kpi('Média hospedagem')).toContain('Sem lançamentos')
    expect(screen.queryByText('Ana Souza')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros de despesas' }))
    expect(kpi('Despesa realizada')).toContain('R$ 200,00')
  })

  it('o filtro global de motorista vale para as despesas', () => {
    const dados = dadosDespesas()
    render(<DespesasTab ctx={ctxDe(dados, { ...FILTROS, motoristas: ['m2'] })} dados={dados} periodo={PERIODO} proprios={FILTROS_DESPESA_VAZIOS} onProprios={() => {}} />)
    expect(kpi('Despesa realizada')).toContain('R$ 60,00')
  })

  it('despesas indisponíveis: KPIs com o valor s/dado (sem "—") e os cinco blocos com s/dado e o motivo', () => {
    render(<DespesasComEstado dados={dadosDespesas({ indisponiveis: ['despesas'] })} />)
    for (const r of ['Despesa realizada', 'Média hospedagem']) {
      expect(within(screen.getByRole('article', { name: r })).getByText('s/dado').className).toContain('dash-kpi__valor--semdado')
      expect(kpi(r)).not.toContain('—')
    }
    expect(screen.getAllByText(/tabela de despesas não respondeu/)).toHaveLength(5)
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('sem lançamento de hospedagem (tabela no ar), a média mostra "—", não s/dado', () => {
    render(<DespesasComEstado dados={dadosDespesas({ despesas: [despesa({ valor: 60, categoriaId: 'c-alim', categoria: 'Alimentação' })] })} />)
    expect(kpi('Média hospedagem')).toMatch(/^Média hospedagem—/)
    expect(kpi('Média hospedagem')).not.toContain('s/dado')
  })
})

const dadosFrota = (p: Partial<Dados> = {}) => dadosVazios({
  reservas: [reserva({ veiculoId: 'v1', saidaRaw: '2026-10-05T15:00:00Z' })],
  // Status reais do cadastro: Ativo, Vendido ou vazio (spec §6).
  veiculos: [
    veiculo({ id: 'v1', statusLabel: 'Ativo', categoria: 'Propria', blindado: true }),
    veiculo({ id: 'v2', statusLabel: 'Vendido', categoria: 'Terceirizada', blindado: true }),
    veiculo({ id: 'v3', statusLabel: '', categoria: 'Propria' }),
  ],
  manutencoes: [manutencao({ veiculoId: 'v3', statusLabel: 'Programado' }), manutencao({ veiculoId: 'v1', statusLabel: 'Realizado' })],
  telemetria: [telemetria({ veiculoId: 'v1', distanciaKm: 120, velocidadeMedia: 60, velocidadeMaxima: 110, excessos: 2, ociosoMin: 30 })],
  ...p,
})
const renderFrota = (dados: Dados) => render(<FrotaTab ctx={ctxDe(dados)} dados={dados} periodo={PERIODO} />)

describe('FrotaTab', () => {
  it('mostra os cinco KPIs da frota (sem vendidos; em manutenção pelas manutenções em andamento) e as medidas da telemetria', () => {
    renderFrota(dadosFrota())
    expect(kpi('Total de veículos')).toMatch(/^Total de veículos2Frota cadastrada: 3 · 1 vendido$/)
    expect(kpi('Disponíveis')).toMatch(/^Disponíveis150,0% da frota/)
    expect(kpi('Blindados')).toMatch(/^Blindados1/)
    expect(kpi('Em manutenção')).toMatch(/^Em manutenção1/)
    expect(screen.getByRole('article', { name: 'Uso da frota própria' })).toBeTruthy()
    const tele = screen.getByRole('heading', { name: 'Telemetria Infleet' }).closest('section') as HTMLElement
    expect(texto(tele)).toContain('120 km')
    expect(texto(tele)).toContain('110 km/h')
    expect(texto(tele)).toContain('30 min')
    expect(texto(tele)).not.toContain('s/dado')
  })

  it('Infleet indisponível: telemetria, km por dia e eventos viram blocos s/dado com o motivo', () => {
    renderFrota(dadosFrota({ indisponiveis: ['telemetria'] }))
    const tele = screen.getByRole('heading', { name: 'Telemetria Infleet' }).closest('section') as HTMLElement
    expect(within(tele).getByText('s/dado')).toBeTruthy()
    expect(screen.getAllByText(/Infleet não respondeu/)).toHaveLength(3)
    // Os KPIs cadastrais não dependem do Infleet.
    expect(kpi('Total de veículos')).toMatch(/^Total de veículos2/)
  })

  it('veículos indisponíveis: KPIs cadastrais com o valor s/dado, sem "—"', () => {
    renderFrota(dadosFrota({ indisponiveis: ['veiculos'] }))
    expect(kpi('Total de veículos')).toMatch(/^Total de veículoss\/dado/)
    expect(kpi('Total de veículos')).not.toContain('—')
    expect(screen.getAllByText(/cadastro de veículos não respondeu/).length).toBeGreaterThan(0)
  })

  it('manutenções indisponíveis: só "Em manutenção" fica s/dado', () => {
    renderFrota(dadosFrota({ indisponiveis: ['manutencoes'] }))
    expect(kpi('Em manutenção')).toMatch(/^Em manutençãos\/dado/)
    expect(kpi('Total de veículos')).toMatch(/^Total de veículos2/)
  })

  it('eventos por mês: legenda com as séries e a taxa por 1.000 km', () => {
    const ev = (tipo: string) => ({ dia: '2026-10-05', mes: '2026-10', motoristaId: '', tipo, veiculoId: 'v1', descricao: '', velocidade: 0, limite: 0 })
    renderFrota(dadosFrota({ eventos: [ev('routeOverspeed'), ev('hardBraking'), ev('hardCornering')] }))
    const card = screen.getByRole('heading', { name: 'Eventos de condução por mês' }).closest('section') as HTMLElement
    for (const s of ['Excesso de velocidade', 'Aceleração brusca', 'Frenagem brusca', 'Curva brusca']) expect(within(card).getByText(s)).toBeTruthy()
    // 3 eventos em 120 km = 25,00 por 1.000 km.
    expect(texto(card)).toContain('25,00 / 1.000 km')
  })
})
