import { filtrarServicos } from './base'
import type { Contexto } from './kpis'
import { periodoAnterior, type Periodo } from './periodo'
import type { Reserva } from './types'

/**
 * Chip "ANT." (comparativo com o período anterior de mesma duração, como Despesas): s/dado sem período anterior, base zero com anterior
 * 0, senão o valor anterior formatado, a variação em % e se ela é favorável ao indicador.
 */
export type ChipAnterior =
  | { rotulo: 'ANT.'; tipo: 'sem-dado' }
  | { rotulo: 'ANT.'; tipo: 'base-zero'; anterior: string }
  | { rotulo: 'ANT.'; tipo: 'valor'; anterior: string; variacao: number; favoravel: boolean }

/** Direção boa do indicador: 'sobe' (serviços, faturamento) ou 'desce' (custo, multas, excessos). Variação 0 é favorável. */
export type Favoravel = 'sobe' | 'desce'

/** Compara o valor atual com o do período anterior; `anterior` null = s/dado (período anterior fora da carga ou conjunto fora do ar). */
export function comparar(atual: number, anterior: number | null, formatar: (v: number) => string, favoravel: Favoravel): ChipAnterior {
  if (anterior == null) return { rotulo: 'ANT.', tipo: 'sem-dado' }
  const texto = formatar(anterior)
  if (!anterior) return { rotulo: 'ANT.', tipo: 'base-zero', anterior: texto }
  const variacao = ((atual - anterior) / Math.abs(anterior)) * 100
  return { rotulo: 'ANT.', tipo: 'valor', anterior: texto, variacao, favoravel: favoravel === 'sobe' ? variacao >= 0 : variacao <= 0 }
}

/**
 * Período anterior do recorte: o que a página calculou em `ctx.anterior` (null quando cai antes da janela carregada) ou, sem ele
 * (testes e chamadas diretas), a janela imediatamente anterior ao filtro.
 */
export const anteriorDe = (ctx: Contexto): Periodo | null => (ctx.anterior === undefined ? periodoAnterior(ctx.f.inicio, ctx.f.fim) : ctx.anterior)

/** Serviços do período anterior com os mesmos segmentos (o `rv` do período anterior); null sem período anterior. */
export function servicosAnteriores(ctx: Contexto): Reserva[] | null {
  const p = anteriorDe(ctx)
  return p ? filtrarServicos(ctx.todas, { ...ctx.f, inicio: p.inicio, fim: p.fim }) : null
}
