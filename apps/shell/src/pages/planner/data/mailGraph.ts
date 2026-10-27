// Porte de Tela Planner/src/mailGraph.js (rascunho de cotação no Outlook via Microsoft Graph).

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0'
const SMALL_ATTACHMENT_LIMIT = 3 * 1024 * 1024

type Rec = Record<string, unknown>
const rec = (value: unknown): Rec => (value && typeof value === 'object' ? (value as Rec) : {})

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192))
  return btoa(binary)
}

async function graphRequest(path: string, token: string, options: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`${GRAPH_BASE_URL}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...((options.headers as Record<string, string>) || {}) },
  })
  if (!response.ok) {
    let detail = ''
    try { detail = String(rec(rec(await response.json()).error).message || '') } catch { /* response may be empty */ }
    throw new Error(`Microsoft Graph: ${response.status}${detail ? ` — ${detail}` : ''}`)
  }
  return response.status === 204 ? null : (response.json() as Promise<unknown>)
}

export interface MailAttachment {
  name: string
  bytes: Uint8Array | ArrayBuffer
  contentType?: string
  contentId?: string
  isInline?: boolean
}

async function addAttachment(messageId: string, token: string, attachment: MailAttachment): Promise<unknown> {
  const bytes = attachment.bytes instanceof Uint8Array ? attachment.bytes : new Uint8Array(attachment.bytes)
  if (bytes.byteLength < SMALL_ATTACHMENT_LIMIT) {
    return graphRequest(`/me/messages/${encodeURIComponent(messageId)}/attachments`, token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: attachment.name,
        contentType: attachment.contentType || 'application/octet-stream',
        contentBytes: toBase64(bytes),
        ...(attachment.isInline ? { isInline: true, contentId: attachment.contentId } : {}),
      }),
    })
  }

  const session = rec(await graphRequest(`/me/messages/${encodeURIComponent(messageId)}/attachments/createUploadSession`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ AttachmentItem: { attachmentType: 'file', name: attachment.name, size: bytes.byteLength, isInline: Boolean(attachment.isInline), contentId: attachment.contentId || undefined } }),
  }))
  const chunkSize = 320 * 1024
  for (let start = 0; start < bytes.byteLength; start += chunkSize) {
    const end = Math.min(start + chunkSize, bytes.byteLength) - 1
    const response = await fetch(session.uploadUrl as string, {
      method: 'PUT',
      headers: { 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${bytes.byteLength}` },
      body: bytes.slice(start, end + 1),
    })
    if (!response.ok && response.status !== 201 && response.status !== 202) throw new Error(`Microsoft Graph: falha no upload de ${attachment.name} (${response.status}).`)
  }
  return { name: attachment.name, uploaded: true }
}

export interface QuoteDraftQuote {
  code?: string
  client?: string
  clientContact?: string
  clientEmail?: string
  [extra: string]: unknown
}

export interface QuoteDraftAssets<Q extends QuoteDraftQuote = QuoteDraftQuote> {
  files?: Record<string, Uint8Array | ArrayBuffer> | null
  buildHtml: (quote: Q, options: { imageUrls: Record<string, string> }) => string
}

export interface OutlookDraft {
  id: string
  webLink?: string
  [extra: string]: unknown
}

export async function createQuoteDraft<Q extends QuoteDraftQuote>({ token, quote, mode = 'body', attachment, assets, subject }: {
  token: string
  quote: Q
  mode?: 'body' | 'attachment' | 'both'
  attachment?: MailAttachment | null
  assets?: QuoteDraftAssets<Q> | null
  subject?: string
}): Promise<OutlookDraft> {
  const clientEmail = String(quote?.clientEmail || '').trim()
  if (!clientEmail) throw new Error('Informe o e-mail do cliente antes de criar o rascunho.')
  if (!assets?.files || !Object.keys(assets.files).length) throw new Error('As imagens da cotação ainda não foram carregadas.')

  const inlineAttachments: Array<MailAttachment & { contentId: string }> = mode === 'attachment' ? [] : Object.entries(assets.files).map(([name, bytes]) => ({
    name,
    bytes,
    contentType: 'image/png',
    contentId: `quote-${name.replace(/[^a-z0-9]/gi, '-')}`,
    isInline: true,
  }))
  const imageUrls = Object.fromEntries(inlineAttachments.map((item) => [item.name, `cid:${item.contentId}`]))
  const bodyHtml = assets.buildHtml(quote, { imageUrls })
  const draft = (await graphRequest('/me/messages?$select=id,webLink', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subject: subject || `Cotação ${quote.code || ''}${quote.client ? ` - ${quote.client}` : ''}`.trim(),
      body: { contentType: 'HTML', content: mode === 'attachment' ? `<p>Olá ${quote.clientContact || quote.client || 'cliente'},</p><p>Segue a cotação em anexo.</p>` : bodyHtml },
      toRecipients: [{ emailAddress: { address: clientEmail } }],
    }),
  })) as OutlookDraft
  for (const inline of inlineAttachments) await addAttachment(draft.id, token, inline)
  if ((mode === 'attachment' || mode === 'both') && attachment) await addAttachment(draft.id, token, attachment)
  return draft
}

export function openDraftInOutlook(draft: { webLink?: string } | null | undefined): void {
  if (!draft?.webLink) throw new Error('O rascunho foi criado, mas o Outlook não retornou o link de abertura.')
  window.open(draft.webLink, '_blank', 'noopener,noreferrer')
}

export { toBase64 }
