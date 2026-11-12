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
