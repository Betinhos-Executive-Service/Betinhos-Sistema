// apps/shell/src/pages/frota/data/customApi.ts
import { ApiError } from './xrm'
/** Chama uma Custom API não vinculada; erro do servidor sai como ApiError com a mensagem do Dataverse (payload.error.message) e o status HTTP (400 = recusa de regra). */
export async function chamarCustomApi(apiUrl: string, nome: string, body: Record<string, unknown>, falha: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${apiUrl}/${nome}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json; charset=utf-8', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0' },
    body: JSON.stringify(body),
  })
  let payload: Record<string, unknown> = {}
  try {
    const parsed: unknown = await response.json()
    if (parsed && typeof parsed === 'object') payload = parsed as Record<string, unknown>
  } catch { /* 204 ou corpo vazio */ }
  if (!response.ok) {
    const erro = payload.error as { message?: unknown } | undefined
    throw new ApiError(typeof erro?.message === 'string' && erro.message ? erro.message : `${falha} (${response.status})`, response.status)
  }
  return payload
}
