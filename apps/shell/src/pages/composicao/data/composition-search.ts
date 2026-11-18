import { keywordFilter, type KeywordField } from '../../../app/keywordSearch'
import { loadedChoiceOptions, preloadChoiceOptions } from './filter-options'
import { COMPOSITION_TABLE, type CatalogField, type ViewDefinition } from './views'

const RESERVA = ['cr40f_servicorelacionadogeral']
const CLIENTE = [...RESERVA, 'cr40f_cliente']
const SOLICITANTE = [...RESERVA, 'cr40f_solicitante']
const MOTORISTA = [...RESERVA, 'cr40f_motorista']
const VEICULO = [...RESERVA, 'cr40f_veiculo']
const FINANCEIRO = [...RESERVA, 'cr40f_financeiro']

/**
 * Campos da busca: tabela, coluna e caminho de lookups a partir da composição (`via`, vazio = a própria composição).
 * Lookup entra pelo nome primário da tabela relacionada. O tipo (texto, choice, dinheiro, inteiro) vem da metadata;
 * campo ausente do catálogo (sem privilégio ou removido) fica fora sem quebrar a busca. Cliente e trajeto vêm
 * primeiro, por serem os que a grade sempre mostra.
 */
const SEARCH_FIELDS: { table: string; attribute: string; via: string[] }[] = [
  { table: 'cr40f_clientes1', attribute: 'cr40f_nomedocliente', via: CLIENTE },
  { table: 'cr40f_reservadeveculos', attribute: 'cr40f_trajeto', via: RESERVA },
  { table: COMPOSITION_TABLE, attribute: 'cr40f_id', via: [] },
  { table: COMPOSITION_TABLE, attribute: 'new_status', via: [] },
  { table: 'cr40f_terceirofavorecido', attribute: 'cr40f_name', via: ['cr40f_terceirofavorecido'] },
  { table: 'cr40f_pagamentoaterceiro', attribute: 'cr40f_name', via: ['cr40f_pagamentoaterceiro'] },
  { table: COMPOSITION_TABLE, attribute: 'new_valortotal', via: [] },
  { table: COMPOSITION_TABLE, attribute: 'new_subtotal', via: [] },
  ...['cr40f_id', 'cr40f_idnovo', 'cr40f_cr', 'new_idexterno', 'cr40f_idtenaris', 'cr40f_endereodesada', 'cr40f_destino', 'cr40f_passageirosetelefonedecontato', 'cr40f_email', 'cr40f_obsdeoperao', 'cr40f_observaointerna', 'new_observacaofinal', 'cr40f_tipodoservico', 'cr40f_tipodeveiculo', 'cr40f_statusdefaturamento', 'cr40f_formadepagamento']
    .map((attribute) => ({ table: 'cr40f_reservadeveculos', attribute, via: RESERVA })),
  { table: 'cr40f_bancodedados', attribute: 'cr40f_nomedopassageiro', via: SOLICITANTE },
  { table: 'cr40f_funcionarios', attribute: 'cr40f_nomecompleto', via: MOTORISTA },
  { table: 'cr40f_veiculos', attribute: 'cr40f_placa', via: VEICULO },
  { table: 'cr40f_financeiro', attribute: 'cr40f_idfinanceiro', via: FINANCEIRO },
]
const CHOICE_TYPES = new Set(['Picklist', 'State', 'Status'])
const TEXT_TYPES = new Set(['String', 'Memo'])
const INTEGER_TYPES = new Set(['Integer', 'BigInt'])

const sameVia = (field: CatalogField, via: string[]) => (field.relationships ?? []).map((item) => item.to).join('/') === via.join('/')

/** Campos da busca presentes no catálogo (mais as colunas de dinheiro da visão), sem repetir o mesmo campo. */
export function compositionSearchCatalogFields(catalog: CatalogField[], definition: ViewDefinition) {
  const found = new Map<string, CatalogField>()
  const add = (field: CatalogField | undefined) => { if (field?.available) found.set(`${field.table}.${field.attribute}.${(field.relationships ?? []).map((item) => item.to).join('/')}`, field) }
  for (const { table, attribute, via } of SEARCH_FIELDS) add(catalog.find((field) => field.table === table && field.attribute === attribute && sameVia(field, via) && field.path.length === via.length && (via.length > 0 || table === COMPOSITION_TABLE)))
  for (const { id } of definition.columns) { const field = catalog.find((item) => item.id === id); if (field?.type === 'Money' && !field.path.length) add(field) }
  return [...found.values()]
}

/** Filtro de palavras-chave da Composição; `aliasOf` devolve o alias do link-entity já gerado para o campo (null = campo da própria composição). */
export function compositionKeywordFilter(document: Document, tokens: string[], fields: CatalogField[], aliasOf: (field: CatalogField) => string | null) {
  const specs: KeywordField[] = []
  for (const field of fields) {
    const base = { attribute: field.attribute, ...(aliasOf(field) ? { entity: aliasOf(field)! } : {}) }
    if (TEXT_TYPES.has(field.type)) specs.push({ ...base, kind: 'text' })
    else if (field.type === 'Money') specs.push({ ...base, kind: 'money' })
    else if (INTEGER_TYPES.has(field.type)) specs.push({ ...base, kind: 'integer' })
    else if (CHOICE_TYPES.has(field.type)) {
      const options = loadedChoiceOptions(field)
      if (options?.length) specs.push({ ...base, kind: 'choice', options })
    }
  }
  return keywordFilter(document, tokens, specs)
}

/** Lê os rótulos dos campos de escolha da busca (a palavra é comparada com eles); chamar antes da primeira busca. */
export const preloadSearchChoices = (catalog: CatalogField[], definition: ViewDefinition) =>
  preloadChoiceOptions(compositionSearchCatalogFields(catalog, definition).filter((field) => CHOICE_TYPES.has(field.type)))
