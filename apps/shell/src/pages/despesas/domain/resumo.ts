import { FINANCEIRO, semComprovante } from './status'
import type { Despesa } from './types'

export type Resumo = { qtd: number; total: number; aguardandoQtd: number; aguardandoValor: number; semComprovante: number; duplicidade: number }

/** Linha de resumo da lista filtrada. */
export function resumo(list: Despesa[]): Resumo {
  const r: Resumo = { qtd: list.length, total: 0, aguardandoQtd: 0, aguardandoValor: 0, semComprovante: 0, duplicidade: 0 }
  for (const d of list) {
    const valor = d.valor ?? 0
    r.total += valor
    if (d.statusFinanceiro === FINANCEIRO.aguardando) { r.aguardandoQtd += 1; r.aguardandoValor += valor }
    if (semComprovante(d)) r.semComprovante += 1
    if (d.possivelDuplicidade) r.duplicidade += 1
  }
  return r
}
