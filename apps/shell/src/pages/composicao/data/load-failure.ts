/** Campo citado pelo Dataverse quando a consulta pede um atributo que não existe (HTTP 400 do FetchXML ou do OData). */
const MISSING_FIELD = [/attribute with Name = '([^']+)'/i, /property named '([^']+)'/i, /attribute '([^']+)' (?:does not exist|not found)/i]
const MISSING_UNNAMED = /doesn't contain attribute|could not find a property|attribute .* does not exist/i

/** Título e detalhe do aviso de consulta que falhou; campo removido ganha mensagem própria, com o nome quando o erro traz. */
export function describeLoadFailure(message: string): { title: string; detail: string } {
  const field = MISSING_FIELD.map((pattern) => pattern.exec(message)?.[1]).find(Boolean)
  if (field || MISSING_UNNAMED.test(message)) {
    return { title: field ? `Esta visão usa o campo ${field}, que não existe mais` : 'Esta visão usa um campo que não existe mais', detail: 'Edite as colunas ou troque de visão para ver as composições.' }
  }
  return { title: 'Não foi possível carregar as composições', detail: message }
}
