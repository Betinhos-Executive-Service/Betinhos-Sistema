import type { Row } from '@betinhos/dataverse'
import { ENTITY } from './queries'

export const MAX_FILE_SIZE = 10 * 1024 * 1024
export const ACCEPT = '.pdf,.doc,.docx,.png,.jpg,.jpeg'
const EXTENSIONS = ACCEPT.split(',')

/** Mensagem de recusa do arquivo, ou null quando ele pode ser enviado. */
export function fileProblem(file: { name: string; size: number }) {
  if (!EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext))) return `${file.name} não é um tipo aceito. Use PDF, DOC, DOCX, PNG ou JPG.`
  if (file.size > MAX_FILE_SIZE) return `${file.name} passa de 10 MB. Reduza o arquivo antes de enviar.`
  return null
}

export type FlowFile = { name: string; type: string; size: number; base64: string }

/** Corpo do POST ao Flow, com as mesmas chaves do legado (index.html:2325-2350). */
export function flowBody(recordId: string, file: FlowFile, payload: Row, uploadedBy: string, uploadedAt: string) {
  const text = (key: string) => (typeof payload[key] === 'string' ? (payload[key] as string) : '')
  return {
    curriculoId: recordId, expenseId: recordId, externalId: ENTITY,
    fileName: file.name, mimeType: file.type || 'application/octet-stream', fileSize: file.size, base64: file.base64,
    candidateName: text('new_nomecompleto'), candidateEmail: text('new_email'), cargoInteresse: text('new_cargointeresse'),
    indicadoPor: text('new_indicadopor'), uploadedBy, uploadedAt,
  }
}

export function parseFlowResponse(text: string) {
  if (!text.trim()) return { webUrl: '' }
  try {
    const body = JSON.parse(text) as { webUrl?: unknown }
    return { webUrl: typeof body.webUrl === 'string' ? body.webUrl : '' }
  } catch {
    return { webUrl: '' }
  }
}

/** Base64 sem o prefixo data:, em blocos para não estourar a pilha com arquivos de 10 MB. */
export async function toBase64(file: Blob) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return btoa(binary)
}

/** Envia ao Flow e devolve o webUrl (vazio quando o Flow não devolve). */
export async function postToFlow(url: string, body: unknown, fetchImpl: typeof fetch = (...args) => fetch(...args)) {
  const response = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!response.ok) throw new Error(`O envio do arquivo falhou (HTTP ${response.status}).`)
  return parseFlowResponse(await response.text()).webUrl
}
