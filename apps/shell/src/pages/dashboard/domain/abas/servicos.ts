import { statusServicos, topByShare, type StatusServicos } from '../analises'
import { agrupar, mesesComDados, soma } from '../base'
import { emergenciais, producaoPropriaTerceira, type Emergenciais, type ProducaoPT } from '../destaques'
import { stL } from '../format'
import { produzido, type Contexto } from '../kpis'
import { mesRotulo } from '../periodo'
import type { Reserva, Veiculo } from '../types'

/** Linha das tabelas de participação (`renderShareTable`): % sob quantidade e % sob faturamento. */
export type LinhaParticipacao = { tipo: string; qtd: number; fat: number; pctQtd: number; pctFat: number }
export type KpiContagem = { valor: number; pct: number }
export type Servicos = {
  kpis: { total: number; concluidos: KpiContagem; cancelados: KpiContagem; emergenciais: KpiContagem }
  porMes: { mes: string; rotulo: string; qtd: number }[]
  status: StatusServicos
  porTipoServico: LinhaParticipacao[]
  porTipoVeiculo: LinhaParticipacao[]
  producao: ProducaoPT
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

/** Aba Serviços: tudo calculado de `ctx.rv` (serviços no período e nos segmentos); `veiculos` classifica própria × terceirizada. */
export function calcularServicos(ctx: Contexto, veiculos: Veiculo[]): Servicos {
  const { rv } = ctx
  const total = rv.length
  const concluidos = rv.filter(produzido).length
  const cancelados = rv.filter((r) => { const k = stL(r.statusLabel); return k.includes('cancel') || k.includes('recus') }).length
  const emerg = emergenciais(rv)
  const porMes = agrupar(rv, (r) => r.mes)
  return {
    kpis: {
      total,
      concluidos: { valor: concluidos, pct: pct(concluidos, total) },
      cancelados: { valor: cancelados, pct: pct(cancelados, total) },
      emergenciais: { valor: emerg.total, pct: emerg.percentual },
    },
    porMes: mesesComDados(rv).map((mes) => ({ mes, rotulo: mesRotulo(mes), qtd: porMes.get(mes)?.length ?? 0 })),
    status: statusServicos(ctx),
    porTipoServico: tabelaParticipacao(rv, (r) => r.tipoServico),
    porTipoVeiculo: tabelaParticipacao(rv, (r) => r.tipoVeiculo),
    producao: producaoPropriaTerceira(rv, veiculos),
    emergenciais: emerg,
  }
}
