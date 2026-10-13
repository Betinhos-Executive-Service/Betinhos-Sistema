/** Faturamento mensal consolidado (jan = índice 0), copiado do Dashboard.html legado (L7184–7201). */
export const FAT_FIXO: Readonly<Record<number, readonly number[]>> = {
  2023: [148127.05, 218779.86, 344114.51, 280122.75, 363727.08, 298182.52, 282676.23, 434144.06, 314675.09, 365644.26, 366559.39, 281865.47],
  2024: [213816.57, 301775.6, 431967.33, 375306.13, 368946.6, 351496.37, 296388.78, 476702.85, 401841.79, 553994.72, 413078.59, 330595.71],
  2025: [336469.65, 454025.84, 519102.26, 490267.63, 627708.67, 458813.7, 450734.61, 426814.08, 419071.97, 434559.4, 421781.78, 438377.83],
  // Totais do CSV "Serviços prestados 2026"; só a meta usa este ano.
  2026: [276277.52, 444129.04, 500666.92, 0, 0, 0, 0, 0, 0, 0, 0, 0],
}
/** Anos do `yearDataMap` do legado: fallback de faturamento e gráfico de total produzido. 2026 fica de fora. */
export const ANOS_MAPA: readonly number[] = [2023, 2024, 2025]
