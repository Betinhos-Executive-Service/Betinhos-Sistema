import { statusServicos, topByShare, type StatusServicos } from '../analises'
import { agrupar, mesesComDados, soma } from '../base'
import { emergenciais, producaoPropriaTerceira, type Emergenciais, type ProducaoPT } from '../destaques'
import { comparar, servicosAnteriores, type ChipAnterior } from '../comparar'
import { int } from '../format'
import { cancelado, produzido, type Contexto } from '../kpis'
import { mesRotulo } from '../periodo'
import type { Reserva, Veiculo } from '../types'

/** Linha das tabelas de participação (`renderShareTable`): % sob quantidade e % sob faturamento. */
export type LinhaParticipacao = { tipo: string; qtd: number; fat: number; pctQtd: number; pctFat: number }
export type KpiContagem = { valor: number; pct: number }
export type Servicos = {
  kpis: { total: number; concluidos: KpiContagem; cancelados: KpiContagem; emergenciais: KpiContagem }
  /** Chips "ANT." dos quatro KPIs contra o período anterior de mesma duração (mesmos segmentos). */
  ant: Record<'total' | 'concluidos' | 'cancelados' | 'emergenciais', ChipAnterior>
  porMes: { mes: string; rotulo: string; qtd: number }[]
  status: StatusServicos
  porTipoServico: LinhaParticipacao[]
  porTipoVeiculo: LinhaParticipacao[]
  /** null = s/dado (veículos não carregaram: sem a categoria não há como separar própria × terceirizada). */
  producao: ProducaoPT | null
  emergenciais: Emergenciais
}

/**
 * `tblServicosTipo` / `tblTipoVei`: agrupa pelo rótulo, ordena por quantidade (como as chaves do legado), depois por
 * % do faturamento (`renderShareTable`, ordenação estável) e corta com `topByShare` sobre o faturamento.
 */
function tabelaParticipacao(rv: Reserva[], rotulo: (r: Reserva) => string): LinhaParticipacao[] {
  const fat = soma(rv)
  const linhas = [...agrupar(rv, rotulo)]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([tipo, rows]): LinhaParticipacao => {
      const valor = soma(rows)
      return { tipo, qtd: rows.length, fat: valor, pctQtd: rv.length ? (rows.length / rv.length) * 100 : 0, pctFat: fat ? (valor / fat) * 100 : 0 }
    })
    .sort((a, b) => b.pctFat - a.pctFat)
  return topByShare(linhas, fat, (l) => l.fat)
}

const pct = (parte: number, total: number) => (total ? (parte / total) * 100 : 0)

/**
 * Aba Serviços: tudo calculado de `ctx.rv` (serviços no período e nos segmentos); `veiculos` classifica própria × terceirizada.
 * `indisponivel`: o conjunto de veículos falhou e a produção própria × terceirizada mostra s/dado.
 */
export function calcularServicos(ctx: Contexto, veiculos: Veiculo[], indisponivel: boolean): Servicos {
  const { rv } = ctx
  const total = rv.length
  const concluidos = rv.filter(produzido).length
  const cancelados = rv.filter(cancelado).length
  const emerg = emergenciais(rv)
  const porMes = agrupar(rv, (r) => r.mes)
  // Cancelados e emergenciais (criados no dia da saída) pesam na operação: cair é favorável; total e concluídos, subir.
  const ant = servicosAnteriores(ctx)
  const chip = (atual: number, anterior: (rows: Reserva[]) => number, favoravel: 'sobe' | 'desce') => comparar(atual, ant ? anterior(ant) : null, int, favoravel)
  return {
    kpis: {
      total,
      concluidos: { valor: concluidos, pct: pct(concluidos, total) },
      cancelados: { valor: cancelados, pct: pct(cancelados, total) },
      emergenciais: { valor: emerg.total, pct: emerg.percentual },
    },
    ant: {
      total: chip(total, (rows) => rows.length, 'sobe'),
      concluidos: chip(concluidos, (rows) => rows.filter(produzido).length, 'sobe'),
      cancelados: chip(cancelados, (rows) => rows.filter(cancelado).length, 'desce'),
      emergenciais: chip(emerg.total, (rows) => emergenciais(rows).total, 'desce'),
    },
    porMes: mesesComDados(rv).map((mes) => ({ mes, rotulo: mesRotulo(mes), qtd: porMes.get(mes)?.length ?? 0 })),
    status: statusServicos(ctx),
    porTipoServico: tabelaParticipacao(rv, (r) => r.tipoServico),
    porTipoVeiculo: tabelaParticipacao(rv, (r) => r.tipoVeiculo),
    producao: indisponivel ? null : producaoPropriaTerceira(rv, veiculos),
    emergenciais: emerg,
  }
}
