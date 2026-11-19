/**
 * Busca por palavras-chave das listas: o texto digitado vira palavras e cada palavra tem de aparecer em algum campo
 * pesquisável (AND entre palavras, OR entre campos). Este arquivo só monta condições de FetchXML e o destaque; quem
 * escolhe os campos é a página (ver `pages/composicao/data/composition-search.ts`).
 *
 * O Dataverse compara sem acento nem caixa (collation CI_AI); `fold` faz o mesmo no cliente para casar o destaque.
 */
const MAX_KEYWORDS = 6

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR')

/** Palavras da busca: separadas por espaço, sem as de 1 caractere nem repetidas (ignora acento e caixa), no máximo 6. */
export function keywordTokens(search: string): string[] {
  const seen = new Set<string>()
  const tokens: string[] = []
  for (const word of search.split(/\s+/)) {
    const key = fold(word)
    if ([...key].length < 2 || seen.has(key)) continue
    seen.add(key)
    tokens.push(word)
    if (tokens.length === MAX_KEYWORDS) break
  }
  return tokens
}

/** Curingas do `like` do Dataverse (`%`, `_`, `[`) viram literais entre colchetes. */
export const escapeLike = (text: string) => text.replace(/[[%_]/g, '[$&]')

/** Número em formato pt-BR ("1.234,50", "150,00", "150") como decimal de FetchXML ("1234.50"); outro texto vira null. */
export function moneyToken(token: string): string | null {
  if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/.test(token)) return null
  return token.replace(/\./g, '').replace(',', '.')
}

/** Inteiro de até 9 dígitos (cabe em Integer do Dataverse); outro texto vira null. */
export const integerToken = (token: string) => /^\d{1,9}$/.test(token) ? token : null

export type KeywordField = { attribute: string; entity?: string } & (
  | { kind: 'text' | 'integer' }
  /** `formattedOnly`: só palavra com `,` ou `.` ("150,00"); para coluna calculada, que o Dataverse recalcula linha a linha. */
  | { kind: 'money'; formattedOnly?: boolean }
  | { kind: 'choice'; options: { value: string | number; label: string }[] }
)

function conditions(token: string, field: KeywordField): { operator: string; value?: string; values?: string[] } | null {
  switch (field.kind) {
    case 'text': return { operator: 'like', value: `%${escapeLike(token)}%` }
    case 'money': {
      const value = field.formattedOnly && !/[.,]/.test(token) ? null : moneyToken(token)
      return value === null ? null : { operator: 'eq', value }
    }
    case 'integer': { const value = integerToken(token); return value === null ? null : { operator: 'eq', value } }
    case 'choice': {
      const values = field.options.filter((option) => fold(option.label).includes(fold(token))).map((option) => String(option.value))
      return values.length ? { operator: 'in', values } : null
    }
  }
}

/**
 * Filtro `and` com um filtro `or` por palavra (uma condição por campo que aceita a palavra). Campo de outra tabela leva
 * `entity` = alias do link-entity (precisa ser `outer`). Sem nenhuma condição possível devolve null.
 */
export function keywordFilter(document: Document, tokens: string[], fields: KeywordField[]): Element | null {
  const and = document.createElement('filter')
  and.setAttribute('type', 'and')
  for (const token of tokens) {
    const or = document.createElement('filter')
    or.setAttribute('type', 'or')
    for (const field of fields) {
      const found = conditions(token, field)
      if (!found) continue
      const condition = document.createElement('condition')
      condition.setAttribute('attribute', field.attribute)
      condition.setAttribute('operator', found.operator)
      if (field.entity) condition.setAttribute('entityname', field.entity)
      if (found.value !== undefined) condition.setAttribute('value', found.value)
      for (const value of found.values ?? []) {
        const item = document.createElement('value')
        item.textContent = value
        condition.appendChild(item)
      }
      or.appendChild(condition)
    }
    if (or.childElementCount) and.appendChild(or)
  }
  return and.childElementCount ? and : null
}

/** Modo local (sem Dataverse): toda palavra aparece em algum dos textos (ignora acento e caixa). */
export function matchesKeywords(tokens: string[], texts: string[]) {
  const haystack = texts.map(fold)
  return tokens.every((token) => haystack.some((text) => text.includes(fold(token))))
}

/** Trechos `[início, fim)` do texto que casam com alguma palavra (sem acento nem caixa), já unidos e em ordem. */
export function highlightRanges(text: string, tokens: string[]): [number, number][] {
  const needles = tokens.map(fold).filter(Boolean)
  if (!text || !needles.length) return []
  const whole = fold(text)
  const found = needles.filter((needle) => whole.includes(needle))
  if (!found.length) return []
  // Dobrar o texto inteiro mantém o tamanho quando nenhum caractere muda de comprimento; só então dá para mapear 1 a 1.
  let folded = whole
  let starts: number[] | null = null
  let ends: number[] | null = null
  if (whole.length !== text.length || [...text].length !== text.length) {
    folded = ''
    starts = []
    ends = []
    let offset = 0
    for (const char of text) {
      const piece = fold(char)
      for (let index = 0; index < piece.length; index++) { starts.push(offset); ends.push(offset + char.length) }
      folded += piece
      offset += char.length
    }
  }
  const marked = new Array<boolean>(text.length).fill(false)
  for (const needle of found) {
    for (let at = folded.indexOf(needle); at !== -1; at = folded.indexOf(needle, at + 1)) {
      const from = starts ? starts[at] : at
      const to = ends ? ends[at + needle.length - 1] : at + needle.length
      for (let index = from; index < to; index++) marked[index] = true
    }
  }
  const ranges: [number, number][] = []
  for (let index = 0; index < text.length; index++) {
    if (!marked[index]) continue
    const last = ranges[ranges.length - 1]
    if (last && last[1] === index) last[1] = index + 1
    else ranges.push([index, index + 1])
  }
  return ranges
}

type HighlightPart = { text: string; hit: boolean }

/** Divide o texto nos trechos que casam com alguma palavra (sem acento nem caixa), preservando o texto original. */
export function highlightParts(text: string, tokens: string[]): HighlightPart[] {
  const parts: HighlightPart[] = []
  let at = 0
  for (const [start, end] of highlightRanges(text, tokens)) {
    if (start > at) parts.push({ text: text.slice(at, start), hit: false })
    parts.push({ text: text.slice(start, end), hit: true })
    at = end
  }
  if (at < text.length || !parts.length) parts.push({ text: text.slice(at), hit: false })
  return parts
}
