import { alertasOperacao, alertasQualidade, type Secundarios } from './alertas'
import { metaRealizado, totalProduzido } from './analises'
import { filtrarServicos } from './base'
import { comparacao, kpisExecutivos } from './kpis'
import { entre } from './periodo'
import { scoreMotoristas } from './score'
import type { Dados, Filtros } from './types'

export type Resumo = ReturnType<typeof calcularResumo>

/**
 * O que a aba Resumo mostra: os seis KPIs executivos, os alertas de operação e de qualidade dos dados, o total produzido
 * (3 anos) e a meta × realizado. Produção, clientes, motoristas e frota vivem nas abas próprias.
 */
export function calcularResumo(dados: Dados, f: Filtros, now: Date) {
  const rv = filtrarServicos(dados.reservas, f)
  const ctx = { todas: dados.reservas, rv, f, now }
  const cmp = comparacao(ctx)
  const noPeriodo = <T extends { dia: string }>(rows: T[]) => rows.filter((r) => entre(r.dia, f.inicio, f.fim))
  const sec: Secundarios = { ...dados, manutencoes: noPeriodo(dados.manutencoes), multas: noPeriodo(dados.multas), ocorrencias: noPeriodo(dados.ocorrencias) }
  return {
    kpis: kpisExecutivos(ctx, cmp),
    operacao: alertasOperacao(rv, sec, now.getTime(), scoreMotoristas(dados.viagens, dados.eventos, dados.telemetria, f.inicio, f.fim)),
    qualidade: alertasQualidade(rv, now.getTime()),
    totalProduzido: totalProduzido(ctx, cmp),
    metaRealizado: metaRealizado(ctx, cmp),
  }
}
