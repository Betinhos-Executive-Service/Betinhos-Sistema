import { alertasOperacao, alertasQualidade, type Secundarios } from './alertas'
import { metaRealizado, totalProduzido } from './analises'
import { comparacao, kpisExecutivos, type Contexto } from './kpis'
import { entre } from './periodo'
import { scoreMotoristas } from './score'
import type { Dados } from './types'

export type Resumo = ReturnType<typeof calcularResumo>

/**
 * O que a aba Resumo mostra: os seis KPIs executivos, os alertas de operação e de qualidade dos dados, o total produzido
 * (3 anos) e a meta × realizado. Produção, clientes, motoristas e frota vivem nas abas próprias.
 */
export function calcularResumo(ctx: Contexto, dados: Dados) {
  // O recorte vem pronto da página (`ctx.rv` = serviços no período e nos segmentos): nada é refiltrado aqui.
  const { rv, f, now } = ctx
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
