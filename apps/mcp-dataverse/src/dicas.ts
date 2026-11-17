/** Auxiliares puros das dicas de correção (erros que ensinam) e das notas de resultado. */

export const FILTER_HELP =
  "Operadores OData: eq ne gt ge lt le, and/or/not, contains(col,'x'), startswith(col,'x'); texto entre aspas simples; datas ISO com Z (2026-11-01T03:00:00Z); " +
  "relativas: Microsoft.Dynamics.CRM.LastXDays(PropertyName='createdon',PropertyValue=30); lookup: _col_value eq <guid>; choice: col eq <valor numérico>."

export const EMPTY_FILTER_HINT =
  'Nenhum registro com este filtro. Confira: datas são UTC (dia local de São Paulo = 03:00Z a 03:00Z do dia seguinte), choice filtra por valor numérico (describe_table), lookup por _col_value, texto exato diferencia acentos (use contains).'

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
    message.match(/undeclared property '([^']+)'()/i)
  if (!m) return undefined
  return { property: m[1], type: m[2] ? m[2].replace(/^Microsoft\.Dynamics\.CRM\./, '') : undefined }
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

/** Operadores de outras linguagens no filtro (fora de textos entre aspas): `=`, `==`, `<>`, `!=`, `&&`, `||`. */
export const wrongOperators = (filter?: string): boolean =>
  !!filter && /(^|[^<>!=])=(?!=)|==|<>|!=|&&|\|\|/.test(filter.replace(/'[^']*'/g, "''"))

export const OPERATOR_HINT = 'Use eq/ne/and/or, não = == <> != && ||. Ex.: cr40f_status eq 1 and statecode eq 0.'

/** apply agrupando por lookup falha no OData: o caminho que funciona é o FetchXML aggregate. */
export const applyHint = (table: string, id: string) =>
  `$apply não agrupa por lookup (nem _col_value nem Nav/coluna). Use fetchXml: <fetch aggregate="true"><entity name="${table}"><attribute name="<lookup>" groupby="true" alias="g"/><attribute name="${id}" aggregate="count" alias="total"/><order alias="total" descending="true"/></entity></fetch> (ranking: top no <fetch>). Grupo nulo = linha sem a chave. No OData, groupby só em colunas simples e orderby/top não vão dentro do apply.`
