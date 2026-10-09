import { multasPendentes } from '../alertas'
import { topByShare } from '../analises'
import { agrupar } from '../base'
import { anteriorDe, comparar, type ChipAnterior } from '../comparar'
import { int, normL } from '../format'
import type { Contexto } from '../kpis'
import { entre, mesRotulo } from '../periodo'
import type { Dados, Multa } from '../types'

export type LinhaMultaMotorista = { motorista: string; qtd: number; /** % das multas do período. */ pct: number }
export type LinhaMultaInfracao = { infracao: string; qtd: number; pct: number }
export type MultasMes = { mes: string; rotulo: string; qtd: number; pendentes: number }
export type Multas = {
  /** null = s/dado (conjunto não carregou). */
  kpis: { total: number; pendentes: number; resolvidas: number } | null
  /** Chips "ANT." de Multas e Pendentes (cair é favorável); null com a tabela fora do ar. */
  ant: { total: ChipAnterior; pendentes: ChipAnterior } | null
  porMotorista: LinhaMultaMotorista[]
  porInfracao: LinhaMultaInfracao[]
  porMes: MultasMes[]
}

/** `multaTipo` do legado: "código - descrição" (cada parte só se houver), senão "Sem tipo". */
export const infracaoDe = (m: Multa) => [m.infracaoCodigo, m.infracaoDescricao].filter(Boolean).join(' - ') || 'Sem tipo'
/**
 * Multa resolvida. Divergência consciente (spec §6): o legado só olhava "pago", "resolvid" e "conclu"; os status reais encerrados são
 * Pago, Descontado e Finalizado (em PROD, Pago e Descontado somam 164 de 260), então Descontado e Finalizado passam a contar.
 * Rótulo comparado sem acento e sem caixa.
 */
const resolvida = (m: Multa) => {
  const k = normL(m.statusLabel)
  return k.includes('pago') || k.includes('descontado') || k.includes('finaliz') || k.includes('resolvid') || k.includes('conclu')
}

/** `tblMulMot`/`tblMulTipo`: chaves por quantidade desc (ordem estável), % sobre o total e `topByShare` sobre a quantidade. */
function distribuicao(muls: Multa[], chave: (m: Multa) => string) {
  const linhas = [...agrupar(muls, chave)].sort((a, b) => b[1].length - a[1].length).map(([rotulo, rows]) => ({ rotulo, qtd: rows.length }))
  return topByShare(linhas, muls.length, (l) => l.qtd).map((l) => ({ ...l, pct: muls.length ? (l.qtd / muls.length) * 100 : 0 }))
}

/**
 * Aba Multas (`renderMultas`, L16075). Multas pela data no período do filtro (sem segmentos, como `filterByDate`); o motorista já vem
 * resolvido no mapper (apelido via id ou rótulo do lookup). "Por status" sai (spec §1); "Por mês" é novo, pelo mês da multa.
 */
export function calcularMultas(ctx: Contexto, dados: Dados): Multas {
  if (dados.indisponiveis.includes('multas')) return { kpis: null, ant: null, porMotorista: [], porInfracao: [], porMes: [] }
  const { f } = ctx
  const muls = dados.multas.filter((m) => entre(m.dia, f.inicio, f.fim))
  const p = anteriorDe(ctx)
  const anteriores = p ? dados.multas.filter((m) => entre(m.dia, p.inicio, p.fim)) : null
  const pendentes = multasPendentes(muls).length
  const porMes = agrupar(muls, (m) => m.dia.slice(0, 7))
  return {
    kpis: { total: muls.length, pendentes, resolvidas: muls.filter(resolvida).length },
    ant: {
      total: comparar(muls.length, anteriores ? anteriores.length : null, int, 'desce'),
      pendentes: comparar(pendentes, anteriores ? multasPendentes(anteriores).length : null, int, 'desce'),
    },
    porMotorista: distribuicao(muls, (m) => m.motorista || '—').map(({ rotulo, qtd, pct }) => ({ motorista: rotulo, qtd, pct })),
    porInfracao: distribuicao(muls, infracaoDe).map(({ rotulo, qtd, pct }) => ({ infracao: rotulo, qtd, pct })),
    porMes: [...porMes.keys()].sort().map((mes) => {
      const rows = porMes.get(mes) ?? []
      return { mes, rotulo: mesRotulo(mes), qtd: rows.length, pendentes: multasPendentes(rows).length }
    }),
  }
}
