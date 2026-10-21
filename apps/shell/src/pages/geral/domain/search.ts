/**
 * Busca por palavra-chave da Geral: quais condições `like` entram no FetchXML.
 *
 * A busca é abrangente: o termo vale em qualquer parte do texto (`%termo%`) em todos os campos da localização rápida
 * (decisão do Renan, 20/10/2026: "Lima" acha "Carlos Lima"). O custo de varredura é contido fora daqui: a página não
 * conta junto, a contagem sai à parte e adiada, e a digitação espera a pausa antes de consultar.
 */

export type SearchCondition = { attribute: string; value: string }

/** Curingas do `like`/`contains` do Dataverse (`%`, `_`, `[`) viram literais entre colchetes. */
export const escapeLike = (text: string) => text.replace(/[[%_]/g, '[$&]')

/** Condições OR da busca, na ordem dos campos da localização rápida; termo vazio não busca. */
export function searchConditions(query: string, quickFind: string[]): SearchCondition[] {
  const term = query.trim()
  if (!term) return []
  const value = `%${escapeLike(term)}%`
  return quickFind.map((attribute) => ({ attribute, value }))
}
