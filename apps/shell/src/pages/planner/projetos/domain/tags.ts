/** Tags livres do projeto, guardadas em `cr40f_projeto.cr40f_tags` separadas por vírgula (até 1000 caracteres). */
export const MAX_TAG = 40
export const MAX_TAGS = 20
/** Quantas cores de tag existem (`.pj-tag--0` … `--5`). */
const CORES_TAG = 6

/** Tira vírgula e espaços repetidos; corta em MAX_TAG. */
const normalizarTag = (t: string) => t.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TAG).trim()
const chave = (t: string) => t.toLocaleLowerCase('pt-BR')

/** Acrescenta sem repetir (maiúsculas não contam); tag vazia ou acima do limite é ignorada. */
export function addTag(tags: string[], nova: string): string[] {
  const t = normalizarTag(nova)
  if (!t || tags.length >= MAX_TAGS || tags.some((x) => chave(x) === chave(t))) return tags
  return [...tags, t]
}

export const lerTags = (valor: unknown): string[] =>
  typeof valor === 'string' ? valor.split(',').reduce<string[]>(addTag, []) : []

/** Lista vazia limpa a coluna (null). */
export const gravarTags = (tags: string[]): string | null => (tags.length ? tags.join(', ') : null)

export const mesmasTags = (a: string[], b: string[]) => a.length === b.length && a.every((t, i) => t === b[i])

/** Cor fixa por nome (hash), igual em todo lugar. */
export function corDaTag(tag: string): number {
  let h = 0
  for (const c of chave(tag)) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h % CORES_TAG
}

/** Tags já usadas, das mais usadas para as menos, para sugestão e filtro. */
export function tagsEmUso(listas: string[][]): string[] {
  const contagem = new Map<string, { nome: string; n: number }>()
  for (const t of listas.flat()) {
    const atual = contagem.get(chave(t))
    contagem.set(chave(t), { nome: atual?.nome ?? t, n: (atual?.n ?? 0) + 1 })
  }
  return [...contagem.values()].sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome, 'pt-BR')).map((x) => x.nome)
}
