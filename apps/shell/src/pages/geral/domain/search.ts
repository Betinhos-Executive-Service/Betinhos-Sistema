/**
 * Busca por palavra-chave da Geral: quais condições entram no FetchXML.
 *
 * A busca é abrangente: o termo vale em qualquer parte do texto em todos os campos da localização rápida
 * (decisão do Renan, 20/10/2026: "Lima" acha "Carlos Lima"). O custo de varredura é contido fora daqui: a página não
 * conta junto, a contagem sai à parte e adiada, e a digitação espera a pausa antes de consultar.
 *
 * O Dataverse só aceita `like` em texto (String/Memo); em lookup, choice ou booleano devolve 400 "Invalid XML" e derruba
 * a busca inteira (DEV, 21/10/2026). Por isso cada tipo vira a sua condição:
 * - texto: `like '%termo%'`;
 * - choice/booleano/estado: `in` com os valores cujo rótulo contém o termo (sem acento nem caixa);
 * - lookup: `in` com os IDs dos registros cujo nome contém o termo (resolvidos antes, ver `source.ts`).
 */
import type { ChoiceOption } from '@betinhos/dataverse'

export type SearchCondition =
  | { attribute: string; operator: 'like'; value: string }
  | { attribute: string; operator: 'in'; values: string[] }

export type SearchField =
  | { attribute: string; kind: 'text' }
  | { attribute: string; kind: 'choice'; options: ChoiceOption[] }
  | { attribute: string; kind: 'lookup'; targets: string[] }

/** Curingas do `like`/`contains` do Dataverse (`%`, `_`, `[`) viram literais entre colchetes. */
export const escapeLike = (text: string) => text.replace(/[[%_]/g, '[$&]')

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const TEXT_TYPES = new Set(['String', 'Memo'])
const CHOICE_TYPES = new Set(['Picklist', 'Boolean', 'State', 'Status'])
const LOOKUP_TYPES = new Set(['Lookup', 'Customer', 'Owner'])

/** Tipo de busca de uma coluna pelo `AttributeType`; outros tipos (data, número, dinheiro) ficam fora. */
export function searchKind(type: string | undefined): SearchField['kind'] | null {
  if (!type) return null
  if (TEXT_TYPES.has(type)) return 'text'
  if (CHOICE_TYPES.has(type)) return 'choice'
  if (LOOKUP_TYPES.has(type)) return 'lookup'
  return null
}

/** Condições `like` para campos de texto; usada pelo mock, onde todos os campos da localização rápida são texto. */
export function searchConditions(query: string, quickFind: string[]): Extract<SearchCondition, { operator: 'like' }>[] {
  const term = query.trim()
  if (!term) return []
  const value = `%${escapeLike(term)}%`
  return quickFind.map((attribute) => ({ attribute, operator: 'like' as const, value }))
}

/**
 * Condições OR da busca, na ordem dos campos; termo vazio não busca. Choice sem rótulo que case e lookup sem registro
 * que case ficam de fora. `ids` dá os IDs já encontrados por tabela alvo do lookup.
 */
export function buildSearch(query: string, fields: SearchField[], ids: (target: string) => string[]): SearchCondition[] {
  const term = query.trim()
  if (!term) return []
  const folded = fold(term)
  return fields.flatMap((field): SearchCondition[] => {
    if (field.kind === 'text') return [{ attribute: field.attribute, operator: 'like', value: `%${escapeLike(term)}%` }]
    const values = field.kind === 'choice'
      ? field.options.filter((o) => fold(o.label).includes(folded)).map((o) => String(o.value))
      : [...new Set(field.targets.flatMap(ids))]
    return values.length ? [{ attribute: field.attribute, operator: 'in', values }] : []
  })
}
