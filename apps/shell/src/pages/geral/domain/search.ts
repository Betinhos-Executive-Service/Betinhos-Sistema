/**
 * Busca por palavra-chave da Geral: quais condições `like` entram no FetchXML.
 *
 * `%termo%` (contém) obriga o Dataverse a varrer a tabela inteira; `termo%` (prefixo) usa o índice.
 * Por isso o padrão é prefixo, e contém fica só onde o termo costuma estar no meio do texto.
 */

/**
 * Campos de texto livre em que o usuário procura qualquer palavra, não o começo: trajeto ("GRU → Hotel Unique",
 * busca por "Unique") e cliente ("Grupo Atlântico", busca por "Atlântico"). Aqui contém é indispensável; o custo
 * da varredura é aceito só nestes campos. ID da OS, códigos, placas e demais campos da localização rápida usam prefixo.
 */
export const CONTAINS_ATTRIBUTES: ReadonlySet<string> = new Set(['cr40f_trajeto', 'cr40f_cliente'])

/** Campo do código do serviço (`OS-1234`). */
export const CODE_ATTRIBUTE = 'cr40f_id'
export const CODE_PREFIX = 'OS-'
/** Termo que já é um código de serviço: basta o prefixo no código, sem varrer trajeto e cliente. */
const CODE = /^os-\d+$/i
const DIGITS = /^\d+$/

export type SearchCondition = { attribute: string; value: string }

/** Curingas do `like`/`startswith` do Dataverse (`%`, `_`, `[`) viram literais entre colchetes. */
export const escapeLike = (text: string) => text.replace(/[[%_]/g, '[$&]')

/**
 * Termo limpo: sem espaços nas pontas e sem hífen/apóstrofo no começo. Termo que começa com eles
 * é tratado pelo Dataverse como curinga inicial (sem índice e com throttling), e não muda o que se procura.
 */
export const normalizeTerm = (query: string) => query.trim().replace(/^['\-\s]+/, '')

/**
 * Condições OR da busca, na ordem dos campos da localização rápida.
 * - termo vazio (ou só hífen/apóstrofo): nenhuma condição;
 * - 1 caractere: prefixo em todos os campos (contém com uma letra casa quase tudo e só custa varredura);
 * - código de serviço (`OS-12`): só prefixo nos campos que não são de texto livre;
 * - número puro (`1234`): além do resto, `OS-1234%` no código, para achar o serviço pelo número;
 * - demais: contém nos campos de texto livre, prefixo nos outros.
 */
export function searchConditions(query: string, quickFind: string[]): SearchCondition[] {
  const term = normalizeTerm(query)
  if (!term || !quickFind.length) return []
  const literal = escapeLike(term)
  const prefixed = quickFind.filter((attribute) => !CONTAINS_ATTRIBUTES.has(attribute))
  if (CODE.test(term) && prefixed.length) return prefixed.map((attribute) => ({ attribute, value: `${literal}%` }))
  const short = term.length < 2
  const conditions = quickFind.map((attribute) => ({ attribute, value: !short && CONTAINS_ATTRIBUTES.has(attribute) ? `%${literal}%` : `${literal}%` }))
  if (DIGITS.test(term) && quickFind.includes(CODE_ATTRIBUTE)) conditions.push({ attribute: CODE_ATTRIBUTE, value: `${CODE_PREFIX}${literal}%` })
  return conditions
}
