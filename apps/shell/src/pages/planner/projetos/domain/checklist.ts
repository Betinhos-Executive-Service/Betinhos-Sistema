/** Item do checklist do projeto, guardado em JSON na coluna `cr40f_projeto.cr40f_checklist`. */
export type ChecklistItem = { texto: string; feito: boolean }

export const MAX_ITEM = 300

/** JSON da coluna → itens. Valor vazio ou inválido vira lista vazia; item sem texto é ignorado. */
export function lerChecklist(valor: unknown): ChecklistItem[] {
  if (typeof valor !== 'string' || !valor.trim()) return []
  try {
    const lista: unknown = JSON.parse(valor)
    if (!Array.isArray(lista)) return []
    return lista.flatMap((i) => {
      const texto = typeof i?.texto === 'string' ? i.texto.trim() : ''
      return texto ? [{ texto, feito: i.feito === true }] : []
    })
  } catch { return [] }
}

/** Itens → valor da coluna; lista vazia limpa a coluna (null). */
export const gravarChecklist = (itens: ChecklistItem[]): string | null => (itens.length ? JSON.stringify(itens) : null)

/** `3/5` para o cartão; '' sem itens. */
export const progresso = (itens: ChecklistItem[]) => (itens.length ? `${itens.filter((i) => i.feito).length}/${itens.length}` : '')
