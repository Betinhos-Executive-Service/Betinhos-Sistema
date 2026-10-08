import { alertasOperacao, alertasQualidade, cardsFrotaPessoas, type Secundarios } from './alertas'
import { custoFrota, faturamentoPorCliente, metaRealizado, servicosPorMotorista, statusServicos, ticketMensal, topFaturamento, topVolume, totalProduzido } from './analises'
import { filtrarServicos } from './base'
import { emergenciais, producaoPropriaTerceira } from './destaques'
import { comparacao, kpisExecutivos } from './kpis'
import { entre } from './periodo'
import type { Dados, Filtros } from './types'

export type Resumo = ReturnType<typeof calcularResumo>

/** Tudo que a aba Resumo mostra, calculado de uma vez a partir dos dados carregados e dos filtros. */
export function calcularResumo(dados: Dados, f: Filtros, now: Date) {
  const rv = filtrarServicos(dados.reservas, f)
  const ctx = { todas: dados.reservas, rv, f, now }
  const cmp = comparacao(ctx)
  const nowMs = now.getTime()
  const noPeriodo = <T extends { dia: string }>(rows: T[]) => rows.filter((r) => entre(r.dia, f.inicio, f.fim))
  const sec: Secundarios = { ...dados, manutencoes: noPeriodo(dados.manutencoes), multas: noPeriodo(dados.multas), ocorrencias: noPeriodo(dados.ocorrencias) }
  return {
    servicos: rv.length,
    kpis: kpisExecutivos(ctx, cmp),
    frota: cardsFrotaPessoas(rv, sec, nowMs),
    operacao: alertasOperacao(rv, sec, nowMs),
    qualidade: alertasQualidade(rv, nowMs),
    producao: producaoPropriaTerceira(rv, dados.veiculos),
    emergenciais: emergenciais(rv),
    totalProduzido: totalProduzido(ctx, cmp),
    metaRealizado: metaRealizado(ctx, cmp),
    clientes: faturamentoPorCliente(ctx),
    ticketMensal: ticketMensal(ctx, cmp),
    status: statusServicos(ctx),
    custoFrota: custoFrota(ctx, sec.manutencoes, dados.indisponiveis.includes('manutencoes')),
    topVolume: topVolume(ctx),
    topFaturamento: topFaturamento(ctx),
    motoristas: servicosPorMotorista(ctx),
  }
}
