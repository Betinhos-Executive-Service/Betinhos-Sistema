/** O servidor lê o km como `int` (Contratos.cs) e a coluna é número inteiro: acima disso a gravação falharia. */
export const KM_MAXIMO = 2_147_483_647

/** Km como número inteiro de 1 até o limite; qualquer outra coisa (decimal, ponto de milhar, texto, vazio) devolve null. */
export function lerKm(texto: string): number | null {
  const limpo = texto.trim()
  if (!/^\d+$/.test(limpo)) return null
  const km = Number(limpo)
  return km > 0 && km <= KM_MAXIMO ? km : null
}
