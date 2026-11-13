const FORMATTED = '@OData.Community.Display.V1.FormattedValue'

/**
 * Lê uma célula de `viewFields` pela chave da coluna. Lookup da tabela base não vem pela chave do atributo: a WebApi
 * devolve `_<atributo>_value` e o texto em `@OData.Community.Display.V1.FormattedValue`; tenta a chave e depois essa forma.
 */
export function readViewField(viewFields: Record<string, unknown> | undefined, valueKey: string): { value: unknown; formatted: unknown } {
  const fields = viewFields ?? {}
  const lookupKey = `_${valueKey}_value`
  const value = fields[valueKey] !== undefined ? fields[valueKey] : fields[lookupKey]
  return { value: value === undefined ? '' : value, formatted: fields[`${valueKey}${FORMATTED}`] ?? fields[`${lookupKey}${FORMATTED}`] }
}

const LOOKUP_TABLE = '@Microsoft.Dynamics.CRM.lookuplogicalname'
const GUID = /^\{?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\}?$/i

/** Registro apontado por um campo de lookup da visão (tabela pela anotação da Web API e id pelo valor), ou `null`. */
export function readLookupTarget(viewFields: Record<string, unknown> | undefined, valueKey: string, value: unknown): { table: string; id: string } | null {
  const fields = viewFields ?? {}
  const table = fields[`${valueKey}${LOOKUP_TABLE}`] ?? fields[`_${valueKey}_value${LOOKUP_TABLE}`]
  const id = typeof value === 'string' ? GUID.exec(value)?.[1] : undefined
  return typeof table === 'string' && table && id ? { table, id } : null
}
