// Anotações no mesmo formato da timeline nativa do Dataverse (CKEditor):
// <div class="ck-content" data-wrapper="true" ...><p style="margin: 0;">…</p></div>

const WRAPPER_OPEN = '<div class="ck-content" data-wrapper="true" dir="ltr" style="--ck-image-style-spacing: 1.5em; --ck-inline-image-style-spacing: calc(var(--ck-image-style-spacing) / 2); font-family: Segoe UI; font-size: 11pt;">'

function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Texto da textarea → HTML que a timeline nativa exibe com as quebras de linha. */
export function textToNoteHtml(text: string) {
  const lines = text.replace(/\r\n?/g, '\n').trim().split('\n')
  if (lines.length === 1 && !lines[0]) return ''
  const paragraphs = lines.map((line) => `<p style="margin: 0;">${line.trim() ? escapeHtml(line) : '&nbsp;'}</p>`)
  return `${WRAPPER_OPEN}${paragraphs.join('')}</div>`
}

const FORMATTING = /<(img|b|strong|i|em|u|s|a|ul|ol|li|table|h[1-6]|blockquote|span[^>]*style)[\s>]/i

/** Nota sem formatação nem imagem embutida pode ser editada em textarea sem perder nada. */
export function noteIsPlain(html: string) {
  return !FORMATTING.test(html)
}

export function countInlineImages(html: string) {
  return (html.match(/<img[\s>]/gi) ?? []).length
}

export type SafeNode =
  | { type: 'text'; text: string }
  | { type: 'element'; tag: string; attrs: Record<string, string>; children: SafeNode[] }

const ALLOWED = new Set(['p', 'div', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'ul', 'ol', 'li', 'a', 'img', 'span', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'hr', 'pre', 'code'])
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'svg', 'math', 'form', 'input', 'button', 'select', 'textarea'])

/** Imagens só do próprio Dataverse (rich text files / anotações) ou data:image. */
export function safeImageSrc(src: string, origin: string) {
  const value = src.trim()
  if (/^data:image\/(png|jpe?g|gif|webp|bmp);base64,/i.test(value)) return value
  try {
    const url = new URL(value, origin)
    if (url.origin === new URL(origin).origin && url.pathname.startsWith('/api/data/')) return url.href
  } catch { /* inválido */ }
  return null
}

export function safeHref(href: string) {
  const value = href.trim()
  return /^(https?:|mailto:|tel:)/i.test(value) ? value : null
}

/**
 * Converte o HTML da nota numa árvore com allowlist de tags e atributos.
 * Nada é inserido via innerHTML: o componente monta elementos React a partir desta árvore.
 */
export function sanitizeNoteHtml(html: string, origin: string): SafeNode[] {
  if (!html) return []
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const walk = (node: Node): SafeNode[] => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ? [{ type: 'text', text: node.textContent }] : []
    if (node.nodeType !== Node.ELEMENT_NODE) return []
    const element = node as Element
    const tag = element.tagName.toLowerCase()
    if (DROP_WITH_CONTENT.has(tag)) return []
    const children = Array.from(element.childNodes).flatMap(walk)
    if (!ALLOWED.has(tag)) return children
    const attrs: Record<string, string> = {}
    if (tag === 'a') {
      const href = safeHref(element.getAttribute('href') ?? '')
      if (!href) return children
      attrs.href = href
    }
    if (tag === 'img') {
      const src = safeImageSrc(element.getAttribute('src') ?? '', origin)
      if (!src) return []
      attrs.src = src
      attrs.alt = element.getAttribute('alt') ?? ''
    }
    if ((tag === 'td' || tag === 'th') && element.getAttribute('colspan')) attrs.colspan = element.getAttribute('colspan')!.replace(/\D/g, '')
    return [{ type: 'element', tag, attrs, children }]
  }
  return Array.from(doc.body.childNodes).flatMap(walk)
}

// Anexos de anotação guardados no SharePoint: a nota leva um parágrafo com link
// (funciona também na timeline nativa) e atributos data-sp-* que esta tela lê.
export const SP_SITE = 'https://betinhos.sharepoint.com/sites/BetinhosGestoInterna'

export type SpAnexo = { nome: string; caminho: string; id: string; mime: string | null; tamanho: number | null }

export function spWebUrl(caminho: string) {
  return SP_SITE + caminho.split('/').map((part) => encodeURIComponent(part)).join('/')
}

function anexoParagraph(anexo: SpAnexo) {
  const attrs = [
    `href="${escapeHtml(spWebUrl(anexo.caminho))}"`,
    `data-sp-path="${escapeHtml(anexo.caminho)}"`,
    `data-sp-id="${escapeHtml(anexo.id)}"`,
    anexo.mime ? `data-sp-mime="${escapeHtml(anexo.mime)}"` : '',
    anexo.tamanho !== null ? `data-sp-size="${anexo.tamanho}"` : '',
  ].filter(Boolean).join(' ')
  return `<p style="margin: 0;" data-sp-anexo="true"><a ${attrs}>Anexo no SharePoint: ${escapeHtml(anexo.nome)}</a></p>`
}

/** Junta texto e anexos do SharePoint no HTML da nota. */
export function buildNoteHtml(text: string, anexos: SpAnexo[] = []) {
  const corpo = textToNoteHtml(text)
  if (!anexos.length) return corpo
  const links = anexos.map(anexoParagraph).join('')
  return corpo ? `${corpo.slice(0, -'</div>'.length)}${links}</div>` : `${WRAPPER_OPEN}${links}</div>`
}

/** Acrescenta links de anexo a uma nota existente sem mexer no conteúdo dela. */
export function appendAnexos(html: string, anexos: SpAnexo[]) {
  const links = anexos.map(anexoParagraph).join('')
  const trimmed = html.trim()
  if (/data-wrapper="true"/.test(trimmed) && trimmed.endsWith('</div>')) return `${trimmed.slice(0, -'</div>'.length)}${links}</div>`
  return `${trimmed}${WRAPPER_OPEN}${links}</div>`
}

/** Separa os anexos do SharePoint do corpo da nota (corpo sem os parágrafos de link). */
export function extractSpAnexos(html: string): { corpo: string; anexos: SpAnexo[] } {
  if (!html || !/sharepoint|data-sp-/i.test(html)) return { corpo: html, anexos: [] }
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const anexos: SpAnexo[] = []
  for (const link of Array.from(doc.querySelectorAll('a'))) {
    const href = link.getAttribute('href') ?? ''
    let caminho = link.getAttribute('data-sp-path')
    if (!caminho && href.startsWith(`${SP_SITE}/`)) {
      try { caminho = decodeURIComponent(new URL(href).pathname).replace(/^\/sites\/BetinhosGestoInterna/, '') } catch { caminho = null }
    }
    if (!caminho) continue
    const size = Number(link.getAttribute('data-sp-size'))
    anexos.push({
      nome: (link.textContent ?? '').replace(/^Anexo no SharePoint:\s*/, '').trim() || caminho.split('/').pop() || 'anexo',
      caminho,
      id: link.getAttribute('data-sp-id') ?? '',
      mime: link.getAttribute('data-sp-mime'),
      tamanho: Number.isFinite(size) && link.hasAttribute('data-sp-size') ? size : null,
    })
    const paragraph = link.closest('p')
    if (paragraph && paragraph.textContent?.trim() === link.textContent?.trim()) paragraph.remove()
    else link.remove()
  }
  if (!anexos.length) return { corpo: html, anexos: [] }
  return { corpo: doc.body.innerHTML, anexos }
}
