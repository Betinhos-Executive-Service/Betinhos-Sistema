import type { ChoiceOption } from '@betinhos/dataverse'
import type { StatusTone } from '@betinhos/ui'
import type { Curriculo } from './types'
import { digits, normalize } from './text'

export type StageKey = 'novo' | 'analise' | 'aprovado' | 'contratado' | 'reprovado'
export type Stage = { key: StageKey; value: number; label: string; short: string; tone: StatusTone; confirm: boolean }

// A ordem do funil é fixa; os valores e rótulos vêm da metadata e são casados pelo rótulo sem acento.
const RULES: { key: StageKey; match: RegExp; tone: StatusTone }[] = [
  { key: 'novo', match: /^novo/, tone: 'info' },
  { key: 'analise', match: /analise/, tone: 'warning' },
  { key: 'aprovado', match: /aprovad/, tone: 'success' },
  { key: 'contratado', match: /contratad/, tone: 'success' },
  { key: 'reprovado', match: /reprovad/, tone: 'neutral' },
]

export function buildStages(options: ChoiceOption[]): Stage[] {
  return RULES.flatMap((rule) => {
    const option = options.find((o) => rule.match.test(normalize(o.label)))
    if (!option) return []
    return [{
      key: rule.key,
      value: option.value,
      label: option.label,
      short: rule.key === 'aprovado' ? option.label.replace(/para banco/i, 'p/ banco') : option.label,
      tone: rule.tone,
      confirm: rule.key === 'contratado' || rule.key === 'reprovado',
    }]
  })
}

/** Etapa do currículo; sem status (ou status desconhecido) cai na primeira etapa. */
export const stageFor = (c: Curriculo, stages: Stage[]): Stage | undefined => stages.find((s) => s.value === c.status) ?? stages[0]

/** Colunas na ordem da lista recebida (createdon desc). */
export function groupByStage(list: Curriculo[], stages: Stage[]) {
  const groups = new Map<number, Curriculo[]>(stages.map((s) => [s.value, []]))
  for (const c of list) {
    const stage = stageFor(c, stages)
    if (stage) groups.get(stage.value)!.push(c)
  }
  return groups
}

export const choiceLabel = (options: ChoiceOption[], value: number | null) => (value == null ? '' : options.find((o) => o.value === value)?.label ?? '')

export type Filters = { query: string; cargo: string | null; cnh: number | null; origem: number | null; notaMin: number | null }
export const EMPTY_FILTERS: Filters = { query: '', cargo: null, cnh: null, origem: null, notaMin: null }

export const hasFilters = (f: Filters) => f.query.trim() !== '' || f.cargo != null || f.cnh != null || f.origem != null || f.notaMin != null

/** Sem letras e com 3+ dígitos: procura no telefone e no WhatsApp; senão, cada palavra no nome ou na cidade. */
function matchesQuery(c: Curriculo, query: string) {
  const q = normalize(query)
  if (!q) return true
  if (!/[a-z]/.test(q)) {
    const d = digits(q)
    if (d.length >= 3) return `${digits(c.telefone)} ${digits(c.whatsapp)}`.includes(d)
  }
  const text = normalize(`${c.nome} ${c.cidade}`)
  return q.split(/\s+/).every((token) => text.includes(token))
}

export function filterCurriculos(list: Curriculo[], f: Filters) {
  return list.filter((c) =>
    matchesQuery(c, f.query)
    && (f.cargo == null || normalize(c.cargo) === normalize(f.cargo))
    && (f.cnh == null || c.cnh === f.cnh)
    && (f.origem == null || c.origem === f.origem)
    && (f.notaMin == null || (c.nota != null && c.nota >= f.notaMin)))
}

/** Cargos distintos (ignorando acento e caixa), na primeira grafia encontrada, em ordem alfabética. */
export function cargoOptions(list: Curriculo[]) {
  const seen = new Map<string, string>()
  for (const c of list) {
    const cargo = c.cargo.trim()
    if (cargo && !seen.has(normalize(cargo))) seen.set(normalize(cargo), cargo)
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}
