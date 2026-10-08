import { describe, expect, it } from 'vitest'
import { ticketMensal } from '../analises'
import { comparacao, type Contexto } from '../kpis'
import { reserva } from '../test-utils'
import type { Filtros, Pagante, Reserva } from '../types'
import { calcularFinanceiro, recebido } from './financeiro'

const NOW = new Date('2026-10-15T15:00:00Z')
const DIA = 86_400_000
const f = (p: Partial<Filtros> = {}): Filtros => ({ atalho: 'esteMes', inicio: '2026-10-01', fim: '2026-10-15', status: [], clientes: [], motoristas: [], tipos: [], ...p })
const ctx = (rv: Reserva[], todas: Reserva[] = rv): Contexto => ({ todas, rv, f: f(), now: NOW })
const iso = (ms: number) => new Date(ms).toISOString()
/** Pagante de teste: pendente via Pix de R$ 0 criado em 01/10; sobrescreva o que importa. */
const pagante = (p: Partial<Pagante> = {}): Pagante => ({
  id: Math.random().toString(36).slice(2), opId: '', pessoaId: '', pessoa: '', valor: 0, forma: 202410002, formaLabel: 'Pix',
  status: 202410001, statusLabel: 'Pendente', criadoRaw: '2026-10-01T12:00:00Z', criadoDia: '2026-10-01', primeiroPagamentoRaw: '', ...p,
})
const pago = (p: Partial<Pagante> = {}) => pagante({ status: 202410002, statusLabel: 'Pago', ...p })

describe('recebido (isReceivedPayment do legado)', () => {
  it('status 202410002 ou rótulo exatamente "pago"/"paga", sem acento e sem caixa', () => {
    expect(recebido(pagante({ status: 202410002, statusLabel: '—' }))).toBe(true)
    expect(recebido(pagante({ status: 1, statusLabel: 'PAGO' }))).toBe(true)
    expect(recebido(pagante({ status: 1, statusLabel: 'Paga' }))).toBe(true)
    expect(recebido(pagante({ status: 1, statusLabel: 'Aguardando pagamento' }))).toBe(false)
    expect(recebido(pagante())).toBe(false)
  })
})

describe('calcularFinanceiro: KPIs', () => {
  it('maior serviço, clientes ativos (sem "Sem cliente") e total recebido pelas reservas pagas', () => {
    const rv = [
      reserva({ cliente: 'Alfa', valor: 1200, fatStatus: 202410010 }),
      reserva({ cliente: 'Alfa', valor: 300 }),
      reserva({ cliente: 'Beta', valor: 4500.5, fatStatus: 202410010 }),
      reserva({ cliente: 'Sem cliente', valor: 50, fatStatus: 202410010 }),
      reserva({ cliente: 'Gama', valor: 0, fatStatus: 202410010 }),
    ]
    const { kpis } = calcularFinanceiro(ctx(rv), [], false)
    expect(kpis.maiorServico).toBe(4500.5)
    expect(kpis.clientesAtivos).toBe(3)
    expect(kpis.totalRecebido).toBe(1200 + 4500.5 + 50)
    expect(calcularFinanceiro(ctx([]), [], false).kpis).toMatchObject({ maiorServico: 0, clientesAtivos: 0, totalRecebido: 0 })
  })

  it('cartão soma pagantes recebidos por cartão/crédito/link/máquina; atrasados são pendentes criados há mais de 5 dias', () => {
    const pags = [
      pago({ valor: 100, formaLabel: 'Cartão de crédito' }),
      pago({ valor: 40, formaLabel: 'Link de pagamento' }),
      pago({ valor: 25, formaLabel: 'Máquina' }),
      pago({ valor: 900, formaLabel: 'Pix' }),
      pagante({ valor: 700, formaLabel: 'Cartão de crédito' }),
      pagante({ criadoRaw: iso(NOW.getTime() - 5 * DIA - 60_000) }),
      pagante({ criadoRaw: iso(NOW.getTime() - 5 * DIA + 60_000) }),
      pagante({ criadoRaw: '' }),
      pago({ criadoRaw: iso(NOW.getTime() - 30 * DIA) }),
    ]
    const { kpis } = calcularFinanceiro(ctx([]), pags, false)
    expect(kpis.cartao).toBe(165)
    // O pendente de cartão (01/10) e o de 5 dias e 1 minuto; o de 4 dias, o sem data e o pago ficam fora.
    expect(kpis.atrasados).toBe(2)
  })

  it('tempo médio de pagamento: createdon até cr40f_datadoprimeiropagamento dos recebidos, só intervalos válidos', () => {
    const pags = [
      pago({ criadoRaw: '2026-10-01T12:00:00Z', primeiroPagamentoRaw: '2026-10-03T12:00:00Z' }),
      pago({ criadoRaw: '2026-10-02T12:00:00Z', primeiroPagamentoRaw: '2026-10-03T00:00:00Z' }),
      pago({ criadoRaw: '2026-10-05T12:00:00Z', primeiroPagamentoRaw: '2026-10-04T12:00:00Z' }),
      pago({ criadoRaw: '2026-10-05T12:00:00Z' }),
      pagante({ criadoRaw: '2026-09-01T12:00:00Z', primeiroPagamentoRaw: '2026-10-01T12:00:00Z' }),
    ]
    const { kpis } = calcularFinanceiro(ctx([]), pags, false)
    expect(kpis.tempoMedioPagamento).toBeCloseTo((2 + 0.5) / 2, 10)
    expect(kpis.pagamentosMedidos).toBe(2)
    expect(kpis.pagamentosRecebidos).toBe(4)
  })

  it('pagantes indisponíveis: cartão, atrasados e tempo viram s/dado (null); os KPIs das reservas continuam', () => {
    const rv = [reserva({ cliente: 'Alfa', valor: 500, fatStatus: 202410010 })]
    const { kpis } = calcularFinanceiro(ctx(rv), [pago({ valor: 10, formaLabel: 'Cartão' })], true)
    expect(kpis).toMatchObject({ maiorServico: 500, clientesAtivos: 1, totalRecebido: 500, cartao: null, atrasados: null, tempoMedioPagamento: null })
  })
})

describe('calcularFinanceiro: ciclo financeiro', () => {
  it('prazo para faturar: finalização até o createdon mais antigo dos pagantes da mesma OP; prazo para pagar, ciclo e CP mais antiga', () => {
    const rv = [
      reserva({ opId: 'op1', finalizadoRaw: '2026-10-01T12:00:00Z' }),
      reserva({ opId: 'op2', finalizadoRaw: '2026-10-02T12:00:00Z' }),
      reserva({ opId: 'op3', finalizadoRaw: '2026-10-09T12:00:00Z' }), // pagante antes da finalização: fora
      reserva({ opId: 'op1', finalizadoRaw: '' }), // sem finalização: fora
      reserva({ opId: 'op9', finalizadoRaw: '2026-10-01T12:00:00Z' }), // sem pagante: fora
    ]
    const pags = [
      pago({ opId: 'op1', criadoRaw: '2026-10-05T12:00:00Z', primeiroPagamentoRaw: '2026-10-06T12:00:00Z' }),
      pagante({ opId: 'op1', criadoRaw: '2026-10-03T12:00:00Z', valor: 320 }),
      pagante({ opId: 'op2', criadoRaw: '2026-10-03T00:00:00Z', valor: 80 }),
      pagante({ opId: 'op3', criadoRaw: '2026-10-08T12:00:00Z' }),
    ]
    const { ciclo } = calcularFinanceiro(ctx(rv), pags, false)
    expect(ciclo.prazoFaturar).toBeCloseTo((2 + 0.5) / 2, 10)
    expect(ciclo.cpsMedidas).toBe(2)
    expect(ciclo.prazoPagar).toBe(1)
    expect(ciclo.ciclo).toBeCloseTo(2.25, 10)
    expect(ciclo.cpMaisAntiga).toBeCloseTo((NOW.getTime() - Date.parse('2026-10-03T00:00:00Z')) / DIA, 10)
    expect(ciclo.cpMaisAntigaValor).toBe(80)
    expect(ciclo.cpMaisAntigaDesde).toBe('2026-10-03T00:00:00Z')
    expect(ciclo.rodoanel).toBeNull()
    expect(ciclo.dataPagamentoDisponivel).toBe(true)
  })

  it('sem data do primeiro pagamento em nenhum pagante: prazo para pagar e ciclo ficam s/dado', () => {
    const rv = [reserva({ opId: 'op1', finalizadoRaw: '2026-10-01T12:00:00Z' })]
    const { ciclo, kpis } = calcularFinanceiro(ctx(rv), [pago({ opId: 'op1', criadoRaw: '2026-10-02T12:00:00Z' })], false)
    expect(ciclo).toMatchObject({ prazoFaturar: 1, prazoPagar: null, ciclo: null, cpMaisAntiga: null, rodoanel: null, dataPagamentoDisponivel: false })
    expect(kpis.tempoMedioPagamento).toBeNull()
  })

  it('sem pagantes ou com o conjunto indisponível tudo fica s/dado', () => {
    const rv = [reserva({ opId: 'op1', finalizadoRaw: '2026-10-01T12:00:00Z' })]
    const vazio = { prazoFaturar: null, prazoPagar: null, ciclo: null, cpMaisAntiga: null, rodoanel: null }
    expect(calcularFinanceiro(ctx(rv), [], false).ciclo).toMatchObject(vazio)
    expect(calcularFinanceiro(ctx(rv), [pagante({ opId: 'op1', criadoRaw: '2026-10-02T12:00:00Z' })], true).ciclo).toMatchObject(vazio)
  })

  it('CP mais antiga nunca é negativa', () => {
    const { ciclo } = calcularFinanceiro(ctx([]), [pagante({ criadoRaw: iso(NOW.getTime() + DIA) })], false)
    expect(ciclo.cpMaisAntiga).toBe(0)
  })
})

describe('calcularFinanceiro: status de faturamento', () => {
  it('só saídas a partir de 01/04/2026, por rótulo, ordenado por quantidade, participação por quantidade', () => {
    const rv = [
      reserva({ saidaRaw: '2026-03-31T23:00:00Z', fatStatusLabel: 'Pago', valor: 999 }),
      reserva({ saidaRaw: '2026-04-01T10:00:00Z', fatStatusLabel: 'Pendente', valor: 100 }),
      reserva({ fatStatusLabel: 'Pago', valor: 200 }),
      reserva({ fatStatusLabel: 'Pendente', valor: 50 }),
      reserva({ fatStatusLabel: 'Pendente', valor: 0 }),
    ]
    expect(calcularFinanceiro(ctx(rv), [], false).statusFaturamento).toEqual([
      { status: 'Pendente', qtd: 3, valor: 150, pct: 75, pctQtd: 75 },
      { status: 'Pago', qtd: 1, valor: 200, pct: 25, pctQtd: 25 },
    ])
  })
})

describe('calcularFinanceiro: clientes', () => {
  it('todos os clientes por faturamento, "Sem cliente" por último, com ticket, participação e meses com variação', () => {
    const rv = [
      reserva({ cliente: 'Sem cliente', valor: 5000, saidaRaw: '2026-10-05T15:00:00Z' }),
      reserva({ cliente: 'Alfa', valor: 1000, cpConcluida: true, saidaRaw: '2026-09-05T15:00:00Z' }),
      reserva({ cliente: 'Alfa', valor: 500, cpConcluida: true, saidaRaw: '2026-10-05T15:00:00Z' }),
      reserva({ cliente: 'Alfa', valor: 500, saidaRaw: '2026-10-06T15:00:00Z' }),
      reserva({ cliente: 'Beta', valor: 3000, cpConcluida: true, saidaRaw: '2026-10-05T15:00:00Z' }),
      reserva({ cliente: 'Gama', valor: 0, saidaRaw: '2026-09-05T15:00:00Z' }),
    ]
    const r = calcularFinanceiro(ctx(rv), [], false)
    expect(r.meses).toEqual([{ mes: '2026-09', rotulo: expect.any(String) }, { mes: '2026-10', rotulo: expect.any(String) }])
    expect(r.clientes.map((c) => c.cliente)).toEqual(['Beta', 'Alfa', 'Gama', 'Sem cliente'])
    const [beta, alfa, gama, sem] = r.clientes
    expect(alfa).toEqual({
      cliente: 'Alfa', servicos: 3, faturamento: 2000, ticket: 750, pct: 20, pctServicos: 50,
      meses: [
        { mes: '2026-09', valor: 1000, delta: { tipo: 'nada' } },
        { mes: '2026-10', valor: 1000, delta: { tipo: 'pct', valor: 0 } },
      ],
    })
    expect(beta.meses).toEqual([{ mes: '2026-09', valor: 0, delta: { tipo: 'nada' } }, { mes: '2026-10', valor: 3000, delta: { tipo: 'novo' } }])
    expect(gama).toMatchObject({ servicos: 1, faturamento: 0, ticket: 0, pct: 0 })
    expect(sem).toMatchObject({ servicos: 1, faturamento: 5000, pct: 50 })
  })

  it('sem serviços: nenhum cliente e os 12 meses do ano corrente', () => {
    const r = calcularFinanceiro(ctx([]), [], false)
    expect(r.clientes).toEqual([])
    expect(r.meses.map((m) => m.mes)).toEqual(Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`))
  })
})

describe('calcularFinanceiro: recebimentos por forma e por status', () => {
  it('todos os pagantes, ordenados por quantidade, participação por valor', () => {
    const pags = [
      pago({ formaLabel: 'Pix', valor: 100 }),
      pagante({ formaLabel: 'Pix', valor: 100 }),
      pagante({ formaLabel: 'Pix', valor: 0 }),
      pago({ formaLabel: 'Cartão de crédito', valor: 600 }),
      pagante({ formaLabel: '—', statusLabel: 'Expirado', valor: 200 }),
    ]
    const r = calcularFinanceiro(ctx([]), pags, false)
    expect(r.porForma).toEqual([
      { forma: 'Pix', qtd: 3, valor: 200, pct: 20, pctQtd: 60 },
      { forma: 'Cartão de crédito', qtd: 1, valor: 600, pct: 60, pctQtd: 20 },
      { forma: '—', qtd: 1, valor: 200, pct: 20, pctQtd: 20 },
    ])
    expect(r.porStatus).toEqual([
      // Empate em quantidade: fica a ordem de chegada (sort estável, como o legado).
      { status: 'Pago', qtd: 2, valor: 700, pct: 70, pctQtd: 40 },
      { status: 'Pendente', qtd: 2, valor: 100, pct: 10, pctQtd: 40 },
      { status: 'Expirado', qtd: 1, valor: 200, pct: 20, pctQtd: 20 },
    ])
    expect(calcularFinanceiro(ctx([]), pags, true)).toMatchObject({ porForma: [], porStatus: [] })
  })

  it('mais de 3 linhas: ficam as acima de 10% do valor (topByShare); se sobrarem menos de 3, as 3 primeiras', () => {
    const pags = [
      ...Array.from({ length: 4 }, () => pagante({ formaLabel: 'A', valor: 1 })),
      ...Array.from({ length: 3 }, () => pagante({ formaLabel: 'B', valor: 100 })),
      ...Array.from({ length: 2 }, () => pagante({ formaLabel: 'C', valor: 100 })),
      pagante({ formaLabel: 'D', valor: 100 }),
    ]
    expect(calcularFinanceiro(ctx([]), pags, false).porForma.map((l) => l.forma)).toEqual(['B', 'C', 'D'])
    const poucos = [
      ...Array.from({ length: 4 }, () => pagante({ formaLabel: 'A', valor: 1000 })),
      pagante({ formaLabel: 'B', valor: 1 }), pagante({ formaLabel: 'C', valor: 1 }), pagante({ formaLabel: 'D', valor: 1 }),
    ]
    expect(calcularFinanceiro(ctx([]), poucos, false).porForma.map((l) => l.forma)).toEqual(['A', 'B', 'C'])
  })
})

describe('calcularFinanceiro: ticket médio mensal', () => {
  it('é o mesmo do Resumo (analises.ticketMensal)', () => {
    const rv = [reserva({ valor: 800, cpConcluida: true }), reserva({ valor: 400, cpConcluida: true, saidaRaw: '2026-10-06T15:00:00Z' })]
    const c = ctx(rv)
    expect(calcularFinanceiro(c, [], false).ticketMensal).toEqual(ticketMensal(c, comparacao(c)))
  })
})
