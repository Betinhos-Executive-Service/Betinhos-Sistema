import { parseLayoutXml, type ViewRows } from './views'

export type OpenColumn = { id: string; valueKey: string; label: string; width: number }

/** Chave do localStorage com o id da última visão aberta. */
export const LAST_VIEW_KEY = 'composicao:ultima-visao'

/** Colunas e consulta da primeira página a partir só da linha da view (fetchxml + layoutxml), sem metadata. */
export function openQueryFromViewRow(row: { fetchxml?: unknown; layoutxml?: unknown }): { fetchXml: string; columns: OpenColumn[] } | null {
  const fetchXml = String(row.fetchxml ?? '').trim()
  if (!fetchXml) return null
  // O valueKey é o nome da célula: coincide com o alias que a própria view usa no FetchXML.
  const columns = parseLayoutXml(String(row.layoutxml ?? '')).map((column) => ({ id: column.id, valueKey: column.id, label: column.id, width: column.width }))
  return { fetchXml, columns }
}

/** Visão padrão escolhida na abertura: última usada, senão a padrão do Dataverse, senão null (consulta padrão). */
export function pickOpenView(rows: ViewRows, lastId: string | null): { id: string; kind: 'personal' | 'public'; row: Record<string, unknown> } | null {
  const all = [
    ...rows.personal.map((row) => ({ id: String(row.userqueryid), kind: 'personal' as const, row })),
    ...rows.publicViews.map((row) => ({ id: String(row.savedqueryid), kind: 'public' as const, row })),
  ]
  return (lastId ? all.find((view) => view.id === lastId) : undefined) ?? all.find((view) => view.kind === 'public' && view.row.isdefault === true) ?? null
}
