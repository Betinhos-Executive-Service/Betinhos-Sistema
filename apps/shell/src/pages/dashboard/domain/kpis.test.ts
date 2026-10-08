import { describe, expect, it } from 'vitest'
import { aplicarCsv2026, filtrarServicos, opcoesFiltro } from './base'
import { aReceber, comparacao, cpPendentes, kpisExecutivos, recebimentoStats, servicosFuturos, ticketStats, valorDoPeriodo } from './kpis'
import { previsao } from './previsao'
import { reserva } from './test-utils'
import type { Filtros } from './types'

const NOW = new Date('2026-10-15T15:00:00Z')
const f = (p: Partial<Filtros> = {}): Filtros => ({ atalho: 'esteMes', inicio: '2026-10-01', fim: '2026-10-15', status: [], clientes: [], motoristas: [], tipos: [], ...p })

describe('base', () => {
  it('troca jan–mar/2026 do Dataverse pelo CSV pelo texto bruto da saída', () => {
    const dv = [reserva({ id: 'a', saidaRaw: '2026-03-31T22:00:00Z' }), reserva({ id: 'b', saidaRaw: '2026-04-01T01:00:00Z' }), reserva({ id: 'c', saidaRaw: '' })]
    expect(aplicarCsv2026(dv, [reserva({ id: 'csv' })]).map((r) => r.id)).toEqual(['b', 'c', 'csv'])
  })

  it('filtra serviço, período e segmentos (OR dentro, AND entre)', () => {
    const todas = [
      reserva({ id: '1', saidaRaw: '2026-10-02T12:00:00Z', cliente: 'Tenaris' }),
      reserva({ id: '2', saidaRaw: '2026-10-03T12:00:00Z', cliente: 'Embraer' }),
      reserva({ id: '3', saidaRaw: '2026-10-03T12:00:00Z', cliente: 'Tenaris', categoriaItem: 1 }),
      reserva({ id: '4', saidaRaw: '2026-09-30T12:00:00Z', cliente: 'Tenaris' }),
    ]
    expect(filtrarServicos(todas, f()).map((r) => r.id)).toEqual(['1', '2'])
    expect(filtrarServicos(todas, f({ clientes: ['Tenaris'] })).map((r) => r.id)).toEqual(['1'])
    expect(opcoesFiltro(todas).clientes.map((o) => o.value)).toEqual(['Embraer', 'Tenaris'])
  })
})

describe('KPIs', () => {
  it('ticket só com CP concluída e valor > 0', () => {
    const rows = [reserva({ cpConcluida: true, valor: 100 }), reserva({ cpConcluida: true, valor: 300 }), reserva({ cpConcluida: false, valor: 999 }), reserva({ cpConcluida: true, valor: 0 })]
    expect(ticketStats(rows)).toEqual({ value: 400, count: 2, ticket: 200 })
    expect(ticketStats([]).ticket).toBe(0)
  })

  it('recebimento: Pago sobre a base sem Pagante em viagem e Mensal', () => {
    const rows = [reserva({ fatStatus: 202410010, valor: 300 }), reserva({ fatStatus: 202410006, valor: 500 }), reserva({ fatStatus: 202410008, valor: 500 }), reserva({ fatStatus: null, valor: 100 })]
    expect(recebimentoStats(rows)).toEqual({ recebido: 300, base: 400, percentual: 75 })
  })

  it('CP pendente deduplicada pela CP e restrita a produzido + faturamento pendente + categoria serviço', () => {
    const base = { cpPendente: true, fatStatusLabel: 'Pendente', statusLabel: 'Concluído' }
    const rows = [reserva({ ...base, cpId: 'cp1' }), reserva({ ...base, cpId: 'cp1' }), reserva({ ...base, cpId: 'cp2', statusLabel: 'Programado' }), reserva({ ...base, cpId: 'cp3', fatStatusLabel: 'Faturado' }), reserva({ ...base, cpId: '' }), reserva({ ...base, cpId: 'cp4', categoriaItemLabel: 'Hospedagem' })]
    expect(cpPendentes(rows)).toHaveLength(1)
  })

  it('futuros: depois de agora, não cancelado/recusado nem produzido', () => {
    const nowMs = NOW.getTime()
    const rows = [reserva({ saidaRaw: '2026-10-20T12:00:00Z', statusLabel: 'Programado' }), reserva({ saidaRaw: '2026-10-20T12:00:00Z', statusLabel: 'Cancelado' }), reserva({ saidaRaw: '2026-10-20T12:00:00Z', statusLabel: 'Concluído' }), reserva({ saidaRaw: '2026-10-10T12:00:00Z', statusLabel: 'Programado' })]
    expect(servicosFuturos(rows, nowMs)).toHaveLength(1)
  })

  it('a receber: CP concluída + OP + não pago + valor > 0', () => {
    expect(aReceber([reserva({ cpConcluida: true, opId: 'op', valor: 50 }), reserva({ cpConcluida: true, opId: 'op', valor: 70, fatStatus: 202410010 }), reserva({ cpConcluida: true, opId: '', valor: 90 })])).toBe(50)
  })

  it('valor do período cai no histórico fixo quando dá zero e não há segmento', () => {
    expect(valorDoPeriodo([], '2025-02-01', '2025-02-14', f())).toEqual({ value: 454025.84 / 28 * 14, count: null, hasData: true })
    expect(valorDoPeriodo([], '2025-02-01', '2025-02-14', f({ clientes: ['X'] }))).toEqual({ value: 0, count: 0, hasData: false })
    const todas = [reserva({ saidaRaw: '2026-09-02T12:00:00Z', valor: 80 })]
    expect(valorDoPeriodo(todas, '2026-09-01', '2026-09-30', f())).toEqual({ value: 80, count: 1, hasData: true })
  })

  it('KPIs executivos com LM e LY no mês corrente', () => {
    const todas = [
      reserva({ saidaRaw: '2026-10-02T12:00:00Z', valor: 1000, cpConcluida: true, opId: 'op' }),
      reserva({ saidaRaw: '2026-10-03T12:00:00Z', valor: 3000, cpConcluida: true, fatStatus: 202410010 }),
      reserva({ saidaRaw: '2026-09-02T12:00:00Z', valor: 2000, cpConcluida: true }),
    ]
    const ctx = { todas, rv: filtrarServicos(todas, f()), f: f(), now: NOW }
    const cmp = comparacao(ctx)
    expect(cmp).toMatchObject({ produzido: 4000, lmValor: 2000, lmServicos: 1 })
    const k = Object.fromEntries(kpisExecutivos(ctx, cmp).map((x) => [x.id, x]))
    expect(k.faturamento.valor).toBe('R$\u00a04,0k')
    expect(k.faturamento.chips[0]).toEqual({ rotulo: 'LM', tipo: 'valor', anterior: 'R$\u00a02,0k', variacao: 100 })
    expect(k.servicos.valor).toBe('2')
    expect(k.ticket.valor).toBe('R$\u00a02.000,00')
    expect(k.aReceber.valor).toBe('R$\u00a01,0k')
    expect(k.aReceber.apoio[0]).toEqual({ rotulo: '% do faturamento', texto: '25% pendente' })
    expect(k.recebimento.valor).toBe('75%')
    expect(k.servicos.chips.find((c) => c.rotulo === 'LY')).toEqual({ rotulo: 'LY', tipo: 'sem-dado' })
  })
})

describe('previsão', () => {
  const rv = [reserva({ saidaRaw: '2026-10-01T12:00:00Z', valor: 1000 }), reserva({ saidaRaw: '2026-10-10T12:00:00Z', valor: 2000 })]
  it('mês aberto: realizado + média diária × dias restantes', () => {
    expect(previsao(rv, '2026-10-01', '2026-10-15', NOW)).toEqual({ rotulo: 'Previsão até fim do mês', texto: 'R$\u00a06,2k' })
  })
  it('estados encerrado, futuro e sem base', () => {
    expect(previsao(rv, '2026-09-01', '2026-09-30', NOW).texto).toBe('período encerrado')
    expect(previsao(rv, '2026-11-01', '2026-11-30', NOW).texto).toBe('sem base futura')
    expect(previsao([], '2026-10-01', '2026-10-15', NOW).texto).toBe('sem base realizada')
  })
  it('anual só quando o filtro começa em 1º/jan e termina depois de hoje (paridade: "Este ano" até hoje é previsão do mês)', () => {
    expect(previsao(rv, '2026-01-01', '2026-12-31', NOW)).toEqual({ rotulo: 'Previsão anual', texto: 'R$\u00a03,8k' })
    expect(previsao(rv, '2026-01-01', '2026-10-15', NOW).rotulo).toBe('Previsão até fim do mês')
  })
})
