/** Auxiliares puros das dicas de correção (erros que ensinam) e das notas de resultado. */

export const FILTER_HELP =
  "Operadores OData: eq ne gt ge lt le, and/or/not, contains(col,'x'), startswith(col,'x'); texto entre aspas simples; datas ISO com Z (2026-11-01T03:00:00Z); " +
  "relativas: Microsoft.Dynamics.CRM.LastXDays(PropertyName='createdon',PropertyValue=30); lookup: _col_value eq <guid>; choice: col eq <valor numérico>; " +
  "aspa dentro do texto se dobra: 'D''Avila'; DateOnly: filtre por intervalo (ge dia and lt dia+1), eq pela data falha."

export const EMPTY_FILTER_HINT =
  'Nenhum registro com este filtro. Confira: datas são UTC (dia local de São Paulo = 03:00Z a 03:00Z do dia seguinte), choice filtra por valor numérico (describe_table), lookup por _col_value, texto ignora acento e caixa (contains casa ã com a); data só-dia (DateOnly): use intervalo ge dia and lt dia+1.'

/** Minúsculas, sem acento e só letras/números. */
export const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

const words = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3)

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[b.length]
}

export interface Candidate {
  nome: string
  rotulo?: string
  personalizada?: boolean
}

/** Até `max` candidatos parecidos com `query` (nome lógico ou rótulo): substring, palavras em comum, depois distância de edição. */
export function suggest<T extends Candidate>(query: string, items: T[], max = 5): T[] {
  query = query.slice(0, 80)
  const q = norm(query)
  if (!q) return []
  const unprefixed = query.replace(/^[a-z0-9]+_/i, '')
  const tokens = words(unprefixed)
  const bare = norm(unprefixed) || q
  const scored: { item: T; score: number }[] = []
  for (const item of items) {
    const fields = [norm(item.nome), norm(item.nome.replace(/^[a-z0-9]+_/i, '')), norm(item.rotulo ?? '')].filter(Boolean)
    let score = Infinity
    if (fields.some((f) => f.includes(q) || (f.length >= 4 && q.includes(f)))) score = 0
    else {
      const hits = tokens.filter((t) => fields.slice(1).some((f) => f.includes(t))).length
      if (hits) score = 1 + (tokens.length - hits)
      else {
        // Distância de edição sem o prefixo do publisher dos dois lados.
        const d = Math.min(...fields.slice(1).map((f) => levenshtein(bare, f)))
        if (d <= Math.max(2, Math.floor(bare.length / 3))) score = 4 + d
      }
    }
    if (score < Infinity) scored.push({ item, score })
  }
  return scored
    .sort((x, y) => x.score - y.score || Number(!!y.item.personalizada) - Number(!!x.item.personalizada) || x.item.nome.localeCompare(y.item.nome))
    .slice(0, max)
    .map((s) => s.item)
}

/** Colunas (nome/rótulo) cujo nome é a propriedade informada ignorando maiúsculas, ou parecidas. */
export const propertyMissing = (message: string): { property: string; type?: string } | undefined => {
  const m =
    message.match(/Could not find a property named '([^']+)' on type '([^']+)'/i) ??
    message.match(/The property '([^']+)' does not exist on type '([^']+)'/i) ??
    message.match(/undeclared property '([^']+)'()/i) ??
    message.match(/Invalid property '([^']+)' was found in entity '([^']+)'/i)
  if (!m) return undefined
  return { property: m[1], type: m[2] ? m[2].replace(/^Microsoft\.Dynamics\.CRM\./, '') : undefined }
}

/** FetchXML: atributo inexistente (0x80041103). `type` vem em minúsculas (nome lógico). */
export const fetchAttributeMissing = (message: string): { property: string; type: string } | undefined => {
  const m = message.match(/'([^']+)' entity doesn't contain attribute with Name = '([^']+)'/i)
  return m ? { property: m[2], type: m[1].toLowerCase() } : undefined
}

/** `col eq 2026-11-17` em coluna DateOnly do cache: o valor cru varia (T00:00Z ou T03:00Z), então eq falha. */
export function dateOnlyEq(filter: string | undefined, cols: { nome: string; formato?: string }[] | undefined): string[] {
  if (!filter || !cols) return []
  const out: string[] = []
  for (const m of filter.matchAll(/\b([a-z_][a-z0-9_]*)\s+eq\s+'?\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?'?/gi)) {
    if (cols.some((c) => c.nome === m[1].toLowerCase() && c.formato?.startsWith('DateOnly'))) out.push(m[1])
  }
  return out
}

/** Dentro do expand de coleção: some a volta ao pai e o nextLink; devolve se há mais filhos que o expand trouxe. */
export function cleanExpandChildren(rows: Record<string, unknown>[], names: string[], idKey: string): boolean {
  let more = false
  const F = '@OData.Community.Display.V1.FormattedValue'
  const L = '@Microsoft.Dynamics.CRM.lookuplogicalname'
  for (const row of rows) {
    for (const k of names) {
      const next = `${k}@odata.nextLink`
      const kids = row[k]
      if (next in row) {
        if (Array.isArray(kids) && kids.length) more = true
        delete row[next]
      }
      const parentId = row[idKey]
      if (!Array.isArray(kids) || typeof parentId !== 'string') continue
      for (const kid of kids as Record<string, unknown>[]) {
        if (!kid || typeof kid !== 'object') continue
        for (const key of Object.keys(kid)) {
          if (/^_.+_value$/.test(key) && String(kid[key]).toLowerCase() === parentId.toLowerCase()) {
            delete kid[key]
            delete kid[key + F]
            delete kid[key + L]
          }
        }
      }
    }
  }
  return more
}

export const searchDisabled = (code: string, message: string) => /0x80048d0b/i.test(code + message) || /Search feature is disabled/i.test(message)

const SYNTAX_RE = /syntax error|unrecogni[sz]ed|parsing|cannot be parsed|literal|incompatible types|operator|unexpected|expected/i
export const filterSyntaxError = (message: string) => SYNTAX_RE.test(message) && !propertyMissing(message)

/** Colunas pedidas no select (só nomes simples) que vieram nulas em todas as linhas. */
export function nullColumns(rows: unknown[], select?: string): string[] {
  if (!select || !rows.length) return []
  const cols = [...new Set(select.split(',').map((c) => c.trim()).filter((c) => /^[A-Za-z0-9_]+$/.test(c)))]
  return cols.filter((c) => rows.every((r) => (r as Record<string, unknown>)?.[c] == null))
}

/** Nomes das navegações do $expand de primeiro nível (`A($select=x),B` -> A, B). */
export function expandNames(expand?: string): string[] {
  if (!expand) return []
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of `${expand},`) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      const name = cur.match(/^\s*([A-Za-z0-9_]+)/)?.[1]
      if (name) out.push(name)
      cur = ''
    } else cur += ch
  }
  return out
}

/** Colunas `col eq <número>` do filtro (fora de textos entre aspas), sem repetir. */
export function numericEqColumns(filter?: string): { col: string; valor: number }[] {
  if (!filter) return []
  const found = new Map<string, number>()
  for (const m of filter.replace(/'[^']*'/g, "''").matchAll(/\b([A-Za-z][A-Za-z0-9_]*)\s+eq\s+(-?\d+)\b/g)) found.set(m[1], Number(m[2]))
  return [...found].map(([col, valor]) => ({ col, valor }))
}

/** Operadores de outras linguagens no filtro (fora de textos entre aspas): `=`, `==`, `<>`, `!=`, `&&`, `||`. */
export const wrongOperators = (filter?: string): boolean =>
  !!filter && /(^|[^<>!=])=(?!=)|==|<>|!=|&&|\|\|/.test(filter.replace(/'[^']*'/g, "''"))

export const OPERATOR_HINT = 'Use eq/ne/and/or, não = == <> != && ||. Ex.: cr40f_status eq 1 and statecode eq 0.'

/** apply agrupando por lookup falha no OData: o caminho que funciona é o FetchXML aggregate. */
export const applyHint = (table: string, id: string) =>
  `$apply não agrupa por lookup (nem _col_value nem Nav/coluna). Use fetchXml: <fetch aggregate="true"><entity name="${table}"><attribute name="<lookup>" groupby="true" alias="g"/><attribute name="${id}" aggregate="count" alias="total"/><order alias="total" descending="true"/></entity></fetch> (ranking: top no <fetch>). Grupo nulo = linha sem a chave. No OData, groupby só em colunas simples e orderby/top não vão dentro do apply.`

/** Aliases de `<link-entity link-type="outer">` sem `<condition entityname="alias" ... operator="null"/>`: a junção externa devolve todas as linhas da raiz. */
export function outerWithoutNullCheck(xml: string): string[] {
  const conditions = [...xml.matchAll(/<condition\b[^>]*>/gi)].map((m) => m[0])
  const out: string[] = []
  for (const m of xml.matchAll(/<link-entity\b[^>]*>/gi)) {
    if (!/\blink-type\s*=\s*["']outer["']/i.test(m[0])) continue
    const alias = m[0].match(/\balias\s*=\s*["']([^"']+)["']/i)?.[1] ?? m[0].match(/\bname\s*=\s*["']([^"']+)["']/i)?.[1]
    if (!alias) continue
    const checked = conditions.some((c) => new RegExp(`\\bentityname\\s*=\\s*["']${alias.replace(/[^\w]/g, '.')}["']`, 'i').test(c) && /\boperator\s*=\s*["']null["']/i.test(c))
    if (!checked) out.push(alias)
  }
  return out
}

export const OUTER_HINT = (alias: string) =>
  `link-entity outer "${alias}" sem condição null: devolve TODAS as linhas da raiz, com ou sem vínculo. Para "quem NÃO tem": no filtro da raiz, <condition entityname="${alias}" attribute="<id do alvo>" operator="null"/>.`

export const AGGREGATE_HINT =
  'Ranking/"qual teve mais": ordene pelo alias do agregado, <order alias="total" descending="true"/>, e limite com top="1" (ou top="N") no <fetch>; para só contar, aggregate="count". Grupo "(vazio)" = registros sem esse vínculo. Quem não tem nenhum registro não aparece na agregação: para listar quem NÃO tem, use link-type="outer" + <condition entityname="<alias>" attribute="<id>" operator="null"/> no filtro da raiz.'

/** Tira colunas de moeda que o Dataverse devolve sem pedido (`_transactioncurrencyid_value*`, `exchangerate`). */
export function dropCurrencyAux<T extends Record<string, unknown>>(rows: T[], select: string | undefined): T[] {
  if (!select) return rows
  const wanted = new Set(select.split(',').map((c) => c.trim().toLowerCase()))
  const dropKeys = (k: string) =>
    (!wanted.has('_transactioncurrencyid_value') && k.startsWith('_transactioncurrencyid_value')) || (!wanted.has('exchangerate') && k === 'exchangerate')
  return rows.map((r) => {
    if (!r || typeof r !== 'object' || !Object.keys(r).some(dropKeys)) return r
    return Object.fromEntries(Object.entries(r).filter(([k]) => !dropKeys(k))) as T
  })
}

/** Resumo (até 100 caracteres) do texto de um prompt do AI Builder, com as variáveis entre chaves. */
export function promptSummary(raw: unknown): string | undefined {
  try {
    const parts = (JSON.parse(String(raw)) as { prompt?: { type?: string; text?: string }[] }).prompt ?? []
    const t = parts.filter((p) => p.text).map((p) => (p.type === 'inputVariable' ? `{${p.text}}` : p.text)).join('').replace(/\s+/g, ' ').trim()
    return t ? (t.length > 100 ? `${t.slice(0, 97)}...` : t) : undefined
  } catch {
    return undefined
  }
}

/** Texto sem acento e em minúsculas, para casar rótulos de choice. */
export const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
