import type { Infracao } from './types'

export type Situacao = 'ativas' | 'inativas' | 'todas'
export type Filters = {
  query: string
  gravidade: number[]
  competencia: number | null
  responsabilidade: number | null
  situacao: Situacao
  comMultas: boolean
}

export const EMPTY_FILTERS: Filters = { query: '', gravidade: [], competencia: null, responsabilidade: null, situacao: 'ativas', comMultas: false }

export const hasFilters = (f: Filters) =>
  Boolean(f.query.trim() || f.gravidade.length || f.competencia != null || f.responsabilidade != null || f.situacao !== 'ativas' || f.comMultas)

/** Sem acento, sem caixa e sem pontuação de código ("574-6" acha "5746"). */
export const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const compact = (text: string) => normalize(text).replace(/[\s.\-/]/g, '')

export const byCodigo = (a: Infracao, b: Infracao) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true })

export function filterInfracoes(list: Infracao[], f: Filters, comUso: Set<string>) {
  const terms = normalize(f.query).split(/\s+/).filter(Boolean)
  return list.filter((i) => {
    if (f.situacao === 'ativas' && !i.ativo) return false
    if (f.situacao === 'inativas' && i.ativo) return false
    if (f.gravidade.length && (i.gravidade == null || !f.gravidade.includes(i.gravidade))) return false
    if (f.competencia != null && !i.competencia.includes(f.competencia)) return false
    if (f.responsabilidade != null && i.responsabilidade !== f.responsabilidade) return false
    if (f.comMultas && !comUso.has(i.id)) return false
    if (!terms.length) return true
    const hay = normalize(`${i.codigo} ${i.descricao} ${i.enquadramento}`)
    const code = compact(i.codigo)
    return terms.every((t) => hay.includes(t) || code.includes(compact(t)))
  })
}
