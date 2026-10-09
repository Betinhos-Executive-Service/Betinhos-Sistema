import type { StatusTone } from '@betinhos/ui'

type Option = { value: number; label: string }
const opts = (pairs: [number, string][]): Option[] => pairs.map(([value, label]) => ({ value, label }))

// Rótulos lidos da metadata de DEV em 08/10/2026. Fixos porque competência é multi-choice,
// que o `metadata.choices` do pacote não cobre, e o catálogo do CTB não muda de opções.
export const GRAVIDADE = opts([[0, 'Leve'], [1, 'Média'], [2, 'Grave'], [3, 'Gravíssima']])
export const COMPETENCIA = opts([[202410000, 'Municipal'], [202410001, 'Rodoviário'], [202410002, 'Estadual']])
export const RESPONSABILIDADE = opts([[0, 'Condutor'], [1, 'Proprietário']])

/** Pontos na CNH por gravidade (CTB, art. 259). */
export const PONTOS_POR_GRAVIDADE: Record<number, number> = { 0: 3, 1: 4, 2: 5, 3: 7 }

const TONE: Record<number, StatusTone> = { 0: 'neutral', 1: 'info', 2: 'warning', 3: 'danger' }
export const gravidadeTone = (value: number | null): StatusTone => (value == null ? 'neutral' : TONE[value] ?? 'neutral')

export function label(options: Option[], value: number | null, fallback = '') {
  if (value == null) return fallback
  return options.find((o) => o.value === value)?.label ?? String(value)
}

export const labels = (options: Option[], values: number[]) => values.map((v) => label(options, v)).join(', ')
