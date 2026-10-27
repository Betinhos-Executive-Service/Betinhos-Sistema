// Porte de Tela Planner/src/quotes/quoteSendBatch.js (sem mudança de comportamento).

export interface QuoteSendOperation {
  method: string
  path: string
  etag?: string
  body: unknown
}

/** Resposta mínima que o batch usa do `fetch`. */
export interface BatchResponse {
  ok: boolean
  text(): Promise<string>
}
export interface BatchRequest {
  method: string
  credentials: RequestCredentials
  body: string
  headers: Record<string, string>
}
export type BatchFetcher = (url: string, request: BatchRequest) => Promise<BatchResponse>

// Uma única changeset: versão, baixa da cotação, tarefa e histórico são tudo-ou-nada.
export async function commitQuoteSend(apiBase: string, operations: QuoteSendOperation[], requestId: string, fetcher: BatchFetcher = fetch): Promise<void> {
  const batch = `batch_${requestId}`
  const changeset = `changeset_${requestId}`
  const parts = operations.map((operation, index) => [
    `--${changeset}`, 'Content-Type: application/http', 'Content-Transfer-Encoding: binary', `Content-ID: ${index + 1}`, '',
    `${operation.method} ${apiBase}${operation.path} HTTP/1.1`, 'Content-Type: application/json; charset=utf-8',
    ...(operation.etag ? [`If-Match: ${operation.etag}`] : []), '', JSON.stringify(operation.body),
  ].join('\r\n'))
  const body = [`--${batch}`, `Content-Type: multipart/mixed; boundary=${changeset}`, '', ...parts, `--${changeset}--`, `--${batch}--`, ''].join('\r\n')
  const response = await fetcher(`${apiBase}/$batch`, {
    method: 'POST', credentials: 'include', body,
    headers: { 'Content-Type': `multipart/mixed; boundary=${batch}`, Accept: 'multipart/mixed', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0' },
  })
  const result = await response.text()
  const statuses = [...result.matchAll(/HTTP\/1\.[01] (\d{3})/g)].map((match) => Number(match[1]))
  if (statuses.includes(412)) throw new Error('A cotação foi alterada por outra pessoa. Recarregue antes de registrar o envio.')
  if (!response.ok || statuses.length !== operations.length || statuses.some((status) => status < 200 || status >= 300)) throw new Error('Não foi possível confirmar o registro do envio no Dataverse. Sua edição continua aberta; confira a conexão e tente novamente.')
}
