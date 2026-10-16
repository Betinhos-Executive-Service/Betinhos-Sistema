import type { Infracao } from './types'

/** Formato antigo dos filtros: ainda chega por links com `gravidade`, `situacao`… na URL (convertido em `lista.ts`). */
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

/** Sem acento, sem caixa e sem pontuação de código ("574-6" acha "5746"). */
export const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export const byCodigo = (a: Infracao, b: Infracao) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true })
