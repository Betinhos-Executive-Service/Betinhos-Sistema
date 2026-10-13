// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { filtrarServicos } from '../../domain/base'
import { FAT_PAGO } from '../../domain/codes'
import { dadosVazios, reserva, veiculo } from '../../domain/test-utils'
import type { Conjunto, Dados, Filtros, Pagante } from '../../domain/types'
import { FinanceiroCarregando, FinanceiroTab } from './FinanceiroTab'
import { ServicosCarregando, ServicosTab } from './ServicosTab'

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

const PERIODO = '01/09/2026 a 15/10/2026'
const FILTROS: Filtros = { atalho: 'personalizado', inicio: '2026-09-01', fim: '2026-10-15', status: [], clientes: [], motoristas: [], tipos: [] }
const AGORA = new Date('2026-10-15T15:00:00Z')

/** Pagante de teste: pendente via Pix de R$ 0 criado em 01/10; sobrescreva o que importa. */
const pagante = (p: Partial<Pagante> = {}): Pagante => ({
  id: Math.random().toString(36).slice(2), opId: '', pessoaId: '', pessoa: '', valor: 0, forma: 1, formaLabel: 'Pix', status: 1, statusLabel: 'Pendente',
  criadoRaw: '2026-10-01T15:00:00Z', criadoDia: '2026-10-01', primeiroPagamentoRaw: '', ...p,
})

/**
 * Três serviços em dois meses: Tenaris com 2 (set: R$ 1.000 pago; out: R$ 500 emergencial) e Embraer com 1 cancelado (out: R$ 300).
 * Veículo próprio no primeiro serviço.
 */
const BASE: Dados = dadosVazios({
  reservas: [
    reserva({ saidaRaw: '2026-09-10T12:00:00Z', criadoRaw: '2026-09-01T12:00:00Z', valor: 1000, cliente: 'Tenaris', tipoServico: 'Transfer', tipoVeiculo: 'Executivo', fatStatus: FAT_PAGO, fatStatusLabel: 'Pago', veiculoId: 'v1' }),
    reserva({ saidaRaw: '2026-10-02T12:00:00Z', criadoRaw: '2026-10-02T08:00:00Z', valor: 500, cliente: 'Tenaris', tipoServico: 'Transfer', tipoVeiculo: 'Executivo', fatStatusLabel: 'Pendente' }),
    reserva({ saidaRaw: '2026-10-03T12:00:00Z', criadoRaw: '2026-09-20T08:00:00Z', valor: 300, cliente: 'Embraer', statusLabel: 'Cancelado', tipoServico: 'Disposição', tipoVeiculo: 'Van', fatStatusLabel: 'Pendente' }),
  ],
  veiculos: [veiculo({ id: 'v1', statusLabel: 'Ativo', categoria: 'Propria' })],
  pagantes: [
    pagante({ valor: 1000, status: 202410002, statusLabel: 'Pago', formaLabel: 'Cartão de crédito', criadoRaw: '2026-09-11T12:00:00Z', primeiroPagamentoRaw: '2026-09-13T12:00:00Z' }),
  ],
})
const indisponivel = (dados: Dados, ...conjuntos: Conjunto[]): Dados => ({ ...dados, indisponiveis: conjuntos })

const ctxDe = (dados: Dados) => ({ todas: dados.reservas, rv: filtrarServicos(dados.reservas, FILTROS), f: FILTROS, now: AGORA })
const renderServicos = (dados: Dados) => semAvisoDeGrafico(() => render(<ServicosTab ctx={ctxDe(dados)} dados={dados} periodo={PERIODO} />))
const renderFinanceiro = (dados: Dados) => semAvisoDeGrafico(() => render(<FinanceiroTab ctx={ctxDe(dados)} dados={dados} periodo={PERIODO} />))
const kpi = (rotulo: string) => screen.getByRole('article', { name: rotulo })
const bloco = (titulo: string) => screen.getByRole('region', { name: titulo })
const titulos = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)

describe('aba Serviços', () => {
  it('mostra os quatro KPIs com os percentuais como apoio e os seis blocos na ordem', () => {
    renderServicos(BASE)
    const linha = screen.getByRole('region', { name: 'Indicadores de serviços' })
    expect(within(linha).getAllByRole('article')).toHaveLength(4)
    expect(within(kpi('Total de serviços')).getByText('3')).toBeTruthy()
    expect(within(kpi('Concluídos')).getByText('2')).toBeTruthy()
    expect(within(kpi('Concluídos')).getByText('66,7% do total')).toBeTruthy()
    expect(within(kpi('Cancelados')).getByText('1')).toBeTruthy()
    expect(within(kpi('Emergenciais')).getByText('33,3% do total')).toBeTruthy()
    expect(titulos()).toEqual(['Serviços por mês', 'Status dos serviços', 'Por tipo de serviço', 'Por tipo de veículo', 'Produção própria × terceirizada', 'Serviços emergenciais'])
  })

  it('tabelas por tipo trazem quantidade, faturamento e % do faturamento, com o tipo líder em destaque', () => {
    renderServicos(BASE)
    const tipo = bloco('Por tipo de serviço')
    expect(within(tipo).getAllByText('Transfer').length).toBeGreaterThan(0)
    expect(within(tipo).getByText('83,3% do faturamento · 2 serviços')).toBeTruthy()
    expect(within(tipo).getAllByRole('row')).toHaveLength(3) // cabeçalho + 2 tipos
    expect(within(bloco('Por tipo de veículo')).getAllByText('Van').length).toBeGreaterThan(0)
  })

  it('sem veículos, a produção própria × terceirizada mostra s/dado e o motivo; o resto segue', () => {
    renderServicos(indisponivel(BASE, 'veiculos'))
    const producao = bloco('Produção própria × terceirizada')
    expect(within(producao).getByText('s/dado')).toBeTruthy()
    expect(within(producao).getByText(/veículos não carregaram/)).toBeTruthy()
    expect(within(kpi('Total de serviços')).getByText('3')).toBeTruthy()
  })

  it('primeira carga: quatro KPIs ocupados, sem números', () => {
    render(<ServicosCarregando />)
    const linha = screen.getByRole('region', { name: 'Indicadores de serviços' })
    expect(linha.getAttribute('aria-busy')).toBe('true')
    expect(within(linha).getAllByRole('article')).toHaveLength(4)
    expect(within(linha).getAllByText('Carregando')).toHaveLength(4)
  })
})

describe('listas longas no celular (Top 10)', () => {
  const muitos = dadosVazios({ reservas: Array.from({ length: 12 }, (_, i) => reserva({ saidaRaw: '2026-10-02T12:00:00Z', valor: 1000 - i, cliente: `Cliente ${String(i + 1).padStart(2, '0')}` })) })
  const linhasClientes = () => within(bloco('Clientes')).getAllByRole('row').length - 1

  it('Clientes mostra 10 e "Ver todos (12)" no celular; desktop mostra todos sem botão', () => {
    telaCelular(true)
    renderFinanceiro(muitos)
    expect(linhasClientes()).toBe(10)
    const ver = within(bloco('Clientes')).getByRole('button', { name: 'Ver todos (12)' })
    expect(ver.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(ver)
    expect(linhasClientes()).toBe(12)
    expect(within(bloco('Clientes')).getByRole('button', { name: 'Mostrar só as 10 primeiras' }).getAttribute('aria-expanded')).toBe('true')
    cleanup()
    telaCelular(false)
    renderFinanceiro(muitos)
    expect(linhasClientes()).toBe(12)
    expect(within(bloco('Clientes')).queryByRole('button', { name: /Ver todos/ })).toBeNull()
  })
})

describe('chips ANT. (período anterior de mesma duração)', () => {
  it('Serviços e Financeiro mostram o anterior, a variação e se é favorável em texto', () => {
    renderServicos(BASE)
    // 01/09–15/10 (45 dias): o anterior é 18/07–31/08, sem serviços → base zero.
    expect(within(kpi('Total de serviços')).getByText('0 · base zero')).toBeTruthy()
    expect(within(kpi('Cancelados')).getByText('Período anterior')).toBeTruthy()
    cleanup()
    const anterior = { ...BASE, reservas: [...BASE.reservas, reserva({ saidaRaw: '2026-08-10T12:00:00Z', valor: 2000, cliente: 'Tenaris' })] }
    renderFinanceiro(anterior)
    const maior = kpi('Maior serviço')
    expect(within(maior).getByText(/R\$\s2,0k/)).toBeTruthy()
    expect(within(maior).getByText('−50,0%')).toBeTruthy()
    expect(within(maior).getByText(', desfavorável')).toBeTruthy()
  })
})

describe('aba Financeiro', () => {
  it('mostra os seis KPIs e os cinco blocos na ordem, Clientes por último', () => {
    renderFinanceiro(BASE)
    const linha = screen.getByRole('region', { name: 'Indicadores financeiros' })
    expect(within(linha).getAllByRole('article')).toHaveLength(6)
    expect(within(kpi('Clientes ativos')).getByText('2')).toBeTruthy()
    expect(within(kpi('Atrasados > 5 dias')).getByText('0')).toBeTruthy()
    expect(within(kpi('Tempo médio de pagamento')).getByText('2,0 dias')).toBeTruthy()
    expect(within(kpi('Tempo médio de pagamento')).getByText('1 de 1 pagamentos com data confiável · todo o histórico')).toBeTruthy()
    expect(titulos()).toEqual(['Ciclo financeiro', 'Status de faturamento', 'Ticket médio — mensal', 'Recebimentos', 'Clientes'])
  })

  it('ciclo lista as cinco medidas; sem CP pendente mostra "—" com "nenhuma CP pendente" e Rodoanel fica s/dado', () => {
    renderFinanceiro(BASE)
    const lista = within(bloco('Ciclo financeiro')).getByRole('list', { name: 'Medidas do ciclo financeiro' })
    const itens = within(lista).getAllByRole('listitem')
    expect(itens.map((li) => li.querySelector('.dash-lista__rotulo')?.textContent)).toEqual(['Prazo para faturar', 'Prazo para pagar', 'Ciclo financeiro', 'CP pendente mais antiga', 'Rodoanel'])
    expect(within(itens[3]).getByText('—')).toBeTruthy()
    expect(within(itens[3]).getByText('nenhuma CP pendente')).toBeTruthy()
    expect(within(itens[4]).getByText('s/dado')).toBeTruthy()
  })

  it('CP pendente mais antiga traz dias, valor e data de criação', () => {
    renderFinanceiro({ ...BASE, pagantes: [...BASE.pagantes, pagante({ valor: 200, criadoRaw: '2026-10-01T15:00:00Z' })] })
    const item = within(bloco('Ciclo financeiro')).getByText('CP pendente mais antiga').closest('li') as HTMLElement
    expect(within(item).getByText('14 dias')).toBeTruthy()
    expect(within(item).getByText(/R\$\s200,00 desde 01\/10\/2026/)).toBeTruthy()
    expect(within(kpi('Atrasados > 5 dias')).getByText('1')).toBeTruthy()
  })

  it('pagantes cobrem todo o histórico: Recebimentos, Cartão e Atrasados dizem isso no lugar do período (spec §6)', () => {
    renderFinanceiro(BASE)
    expect(within(bloco('Recebimentos')).getByText(/^Todo o histórico ·/)).toBeTruthy()
    expect(within(bloco('Recebimentos')).queryByText(new RegExp(PERIODO))).toBeNull()
    for (const rotulo of ['Cartão', 'Atrasados > 5 dias']) expect(within(kpi(rotulo)).getByText(/todo o histórico/)).toBeTruthy()
  })

  it('sem pagantes: cartão, atrasados, tempo médio, ciclo e recebimentos em s/dado; total recebido vem das reservas', () => {
    renderFinanceiro(indisponivel(BASE, 'pagantes'))
    for (const rotulo of ['Cartão', 'Atrasados > 5 dias', 'Tempo médio de pagamento']) expect(within(kpi(rotulo)).getByText('s/dado')).toBeTruthy()
    expect(within(kpi('Total recebido')).queryByText('s/dado')).toBeNull()
    const ciclo = bloco('Ciclo financeiro')
    expect(within(ciclo).getAllByText('s/dado')).toHaveLength(5)
    expect(within(ciclo).queryByText('nenhuma CP pendente')).toBeNull()
    expect(within(bloco('Recebimentos')).getByText('s/dado')).toBeTruthy()
    expect(within(bloco('Recebimentos')).queryByRole('table')).toBeNull()
  })

  it('recebimentos traz as duas tabelas no mesmo bloco, com status em texto', () => {
    renderFinanceiro(BASE)
    const rec = bloco('Recebimentos')
    expect(within(rec).getByRole('heading', { level: 3, name: 'Por forma' })).toBeTruthy()
    expect(within(rec).getByRole('heading', { level: 3, name: 'Por status' })).toBeTruthy()
    expect(within(rec).getAllByRole('table')).toHaveLength(2)
    expect(within(rec).getByText('Cartão de crédito')).toBeTruthy()
    expect(within(rec).getByText('Pago')).toBeTruthy()
  })

  it('Clientes: "Ver meses" abre e fecha o faturamento mensal da linha no desktop', () => {
    renderFinanceiro(BASE)
    const clientes = bloco('Clientes')
    expect(within(clientes).queryByRole('list', { name: /por mês/ })).toBeNull()
    const botao = within(clientes).getByRole('button', { name: 'Ver meses de Tenaris' })
    expect(botao.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(botao)
    const meses = within(clientes).getByRole('list', { name: 'Faturamento de Tenaris por mês' })
    expect(within(clientes).getByRole('button', { name: 'Ocultar meses de Tenaris' }).getAttribute('aria-controls')).toBe(meses.id)
    expect(within(meses).getAllByRole('listitem')).toHaveLength(2)
    expect(within(meses).getByText('set/26')).toBeTruthy()
    expect(within(meses).getByText('−50,0%')).toBeTruthy()
    expect(within(clientes).queryByRole('list', { name: 'Faturamento de Embraer por mês' })).toBeNull()
    fireEvent.click(within(clientes).getByRole('button', { name: 'Ocultar meses de Tenaris' }))
    expect(within(clientes).queryByRole('list', { name: /por mês/ })).toBeNull()
  })

  it('Clientes no celular: lista com rótulo inline e "Ver meses" fechado por padrão', () => {
    telaCelular(true)
    renderFinanceiro(BASE)
    const clientes = bloco('Clientes')
    expect(within(clientes).getByText(/2 serviços · Faturamento .+ · Ticket .+ · Participação 83,3%/)).toBeTruthy()
    expect(within(clientes).queryByText(/^set\/26:/)).toBeNull()
    const [primeiro] = within(clientes).getAllByRole('button', { name: 'Ver meses' })
    fireEvent.click(primeiro)
    expect(primeiro.getAttribute('aria-expanded')).toBe('true')
    expect(within(clientes).getByText(/^set\/26:/)).toBeTruthy()
    expect(within(clientes).getByText(/^out\/26: .+ \(−50,0%\)$/)).toBeTruthy()
  })

  it('primeira carga: seis KPIs ocupados, sem números', () => {
    render(<FinanceiroCarregando />)
    const linha = screen.getByRole('region', { name: 'Indicadores financeiros' })
    expect(within(linha).getAllByRole('article')).toHaveLength(6)
    expect(within(linha).queryByText('s/dado')).toBeNull()
  })
})
