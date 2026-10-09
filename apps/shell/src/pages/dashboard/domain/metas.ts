/**
 * Metas do dashboard num só lugar. Editável por commit: mude o valor aqui e os cálculos, textos e selos que o usam acompanham.
 * Origem: textos e fórmulas do legado (Dashboard.html L12968 para manutenção, política de hospedagem e `calcularMetaMensal`).
 */

/** Manutenção: corretiva crítica (meta zero no período), corretiva não crítica por mês e prazo da preventiva programada. */
export const META_MANUTENCAO = {
  /** Corretivas críticas aceitas no período. */
  corretivaCritica: 0,
  /** Corretivas não críticas aceitas por mês. */
  naoCriticaPorMes: 5,
  /** Dias da aprovação até a data da preventiva programada (também o corte do "% em até N dias" do prazo médio). */
  preventivaDias: 10,
} as const

/** Média de hospedagem por lançamento: até o alvo está dentro da meta; até o teto, atenção; acima, fora da política (R$). */
export const META_HOSPEDAGEM = { alvo: 150, teto: 200 } as const

/** Meta mensal de faturamento: (50% do mesmo mês em N−1 + 40% em N−2 + 10% em N−3) × 1,13. */
export const META_FATURAMENTO = { pesos: [0.5, 0.4, 0.1] as const, fator: 1.13 } as const
